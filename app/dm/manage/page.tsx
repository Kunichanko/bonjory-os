"use client"

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../../lib/supabase'
import { getEffectivePermissions } from '../../../lib/permissions'

interface DmRequestType {
  id: string
  name: string
  created_at: string
}

interface DmConversation {
  id: string
  member_id: string
  manager_id: string
  request_type_id: string | null
  created_at: string
  updated_at: string
  memberName: string | null
  requestTypeName: string | null
  lastMessage: string | null
  unread: boolean
}

interface DmMessage {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  created_at: string
}

export default function DmManagePage() {
  const router = useRouter()
  const [userId, setUserId]   = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // 要件タイプ管理
  const [requestTypes, setRequestTypes]   = useState<DmRequestType[]>([])
  const [newTypeName, setNewTypeName]     = useState('')
  const [addingType, setAddingType]       = useState(false)
  const [typeError, setTypeError]         = useState<string | null>(null)

  // 会話一覧
  const [conversations, setConversations] = useState<DmConversation[]>([])
  const [selectedConv, setSelectedConv]   = useState<DmConversation | null>(null)

  // メッセージ
  const [messages, setMessages]     = useState<DmMessage[]>([])
  const [msgLoading, setMsgLoading] = useState(false)
  const [msgInput, setMsgInput]     = useState('')
  const [sending, setSending]       = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // ─── 初期ロード ─────────────────────────────────────────

  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser()
        if (authError || !authData?.user) { router.replace('/login'); return }

        const uid = authData.user.id

        // 権限チェック
        const { data: me } = await supabase
          .from('profiles').select('role').eq('id', uid).single()
        if (!me) { router.replace('/login'); return }

        if (me.role !== 'admin') {
          const perms = await getEffectivePermissions(uid)
          if (!perms.dm_management) { router.replace('/dashboard'); return }
        }

        if (mounted) setUserId(uid)

        // 要件タイプ
        const { data: typesData } = await supabase
          .from('dm_request_types')
          .select('id, name, created_at')
          .order('created_at', { ascending: true })

        if (!mounted) return
        setRequestTypes((typesData ?? []) as DmRequestType[])

        await loadConversations(uid, (typesData ?? []) as DmRequestType[])
      } catch {
        router.replace('/login')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    init()
    return () => { mounted = false }
  }, [router])

  async function loadConversations(uid: string, types: DmRequestType[]) {
    const { data: convData } = await supabase
      .from('dm_conversations')
      .select('id, member_id, manager_id, request_type_id, created_at, updated_at')
      .eq('manager_id', uid)
      .order('updated_at', { ascending: false })

    if (!convData) return

    // member プロフィール
    const memberIds = [...new Set(convData.map(c => c.member_id))]
    const { data: profData } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', memberIds.length > 0 ? memberIds : ['00000000-0000-0000-0000-000000000000'])

    const profMap: Record<string, string | null> = {}
    ;(profData ?? []).forEach(p => { profMap[p.id] = p.username })

    // type マップ
    const typeMap: Record<string, string> = {}
    types.forEach(t => { typeMap[t.id] = t.name })

    // 既読情報
    const { data: readsData } = await supabase
      .from('dm_reads')
      .select('conversation_id, last_read_at')
      .eq('user_id', uid)

    const readsMap: Record<string, string> = {}
    ;(readsData ?? []).forEach(r => { readsMap[r.conversation_id] = r.last_read_at })

    // 最終メッセージ・未読
    const convIds = convData.map(c => c.id)
    let lastMsgMap: Record<string, string> = {}
    const unreadConvIds = new Set<string>()

    if (convIds.length > 0) {
      const { data: msgsData } = await supabase
        .from('dm_messages')
        .select('conversation_id, content, created_at, sender_id')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false })

      ;(msgsData ?? []).forEach(m => {
        if (!lastMsgMap[m.conversation_id]) {
          lastMsgMap[m.conversation_id] = m.content
        }
        if (m.sender_id !== uid) {
          const lastRead = readsMap[m.conversation_id]
          if (!lastRead || new Date(m.created_at) > new Date(lastRead)) {
            unreadConvIds.add(m.conversation_id)
          }
        }
      })
    }

    const enriched: DmConversation[] = convData.map(c => ({
      id: c.id,
      member_id: c.member_id,
      manager_id: c.manager_id,
      request_type_id: c.request_type_id,
      created_at: c.created_at,
      updated_at: c.updated_at,
      memberName: profMap[c.member_id] ?? null,
      requestTypeName: c.request_type_id ? (typeMap[c.request_type_id] ?? null) : null,
      lastMessage: lastMsgMap[c.id] ?? null,
      unread: unreadConvIds.has(c.id),
    }))

    setConversations(enriched)
  }

  async function selectConversation(conv: DmConversation) {
    setSelectedConv(conv)
    setMsgLoading(true)
    setMessages([])

    const { data: msgsData } = await supabase
      .from('dm_messages')
      .select('id, conversation_id, sender_id, content, created_at')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true })

    setMessages((msgsData ?? []) as DmMessage[])
    setMsgLoading(false)

    if (userId) {
      await supabase.from('dm_reads').upsert({
        conversation_id: conv.id,
        user_id: userId,
        last_read_at: new Date().toISOString(),
      }, { onConflict: 'conversation_id,user_id' })

      setConversations(prev =>
        prev.map(c => c.id === conv.id ? { ...c, unread: false } : c)
      )
    }
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    if (!msgInput.trim() || !selectedConv || !userId) return
    setSending(true)
    const content = msgInput.trim()
    setMsgInput('')

    const { data: newMsg, error } = await supabase
      .from('dm_messages')
      .insert({ conversation_id: selectedConv.id, sender_id: userId, content })
      .select('id, conversation_id, sender_id, content, created_at')
      .single()

    if (!error && newMsg) {
      setMessages(prev => [...prev, newMsg as DmMessage])
      setConversations(prev =>
        prev.map(c => c.id === selectedConv.id ? { ...c, lastMessage: content, updated_at: new Date().toISOString() } : c)
      )
    }
    setSending(false)
  }

  // 要件タイプ追加
  async function addRequestType() {
    const name = newTypeName.trim()
    if (!name) return
    setAddingType(true)
    setTypeError(null)

    const { data, error } = await supabase
      .from('dm_request_types')
      .insert({ name })
      .select('id, name, created_at')
      .single()

    if (error) {
      setTypeError('追加に失敗しました: ' + error.message)
    } else if (data) {
      setRequestTypes(prev => [...prev, data as DmRequestType])
      setNewTypeName('')
    }
    setAddingType(false)
  }

  // 要件タイプ削除
  async function deleteRequestType(id: string) {
    const { error } = await supabase.from('dm_request_types').delete().eq('id', id)
    if (!error) {
      setRequestTypes(prev => prev.filter(t => t.id !== id))
      // 削除されたタイプを使っている会話の表示を更新
      setConversations(prev =>
        prev.map(c => c.request_type_id === id ? { ...c, request_type_id: null, requestTypeName: null } : c)
      )
    }
  }

  // ─── ローディング ─────────────────────────────────────

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'white', fontSize: 24, fontWeight: 'bold' }}>Loading...</p>
      </div>
    )
  }

  const unreadTotal = conversations.filter(c => c.unread).length

  // 要件ラベルの色マップ（順番に色を割り当て）
  const TYPE_COLORS = ['#6aac14', '#e67e22', '#3498db', '#9b59b6', '#e74c3c', '#1abc9c']

  return (
    <div style={{ minHeight: '100vh', padding: '32px 24px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* ヘッダー */}
        <div className="game-card" style={{ padding: '20px 28px', marginBottom: 20 }}>
          <h1 className="game-title" style={{ fontSize: 28 }}>
            📬 DM受信
            {unreadTotal > 0 && (
              <span style={{
                marginLeft: 12, background: 'red', color: 'white',
                borderRadius: 10, padding: '2px 12px', fontSize: 16, fontWeight: 'bold',
              }}>
                {unreadTotal}件未読
              </span>
            )}
          </h1>
          <p style={{ color: '#3d6e00', marginTop: 4, fontSize: 13 }}>部員からのDMに対応します</p>
        </div>

        {/* 要件タイプ管理 */}
        <div className="game-card" style={{ padding: '20px 28px', marginBottom: 20 }}>
          <p className="game-label" style={{ marginBottom: 12 }}>要件タイプ管理</p>
          {typeError && <p className="game-error" style={{ marginBottom: 10 }}>{typeError}</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {requestTypes.length === 0 && (
              <span style={{ color: '#aaa', fontSize: 13 }}>タイプがありません</span>
            )}
            {requestTypes.map((t, i) => (
              <span key={t.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: TYPE_COLORS[i % TYPE_COLORS.length], color: 'white',
                borderRadius: 6, padding: '4px 10px', fontSize: 13, fontWeight: 'bold',
              }}>
                {t.name}
                <button
                  onClick={() => deleteRequestType(t.id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'white', fontSize: 14, lineHeight: 1, padding: 0,
                    opacity: 0.8,
                  }}
                  title="削除"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              className="game-input"
              type="text"
              placeholder="新しい要件タイプ名（例: フィードバック）"
              value={newTypeName}
              onChange={e => setNewTypeName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addRequestType() }}
              style={{ flex: 1, maxWidth: 320 }}
              disabled={addingType}
            />
            <button
              className="game-button"
              style={{ width: 'auto', padding: '8px 20px', fontSize: 14 }}
              onClick={addRequestType}
              disabled={addingType || !newTypeName.trim()}
            >
              {addingType ? '追加中…' : '追加'}
            </button>
          </div>
        </div>

        {/* 会話一覧 + メッセージ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* 会話一覧 */}
          <div className="game-card" style={{ padding: '16px' }}>
            <p className="game-label" style={{ marginBottom: 10 }}>受信DM一覧</p>
            {conversations.length === 0 ? (
              <p style={{ color: '#aaa', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                まだDMがありません
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {conversations.map((conv, i) => {
                  const typeIdx = requestTypes.findIndex(t => t.id === conv.request_type_id)
                  const typeColor = typeIdx >= 0 ? TYPE_COLORS[typeIdx % TYPE_COLORS.length] : '#aaa'
                  return (
                    <button
                      key={conv.id}
                      onClick={() => selectConversation(conv)}
                      style={{
                        width: '100%', textAlign: 'left', padding: '10px 12px',
                        background: selectedConv?.id === conv.id ? '#3d6e00' : conv.unread ? '#fff8e0' : '#f8fff0',
                        border: selectedConv?.id === conv.id
                          ? '2px solid #6aac14'
                          : conv.unread ? '2px solid #f0a000' : '2px solid #c8e89a',
                        borderRadius: 8, cursor: 'pointer',
                        transition: 'background 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{
                          fontWeight: 'bold', fontSize: 13,
                          color: selectedConv?.id === conv.id ? '#fff' : '#2d5500',
                        }}>
                          {conv.memberName ?? '名無し'}
                        </span>
                        {conv.unread && (
                          <span style={{
                            background: 'red', color: 'white', borderRadius: '50%',
                            width: 8, height: 8, display: 'inline-block', flexShrink: 0,
                          }} />
                        )}
                      </div>
                      {conv.requestTypeName ? (
                        <span style={{
                          display: 'inline-block', fontSize: 10, fontWeight: 'bold',
                          background: typeColor, color: 'white',
                          borderRadius: 4, padding: '1px 6px', marginBottom: 2,
                        }}>
                          {conv.requestTypeName}
                        </span>
                      ) : (
                        <span style={{
                          display: 'inline-block', fontSize: 10,
                          background: '#ddd', color: '#777',
                          borderRadius: 4, padding: '1px 6px', marginBottom: 2,
                        }}>
                          なし
                        </span>
                      )}
                      {conv.lastMessage && (
                        <p style={{
                          fontSize: 11, color: selectedConv?.id === conv.id ? '#c8f090' : '#666',
                          margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {conv.lastMessage}
                        </p>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* メッセージスレッド */}
          <div className="game-card" style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', minHeight: 400 }}>
            {!selectedConv ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p style={{ color: '#aaa', fontSize: 14 }}>会話を選択してください</p>
              </div>
            ) : (
              <>
                {/* スレッドヘッダー */}
                <div style={{ paddingBottom: 12, borderBottom: '2px solid #c8e89a', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 'bold', color: '#2d5500', fontSize: 15 }}>
                      {selectedConv.memberName ?? '名無し'}
                    </span>
                    {selectedConv.requestTypeName ? (
                      <span style={{
                        fontSize: 11, fontWeight: 'bold',
                        background: TYPE_COLORS[requestTypes.findIndex(t => t.id === selectedConv.request_type_id) % TYPE_COLORS.length] ?? '#aaa',
                        color: 'white',
                        borderRadius: 4, padding: '2px 8px',
                      }}>
                        {selectedConv.requestTypeName}
                      </span>
                    ) : (
                      <span style={{
                        fontSize: 11,
                        background: '#ddd', color: '#777',
                        borderRadius: 4, padding: '2px 8px',
                      }}>
                        なし
                      </span>
                    )}
                  </div>
                  <p style={{ color: '#888', fontSize: 11, marginTop: 2 }}>
                    作成: {new Date(selectedConv.created_at).toLocaleDateString('ja-JP')}
                  </p>
                </div>

                {/* メッセージ一覧 */}
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, maxHeight: 380 }}>
                  {msgLoading ? (
                    <p style={{ color: '#aaa', textAlign: 'center', marginTop: 40 }}>読み込み中…</p>
                  ) : messages.length === 0 ? (
                    <p style={{ color: '#aaa', textAlign: 'center', marginTop: 40, fontSize: 13 }}>
                      まだメッセージがありません
                    </p>
                  ) : (
                    messages.map(msg => {
                      const isMe = msg.sender_id === userId
                      return (
                        <div key={msg.id} style={{
                          display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start',
                        }}>
                          <div style={{
                            maxWidth: '75%', padding: '8px 12px',
                            background: isMe ? '#3d6e00' : '#f0f8e8',
                            color: isMe ? '#fff' : '#2d5500',
                            borderRadius: isMe ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                            fontSize: 14, lineHeight: 1.5,
                          }}>
                            <p style={{ margin: 0 }}>{msg.content}</p>
                            <p style={{ margin: 0, fontSize: 10, opacity: 0.7, marginTop: 2, textAlign: isMe ? 'right' : 'left' }}>
                              {new Date(msg.created_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      )
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* 入力エリア */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <textarea
                    className="game-input"
                    rows={2}
                    placeholder="メッセージを入力…"
                    value={msgInput}
                    onChange={e => setMsgInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        sendMessage()
                      }
                    }}
                    style={{ flex: 1, resize: 'none', fontSize: 14 }}
                    disabled={sending}
                  />
                  <button
                    className="game-button"
                    style={{ width: 'auto', padding: '0 20px', fontSize: 20 }}
                    onClick={sendMessage}
                    disabled={sending || !msgInput.trim()}
                  >
                    ➤
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

      </div>

      <a href="/dashboard" style={{ textDecoration: 'none' }}>
        <button style={{
          position: 'fixed', top: 20, left: 16, zIndex: 50,
          background: '#1a3a00', border: '3px solid #6aac14', borderRadius: 12,
          color: '#a8d870', fontSize: 13, fontWeight: 'bold',
          padding: '10px 18px', cursor: 'pointer',
          boxShadow: '0 4px 0 #0d2000',
        }}>
          ← ダッシュボード
        </button>
      </a>
    </div>
  )
}

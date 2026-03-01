"use client"

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../lib/supabase'

interface DmRequestType {
  id: string
  name: string
}

interface DmConversation {
  id: string
  member_id: string
  manager_id: string
  request_type_id: string | null
  created_at: string
  updated_at: string
  managerName: string | null
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

interface ManagerProfile {
  id: string
  username: string | null
}

export default function DmPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading]   = useState(true)

  // 会話一覧
  const [conversations, setConversations] = useState<DmConversation[]>([])
  const [selectedConv, setSelectedConv]   = useState<DmConversation | null>(null)

  // メッセージ
  const [messages, setMessages]       = useState<DmMessage[]>([])
  const [msgLoading, setMsgLoading]   = useState(false)
  const [msgInput, setMsgInput]       = useState('')
  const [sending, setSending]         = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 新規DM作成
  const [managers, setManagers]           = useState<ManagerProfile[]>([])
  const [requestTypes, setRequestTypes]   = useState<DmRequestType[]>([])
  const [newManagerId, setNewManagerId]   = useState('')
  const [newTypeId, setNewTypeId]         = useState('')
  const [creating, setCreating]           = useState(false)
  const [createError, setCreateError]     = useState<string | null>(null)

  // ─── 初期ロード ─────────────────────────────────────────

  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser()
        if (authError || !authData?.user) { router.replace('/login'); return }

        const uid = authData.user.id
        if (mounted) setUserId(uid)

        // DM管理者一覧（dm_management権限を持つプロフィール）
        const { data: ppData } = await supabase
          .from('profile_positions')
          .select('profile_id, positions(permissions)')

        const managerIds = new Set<string>()
        ;(ppData ?? []).forEach(pp => {
          const perms = (pp as { profile_id: string; positions: { permissions: Record<string, boolean> } | null })
            .positions?.permissions ?? {}
          if (perms['dm_management']) managerIds.add(pp.profile_id)
        })

        let managerList: ManagerProfile[] = []
        if (managerIds.size > 0) {
          const { data: profData } = await supabase
            .from('profiles')
            .select('id, username')
            .in('id', [...managerIds])
          managerList = (profData ?? []) as ManagerProfile[]
        }

        // 要件タイプ
        const { data: typesData } = await supabase
          .from('dm_request_types')
          .select('id, name')
          .order('created_at', { ascending: true })

        if (!mounted) return
        setManagers(managerList)
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
      .eq('member_id', uid)
      .order('updated_at', { ascending: false })

    if (!convData) return

    // manager プロフィール取得
    const managerIdsList = [...new Set(convData.map(c => c.manager_id))]
    const { data: profData } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', managerIdsList.length > 0 ? managerIdsList : ['00000000-0000-0000-0000-000000000000'])

    const profMap: Record<string, string | null> = {}
    ;(profData ?? []).forEach(p => { profMap[p.id] = p.username })

    // typeマップ
    const typeMap: Record<string, string> = {}
    types.forEach(t => { typeMap[t.id] = t.name })

    // 各会話の最終メッセージ＆未読
    const { data: readsData } = await supabase
      .from('dm_reads')
      .select('conversation_id, last_read_at')
      .eq('user_id', uid)

    const readsMap: Record<string, string> = {}
    ;(readsData ?? []).forEach(r => { readsMap[r.conversation_id] = r.last_read_at })

    // 最終メッセージ
    const convIds = convData.map(c => c.id)
    let lastMsgMap: Record<string, string> = {}
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
      })

      // 未読判定：自分以外からのメッセージが last_read_at より新しいものがあるか
      const unreadConvIds = new Set<string>()
      ;(msgsData ?? []).forEach(m => {
        if (m.sender_id === uid) return
        const lastRead = readsMap[m.conversation_id]
        if (!lastRead || new Date(m.created_at) > new Date(lastRead)) {
          unreadConvIds.add(m.conversation_id)
        }
      })

      const enriched: DmConversation[] = convData.map(c => ({
        id: c.id,
        member_id: c.member_id,
        manager_id: c.manager_id,
        request_type_id: c.request_type_id,
        created_at: c.created_at,
        updated_at: c.updated_at,
        managerName: profMap[c.manager_id] ?? null,
        requestTypeName: c.request_type_id ? (typeMap[c.request_type_id] ?? null) : null,
        lastMessage: lastMsgMap[c.id] ?? null,
        unread: unreadConvIds.has(c.id),
      }))

      setConversations(enriched)
    } else {
      setConversations([])
    }
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

    // 既読マーク
    if (userId) {
      await supabase.from('dm_reads').upsert({
        conversation_id: conv.id,
        user_id: userId,
        last_read_at: new Date().toISOString(),
      }, { onConflict: 'conversation_id,user_id' })

      // 未読フラグを解除
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

  async function createConversation() {
    if (!newManagerId || !userId) return
    setCreating(true)
    setCreateError(null)

    const { data, error } = await supabase
      .from('dm_conversations')
      .insert({
        member_id: userId,
        manager_id: newManagerId,
        request_type_id: newTypeId || null,
      })
      .select('id, member_id, manager_id, request_type_id, created_at, updated_at')
      .single()

    if (error) {
      setCreateError('DMの作成に失敗しました: ' + error.message)
    } else if (data) {
      const mgr = managers.find(m => m.id === data.manager_id)
      const rt  = requestTypes.find(t => t.id === data.request_type_id)
      const newConv: DmConversation = {
        ...data,
        managerName: mgr?.username ?? null,
        requestTypeName: rt?.name ?? null,
        lastMessage: null,
        unread: false,
      }
      setConversations(prev => [newConv, ...prev])
      setNewManagerId('')
      setNewTypeId('')
      await selectConversation(newConv)
    }
    setCreating(false)
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

  return (
    <div style={{ minHeight: '100vh', padding: '32px 24px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>

        {/* ヘッダー */}
        <div className="game-card" style={{ padding: '20px 28px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 className="game-title" style={{ fontSize: 28 }}>💬 DM送信</h1>
              <p style={{ color: '#3d6e00', marginTop: 4, fontSize: 13 }}>
                DM管理者に連絡できます
                {unreadTotal > 0 && (
                  <span style={{
                    marginLeft: 8, background: 'red', color: 'white',
                    borderRadius: 10, padding: '1px 8px', fontSize: 12, fontWeight: 'bold',
                  }}>
                    {unreadTotal}件未読
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* 新規DM作成 */}
        <div className="game-card" style={{ padding: '20px 28px', marginBottom: 20 }}>
          <p className="game-label" style={{ marginBottom: 12 }}>新規DMを作成</p>
          {createError && <p className="game-error" style={{ marginBottom: 10 }}>{createError}</p>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <p style={{ color: '#3d6e00', fontSize: 12, marginBottom: 4, fontWeight: 'bold' }}>送信先 *</p>
              <select
                className="game-input"
                value={newManagerId}
                onChange={e => setNewManagerId(e.target.value)}
                style={{ width: '100%' }}
                disabled={creating}
              >
                <option value="">-- 選択してください --</option>
                {managers.map(m => (
                  <option key={m.id} value={m.id}>{m.username ?? '名無し'}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <p style={{ color: '#3d6e00', fontSize: 12, marginBottom: 4, fontWeight: 'bold' }}>要件（任意）</p>
              <select
                className="game-input"
                value={newTypeId}
                onChange={e => setNewTypeId(e.target.value)}
                style={{ width: '100%' }}
                disabled={creating}
              >
                <option value="">なし</option>
                {requestTypes.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <button
              className="game-button"
              style={{ width: 'auto', padding: '10px 24px', fontSize: 15 }}
              onClick={createConversation}
              disabled={creating || !newManagerId}
            >
              {creating ? '作成中…' : '作成'}
            </button>
          </div>
          {managers.length === 0 && (
            <p style={{ color: '#888', fontSize: 12, marginTop: 8 }}>
              ※ 現在DM管理者がいません。
            </p>
          )}
        </div>

        {/* 会話一覧 + メッセージ */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

          {/* 会話一覧 */}
          <div className="game-card" style={{ padding: '16px', width: 260, flexShrink: 0 }}>
            <p className="game-label" style={{ marginBottom: 10 }}>会話一覧</p>
            {conversations.length === 0 ? (
              <p style={{ color: '#aaa', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                まだDMがありません
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {conversations.map(conv => (
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                      <span style={{
                        fontWeight: 'bold', fontSize: 13,
                        color: selectedConv?.id === conv.id ? '#fff' : '#2d5500',
                      }}>
                        {conv.managerName ?? '名無し'}
                      </span>
                      {conv.unread && (
                        <span style={{
                          background: 'red', color: 'white', borderRadius: '50%',
                          width: 8, height: 8, display: 'inline-block', flexShrink: 0,
                        }} />
                      )}
                    </div>
                    {conv.requestTypeName && (
                      <span style={{
                        display: 'inline-block', fontSize: 10, fontWeight: 'bold',
                        background: '#6aac14', color: 'white',
                        borderRadius: 4, padding: '1px 6px', marginBottom: 2,
                      }}>
                        {conv.requestTypeName}
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
                ))}
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
                      {selectedConv.managerName ?? '名無し'}
                    </span>
                    {selectedConv.requestTypeName && (
                      <span style={{
                        fontSize: 11, fontWeight: 'bold',
                        background: '#6aac14', color: 'white',
                        borderRadius: 4, padding: '2px 8px',
                      }}>
                        {selectedConv.requestTypeName}
                      </span>
                    )}
                  </div>
                </div>

                {/* メッセージ一覧 */}
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, maxHeight: 380 }}>
                  {msgLoading ? (
                    <p style={{ color: '#aaa', textAlign: 'center', marginTop: 40 }}>読み込み中…</p>
                  ) : messages.length === 0 ? (
                    <p style={{ color: '#aaa', textAlign: 'center', marginTop: 40, fontSize: 13 }}>
                      まだメッセージがありません。最初のメッセージを送りましょう！
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

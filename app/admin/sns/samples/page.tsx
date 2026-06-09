'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase'
import { getEffectivePermissions } from '@/lib/permissions'
import { Trash2, Plus } from 'lucide-react'

interface SampleTweet {
  id: string
  content: string
  use_for_ai: boolean
  created_at: string
}

interface Profile {
  id: string
  username: string | null
  email: string | null
}

export default function SnsSamplesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [samples, setSamples] = useState<SampleTweet[]>([])
  const [newContent, setNewContent] = useState('')
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const [allProfiles, setAllProfiles] = useState<Profile[]>([])
  const [recipientIds, setRecipientIds] = useState<string[]>([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [addingRecipient, setAddingRecipient] = useState(false)
  const [removingRecipientId, setRemovingRecipientId] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      const isAdmin = profile?.role === 'admin'
      if (!isAdmin) {
        const perms = await getEffectivePermissions(user.id)
        if (!perms.sns_management) { router.push('/dashboard'); return }
      }

      const [samplesRes, profilesRes, recipientsRes] = await Promise.all([
        supabase.from('sns_sample_tweets').select('id, content, use_for_ai, created_at').order('created_at'),
        supabase.from('profiles').select('id, username, email').order('username'),
        supabase.from('sns_notification_recipients').select('user_id'),
      ])

      setSamples((samplesRes.data ?? []) as SampleTweet[])
      setAllProfiles((profilesRes.data ?? []) as Profile[])
      setRecipientIds((recipientsRes.data ?? []).map((r: { user_id: string }) => r.user_id))
      setLoading(false)
    }
    init()
  }, [router])

  async function handleAdd() {
    if (!newContent.trim()) return
    setAdding(true)
    const { data, error } = await supabase
      .from('sns_sample_tweets')
      .insert({ content: newContent.trim(), use_for_ai: true })
      .select('*')
      .single()
    if (error || !data) { alert('追加に失敗しました: ' + error?.message); setAdding(false); return }
    setSamples(prev => [...prev, data as SampleTweet])
    setNewContent('')
    setAdding(false)
  }

  async function handleToggle(sample: SampleTweet) {
    setTogglingId(sample.id)
    const { error } = await supabase
      .from('sns_sample_tweets')
      .update({ use_for_ai: !sample.use_for_ai })
      .eq('id', sample.id)
    if (error) { alert('更新に失敗しました: ' + error.message); setTogglingId(null); return }
    setSamples(prev => prev.map(s => s.id === sample.id ? { ...s, use_for_ai: !s.use_for_ai } : s))
    setTogglingId(null)
  }

  async function handleDelete(id: string) {
    if (!confirm('このサンプルを削除しますか？')) return
    setDeletingId(id)
    const { error } = await supabase.from('sns_sample_tweets').delete().eq('id', id)
    if (error) { alert('削除に失敗しました: ' + error.message); setDeletingId(null); return }
    setSamples(prev => prev.filter(s => s.id !== id))
    setDeletingId(null)
  }

  async function handleAddRecipient() {
    if (!selectedUserId) return
    setAddingRecipient(true)
    const { error } = await supabase
      .from('sns_notification_recipients')
      .insert({ user_id: selectedUserId })
    if (error) { alert('追加に失敗しました: ' + error.message); setAddingRecipient(false); return }
    setRecipientIds(prev => [...prev, selectedUserId])
    setSelectedUserId('')
    setAddingRecipient(false)
  }

  async function handleRemoveRecipient(userId: string) {
    setRemovingRecipientId(userId)
    const { error } = await supabase
      .from('sns_notification_recipients')
      .delete()
      .eq('user_id', userId)
    if (error) { alert('削除に失敗しました: ' + error.message); setRemovingRecipientId(null); return }
    setRecipientIds(prev => prev.filter(id => id !== userId))
    setRemovingRecipientId(null)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#3d6e00', fontWeight: 'bold' }}>読み込み中...</p>
    </div>
  )

  const enabledCount = samples.filter(s => s.use_for_ai).length
  const recipientProfiles = allProfiles.filter(p => recipientIds.includes(p.id))
  const addableProfiles = allProfiles.filter(p => !recipientIds.includes(p.id))

  return (
    <div style={{ minHeight: '100vh', padding: '80px 16px 60px' }}>
      {/* 戻るボタン */}
      <a href="/admin/sns" style={{ textDecoration: 'none' }}>
        <button style={{
          position: 'fixed', top: 20, left: 16, zIndex: 50,
          background: '#1a3a00', border: '3px solid #6aac14', borderRadius: 12,
          color: '#a8d870', fontSize: 13, fontWeight: 'bold',
          padding: '10px 18px', cursor: 'pointer',
          boxShadow: '0 4px 0 #0d2000',
        }}>
          ← SNS管理
        </button>
      </a>

      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <h1 className="game-title" style={{ textAlign: 'center', marginBottom: 32 }}>
          サンプル記録
        </h1>

        {/* 新規追加 */}
        <div style={{
          background: 'white', border: '3px solid #3d6e00', borderRadius: 16,
          padding: 24, marginBottom: 24,
          boxShadow: '0 4px 0 #1a3a00',
        }}>
          <h2 style={{ fontSize: 17, fontWeight: 'bold', color: '#1a3a00', marginBottom: 16 }}>
            サンプルを追加
          </h2>
          <textarea
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            placeholder="サンプルツイートを入力..."
            rows={5}
            style={{
              width: '100%', boxSizing: 'border-box',
              border: '2px solid #3d6e00', borderRadius: 10,
              padding: '12px 14px', fontSize: 15, lineHeight: 1.6,
              resize: 'vertical', outline: 'none',
              fontFamily: 'inherit', marginBottom: 12,
            }}
          />
          <div style={{ textAlign: 'center' }}>
            <button
              onClick={handleAdd}
              disabled={adding || !newContent.trim()}
              style={{
                background: adding || !newContent.trim() ? '#aaa' : '#3d6e00',
                border: 'none', borderRadius: 12, color: 'white',
                fontSize: 15, fontWeight: 'bold', padding: '12px 40px',
                cursor: adding || !newContent.trim() ? 'not-allowed' : 'pointer',
                boxShadow: adding || !newContent.trim() ? 'none' : '0 4px 0 #1a3a00',
                display: 'inline-flex', alignItems: 'center', gap: 8,
              }}
            >
              <Plus size={16} />
              {adding ? '追加中...' : '追加'}
            </button>
          </div>
        </div>

        {/* サンプルリスト */}
        <div style={{
          background: 'white', border: '3px solid #3d6e00', borderRadius: 16,
          padding: 24, marginBottom: 24,
          boxShadow: '0 4px 0 #1a3a00',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <h2 style={{ fontSize: 17, fontWeight: 'bold', color: '#1a3a00', margin: 0 }}>
              サンプル一覧
            </h2>
            <span style={{ fontSize: 13, color: '#666' }}>
              AI使用: {enabledCount} / {samples.length}件
            </span>
          </div>
          <p style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
            「AI ON」のサンプルのみGeminiの文体参考として使われます
          </p>

          {samples.length === 0 ? (
            <p style={{ color: '#999', fontSize: 14, textAlign: 'center', padding: '12px 0' }}>
              サンプルはありません
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {samples.map(sample => (
                <div key={sample.id} style={{
                  border: `2px solid ${sample.use_for_ai ? '#6aac14' : '#e0e0e0'}`,
                  borderRadius: 10, padding: '12px 14px',
                  background: sample.use_for_ai ? '#f6fff0' : '#fafafa',
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  transition: 'border-color 0.2s, background 0.2s',
                }}>
                  <div style={{ flex: 1, fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#1a1a1a' }}>
                    {sample.content}
                  </div>

                  <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                    <button
                      onClick={() => handleToggle(sample)}
                      disabled={togglingId === sample.id}
                      style={{
                        border: 'none', borderRadius: 20,
                        padding: '4px 14px', fontSize: 12, fontWeight: 'bold',
                        cursor: togglingId === sample.id ? 'not-allowed' : 'pointer',
                        background: sample.use_for_ai ? '#3d6e00' : '#bbb',
                        color: 'white',
                        transition: 'background 0.2s',
                        whiteSpace: 'nowrap',
                        boxShadow: sample.use_for_ai ? '0 2px 0 #1a3a00' : '0 2px 0 #999',
                      }}
                    >
                      AI {sample.use_for_ai ? 'ON' : 'OFF'}
                    </button>

                    <button
                      onClick={() => handleDelete(sample.id)}
                      disabled={deletingId === sample.id}
                      title="削除"
                      style={{
                        background: 'none', border: 'none',
                        cursor: deletingId === sample.id ? 'not-allowed' : 'pointer',
                        color: '#ccc', padding: 4,
                        display: 'flex', alignItems: 'center',
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 予約投稿通知を受け取る部員 */}
        <div style={{
          background: 'white', border: '3px solid #3d6e00', borderRadius: 16,
          padding: 24,
          boxShadow: '0 4px 0 #1a3a00',
        }}>
          <h2 style={{ fontSize: 17, fontWeight: 'bold', color: '#1a3a00', marginBottom: 4 }}>
            通知を送る部員
          </h2>
          <p style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
            投稿予定日の17:00にプッシュ通知が届きます。タップするとテキストが自動コピーされます。
          </p>

          {/* 現在の受信者リスト */}
          {recipientProfiles.length === 0 ? (
            <p style={{ color: '#999', fontSize: 14, textAlign: 'center', padding: '8px 0', marginBottom: 16 }}>
              通知を受け取る部員が設定されていません
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {recipientProfiles.map(p => (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  border: '2px solid #6aac14', borderRadius: 8,
                  padding: '8px 12px', background: '#f6fff0',
                }}>
                  <span style={{ fontSize: 14, color: '#1a3a00', fontWeight: 'bold' }}>
                    {p.username ?? p.email ?? p.id}
                  </span>
                  <button
                    onClick={() => handleRemoveRecipient(p.id)}
                    disabled={removingRecipientId === p.id}
                    title="削除"
                    style={{
                      background: 'none', border: 'none',
                      cursor: removingRecipientId === p.id ? 'not-allowed' : 'pointer',
                      color: '#ccc', padding: 4,
                      display: 'flex', alignItems: 'center',
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 部員を追加 */}
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={selectedUserId}
              onChange={e => setSelectedUserId(e.target.value)}
              style={{
                flex: 1, border: '2px solid #3d6e00', borderRadius: 8,
                padding: '8px 10px', fontSize: 14, color: '#333',
                background: 'white', outline: 'none',
              }}
            >
              <option value="">通知を送る部員を追加...</option>
              {addableProfiles.map(p => (
                <option key={p.id} value={p.id}>
                  {p.username ?? p.email ?? p.id}
                </option>
              ))}
            </select>
            <button
              onClick={handleAddRecipient}
              disabled={addingRecipient || !selectedUserId}
              style={{
                background: addingRecipient || !selectedUserId ? '#aaa' : '#3d6e00',
                border: 'none', borderRadius: 8, color: 'white',
                fontSize: 14, fontWeight: 'bold', padding: '8px 20px',
                cursor: addingRecipient || !selectedUserId ? 'not-allowed' : 'pointer',
                boxShadow: addingRecipient || !selectedUserId ? 'none' : '0 3px 0 #1a3a00',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                whiteSpace: 'nowrap',
              }}
            >
              <Plus size={14} />
              {addingRecipient ? '追加中...' : '追加'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

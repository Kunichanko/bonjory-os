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

export default function SnsSamplesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [samples, setSamples] = useState<SampleTweet[]>([])
  const [newContent, setNewContent] = useState('')
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

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

      const { data } = await supabase
        .from('sns_sample_tweets')
        .select('id, content, use_for_ai, created_at')
        .order('created_at')

      setSamples((data ?? []) as SampleTweet[])
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

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#3d6e00', fontWeight: 'bold' }}>読み込み中...</p>
    </div>
  )

  const enabledCount = samples.filter(s => s.use_for_ai).length

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
          padding: 24,
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
      </div>
    </div>
  )
}

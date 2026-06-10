'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase'
import { getEffectivePermissions } from '@/lib/permissions'
import { XIcon as Twitter, Wand2, Save, ChevronDown, ChevronUp, Check, Trash2, List, Zap } from 'lucide-react'

interface SnsPost {
  id: string
  content: string
  status: 'pending' | 'posted'
  posted_at: string | null
  scheduled_date: string | null
  notified_at: string | null
  created_at: string
}

export default function SnsManagePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  const [samples, setSamples] = useState<{ id: string; content: string; use_for_ai: boolean }[]>([])
  const [posts, setPosts] = useState<SnsPost[]>([])

  const [inputText, setInputText] = useState('')
  const [generatedText, setGeneratedText] = useState('')
  const [converting, setConverting] = useState(false)
  const [convertError, setConvertError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [showPosted, setShowPosted] = useState(false)
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [schedulingId, setSchedulingId] = useState<string | null>(null)
  const [sendingNowId, setSendingNowId] = useState<string | null>(null)
  const [sendNowResult, setSendNowResult] = useState<string | null>(null)

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

      const [samplesRes, postsRes] = await Promise.all([
        supabase.from('sns_sample_tweets').select('id, content, use_for_ai').order('created_at'),
        supabase.from('sns_posts').select('*').order('created_at', { ascending: false }),
      ])

      setSamples((samplesRes.data ?? []) as { id: string; content: string; use_for_ai: boolean }[])
      setPosts((postsRes.data ?? []) as SnsPost[])
      setLoading(false)
    }
    init()
  }, [router])

  async function handleConvert() {
    if (!inputText.trim()) return
    setConverting(true)
    setConvertError(null)
    setGeneratedText('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/generate-sns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ input: inputText, samples: samples.filter(s => s.use_for_ai).map(s => s.content) }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '変換に失敗しました')
      setGeneratedText(json.text)
    } catch (e: unknown) {
      setConvertError((e as Error).message)
    } finally {
      setConverting(false)
    }
  }

  async function handleSave() {
    if (!generatedText.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('sns_posts')
      .insert({ content: generatedText.trim(), status: 'pending', created_by: user?.id ?? null })
      .select('*')
      .single()
    if (error || !data) { alert('保存に失敗しました: ' + error?.message); setSaving(false); return }
    setPosts(prev => [data as SnsPost, ...prev])
    setGeneratedText('')
    setInputText('')
    setSaving(false)
  }

  async function handleMarkPosted(post: SnsPost) {
    setMarkingId(post.id)
    const { error } = await supabase
      .from('sns_posts')
      .update({ status: 'posted', posted_at: new Date().toISOString() })
      .eq('id', post.id)
    if (error) { alert('更新に失敗しました: ' + error.message); setMarkingId(null); return }
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: 'posted', posted_at: new Date().toISOString() } : p))
    setMarkingId(null)
  }

  async function handleSetSchedule(postId: string, date: string | null) {
    setSchedulingId(postId)
    const { error } = await supabase
      .from('sns_posts')
      .update({ scheduled_date: date, notified_at: null })
      .eq('id', postId)
    if (error) { alert('日付の更新に失敗しました: ' + error.message); setSchedulingId(null); return }
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, scheduled_date: date, notified_at: null } : p))
    setSchedulingId(null)
  }

  async function handleMarkPending(post: SnsPost) {
    setMarkingId(post.id)
    const { error } = await supabase
      .from('sns_posts')
      .update({ status: 'pending', posted_at: null })
      .eq('id', post.id)
    if (error) { alert('更新に失敗しました: ' + error.message); setMarkingId(null); return }
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: 'pending', posted_at: null } : p))
    setMarkingId(null)
  }

  async function handleDelete(postId: string) {
    if (!confirm('この投稿を削除しますか？')) return
    setDeletingId(postId)
    const { error } = await supabase.from('sns_posts').delete().eq('id', postId)
    if (error) { alert('削除に失敗しました: ' + error.message); setDeletingId(null); return }
    setPosts(prev => prev.filter(p => p.id !== postId))
    setDeletingId(null)
  }

  async function handleSendNow(postId: string) {
    setSendingNowId(postId)
    setSendNowResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/sns/send-now', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ postId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '送信に失敗しました')
      setSendNowResult(`送信完了（${json.sent}/${json.total}件）`)
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, notified_at: new Date().toISOString() } : p))
      setTimeout(() => setSendNowResult(null), 3000)
    } catch (e: unknown) {
      setSendNowResult((e as Error).message)
      setTimeout(() => setSendNowResult(null), 4000)
    } finally {
      setSendingNowId(null)
    }
  }

  const pendingPosts = posts.filter(p => p.status === 'pending')
  const postedPosts  = posts.filter(p => p.status === 'posted')

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#3d6e00', fontWeight: 'bold' }}>読み込み中...</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', padding: '80px 16px 60px' }}>
      {/* 戻るボタン */}
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

      {/* サンプル記録ボタン */}
      <a href="/admin/sns/samples" style={{ textDecoration: 'none' }}>
        <button style={{
          position: 'fixed', top: 20, right: 16, zIndex: 50,
          background: '#1a3a00', border: '3px solid #6aac14', borderRadius: 12,
          color: '#a8d870', fontSize: 13, fontWeight: 'bold',
          padding: '10px 18px', cursor: 'pointer',
          boxShadow: '0 4px 0 #0d2000',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <List size={14} />サンプル記録
        </button>
      </a>

      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <h1 className="game-title" style={{ textAlign: 'center', marginBottom: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <Twitter size={24} />SNS管理
        </h1>

        {/* 投稿記録セクション */}
        <div style={{
          background: 'white', border: '3px solid #3d6e00', borderRadius: 16,
          padding: 24, marginBottom: 24,
          boxShadow: '0 4px 0 #1a3a00',
        }}>
          <h2 style={{ textAlign: 'center', fontSize: 18, fontWeight: 'bold', color: '#1a3a00', marginBottom: 20 }}>
            投稿記録
          </h2>

          {/* 投稿したい内容 */}
          <label style={{ display: 'block', fontWeight: 'bold', color: '#1a3a00', marginBottom: 8, fontSize: 14 }}>
            投稿したい内容
          </label>
          <textarea
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder="例: 今週の活動報告、新メンバー歓迎、課題完成のお知らせ など..."
            rows={6}
            style={{
              width: '100%', boxSizing: 'border-box',
              border: '2px solid #3d6e00', borderRadius: 10,
              padding: '12px 14px', fontSize: 15, lineHeight: 1.6,
              resize: 'vertical', outline: 'none',
              fontFamily: 'inherit',
            }}
          />

          {/* 変換ボタン */}
          <div style={{ textAlign: 'center', margin: '16px 0' }}>
            <button
              onClick={handleConvert}
              disabled={converting || !inputText.trim()}
              style={{
                background: converting || !inputText.trim() ? '#aaa' : '#3d6e00',
                border: 'none', borderRadius: 12, color: 'white',
                fontSize: 15, fontWeight: 'bold', padding: '12px 40px',
                cursor: converting || !inputText.trim() ? 'not-allowed' : 'pointer',
                boxShadow: converting || !inputText.trim() ? 'none' : '0 4px 0 #1a3a00',
                display: 'inline-flex', alignItems: 'center', gap: 8,
                transition: 'background 0.2s',
              }}
            >
              <Wand2 size={16} />
              {converting ? '変換中...' : '変換'}
            </button>
          </div>

          {convertError && (
            <p style={{ color: '#c00', fontSize: 13, textAlign: 'center', marginBottom: 12 }}>{convertError}</p>
          )}

          {/* 生成された投稿 */}
          {(generatedText || converting) && (
            <>
              <label style={{ display: 'block', fontWeight: 'bold', color: '#1a3a00', marginBottom: 8, fontSize: 14 }}>
                作成された投稿
              </label>
              <div style={{
                border: '2px solid #6aac14', borderRadius: 10,
                padding: '12px 14px', fontSize: 15, lineHeight: 1.7,
                background: '#f6fff0', minHeight: 80,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                color: converting ? '#aaa' : '#1a1a1a',
                marginBottom: 16,
              }}>
                {converting ? '生成中...' : generatedText}
              </div>

              <div style={{ textAlign: 'center' }}>
                <button
                  onClick={handleSave}
                  disabled={saving || !generatedText.trim()}
                  style={{
                    background: saving || !generatedText.trim() ? '#aaa' : '#1a3a00',
                    border: 'none', borderRadius: 12, color: 'white',
                    fontSize: 15, fontWeight: 'bold', padding: '12px 40px',
                    cursor: saving || !generatedText.trim() ? 'not-allowed' : 'pointer',
                    boxShadow: saving || !generatedText.trim() ? 'none' : '0 4px 0 #0d2000',
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <Save size={16} />
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* 投稿予定リスト */}
        <div style={{
          background: 'white', border: '3px solid #3d6e00', borderRadius: 16,
          padding: 24, marginBottom: 16,
          boxShadow: '0 4px 0 #1a3a00',
        }}>
          <h2 style={{ fontSize: 17, fontWeight: 'bold', color: '#1a3a00', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            ☑ 投稿予定リスト
            <span style={{ fontSize: 13, color: '#666', fontWeight: 'normal' }}>（{pendingPosts.length}件）</span>
          </h2>
          {sendNowResult && (
            <div style={{
              background: sendNowResult.includes('失敗') || sendNowResult.includes('エラー') ? '#fff0f0' : '#f0fff4',
              border: `1px solid ${sendNowResult.includes('失敗') || sendNowResult.includes('エラー') ? '#e74c3c' : '#3d6e00'}`,
              borderRadius: 8, padding: '8px 12px', marginBottom: 12,
              fontSize: 13, fontWeight: 'bold',
              color: sendNowResult.includes('失敗') || sendNowResult.includes('エラー') ? '#c0392b' : '#1a4a00',
            }}>
              {sendNowResult}
            </div>
          )}

          {pendingPosts.length === 0 ? (
            <p style={{ color: '#999', fontSize: 14, textAlign: 'center', padding: '12px 0' }}>投稿予定はありません</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {pendingPosts.map(post => (
                <div key={post.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  border: '2px solid #e0e0e0', borderRadius: 10, padding: '12px 14px',
                  background: '#fafafa',
                }}>
                  {/* チェックボックス（投稿済みにする） */}
                  <button
                    onClick={() => handleMarkPosted(post)}
                    disabled={markingId === post.id}
                    title="投稿済みにする"
                    style={{
                      flexShrink: 0, width: 24, height: 24, marginTop: 2,
                      border: '2px solid #3d6e00', borderRadius: 6,
                      background: 'white', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'background 0.15s',
                    }}
                  >
                    {markingId === post.id && <span style={{ fontSize: 10, color: '#aaa' }}>...</span>}
                  </button>

                  {/* 投稿内容 + 日付指定 */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#1a1a1a', marginBottom: 8 }}>
                      {post.content}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <input
                        type="date"
                        value={post.scheduled_date ?? ''}
                        disabled={schedulingId === post.id}
                        onChange={e => handleSetSchedule(post.id, e.target.value || null)}
                        style={{
                          border: '1px solid #ccc', borderRadius: 6,
                          padding: '4px 8px', fontSize: 12, color: '#333',
                          background: 'white', cursor: 'pointer',
                        }}
                      />
                      {post.scheduled_date && (
                        <span style={{ fontSize: 11, color: post.notified_at ? '#3d6e00' : '#888' }}>
                          {post.notified_at ? '✅ 通知済み' : '🔔 17:00に通知'}
                        </span>
                      )}
                      {schedulingId === post.id && <span style={{ fontSize: 11, color: '#aaa' }}>更新中...</span>}
                      <button
                        onClick={() => handleSendNow(post.id)}
                        disabled={sendingNowId === post.id}
                        title="今すぐ通知を送信"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          background: sendingNowId === post.id ? '#ccc' : '#fff3e0',
                          border: '1px solid #e67e22', borderRadius: 6,
                          color: sendingNowId === post.id ? '#888' : '#a04000',
                          fontSize: 11, fontWeight: 'bold', padding: '4px 10px',
                          cursor: sendingNowId === post.id ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <Zap size={11} />
                        {sendingNowId === post.id ? '送信中...' : 'すぐに送信'}
                      </button>
                    </div>
                  </div>

                  {/* 削除ボタン */}
                  <button
                    onClick={() => handleDelete(post.id)}
                    disabled={deletingId === post.id}
                    title="削除"
                    style={{
                      flexShrink: 0, background: 'none', border: 'none',
                      cursor: 'pointer', color: '#ccc', padding: 4,
                      display: 'flex', alignItems: 'center',
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 投稿済みリスト（折りたたみ） */}
        <div style={{
          background: 'white', border: '3px solid #b0b0b0', borderRadius: 16,
          padding: 24, boxShadow: '0 4px 0 #888',
        }}>
          <button
            onClick={() => setShowPosted(v => !v)}
            style={{
              width: '100%', background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: 0,
            }}
          >
            <h2 style={{ fontSize: 17, fontWeight: 'bold', color: '#666', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              投稿済みリスト
              <span style={{ fontSize: 13, fontWeight: 'normal' }}>（{postedPosts.length}件）</span>
            </h2>
            {showPosted ? <ChevronUp size={20} color="#888" /> : <ChevronDown size={20} color="#888" />}
          </button>

          {showPosted && (
            <div style={{ marginTop: 16 }}>
              {postedPosts.length === 0 ? (
                <p style={{ color: '#999', fontSize: 14, textAlign: 'center', padding: '12px 0' }}>投稿済みの記録はありません</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {postedPosts.map(post => (
                    <div key={post.id} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 12,
                      border: '2px solid #e0e0e0', borderRadius: 10, padding: '12px 14px',
                      background: '#f5f5f5', opacity: 0.75,
                    }}>
                      {/* チェックボックス（クリックで投稿予定に戻す） */}
                      <button
                        onClick={() => handleMarkPending(post)}
                        disabled={markingId === post.id}
                        title="投稿予定に戻す"
                        style={{
                          flexShrink: 0, width: 24, height: 24, marginTop: 2,
                          border: '2px solid #999', borderRadius: 6,
                          background: '#999', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: markingId === post.id ? 'not-allowed' : 'pointer',
                          transition: 'background 0.15s',
                        }}
                      >
                        {markingId === post.id
                          ? <span style={{ fontSize: 10, color: 'white' }}>...</span>
                          : <Check size={14} color="white" />}
                      </button>

                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#666' }}>
                          {post.content}
                        </div>
                        {post.posted_at && (
                          <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>
                            投稿済み: {new Date(post.posted_at).toLocaleString('ja-JP')}
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => handleDelete(post.id)}
                        disabled={deletingId === post.id}
                        title="削除"
                        style={{
                          flexShrink: 0, background: 'none', border: 'none',
                          cursor: 'pointer', color: '#ccc', padding: 4,
                          display: 'flex', alignItems: 'center',
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

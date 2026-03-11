"use client"

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../../lib/supabase'
import { getEffectivePermissions, PermissionKey } from '../../../lib/permissions'

type XPostStatus = 'draft' | 'scheduled' | 'notified'

interface XPost {
  id: string
  content: string
  media_urls: string[] | null
  status: XPostStatus
  scheduled_at: string | null
  notified_at: string | null
  notify_user_ids: string[] | null
  created_by: string | null
  created_at: string
}

interface Profile {
  id: string
  username: string | null
}

interface MediaItem {
  url: string
  path: string
  mimeType: string
}

const STATUS_LABELS: Record<XPostStatus, string> = {
  draft:    '📝 下書き',
  scheduled: '📅 予約中',
  notified: '✅ 通知済',
}

const STATUS_COLORS: Record<XPostStatus, string> = {
  draft:    '#888',
  scheduled: '#3498db',
  notified: '#6aac14',
}

export default function XPostsPage() {
  const router = useRouter()
  const [loading, setLoading]               = useState(true)
  const [userRole, setUserRole]             = useState<string | null>(null)
  const [effectivePerms, setEffectivePerms] = useState<Record<PermissionKey, boolean>>({
    course_management: false, task_management: false,
    point_settings: false, submission_review: false, finance: false,
    timeline_management: false, dm_management: false,
    announcement_management: false, assignment_management: false,
    gimmick_management: false, x_post_management: false,
  })

  const [posts, setPosts]             = useState<XPost[]>([])
  const [allProfiles, setAllProfiles] = useState<Profile[]>([])
  const [error, setError]             = useState<string | null>(null)
  const [success, setSuccess]         = useState<string | null>(null)

  // 投稿フォーム
  const [editingId, setEditingId]         = useState<string | null>(null)
  const [rawText, setRawText]             = useState('')
  const [content, setContent]             = useState('')
  const [mediaItems, setMediaItems]       = useState<MediaItem[]>([])
  const [scheduledAt, setScheduledAt]     = useState('')
  const [notifyUserIds, setNotifyUserIds] = useState<string[]>([])
  const [converting, setConverting]       = useState(false)
  const [saving, setSaving]               = useState(false)
  const [uploading, setUploading]         = useState(false)

  // システムプロンプト設定
  const [promptOpen, setPromptOpen]       = useState(false)
  const [systemPrompt, setSystemPrompt]   = useState('')
  const [savingPrompt, setSavingPrompt]   = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let mounted = true
    async function init() {
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser()
        if (authError || !authData?.user) { router.replace('/login'); return }
        const uid = authData.user.id

        const [meRes, permsRes] = await Promise.all([
          supabase.from('profiles').select('role').eq('id', uid).single(),
          getEffectivePermissions(uid),
        ])

        const isAdmin = meRes.data?.role === 'admin'
        if (!isAdmin && !permsRes.x_post_management) {
          router.replace('/dashboard'); return
        }

        if (mounted) {
          setUserRole(meRes.data?.role ?? null)
          setEffectivePerms(permsRes)
        }

        const [postsRes, profilesRes, settingsRes] = await Promise.all([
          supabase.from('x_posts').select('*').order('created_at', { ascending: false }),
          supabase.from('profiles').select('id, username').order('username'),
          supabase.from('x_post_settings').select('system_prompt').eq('id', 1).single(),
        ])

        if (mounted) {
          setPosts((postsRes.data ?? []) as XPost[])
          setAllProfiles((profilesRes.data ?? []) as Profile[])
          setSystemPrompt(settingsRes.data?.system_prompt ?? '')
        }
      } catch (err) {
        console.error(err)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    init()
    return () => { mounted = false }
  }, [router])

  function showSuccess(msg: string) {
    setSuccess(msg)
    if (successTimer.current) clearTimeout(successTimer.current)
    successTimer.current = setTimeout(() => setSuccess(null), 3000)
  }

  async function getToken() {
    const { data } = await supabase.auth.getSession()
    return data?.session?.access_token ?? ''
  }

  async function handleConvert() {
    if (!rawText.trim()) { setError('変換する文章を入力してください'); return }
    setConverting(true)
    setError(null)
    try {
      const token = await getToken()
      const res = await fetch('/api/x-posts/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ text: rawText }),
      })
      const result = await res.json()
      if (!res.ok) { setError(result.error ?? '変換に失敗しました'); return }
      setContent(result.converted)
    } catch {
      setError('変換エラーが発生しました')
    }
    setConverting(false)
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setUploading(true)
    setError(null)
    try {
      const token = await getToken()
      for (const file of files) {
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch('/api/x-posts/upload-media', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData,
        })
        const result = await res.json()
        if (!res.ok) { setError(result.error ?? 'アップロードに失敗しました'); break }
        setMediaItems(prev => [...prev, { url: result.url, path: result.path, mimeType: result.mimeType }])
      }
    } catch {
      setError('アップロードエラーが発生しました')
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleRemoveMedia(item: MediaItem) {
    try {
      const token = await getToken()
      await fetch('/api/x-posts/upload-media', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ path: item.path }),
      })
    } catch { /* ignore */ }
    setMediaItems(prev => prev.filter(m => m.path !== item.path))
  }

  async function handleSave(withSchedule: boolean) {
    if (!content.trim()) { setError('投稿内容を入力してください'); return }
    if (withSchedule && !scheduledAt) { setError('予約日時を設定してください'); return }
    if (withSchedule && notifyUserIds.length === 0) { setError('通知先を1人以上選択してください'); return }

    setSaving(true)
    setError(null)
    try {
      const token = await getToken()
      const res = await fetch('/api/x-posts/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          id: editingId,
          content,
          media_urls: mediaItems.map(m => m.url),
          scheduled_at: withSchedule ? scheduledAt : null,
          notify_user_ids: withSchedule ? notifyUserIds : [],
        }),
      })
      const result = await res.json()
      if (!res.ok) { setError(result.error ?? '保存に失敗しました'); return }

      showSuccess(withSchedule ? '予約通知を設定しました' : '下書きを保存しました')
      resetForm()
      await refreshList()
    } catch {
      setError('保存エラーが発生しました')
    }
    setSaving(false)
  }

  function resetForm() {
    setEditingId(null)
    setRawText('')
    setContent('')
    setMediaItems([])
    setScheduledAt('')
    setNotifyUserIds([])
  }

  function handleEdit(post: XPost) {
    setEditingId(post.id)
    setContent(post.content)
    setRawText('')
    setMediaItems((post.media_urls ?? []).map(url => ({
      url,
      path: url.split('/').pop() ?? '',
      mimeType: url.match(/\.(mp4|mov)$/i) ? 'video/mp4' : 'image/jpeg',
    })))
    setScheduledAt(post.scheduled_at ? new Date(post.scheduled_at).toISOString().slice(0, 16) : '')
    setNotifyUserIds(post.notify_user_ids ?? [])
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(id: string) {
    const token = await getToken()
    const res = await fetch('/api/x-posts/save', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ id }),
    })
    if (res.ok) {
      setPosts(prev => prev.filter(p => p.id !== id))
    }
  }

  async function handleSavePrompt() {
    setSavingPrompt(true)
    const { error: err } = await supabase.from('x_post_settings')
      .update({ system_prompt: systemPrompt, updated_at: new Date().toISOString() })
      .eq('id', 1)
    if (err) { setError(err.message) } else { showSuccess('プロンプトを保存しました') }
    setSavingPrompt(false)
  }

  async function refreshList() {
    const { data } = await supabase.from('x_posts').select('*').order('created_at', { ascending: false })
    setPosts((data ?? []) as XPost[])
  }

  const charCount = content.length
  const charColor = charCount > 280 ? '#e74c3c' : charCount > 240 ? '#e67e22' : '#3d6e00'

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'white', fontSize: 24, fontWeight: 'bold' }}>Loading...</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', padding: '32px 24px' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>

        {/* ヘッダー */}
        <div className="game-card" style={{ padding: '24px 32px', marginBottom: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <h1 className="game-title" style={{ fontSize: 30 }}>🐦 X投稿管理</h1>
              <p style={{ color: '#3d6e00', marginTop: 4, fontSize: 13 }}>
                投稿内容の作成・Gemini変換・予約通知
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {(userRole === 'admin' || effectivePerms.course_management) && (
                <a href="/admin"><button className="game-button" style={{ width: 'auto', padding: '8px 18px', fontSize: 14 }}>部員管理</button></a>
              )}
              <button
                className="game-button"
                style={{ width: 'auto', padding: '8px 18px', fontSize: 14, background: '#888', borderColor: '#555' }}
                onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
              >
                ログアウト
              </button>
            </div>
          </div>
        </div>

        {error   && <div className="game-error" style={{ marginBottom: 16 }}>{error}</div>}
        {success && (
          <div style={{
            background: '#d4f0a0', color: '#1a4a00', border: '2px solid #6aac14',
            borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontWeight: 'bold',
          }}>
            {success}
          </div>
        )}

        {/* テキスト変換セクション */}
        <div className="game-card" style={{ padding: '24px 28px', marginBottom: 24 }}>
          <h2 className="game-title" style={{ fontSize: 20, marginBottom: 16 }}>
            {editingId ? '✏️ 投稿を編集' : '✨ 新しい投稿を作成'}
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* 元の文章 */}
            <div>
              <label className="game-label">元の文章（変換前）</label>
              <textarea
                className="game-input"
                value={rawText}
                onChange={e => setRawText(e.target.value)}
                placeholder="普通の文章を入力してください。BONJORYスタイルに変換します。"
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </div>

            <button
              className="game-button"
              onClick={handleConvert}
              disabled={converting || !rawText.trim()}
              style={{
                width: 'auto', padding: '10px 24px', fontSize: 15, alignSelf: 'flex-start',
                background: converting ? '#aaa' : '#3498db', borderColor: converting ? '#888' : '#1a6a9a',
              }}
            >
              {converting ? '変換中…' : '🤖 BONJORYスタイルに変換'}
            </button>

            {/* 投稿内容（変換後・手動編集可） */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="game-label">投稿内容 *（手動編集可）</label>
                <span style={{ fontSize: 13, color: charColor, fontWeight: 'bold' }}>
                  {charCount} / 280
                </span>
              </div>
              <textarea
                className="game-input"
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="投稿するテキストを入力（または上で変換してください）"
                rows={5}
                style={{ resize: 'vertical', borderColor: charCount > 280 ? '#e74c3c' : undefined }}
              />
            </div>
          </div>
        </div>

        {/* メディア添付セクション */}
        <div className="game-card" style={{ padding: '24px 28px', marginBottom: 24 }}>
          <h2 className="game-title" style={{ fontSize: 20, marginBottom: 16 }}>🖼️ メディア添付</h2>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime"
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              padding: '10px 24px', fontSize: 14, fontWeight: 'bold',
              borderRadius: 10, cursor: uploading ? 'not-allowed' : 'pointer',
              background: uploading ? '#ccc' : '#e8ffd4',
              color: uploading ? '#888' : '#2d5500',
              border: '2px solid #6aac14',
              marginBottom: 16,
            }}
          >
            {uploading ? 'アップロード中…' : '📎 画像・動画を追加'}
          </button>
          <p style={{ color: '#888', fontSize: 12, marginBottom: 16 }}>
            画像: JPG / PNG / GIF / WebP（5MBまで）｜動画: MP4 / MOV（15MBまで）
          </p>

          {mediaItems.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {mediaItems.map(item => (
                <div key={item.path} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '2px solid #3d6e00' }}>
                  {item.mimeType.startsWith('video/') ? (
                    <video
                      src={item.url}
                      style={{ width: 160, height: 120, objectFit: 'cover', display: 'block' }}
                      controls={false}
                      muted
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.url}
                      alt="media"
                      style={{ width: 160, height: 120, objectFit: 'cover', display: 'block' }}
                    />
                  )}
                  <button
                    onClick={() => handleRemoveMedia(item)}
                    style={{
                      position: 'absolute', top: 4, right: 4,
                      background: 'rgba(0,0,0,0.65)', color: 'white',
                      border: 'none', borderRadius: '50%',
                      width: 24, height: 24, cursor: 'pointer',
                      fontSize: 13, fontWeight: 'bold', lineHeight: '24px', textAlign: 'center',
                    }}
                  >
                    ✕
                  </button>
                  {item.mimeType.startsWith('video/') && (
                    <div style={{
                      position: 'absolute', bottom: 4, left: 4,
                      background: 'rgba(0,0,0,0.6)', color: 'white',
                      borderRadius: 6, padding: '2px 6px', fontSize: 11,
                    }}>
                      動画
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 投稿・通知設定セクション */}
        <div className="game-card" style={{ padding: '24px 28px', marginBottom: 24 }}>
          <h2 className="game-title" style={{ fontSize: 20, marginBottom: 16 }}>📤 投稿・通知設定</h2>

          {/* 通知先選択 */}
          <div style={{ marginBottom: 16 }}>
            <label className="game-label">通知先（予約時に通知を受け取る人）</label>
            <div style={{
              maxHeight: 180, overflowY: 'auto',
              border: '3px solid #3d6e00', borderRadius: 12,
              padding: '8px 12px', background: '#f8fff0',
            }}>
              {allProfiles.map(p => (
                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={notifyUserIds.includes(p.id)}
                    onChange={e => {
                      if (e.target.checked) setNotifyUserIds(prev => [...prev, p.id])
                      else setNotifyUserIds(prev => prev.filter(id => id !== p.id))
                    }}
                    style={{ accentColor: '#6aac14', width: 16, height: 16 }}
                  />
                  <span style={{ color: '#2d5500', fontSize: 14 }}>{p.username ?? p.id}</span>
                </label>
              ))}
            </div>
            <p style={{ color: '#6aac14', fontSize: 12, marginTop: 4 }}>選択中: {notifyUserIds.length}人</p>
          </div>

          {/* 予約日時 */}
          <div style={{ marginBottom: 20 }}>
            <label className="game-label">予約日時（空白の場合は下書き保存）</label>
            <input
              className="game-input"
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {/* 下書き保存 */}
            <button
              className="game-button"
              onClick={() => handleSave(false)}
              disabled={saving}
              style={{ width: 'auto', padding: '10px 24px', fontSize: 15, background: '#888', borderColor: '#555' }}
            >
              {saving ? '保存中…' : '📝 下書き保存'}
            </button>

            {/* 予約通知 */}
            <button
              className="game-button"
              onClick={() => handleSave(true)}
              disabled={saving || !scheduledAt || notifyUserIds.length === 0}
              style={{ width: 'auto', padding: '10px 24px', fontSize: 15 }}
            >
              {saving ? '設定中…' : '📅 予約通知を設定'}
            </button>

            {editingId && (
              <button
                onClick={resetForm}
                style={{
                  padding: '10px 20px', fontSize: 14, fontWeight: 'bold',
                  borderRadius: 10, cursor: 'pointer',
                  background: 'none', color: '#888', border: '2px solid #ccc',
                }}
              >
                キャンセル
              </button>
            )}
          </div>
          <p style={{ color: '#888', fontSize: 12, marginTop: 8 }}>
            ※ 予約通知は既存のcron jobで処理されます。cronが起動するたびに予約時刻を確認し、時刻になると選択した通知先にプッシュ通知が届きます。
          </p>
        </div>

        {/* システムプロンプト設定（折りたたみ） */}
        <div className="game-card" style={{ padding: '20px 28px', marginBottom: 24 }}>
          <button
            onClick={() => setPromptOpen(prev => !prev)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8, padding: 0,
            }}
          >
            <h2 className="game-title" style={{ fontSize: 18, margin: 0 }}>
              {promptOpen ? '▼' : '▶'} ⚙️ Geminiシステムプロンプト設定
            </h2>
          </button>

          {promptOpen && (
            <div style={{ marginTop: 16 }}>
              <p style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>
                BONJORYの口調・スタイルをGeminiに伝えるプロンプトを編集できます。
              </p>
              <textarea
                className="game-input"
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                rows={6}
                style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
              />
              <button
                className="game-button"
                onClick={handleSavePrompt}
                disabled={savingPrompt}
                style={{ marginTop: 10, width: 'auto', padding: '8px 20px', fontSize: 14 }}
              >
                {savingPrompt ? '保存中…' : '保存する'}
              </button>
            </div>
          )}
        </div>

        {/* 投稿一覧 */}
        <div className="game-card" style={{ padding: '20px 28px' }}>
          <h2 className="game-title" style={{ fontSize: 20, marginBottom: 16 }}>
            投稿一覧（{posts.length}件）
          </h2>

          {posts.length === 0 ? (
            <p style={{ color: '#6aac14', textAlign: 'center', padding: 24 }}>投稿がありません</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {posts.map(post => (
                <div
                  key={post.id}
                  style={{
                    border: `2px solid ${STATUS_COLORS[post.status]}`,
                    borderRadius: 12,
                    padding: '14px 18px',
                    background: '#f8fff0',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* ステータスバッジ */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                        <span style={{
                          background: STATUS_COLORS[post.status], color: 'white',
                          borderRadius: 8, padding: '2px 10px', fontSize: 11, fontWeight: 'bold',
                          whiteSpace: 'nowrap',
                        }}>
                          {STATUS_LABELS[post.status]}
                        </span>
                        {post.scheduled_at && (
                          <span style={{ color: '#3498db', fontSize: 12 }}>
                            {new Date(post.scheduled_at).toLocaleString('ja-JP')}
                          </span>
                        )}
                        {post.notified_at && (
                          <span style={{ color: '#6aac14', fontSize: 12 }}>
                            通知: {new Date(post.notified_at).toLocaleString('ja-JP')}
                          </span>
                        )}
                      </div>

                      {/* 投稿内容 */}
                      <p style={{
                        color: '#2d5500', fontSize: 14,
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        maxHeight: 80, overflow: 'hidden',
                        marginBottom: 6,
                      }}>
                        {post.content}
                      </p>

                      {/* メディアサムネイル */}
                      {post.media_urls && post.media_urls.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {post.media_urls.map((url, i) => (
                            url.match(/\.(mp4|mov)$/i) ? (
                              <video
                                key={i}
                                src={url}
                                style={{ width: 60, height: 45, objectFit: 'cover', borderRadius: 6, border: '1px solid #ccc' }}
                                muted
                              />
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                key={i}
                                src={url}
                                alt={`media-${i}`}
                                style={{ width: 60, height: 45, objectFit: 'cover', borderRadius: 6, border: '1px solid #ccc' }}
                              />
                            )
                          ))}
                        </div>
                      )}

                      {/* 通知先人数 */}
                      {post.notify_user_ids && post.notify_user_ids.length > 0 && (
                        <p style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
                          通知先: {post.notify_user_ids.length}人
                        </p>
                      )}
                    </div>

                    {/* アクションボタン */}
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {post.status !== 'notified' && (
                        <button
                          onClick={() => handleEdit(post)}
                          style={{
                            padding: '5px 12px', fontSize: 12, fontWeight: 'bold',
                            borderRadius: 8, cursor: 'pointer',
                            background: '#e8ffd4', color: '#1a6e00',
                            border: '2px solid #6aac14',
                          }}
                        >
                          編集
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(post.id)}
                        style={{
                          padding: '5px 10px', fontSize: 13, fontWeight: 'bold',
                          borderRadius: 8, cursor: 'pointer',
                          background: 'none', color: '#c0392b',
                          border: '2px solid #c0392b',
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* ダッシュボードへ戻るボタン */}
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

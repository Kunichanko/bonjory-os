'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase'
import { getEffectivePermissions } from '@/lib/permissions'
import { generateUuid } from '@/lib/uuid'
import JSZip from 'jszip'
import { XIcon as Twitter, Wand2, Save, ChevronDown, ChevronUp, Check, Trash2, List, Zap, Image as ImageIcon, Plus, Download, Upload, Clock, Pencil, X } from 'lucide-react'

interface SnsPost {
  id: string
  content: string
  status: 'pending' | 'posted'
  posted_at: string | null
  scheduled_date: string | null
  notified_at: string | null
  created_at: string
}

interface SnsImage {
  id: string
  post_id: string
  storage_path: string | null
  image_url: string
  file_name: string
}

interface TimelineAssignment {
  id: string
  user_id: string
  thumbnail_url: string | null
  image_urls: string[] | null
  submitted_at: string | null
  task: { title: string } | null
  submitterUsername: string | null
}

function publicUrlFor(storagePath: string) {
  return supabase.storage.from('media').getPublicUrl(storagePath).data.publicUrl
}

export default function SnsManagePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  const [samples, setSamples] = useState<{ id: string; content: string; use_for_ai: boolean }[]>([])
  const [posts, setPosts] = useState<SnsPost[]>([])
  const [presets, setPresets] = useState<{ id: string; content: string }[]>([])
  const generatedTextRef = useRef<HTMLTextAreaElement>(null)

  const [inputText, setInputText] = useState('')
  const [generatedText, setGeneratedText] = useState('')
  const [converting, setConverting] = useState(false)
  const [convertError, setConvertError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [showPosted, setShowPosted] = useState(false)
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [savingEditId, setSavingEditId] = useState<string | null>(null)
  const [schedulingId, setSchedulingId] = useState<string | null>(null)
  const [sendingNowId, setSendingNowId] = useState<string | null>(null)
  const [sendNowResult, setSendNowResult] = useState<string | null>(null)

  const [images, setImages] = useState<SnsImage[]>([])
  const [uploadingImageFor, setUploadingImageFor] = useState<string | null>(null)
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null)
  const [addImageMenuFor, setAddImageMenuFor] = useState<string | null>(null)
  const [zippingPostId, setZippingPostId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingUploadPostId = useRef<string | null>(null)

  const [timelinePickerFor, setTimelinePickerFor] = useState<string | null>(null)
  const [timelineAssignments, setTimelineAssignments] = useState<TimelineAssignment[]>([])
  const [loadingTimeline, setLoadingTimeline] = useState(false)
  const [linkingImages, setLinkingImages] = useState(false)

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

      const [samplesRes, postsRes, presetsRes, imagesRes] = await Promise.all([
        supabase.from('sns_sample_tweets').select('id, content, use_for_ai').order('created_at'),
        supabase.from('sns_posts').select('*').order('created_at', { ascending: false }),
        supabase.from('sns_text_presets').select('id, content').order('created_at'),
        supabase.from('sns_images').select('id, post_id, storage_path, image_url, file_name').not('post_id', 'is', null).order('created_at'),
      ])

      setSamples((samplesRes.data ?? []) as { id: string; content: string; use_for_ai: boolean }[])
      setPosts((postsRes.data ?? []) as SnsPost[])
      setPresets((presetsRes.data ?? []) as { id: string; content: string }[])
      setImages((imagesRes.data ?? []) as SnsImage[])
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

  function handleInsertPreset(content: string) {
    const textarea = generatedTextRef.current
    if (!textarea) { setGeneratedText(prev => prev + content); return }
    const start = textarea.selectionStart ?? generatedText.length
    const end = textarea.selectionEnd ?? generatedText.length
    const next = generatedText.slice(0, start) + content + generatedText.slice(end)
    setGeneratedText(next)
    requestAnimationFrame(() => {
      textarea.focus()
      const cursor = start + content.length
      textarea.setSelectionRange(cursor, cursor)
    })
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

  function handleStartEdit(post: SnsPost) {
    setEditingId(post.id)
    setEditContent(post.content)
  }

  function handleCancelEdit() {
    setEditingId(null)
    setEditContent('')
  }

  async function handleSaveEdit(postId: string) {
    if (!editContent.trim()) return
    setSavingEditId(postId)
    const { error } = await supabase
      .from('sns_posts')
      .update({ content: editContent.trim() })
      .eq('id', postId)
    if (error) { alert('更新に失敗しました: ' + error.message); setSavingEditId(null); return }
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, content: editContent.trim() } : p))
    setSavingEditId(null)
    setEditingId(null)
    setEditContent('')
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

  async function handleAddImage(postId: string, file: File) {
    setUploadingImageFor(postId)
    const { data: { user } } = await supabase.auth.getUser()
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `sns-images/${generateUuid()}.${ext}`
    const { error: upErr } = await supabase.storage.from('media').upload(path, file)
    if (upErr) { alert('アップロードに失敗しました: ' + upErr.message); setUploadingImageFor(null); return }

    const { data, error } = await supabase
      .from('sns_images')
      .insert({ post_id: postId, storage_path: path, image_url: publicUrlFor(path), file_name: file.name, uploaded_by: user?.id ?? null })
      .select('id, post_id, storage_path, image_url, file_name')
      .single()
    if (error || !data) { alert('登録に失敗しました: ' + error?.message); setUploadingImageFor(null); return }
    setImages(prev => [...prev, data as SnsImage])
    setUploadingImageFor(null)
  }

  async function handleDeleteImage(image: SnsImage) {
    setDeletingImageId(image.id)
    if (image.storage_path) await supabase.storage.from('media').remove([image.storage_path])
    const { error } = await supabase.from('sns_images').delete().eq('id', image.id)
    if (error) { alert('削除に失敗しました: ' + error.message); setDeletingImageId(null); return }
    setImages(prev => prev.filter(i => i.id !== image.id))
    setDeletingImageId(null)
  }

  async function handleDownloadImage(image: SnsImage) {
    const res = await fetch(image.image_url)
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = image.file_name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(a.href)
  }

  async function handleDownloadAllImages(postId: string) {
    const postImages = images.filter(img => img.post_id === postId)
    if (postImages.length === 0) return

    setZippingPostId(postId)
    const zip = new JSZip()
    const usedNames = new Set<string>()
    for (let i = 0; i < postImages.length; i++) {
      const image = postImages[i]
      const res = await fetch(image.image_url)
      const blob = await res.blob()
      let name = image.file_name || `image-${i}.jpg`
      if (usedNames.has(name)) name = `${i}-${name}`
      usedNames.add(name)
      zip.file(name, blob)
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(zipBlob)
    a.download = `sns-images-${postId.slice(0, 8)}.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(a.href)
    setZippingPostId(null)
  }

  function handleChooseFile(postId: string) {
    pendingUploadPostId.current = postId
    setAddImageMenuFor(null)
    fileInputRef.current?.click()
  }

  async function handleChooseTimeline(postId: string) {
    setAddImageMenuFor(null)
    setTimelinePickerFor(postId)
    if (timelineAssignments.length === 0) {
      setLoadingTimeline(true)
      const { data: assignments } = await supabase
        .from('task_assignments')
        .select('id, user_id, thumbnail_url, image_urls, submitted_at, task:tasks(title)')
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: false })
        .limit(50)

      const userIds = [...new Set((assignments ?? []).map(a => a.user_id))]
      const { data: profilesData } = await supabase.from('profiles').select('id, username').in('id', userIds)
      const usernameById = new Map((profilesData ?? []).map(p => [p.id, p.username as string | null]))

      const merged = (assignments ?? []).map(a => ({
        ...a,
        submitterUsername: usernameById.get(a.user_id) ?? null,
      }))
      setTimelineAssignments(merged as unknown as TimelineAssignment[])
      setLoadingTimeline(false)
    }
  }

  async function handleSelectTimelineAssignment(assignment: TimelineAssignment) {
    const postId = timelinePickerFor
    if (!postId) return
    const urls = [assignment.thumbnail_url, ...(assignment.image_urls ?? [])].filter((u): u is string => !!u)
    if (urls.length === 0) { alert('この提出には画像がありません'); return }

    setLinkingImages(true)
    const { data: { user } } = await supabase.auth.getUser()
    const rows = urls.map(url => ({
      post_id: postId,
      image_url: url,
      file_name: url.split('/').pop() ?? 'image.jpg',
      uploaded_by: user?.id ?? null,
    }))
    const { data, error } = await supabase.from('sns_images').insert(rows).select('id, post_id, storage_path, image_url, file_name')
    setLinkingImages(false)
    if (error || !data) { alert('追加に失敗しました: ' + error?.message); return }
    setImages(prev => [...prev, ...(data as SnsImage[])])
    setTimelinePickerFor(null)
  }

  const pendingPosts = posts.filter(p => p.status === 'pending')
  const postedPosts  = posts.filter(p => p.status === 'posted')

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#3d6e00', fontWeight: 'bold' }}>読み込み中...</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', padding: '140px 16px 60px' }}>
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

      {/* 画像管理ボタン */}
      <a href="/admin/sns/images" style={{ textDecoration: 'none' }}>
        <button style={{
          position: 'fixed', top: 70, right: 16, zIndex: 50,
          background: '#3d6e00', border: '3px solid #6aac14', borderRadius: 14,
          color: 'white', fontSize: 15, fontWeight: 'bold',
          padding: '14px 22px', cursor: 'pointer',
          boxShadow: '0 5px 0 #1a3a00',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <ImageIcon size={18} />画像管理
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
              {converting ? (
                <div style={{
                  border: '2px solid #6aac14', borderRadius: 10,
                  padding: '12px 14px', fontSize: 15, lineHeight: 1.7,
                  background: '#f6fff0', minHeight: 80, color: '#aaa',
                  marginBottom: 16,
                }}>
                  生成中...
                </div>
              ) : (
                <textarea
                  ref={generatedTextRef}
                  value={generatedText}
                  onChange={e => setGeneratedText(e.target.value)}
                  rows={5}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    border: '2px solid #6aac14', borderRadius: 10,
                    padding: '12px 14px', fontSize: 15, lineHeight: 1.7,
                    background: '#f6fff0', resize: 'vertical', outline: 'none',
                    fontFamily: 'inherit', marginBottom: 16,
                  }}
                />
              )}

              {!converting && presets.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {presets.map(preset => (
                    <button
                      key={preset.id}
                      onClick={() => handleInsertPreset(preset.content)}
                      title={preset.content}
                      style={{
                        background: '#f6fff0', border: '2px solid #6aac14', borderRadius: 20,
                        color: '#1a3a00', fontSize: 12, fontWeight: 'bold',
                        padding: '6px 14px', cursor: 'pointer',
                        maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    >
                      {preset.content}
                    </button>
                  ))}
                </div>
              )}

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
                    {editingId === post.id ? (
                      <div style={{ marginBottom: 8 }}>
                        <textarea
                          value={editContent}
                          onChange={e => setEditContent(e.target.value)}
                          rows={4}
                          style={{
                            width: '100%', boxSizing: 'border-box',
                            border: '2px solid #6aac14', borderRadius: 8,
                            padding: '8px 10px', fontSize: 14, lineHeight: 1.6,
                            resize: 'vertical', outline: 'none',
                            fontFamily: 'inherit', marginBottom: 6,
                          }}
                        />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => handleSaveEdit(post.id)}
                            disabled={savingEditId === post.id || !editContent.trim()}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              background: savingEditId === post.id || !editContent.trim() ? '#aaa' : '#3d6e00',
                              border: 'none', borderRadius: 6, color: 'white',
                              fontSize: 12, fontWeight: 'bold', padding: '5px 12px',
                              cursor: savingEditId === post.id || !editContent.trim() ? 'not-allowed' : 'pointer',
                            }}
                          >
                            <Save size={12} />
                            {savingEditId === post.id ? '保存中...' : '保存'}
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            disabled={savingEditId === post.id}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              background: 'white', border: '1px solid #ccc', borderRadius: 6,
                              color: '#666', fontSize: 12, fontWeight: 'bold', padding: '5px 12px',
                              cursor: savingEditId === post.id ? 'not-allowed' : 'pointer',
                            }}
                          >
                            <X size={12} />
                            キャンセル
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 8 }}>
                        <div style={{ flex: 1, fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#1a1a1a' }}>
                          {post.content}
                        </div>
                        <button
                          onClick={() => handleStartEdit(post)}
                          title="編集"
                          style={{
                            flexShrink: 0, background: 'none', border: 'none',
                            cursor: 'pointer', color: '#3d6e00', padding: 2,
                            display: 'flex', alignItems: 'center',
                          }}
                        >
                          <Pencil size={14} />
                        </button>
                      </div>
                    )}

                    {/* 添付画像 */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                      {images.filter(img => img.post_id === post.id).map(image => (
                        <div key={image.id} style={{ position: 'relative', width: 64, height: 64, borderRadius: 8, overflow: 'hidden', border: '2px solid #6aac14' }}>
                          <img src={image.image_url} alt={image.file_name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          <button
                            onClick={() => handleDownloadImage(image)}
                            title="ダウンロード"
                            style={{ position: 'absolute', bottom: 2, left: 2, background: 'rgba(255,255,255,0.85)', border: 'none', borderRadius: 4, cursor: 'pointer', padding: 2, display: 'flex', color: '#1a3a00' }}
                          >
                            <Download size={11} />
                          </button>
                          <button
                            onClick={() => handleDeleteImage(image)}
                            disabled={deletingImageId === image.id}
                            title="削除"
                            style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(220,0,0,0.85)', border: 'none', borderRadius: 4, cursor: deletingImageId === image.id ? 'not-allowed' : 'pointer', padding: 2, display: 'flex', color: 'white' }}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      ))}

                      <div style={{ position: 'relative' }}>
                        <button
                          onClick={() => setAddImageMenuFor(addImageMenuFor === post.id ? null : post.id)}
                          title="画像を追加"
                          disabled={uploadingImageFor === post.id}
                          style={{
                            width: 64, height: 64, borderRadius: 8,
                            border: '2px dashed #6aac14', background: '#f6fff0',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: uploadingImageFor === post.id ? 'not-allowed' : 'pointer',
                            color: '#6aac14', fontSize: 12,
                          }}
                        >
                          {uploadingImageFor === post.id ? '...' : <Plus size={22} />}
                        </button>

                        {addImageMenuFor === post.id && (
                          <div style={{
                            position: 'absolute', top: 70, left: 0, zIndex: 30,
                            background: 'white', border: '2px solid #3d6e00', borderRadius: 10,
                            boxShadow: '0 4px 0 #1a3a00', overflow: 'hidden',
                            display: 'flex', flexDirection: 'column', minWidth: 140,
                          }}>
                            <button
                              onClick={() => handleChooseFile(post.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                background: 'white', border: 'none', borderBottom: '1px solid #e0e0e0',
                                padding: '10px 14px', fontSize: 13, fontWeight: 'bold',
                                color: '#1a3a00', cursor: 'pointer', whiteSpace: 'nowrap',
                              }}
                            >
                              <Upload size={14} />ファイル
                            </button>
                            <button
                              onClick={() => handleChooseTimeline(post.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                background: 'white', border: 'none',
                                padding: '10px 14px', fontSize: 13, fontWeight: 'bold',
                                color: '#1a3a00', cursor: 'pointer', whiteSpace: 'nowrap',
                              }}
                            >
                              <Clock size={14} />タイムライン
                            </button>
                          </div>
                        )}
                      </div>
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
                      {images.filter(img => img.post_id === post.id).length > 0 && (
                        <button
                          onClick={() => handleDownloadAllImages(post.id)}
                          disabled={zippingPostId === post.id}
                          title="添付画像を一括ダウンロード"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            background: zippingPostId === post.id ? '#ccc' : '#f6fff0',
                            border: '1px solid #6aac14', borderRadius: 6,
                            color: zippingPostId === post.id ? '#888' : '#1a3a00',
                            fontSize: 11, fontWeight: 'bold', padding: '4px 10px',
                            cursor: zippingPostId === post.id ? 'not-allowed' : 'pointer',
                          }}
                        >
                          <Download size={11} />
                          {zippingPostId === post.id ? '準備中...' : '画像を一括DL'}
                        </button>
                      )}
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
                        {images.filter(img => img.post_id === post.id).length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                            {images.filter(img => img.post_id === post.id).map(image => (
                              <div key={image.id} style={{ position: 'relative', width: 56, height: 56, borderRadius: 8, overflow: 'hidden', border: '2px solid #ccc' }}>
                                <img src={image.image_url} alt={image.file_name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                <button
                                  onClick={() => handleDownloadImage(image)}
                                  title="ダウンロード"
                                  style={{ position: 'absolute', bottom: 2, left: 2, background: 'rgba(255,255,255,0.85)', border: 'none', borderRadius: 4, cursor: 'pointer', padding: 2, display: 'flex', color: '#1a3a00' }}
                                >
                                  <Download size={10} />
                                </button>
                                <button
                                  onClick={() => handleDeleteImage(image)}
                                  disabled={deletingImageId === image.id}
                                  title="削除"
                                  style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(220,0,0,0.85)', border: 'none', borderRadius: 4, cursor: deletingImageId === image.id ? 'not-allowed' : 'pointer', padding: 2, display: 'flex', color: 'white' }}
                                >
                                  <Trash2 size={10} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
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

      {/* 画像アップロード用の共通input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          const postId = pendingUploadPostId.current
          if (file && postId) handleAddImage(postId, file)
          e.target.value = ''
          pendingUploadPostId.current = null
        }}
      />

      {/* タイムラインから画像を選択するモーダル */}
      {timelinePickerFor && (
        <div
          onClick={() => setTimelinePickerFor(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'white', borderRadius: 16, border: '3px solid #3d6e00',
              boxShadow: '0 4px 0 #1a3a00', width: '100%', maxWidth: 480,
              maxHeight: '80vh', overflowY: 'auto', padding: 20,
            }}
          >
            <h2 style={{ fontSize: 17, fontWeight: 'bold', color: '#1a3a00', marginBottom: 12 }}>
              タイムラインから選択
            </h2>

            {loadingTimeline ? (
              <p style={{ color: '#888', fontSize: 14, textAlign: 'center', padding: '20px 0' }}>読み込み中...</p>
            ) : linkingImages ? (
              <p style={{ color: '#888', fontSize: 14, textAlign: 'center', padding: '20px 0' }}>追加中...</p>
            ) : timelineAssignments.length === 0 ? (
              <p style={{ color: '#999', fontSize: 14, textAlign: 'center', padding: '20px 0' }}>タイムライン投稿がありません</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {timelineAssignments.map(assignment => {
                  const thumb = assignment.thumbnail_url ?? assignment.image_urls?.[0] ?? null
                  return (
                    <button
                      key={assignment.id}
                      onClick={() => handleSelectTimelineAssignment(assignment)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        background: '#fafafa', border: '2px solid #e0e0e0', borderRadius: 10,
                        padding: 10, cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      {thumb ? (
                        <img src={thumb} alt="" style={{ width: 56, height: 42, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 56, height: 42, borderRadius: 6, background: '#e0e0e0', flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 'bold', color: '#1a3a00', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {assignment.task?.title ?? '(課題不明)'}
                        </div>
                        <div style={{ fontSize: 11, color: '#888' }}>
                          {assignment.submitterUsername ?? ''}
                          {assignment.submitted_at ? ` ・ ${new Date(assignment.submitted_at).toLocaleDateString('ja-JP')}` : ''}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../../lib/supabase'
import { marked } from 'marked'
import ImageCropper from '../../components/ImageCropper'

// ─── 型定義 ───────────────────────────────────────────────

type BlockType = 'text' | 'image' | 'link' | 'task'

interface TextBlockContent  { content: string; is_markdown: boolean }
interface ImageBlockContent { url: string }
interface LinkBlockContent  { url: string; label: string }
interface TaskBlockContent  { task_id: string; task_title: string }

type BlockContent = TextBlockContent | ImageBlockContent | LinkBlockContent | TaskBlockContent

interface EditBlock {
  id: string        // 仮IDまたはDB ID
  type: BlockType
  sort_order: number
  content: BlockContent
  isNew?: boolean   // 新規作成フラグ
}

interface NewsArticle {
  id: string
  title: string
  title_color: string
  thumbnail_url: string | null
  thumbnail_aspect_ratio: number | null
  is_published: boolean
  created_at: string
}

interface TaskOption {
  id: string
  title: string
}

// ─── ユーティリティ ───────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`
}

function tempId(): string {
  return `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

// ─── ページコンポーネント ─────────────────────────────────

export default function AdminNewsPage() {
  const router = useRouter()

  const [articles,  setArticles]  = useState<NewsArticle[]>([])
  const [loading,   setLoading]   = useState(true)
  const [view,      setView]      = useState<'list' | 'edit'>('list')
  const [editId,    setEditId]    = useState<string | null>(null)   // null = 新規

  // ── 記事一覧 ─────────────────────────────────────────────
  const loadArticles = useCallback(async () => {
    setLoading(true)
    // 管理者チェック
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') { router.push('/dashboard'); return }

    const { data } = await supabase
      .from('news_articles')
      .select('id, title, title_color, thumbnail_url, thumbnail_aspect_ratio, is_published, created_at')
      .order('created_at', { ascending: false })

    setArticles(data ?? [])
    setLoading(false)
  }, [router])

  useEffect(() => { loadArticles() }, [loadArticles])

  // ── 新規 / 編集 ────────────────────────────────────────────
  function openNew() {
    setEditId(null)
    setView('edit')
  }

  function openEdit(id: string) {
    setEditId(id)
    setView('edit')
  }

  async function deleteArticle(id: string) {
    if (!confirm('この記事を削除しますか？')) return
    await supabase.from('news_articles').delete().eq('id', id)
    setArticles(prev => prev.filter(a => a.id !== id))
  }

  if (loading) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--green-main)' }}>
        <div className="game-card" style={{ padding:32, textAlign:'center' }}>
          <div style={{ fontSize:32 }}>📰</div>
          <p className="game-title">読み込み中…</p>
        </div>
      </div>
    )
  }

  if (view === 'edit') {
    return (
      <ArticleEditor
        articleId={editId}
        onSaved={() => { loadArticles(); setView('list') }}
        onCancel={() => setView('list')}
      />
    )
  }

  // ── 一覧ビュー ──────────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', background:'var(--green-main)', padding:20 }}>
      {/* ヘッダー */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        <button
          className="game-button"
          onClick={() => router.push('/admin')}
          style={{ fontSize:13, padding:'6px 14px' }}
        >
          ← 管理トップ
        </button>
        <h1 className="game-title" style={{ fontSize:24, margin:0 }}>📰 ニュース管理</h1>
        <button
          className="game-button"
          onClick={openNew}
          style={{ marginLeft:'auto' }}
        >
          ＋ 新規記事
        </button>
      </div>

      {articles.length === 0 ? (
        <div className="game-card" style={{ padding:40, textAlign:'center' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>📭</div>
          <p style={{ color:'#555' }}>まだ記事がありません。「＋ 新規記事」から作成してください。</p>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {articles.map(article => (
            <div key={article.id} className="game-card" style={{
              padding:'14px 18px', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap',
            }}>
              {/* サムネイル */}
              <div style={{
                width:60, height:60, borderRadius:10, overflow:'hidden', flexShrink:0,
                background:'#e0f0c0', border:'3px solid var(--green-dark)',
              }}>
                {article.thumbnail_url && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={article.thumbnail_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                )}
              </div>

              {/* 情報 */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:3 }}>
                  <span style={{ fontWeight:'bold', fontSize:15, color:'#222', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {article.title}
                  </span>
                  <span style={{
                    fontSize:11, borderRadius:20, padding:'2px 10px',
                    background: article.is_published ? 'var(--green-main)' : '#bbb',
                    color:'#fff',
                  }}>
                    {article.is_published ? '公開中' : '下書き'}
                  </span>
                </div>
                <div style={{ fontSize:12, color:'#888' }}>{formatDate(article.created_at)}</div>
              </div>

              {/* 操作 */}
              <div style={{ display:'flex', gap:8 }}>
                <button
                  className="game-button"
                  onClick={() => openEdit(article.id)}
                  style={{ fontSize:12, padding:'5px 14px' }}
                >
                  ✏️ 編集
                </button>
                <button
                  className="game-button"
                  onClick={() => deleteArticle(article.id)}
                  style={{ fontSize:12, padding:'5px 14px', background:'#e74c3c' }}
                >
                  🗑️ 削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 記事エディタ ─────────────────────────────────────────

function ArticleEditor({
  articleId, onSaved, onCancel,
}: {
  articleId: string | null
  onSaved: () => void
  onCancel: () => void
}) {
  const fileInputRef   = useRef<HTMLInputElement>(null)

  const [title,        setTitle]        = useState('')
  const [titleColor,   setTitleColor]   = useState('#1a1a1a')
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
  const [thumbAR,      setThumbAR]      = useState<number | null>(null)
  const [isPublished,  setIsPublished]  = useState(false)
  const [blocks,       setBlocks]       = useState<EditBlock[]>([])

  const [cropSrc,      setCropSrc]      = useState<string | null>(null)   // data URL for cropper
  const [taskOptions,  setTaskOptions]  = useState<TaskOption[]>([])

  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')
  const [success,      setSuccess]      = useState('')

  // ── 既存記事の読み込み ────────────────────────────────────
  useEffect(() => {
    supabase.from('tasks').select('id, title').eq('is_active', true).order('title')
      .then(({ data }) => setTaskOptions(data ?? []))

    if (!articleId) return   // 新規作成

    supabase
      .from('news_articles')
      .select('*')
      .eq('id', articleId)
      .single()
      .then(({ data }) => {
        if (!data) return
        setTitle(data.title)
        setTitleColor(data.title_color)
        setThumbnailUrl(data.thumbnail_url)
        setThumbAR(data.thumbnail_aspect_ratio)
        setIsPublished(data.is_published)
      })

    supabase
      .from('news_blocks')
      .select('id, type, sort_order, content')
      .eq('article_id', articleId)
      .order('sort_order')
      .then(({ data }) => {
        setBlocks((data ?? []).map(b => ({
          id: b.id,
          type: b.type as BlockType,
          sort_order: b.sort_order,
          content: b.content as BlockContent,
        })))
      })
  }, [articleId])

  // ── サムネイルファイル選択 ────────────────────────────────
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      setCropSrc(dataUrl)
    }
    reader.readAsDataURL(file)
    // 同じファイルを再選択できるようリセット
    e.target.value = ''
  }

  // ── ブロック操作 ──────────────────────────────────────────

  function addBlock(type: BlockType) {
    let content: BlockContent
    if (type === 'text')  content = { content: '', is_markdown: false }
    else if (type === 'image') content = { url: '' }
    else if (type === 'link')  content = { url: '', label: '' }
    else                       content = { task_id: '', task_title: '' }

    setBlocks(prev => [...prev, {
      id: tempId(), type, sort_order: prev.length, content, isNew: true,
    }])
  }

  function removeBlock(id: string) {
    setBlocks(prev => prev.filter(b => b.id !== id))
  }

  function moveBlock(id: string, dir: -1 | 1) {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id)
      if (idx < 0) return prev
      const next = [...prev]
      const swapIdx = idx + dir
      if (swapIdx < 0 || swapIdx >= next.length) return prev
      ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
      return next.map((b, i) => ({ ...b, sort_order: i }))
    })
  }

  function updateBlockContent(id: string, patch: Partial<BlockContent>) {
    setBlocks(prev => prev.map(b =>
      b.id === id ? { ...b, content: { ...b.content, ...patch } as BlockContent } : b
    ))
  }

  // ── 保存 ──────────────────────────────────────────────────
  async function save() {
    if (!title.trim()) { setError('タイトルを入力してください'); return }
    setSaving(true)
    setError('')
    setSuccess('')

    let aid = articleId

    if (!aid) {
      // 新規作成
      const { data, error: e } = await supabase.from('news_articles').insert({
        title: title.trim(),
        title_color: titleColor,
        thumbnail_url: thumbnailUrl,
        thumbnail_aspect_ratio: thumbAR,
        is_published: isPublished,
      }).select('id').single()
      if (e || !data) { setError('保存に失敗しました: ' + e?.message); setSaving(false); return }
      aid = data.id
    } else {
      // 更新
      const { error: e } = await supabase.from('news_articles').update({
        title: title.trim(),
        title_color: titleColor,
        thumbnail_url: thumbnailUrl,
        thumbnail_aspect_ratio: thumbAR,
        is_published: isPublished,
        updated_at: new Date().toISOString(),
      }).eq('id', aid)
      if (e) { setError('保存に失敗しました: ' + e.message); setSaving(false); return }
    }

    // ブロックを全削除して再挿入（シンプル実装）
    await supabase.from('news_blocks').delete().eq('article_id', aid)
    if (blocks.length > 0) {
      const rows = blocks.map((b, i) => ({
        article_id: aid,
        type: b.type,
        sort_order: i,
        content: b.content,
      }))
      const { error: be } = await supabase.from('news_blocks').insert(rows)
      if (be) { setError('ブロック保存に失敗しました: ' + be.message); setSaving(false); return }
    }

    setSaving(false)
    setSuccess('保存しました！')
    setTimeout(() => { onSaved() }, 1000)
  }

  // ─────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight:'100vh', background:'var(--green-main)', paddingBottom:60 }}>

      {/* ヘッダー */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'20px 20px 0', flexWrap:'wrap' }}>
        <button className="game-button" onClick={onCancel} style={{ fontSize:13, padding:'6px 14px' }}>
          ← 一覧に戻る
        </button>
        <h1 className="game-title" style={{ fontSize:22, margin:0 }}>
          {articleId ? '✏️ 記事を編集' : '✏️ 新しい記事を作成'}
        </h1>
      </div>

      <div style={{ padding:'16px 20px 0', maxWidth:760, margin:'0 auto' }}>

        {/* ── 基本情報 ── */}
        <div className="game-card" style={{ padding:20, marginBottom:16 }}>
          <h2 className="game-title" style={{ fontSize:16, marginBottom:16 }}>📋 基本情報</h2>

          {/* タイトル */}
          <label className="game-label" style={{ display:'block', marginBottom:6 }}>タイトル</label>
          <input
            className="game-input"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="記事タイトルを入力"
            style={{ marginBottom:12 }}
          />

          {/* タイトルカラー */}
          <label className="game-label" style={{ display:'block', marginBottom:6 }}>タイトルの色</label>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
            <input
              type="color"
              value={titleColor}
              onChange={e => setTitleColor(e.target.value)}
              style={{
                width:48, height:48, border:'3px solid var(--green-dark)',
                borderRadius:10, cursor:'pointer', padding:2, background:'#fff',
              }}
            />
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:'bold', fontSize:18, color: titleColor, textShadow:'0 1px 3px rgba(0,0,0,0.15)' }}>
                {title || 'プレビュー'}
              </div>
              <div style={{ fontSize:11, color:'#888' }}>{titleColor}</div>
            </div>
          </div>

          {/* 公開設定 */}
          <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', userSelect:'none' }}>
            <input
              type="checkbox"
              checked={isPublished}
              onChange={e => setIsPublished(e.target.checked)}
              style={{ width:18, height:18 }}
            />
            <span className="game-label" style={{ margin:0 }}>
              {isPublished ? '🌐 公開中' : '📝 下書き'}
            </span>
          </label>
        </div>

        {/* ── サムネイル ── */}
        <div className="game-card" style={{ padding:20, marginBottom:16 }}>
          <h2 className="game-title" style={{ fontSize:16, marginBottom:12 }}>🖼️ サムネイル</h2>

          {thumbnailUrl ? (
            <div style={{ marginBottom:12 }}>
              <div style={{
                width:'100%', maxWidth:320, margin:'0 auto',
                paddingTop: thumbAR ? `${(1 / thumbAR) * 100}%` : '56.25%',
                position:'relative', borderRadius:12, overflow:'hidden',
                border:'3px solid var(--green-dark)',
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbnailUrl}
                  alt="thumbnail"
                  style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }}
                />
              </div>
              {thumbAR && (
                <p style={{ textAlign:'center', fontSize:12, color:'#888', marginTop:6 }}>
                  アスペクト比: {thumbAR.toFixed(2)} ({thumbAR > 1 ? '横長' : thumbAR < 1 ? '縦長' : '正方形'})
                </p>
              )}
              <div style={{ display:'flex', gap:8, marginTop:10, justifyContent:'center' }}>
                <button
                  className="game-button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ fontSize:13 }}
                >
                  📁 変更
                </button>
                <button
                  className="game-button"
                  onClick={() => { setThumbnailUrl(null); setThumbAR(null) }}
                  style={{ fontSize:13, background:'#e74c3c' }}
                >
                  🗑️ 削除
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border:'3px dashed var(--green-dark)', borderRadius:16,
                padding:32, textAlign:'center', cursor:'pointer',
                background:'#f0f9e0', color:'#6aac14',
              }}
            >
              <div style={{ fontSize:36, marginBottom:8 }}>🖼️</div>
              <p style={{ fontWeight:'bold' }}>クリックして画像をアップロード</p>
              <p style={{ fontSize:12, color:'#888' }}>アップロード後にトリミングできます</p>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display:'none' }}
            onChange={handleFileSelect}
          />
        </div>

        {/* ── コンテンツブロック ── */}
        <div className="game-card" style={{ padding:20, marginBottom:16 }}>
          <h2 className="game-title" style={{ fontSize:16, marginBottom:12 }}>📝 コンテンツブロック</h2>

          {blocks.length === 0 && (
            <p style={{ color:'#888', fontSize:13, marginBottom:12 }}>
              ブロックを追加して記事を組んでいきましょう。
            </p>
          )}

          {blocks.map((block, idx) => (
            <BlockEditor
              key={block.id}
              block={block}
              index={idx}
              total={blocks.length}
              taskOptions={taskOptions}
              onUpdate={(patch) => updateBlockContent(block.id, patch)}
              onRemove={() => removeBlock(block.id)}
              onMoveUp={() => moveBlock(block.id, -1)}
              onMoveDown={() => moveBlock(block.id, 1)}
            />
          ))}

          {/* ブロック追加ボタン */}
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:12 }}>
            {([
              { type: 'text'  as BlockType, label: '📄 文章', emoji: '📄' },
              { type: 'image' as BlockType, label: '🖼️ 画像', emoji: '🖼️' },
              { type: 'link'  as BlockType, label: '🔗 リンク', emoji: '🔗' },
              { type: 'task'  as BlockType, label: '📋 課題', emoji: '📋' },
            ]).map(({ type, label }) => (
              <button
                key={type}
                className="game-button"
                onClick={() => addBlock(type)}
                style={{ fontSize:12, padding:'6px 14px', background:'var(--green-panel)' }}
              >
                ＋ {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── 保存 ── */}
        {error   && <div className="game-error"   style={{ marginBottom:12, padding:'10px 16px' }}>{error}</div>}
        {success && <div className="game-success" style={{ marginBottom:12, padding:'10px 16px' }}>{success}</div>}

        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          <button
            className="game-button"
            onClick={save}
            disabled={saving}
            style={{ flex:1, fontSize:16, padding:'14px 0', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? '保存中…' : '💾 保存する'}
          </button>
          <button
            className="game-button"
            onClick={onCancel}
            style={{ fontSize:14, padding:'14px 20px', background:'#888' }}
          >
            キャンセル
          </button>
        </div>
      </div>

      {/* ── トリミングモーダル ── */}
      {cropSrc && (
        <ImageCropper
          imageDataUrl={cropSrc}
          onCrop={(url, ar) => {
            setThumbnailUrl(url)
            setThumbAR(ar)
            setCropSrc(null)
          }}
          onCancel={() => setCropSrc(null)}
        />
      )}
    </div>
  )
}

// ─── ブロックエディタ ─────────────────────────────────────

function BlockEditor({
  block, index, total, taskOptions,
  onUpdate, onRemove, onMoveUp, onMoveDown,
}: {
  block: EditBlock
  index: number
  total: number
  taskOptions: TaskOption[]
  onUpdate: (patch: Partial<BlockContent>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const BLOCK_LABELS: Record<BlockType, string> = {
    text:  '📄 文章ブロック',
    image: '🖼️ 画像ブロック',
    link:  '🔗 リンクブロック',
    task:  '📋 課題ブロック',
  }

  const imgFileRef = useRef<HTMLInputElement>(null)
  const [imgCropSrc, setImgCropSrc] = useState<string | null>(null)
  const [previewMD, setPreviewMD]   = useState(false)

  const c = block.content as Record<string, unknown>

  // 画像ブロック: ファイル選択 → クロッパー → URLをセット
  function handleImgFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setImgCropSrc(ev.target?.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  return (
    <div style={{
      border:'3px solid var(--green-dark)', borderRadius:14,
      marginBottom:12, overflow:'hidden',
    }}>
      {/* ブロックヘッダー */}
      <div style={{
        background:'var(--green-main)', padding:'8px 12px',
        display:'flex', alignItems:'center', gap:8,
      }}>
        <span style={{ fontWeight:'bold', color:'#fff', fontSize:13 }}>
          {BLOCK_LABELS[block.type]}
        </span>
        <span style={{ fontSize:11, color:'rgba(255,255,255,0.7)', marginLeft:4 }}>#{index + 1}</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            style={{
              background:'rgba(255,255,255,0.25)', border:'none', borderRadius:6,
              color:'#fff', width:26, height:26, cursor: index === 0 ? 'default' : 'pointer',
              opacity: index === 0 ? 0.4 : 1, fontSize:14,
            }}
          >↑</button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            style={{
              background:'rgba(255,255,255,0.25)', border:'none', borderRadius:6,
              color:'#fff', width:26, height:26, cursor: index === total - 1 ? 'default' : 'pointer',
              opacity: index === total - 1 ? 0.4 : 1, fontSize:14,
            }}
          >↓</button>
          <button
            onClick={onRemove}
            style={{
              background:'#e74c3c', border:'none', borderRadius:6,
              color:'#fff', width:26, height:26, cursor:'pointer', fontSize:13,
            }}
          >✕</button>
        </div>
      </div>

      {/* ブロック本体 */}
      <div style={{ padding:12 }}>

        {/* ── 文章ブロック ── */}
        {block.type === 'text' && (
          <>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
              <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:13 }}>
                <input
                  type="checkbox"
                  checked={!!(c.is_markdown)}
                  onChange={e => onUpdate({ is_markdown: e.target.checked })}
                />
                マークダウン形式
              </label>
              {c.is_markdown && (
                <button
                  onClick={() => setPreviewMD(p => !p)}
                  style={{
                    fontSize:11, padding:'2px 10px',
                    background: previewMD ? 'var(--green-dark)' : '#aaa',
                    color:'#fff', border:'none', borderRadius:8, cursor:'pointer',
                  }}
                >
                  {previewMD ? 'エディット' : 'プレビュー'}
                </button>
              )}
            </div>

            {previewMD && c.is_markdown ? (
              <div
                className="markdown-body"
                style={{ minHeight:60, padding:8, background:'#f9fff0', borderRadius:8, border:'2px solid #c0e080', fontSize:14 }}
                dangerouslySetInnerHTML={{ __html: marked(String(c.content ?? '')) as string }}
              />
            ) : (
              <textarea
                className="game-input"
                value={String(c.content ?? '')}
                onChange={e => onUpdate({ content: e.target.value })}
                rows={5}
                placeholder={c.is_markdown ? '## 見出し\n\n本文をマークダウン形式で書けます。' : '本文を入力してください。'}
                style={{ resize:'vertical', fontFamily:'monospace', fontSize:13 }}
              />
            )}
          </>
        )}

        {/* ── 画像ブロック ── */}
        {block.type === 'image' && (
          <>
            {c.url ? (
              <div style={{ textAlign:'center' }}>
                <div style={{
                  width:160, height:160, borderRadius:'50%', overflow:'hidden',
                  border:'4px solid var(--green-dark)', margin:'0 auto 10px',
                  boxShadow:'0 4px 12px rgba(0,0,0,0.2)',
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={String(c.url)} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                </div>
                <div style={{ display:'flex', gap:8, justifyContent:'center' }}>
                  <button className="game-button" onClick={() => imgFileRef.current?.click()} style={{ fontSize:12 }}>
                    変更
                  </button>
                  <button className="game-button" onClick={() => onUpdate({ url: '' })} style={{ fontSize:12, background:'#e74c3c' }}>
                    削除
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => imgFileRef.current?.click()}
                style={{
                  border:'3px dashed #aaa', borderRadius:12, padding:24,
                  textAlign:'center', cursor:'pointer', background:'#f9f9f9',
                }}
              >
                <div style={{ fontSize:28 }}>🖼️</div>
                <p style={{ fontSize:13, color:'#888' }}>クリックして画像を追加（丸型で表示）</p>
              </div>
            )}
            <input ref={imgFileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleImgFile} />

            {/* 画像ブロック用クロッパー */}
            {imgCropSrc && (
              <ImageCropper
                imageDataUrl={imgCropSrc}
                onCrop={(url) => { onUpdate({ url }); setImgCropSrc(null) }}
                onCancel={() => setImgCropSrc(null)}
              />
            )}
          </>
        )}

        {/* ── リンクブロック ── */}
        {block.type === 'link' && (
          <>
            <label className="game-label" style={{ display:'block', marginBottom:4, fontSize:12 }}>ラベル</label>
            <input
              className="game-input"
              value={String(c.label ?? '')}
              onChange={e => onUpdate({ label: e.target.value })}
              placeholder="表示するテキスト (例: 詳細はこちら)"
              style={{ marginBottom:8, fontSize:13 }}
            />
            <label className="game-label" style={{ display:'block', marginBottom:4, fontSize:12 }}>URL</label>
            <input
              className="game-input"
              value={String(c.url ?? '')}
              onChange={e => onUpdate({ url: e.target.value })}
              placeholder="https://example.com"
              style={{ fontSize:13 }}
            />
          </>
        )}

        {/* ── 課題ブロック ── */}
        {block.type === 'task' && (
          <>
            <p style={{ fontSize:12, color:'#666', marginBottom:8 }}>
              課題を埋め込みます。読者がこのブロックを押すと課題を予約できます（同時に1つまで）。
            </p>
            <label className="game-label" style={{ display:'block', marginBottom:4, fontSize:12 }}>課題を選択</label>
            <select
              className="game-input"
              value={String(c.task_id ?? '')}
              onChange={e => {
                const opt = taskOptions.find(t => t.id === e.target.value)
                onUpdate({ task_id: e.target.value, task_title: opt?.title ?? '' })
              }}
              style={{ fontSize:13 }}
            >
              <option value="">── 課題を選択してください ──</option>
              {taskOptions.map(t => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
            {c.task_id && (
              <div style={{
                marginTop:10, padding:'10px 14px',
                background:'#f0f9e0', border:'3px solid var(--green-dark)', borderRadius:10,
                fontSize:13, color:'#2d5500',
              }}>
                📋 <strong>{String(c.task_title ?? '')}</strong>
                <span style={{ marginLeft:8, fontSize:11, color:'#888' }}>← 読者に表示される課題</span>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  )
}

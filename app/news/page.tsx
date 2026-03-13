"use client"

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../lib/supabase'
import { marked } from 'marked'

// ─── 型定義 ───────────────────────────────────────────────

interface NewsBlock {
  id: string
  type: 'text' | 'image' | 'link' | 'task'
  sort_order: number
  content: {
    // text
    content?: string
    is_markdown?: boolean
    // image
    url?: string
    // link
    label?: string
    // task
    task_id?: string
    task_title?: string
  }
}

interface NewsArticle {
  id: string
  title: string
  title_color: string
  thumbnail_url: string | null
  thumbnail_aspect_ratio: number | null
  created_at: string
  blocks?: NewsBlock[]
}

interface Reservation {
  task_id: string
  task_title: string
  article_id: string | null
}

// ─── ユーティリティ ───────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`
}

/** 記事インデックスとアスペクト比からグリッドスパンを決定 */
function getGridSpan(index: number, ar: number | null): { col: number; row: number } {
  const r = ar ?? 1
  // 最初の記事は大きく
  if (index === 0) return { col: 2, row: 2 }
  // 超横長
  if (r > 2.0) return { col: 2, row: 1 }
  // 縦長
  if (r < 0.6) return { col: 1, row: 2 }
  // 定期的に大カード
  if (index % 5 === 3) return { col: 2, row: 1 }
  return { col: 1, row: 1 }
}

// ─── コンポーネント ───────────────────────────────────────

export default function NewsPage() {
  const router = useRouter()

  const [articles,    setArticles]    = useState<NewsArticle[]>([])
  const [loading,     setLoading]     = useState(true)
  const [selected,    setSelected]    = useState<NewsArticle | null>(null)
  const [slide,       setSlide]       = useState(0)
  const [reservation, setReservation] = useState<Reservation | null>(null)
  const [resWarning,  setResWarning]  = useState<{ taskId: string; taskTitle: string; articleId: string } | null>(null)
  const [resMsg,      setResMsg]      = useState('')
  const slideTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── データ取得 ────────────────────────────────────────────
  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data } = await supabase
      .from('news_articles')
      .select('id, title, title_color, thumbnail_url, thumbnail_aspect_ratio, created_at')
      .eq('is_published', true)
      .order('created_at', { ascending: false })

    setArticles(data ?? [])
    setLoading(false)

    // 予約確認
    const { data: resData } = await supabase
      .from('news_task_reservations')
      .select('task_id, task_title, article_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (resData) setReservation(resData)
  }, [router])

  useEffect(() => { load() }, [load])

  // ── スライドショー自動送り ────────────────────────────────
  useEffect(() => {
    const slideNews = articles.slice(0, 6)
    if (slideNews.length < 2) return
    slideTimer.current = setInterval(() => {
      setSlide(s => (s + 1) % slideNews.length)
    }, 4000)
    return () => { if (slideTimer.current) clearInterval(slideTimer.current) }
  }, [articles])

  function goSlide(n: number) {
    setSlide(n)
    if (slideTimer.current) clearInterval(slideTimer.current)
    slideTimer.current = setInterval(() => {
      setSlide(s => (s + 1) % Math.min(articles.length, 6))
    }, 4000)
  }

  // ── 記事詳細読み込み ──────────────────────────────────────
  async function openArticle(id: string) {
    const { data: blocks } = await supabase
      .from('news_blocks')
      .select('id, type, sort_order, content')
      .eq('article_id', id)
      .order('sort_order')

    const article = articles.find(a => a.id === id)
    if (!article) return
    setSelected({ ...article, blocks: blocks ?? [] })
    window.scrollTo(0, 0)
  }

  // ── 課題予約 ──────────────────────────────────────────────
  async function reserveTask(taskId: string, taskTitle: string, articleId: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    if (reservation && reservation.task_id !== taskId) {
      setResWarning({ taskId, taskTitle, articleId })
      return
    }

    await doReserve(user.id, taskId, taskTitle, articleId)
  }

  async function doReserve(userId: string, taskId: string, taskTitle: string, articleId: string) {
    setResWarning(null)
    const { error } = await supabase
      .from('news_task_reservations')
      .upsert({ user_id: userId, task_id: taskId, task_title: taskTitle, article_id: articleId, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' })

    if (!error) {
      setReservation({ task_id: taskId, task_title: taskTitle, article_id: articleId })
      setResMsg('✅ 課題を予約しました！')
      setTimeout(() => setResMsg(''), 3000)
    }
  }

  async function cancelReservation() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('news_task_reservations').delete().eq('user_id', user.id)
    setReservation(null)
    setResMsg('予約をキャンセルしました')
    setTimeout(() => setResMsg(''), 3000)
  }

  // ─── ローディング ──────────────────────────────────────────
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

  const slideArticles = articles.slice(0, 6)
  const currentSlide  = slideArticles[slide] ?? null

  // ─── 記事詳細モーダル ──────────────────────────────────────
  if (selected) {
    return (
      <ArticleDetail
        article={selected}
        reservation={reservation}
        onReserve={reserveTask}
        onCancelReservation={cancelReservation}
        resMsg={resMsg}
        resWarning={resWarning}
        onConfirmOverwrite={async () => {
          const { data: { user } } = await supabase.auth.getUser()
          if (!user || !resWarning) return
          await doReserve(user.id, resWarning.taskId, resWarning.taskTitle, resWarning.articleId)
        }}
        onDismissWarning={() => setResWarning(null)}
        onBack={() => setSelected(null)}
      />
    )
  }

  // ─── メインページ ─────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', background:'var(--green-main)', paddingBottom:40 }}>

      {/* ─ ヘッダー ─ */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'20px 20px 0' }}>
        <button
          className="game-button"
          onClick={() => router.push('/dashboard')}
          style={{ fontSize:13, padding:'6px 14px' }}
        >
          ← ダッシュボード
        </button>
        <h1 className="game-title" style={{ fontSize:26, margin:0 }}>📰 BON-TOPICS</h1>
      </div>

      {/* ─ スライドショー ─ */}
      {slideArticles.length > 0 && (
        <div style={{ padding:'16px 20px 0' }}>
          <div
            style={{
              position:'relative', borderRadius:20, overflow:'hidden',
              border:'5px solid var(--green-dark)',
              boxShadow:'0 8px 0 var(--green-dark), 0 12px 24px rgba(0,0,0,0.25)',
              height: 220, cursor:'pointer',
              background: currentSlide?.thumbnail_url ? 'transparent' : '#c8e89a',
            }}
            onClick={() => currentSlide && openArticle(currentSlide.id)}
          >
            {/* 背景画像 */}
            {currentSlide?.thumbnail_url && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={currentSlide.thumbnail_url}
                alt=""
                style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }}
              />
            )}

            {/* グラデーションオーバーレイ */}
            <div style={{
              position:'absolute', inset:0,
              background:'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.1) 60%, transparent 100%)',
            }} />

            {/* スライドカウンター */}
            <div style={{
              position:'absolute', top:12, right:14,
              background:'rgba(0,0,0,0.45)', color:'#fff',
              borderRadius:20, padding:'3px 10px', fontSize:12,
            }}>
              {slide + 1} / {slideArticles.length}
            </div>

            {/* タイトル */}
            <div style={{ position:'absolute', bottom:32, left:16, right:16 }}>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', marginBottom:4 }}>
                {currentSlide ? formatDate(currentSlide.created_at) : ''}
              </div>
              <div style={{
                fontSize:18, fontWeight:'bold',
                color: currentSlide?.title_color && currentSlide.title_color !== '#1a1a1a'
                  ? currentSlide.title_color : '#ffffff',
                textShadow:'0 2px 8px rgba(0,0,0,0.8)',
                lineHeight:1.3,
              }}>
                {currentSlide?.title ?? ''}
              </div>
            </div>

            {/* ページネーションドット */}
            <div style={{
              position:'absolute', bottom:8, left:0, right:0,
              display:'flex', justifyContent:'center', gap:6,
            }}>
              {slideArticles.map((_, i) => (
                <button
                  key={i}
                  onClick={e => { e.stopPropagation(); goSlide(i) }}
                  style={{
                    width: i === slide ? 20 : 8, height:8,
                    borderRadius:4, border:'none', cursor:'pointer',
                    background: i === slide ? '#fff' : 'rgba(255,255,255,0.5)',
                    transition:'all 0.3s',
                    padding:0,
                  }}
                />
              ))}
            </div>

            {/* 左右矢印 */}
            {slideArticles.length > 1 && (
              <>
                <button
                  onClick={e => { e.stopPropagation(); goSlide((slide - 1 + slideArticles.length) % slideArticles.length) }}
                  style={{
                    position:'absolute', left:8, top:'50%', transform:'translateY(-50%)',
                    background:'rgba(255,255,255,0.25)', border:'none', borderRadius:'50%',
                    width:34, height:34, cursor:'pointer', fontSize:16, color:'#fff',
                    display:'flex', alignItems:'center', justifyContent:'center',
                  }}
                >‹</button>
                <button
                  onClick={e => { e.stopPropagation(); goSlide((slide + 1) % slideArticles.length) }}
                  style={{
                    position:'absolute', right:8, top:'50%', transform:'translateY(-50%)',
                    background:'rgba(255,255,255,0.25)', border:'none', borderRadius:'50%',
                    width:34, height:34, cursor:'pointer', fontSize:16, color:'#fff',
                    display:'flex', alignItems:'center', justifyContent:'center',
                  }}
                >›</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─ 予約バナー ─ */}
      {reservation && (
        <div style={{ margin:'12px 20px 0' }}>
          <div className="game-card" style={{
            padding:'10px 16px', background:'#fff9c4', borderColor:'#d4a800',
            display:'flex', alignItems:'center', gap:10, flexWrap:'wrap',
          }}>
            <span style={{ fontSize:18 }}>📌</span>
            <span style={{ flex:1, fontSize:13, color:'#5a3e00' }}>
              <strong>課題を予約中：</strong>{reservation.task_title}
            </span>
            <button
              className="game-button"
              onClick={cancelReservation}
              style={{ fontSize:12, padding:'4px 12px', background:'#e74c3c' }}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* ─ トースト ─ */}
      {resMsg && (
        <div style={{
          position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)',
          background:'var(--green-dark)', color:'#fff', padding:'10px 20px',
          borderRadius:20, fontSize:14, zIndex:200, boxShadow:'0 4px 16px rgba(0,0,0,0.3)',
        }}>
          {resMsg}
        </div>
      )}

      {/* ─ 記事グリッド ─ */}
      {articles.length === 0 ? (
        <div style={{ textAlign:'center', padding:60, color:'#fff' }}>
          <div style={{ fontSize:48 }}>📭</div>
          <p>まだニュースがありません</p>
        </div>
      ) : (
        <div style={{
          padding:'16px 20px 0',
          display:'grid',
          gridTemplateColumns:'repeat(3, 1fr)',
          gridAutoRows:140,
          gap:12,
        }}>
          {articles.map((article, i) => {
            const { col, row } = getGridSpan(i, article.thumbnail_aspect_ratio)
            return (
              <ArticleCard
                key={article.id}
                article={article}
                colSpan={col}
                rowSpan={row}
                onClick={() => openArticle(article.id)}
              />
            )
          })}
        </div>
      )}

      {/* ─ 予約上書き警告 ─ */}
      {resWarning && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:300,
          display:'flex', alignItems:'center', justifyContent:'center', padding:20,
        }}>
          <div className="game-card" style={{ padding:24, maxWidth:340 }}>
            <div style={{ fontSize:32, textAlign:'center', marginBottom:8 }}>⚠️</div>
            <p style={{ fontWeight:'bold', marginBottom:8, textAlign:'center' }}>すでに課題を予約中です</p>
            <p style={{ fontSize:13, color:'#555', marginBottom:16 }}>
              現在の予約「<strong>{reservation?.task_title}</strong>」をキャンセルして、
              「<strong>{resWarning.taskTitle}</strong>」に上書きしますか？
            </p>
            <div style={{ display:'flex', gap:8 }}>
              <button
                className="game-button"
                onClick={async () => {
                  const { data: { user } } = await supabase.auth.getUser()
                  if (!user || !resWarning) return
                  await doReserve(user.id, resWarning.taskId, resWarning.taskTitle, resWarning.articleId)
                }}
                style={{ flex:1 }}
              >
                上書きする
              </button>
              <button
                className="game-button"
                onClick={() => setResWarning(null)}
                style={{ flex:1, background:'#888' }}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 記事カードコンポーネント ──────────────────────────────

function ArticleCard({
  article, colSpan, rowSpan, onClick,
}: {
  article: NewsArticle
  colSpan: number
  rowSpan: number
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        gridColumn: `span ${colSpan}`,
        gridRow:    `span ${rowSpan}`,
        borderRadius:16, overflow:'hidden',
        border:'4px solid var(--green-dark)',
        boxShadow: hovered
          ? '0 10px 0 var(--green-dark), 0 14px 28px rgba(0,0,0,0.3)'
          : '0 6px 0 var(--green-dark), 0 10px 20px rgba(0,0,0,0.2)',
        cursor:'pointer', position:'relative',
        background: article.thumbnail_url ? 'transparent' : '#c8e89a',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition:'all 0.18s',
      }}
    >
      {/* サムネイル */}
      {article.thumbnail_url && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={article.thumbnail_url}
          alt=""
          style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }}
        />
      )}

      {/* オーバーレイ */}
      <div style={{
        position:'absolute', inset:0,
        background:'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.05) 70%, transparent 100%)',
      }} />

      {/* テキスト */}
      <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'8px 10px' }}>
        <div style={{ fontSize:10, color:'rgba(255,255,255,0.65)', marginBottom:3 }}>
          {formatDate(article.created_at)}
        </div>
        <div style={{
          fontSize: rowSpan >= 2 ? 15 : 12,
          fontWeight:'bold',
          color: article.title_color !== '#1a1a1a' ? article.title_color : '#fff',
          textShadow:'0 2px 6px rgba(0,0,0,0.8)',
          lineHeight:1.3,
          display:'-webkit-box',
          WebkitLineClamp: rowSpan >= 2 ? 4 : 2,
          WebkitBoxOrient:'vertical' as const,
          overflow:'hidden',
        }}>
          {article.title}
        </div>
      </div>
    </div>
  )
}

// ─── 記事詳細コンポーネント ────────────────────────────────

function ArticleDetail({
  article, reservation, onReserve, onCancelReservation, resMsg,
  resWarning, onConfirmOverwrite, onDismissWarning, onBack,
}: {
  article: NewsArticle
  reservation: Reservation | null
  onReserve: (taskId: string, taskTitle: string, articleId: string) => void
  onCancelReservation: () => void
  resMsg: string
  resWarning: { taskId: string; taskTitle: string; articleId: string } | null
  onConfirmOverwrite: () => void
  onDismissWarning: () => void
  onBack: () => void
}) {
  return (
    <div style={{ minHeight:'100vh', background:'var(--green-main)', paddingBottom:60 }}>
      {/* ヘッダー */}
      <div style={{ padding:'20px 20px 0', display:'flex', alignItems:'center', gap:12 }}>
        <button className="game-button" onClick={onBack} style={{ fontSize:13, padding:'6px 14px' }}>
          ← 一覧に戻る
        </button>
        <h1 className="game-title" style={{ fontSize:20, margin:0 }}>📰 BON-TOPICS</h1>
      </div>

      <div style={{ padding:'16px 20px 0', maxWidth:720, margin:'0 auto' }}>
        <div className="game-card" style={{ overflow:'hidden' }}>
          {/* サムネイル */}
          {article.thumbnail_url && (
            <div style={{
              width:'100%',
              paddingTop: article.thumbnail_aspect_ratio
                ? `${(1 / article.thumbnail_aspect_ratio) * 100}%`
                : '50%',
              position:'relative', overflow:'hidden',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={article.thumbnail_url}
                alt=""
                style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }}
              />
            </div>
          )}

          <div style={{ padding:24 }}>
            {/* 日付 */}
            <p style={{ fontSize:12, color:'#888', marginBottom:6 }}>
              {formatDate(article.created_at)}
            </p>

            {/* タイトル */}
            <h2 style={{
              fontSize:24, fontWeight:'bold', marginBottom:20,
              color: article.title_color, lineHeight:1.3,
            }}>
              {article.title}
            </h2>

            {/* ブロック */}
            {(article.blocks ?? [])
              .sort((a, b) => a.sort_order - b.sort_order)
              .map(block => (
                <BlockView
                  key={block.id}
                  block={block}
                  articleId={article.id}
                  reservation={reservation}
                  onReserve={onReserve}
                  onCancelReservation={onCancelReservation}
                />
              ))
            }
          </div>
        </div>
      </div>

      {/* 予約バナー */}
      {reservation && (
        <div style={{ margin:'12px 20px 0', maxWidth:720, marginLeft:'auto', marginRight:'auto' }}>
          <div className="game-card" style={{
            padding:'10px 16px', background:'#fff9c4', borderColor:'#d4a800',
            display:'flex', alignItems:'center', gap:10, flexWrap:'wrap',
          }}>
            <span style={{ fontSize:18 }}>📌</span>
            <span style={{ flex:1, fontSize:13, color:'#5a3e00' }}>
              <strong>課題を予約中：</strong>{reservation.task_title}
            </span>
            <button
              className="game-button"
              onClick={onCancelReservation}
              style={{ fontSize:12, padding:'4px 12px', background:'#e74c3c' }}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* トースト */}
      {resMsg && (
        <div style={{
          position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)',
          background:'var(--green-dark)', color:'#fff', padding:'10px 20px',
          borderRadius:20, fontSize:14, zIndex:200, boxShadow:'0 4px 16px rgba(0,0,0,0.3)',
        }}>
          {resMsg}
        </div>
      )}

      {/* 予約上書き警告 */}
      {resWarning && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:300,
          display:'flex', alignItems:'center', justifyContent:'center', padding:20,
        }}>
          <div className="game-card" style={{ padding:24, maxWidth:340 }}>
            <div style={{ fontSize:32, textAlign:'center', marginBottom:8 }}>⚠️</div>
            <p style={{ fontWeight:'bold', marginBottom:8, textAlign:'center' }}>すでに課題を予約中です</p>
            <p style={{ fontSize:13, color:'#555', marginBottom:16 }}>
              現在の予約「<strong>{reservation?.task_title}</strong>」をキャンセルして、
              「<strong>{resWarning.taskTitle}</strong>」に上書きしますか？
            </p>
            <div style={{ display:'flex', gap:8 }}>
              <button className="game-button" onClick={onConfirmOverwrite} style={{ flex:1 }}>
                上書きする
              </button>
              <button className="game-button" onClick={onDismissWarning} style={{ flex:1, background:'#888' }}>
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── ブロック表示 ─────────────────────────────────────────

function BlockView({
  block, articleId, reservation, onReserve, onCancelReservation,
}: {
  block: NewsBlock
  articleId: string
  reservation: Reservation | null
  onReserve: (taskId: string, taskTitle: string, articleId: string) => void
  onCancelReservation: () => void
}) {
  if (block.type === 'text') {
    const { content = '', is_markdown = false } = block.content
    return (
      <div style={{ marginBottom:20 }}>
        {is_markdown ? (
          <div
            className="markdown-body"
            style={{ color:'#2d2d2d', fontSize:15, lineHeight:1.7 }}
            dangerouslySetInnerHTML={{ __html: marked(content) as string }}
          />
        ) : (
          <p style={{ color:'#2d2d2d', fontSize:15, lineHeight:1.7, whiteSpace:'pre-wrap', margin:0 }}>
            {content}
          </p>
        )}
      </div>
    )
  }

  if (block.type === 'image') {
    const { url = '' } = block.content
    if (!url) return null
    return (
      <div style={{ marginBottom:20, display:'flex', justifyContent:'center' }}>
        <div style={{
          width:180, height:180, borderRadius:'50%', overflow:'hidden',
          border:'5px solid var(--green-dark)',
          boxShadow:'0 4px 12px rgba(0,0,0,0.2)',
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
        </div>
      </div>
    )
  }

  if (block.type === 'link') {
    const { url = '', label = '' } = block.content
    if (!url) return null
    return (
      <div style={{ marginBottom:20 }}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display:'inline-flex', alignItems:'center', gap:8,
            background:'#f0f7e0', border:'3px solid var(--green-dark)',
            borderRadius:12, padding:'10px 16px', textDecoration:'none',
            color:'var(--green-dark)', fontWeight:'bold', fontSize:14,
            transition:'background 0.15s',
          }}
        >
          🔗 {label || url}
        </a>
      </div>
    )
  }

  if (block.type === 'task') {
    const { task_id = '', task_title = '' } = block.content
    if (!task_id) return null

    const isReservedThis = reservation?.task_id === task_id

    return (
      <div style={{ marginBottom:20 }}>
        <div className="game-card" style={{
          padding:'16px 20px',
          background: isReservedThis ? '#e8f5e0' : '#fff',
          borderColor: isReservedThis ? 'var(--green-dark)' : '#ccc',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
            <span style={{ fontSize:20 }}>📋</span>
            <span style={{ fontWeight:'bold', color:'#333', fontSize:14 }}>課題ブロック</span>
            {isReservedThis && (
              <span style={{
                background:'var(--green-main)', color:'#fff',
                borderRadius:20, padding:'2px 10px', fontSize:11,
              }}>予約中</span>
            )}
          </div>
          <p style={{ fontSize:15, fontWeight:'bold', color:'#2d2d2d', margin:'0 0 12px' }}>
            {task_title}
          </p>
          <div style={{ display:'flex', gap:8 }}>
            {!isReservedThis ? (
              <button
                className="game-button"
                onClick={() => onReserve(task_id, task_title, articleId)}
                style={{ fontSize:13 }}
              >
                📌 この課題を予約する
              </button>
            ) : (
              <button
                className="game-button"
                onClick={onCancelReservation}
                style={{ fontSize:13, background:'#e74c3c' }}
              >
                ✕ 予約をキャンセル
              </button>
            )}
          </div>
          <p style={{ fontSize:11, color:'#888', margin:'8px 0 0' }}>
            ※ 予約できる課題は同時に1つまでです。アサインは管理者によって行われます。
          </p>
        </div>
      </div>
    )
  }

  return null
}

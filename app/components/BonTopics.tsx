"use client"

import { Fragment, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import supabase from '../../lib/supabase'
import { marked } from 'marked'
import { Newspaper, Link2, ClipboardList, CheckCircle2, Plus, X } from 'lucide-react'

interface BonTopicBlock {
  id: string
  type: 'text' | 'image' | 'link' | 'assignment'
  sort_order: number
  content: string | null
  is_markdown: boolean
  image_url: string | null
  link_url: string | null
  link_label: string | null
  task_id: string | null
  task?: { id: string; title: string; target_course: string; target_stage: string } | null
}

interface BonTopic {
  id: string
  title: string
  title_color: string
  thumbnail_url: string | null
  thumbnail_aspect_ratio: number
  target_courses: string[]
  is_published: boolean
  created_at: string
  bon_topic_blocks: BonTopicBlock[]
}

interface Props {
  userId: string
  userCourse: string | null
  onAssign?: () => void
}

function cardHeight(ratio: number) {
  if (ratio > 1.4) return 120
  if (ratio < 0.8) return 200
  return 150
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export default function BonTopics({ userId, userCourse, onAssign }: Props) {
  const [topics, setTopics]       = useState<BonTopic[]>([])
  const [loading, setLoading]     = useState(true)
  const [carouselIdx, setCarouselIdx] = useState(0)
  const [selected, setSelected]   = useState<BonTopic | null>(null)
  const [queuedTaskId, setQueuedTaskId] = useState<string | null>(null)
  const [assignMsg, setAssignMsg] = useState<string | null>(null)
  const [assigning, setAssigning] = useState(false)
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null)
  const carouselTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const msgTimer      = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setQueuedTaskId(localStorage.getItem('bonTopicsQueuedTaskId'))
    loadTopics()
  }, [])

  // モーダル開閉時のスクロールバーガタつき防止
  useEffect(() => {
    if (selected) {
      const sw = window.innerWidth - document.documentElement.clientWidth
      document.body.style.paddingRight = `${sw}px`
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.paddingRight = ''
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.paddingRight = ''
      document.body.style.overflow = ''
    }
  }, [selected])

  async function loadTopics() {
    const { data } = await supabase
      .from('bon_topics')
      .select(`*, bon_topic_blocks(*, task:tasks(id, title, target_course, target_stage))`)
      .eq('is_published', true)
      .order('created_at', { ascending: false })
    setTopics(data ?? [])
    setLoading(false)
  }

  // コースフィルタ
  const visible = topics.filter(t =>
    !t.target_courses?.length || (userCourse && t.target_courses.includes(userCourse))
  )
  const carouselItems = visible.slice(0, 6)

  // カルーセル自動スライド
  useEffect(() => {
    if (carouselItems.length <= 1) return
    carouselTimer.current = setInterval(() => {
      setCarouselIdx(i => (i + 1) % carouselItems.length)
    }, 5000)
    return () => { if (carouselTimer.current) clearInterval(carouselTimer.current) }
  }, [carouselItems.length])

  function showMsg(msg: string) {
    setAssignMsg(msg)
    if (msgTimer.current) clearTimeout(msgTimer.current)
    msgTimer.current = setTimeout(() => setAssignMsg(null), 3000)
  }

  async function handleAssign(taskId: string, taskTitle: string) {
    if (queuedTaskId && queuedTaskId !== taskId) {
      const queuedBlock = selected?.bon_topic_blocks.find(b => b.task_id === queuedTaskId)
      const queuedTitle = queuedBlock?.task?.title ?? '別の課題'
      if (!confirm(`「${queuedTitle}」が予約済みです。「${taskTitle}」に上書きしますか？`)) return
    }
    setAssigning(true)
    const { data: sd } = await supabase.auth.getSession()
    const token = sd?.session?.access_token
    if (!token) { showMsg('ログインが必要です'); setAssigning(false); return }

    const res = await fetch('/api/assign-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ taskId }),
    })
    setAssigning(false)
    if (res.ok) {
      localStorage.setItem('bonTopicsQueuedTaskId', taskId)
      setQueuedTaskId(taskId)
      showMsg(`「${taskTitle}」をアサインしました！ダッシュボードに追加されました。`)
      onAssign?.()
    } else {
      showMsg('アサインに失敗しました')
    }
  }

  async function handleCancelAssign(taskId: string) {
    const { data: sd } = await supabase.auth.getSession()
    const token = sd?.session?.access_token
    if (!token) return
    await fetch('/api/assign-task', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ taskId }),
    })
    localStorage.removeItem('bonTopicsQueuedTaskId')
    setQueuedTaskId(null)
    showMsg('アサインをキャンセルしました')
  }

  if (loading) return <div style={{ color: '#a8d870', textAlign: 'center', padding: 40 }}>読み込み中…</div>
  if (visible.length === 0) return (
    <div style={{ color: '#a8d870', textAlign: 'center', padding: 40, fontSize: 14 }}>
      <Newspaper size={28} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.6 }}/>
      まだニュースはありません
    </div>
  )

  return (
    <div style={{ paddingBottom: 32 }}>
      {/* ── カルーセル ── */}
      {carouselItems.length > 0 && (
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 12, marginBottom: 20, border: '3px solid #3d6e00', boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
          <div className="bon-carousel-track" style={{ transform: `translateX(-${carouselIdx * 100}%)` }}>
            {carouselItems.map(t => (
              <div key={t.id} onClick={() => setSelected(t)}
                style={{ minWidth: '100%', height: 220, position: 'relative', cursor: 'pointer', background: '#1a3a00', flexShrink: 0 }}>
                {t.thumbnail_url && (
                  <img src={t.thumbnail_url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.4) 40%, transparent 100%)' }} />
                <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16 }}>
                  <p style={{ color: '#fff', fontWeight: 'bold', fontSize: 18, margin: '0 0 4px', textShadow: '1px 1px 4px rgba(0,0,0,0.8)', lineHeight: 1.3 }}>{t.title}</p>
                  <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: 0 }}>{formatDate(t.created_at)}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ドットインジケーター */}
          <div style={{ position: 'absolute', bottom: 10, right: 12, display: 'flex', gap: 5 }}>
            {carouselItems.map((_, i) => (
              <button key={i} onClick={e => { e.stopPropagation(); setCarouselIdx(i) }}
                style={{ width: 8, height: 8, borderRadius: '50%', border: 'none', background: i === carouselIdx ? '#fff' : 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 0, transition: 'background 0.3s' }} />
            ))}
          </div>
        </div>
      )}

      {/* ── グリッド ── */}
      <div style={{ columns: '2 160px', gap: 12 }}>
        {visible.map(t => (
          <div key={t.id} onClick={() => setSelected(t)}
            style={{ breakInside: 'avoid', marginBottom: 12, borderRadius: 10, overflow: 'hidden', cursor: 'pointer', border: '2px solid #3d6e00', background: '#1a3a00', position: 'relative', height: cardHeight(t.thumbnail_aspect_ratio ?? 1) }}>
            {t.thumbnail_url && (
              <img src={t.thumbnail_url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            )}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.4) 50%, transparent 100%)' }} />
            <div style={{ position: 'absolute', bottom: 8, left: 8, right: 8 }}>
              <p style={{ color: '#fff', fontWeight: 'bold', fontSize: 13, margin: '0 0 2px', lineHeight: 1.2, textShadow: '1px 1px 3px rgba(0,0,0,0.9)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{t.title}</p>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, margin: 0 }}>{formatDate(t.created_at)}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── 記事モーダル ── */}
      {selected && createPortal(
        <>
          {/* 背景オーバーレイ＋クリックで閉じるラッパー */}
          <div
            className="bon-modal-overlay"
            onClick={(e) => { if (e.target === e.currentTarget) { setSelected(null); setZoomedImageUrl(null) } }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 8, paddingBottom: 16 }}>
          <div className="bon-modal" style={{ width: '92vw', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 14, boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}>
            {/* 閉じるボタン */}
            <button onClick={() => { setSelected(null); setZoomedImageUrl(null) }}
              style={{ position: 'sticky', top: 8, right: 8, float: 'right', zIndex: 10, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><X size={14}/></button>

            {/* サムネイル */}
            {selected.thumbnail_url && (
              <img src={selected.thumbnail_url} alt="" className="bon-modal-thumbnail" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', display: 'block' }} />
            )}

            <div className="bon-modal-content" style={{ padding: '16px 18px 24px' }}>
              {/* タイトル */}
              <h2 style={{ color: selected.title_color === '#ffffff' ? '#1a3a00' : selected.title_color, fontSize: 20, fontWeight: 'bold', margin: '0 0 6px', lineHeight: 1.3 }}>{selected.title}</h2>
              <p style={{ color: '#888', fontSize: 12, margin: '0 0 12px' }}>
                {new Date(selected.created_at).toLocaleDateString('ja-JP')}
                {selected.target_courses?.length > 0 && ` ・ ${selected.target_courses.join(' / ')} 向け`}
              </p>
              <hr style={{ border: 'none', borderTop: '1px solid #e8e8e8', margin: '0 0 16px' }} />

              {/* ブロック */}
              {assignMsg && (
                <div style={{ background: '#e8f5e9', border: '1px solid #6aac14', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#1a6e00', marginBottom: 12 }}>
                  {assignMsg}
                </div>
              )}

              {[...selected.bon_topic_blocks].sort((a, b) => a.sort_order - b.sort_order).map(block => (
                <Fragment key={block.id}>
                  {block.type === 'text' && (
                    <div style={{ marginBottom: 16, fontSize: 14, lineHeight: 1.7, color: '#222' }}>
                      {block.is_markdown && block.content
                        ? <div dangerouslySetInnerHTML={{ __html: marked.parse(block.content) as string }} />
                        : <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{block.content}</p>
                      }
                    </div>
                  )}

                  {block.type === 'image' && block.image_url && (
                    <div style={{ marginBottom: 16 }}>
                      <img src={block.image_url} alt=""
                        onClick={() => setZoomedImageUrl(block.image_url!)}
                        style={{ width: '100%', borderRadius: 8, objectFit: 'cover', display: 'block', cursor: 'zoom-in' }} />
                    </div>
                  )}

                  {block.type === 'link' && block.link_url && (
                    <div style={{ marginBottom: 16 }}>
                      <a href={block.link_url} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 16px', background: '#3d6e00', color: '#fff', borderRadius: 8, fontSize: 14, fontWeight: 'bold', textDecoration: 'none' }}>
                        <Link2 size={14}/>{block.link_label || block.link_url}
                      </a>
                    </div>
                  )}

                  {block.type === 'assignment' && block.task && (
                    <div style={{ marginBottom: 16, border: '2px solid #3d6e00', borderRadius: 10, padding: '12px 14px', background: '#f0fae0' }}>
                      <p style={{ fontSize: 11, color: '#6aac14', fontWeight: 'bold', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 4 }}><ClipboardList size={11}/>課題</p>
                      <p style={{ fontSize: 15, fontWeight: 'bold', color: '#1a3a00', margin: '0 0 4px' }}>{block.task.title}</p>
                      <p style={{ fontSize: 11, color: '#6aac14', margin: '0 0 10px' }}>
                        {block.task.target_course || '全コース'} / {block.task.target_stage || '全ステージ'}
                      </p>
                      {queuedTaskId === block.task_id ? (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontSize: 12, color: '#1a6e00', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: 3 }}><CheckCircle2 size={12}/>アサイン済み</span>
                          <button onClick={() => handleCancelAssign(block.task_id!)}
                            style={{ fontSize: 12, padding: '4px 12px', border: '1px solid #e74c3c', borderRadius: 6, background: '#fff', color: '#e74c3c', cursor: 'pointer' }}>
                            キャンセル
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => handleAssign(block.task_id!, block.task!.title)} disabled={assigning}
                          style={{ width: '100%', padding: '8px', background: '#3d6e00', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 'bold', fontSize: 14, cursor: 'pointer' }}>
                          {assigning ? 'アサイン中…' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Plus size={14}/>この課題をアサインする</span>}
                        </button>
                      )}
                    </div>
                  )}
                </Fragment>
              ))}
            </div>
          </div>
          </div>
        </>,
        document.body
      )}

      {/* ── 画像ズーム ── */}
      {zoomedImageUrl && createPortal(
        <div onClick={() => setZoomedImageUrl(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 210, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
          <img src={zoomedImageUrl} alt="" style={{ maxWidth: '95vw', maxHeight: '90vh', borderRadius: 8, objectFit: 'contain' }} />
        </div>,
        document.body
      )}
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import supabase from '../../../lib/supabase'
import { marked } from 'marked'
import {
  Trophy, Theater, Wrench, HelpCircle, ChevronLeft, Film, Image,
  Send, Heart, HeartOff, EyeOff, User, Medal, Calendar, Star,
} from 'lucide-react'

type EventType = 'bontest' | 'presentation' | 'workshop' | 'other'
type EventStatus = 'draft' | 'open' | 'judging' | 'closed'

interface ClubEvent {
  id: string
  title: string
  description: string | null
  description_is_markdown: boolean
  event_type: EventType
  status: EventStatus
  starts_at: string
  ends_at: string
  submission_deadline: string | null
  theme: string | null
  target_course: string | null
  max_submissions: number
  allow_anonymous: boolean
  allow_public_vote: boolean
  cover_image_url: string | null
}

interface Submission {
  id: string
  user_id: string
  title: string
  description: string | null
  media_url: string | null
  image_urls: string[] | null
  is_anonymous: boolean
  submitted_at: string
  rank: number | null
  username?: string | null
  vote_count?: number
  avg_score?: number
  has_my_vote?: boolean
}

const TYPE_LABELS: Record<EventType, string> = {
  bontest: 'BONTEST',
  presentation: '作品発表会',
  workshop: 'ワークショップ',
  other: 'その他',
}

const TYPE_ICONS: Record<EventType, React.ComponentType<{ size?: number; color?: string }>> = {
  bontest: Trophy,
  presentation: Theater,
  workshop: Wrench,
  other: HelpCircle,
}

const TYPE_COLORS: Record<EventType, string> = {
  bontest: '#e67e22',
  presentation: '#9b59b6',
  workshop: '#3498db',
  other: '#7f8c8d',
}

const STATUS_LABELS: Record<EventStatus, string> = {
  draft: '下書き',
  open: '開催中',
  judging: '審査中',
  closed: '終了',
}

const STATUS_COLORS: Record<EventStatus, string> = {
  draft: '#95a5a6',
  open: '#6aac14',
  judging: '#e67e22',
  closed: '#7f8c8d',
}

function fmtDate(iso: string | null) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function countdown(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return '締め切り済み'
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  if (days > 0) return `あと${days}日${hours}時間`
  return `あと${hours}時間`
}

export default function EventDetailPage() {
  const router = useRouter()
  const params = useParams()
  const eventId = params?.id as string

  const [loading, setLoading] = useState(true)
  const [event, setEvent] = useState<ClubEvent | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [myUserId, setMyUserId] = useState('')
  const [mySubmission, setMySubmission] = useState<Submission | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // submission form
  const [subTitle, setSubTitle] = useState('')
  const [subDescription, setSubDescription] = useState('')
  const [subMediaUrl, setSubMediaUrl] = useState('')
  const [subImageUrls, setSubImageUrls] = useState(['', '', ''])
  const [subAnonymous, setSubAnonymous] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [voting, setVoting] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setMyUserId(session.user.id)

      const { data: ev } = await supabase.from('events').select('*').eq('id', eventId).single()
      if (!ev || ev.status === 'draft') { router.push('/events'); return }
      setEvent(ev)

      await loadSubmissions(session.user.id, ev.allow_public_vote)
      setLoading(false)
    }
    init()
  }, [router, eventId])

  async function loadSubmissions(userId: string, allowVote: boolean) {
    const { data: subs } = await supabase
      .from('event_submissions')
      .select('*, profiles(username)')
      .eq('event_id', eventId)
      .order('submitted_at', { ascending: true })

    if (!subs) return

    const { data: scores } = await supabase.from('event_scores').select('submission_id, creativity_score, technique_score, theme_score').in('submission_id', subs.map(s => s.id))
    let votes: { submission_id: string; user_id: string }[] = []
    if (allowVote) {
      const { data: v } = await supabase.from('event_votes').select('submission_id, user_id').in('submission_id', subs.map(s => s.id))
      votes = v ?? []
    }

    const enriched: Submission[] = subs.map(s => {
      const subScores = (scores ?? []).filter(sc => sc.submission_id === s.id)
      const avgScore = subScores.length > 0
        ? subScores.reduce((acc, sc) => acc + (sc.creativity_score ?? 0) + (sc.technique_score ?? 0) + (sc.theme_score ?? 0), 0) / subScores.length
        : 0
      const voteCount = votes.filter(v => v.submission_id === s.id).length
      const hasMyVote = votes.some(v => v.submission_id === s.id && v.user_id === userId)
      return {
        ...s,
        username: (s.profiles as { username: string | null } | null)?.username ?? null,
        avg_score: avgScore,
        vote_count: voteCount,
        has_my_vote: hasMyVote,
      }
    })

    if (event?.status === 'closed') {
      enriched.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
    }

    const mySub = enriched.find(s => s.user_id === userId) ?? null
    setMySubmission(mySub)
    setSubmissions(enriched)

    if (mySub) {
      setSubTitle(mySub.title)
      setSubDescription(mySub.description ?? '')
      setSubMediaUrl(mySub.media_url ?? '')
      const imgs = [...(mySub.image_urls ?? []), '', '', ''].slice(0, 3)
      setSubImageUrls(imgs)
      setSubAnonymous(mySub.is_anonymous)
    }
  }

  async function handleSubmit() {
    if (!subTitle.trim()) { setError('タイトルを入力してください'); return }
    setSubmitting(true)
    setError(null)
    const imageUrls = subImageUrls.filter(u => u.trim() !== '')
    const payload = {
      event_id: eventId,
      user_id: myUserId,
      title: subTitle.trim(),
      description: subDescription.trim() || null,
      media_url: subMediaUrl.trim() || null,
      image_urls: imageUrls.length > 0 ? imageUrls : null,
      is_anonymous: subAnonymous,
      submitted_at: new Date().toISOString(),
    }
    const { error: err } = await supabase.from('event_submissions').upsert(payload, { onConflict: 'event_id,user_id' })
    setSubmitting(false)
    if (err) { setError(err.message); return }

    if (!mySubmission) {
      await supabase.rpc('award_points', { p_user_id: myUserId, p_action_key: 'event_participate' })
    }

    setSuccess('作品を応募しました！')
    loadSubmissions(myUserId, event?.allow_public_vote ?? false)
    setTimeout(() => setSuccess(null), 3000)
  }

  async function handleVote(subId: string, hasMyVote: boolean) {
    setVoting(subId)
    if (hasMyVote) {
      await supabase.from('event_votes').delete().eq('submission_id', subId).eq('user_id', myUserId)
    } else {
      await supabase.from('event_votes').insert({ submission_id: subId, user_id: myUserId })
    }
    setVoting(null)
    loadSubmissions(myUserId, true)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#3d6e00', fontFamily: 'Mantou Sans, Arial' }}>読み込み中...</div>
  if (!event) return null

  const TypeIcon = TYPE_ICONS[event.event_type]
  const canSubmit = event.status === 'open'
  const showVote = event.allow_public_vote && event.status === 'open'
  const showGallery = event.status === 'judging' || event.status === 'closed'
  const descHtml = event.description_is_markdown && event.description ? marked.parse(event.description) as string : null

  return (
    <div style={{ minHeight: '100vh', background: '#f0f7e8', fontFamily: 'Mantou Sans, Arial Rounded MT Bold, Arial' }}>
      {/* カバー */}
      {event.cover_image_url ? (
        <div style={{ width: '100%', height: 260, backgroundImage: `url(${event.cover_image_url})`, backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.6))' }} />
        </div>
      ) : (
        <div style={{ width: '100%', height: 160, background: `linear-gradient(135deg, ${TYPE_COLORS[event.event_type]}33, ${TYPE_COLORS[event.event_type]}66)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <TypeIcon size={60} color={TYPE_COLORS[event.event_type]} />
        </div>
      )}

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px' }}>
        {/* 戻るボタン */}
        <button onClick={() => router.push('/events')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3d6e00', fontSize: 14, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16 }}>
          <ChevronLeft size={16} /> イベント一覧
        </button>

        {/* イベントタイトル・情報 */}
        <div style={{ background: '#fff', border: '3px solid #c8e6a0', borderRadius: 12, padding: 24, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <span style={{ background: TYPE_COLORS[event.event_type], color: '#fff', fontSize: 12, borderRadius: 4, padding: '3px 8px', fontWeight: 'bold' }}>{TYPE_LABELS[event.event_type]}</span>
            <span style={{ background: STATUS_COLORS[event.status] + '22', color: STATUS_COLORS[event.status], fontSize: 12, borderRadius: 4, padding: '3px 8px', border: `1px solid ${STATUS_COLORS[event.status]}`, fontWeight: 'bold' }}>{STATUS_LABELS[event.status]}</span>
            {event.target_course && <span style={{ fontSize: 12, background: '#e8f4ff', color: '#2980b9', borderRadius: 4, padding: '3px 8px' }}>{event.target_course}コース</span>}
          </div>
          <h1 style={{ margin: '0 0 8px', fontSize: 26, color: '#3d6e00' }}>{event.title}</h1>
          {event.theme && (
            <div style={{ background: '#fff9e6', border: '2px solid #f1c40f', borderRadius: 8, padding: '10px 16px', marginBottom: 12, display: 'inline-block' }}>
              <span style={{ fontSize: 14, color: '#856404', fontWeight: 'bold' }}>テーマ: 「{event.theme}」</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#888', flexWrap: 'wrap', marginBottom: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Calendar size={13} />{fmtDate(event.starts_at)} 〜 {fmtDate(event.ends_at)}</span>
            {event.submission_deadline && (
              <span style={{ color: canSubmit ? '#e67e22' : '#888' }}>
                応募締切: {canSubmit ? countdown(event.submission_deadline) : fmtDate(event.submission_deadline)}
              </span>
            )}
            <span>{submissions.length}件の応募</span>
          </div>
          {descHtml ? (
            <div className="markdown-body" dangerouslySetInnerHTML={{ __html: descHtml }} style={{ fontSize: 14, color: '#444', lineHeight: 1.7 }} />
          ) : event.description ? (
            <p style={{ margin: 0, fontSize: 14, color: '#444', lineHeight: 1.7 }}>{event.description}</p>
          ) : null}
        </div>

        {/* メッセージ */}
        {error && <div style={{ background: '#fde8e8', border: '2px solid #e74c3c', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#c0392b' }}>{error}</div>}
        {success && <div style={{ background: '#d4f0a0', border: '2px solid #6aac14', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#3d6e00' }}>{success}</div>}

        {/* 応募フォーム */}
        {canSubmit && (
          <div style={{ background: '#fff', border: '3px solid #6aac14', borderRadius: 12, padding: 24, marginBottom: 20 }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 18, color: '#3d6e00', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Send size={18} color="#6aac14" />
              {mySubmission ? '応募内容を編集する' : '作品を応募する'}
            </h2>

            <div style={{ marginBottom: 14 }}>
              <label className="game-label">作品タイトル *</label>
              <input className="game-input" value={subTitle} onChange={e => setSubTitle(e.target.value)} placeholder="作品のタイトル" style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label className="game-label">作品説明</label>
              <textarea className="game-input" rows={3} value={subDescription} onChange={e => setSubDescription(e.target.value)} placeholder="制作について" style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label className="game-label"><Film size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />動画 URL</label>
              <input className="game-input" value={subMediaUrl} onChange={e => setSubMediaUrl(e.target.value)} placeholder="https://..." style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label className="game-label"><Image size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />画像 URL（最大3枚）</label>
              {subImageUrls.map((url, i) => (
                <input
                  key={i}
                  className="game-input"
                  value={url}
                  onChange={e => setSubImageUrls(prev => { const n = [...prev]; n[i] = e.target.value; return n })}
                  placeholder={`画像 ${i + 1} https://...`}
                  style={{ width: '100%', boxSizing: 'border-box', marginBottom: i < 2 ? 6 : 0 }}
                />
              ))}
            </div>

            {event.allow_anonymous && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <input type="checkbox" id="anon" checked={subAnonymous} onChange={e => setSubAnonymous(e.target.checked)} />
                <label htmlFor="anon" style={{ fontSize: 14, color: '#3d6e00', cursor: 'pointer' }}>匿名で応募する</label>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{ background: submitting ? '#aaa' : '#6aac14', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 28px', cursor: submitting ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 15, fontWeight: 'bold', boxShadow: submitting ? 'none' : '0 3px 0 #3d6e00' }}
            >
              {submitting ? '送信中...' : (mySubmission ? '更新する' : '応募する')}
            </button>
          </div>
        )}

        {/* ギャラリー / 投票セクション */}
        {(showGallery || showVote || submissions.length > 0) && (
          <div>
            <h2 style={{ fontSize: 18, color: '#3d6e00', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              {event.status === 'closed' ? <><Medal size={18} color="#e67e22" /> 結果発表</> : <><Star size={18} color="#6aac14" /> 応募作品一覧</>}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
              {submissions.map((sub, idx) => (
                <div key={sub.id} style={{ background: '#fff', border: `3px solid ${sub.rank === 1 ? '#f1c40f' : sub.rank === 2 ? '#bdc3c7' : sub.rank === 3 ? '#cd6f00' : '#c8e6a0'}`, borderRadius: 12, overflow: 'hidden' }}>
                  {sub.image_urls && sub.image_urls[0] && (
                    <img src={sub.image_urls[0]} alt={sub.title} style={{ width: '100%', height: 160, objectFit: 'cover' }} />
                  )}
                  <div style={{ padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                      {sub.rank && (
                        <span style={{ background: sub.rank === 1 ? '#f1c40f' : sub.rank === 2 ? '#bdc3c7' : '#cd6f00', color: '#fff', borderRadius: 6, padding: '3px 10px', fontSize: 13, fontWeight: 'bold' }}>
                          {sub.rank}位 🏆
                        </span>
                      )}
                      {!sub.rank && (
                        <span style={{ background: '#e8e8e8', color: '#888', borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>#{idx + 1}</span>
                      )}
                      <strong style={{ fontSize: 15, color: '#3d6e00' }}>{sub.title}</strong>
                    </div>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {sub.is_anonymous ? (
                        <><EyeOff size={12} /> 匿名</>
                      ) : (
                        <><User size={12} /> {sub.username ?? '不明'}</>
                      )}
                    </div>
                    {sub.description && <p style={{ margin: '0 0 10px', fontSize: 13, color: '#555', lineHeight: 1.5 }}>{sub.description}</p>}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                      {sub.media_url && (
                        <a href={sub.media_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#3498db', textDecoration: 'none', border: '1px solid #3498db', borderRadius: 6, padding: '4px 10px' }}>
                          <Film size={12} /> 動画
                        </a>
                      )}
                      {sub.image_urls && sub.image_urls.slice(1).filter(u => u).map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noreferrer">
                          <img src={url} alt="" style={{ width: 50, height: 40, objectFit: 'cover', borderRadius: 4, border: '1px solid #c8e6a0' }} />
                        </a>
                      ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      {event.status === 'closed' && sub.avg_score !== undefined && sub.avg_score > 0 && (
                        <span style={{ fontSize: 12, color: '#e67e22' }}>スコア: {sub.avg_score.toFixed(1)}</span>
                      )}
                      {showVote && sub.user_id !== myUserId && (
                        <button
                          onClick={() => handleVote(sub.id, sub.has_my_vote ?? false)}
                          disabled={voting === sub.id}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, background: sub.has_my_vote ? '#e74c3c' : '#fff', color: sub.has_my_vote ? '#fff' : '#e74c3c', border: '2px solid #e74c3c', borderRadius: 20, padding: '5px 12px', cursor: voting === sub.id ? 'default' : 'pointer', fontSize: 13, fontFamily: 'inherit', transition: 'all 0.15s', marginLeft: 'auto' }}
                        >
                          {sub.has_my_vote ? <Heart size={14} fill="#fff" /> : <Heart size={14} />}
                          {sub.vote_count ?? 0}
                        </button>
                      )}
                      {event.allow_public_vote && !showVote && (
                        <span style={{ fontSize: 12, color: '#e74c3c', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Heart size={12} fill="#e74c3c" /> {sub.vote_count ?? 0}票
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

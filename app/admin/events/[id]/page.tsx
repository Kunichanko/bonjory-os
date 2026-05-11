'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import supabase from '../../../../lib/supabase'
import { getEffectivePermissions, PermissionKey } from '../../../../lib/permissions'
import {
  Trophy, Star, Check, X, ChevronLeft, Image, Film, User, EyeOff, Medal,
} from 'lucide-react'

type EventStatus = 'draft' | 'open' | 'judging' | 'closed'

interface ClubEvent {
  id: string
  title: string
  event_type: string
  status: EventStatus
  starts_at: string
  ends_at: string
  submission_deadline: string | null
  theme: string | null
  allow_public_vote: boolean
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
  total_score?: number
  my_score?: EventScore | null
}

interface EventScore {
  id?: string
  submission_id: string
  judge_id: string
  creativity_score: number | null
  technique_score: number | null
  theme_score: number | null
  comment: string
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

const RANK_ACTIONS: Record<number, string> = {
  1: 'event_win_1st',
  2: 'event_win_2nd',
  3: 'event_win_3rd',
}

export default function AdminEventDetailPage() {
  const router = useRouter()
  const params = useParams()
  const eventId = params?.id as string

  const [loading, setLoading] = useState(true)
  const [event, setEvent] = useState<ClubEvent | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [myUserId, setMyUserId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // score editing
  const [scoreEdits, setScoreEdits] = useState<Record<string, { creativity: string; technique: string; theme: string; comment: string }>>({})
  const [savingScore, setSavingScore] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setMyUserId(session.user.id)
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
      const perms = await getEffectivePermissions(session.user.id)
      if (profile?.role !== 'admin' && !perms.event_management) {
        router.push('/dashboard'); return
      }

      const { data: ev } = await supabase.from('events').select('*').eq('id', eventId).single()
      if (!ev) { router.push('/admin/events'); return }
      setEvent(ev)

      await loadSubmissions(session.user.id, ev.allow_public_vote)
      setLoading(false)
    }
    init()
  }, [router, eventId])

  async function loadSubmissions(judgeId: string, allowVote: boolean) {
    const { data: subs } = await supabase
      .from('event_submissions')
      .select('*, profiles(username)')
      .eq('event_id', eventId)
      .order('submitted_at', { ascending: true })

    if (!subs) return

    const { data: scores } = await supabase.from('event_scores').select('*').in('submission_id', subs.map(s => s.id))
    const { data: votes } = allowVote
      ? await supabase.from('event_votes').select('submission_id').in('submission_id', subs.map(s => s.id))
      : { data: [] }

    const enriched: Submission[] = subs.map(s => {
      const subScores = (scores ?? []).filter(sc => sc.submission_id === s.id)
      const myScore = subScores.find(sc => sc.judge_id === judgeId) ?? null
      const total = subScores.length > 0
        ? subScores.reduce((acc, sc) => acc + (sc.creativity_score ?? 0) + (sc.technique_score ?? 0) + (sc.theme_score ?? 0), 0) / subScores.length
        : 0
      const voteCount = (votes ?? []).filter(v => v.submission_id === s.id).length
      return {
        ...s,
        username: (s.profiles as { username: string | null } | null)?.username ?? null,
        total_score: total,
        vote_count: voteCount,
        my_score: myScore,
      }
    })

    // sort by total_score desc
    enriched.sort((a, b) => (b.total_score ?? 0) - (a.total_score ?? 0))
    setSubmissions(enriched)

    // init score edits
    const edits: Record<string, { creativity: string; technique: string; theme: string; comment: string }> = {}
    enriched.forEach(s => {
      edits[s.id] = {
        creativity: s.my_score?.creativity_score?.toString() ?? '',
        technique: s.my_score?.technique_score?.toString() ?? '',
        theme: s.my_score?.theme_score?.toString() ?? '',
        comment: s.my_score?.comment ?? '',
      }
    })
    setScoreEdits(edits)
  }

  async function handleSaveScore(subId: string) {
    const ed = scoreEdits[subId]
    setSavingScore(subId)
    setError(null)
    const payload = {
      submission_id: subId,
      judge_id: myUserId,
      creativity_score: ed.creativity !== '' ? Number(ed.creativity) : null,
      technique_score: ed.technique !== '' ? Number(ed.technique) : null,
      theme_score: ed.theme !== '' ? Number(ed.theme) : null,
      comment: ed.comment.trim() || null,
    }
    const { error: err } = await supabase.from('event_scores').upsert(payload, { onConflict: 'submission_id,judge_id' })
    setSavingScore(null)
    if (err) { setError(err.message); return }
    setSuccess('スコアを保存しました')
    await loadSubmissions(myUserId, event?.allow_public_vote ?? false)
    setTimeout(() => setSuccess(null), 2500)
  }

  async function handleFinalizeRanks() {
    if (!confirm('順位を確定してポイントを付与しますか？この操作は取り消せません。')) return
    setSaving(true)
    setError(null)
    const ranked = [...submissions].filter(s => (s.total_score ?? 0) > 0)
    ranked.sort((a, b) => (b.total_score ?? 0) - (a.total_score ?? 0))

    const participationSubs = submissions.filter(s => s.rank === null)

    for (let i = 0; i < ranked.length; i++) {
      const sub = ranked[i]
      const rank = i + 1
      await supabase.from('event_submissions').update({ rank }).eq('id', sub.id)
      if (RANK_ACTIONS[rank]) {
        await supabase.rpc('award_points', { p_user_id: sub.user_id, p_action_key: RANK_ACTIONS[rank] })
      }
    }

    for (const sub of participationSubs) {
      await supabase.rpc('award_points', { p_user_id: sub.user_id, p_action_key: 'event_participate' })
    }

    await supabase.from('events').update({ status: 'closed' }).eq('id', eventId)
    setEvent(prev => prev ? { ...prev, status: 'closed' } : prev)
    setSaving(false)
    setSuccess('順位を確定し、ポイントを付与しました！')
    await loadSubmissions(myUserId, event?.allow_public_vote ?? false)
    setTimeout(() => setSuccess(null), 4000)
  }

  async function handleStatusChange(newStatus: EventStatus) {
    const { error: err } = await supabase.from('events').update({ status: newStatus }).eq('id', eventId)
    if (err) { setError(err.message); return }
    setEvent(prev => prev ? { ...prev, status: newStatus } : prev)
    setSuccess(`ステータスを「${STATUS_LABELS[newStatus]}」に変更しました`)
    setTimeout(() => setSuccess(null), 3000)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#3d6e00', fontFamily: 'Mantou Sans, Arial' }}>読み込み中...</div>
  if (!event) return null

  return (
    <div style={{ minHeight: '100vh', background: '#f0f7e8', fontFamily: 'Mantou Sans, Arial Rounded MT Bold, Arial', padding: '24px 16px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* ヘッダー */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <button onClick={() => router.push('/admin/events')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3d6e00', fontSize: 14, display: 'flex', alignItems: 'center', gap: 4 }}>
            <ChevronLeft size={16} /> イベント管理
          </button>
          <Trophy size={24} color="#e67e22" />
          <h1 style={{ margin: 0, fontSize: 22, color: '#3d6e00', flex: 1 }}>{event.title}</h1>
          <span style={{ background: STATUS_COLORS[event.status], color: '#fff', borderRadius: 6, padding: '4px 10px', fontSize: 13, fontWeight: 'bold' }}>
            {STATUS_LABELS[event.status]}
          </span>
        </div>

        {/* メッセージ */}
        {error && <div style={{ background: '#fde8e8', border: '2px solid #e74c3c', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#c0392b', display: 'flex', alignItems: 'center', gap: 8 }}><X size={16} /> {error}</div>}
        {success && <div style={{ background: '#d4f0a0', border: '2px solid #6aac14', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#3d6e00', display: 'flex', alignItems: 'center', gap: 8 }}><Check size={16} /> {success}</div>}

        {/* イベント情報・ステータス操作 */}
        <div style={{ background: '#fff', border: '3px solid #c8e6a0', borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 14, color: '#555', marginBottom: 12 }}>
            {event.theme && <span style={{ marginRight: 16 }}>テーマ: <strong>{event.theme}</strong></span>}
            <span style={{ marginRight: 16 }}>開催: {fmtDate(event.starts_at)} 〜 {fmtDate(event.ends_at)}</span>
            {event.submission_deadline && <span>締切: {fmtDate(event.submission_deadline)}</span>}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {(['draft', 'open', 'judging', 'closed'] as EventStatus[]).map(s => (
              <button
                key={s}
                onClick={() => handleStatusChange(s)}
                disabled={event.status === s}
                style={{
                  background: event.status === s ? STATUS_COLORS[s] : STATUS_COLORS[s] + '22',
                  color: event.status === s ? '#fff' : STATUS_COLORS[s],
                  border: `2px solid ${STATUS_COLORS[s]}`,
                  borderRadius: 6, padding: '6px 14px', cursor: event.status === s ? 'default' : 'pointer',
                  fontFamily: 'inherit', fontSize: 13, fontWeight: 'bold',
                }}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
            {event.status === 'judging' && (
              <button
                onClick={handleFinalizeRanks}
                disabled={saving}
                style={{ background: '#e67e22', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 16px', cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 'bold', boxShadow: '0 3px 0 #c0392b', marginLeft: 'auto' }}
              >
                <Medal size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                {saving ? '確定中...' : '順位を確定してポイント付与'}
              </button>
            )}
          </div>
        </div>

        {/* 応募作品一覧 */}
        <h2 style={{ color: '#3d6e00', fontSize: 18, marginBottom: 16 }}>応募作品 ({submissions.length}件)</h2>

        {submissions.length === 0 ? (
          <div style={{ background: '#fff', border: '3px solid #c8e6a0', borderRadius: 12, padding: 40, textAlign: 'center', color: '#888' }}>
            まだ応募はありません
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {submissions.map((sub, idx) => {
              const ed = scoreEdits[sub.id] ?? { creativity: '', technique: '', theme: '', comment: '' }
              const totalPreview = [ed.creativity, ed.technique, ed.theme].filter(v => v !== '').reduce((acc, v) => acc + Number(v), 0)
              return (
                <div key={sub.id} style={{ background: '#fff', border: '3px solid #c8e6a0', borderRadius: 12, padding: 20 }}>
                  {/* 作品ヘッダー */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                    {sub.rank && (
                      <span style={{ background: sub.rank === 1 ? '#f1c40f' : sub.rank === 2 ? '#bdc3c7' : '#cd6f00', color: sub.rank <= 3 ? '#fff' : '#555', borderRadius: 6, padding: '3px 10px', fontSize: 13, fontWeight: 'bold' }}>
                        {sub.rank}位
                      </span>
                    )}
                    {!sub.rank && (
                      <span style={{ background: '#e8e8e8', color: '#888', borderRadius: 6, padding: '3px 10px', fontSize: 13 }}>
                        #{idx + 1}
                      </span>
                    )}
                    <strong style={{ fontSize: 16, color: '#3d6e00' }}>{sub.title}</strong>
                    {sub.is_anonymous ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#888' }}><EyeOff size={12} /> 匿名</span>
                    ) : (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#555' }}><User size={12} /> {sub.username ?? '不明'}</span>
                    )}
                    <span style={{ marginLeft: 'auto', fontSize: 13, color: '#e67e22', fontWeight: 'bold' }}>
                      合計スコア: {sub.total_score?.toFixed(1) ?? 0}
                    </span>
                    {event.allow_public_vote && (
                      <span style={{ fontSize: 12, color: '#3498db' }}>❤️ {sub.vote_count ?? 0}票</span>
                    )}
                  </div>

                  {/* メディア */}
                  <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                    {sub.media_url && (
                      <a href={sub.media_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#3498db', textDecoration: 'none', border: '1px solid #3498db', borderRadius: 6, padding: '4px 10px' }}>
                        <Film size={14} /> 動画を見る
                      </a>
                    )}
                    {sub.image_urls && sub.image_urls.length > 0 && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        {sub.image_urls.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noreferrer">
                            <img src={url} alt={`画像${i + 1}`} style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 6, border: '1px solid #c8e6a0' }} />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  {sub.description && (
                    <p style={{ margin: '0 0 12px', fontSize: 13, color: '#555', lineHeight: 1.6 }}>{sub.description}</p>
                  )}

                  {/* スコア入力 */}
                  <div style={{ background: '#f8fef0', border: '2px dashed #a8d870', borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 'bold', color: '#3d6e00', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Star size={14} /> あなたのスコア入力（各0〜10点）
                      <span style={{ marginLeft: 'auto', color: '#e67e22' }}>入力合計: {totalPreview}点</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                      {[
                        { key: 'creativity', label: 'クリエイティビティ' },
                        { key: 'technique', label: '技術力' },
                        { key: 'theme', label: 'テーマ適合' },
                      ].map(({ key, label }) => (
                        <div key={key}>
                          <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}>{label}</label>
                          <input
                            type="number" min={0} max={10}
                            value={ed[key as keyof typeof ed]}
                            onChange={e => setScoreEdits(prev => ({ ...prev, [sub.id]: { ...prev[sub.id], [key]: e.target.value } }))}
                            style={{ width: '100%', boxSizing: 'border-box', border: '2px solid #6aac14', borderRadius: 6, padding: '6px 8px', fontFamily: 'inherit', fontSize: 14 }}
                          />
                        </div>
                      ))}
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}>コメント（任意）</label>
                      <input
                        type="text"
                        value={ed.comment}
                        onChange={e => setScoreEdits(prev => ({ ...prev, [sub.id]: { ...prev[sub.id], comment: e.target.value } }))}
                        style={{ width: '100%', boxSizing: 'border-box', border: '2px solid #6aac14', borderRadius: 6, padding: '6px 8px', fontFamily: 'inherit', fontSize: 13 }}
                        placeholder="審査コメント"
                      />
                    </div>
                    <button
                      onClick={() => handleSaveScore(sub.id)}
                      disabled={savingScore === sub.id}
                      style={{ background: savingScore === sub.id ? '#aaa' : '#6aac14', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 18px', cursor: savingScore === sub.id ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 'bold', boxShadow: savingScore === sub.id ? 'none' : '0 2px 0 #3d6e00' }}
                    >
                      {savingScore === sub.id ? '保存中...' : 'スコアを保存'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

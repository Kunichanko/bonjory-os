'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../lib/supabase'
import {
  PartyPopper, Trophy, Theater, Wrench, HelpCircle,
  Calendar, Clock, ChevronRight, Lightbulb,
} from 'lucide-react'

type EventType = 'bontest' | 'presentation' | 'workshop' | 'other'
type EventStatus = 'open' | 'judging' | 'closed'

interface ClubEvent {
  id: string
  title: string
  description: string | null
  event_type: EventType
  status: EventStatus
  starts_at: string
  ends_at: string
  submission_deadline: string | null
  theme: string | null
  target_course: string | null
  allow_public_vote: boolean
  cover_image_url: string | null
  created_at: string
  submission_count?: number
  my_submission?: boolean
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
  open: '開催中',
  judging: '審査中',
  closed: '終了',
}

const STATUS_COLORS: Record<EventStatus, string> = {
  open: '#6aac14',
  judging: '#e67e22',
  closed: '#7f8c8d',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
}

function countdown(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return '終了'
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  if (days > 0) return `あと${days}日${hours}時間`
  return `あと${hours}時間`
}

export default function EventsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<ClubEvent[]>([])
  const [filterType, setFilterType] = useState<EventType | ''>('')
  const [filterStatus, setFilterStatus] = useState<EventStatus | ''>('')
  const [myUserId, setMyUserId] = useState<string>('')

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setMyUserId(session.user.id)

      const { data: evs } = await supabase
        .from('events')
        .select('*')
        .in('status', ['open', 'judging', 'closed'])
        .order('starts_at', { ascending: false })

      if (!evs) { setLoading(false); return }

      const { data: subs } = await supabase
        .from('event_submissions')
        .select('event_id, user_id')
        .in('event_id', evs.map(e => e.id))

      const enriched: ClubEvent[] = evs.map(e => ({
        ...e,
        submission_count: (subs ?? []).filter(s => s.event_id === e.id).length,
        my_submission: (subs ?? []).some(s => s.event_id === e.id && s.user_id === session.user.id),
      }))
      setEvents(enriched)
      setLoading(false)
    }
    init()
  }, [router])

  const filtered = events.filter(e => {
    if (filterType && e.event_type !== filterType) return false
    if (filterStatus && e.status !== filterStatus) return false
    return true
  })

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#3d6e00', fontFamily: 'Mantou Sans, Arial' }}>読み込み中...</div>

  return (
    <div style={{ minHeight: '100vh', background: '#f0f7e8', fontFamily: 'Mantou Sans, Arial Rounded MT Bold, Arial', padding: '24px 16px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* ヘッダー */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
          <button onClick={() => router.push('/dashboard')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3d6e00', fontSize: 14 }}>
            ← ダッシュボード
          </button>
          <PartyPopper size={28} color="#6aac14" />
          <h1 style={{ margin: 0, fontSize: 26, color: '#3d6e00' }}>イベント一覧</h1>
          <button
            onClick={() => router.push('/proposals')}
            style={{ marginLeft: 'auto', background: '#fff', color: '#3d6e00', border: '2px solid #6aac14', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', fontSize: 13, fontWeight: 'bold' }}
          >
            <Lightbulb size={15} /> イベントを提案する
          </button>
        </div>

        {/* フィルター */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value as EventType | '')}
            style={{ border: '2px solid #6aac14', borderRadius: 8, padding: '6px 12px', fontFamily: 'inherit', fontSize: 13, color: '#3d6e00', background: '#fff', cursor: 'pointer' }}
          >
            <option value="">すべての種別</option>
            <option value="bontest">BONTEST</option>
            <option value="presentation">作品発表会</option>
            <option value="workshop">ワークショップ</option>
            <option value="other">その他</option>
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as EventStatus | '')}
            style={{ border: '2px solid #6aac14', borderRadius: 8, padding: '6px 12px', fontFamily: 'inherit', fontSize: 13, color: '#3d6e00', background: '#fff', cursor: 'pointer' }}
          >
            <option value="">すべてのステータス</option>
            <option value="open">開催中</option>
            <option value="judging">審査中</option>
            <option value="closed">終了</option>
          </select>
        </div>

        {/* イベント一覧 */}
        {filtered.length === 0 ? (
          <div style={{ background: '#fff', border: '3px solid #c8e6a0', borderRadius: 12, padding: 40, textAlign: 'center', color: '#888' }}>
            <PartyPopper size={40} color="#c8e6a0" style={{ marginBottom: 12 }} />
            <p>現在公開中のイベントはありません</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 16 }}>
            {filtered.map(ev => {
              const TypeIcon = TYPE_ICONS[ev.event_type]
              const isOpen = ev.status === 'open'
              return (
                <div
                  key={ev.id}
                  onClick={() => router.push(`/events/${ev.id}`)}
                  style={{ background: '#fff', border: '3px solid #c8e6a0', borderRadius: 12, overflow: 'hidden', cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s', boxShadow: '0 4px 0 #c8e6a0' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 6px 0 #a8d870' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ''; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 0 #c8e6a0' }}
                >
                  {/* カバー画像 */}
                  {ev.cover_image_url ? (
                    <img src={ev.cover_image_url} alt={ev.title} style={{ width: '100%', height: 160, objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: 120, background: `linear-gradient(135deg, ${TYPE_COLORS[ev.event_type]}22, ${TYPE_COLORS[ev.event_type]}44)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <TypeIcon size={48} color={TYPE_COLORS[ev.event_type]} />
                    </div>
                  )}

                  <div style={{ padding: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                      <span style={{ background: TYPE_COLORS[ev.event_type], color: '#fff', fontSize: 11, borderRadius: 4, padding: '2px 7px', fontWeight: 'bold' }}>{TYPE_LABELS[ev.event_type]}</span>
                      <span style={{ background: STATUS_COLORS[ev.status] + '22', color: STATUS_COLORS[ev.status], fontSize: 11, borderRadius: 4, padding: '2px 7px', border: `1px solid ${STATUS_COLORS[ev.status]}`, fontWeight: 'bold' }}>{STATUS_LABELS[ev.status]}</span>
                      {ev.my_submission && (
                        <span style={{ background: '#6aac1422', color: '#3d6e00', fontSize: 11, borderRadius: 4, padding: '2px 7px', border: '1px solid #6aac14' }}>応募済み ✓</span>
                      )}
                    </div>

                    <h2 style={{ margin: '0 0 6px', fontSize: 18, color: '#3d6e00', lineHeight: 1.3 }}>{ev.title}</h2>
                    {ev.theme && <p style={{ margin: '0 0 8px', fontSize: 13, color: '#666' }}>テーマ: 「{ev.theme}」</p>}

                    <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#888', marginBottom: 12, flexWrap: 'wrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Calendar size={12} /> {fmtDate(ev.starts_at)} 〜 {fmtDate(ev.ends_at)}
                      </span>
                      <span>{ev.submission_count}件の応募</span>
                    </div>

                    {isOpen && ev.submission_deadline && (
                      <div style={{ background: '#fff9e6', border: '1px solid #f1c40f', borderRadius: 6, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#856404', marginBottom: 12 }}>
                        <Clock size={12} /> 応募締切: {countdown(ev.submission_deadline)}
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      {ev.target_course && (
                        <span style={{ fontSize: 12, background: '#e8f4ff', color: '#2980b9', borderRadius: 4, padding: '2px 8px' }}>{ev.target_course}コース</span>
                      )}
                      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#3d6e00', fontWeight: 'bold' }}>
                        詳細を見る <ChevronRight size={16} />
                      </span>
                    </div>
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

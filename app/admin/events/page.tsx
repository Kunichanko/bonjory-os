'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../../lib/supabase'
import { getEffectivePermissions, PermissionKey } from '../../../lib/permissions'
import {
  PartyPopper, Plus, Pencil, Trash2, X, Check, Megaphone, ChevronRight,
  Calendar, Trophy, Theater, Wrench, HelpCircle,
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
  created_at: string
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

const COURSE_OPTIONS = [
  { value: '', label: '全コース' },
  { value: 'Unity', label: 'Unity' },
  { value: 'Blender', label: 'Blender' },
  { value: 'Web', label: 'Web' },
]

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function toDatetimeLocal(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toISOString().slice(0, 16)
}

export default function AdminEventsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [effectivePerms, setEffectivePerms] = useState<Record<PermissionKey, boolean>>({
    course_management: false, task_management: false, point_settings: false,
    submission_review: false, finance: false, timeline_management: false,
    dm_management: false, announcement_management: false, assignment_management: false,
    gimmick_management: false, dev_management: false, news_management: false,
    debug: false, ticket_admin: false, event_management: false,
  })

  const [events, setEvents] = useState<ClubEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // form state
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formDescriptionMd, setFormDescriptionMd] = useState(false)
  const [formType, setFormType] = useState<EventType>('bontest')
  const [formStatus, setFormStatus] = useState<EventStatus>('draft')
  const [formStartsAt, setFormStartsAt] = useState('')
  const [formEndsAt, setFormEndsAt] = useState('')
  const [formDeadline, setFormDeadline] = useState('')
  const [formTheme, setFormTheme] = useState('')
  const [formCourse, setFormCourse] = useState('')
  const [formMaxSub, setFormMaxSub] = useState(1)
  const [formAllowAnon, setFormAllowAnon] = useState(false)
  const [formAllowVote, setFormAllowVote] = useState(false)
  const [formCoverUrl, setFormCoverUrl] = useState('')
  const [saving, setSaving] = useState(false)

  // announce
  const [announcingId, setAnnouncingId] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', session.user.id).single()
      const role = profile?.role ?? 'member'
      setUserRole(role)
      const perms = await getEffectivePermissions(session.user.id)
      setEffectivePerms(perms)
      if (role !== 'admin' && !perms.event_management) {
        router.push('/dashboard'); return
      }
      await loadEvents()
      setLoading(false)
    }
    init()
  }, [router])

  async function loadEvents() {
    const { data } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false })
    setEvents(data ?? [])
  }

  function resetForm() {
    setEditingId(null)
    setFormTitle('')
    setFormDescription('')
    setFormDescriptionMd(false)
    setFormType('bontest')
    setFormStatus('draft')
    setFormStartsAt('')
    setFormEndsAt('')
    setFormDeadline('')
    setFormTheme('')
    setFormCourse('')
    setFormMaxSub(1)
    setFormAllowAnon(false)
    setFormAllowVote(false)
    setFormCoverUrl('')
  }

  function openEditForm(ev: ClubEvent) {
    setEditingId(ev.id)
    setFormTitle(ev.title)
    setFormDescription(ev.description ?? '')
    setFormDescriptionMd(ev.description_is_markdown)
    setFormType(ev.event_type)
    setFormStatus(ev.status)
    setFormStartsAt(toDatetimeLocal(ev.starts_at))
    setFormEndsAt(toDatetimeLocal(ev.ends_at))
    setFormDeadline(toDatetimeLocal(ev.submission_deadline))
    setFormTheme(ev.theme ?? '')
    setFormCourse(ev.target_course ?? '')
    setFormMaxSub(ev.max_submissions)
    setFormAllowAnon(ev.allow_anonymous)
    setFormAllowVote(ev.allow_public_vote)
    setFormCoverUrl(ev.cover_image_url ?? '')
    setShowForm(true)
  }

  async function handleSave() {
    if (!formTitle.trim()) { setError('タイトルを入力してください'); return }
    if (!formStartsAt) { setError('開始日時を入力してください'); return }
    if (!formEndsAt) { setError('終了日時を入力してください'); return }
    setSaving(true)
    setError(null)
    const payload = {
      title: formTitle.trim(),
      description: formDescription.trim() || null,
      description_is_markdown: formDescriptionMd,
      event_type: formType,
      status: formStatus,
      starts_at: new Date(formStartsAt).toISOString(),
      ends_at: new Date(formEndsAt).toISOString(),
      submission_deadline: formDeadline ? new Date(formDeadline).toISOString() : null,
      theme: formTheme.trim() || null,
      target_course: formCourse || null,
      max_submissions: formMaxSub,
      allow_anonymous: formAllowAnon,
      allow_public_vote: formAllowVote,
      cover_image_url: formCoverUrl.trim() || null,
    }
    let err
    if (editingId) {
      const res = await supabase.from('events').update(payload).eq('id', editingId)
      err = res.error
    } else {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await supabase.from('events').insert({ ...payload, created_by: session!.user.id })
      err = res.error
    }
    setSaving(false)
    if (err) { setError(err.message); return }
    setSuccess(editingId ? 'イベントを更新しました' : 'イベントを作成しました')
    setShowForm(false)
    resetForm()
    loadEvents()
    setTimeout(() => setSuccess(null), 3000)
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`「${title}」を削除しますか？`)) return
    const { error: err } = await supabase.from('events').delete().eq('id', id)
    if (err) { setError(err.message); return }
    setSuccess('削除しました')
    loadEvents()
    setTimeout(() => setSuccess(null), 3000)
  }

  async function handleAnnounce(ev: ClubEvent) {
    setAnnouncingId(ev.id)
    setError(null)
    const typeLabel = TYPE_LABELS[ev.event_type]
    const body = ev.theme ? `テーマ: ${ev.theme}` : `${fmtDate(ev.starts_at)} 〜 ${fmtDate(ev.ends_at)}`
    const { error: insertErr } = await supabase.from('announcements').insert({
      type: 'immediate',
      title: `🎉 ${typeLabel}「${ev.title}」開催！`,
      body,
      url: `/events/${ev.id}`,
      is_active: true,
    })
    if (insertErr) { setError(insertErr.message); setAnnouncingId(null); return }
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/announcements/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session!.access_token}` },
      body: JSON.stringify({ title: `🎉 ${typeLabel}「${ev.title}」開催！`, body, url: `/events/${ev.id}` }),
    })
    setAnnouncingId(null)
    if (!res.ok) { setError('送信に失敗しました'); return }
    setSuccess('プッシュ通知を送信しました')
    setTimeout(() => setSuccess(null), 3000)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#3d6e00', fontFamily: 'Mantou Sans, Arial' }}>読み込み中...</div>

  return (
    <div style={{ minHeight: '100vh', background: '#f0f7e8', fontFamily: 'Mantou Sans, Arial Rounded MT Bold, Arial', padding: '24px 16px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* ヘッダー */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => router.push('/dashboard')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3d6e00', fontSize: 14 }}>
            ← ダッシュボード
          </button>
          <PartyPopper size={28} color="#6aac14" />
          <h1 style={{ margin: 0, fontSize: 24, color: '#3d6e00' }}>イベント管理</h1>
          <button
            onClick={() => { resetForm(); setShowForm(true) }}
            style={{ marginLeft: 'auto', background: '#6aac14', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', fontSize: 14, fontWeight: 'bold', boxShadow: '0 3px 0 #3d6e00' }}
          >
            <Plus size={16} /> 新規作成
          </button>
        </div>

        {/* メッセージ */}
        {error && <div style={{ background: '#fde8e8', border: '2px solid #e74c3c', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#c0392b', display: 'flex', alignItems: 'center', gap: 8 }}><X size={16} /> {error}</div>}
        {success && <div style={{ background: '#d4f0a0', border: '2px solid #6aac14', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#3d6e00', display: 'flex', alignItems: 'center', gap: 8 }}><Check size={16} /> {success}</div>}

        {/* 作成・編集フォーム */}
        {showForm && (
          <div style={{ background: '#fff', border: '3px solid #3d6e00', borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: '0 4px 0 #3d6e00' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, color: '#3d6e00' }}>{editingId ? 'イベントを編集' : '新規イベント作成'}</h2>
              <button onClick={() => { setShowForm(false); resetForm() }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} color="#666" /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label className="game-label">タイトル *</label>
                <input className="game-input" value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="例: BONTEST #1" style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label className="game-label">イベント種別</label>
                <select className="game-input" value={formType} onChange={e => setFormType(e.target.value as EventType)} style={{ width: '100%' }}>
                  <option value="bontest">BONTEST</option>
                  <option value="presentation">作品発表会</option>
                  <option value="workshop">ワークショップ</option>
                  <option value="other">その他</option>
                </select>
              </div>

              <div>
                <label className="game-label">ステータス</label>
                <select className="game-input" value={formStatus} onChange={e => setFormStatus(e.target.value as EventStatus)} style={{ width: '100%' }}>
                  <option value="draft">下書き</option>
                  <option value="open">開催中</option>
                  <option value="judging">審査中</option>
                  <option value="closed">終了</option>
                </select>
              </div>

              <div>
                <label className="game-label">開始日時 *</label>
                <input className="game-input" type="datetime-local" value={formStartsAt} onChange={e => setFormStartsAt(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label className="game-label">終了日時 *</label>
                <input className="game-input" type="datetime-local" value={formEndsAt} onChange={e => setFormEndsAt(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label className="game-label">応募締切</label>
                <input className="game-input" type="datetime-local" value={formDeadline} onChange={e => setFormDeadline(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label className="game-label">テーマ（BONTESTのお題等）</label>
                <input className="game-input" value={formTheme} onChange={e => setFormTheme(e.target.value)} placeholder="例: 「自然」" style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label className="game-label">対象コース</label>
                <select className="game-input" value={formCourse} onChange={e => setFormCourse(e.target.value)} style={{ width: '100%' }}>
                  {COURSE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              <div>
                <label className="game-label">1人あたりの最大応募数</label>
                <input className="game-input" type="number" min={1} max={10} value={formMaxSub} onChange={e => setFormMaxSub(Number(e.target.value))} style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>

              <div style={{ gridColumn: '1/-1' }}>
                <label className="game-label">カバー画像 URL</label>
                <input className="game-input" value={formCoverUrl} onChange={e => setFormCoverUrl(e.target.value)} placeholder="https://..." style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>

              <div style={{ gridColumn: '1/-1' }}>
                <label className="game-label">説明</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <input type="checkbox" id="md-toggle" checked={formDescriptionMd} onChange={e => setFormDescriptionMd(e.target.checked)} />
                  <label htmlFor="md-toggle" style={{ fontSize: 13, color: '#555', cursor: 'pointer' }}>Markdown</label>
                </div>
                <textarea className="game-input" rows={5} value={formDescription} onChange={e => setFormDescription(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="anon-toggle" checked={formAllowAnon} onChange={e => setFormAllowAnon(e.target.checked)} />
                <label htmlFor="anon-toggle" style={{ fontSize: 14, color: '#3d6e00', cursor: 'pointer' }}>匿名応募を許可</label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="vote-toggle" checked={formAllowVote} onChange={e => setFormAllowVote(e.target.checked)} />
                <label htmlFor="vote-toggle" style={{ fontSize: 14, color: '#3d6e00', cursor: 'pointer' }}>人気投票を有効化</label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => { setShowForm(false); resetForm() }} style={{ background: '#e8e8e8', color: '#555', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}>
                キャンセル
              </button>
              <button onClick={handleSave} disabled={saving} style={{ background: saving ? '#aaa' : '#6aac14', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 'bold', boxShadow: saving ? 'none' : '0 3px 0 #3d6e00' }}>
                {saving ? '保存中...' : (editingId ? '更新する' : '作成する')}
              </button>
            </div>
          </div>
        )}

        {/* イベント一覧 */}
        {events.length === 0 ? (
          <div style={{ background: '#fff', border: '3px solid #c8e6a0', borderRadius: 12, padding: 40, textAlign: 'center', color: '#888' }}>
            <PartyPopper size={40} color="#c8e6a0" style={{ marginBottom: 12 }} />
            <p>イベントがまだありません。「新規作成」から追加しましょう。</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {events.map(ev => {
              const TypeIcon = TYPE_ICONS[ev.event_type]
              return (
                <div key={ev.id} style={{ background: '#fff', border: '3px solid #c8e6a0', borderRadius: 12, padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ background: TYPE_COLORS[ev.event_type] + '22', borderRadius: 10, padding: 10, flexShrink: 0 }}>
                    <TypeIcon size={28} color={TYPE_COLORS[ev.event_type]} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 'bold', fontSize: 16, color: '#3d6e00' }}>{ev.title}</span>
                      <span style={{ background: TYPE_COLORS[ev.event_type], color: '#fff', fontSize: 11, borderRadius: 4, padding: '2px 7px', fontWeight: 'bold' }}>{TYPE_LABELS[ev.event_type]}</span>
                      <span style={{ background: STATUS_COLORS[ev.status] + '33', color: STATUS_COLORS[ev.status], fontSize: 11, borderRadius: 4, padding: '2px 7px', border: `1px solid ${STATUS_COLORS[ev.status]}`, fontWeight: 'bold' }}>{STATUS_LABELS[ev.status]}</span>
                      {ev.theme && <span style={{ fontSize: 12, color: '#666' }}>テーマ: {ev.theme}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                      <Calendar size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                      {fmtDate(ev.starts_at)} 〜 {fmtDate(ev.ends_at)}
                      {ev.submission_deadline && <span style={{ marginLeft: 8 }}>応募締切: {fmtDate(ev.submission_deadline)}</span>}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button
                      onClick={() => handleAnnounce(ev)}
                      disabled={announcingId === ev.id}
                      title="プッシュ通知で告知する"
                      style={{ background: '#3498db22', border: '1px solid #3498db', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#2980b9' }}
                    >
                      <Megaphone size={14} /> {announcingId === ev.id ? '送信中...' : '告知'}
                    </button>
                    <button
                      onClick={() => router.push(`/admin/events/${ev.id}`)}
                      title="審査・応募管理"
                      style={{ background: '#e67e2222', border: '1px solid #e67e22', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#d35400' }}
                    >
                      <ChevronRight size={14} /> 審査
                    </button>
                    <button
                      onClick={() => openEditForm(ev)}
                      style={{ background: '#6aac1422', border: '1px solid #6aac14', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#3d6e00' }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(ev.id, ev.title)}
                      style={{ background: '#e74c3c22', border: '1px solid #e74c3c', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#c0392b' }}
                    >
                      <Trash2 size={14} />
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

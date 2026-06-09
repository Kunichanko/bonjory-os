"use client"

import { Fragment, useEffect, useState } from 'react'
import { CheckSquare } from 'lucide-react'
import { useRouter } from 'next/navigation'
import supabase from '../../../lib/supabase'
import { getEffectivePermissions, PermissionKey } from '../../../lib/permissions'

type Course = 'Unity' | 'Blender' | 'Web' | null
type Stage  = 'Foundation' | 'Development' | 'Production' | null

interface Profile {
  id: string
  username: string | null
  course: Course
  stage: Stage
  auto_assign_enabled: boolean
}

interface ActiveAssignment {
  id: string
  task_id: string
  user_id: string
  status: 'assigned' | 'in_progress' | 'submitted'
  created_at: string
  deadline_at: string | null
  task: { id: string; title: string; progress_number: number | null }
}

interface ReservedAssignment {
  id: string
  user_id: string
  task_id: string
  activate_at: string
  type: 'reserved' | 'auto'
  task: { title: string }
}

interface TaskOption {
  id: string
  title: string
  target_course: string | null
  progress_number: number | null
}

const STATUS_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  assigned:    { label: '繧｢繧ｵ繧､繝ｳ貂・,  bg: '#e8e8e8', color: '#555' },
  in_progress: { label: '蜿悶ｊ邨・∩荳ｭ', bg: '#d4f0a0', color: '#3d6e00' },
  submitted:   { label: '謠仙・貂・,     bg: '#3d6e00', color: '#fff' },
}

const COURSE_OPTIONS = [
  { label: '蜈ｨ繧ｳ繝ｼ繧ｹ', value: '' },
  { label: 'Unity', value: 'Unity' },
  { label: 'Blender', value: 'Blender' },
  { label: 'Web髢狗匱', value: 'Web' },
]

const STAGE_OPTIONS = [
  { label: '蜈ｨ繧ｹ繝・・繧ｸ', value: '' },
  { label: 'Foundation', value: 'Foundation' },
  { label: 'Development', value: 'Development' },
  { label: 'Production', value: 'Production' },
]

function getAssignmentDeadline(a: { created_at: string; deadline_at?: string | null }): Date {
  if (a.deadline_at) return new Date(a.deadline_at)
  const created = new Date(a.created_at)
  const daysToSunday = created.getDay() === 0 ? 0 : 7 - created.getDay()
  const sunday = new Date(created)
  sunday.setDate(created.getDate() + daysToSunday)
  sunday.setHours(23, 59, 59, 0)
  return sunday
}

function getNextMonday(deadline: Date): Date {
  const d = new Date(deadline)
  const daysToMonday = d.getDay() === 0 ? 1 : 8 - d.getDay()
  d.setDate(d.getDate() + daysToMonday)
  d.setHours(0, 0, 0, 0)
  return d
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

const LS_KEY = 'assignmentSelectedIds'

function loadSelected(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch { return new Set() }
}

function saveSelected(ids: Set<string>) {
  localStorage.setItem(LS_KEY, JSON.stringify([...ids]))
}

export default function AssignmentsPage() {
  const router = useRouter()
  const [profiles, setProfiles]         = useState<Profile[]>([])
  const [activeMap, setActiveMap]       = useState<Record<string, ActiveAssignment[]>>({})
  const [reservedMap, setReservedMap]   = useState<Record<string, ReservedAssignment[]>>({})
  const [allTasks, setAllTasks]         = useState<TaskOption[]>([])
  const [loading, setLoading]           = useState(true)
  const [userRole, setUserRole]         = useState<string | null>(null)
  const [effectivePerms, setEffectivePerms] = useState<Record<PermissionKey, boolean>>({
    course_management: false, task_management: false, assignment_management: false,
    point_settings: false, submission_review: false, finance: false, timeline_management: false,
    dm_management: false, announcement_management: false, gimmick_management: false,
    dev_management: false,
    news_management: false, ticket_admin: false, debug: false, sns_management: false,
  })

  // 繝輔ぅ繝ｫ繧ｿ繝ｼ
  const [filterText, setFilterText]   = useState('')
  const [filterCourse, setFilterCourse] = useState('')
  const [filterStage, setFilterStage]   = useState('')
  const [showSelectedOnly, setShowSelectedOnly] = useState(false)

  // 繝√ぉ繝・け繝懊ャ繧ｯ繧ｹ驕ｸ謚橸ｼ・ocalStorage縺ｧ菫晄戟・・
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // 繧｢繧ｵ繧､繝ｳ繝｢繝ｼ繝繝ｫ
  const [modalUserId, setModalUserId]     = useState<string | null>(null)
  const [modalType, setModalType]         = useState<'normal' | 'reserved' | null>(null)
  const [modalFilter, setModalFilter]     = useState('')
  const [modalCourse, setModalCourse]     = useState('')
  const [modalError, setModalError]       = useState<string | null>(null)
  const [modalSaving, setModalSaving]     = useState(false)

  // 閾ｪ蜍輔い繧ｵ繧､繝ｳ蛻・崛荳ｭ
  const [togglingAuto, setTogglingAuto]   = useState<string | null>(null)

  useEffect(() => {
    const saved = loadSelected()
    setSelectedIds(saved)

    let mounted = true
    async function init() {
      try {
        const { data: authData } = await supabase.auth.getUser()
        if (!authData?.user) { router.replace('/login'); return }

        const { data: me } = await supabase
          .from('profiles').select('role').eq('id', authData.user.id).single()
        if (!me) { router.replace('/dashboard'); return }

        const perms = await getEffectivePermissions(authData.user.id)
        if (me.role !== 'admin' && !perms.assignment_management) {
          router.replace('/dashboard'); return
        }
        if (mounted) { setUserRole(me.role); setEffectivePerms(perms) }

        const [profilesRes, activeRes, reservedRes, tasksRes] = await Promise.all([
          supabase.from('profiles').select('id, username, course, stage, auto_assign_enabled').order('created_at'),
          supabase.from('task_assignments')
            .select('id, task_id, user_id, status, created_at, deadline_at, task:tasks(id, title, progress_number)')
            .eq('is_assigned', true),
          supabase.from('reserved_assignments')
            .select('id, user_id, task_id, activate_at, type, task:tasks(title)'),
          supabase.from('tasks')
            .select('id, title, target_course, progress_number')
            .eq('is_active', true)
            .order('progress_number', { ascending: true, nullsFirst: false }),
        ])

        if (!mounted) return
        setProfiles((profilesRes.data ?? []) as Profile[])
        setAllTasks((tasksRes.data ?? []) as TaskOption[])

        const aMap: Record<string, ActiveAssignment[]> = {}
        for (const a of (activeRes.data ?? [])) {
          if (!aMap[a.user_id]) aMap[a.user_id] = []
          aMap[a.user_id].push(a as unknown as ActiveAssignment)
        }
        setActiveMap(aMap)

        const rMap: Record<string, ReservedAssignment[]> = {}
        for (const r of (reservedRes.data ?? [])) {
          if (!rMap[r.user_id]) rMap[r.user_id] = []
          rMap[r.user_id].push(r as unknown as ReservedAssignment)
        }
        setReservedMap(rMap)
      } catch (err) {
        console.error(err)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    init()
    return () => { mounted = false }
  }, [router])

  function toggleSelected(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      saveSelected(next)
      return next
    })
  }

  async function toggleAutoAssign(profile: Profile) {
    setTogglingAuto(profile.id)
    const { error } = await supabase.from('profiles')
      .update({ auto_assign_enabled: !profile.auto_assign_enabled })
      .eq('id', profile.id)
    if (!error) {
      setProfiles(prev => prev.map(p => p.id === profile.id
        ? { ...p, auto_assign_enabled: !p.auto_assign_enabled } : p))
    }
    setTogglingAuto(null)
  }

  async function cancelReservation(reservationId: string, userId: string) {
    const { error } = await supabase.from('reserved_assignments').delete().eq('id', reservationId)
    if (!error) {
      setReservedMap(prev => ({
        ...prev,
        [userId]: (prev[userId] ?? []).filter(r => r.id !== reservationId),
      }))
    }
  }

  function openModal(userId: string, type: 'normal' | 'reserved') {
    setModalUserId(userId)
    setModalType(type)
    setModalFilter('')
    setModalCourse('')
    setModalError(null)
  }

  function closeModal() {
    setModalUserId(null)
    setModalType(null)
    setModalSaving(false)
    setModalError(null)
  }

  async function handleAssign(taskId: string) {
    if (!modalUserId || !modalType) return
    setModalSaving(true)
    setModalError(null)

    if (modalType === 'normal') {
      const { data, error } = await supabase.from('task_assignments')
        .insert({ task_id: taskId, user_id: modalUserId, is_assigned: true, status: 'assigned' })
        .select('id, task_id, user_id, status, created_at, deadline_at, task:tasks(id, title, progress_number)')
        .single()
      if (error) { setModalError(error.message); setModalSaving(false); return }
      if (data) {
        setActiveMap(prev => ({
          ...prev,
          [modalUserId]: [...(prev[modalUserId] ?? []), data as unknown as ActiveAssignment],
        }))
      }
    } else {
      // 莠育ｴ・い繧ｵ繧､繝ｳ: 迴ｾ蝨ｨ縺ｮ隱ｲ鬘後・譛滄剞縺ｮ鄙梧怦譖懈律繧・activate_at 縺ｫ
      const currentAssignments = activeMap[modalUserId] ?? []
      const current = currentAssignments.find(a => a.status !== 'submitted') ?? currentAssignments[0]
      let activateAt: Date
      if (current) {
        const deadline = getAssignmentDeadline(current)
        activateAt = getNextMonday(deadline)
      } else {
        // 迴ｾ蝨ｨ隱ｲ鬘後′縺ｪ縺代ｌ縺ｰ鄙梧怦譖懈律
        const today = new Date()
        activateAt = getNextMonday(today)
      }

      const { data: authData } = await supabase.auth.getUser()
      const { data, error } = await supabase.from('reserved_assignments')
        .insert({
          user_id: modalUserId,
          task_id: taskId,
          trigger_assignment_id: current?.id ?? null,
          activate_at: activateAt.toISOString().slice(0, 10),
          type: 'reserved',
          created_by: authData?.user?.id,
        })
        .select('id, user_id, task_id, activate_at, type, task:tasks(title)')
        .single()
      if (error) { setModalError(error.message); setModalSaving(false); return }
      if (data) {
        setReservedMap(prev => ({
          ...prev,
          [modalUserId]: [...(prev[modalUserId] ?? []), data as unknown as ReservedAssignment],
        }))
      }
    }
    closeModal()
  }

  // 繝輔ぅ繝ｫ繧ｿ繝ｼ & 繧ｽ繝ｼ繝茨ｼ磯∈謚樊ｸ医∩蜈磯ｭ・・
  const filteredProfiles = profiles
    .filter(p => {
      if (showSelectedOnly && !selectedIds.has(p.id)) return false
      if (filterText && !(p.username ?? '').toLowerCase().includes(filterText.toLowerCase())) return false
      if (filterCourse && p.course !== filterCourse) return false
      if (filterStage && p.stage !== filterStage) return false
      return true
    })
    .sort((a, b) => {
      const aS = selectedIds.has(a.id) ? 0 : 1
      const bS = selectedIds.has(b.id) ? 0 : 1
      return aS - bS
    })

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'white', fontSize: 24, fontWeight: 'bold' }}>Loading...</p>
    </div>
  )

  // 繝｢繝ｼ繝繝ｫ逕ｨ・壽里繧｢繧ｵ繧､繝ｳ貂医∩縺ｮ task_id 髮・粋
  const modalAlreadyAssigned = new Set([
    ...(activeMap[modalUserId ?? ''] ?? []).map(a => a.task_id),
    ...(reservedMap[modalUserId ?? ''] ?? []).map(r => r.task_id),
  ])
  const modalTasks = allTasks.filter(t => {
    if (modalFilter && !t.title.toLowerCase().includes(modalFilter.toLowerCase())) return false
    if (modalCourse && t.target_course !== modalCourse) return false
    return true
  })

  return (
    <div style={{ minHeight: '100vh', padding: '32px 24px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* 繝倥ャ繝繝ｼ */}
        <div className="game-card" style={{ padding: '20px 28px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <a href="/dashboard" style={{ color: '#6aac14', fontWeight: 'bold', fontSize: 13, textDecoration: 'none' }}>竊・繝繝・す繝･繝懊・繝・/a>
            <h1 className="game-title" style={{ fontSize: 26, flex: 1 }}>繧｢繧ｵ繧､繝ｳ邂｡逅・/h1>
          </div>
        </div>

        {/* 繝輔ぅ繝ｫ繧ｿ繝ｼ */}
        <div className="game-card" style={{ padding: '16px 24px', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              className="game-input"
              type="text"
              placeholder="蜷榊燕縺ｧ讀懃ｴ｢窶ｦ"
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              style={{ flex: 1, minWidth: 120, fontSize: 14 }}
            />
            <select className="game-input" value={filterCourse} onChange={e => setFilterCourse(e.target.value)} style={{ fontSize: 13 }}>
              {COURSE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select className="game-input" value={filterStage} onChange={e => setFilterStage(e.target.value)} style={{ fontSize: 13 }}>
              {STAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button
              onClick={() => setShowSelectedOnly(p => !p)}
              style={{
                padding: '8px 14px', borderRadius: 10, border: '2px solid #6aac14', fontSize: 13, fontWeight: 'bold',
                cursor: 'pointer', whiteSpace: 'nowrap',
                background: showSelectedOnly ? '#6aac14' : 'white',
                color: showSelectedOnly ? 'white' : '#3d6e00',
              }}
            >
              <CheckSquare size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}/>驕ｸ謚樊ｸ医∩縺ｮ縺ｿ
            </button>
          </div>
          {selectedIds.size > 0 && (
            <p style={{ fontSize: 12, color: '#6aac14', marginTop: 8, fontWeight: 'bold' }}>
              {selectedIds.size} 蜷埼∈謚樔ｸｭ
            </p>
          )}
        </div>

        {/* 驛ｨ蜩｡繧ｫ繝ｼ繝峨Μ繧ｹ繝・*/}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredProfiles.length === 0 && (
            <div className="game-card" style={{ padding: 24, textAlign: 'center', color: '#888' }}>
              陦ｨ遉ｺ縺ｧ縺阪ｋ驛ｨ蜩｡縺後＞縺ｾ縺帙ｓ
            </div>
          )}
          {filteredProfiles.map(profile => {
            const isSelected = selectedIds.has(profile.id)
            const active = activeMap[profile.id] ?? []
            const reserved = reservedMap[profile.id] ?? []

            return (
              <div
                key={profile.id}
                className="game-card"
                style={{
                  padding: '16px 20px',
                  border: `2px solid ${isSelected ? '#6aac14' : '#3d6e00'}`,
                  background: isSelected ? '#f0fae0' : undefined,
                }}
              >
                {/* 繝倥ャ繝繝ｼ陦・*/}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelected(profile.id)}
                    style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
                  />
                  <span style={{ fontWeight: 'bold', color: '#2d5500', fontSize: 16, flex: 1 }}>
                    {profile.username ?? '・亥錐蜑阪↑縺暦ｼ・}
                  </span>
                  {profile.course && (
                    <span style={{ background: '#6aac14', color: 'white', borderRadius: 10, padding: '2px 9px', fontSize: 12, fontWeight: 'bold' }}>
                      {profile.course}
                    </span>
                  )}
                  {profile.stage && (
                    <span style={{ background: '#3d6e00', color: 'white', borderRadius: 10, padding: '2px 9px', fontSize: 12, fontWeight: 'bold' }}>
                      {profile.stage}
                    </span>
                  )}
                </div>

                {/* 繧｢繧ｵ繧､繝ｳ貂医∩隱ｲ鬘御ｸ隕ｧ */}
                <div style={{ marginBottom: 10 }}>
                  <span style={{ fontSize: 12, color: '#888', fontWeight: 'bold' }}>繧｢繧ｵ繧､繝ｳ貂医∩隱ｲ鬘・ </span>
                  {active.length === 0 ? (
                    <span style={{ color: '#aaa', fontSize: 13 }}>縺ｪ縺・/span>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                      {active.map(a => {
                        const s = STATUS_LABELS[a.status]
                        const deadline = getAssignmentDeadline(a)
                        const dl = `${deadline.getMonth() + 1}/${deadline.getDate()}(譌･)`
                        return (
                          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, flexWrap: 'wrap' }}>
                            <span style={{ background: s.bg, color: s.color, borderRadius: 8, padding: '2px 8px', fontWeight: 'bold', fontSize: 12, whiteSpace: 'nowrap' }}>{s.label}</span>
                            <span style={{ color: '#2d5500', fontWeight: 'bold' }}>{a.task.title}</span>
                            <span style={{ color: '#888', fontSize: 12, whiteSpace: 'nowrap' }}>譛滄剞: {dl}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* 莠育ｴ・い繧ｵ繧､繝ｳ荳隕ｧ */}
                {reserved.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <span style={{ fontSize: 12, color: '#888', fontWeight: 'bold' }}>莠育ｴ・い繧ｵ繧､繝ｳ: </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                      {reserved.map(r => (
                        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#f0f8e0', border: '1px solid #6aac14', borderRadius: 8, padding: '3px 8px', fontSize: 12 }}>
                          <span style={{ background: r.type === 'auto' ? '#3d6e00' : '#6aac14', color: 'white', borderRadius: 6, padding: '0 5px', fontSize: 10, fontWeight: 'bold' }}>
                            {r.type === 'auto' ? '閾ｪ蜍・ : '莠育ｴ・}
                          </span>
                          <span style={{ color: '#2d5500', fontWeight: 'bold' }}>{r.task.title}</span>
                          <span style={{ color: '#888' }}>{formatDate(r.activate_at)}縲・/span>
                          <button
                            onClick={() => cancelReservation(r.id, profile.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c0392b', fontWeight: 'bold', fontSize: 13, padding: '0 2px', lineHeight: 1 }}
                          >ﾃ・/button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 謫堺ｽ懆｡・*/}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => openModal(profile.id, 'normal')}
                    style={{ padding: '6px 14px', borderRadius: 8, border: '2px solid #6aac14', background: 'white', color: '#2d5500', fontWeight: 'bold', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }}
                  >
                    騾壼ｸｸ繧｢繧ｵ繧､繝ｳ
                  </button>
                  <button
                    onClick={() => openModal(profile.id, 'reserved')}
                    style={{ padding: '6px 14px', borderRadius: 8, border: '2px solid #3d6e00', background: 'white', color: '#2d5500', fontWeight: 'bold', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }}
                  >
                    莠育ｴ・い繧ｵ繧､繝ｳ
                  </button>

                  {/* 閾ｪ蜍輔い繧ｵ繧､繝ｳ 繧ｹ繧､繝・メ */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginLeft: 'auto' }}>
                    <span style={{ fontSize: 12, color: '#555', fontWeight: 'bold', whiteSpace: 'nowrap' }}>閾ｪ蜍輔い繧ｵ繧､繝ｳ</span>
                    <div
                      onClick={() => !togglingAuto && toggleAutoAssign(profile)}
                      style={{
                        width: 40, height: 22, borderRadius: 11, position: 'relative', cursor: togglingAuto ? 'default' : 'pointer',
                        background: profile.auto_assign_enabled ? '#6aac14' : '#ccc', transition: 'background 0.2s', flexShrink: 0,
                      }}
                    >
                      <div style={{
                        position: 'absolute', top: 3, width: 16, height: 16, borderRadius: '50%',
                        background: 'white', transition: 'left 0.2s',
                        left: profile.auto_assign_enabled ? 21 : 3,
                      }} />
                    </div>
                    <span style={{ fontSize: 11, color: profile.auto_assign_enabled ? '#3d6e00' : '#aaa', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                      {profile.auto_assign_enabled ? 'ON' : 'OFF'}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 隱ｲ鬘碁∈謚槭Δ繝ｼ繝繝ｫ */}
      {modalUserId && modalType && (
        <div
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 200, padding: 16,
          }}
        >
          <div className="game-card" style={{ width: '100%', maxWidth: 500, maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: '20px 24px', gap: 12 }}>
            <h2 className="game-title" style={{ fontSize: 20, marginBottom: 0 }}>
              {modalType === 'normal' ? '騾壼ｸｸ繧｢繧ｵ繧､繝ｳ' : '莠育ｴ・い繧ｵ繧､繝ｳ'} 窶・隱ｲ鬘後ｒ驕ｸ謚・
            </h2>

            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="game-input"
                type="text"
                placeholder="隱ｲ鬘悟錐縺ｧ讀懃ｴ｢窶ｦ"
                value={modalFilter}
                onChange={e => setModalFilter(e.target.value)}
                style={{ flex: 1, fontSize: 13 }}
              />
              <select className="game-input" value={modalCourse} onChange={e => setModalCourse(e.target.value)} style={{ fontSize: 13, minWidth: 100 }}>
                {COURSE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {modalError && <div className="game-error" style={{ fontSize: 13 }}>{modalError}</div>}

            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {modalTasks.length === 0 && (
                <p style={{ color: '#aaa', fontSize: 13, textAlign: 'center', padding: 16 }}>隱ｲ鬘後′隕九▽縺九ｊ縺ｾ縺帙ｓ</p>
              )}
              {modalTasks.map(task => {
                const alreadyAssigned = modalAlreadyAssigned.has(task.id)
                return (
                  <div
                    key={task.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 12px', borderRadius: 8,
                      border: '1px solid #d4f0a0',
                      background: alreadyAssigned ? '#f5f5f5' : '#f8fff0',
                      opacity: alreadyAssigned ? 0.6 : 1,
                    }}
                  >
                    {task.progress_number != null && (
                      <span style={{ background: '#a8d870', color: '#1a3a00', borderRadius: 8, padding: '1px 7px', fontSize: 11, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                        #{task.progress_number}
                      </span>
                    )}
                    <span style={{ fontSize: 14, color: '#2d5500', fontWeight: 'bold', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {task.title}
                    </span>
                    {task.target_course && (
                      <span style={{ background: '#6aac14', color: 'white', borderRadius: 8, padding: '1px 7px', fontSize: 11, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                        {task.target_course}
                      </span>
                    )}
                    <button
                      onClick={() => !alreadyAssigned && !modalSaving && handleAssign(task.id)}
                      disabled={alreadyAssigned || modalSaving}
                      style={{
                        padding: '4px 12px', borderRadius: 7, fontSize: 12, fontWeight: 'bold',
                        border: '2px solid #6aac14', cursor: alreadyAssigned ? 'default' : 'pointer',
                        background: alreadyAssigned ? '#ddd' : '#6aac14',
                        color: alreadyAssigned ? '#aaa' : 'white',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {alreadyAssigned ? '貂医∩' : '繧｢繧ｵ繧､繝ｳ'}
                    </button>
                  </div>
                )
              })}
            </div>

            <button
              onClick={closeModal}
              style={{ padding: '8px', borderRadius: 8, border: '2px solid #888', background: 'none', color: '#888', fontWeight: 'bold', cursor: 'pointer', fontSize: 14 }}
            >
              髢峨§繧・
            </button>
          </div>
        </div>
      )}
    </div>
  )
}


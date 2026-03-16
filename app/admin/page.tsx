"use client"

import { Fragment, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../lib/supabase'
import { FEATURE_LIST, PermissionKey, getEffectivePermissions } from '../../lib/permissions'

type Course = 'Unity' | 'Blender' | 'Web' | null
type Stage  = 'Foundation' | 'Development' | 'Production' | null

interface Profile {
  id: string
  username: string | null
  email: string | null
  course: Course
  stage: Stage
}

interface Task {
  id: string
  title: string
  target_course: string | null
}

interface Assignment {
  id: string
  task_id: string
  user_id: string
  status: 'assigned' | 'in_progress' | 'submitted'
  created_at: string
  deadline_at: string | null
  task: { title: string }
}

function getAssignmentDeadline(a: { created_at: string; deadline_at?: string | null }): Date {
  if (a.deadline_at) return new Date(a.deadline_at)
  const created = new Date(a.created_at)
  const daysToSunday = created.getDay() === 0 ? 0 : 7 - created.getDay()
  const sunday = new Date(created)
  sunday.setDate(created.getDate() + daysToSunday)
  sunday.setHours(23, 59, 59, 0)
  return sunday
}

interface Position {
  id: string
  name: string
  permissions: Record<PermissionKey, boolean>
}

interface ProfilePosition {
  profile_id: string
  position_id: string
  position_name: string
}

const COURSE_OPTIONS: { label: string; value: Course }[] = [
  { label: '—', value: null },
  { label: 'Unity', value: 'Unity' },
  { label: 'Blender', value: 'Blender' },
  { label: 'Web開発', value: 'Web' },
]

const STAGE_OPTIONS: { label: string; value: Stage }[] = [
  { label: '—', value: null },
  { label: 'Foundation（基礎）', value: 'Foundation' },
  { label: 'Development（応用）', value: 'Development' },
  { label: 'Production（実践）', value: 'Production' },
]

const STATUS_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  assigned:    { label: 'アサイン済',  bg: '#e8e8e8', color: '#555' },
  in_progress: { label: '取り組み中', bg: '#d4f0a0', color: '#3d6e00' },
  submitted:   { label: '提出済',     bg: '#3d6e00', color: '#fff' },
}

export default function AdminPage() {
  const router = useRouter()
  const [profiles, setProfiles]         = useState<Profile[]>([])
  const [allTasks, setAllTasks]         = useState<Task[]>([])
  const [assignments, setAssignments]   = useState<Record<string, Assignment[]>>({})
  const [allPositions, setAllPositions] = useState<Position[]>([])
  const [profilePositions, setProfilePositions] = useState<Record<string, ProfilePosition[]>>({})
  const [addingPosition, setAddingPosition] = useState<Record<string, string>>({})
  const [expandedId, setExpandedId]     = useState<string | null>(null)
  const [addingTask, setAddingTask]     = useState<Record<string, string>>({})
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState<Record<string, string>>({})
  const [errors, setErrors]             = useState<Record<string, string>>({})
  const [userRole, setUserRole]         = useState<string | null>(null)
  const [effectivePerms, setEffectivePerms] = useState<Record<PermissionKey, boolean>>({
    course_management: false, task_management: false, assignment_management: false,
    point_settings: false, submission_review: false, finance: false, timeline_management: false,
    dm_management: false, announcement_management: false, gimmick_management: false, news_management: false,
  })

  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser()
        if (authError || !authData?.user) { router.replace('/login'); return }

        const { data: me, error: meError } = await supabase
          .from('profiles').select('role').eq('id', authData.user.id).single()
        if (meError || !me) { router.replace('/dashboard'); return }
        if (me.role !== 'admin') {
          const perms = await getEffectivePermissions(authData.user.id)
          if (!perms.course_management) { router.replace('/dashboard'); return }
          if (mounted) setEffectivePerms(perms)
        } else {
          const perms = await getEffectivePermissions(authData.user.id)
          if (mounted) setEffectivePerms(perms)
        }
        if (mounted) setUserRole(me.role)

        const [profilesRes, tasksRes, assignmentsRes, positionsRes, ppRes] = await Promise.all([
          supabase.from('profiles').select('id, username, email, course, stage').order('created_at', { ascending: true }),
          supabase.from('tasks').select('id, title, target_course').eq('is_active', true),
          supabase.from('task_assignments').select('id, task_id, user_id, status, created_at, deadline_at, task:tasks(title)').eq('is_assigned', true),
          supabase.from('positions').select('id, name, permissions').order('created_at', { ascending: true }),
          supabase.from('profile_positions').select('profile_id, position_id, positions(name)'),
        ])

        if (!mounted) return
        setProfiles(profilesRes.data ?? [])
        setAllTasks(tasksRes.data ?? [])
        setAllPositions((positionsRes.data ?? []) as Position[])

        // userId → Assignment[] のマップを構築
        const map: Record<string, Assignment[]> = {}
        for (const a of (assignmentsRes.data ?? [])) {
          if (!map[a.user_id]) map[a.user_id] = []
          map[a.user_id].push(a as unknown as Assignment)
        }
        setAssignments(map)

        // userId → ProfilePosition[] のマップを構築
        const ppMap: Record<string, ProfilePosition[]> = {}
        for (const pp of (ppRes.data ?? [])) {
          const ppTyped = pp as unknown as { profile_id: string; position_id: string; positions: { name: string } | { name: string }[] | null }
          const profileId = ppTyped.profile_id
          if (!ppMap[profileId]) ppMap[profileId] = []
          const posName = Array.isArray(ppTyped.positions)
            ? ppTyped.positions[0]?.name ?? ''
            : ppTyped.positions?.name ?? ''
          ppMap[profileId].push({
            profile_id: profileId,
            position_id: ppTyped.position_id,
            position_name: posName,
          })
        }
        setProfilePositions(ppMap)
      } catch (err) {
        console.error(err)
        if (mounted) router.replace('/dashboard')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    init()
    return () => { mounted = false }
  }, [router])

  async function handleUpdate(profileId: string, field: 'course' | 'stage', value: Course | Stage) {
    const key = `${profileId}_${field}`
    setSaving(prev => ({ ...prev, [profileId]: field }))
    setErrors(prev => { const next = { ...prev }; delete next[key]; return next })

    const { error } = await supabase.from('profiles').update({ [field]: value }).eq('id', profileId)
    if (error) {
      setErrors(prev => ({ ...prev, [key]: error.message }))
    } else {
      setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, [field]: value } : p))
    }
    setSaving(prev => { const next = { ...prev }; delete next[profileId]; return next })
  }

  async function addAssignment(userId: string) {
    const taskId = addingTask[userId]
    if (!taskId) return

    const task = allTasks.find(t => t.id === taskId)
    if (!task) return

    const { data: inserted, error } = await supabase.from('task_assignments')
      .insert({ task_id: taskId, user_id: userId })
      .select('id, created_at, deadline_at')
      .single()
    if (!error && inserted) {
      setAssignments(prev => ({
        ...prev,
        [userId]: [...(prev[userId] ?? []), { id: inserted.id, task_id: taskId, user_id: userId, status: 'assigned', created_at: inserted.created_at, deadline_at: inserted.deadline_at, task: { title: task.title } }],
      }))
      setAddingTask(prev => { const next = { ...prev }; delete next[userId]; return next })
    }
  }

  async function addPositionToUser(userId: string) {
    const positionId = addingPosition[userId]
    if (!positionId) return
    const position = allPositions.find(p => p.id === positionId)
    if (!position) return
    const { error } = await supabase.from('profile_positions').insert({ profile_id: userId, position_id: positionId })
    if (!error) {
      setProfilePositions(prev => ({
        ...prev,
        [userId]: [...(prev[userId] ?? []), { profile_id: userId, position_id: positionId, position_name: position.name }],
      }))
      setAddingPosition(prev => { const next = { ...prev }; delete next[userId]; return next })
    }
  }

  async function removePositionFromUser(userId: string, positionId: string) {
    const { error } = await supabase.from('profile_positions')
      .delete().eq('profile_id', userId).eq('position_id', positionId)
    if (!error) {
      setProfilePositions(prev => ({
        ...prev,
        [userId]: (prev[userId] ?? []).filter(pp => pp.position_id !== positionId),
      }))
    }
  }

  async function removeAssignment(userId: string, taskId: string) {
    // 提出済み記録をタイムライン・履歴に残すため、物理削除ではなく論理削除
    const { error } = await supabase.from('task_assignments')
      .update({ is_assigned: false })
      .eq('task_id', taskId).eq('user_id', userId)
    if (!error) {
      setAssignments(prev => ({
        ...prev,
        [userId]: (prev[userId] ?? []).filter(a => a.task_id !== taskId),
      }))
    }
  }

  async function adjustDeadline(userId: string, assignment: Assignment, deltaDays: number) {
    const base = getAssignmentDeadline(assignment)
    const newDeadline = new Date(base)
    newDeadline.setDate(newDeadline.getDate() + deltaDays)
    const { error } = await supabase.from('task_assignments')
      .update({ deadline_at: newDeadline.toISOString() })
      .eq('id', assignment.id)
    if (!error) {
      setAssignments(prev => ({
        ...prev,
        [userId]: (prev[userId] ?? []).map(a => a.id === assignment.id
          ? { ...a, deadline_at: newDeadline.toISOString() }
          : a
        ),
      }))
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'white', fontSize: 24, fontWeight: 'bold' }}>Loading...</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', padding: '32px 24px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>

        {/* ヘッダー */}
        <div className="game-card" style={{ padding: '24px 32px', marginBottom: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <h1 className="game-title" style={{ fontSize: 32 }}>部員管理</h1>
              <p style={{ color: '#3d6e00', marginTop: 4, fontSize: 14 }}>部員数: {profiles.length} 名</p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {(userRole === 'admin' || effectivePerms.submission_review) && (
                <a href="/admin/submissions">
                  <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15 }}>
                    提出状況
                  </button>
                </a>
              )}
              {(userRole === 'admin' || effectivePerms.task_management) && (
                <a href="/admin/tasks">
                  <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15 }}>
                    課題管理
                  </button>
                </a>
              )}
              {(userRole === 'admin' || effectivePerms.point_settings) && (
                <a href="/admin/points">
                  <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15 }}>
                    ポイント設定
                  </button>
                </a>
              )}
              {(userRole === 'admin' || effectivePerms.timeline_management) && (
                <a href="/admin/timeline">
                  <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15 }}>
                    🎬 タイムライン管理
                  </button>
                </a>
              )}
              {userRole === 'admin' && (
                <a href="/admin/positions">
                  <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15 }}>
                    🏷 役職管理
                  </button>
                </a>
              )}
              <button
                className="game-button"
                style={{ width: 'auto', padding: '8px 20px', fontSize: 15, background: '#888', borderColor: '#555' }}
                onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
              >
                ログアウト
              </button>
            </div>
          </div>
        </div>

        {/* 部員テーブル */}
        <div className="game-card" style={{ padding: '24px 28px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '3px solid #3d6e00' }}>
                {['ユーザー名', 'コース', 'ステージ', '役職', '課題状況', 'アサイン'].map(h => (
                  <th key={h} className="game-label" style={{ display: 'table-cell', textAlign: 'left', padding: '8px 12px', fontSize: 13 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {profiles.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#6aac14', fontSize: 16 }}>
                    部員が見つかりません
                  </td>
                </tr>
              )}
              {profiles.map((profile, idx) => {
                const memberAssignments = assignments[profile.id] ?? []
                const isExpanded = expandedId === profile.id
                // 部員のコースに合う課題＋全コース対象の課題
                const availableTasks = allTasks.filter(t =>
                  (t.target_course === null || t.target_course === profile.course) &&
                  !memberAssignments.some(a => a.task_id === t.id)
                )

                return (
                  <Fragment key={profile.id}>
                    <tr
                      style={{
                        borderBottom: isExpanded ? 'none' : (idx < profiles.length - 1 ? '1px solid #c8e89a' : 'none'),
                        background: idx % 2 === 0 ? '#f8fff0' : '#ffffff',
                      }}
                    >
                      {/* ユーザー名 */}
                      <td style={{ padding: '10px 12px', color: '#2d5500', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                        {profile.username ?? '—'}
                      </td>

                      {/* コース */}
                      <td style={{ padding: '8px 12px' }}>
                        <select
                          className="game-input"
                          style={{ padding: '6px 10px', fontSize: 13, minWidth: 100 }}
                          value={profile.course ?? ''}
                          disabled={saving[profile.id] === 'course'}
                          onChange={e => handleUpdate(profile.id, 'course', (e.target.value || null) as Course)}
                        >
                          {COURSE_OPTIONS.map(opt => (
                            <option key={String(opt.value)} value={opt.value ?? ''}>{opt.label}</option>
                          ))}
                        </select>
                        {errors[`${profile.id}_course`] && (
                          <div className="game-error" style={{ marginTop: 4, fontSize: 11 }}>{errors[`${profile.id}_course`]}</div>
                        )}
                      </td>

                      {/* ステージ */}
                      <td style={{ padding: '8px 12px' }}>
                        <select
                          className="game-input"
                          style={{ padding: '6px 10px', fontSize: 13, minWidth: 130 }}
                          value={profile.stage ?? ''}
                          disabled={saving[profile.id] === 'stage'}
                          onChange={e => handleUpdate(profile.id, 'stage', (e.target.value || null) as Stage)}
                        >
                          {STAGE_OPTIONS.map(opt => (
                            <option key={String(opt.value)} value={opt.value ?? ''}>{opt.label}</option>
                          ))}
                        </select>
                        {errors[`${profile.id}_stage`] && (
                          <div className="game-error" style={{ marginTop: 4, fontSize: 11 }}>{errors[`${profile.id}_stage`]}</div>
                        )}
                      </td>

                      {/* 役職バッジ */}
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {(profilePositions[profile.id] ?? []).length === 0 ? (
                            <span style={{ color: '#aaa', fontSize: 13 }}>—</span>
                          ) : (profilePositions[profile.id] ?? []).map(pp => (
                            <span key={pp.position_id} style={{
                              background: '#d4f0a0', color: '#2d5500',
                              borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 'bold',
                              border: '1px solid #6aac14', whiteSpace: 'nowrap',
                            }}>
                              {pp.position_name}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* 課題状況バッジ */}
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {memberAssignments.length === 0 ? (
                            <span style={{ color: '#aaa', fontSize: 13 }}>なし</span>
                          ) : memberAssignments.map(a => {
                            const s = STATUS_LABELS[a.status]
                            return (
                              <span key={a.task_id} style={{
                                background: s.bg, color: s.color,
                                borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 'bold',
                                whiteSpace: 'nowrap',
                              }}>
                                {a.task.title.length > 10 ? a.task.title.slice(0, 10) + '…' : a.task.title}
                                {' '}· {s.label}
                              </span>
                            )
                          })}
                        </div>
                      </td>

                      {/* アサインボタン */}
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : profile.id)}
                          style={{
                            padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 'bold',
                            cursor: 'pointer', border: '2px solid #6aac14', whiteSpace: 'nowrap',
                            background: isExpanded ? '#6aac14' : 'white',
                            color: isExpanded ? 'white' : '#3d6e00',
                          }}
                        >
                          {isExpanded ? '閉じる' : 'アサイン'}
                        </button>
                      </td>
                    </tr>

                    {/* 展開パネル */}
                    {isExpanded && (
                      <tr key={`${profile.id}-expanded`} style={{ background: idx % 2 === 0 ? '#f0fae0' : '#f5fde8' }}>
                        <td colSpan={6} style={{ padding: '12px 20px 16px', borderBottom: '1px solid #c8e89a' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                            {/* アサイン済み課題 */}
                            <div>
                              <p className="game-label" style={{ marginBottom: 8 }}>アサイン済み課題</p>
                              {memberAssignments.length === 0 ? (
                                <p style={{ color: '#aaa', fontSize: 13 }}>まだアサインなし</p>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  {memberAssignments.map(a => {
                                    const s = STATUS_LABELS[a.status]
                                    const deadline = getAssignmentDeadline(a)
                                    const deadlineLabel = `${deadline.getMonth() + 1}/${deadline.getDate()}(日)`
                                    return (
                                      <div key={a.task_id} style={{
                                        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                                        background: s.bg, borderRadius: 10, padding: '6px 10px',
                                        border: '1px solid #c8e89a',
                                      }}>
                                        <span style={{ fontSize: 13, color: s.color, fontWeight: 'bold', flex: 1, minWidth: 0 }}>
                                          {a.task.title}
                                        </span>
                                        <span style={{ fontSize: 11, color: s.color, opacity: 0.8, whiteSpace: 'nowrap' }}>
                                          {s.label}
                                        </span>
                                        <span style={{ fontSize: 11, color: '#555', whiteSpace: 'nowrap' }}>
                                          期限: {deadlineLabel}
                                        </span>
                                        <button
                                          onClick={() => adjustDeadline(profile.id, a, -7)}
                                          style={{ padding: '2px 7px', borderRadius: 6, border: '1px solid #aaa', background: '#f5f5f5', color: '#555', cursor: 'pointer', fontSize: 11, fontWeight: 'bold' }}
                                          title="-1週間"
                                        >−7日</button>
                                        <button
                                          onClick={() => adjustDeadline(profile.id, a, 7)}
                                          style={{ padding: '2px 7px', borderRadius: 6, border: '1px solid #6aac14', background: '#e8ffd4', color: '#2d5500', cursor: 'pointer', fontSize: 11, fontWeight: 'bold' }}
                                          title="+1週間"
                                        >+7日</button>
                                        <button
                                          onClick={() => removeAssignment(profile.id, a.task_id)}
                                          style={{
                                            background: 'none', border: 'none', cursor: 'pointer',
                                            color: '#c0392b', fontWeight: 'bold', fontSize: 14, padding: '0 2px',
                                          }}
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>

                              {/* 役職割り当て */}
                            <div>
                              <p className="game-label" style={{ marginBottom: 8 }}>役職</p>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                                {(profilePositions[profile.id] ?? []).length === 0 ? (
                                  <p style={{ color: '#aaa', fontSize: 13 }}>役職なし</p>
                                ) : (profilePositions[profile.id] ?? []).map(pp => (
                                  <div key={pp.position_id} style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    background: '#d4f0a0', borderRadius: 10, padding: '4px 10px',
                                    border: '1px solid #6aac14',
                                  }}>
                                    <span style={{ fontSize: 13, color: '#2d5500', fontWeight: 'bold' }}>
                                      {pp.position_name}
                                    </span>
                                    <button
                                      onClick={() => removePositionFromUser(profile.id, pp.position_id)}
                                      style={{
                                        background: 'none', border: 'none', cursor: 'pointer',
                                        color: '#c0392b', fontWeight: 'bold', fontSize: 14, padding: '0 2px',
                                      }}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ))}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <select
                                  className="game-input"
                                  style={{ padding: '6px 10px', fontSize: 13, flex: 1, maxWidth: 260 }}
                                  value={addingPosition[profile.id] ?? ''}
                                  onChange={e => setAddingPosition(prev => ({ ...prev, [profile.id]: e.target.value }))}
                                >
                                  <option value="">
                                    {allPositions.filter(p => !(profilePositions[profile.id] ?? []).some(pp => pp.position_id === p.id)).length === 0
                                      ? '追加できる役職がありません'
                                      : '役職を選択…'}
                                  </option>
                                  {allPositions
                                    .filter(p => !(profilePositions[profile.id] ?? []).some(pp => pp.position_id === p.id))
                                    .map(p => (
                                      <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                                <button
                                  onClick={() => addPositionToUser(profile.id)}
                                  disabled={!addingPosition[profile.id]}
                                  style={{
                                    padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 'bold',
                                    cursor: addingPosition[profile.id] ? 'pointer' : 'not-allowed',
                                    border: '2px solid #3d6e00',
                                    background: addingPosition[profile.id] ? '#6aac14' : '#ccc',
                                    color: 'white',
                                  }}
                                >
                                  割り当て
                                </button>
                              </div>
                            </div>

                          {/* 課題を追加 */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <p className="game-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>課題を追加:</p>
                              <select
                                className="game-input"
                                style={{ padding: '6px 10px', fontSize: 13, flex: 1, maxWidth: 320 }}
                                value={addingTask[profile.id] ?? ''}
                                onChange={e => setAddingTask(prev => ({ ...prev, [profile.id]: e.target.value }))}
                              >
                                <option value="">
                                  {availableTasks.length === 0 ? '追加できる課題がありません' : '課題を選択…'}
                                </option>
                                {availableTasks.map(t => (
                                  <option key={t.id} value={t.id}>
                                    {t.title}{t.target_course ? ` [${t.target_course}]` : ''}
                                  </option>
                                ))}
                              </select>
                              <button
                                onClick={() => addAssignment(profile.id)}
                                disabled={!addingTask[profile.id]}
                                style={{
                                  padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 'bold',
                                  cursor: addingTask[profile.id] ? 'pointer' : 'not-allowed',
                                  border: '2px solid #3d6e00',
                                  background: addingTask[profile.id] ? '#6aac14' : '#ccc',
                                  color: 'white',
                                }}
                              >
                                追加
                              </button>
                            </div>

                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
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

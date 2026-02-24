"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../lib/supabase'

type Course = 'Unity' | 'Blender' | null
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
  task_id: string
  user_id: string
  status: 'assigned' | 'in_progress' | 'submitted'
  task: { title: string }
}

const COURSE_OPTIONS: { label: string; value: Course }[] = [
  { label: '—', value: null },
  { label: 'Unity', value: 'Unity' },
  { label: 'Blender', value: 'Blender' },
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
  const [profiles, setProfiles]     = useState<Profile[]>([])
  const [allTasks, setAllTasks]     = useState<Task[]>([])
  const [assignments, setAssignments] = useState<Record<string, Assignment[]>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [addingTask, setAddingTask] = useState<Record<string, string>>({})
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState<Record<string, string>>({})
  const [errors, setErrors]         = useState<Record<string, string>>({})

  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser()
        if (authError || !authData?.user) { router.replace('/login'); return }

        const { data: me, error: meError } = await supabase
          .from('profiles').select('role').eq('id', authData.user.id).single()
        if (meError || !me || me.role !== 'admin') { router.replace('/dashboard'); return }

        const [profilesRes, tasksRes, assignmentsRes] = await Promise.all([
          supabase.from('profiles').select('id, username, email, course, stage').order('created_at', { ascending: true }),
          supabase.from('tasks').select('id, title, target_course').eq('is_active', true),
          supabase.from('task_assignments').select('task_id, user_id, status, task:tasks(title)'),
        ])

        if (!mounted) return
        setProfiles(profilesRes.data ?? [])
        setAllTasks(tasksRes.data ?? [])

        // userId → Assignment[] のマップを構築
        const map: Record<string, Assignment[]> = {}
        for (const a of (assignmentsRes.data ?? [])) {
          if (!map[a.user_id]) map[a.user_id] = []
          map[a.user_id].push(a as Assignment)
        }
        setAssignments(map)
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

    const { error } = await supabase.from('task_assignments').insert({ task_id: taskId, user_id: userId })
    if (!error) {
      setAssignments(prev => ({
        ...prev,
        [userId]: [...(prev[userId] ?? []), { task_id: taskId, user_id: userId, status: 'assigned', task: { title: task.title } }],
      }))
      setAddingTask(prev => { const next = { ...prev }; delete next[userId]; return next })
    }
  }

  async function removeAssignment(userId: string, taskId: string) {
    const { error } = await supabase.from('task_assignments')
      .delete().eq('task_id', taskId).eq('user_id', userId)
    if (!error) {
      setAssignments(prev => ({
        ...prev,
        [userId]: (prev[userId] ?? []).filter(a => a.task_id !== taskId),
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 className="game-title" style={{ fontSize: 32 }}>部員管理</h1>
              <p style={{ color: '#3d6e00', marginTop: 4, fontSize: 14 }}>部員数: {profiles.length} 名</p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <a href="/admin/submissions">
                <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15 }}>
                  提出状況
                </button>
              </a>
              <a href="/admin/tasks">
                <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15 }}>
                  課題管理
                </button>
              </a>
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
                {['ユーザー名', 'コース', 'ステージ', '課題状況', 'アサイン'].map(h => (
                  <th key={h} className="game-label" style={{ textAlign: 'left', padding: '8px 12px', fontSize: 13 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {profiles.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 40, color: '#6aac14', fontSize: 16 }}>
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
                  <>
                    <tr
                      key={profile.id}
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
                          style={{ padding: '6px 10px', fontSize: 13 }}
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
                          style={{ padding: '6px 10px', fontSize: 13 }}
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
                      <td style={{ padding: '8px 12px' }}>
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : profile.id)}
                          style={{
                            padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 'bold',
                            cursor: 'pointer', border: '2px solid #6aac14',
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
                        <td colSpan={5} style={{ padding: '12px 20px 16px', borderBottom: '1px solid #c8e89a' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                            {/* アサイン済み課題 */}
                            <div>
                              <p className="game-label" style={{ marginBottom: 8 }}>アサイン済み課題</p>
                              {memberAssignments.length === 0 ? (
                                <p style={{ color: '#aaa', fontSize: 13 }}>まだアサインなし</p>
                              ) : (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                  {memberAssignments.map(a => {
                                    const s = STATUS_LABELS[a.status]
                                    return (
                                      <div key={a.task_id} style={{
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        background: s.bg, borderRadius: 10, padding: '4px 10px',
                                        border: '1px solid #c8e89a',
                                      }}>
                                        <span style={{ fontSize: 13, color: s.color, fontWeight: 'bold' }}>
                                          {a.task.title}
                                        </span>
                                        <span style={{ fontSize: 11, color: s.color, opacity: 0.8 }}>
                                          · {s.label}
                                        </span>
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
                  </>
                )
              })}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  )
}

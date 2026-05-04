"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { marked } from 'marked'
import supabase from '../../lib/supabase'
import { List, ChevronLeft, ClipboardList, CheckCircle2 } from 'lucide-react'

interface PublicTask {
  id: string
  title: string
  description: string | null
  description_is_markdown: boolean
  target_course: string | null
  progress_number: number | null
}

interface UserAssignment {
  task_id: string
  status: string
  is_assigned: boolean
}

type CourseKey = 'Unity' | 'Blender' | 'Web'

const COURSE_TABS: { key: CourseKey; label: string }[] = [
  { key: 'Unity',   label: 'Unity' },
  { key: 'Blender', label: 'Blender' },
  { key: 'Web',     label: 'Web開発' },
]

export default function TaskListPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [selectedCourse, setSelectedCourse] = useState<CourseKey>('Unity')
  const [tasks, setTasks] = useState<PublicTask[]>([])
  const [assignments, setAssignments] = useState<UserAssignment[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [operating, setOperating] = useState<Record<string, boolean>>({})
  const [opError, setOpError] = useState<Record<string, string>>({})
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    async function init() {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError || !authData?.user) { router.replace('/login'); return }
      if (mounted) setUserId(authData.user.id)

      const { data: assignList } = await supabase
        .from('task_assignments')
        .select('task_id, status, is_assigned')
        .eq('user_id', authData.user.id)

      if (mounted) {
        setAssignments(assignList ?? [])
        setLoading(false)
      }
    }
    init()
    return () => { mounted = false }
  }, [router])

  useEffect(() => {
    if (!userId) return
    let mounted = true
    async function fetchTasks() {
      const { data } = await supabase
        .from('tasks')
        .select('id, title, description, description_is_markdown, target_course, progress_number')
        .eq('is_public', true)
        .eq('target_course', selectedCourse)
        .order('progress_number', { ascending: true, nullsFirst: false })
      if (mounted) setTasks(data ?? [])
    }
    fetchTasks()
    return () => { mounted = false }
  }, [selectedCourse, userId])

  function getAssignmentState(taskId: string): 'none' | 'active' | 'submitted' {
    const a = assignments.find(x => x.task_id === taskId)
    if (!a) return 'none'
    if (a.status === 'submitted') return 'submitted'
    if (a.is_assigned) return 'active'
    return 'none'
  }

  async function handleAssign(taskId: string) {
    setOperating(prev => ({ ...prev, [taskId]: true }))
    setOpError(prev => ({ ...prev, [taskId]: '' }))
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) throw new Error('ログインが必要です')
      const res = await fetch('/api/assign-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ taskId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'アサインに失敗しました')
      setAssignments(prev => {
        const existing = prev.find(x => x.task_id === taskId)
        if (existing) return prev.map(x => x.task_id === taskId ? { ...x, is_assigned: true, status: 'assigned' } : x)
        return [...prev, { task_id: taskId, status: 'assigned', is_assigned: true }]
      })
    } catch (err: any) {
      setOpError(prev => ({ ...prev, [taskId]: err.message }))
    } finally {
      setOperating(prev => ({ ...prev, [taskId]: false }))
    }
  }

  async function handleCancel(taskId: string) {
    setOperating(prev => ({ ...prev, [taskId]: true }))
    setOpError(prev => ({ ...prev, [taskId]: '' }))
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) throw new Error('ログインが必要です')
      const res = await fetch('/api/assign-task', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ taskId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'キャンセルに失敗しました')
      setAssignments(prev => prev.map(x => x.task_id === taskId ? { ...x, is_assigned: false } : x))
    } catch (err: any) {
      setOpError(prev => ({ ...prev, [taskId]: err.message }))
    } finally {
      setOperating(prev => ({ ...prev, [taskId]: false }))
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
    <div style={{ minHeight: '100vh', padding: '24px 24px 60px' }}>
      {/* ← ダッシュボードへ戻るボタン */}
      <a href="/dashboard" style={{ textDecoration: 'none' }}>
        <button style={{
          position: 'fixed', top: 16, left: 16, zIndex: 50,
          background: '#1a3a00', border: '2px solid #3d6e00',
          borderRadius: 8, padding: '6px 12px',
          cursor: 'pointer', color: '#6aac14', fontSize: 14,
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontWeight: 'bold',
        }}>
          <ChevronLeft size={16}/>ダッシュボード
        </button>
      </a>

      <div style={{ maxWidth: 680, margin: '0 auto', paddingTop: 56 }}>

        {/* ヘッダー */}
        <div style={{
          background: 'linear-gradient(135deg, #1a3a00 0%, #2d5500 55%, #3d6e00 100%)',
          borderRadius: 10, padding: '24px 28px', marginBottom: 20,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(106,172,20,0.18) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <p style={{ color: '#6aac14', fontSize: 10, fontWeight: 'bold', letterSpacing: '0.12em', marginBottom: 4 }}>TASK CATALOG</p>
          <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 'bold', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <List size={20}/>課題一覧
          </h1>
          <p style={{ color: 'rgba(168,216,112,0.8)', fontSize: 13, fontWeight: 'bold', margin: 0 }}>
            気になる課題をアサインして取り組もう
          </p>
        </div>

        {/* コースタブ */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {COURSE_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setSelectedCourse(tab.key); setExpandedId(null) }}
              style={{
                flex: 1, padding: '10px 4px', borderRadius: 8,
                border: `2px solid ${selectedCourse === tab.key ? '#6aac14' : '#3d6e00'}`,
                background: selectedCourse === tab.key ? '#6aac14' : '#1a3a00',
                color: selectedCourse === tab.key ? '#fff' : '#a8d870',
                fontWeight: 'bold', fontSize: 14, cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 課題リスト */}
        <style>{`
          @keyframes taskSlideDown {
            from { opacity: 0; transform: translateY(-8px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>
        {tasks.length === 0 ? (
          <div className="game-card" style={{ padding: '32px', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
              <ClipboardList size={28} color="#6aac14"/>
            </div>
            <p style={{ color: '#6aac14', fontSize: 15 }}>公開されている課題はまだありません</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {tasks.map(task => {
              const state = getAssignmentState(task.id)
              const isOpen = expandedId === task.id
              const busy = operating[task.id] ?? false

              const cardBorder =
                state === 'submitted' ? '2px solid #3d6e00' :
                state === 'active'    ? '2px solid #6aac14' :
                                        '2px solid #c8e890'
              const headerBg =
                isOpen               ? '#f8fff0' :
                state === 'submitted' ? 'linear-gradient(100deg, #1a3a00 0%, #2d5500 55%, #3a6800 100%)' :
                state === 'active'    ? 'linear-gradient(100deg, #edfff2 0%, #f8fff8 100%)' :
                                        '#ffffff'
              const chevronColor =
                state === 'submitted' && !isOpen ? '#a8d870' :
                state === 'active'    && !isOpen ? '#6aac14' :
                                                    '#6aac14'
              const titleColor =
                state === 'submitted' && !isOpen ? '#e8ffd4' :
                                                    '#2d5500'
              const numColor =
                state === 'submitted' && !isOpen ? '#a8d870' : '#6aac14'
              const stateLabel =
                state === 'submitted' ? 'COMPLETED' :
                state === 'active'    ? 'IN PROGRESS' :
                                        null

              return (
                <div
                  key={task.id}
                  style={{
                    border: cardBorder, borderRadius: 12, overflow: 'hidden',
                    transition: 'border-color 0.3s, box-shadow 0.3s',
                    boxShadow: isOpen ? '0 4px 16px rgba(61,110,0,0.13)' : '0 1px 4px rgba(0,0,0,0.06)',
                  }}
                >
                  {/* ヘッダー */}
                  <div
                    onClick={() => setExpandedId(isOpen ? null : task.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '13px 18px', cursor: 'pointer', userSelect: 'none',
                      background: headerBg,
                      transition: 'background 0.35s ease',
                      position: 'relative', overflow: 'hidden',
                    }}
                  >
                    {/* 装飾円（submitted / active） */}
                    {state !== 'none' && !isOpen && (
                      <div style={{
                        position: 'absolute', top: -24, right: -8, width: 90, height: 90,
                        borderRadius: '50%', pointerEvents: 'none',
                        background: state === 'submitted'
                          ? 'radial-gradient(circle, rgba(168,216,112,0.22) 0%, transparent 70%)'
                          : 'radial-gradient(circle, rgba(106,172,20,0.15) 0%, transparent 70%)',
                      }} />
                    )}

                    {/* シェブロン */}
                    <span style={{
                      fontSize: 12, flexShrink: 0, display: 'inline-block',
                      transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform 0.25s ease, color 0.3s',
                      color: chevronColor,
                    }}>▶</span>

                    {/* テキスト */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {stateLabel && !isOpen && (
                        <p style={{
                          fontSize: 9, fontWeight: 'bold', letterSpacing: '0.14em', margin: '0 0 2px',
                          color: state === 'submitted' ? '#6aac14' : '#3d8a00',
                          transition: 'color 0.3s',
                        }}>{stateLabel}</p>
                      )}
                      <p style={{
                        fontWeight: 'bold', fontSize: 15, margin: 0,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        color: titleColor, transition: 'color 0.35s ease',
                      }}>
                        {task.progress_number != null && (
                          <span style={{ marginRight: 6, transition: 'color 0.35s', color: numColor }}>
                            #{task.progress_number}
                          </span>
                        )}
                        {task.title}
                      </p>
                    </div>

                    {/* バッジ */}
                    {state === 'submitted' && (
                      <span style={{
                        borderRadius: 12, padding: '3px 10px', fontSize: 11, fontWeight: 'bold',
                        whiteSpace: 'nowrap', flexShrink: 0,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        transition: 'background 0.35s, color 0.35s, border-color 0.35s',
                        ...(isOpen
                          ? { background: '#d4f5c8', color: '#1a6e00', border: '1px solid #b0d880' }
                          : { background: 'rgba(168,216,112,0.18)', color: '#a8d870', border: '1px solid rgba(168,216,112,0.35)' }
                        ),
                      }}>
                        <CheckCircle2 size={11}/>提出済み
                      </span>
                    )}
                    {state === 'active' && (
                      <span style={{
                        background: isOpen ? '#d4f0a0' : '#6aac14',
                        color: isOpen ? '#3d6e00' : '#fff',
                        borderRadius: 12, padding: '3px 10px', fontSize: 11, fontWeight: 'bold',
                        whiteSpace: 'nowrap', flexShrink: 0,
                        transition: 'background 0.35s, color 0.35s',
                      }}>
                        アサイン中
                      </span>
                    )}
                  </div>

                  {/* 展開コンテンツ */}
                  {isOpen && (
                    <div style={{
                      borderTop: '2px solid #d4f0a0',
                      padding: '16px 20px',
                      display: 'flex', flexDirection: 'column', gap: 14,
                      background: '#f8fff0',
                      animation: 'taskSlideDown 0.22s ease',
                    }}>
                      <div>
                        <p style={{ color: '#6aac14', fontSize: 11, fontWeight: 'bold', letterSpacing: '0.1em', margin: '0 0 4px' }}>タイトル</p>
                        <p style={{ color: '#2d5500', fontSize: 16, fontWeight: 'bold', margin: 0 }}>{task.title}</p>
                      </div>

                      <div>
                        <p style={{ color: '#6aac14', fontSize: 11, fontWeight: 'bold', letterSpacing: '0.1em', margin: '0 0 6px' }}>課題内容</p>
                        {task.description ? (
                          task.description_is_markdown ? (
                            <div
                              className="markdown-body"
                              style={{ fontSize: 14, color: '#3d6e00', lineHeight: 1.7 }}
                              dangerouslySetInnerHTML={{ __html: marked.parse(task.description, { breaks: true }) as string }}
                            />
                          ) : (
                            <p style={{ color: '#3d6e00', fontSize: 14, whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.7 }}>{task.description}</p>
                          )
                        ) : (
                          <p style={{ color: '#aaa', fontSize: 13, margin: 0 }}>（説明なし）</p>
                        )}
                      </div>

                      {opError[task.id] && (
                        <div className="game-error">{opError[task.id]}</div>
                      )}

                      <div>
                        {state === 'submitted' ? (
                          <button
                            disabled
                            style={{
                              width: '100%', padding: '12px', borderRadius: 8,
                              border: '2px solid #b0d880', background: '#e8ffd4',
                              color: '#3d6e00', fontWeight: 'bold', fontSize: 15,
                              cursor: 'not-allowed', opacity: 0.7,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            }}
                          >
                            <CheckCircle2 size={16}/>提出済み
                          </button>
                        ) : state === 'active' ? (
                          <button
                            onClick={() => handleCancel(task.id)}
                            disabled={busy}
                            style={{
                              width: '100%', padding: '12px', borderRadius: 8,
                              border: '2px solid #c0392b', background: '#fdecea',
                              color: '#c0392b', fontWeight: 'bold', fontSize: 15,
                              cursor: busy ? 'not-allowed' : 'pointer',
                              opacity: busy ? 0.7 : 1,
                            }}
                          >
                            {busy ? '処理中…' : 'アサインをキャンセルする'}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleAssign(task.id)}
                            disabled={busy}
                            className="game-button"
                            style={{
                              width: '100%', padding: '12px', fontSize: 15,
                              cursor: busy ? 'not-allowed' : 'pointer',
                              opacity: busy ? 0.7 : 1,
                            }}
                          >
                            {busy ? '処理中…' : 'この課題をアサインする'}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

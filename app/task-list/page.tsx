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
        {tasks.length === 0 ? (
          <div className="game-card" style={{ padding: '32px', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
              <ClipboardList size={28} color="#6aac14"/>
            </div>
            <p style={{ color: '#6aac14', fontSize: 15 }}>公開されている課題はまだありません</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tasks.map(task => {
              const state = getAssignmentState(task.id)
              const isOpen = expandedId === task.id
              const busy = operating[task.id] ?? false

              return (
                <div key={task.id} className="game-card" style={{ padding: 0, overflow: 'hidden' }}>
                  {/* アコーディオンヘッダー */}
                  <div
                    onClick={() => setExpandedId(isOpen ? null : task.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '14px 20px', cursor: 'pointer', userSelect: 'none',
                    }}
                  >
                    <span style={{
                      fontSize: 13, color: '#6aac14', flexShrink: 0,
                      display: 'inline-block',
                      transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                    }}>▶</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 'bold', color: '#2d5500', fontSize: 15, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {task.progress_number != null && (
                          <span style={{ color: '#6aac14', marginRight: 6 }}>#{task.progress_number}</span>
                        )}
                        {task.title}
                      </p>
                    </div>
                    {state === 'submitted' && (
                      <span style={{ background: '#c8f0c0', color: '#1a6e00', borderRadius: 12, padding: '3px 10px', fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <CheckCircle2 size={12}/>提出済み
                      </span>
                    )}
                    {state === 'active' && (
                      <span style={{ background: '#d4f0a0', color: '#3d6e00', borderRadius: 12, padding: '3px 10px', fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        アサイン中
                      </span>
                    )}
                  </div>

                  {/* アコーディオン展開部分 */}
                  {isOpen && (
                    <div style={{ borderTop: '2px solid #d4f0a0', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {/* タイトル */}
                      <div>
                        <p style={{ color: '#6aac14', fontSize: 11, fontWeight: 'bold', letterSpacing: '0.1em', margin: '0 0 4px' }}>タイトル</p>
                        <p style={{ color: '#2d5500', fontSize: 16, fontWeight: 'bold', margin: 0 }}>{task.title}</p>
                      </div>

                      {/* 課題内容 */}
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

                      {/* エラー表示 */}
                      {opError[task.id] && (
                        <div className="game-error">{opError[task.id]}</div>
                      )}

                      {/* アクションボタン */}
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

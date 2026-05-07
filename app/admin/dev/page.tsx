'use client'
import { Fragment, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase'
import { getEffectivePermissions } from '@/lib/permissions'
import { Wrench, ClipboardList, Inbox, Bug, Lightbulb, Plus, ChevronRight, MessageSquare, Activity } from 'lucide-react'

type Tab = 'todo' | 'reports'
type TaskStatus = 'todo' | 'in_progress' | 'done'
type ReportStatus = 'pending' | 'approved' | 'rejected'
type ReportFilter = 'all' | ReportStatus

interface Profile { id: string; username: string }
interface BugReport {
  id: string
  user_id: string
  type: 'bug' | 'feature'
  summary: string
  condition: string | null
  error_msg: string | null
  prediction: string | null
  target_area: string | null
  implementation_idea: string | null
  status: ReportStatus
  awarded_points: number | null
  created_at: string
  profiles: { username: string } | null
}
interface DevTask {
  id: string
  summary: string
  detail: string | null
  deadline: string | null
  report_id: string | null
  status: TaskStatus
  created_at: string
  dev_task_assignees: { user_id: string }[]
  bug_reports: { summary: string } | null
}
interface DevTaskProgress {
  id: string
  task_id: string
  user_id: string
  content: string
  created_at: string
  profiles: { username: string } | null
}
interface DevTaskFeedback {
  id: string
  task_id: string
  user_id: string
  content: string
  created_at: string
  profiles: { username: string } | null
}

interface TaskLazyData {
  progress: DevTaskProgress[]
  feedback: DevTaskFeedback[]
  loaded: boolean
  loading: boolean
}

const STATUS_LABELS: Record<TaskStatus, string> = { todo: 'ToDo', in_progress: '進行中', done: '完了' }
const STATUS_COLORS: Record<TaskStatus, { bg: string; text: string }> = {
  todo:        { bg: '#3d6e00', text: 'white' },
  in_progress: { bg: '#b8860b', text: 'white' },
  done:        { bg: '#999',    text: 'white' },
}
const REPORT_STATUS_LABELS: Record<ReportStatus, string> = { pending: '未処理', approved: '承認済', rejected: '却下' }
const REPORT_STATUS_COLORS: Record<ReportStatus, { bg: string; text: string }> = {
  pending:  { bg: '#b8860b', text: 'white' },
  approved: { bg: '#3d6e00', text: 'white' },
  rejected: { bg: '#999',    text: 'white' },
}

export default function DevManagePage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('todo')
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string>('')

  const [profiles, setProfiles] = useState<Profile[]>([])
  const [reports, setReports] = useState<BugReport[]>([])

  // ToDo
  const [tasks, setTasks] = useState<DevTask[]>([])
  const [taskSections, setTaskSections] = useState<Record<string, { detail: boolean; progress: boolean; feedback: boolean }>>({})
  const [taskLazy, setTaskLazy] = useState<Record<string, TaskLazyData>>({})
  const [feedbackInputs, setFeedbackInputs] = useState<Record<string, string>>({})
  const [addingFeedback, setAddingFeedback] = useState<Record<string, boolean>>({})

  const [showAddForm, setShowAddForm] = useState(false)
  const [newSummary, setNewSummary] = useState('')
  const [newDetail, setNewDetail] = useState('')
  const [newDeadline, setNewDeadline] = useState('')
  const [newAssignees, setNewAssignees] = useState<string[]>([])
  const [newReportId, setNewReportId] = useState('')
  const [addingTask, setAddingTask] = useState(false)

  // 報告一覧
  const [expandedReport, setExpandedReport] = useState<string | null>(null)
  const [reportFilter, setReportFilter] = useState<ReportFilter>('all')
  const [pointInputs, setPointInputs] = useState<Record<string, string>>({})
  const [processingReport, setProcessingReport] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      const isAdmin = profile?.role === 'admin'
      if (!isAdmin) {
        const perms = await getEffectivePermissions(user.id)
        if (!perms.dev_management) { router.push('/dashboard'); return }
      }

      setCurrentUserId(user.id)

      // 初期ロード: タスク一覧は基本項目のみ（詳細・進捗・フィードバックは遅延ロード）
      const [profilesRes, reportsRes, tasksRes] = await Promise.all([
        supabase.from('profiles').select('id, username').order('username'),
        supabase.from('bug_reports').select('*, profiles(username)').order('created_at', { ascending: false }),
        supabase.from('dev_tasks')
          .select('id, summary, detail, deadline, report_id, status, created_at, dev_task_assignees(user_id), bug_reports(summary)')
          .order('created_at', { ascending: false }),
      ])

      setProfiles(profilesRes.data ?? [])
      setReports((reportsRes.data ?? []) as BugReport[])
      setTasks((tasksRes.data ?? []) as unknown as DevTask[])
      setLoading(false)
    }
    init()
  }, [router])

  async function loadTaskDetail(taskId: string) {
    if (taskLazy[taskId]?.loaded || taskLazy[taskId]?.loading) return
    setTaskLazy(prev => ({ ...prev, [taskId]: { progress: [], feedback: [], loaded: false, loading: true } }))
    const [progressRes, feedbackRes] = await Promise.all([
      supabase.from('dev_task_progress').select('*, profiles(username)').eq('task_id', taskId).order('created_at'),
      supabase.from('dev_task_feedback').select('*, profiles(username)').eq('task_id', taskId).order('created_at'),
    ])
    setTaskLazy(prev => ({
      ...prev,
      [taskId]: {
        progress: (progressRes.data ?? []) as DevTaskProgress[],
        feedback: (feedbackRes.data ?? []) as DevTaskFeedback[],
        loaded: true,
        loading: false,
      },
    }))
  }

  function toggleSection(taskId: string, key: 'detail' | 'progress' | 'feedback') {
    setTaskSections(prev => {
      const cur = prev[taskId] ?? { detail: false, progress: false, feedback: false }
      const next = { ...cur, [key]: !cur[key] }
      return { ...prev, [taskId]: next }
    })
    // セクションを開いたとき初回のみ遅延ロード
    const cur = taskSections[taskId]
    const isOpening = !(cur?.[key])
    if (isOpening) loadTaskDetail(taskId)
  }

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault()
    if (!newSummary.trim()) return
    setAddingTask(true)

    const { data: task, error } = await supabase
      .from('dev_tasks')
      .insert({ summary: newSummary.trim(), detail: newDetail.trim() || null, deadline: newDeadline || null, report_id: newReportId || null })
      .select('id, summary, detail, deadline, report_id, status, created_at, dev_task_assignees(user_id), bug_reports(summary)')
      .single()

    if (error || !task) { alert('追加に失敗しました: ' + error?.message); setAddingTask(false); return }

    if (newAssignees.length > 0) {
      await supabase.from('dev_task_assignees').insert(newAssignees.map(uid => ({ task_id: task.id, user_id: uid })))
      task.dev_task_assignees = newAssignees.map(uid => ({ user_id: uid }))
    }

    setTasks(prev => [task as DevTask, ...prev])
    setNewSummary(''); setNewDetail(''); setNewDeadline(''); setNewAssignees([]); setNewReportId('')
    setAddingTask(false)
    setShowAddForm(false)
  }

  async function cycleTaskStatus(task: DevTask) {
    const next: TaskStatus = task.status === 'todo' ? 'in_progress' : task.status === 'in_progress' ? 'done' : 'todo'
    await supabase.from('dev_tasks').update({ status: next }).eq('id', task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next } : t))
  }

  async function handleAddFeedback(taskId: string) {
    const content = feedbackInputs[taskId]?.trim()
    if (!content || !currentUserId) return
    setAddingFeedback(prev => ({ ...prev, [taskId]: true }))
    const { data, error } = await supabase
      .from('dev_task_feedback')
      .insert({ task_id: taskId, user_id: currentUserId, content })
      .select('*, profiles(username)')
      .single()
    if (!error && data) {
      setTaskLazy(prev => ({
        ...prev,
        [taskId]: { ...prev[taskId], feedback: [...(prev[taskId]?.feedback ?? []), data as DevTaskFeedback] },
      }))
      setFeedbackInputs(prev => ({ ...prev, [taskId]: '' }))
    }
    setAddingFeedback(prev => ({ ...prev, [taskId]: false }))
  }

  async function handleApprove(report: BugReport) {
    const pts = parseInt(pointInputs[report.id] ?? '0')
    if (isNaN(pts) || pts < 0) { alert('正しいポイント数を入力してください'); return }
    setProcessingReport(report.id)

    if (pts > 0) {
      const { error: rpcErr } = await supabase.rpc('add_points_to_user', { target_user_id: report.user_id, amount: pts })
      if (rpcErr) { alert('ポイント付与に失敗しました: ' + rpcErr.message); setProcessingReport(null); return }
    }
    const { error } = await supabase.from('bug_reports').update({ status: 'approved', awarded_points: pts }).eq('id', report.id)
    if (error) { alert('承認に失敗しました: ' + error.message); setProcessingReport(null); return }

    setReports(prev => prev.map(r => r.id === report.id ? { ...r, status: 'approved', awarded_points: pts } : r))
    setProcessingReport(null)
  }

  async function handleReject(report: BugReport) {
    if (!confirm('この報告を却下しますか？')) return
    setProcessingReport(report.id)
    const { error } = await supabase.from('bug_reports').update({ status: 'rejected' }).eq('id', report.id)
    if (error) { alert('却下に失敗しました: ' + error.message); setProcessingReport(null); return }
    setReports(prev => prev.map(r => r.id === report.id ? { ...r, status: 'rejected' } : r))
    setProcessingReport(null)
  }

  function toggleAssignee(uid: string) {
    setNewAssignees(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid])
  }

  const filteredReports = reportFilter === 'all' ? reports : reports.filter(r => r.status === reportFilter)

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#3d6e00', fontWeight: 'bold' }}>読み込み中...</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', padding: '80px 16px 40px' }}>
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

      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1 className="game-title" style={{ textAlign: 'center', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <Wrench size={24}/>開発者管理
        </h1>

        {/* タブ */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {(['todo', 'reports'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: '10px 0',
                background: tab === t ? '#3d6e00' : 'white',
                border: '3px solid #3d6e00', borderRadius: 12,
                color: tab === t ? 'white' : '#3d6e00',
                fontWeight: 'bold', fontSize: 15, cursor: 'pointer',
                boxShadow: tab === t ? '0 4px 0 #0d2000' : '0 4px 0 #3d6e00',
              }}
            >
              {t === 'todo'
                ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><ClipboardList size={15}/>To Do 管理</span>
                : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Inbox size={15}/>報告一覧</span>
              }
            </button>
          ))}
        </div>

        {/* ── To Do 管理 ── */}
        {tab === 'todo' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* タスク追加ボタン */}
            <button
              onClick={() => setShowAddForm(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '12px 0', background: showAddForm ? '#2d5500' : '#3d6e00',
                border: '3px solid #3d6e00', borderRadius: 12,
                color: 'white', fontWeight: 'bold', fontSize: 15, cursor: 'pointer',
                boxShadow: '0 4px 0 #0d2000',
              }}
            >
              <Plus size={18}/> タスクを追加
            </button>

            {/* タスク追加フォーム（折りたたみ） */}
            {showAddForm && (
              <div className="game-card" style={{ padding: 20 }}>
                <form onSubmit={handleAddTask} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label className="game-label">概要 <span style={{ color: '#e53e3e' }}>*</span></label>
                    <input className="game-input" style={{ width: '100%', boxSizing: 'border-box' }} value={newSummary} onChange={e => setNewSummary(e.target.value)} placeholder="タスクの概要" required />
                  </div>
                  <div>
                    <label className="game-label">詳細 <span style={{ color: '#5a8a1a', fontSize: 12 }}>(任意)</span></label>
                    <textarea className="game-input" style={{ width: '100%', boxSizing: 'border-box', minHeight: 60, resize: 'vertical' }} value={newDetail} onChange={e => setNewDetail(e.target.value)} placeholder="詳しい説明" />
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label className="game-label">実装期限 <span style={{ color: '#5a8a1a', fontSize: 12 }}>(任意)</span></label>
                      <input className="game-input" type="date" style={{ width: '100%', boxSizing: 'border-box' }} value={newDeadline} onChange={e => setNewDeadline(e.target.value)} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="game-label">紐付け報告 <span style={{ color: '#5a8a1a', fontSize: 12 }}>(任意)</span></label>
                      <select className="game-input" style={{ width: '100%', boxSizing: 'border-box' }} value={newReportId} onChange={e => setNewReportId(e.target.value)}>
                        <option value="">なし</option>
                        {reports.filter(r => r.status !== 'rejected').map(r => (
                          <option key={r.id} value={r.id}>[{r.type === 'bug' ? '不具合' : '要望'}] {r.summary.slice(0, 30)}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="game-label">担当者 <span style={{ color: '#5a8a1a', fontSize: 12 }}>(複数選択可)</span></label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      {profiles.map(p => (
                        <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#3d6e00', cursor: 'pointer', fontSize: 13 }}>
                          <input type="checkbox" checked={newAssignees.includes(p.id)} onChange={() => toggleAssignee(p.id)} style={{ accentColor: '#6aac14' }} />
                          {p.username}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="submit" className="game-button" disabled={addingTask} style={{ flex: 1 }}>
                      {addingTask ? '追加中...' : '追加'}
                    </button>
                    <button type="button" onClick={() => setShowAddForm(false)} style={{ flex: 1, padding: '10px 0', background: 'white', border: '3px solid #3d6e00', borderRadius: 12, color: '#3d6e00', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 0 #3d6e00' }}>
                      キャンセル
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* タスクリスト */}
            {tasks.length === 0 && <p style={{ color: '#3d6e00', textAlign: 'center', fontWeight: 'bold' }}>タスクはありません</p>}
            {tasks.map(task => {
              const assigneeNames = task.dev_task_assignees.map(a => profiles.find(p => p.id === a.user_id)?.username ?? '').filter(Boolean)
              const sc = STATUS_COLORS[task.status]
              const sec = taskSections[task.id] ?? { detail: false, progress: false, feedback: false }
              const lazy = taskLazy[task.id]

              return (
                <div key={task.id} className="game-card" style={{ padding: 0, overflow: 'hidden' }}>

                  {/* ── タスクタイトル行（アコーディオンではない） */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '2px solid #e8f5d0' }}>
                    <button
                      onClick={() => cycleTaskStatus(task)}
                      style={{ background: sc.bg, color: sc.text, borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap', border: 'none', cursor: 'pointer' }}
                      title="クリックでステータス変更"
                    >
                      {STATUS_LABELS[task.status]}
                    </button>
                    <span style={{ color: '#2d5500', flex: 1, fontSize: 15, fontWeight: 'bold' }}>{task.summary}</span>
                    {task.deadline && <span style={{ color: '#5a8a1a', fontSize: 12, whiteSpace: 'nowrap' }}>{task.deadline}</span>}
                    {assigneeNames.length > 0 && (
                      <span style={{ color: '#3d6e00', fontSize: 12, whiteSpace: 'nowrap' }}>{assigneeNames.join(', ')}</span>
                    )}
                  </div>

                  {/* ── 詳細 サブアコーディオン */}
                  <div style={{ borderBottom: '1px solid #e8f5d0' }}>
                    <div
                      onClick={() => toggleSection(task.id, 'detail')}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', cursor: 'pointer', background: '#f8fff0', userSelect: 'none' }}
                    >
                      <ChevronRight size={14} color="#6aac14" style={{ transform: sec.detail ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }} />
                      <span style={{ fontWeight: 'bold', color: '#2d5500', fontSize: 14, flex: 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <ClipboardList size={14}/>詳細
                      </span>
                      {task.bug_reports && (
                        <span style={{ color: '#5a8a1a', fontSize: 12, whiteSpace: 'nowrap' }}>紐付けあり</span>
                      )}
                    </div>
                    {sec.detail && (
                      <div style={{ padding: '12px 16px 14px', borderTop: '1px solid #e8f5d0' }}>
                        {task.detail
                          ? <p style={{ color: '#3d6e00', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0 }}>{task.detail}</p>
                          : <p style={{ color: '#aaa', fontSize: 13, margin: 0 }}>（詳細なし）</p>
                        }
                        {task.bug_reports && (
                          <p style={{ color: '#5a8a1a', fontSize: 13, marginTop: 10, marginBottom: 0 }}>
                            紐付け報告: {task.bug_reports.summary}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── 進捗 サブアコーディオン */}
                  <div style={{ borderBottom: '1px solid #e8f5d0' }}>
                    <div
                      onClick={() => toggleSection(task.id, 'progress')}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', cursor: 'pointer', background: '#f8fff0', userSelect: 'none' }}
                    >
                      <ChevronRight size={14} color="#6aac14" style={{ transform: sec.progress ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }} />
                      <span style={{ fontWeight: 'bold', color: '#2d5500', fontSize: 14, flex: 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Activity size={14}/>進捗
                      </span>
                      {lazy?.loaded && lazy.progress.length > 0 && (
                        <span style={{ background: '#e8f5d0', color: '#3d6e00', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 'bold' }}>{lazy.progress.length}件</span>
                      )}
                    </div>
                    {sec.progress && (
                      <div style={{ padding: '12px 16px 14px', borderTop: '1px solid #e8f5d0', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {lazy?.loading && <p style={{ color: '#5a8a1a', fontSize: 13, margin: 0 }}>読み込み中...</p>}
                        {lazy?.loaded && lazy.progress.length === 0 && (
                          <p style={{ color: '#aaa', fontSize: 13, margin: 0 }}>進捗報告はまだありません</p>
                        )}
                        {lazy?.loaded && lazy.progress.map(p => (
                          <div key={p.id} style={{ background: '#f0f9e4', border: '1px solid #c8e8a0', borderRadius: 8, padding: '10px 12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ color: '#3d6e00', fontSize: 12, fontWeight: 'bold' }}>{p.profiles?.username ?? '不明'}</span>
                              <span style={{ color: '#888', fontSize: 11 }}>{new Date(p.created_at).toLocaleString('ja-JP')}</span>
                            </div>
                            <p style={{ color: '#2d5500', fontSize: 13, margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{p.content}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── フィードバック サブアコーディオン */}
                  <div>
                    <div
                      onClick={() => toggleSection(task.id, 'feedback')}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', cursor: 'pointer', background: '#f8fff0', userSelect: 'none' }}
                    >
                      <ChevronRight size={14} color="#6aac14" style={{ transform: sec.feedback ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }} />
                      <span style={{ fontWeight: 'bold', color: '#2d5500', fontSize: 14, flex: 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <MessageSquare size={14}/>フィードバック
                      </span>
                      {lazy?.loaded && lazy.feedback.length > 0 && (
                        <span style={{ background: '#e8f5d0', color: '#3d6e00', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 'bold' }}>{lazy.feedback.length}件</span>
                      )}
                    </div>
                    {sec.feedback && (
                      <div style={{ padding: '12px 16px 14px', borderTop: '1px solid #e8f5d0', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {lazy?.loading && <p style={{ color: '#5a8a1a', fontSize: 13, margin: 0 }}>読み込み中...</p>}
                        {lazy?.loaded && lazy.feedback.length === 0 && (
                          <p style={{ color: '#aaa', fontSize: 13, margin: 0 }}>フィードバックはまだありません</p>
                        )}
                        {lazy?.loaded && lazy.feedback.map(f => (
                          <div key={f.id} style={{ background: '#fffbe6', border: '1px solid #f5e07a', borderRadius: 8, padding: '10px 12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ color: '#b8860b', fontSize: 12, fontWeight: 'bold' }}>{f.profiles?.username ?? '不明'}</span>
                              <span style={{ color: '#888', fontSize: 11 }}>{new Date(f.created_at).toLocaleString('ja-JP')}</span>
                            </div>
                            <p style={{ color: '#5a4000', fontSize: 13, margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{f.content}</p>
                          </div>
                        ))}
                        {/* フィードバック追加 */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                          <textarea
                            className="game-input"
                            rows={2}
                            placeholder="フィードバックを入力..."
                            value={feedbackInputs[task.id] ?? ''}
                            onChange={e => setFeedbackInputs(prev => ({ ...prev, [task.id]: e.target.value }))}
                            style={{ resize: 'vertical' }}
                          />
                          <button
                            onClick={() => handleAddFeedback(task.id)}
                            disabled={addingFeedback[task.id] || !(feedbackInputs[task.id]?.trim())}
                            style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                              padding: '8px 16px', background: '#b8860b', border: 'none', borderRadius: 8,
                              color: 'white', fontWeight: 'bold', fontSize: 13, cursor: 'pointer',
                              opacity: addingFeedback[task.id] || !(feedbackInputs[task.id]?.trim()) ? 0.5 : 1,
                              alignSelf: 'flex-start',
                            }}
                          >
                            <Plus size={14}/>{addingFeedback[task.id] ? '追加中...' : 'フィードバックを追加'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── 報告一覧 ── */}
        {tab === 'reports' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['all', 'pending', 'approved', 'rejected'] as ReportFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setReportFilter(f)}
                  style={{
                    padding: '6px 16px',
                    background: reportFilter === f ? '#3d6e00' : 'white',
                    border: '2px solid #3d6e00', borderRadius: 8,
                    color: reportFilter === f ? 'white' : '#3d6e00',
                    fontWeight: 'bold', fontSize: 13, cursor: 'pointer',
                  }}
                >
                  {f === 'all' ? '全件' : REPORT_STATUS_LABELS[f as ReportStatus]}
                </button>
              ))}
            </div>

            {filteredReports.length === 0 && <p style={{ color: '#3d6e00', textAlign: 'center', fontWeight: 'bold' }}>報告はありません</p>}
            {filteredReports.map(report => {
              const isOpen = expandedReport === report.id
              const processing = processingReport === report.id
              const sc = REPORT_STATUS_COLORS[report.status]
              return (
                <Fragment key={report.id}>
                  <div className="game-card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div
                      onClick={() => setExpandedReport(isOpen ? null : report.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer' }}
                    >
                      <span style={{ background: '#e8f5d0', border: '1px solid #3d6e00', borderRadius: 6, padding: '2px 8px', fontSize: 12, color: '#3d6e00', whiteSpace: 'nowrap' }}>
                        {report.type === 'bug'
                          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Bug size={11}/>不具合</span>
                          : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Lightbulb size={11}/>要望</span>
                        }
                      </span>
                      <span style={{ color: '#2d5500', flex: 1, fontSize: 14 }}>{report.summary}</span>
                      <span style={{ color: '#5a8a1a', fontSize: 12, whiteSpace: 'nowrap' }}>{report.profiles?.username}</span>
                      <span style={{ background: sc.bg, color: sc.text, borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                        {REPORT_STATUS_LABELS[report.status]}
                      </span>
                      <span style={{ color: '#3d6e00', fontSize: 14 }}>{isOpen ? '▲' : '▼'}</span>
                    </div>
                    {isOpen && (
                      <div style={{ padding: '0 16px 16px', borderTop: '2px solid #e8f5d0' }}>
                        <p style={{ color: '#5a8a1a', fontSize: 12, marginTop: 10 }}>
                          {new Date(report.created_at).toLocaleString('ja-JP')} — {report.profiles?.username}
                        </p>
                        {report.type === 'bug' && (
                          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {report.condition && <div><span style={{ color: '#3d6e00', fontSize: 13, fontWeight: 'bold' }}>発生条件: </span><span style={{ color: '#2d5500', fontSize: 13 }}>{report.condition}</span></div>}
                            {report.error_msg && <div><span style={{ color: '#3d6e00', fontSize: 13, fontWeight: 'bold' }}>エラーメッセージ: </span><span style={{ color: '#2d5500', fontSize: 13 }}>{report.error_msg}</span></div>}
                            {report.prediction && <div><span style={{ color: '#b8860b', fontSize: 13, fontWeight: 'bold' }}>★ 原因の予測: </span><span style={{ color: '#2d5500', fontSize: 13 }}>{report.prediction}</span></div>}
                          </div>
                        )}
                        {report.type === 'feature' && (
                          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {report.target_area && <div><span style={{ color: '#3d6e00', fontSize: 13, fontWeight: 'bold' }}>対象箇所: </span><span style={{ color: '#2d5500', fontSize: 13 }}>{report.target_area}</span></div>}
                            {report.implementation_idea && <div><span style={{ color: '#3d6e00', fontSize: 13, fontWeight: 'bold' }}>実現案: </span><span style={{ color: '#2d5500', fontSize: 13 }}>{report.implementation_idea}</span></div>}
                          </div>
                        )}
                        {report.status === 'pending' && (
                          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                            <input
                              className="game-input"
                              type="number"
                              min="0"
                              style={{ width: 100, boxSizing: 'border-box' }}
                              placeholder="ポイント数"
                              value={pointInputs[report.id] ?? ''}
                              onChange={e => setPointInputs(prev => ({ ...prev, [report.id]: e.target.value }))}
                            />
                            <button
                              onClick={() => handleApprove(report)}
                              disabled={processing}
                              style={{ background: '#3d6e00', border: '2px solid #3d6e00', borderRadius: 8, color: 'white', padding: '8px 18px', fontWeight: 'bold', cursor: 'pointer', opacity: processing ? 0.6 : 1 }}
                            >
                              承認
                            </button>
                            <button
                              onClick={() => handleReject(report)}
                              disabled={processing}
                              style={{ background: 'white', border: '2px solid #c0392b', borderRadius: 8, color: '#c0392b', padding: '8px 18px', fontWeight: 'bold', cursor: 'pointer', opacity: processing ? 0.6 : 1 }}
                            >
                              却下
                            </button>
                          </div>
                        )}
                        {report.status === 'approved' && report.awarded_points != null && (
                          <p style={{ color: '#3d6e00', marginTop: 12, fontSize: 13, fontWeight: 'bold' }}>付与ポイント: {report.awarded_points}pt</p>
                        )}
                      </div>
                    )}
                  </div>
                </Fragment>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

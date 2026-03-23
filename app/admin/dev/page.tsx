'use client'
import { Fragment, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase'
import { getEffectivePermissions } from '@/lib/permissions'

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

  const [profiles, setProfiles] = useState<Profile[]>([])
  const [reports, setReports] = useState<BugReport[]>([])

  // ToDo
  const [tasks, setTasks] = useState<DevTask[]>([])
  const [expandedTask, setExpandedTask] = useState<string | null>(null)
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

      const [profilesRes, reportsRes, tasksRes] = await Promise.all([
        supabase.from('profiles').select('id, username').is('withdrawn_at', null).order('username'),
        supabase.from('bug_reports').select('*, profiles(username)').order('created_at', { ascending: false }),
        supabase.from('dev_tasks').select('*, dev_task_assignees(user_id), bug_reports(summary)').order('created_at', { ascending: false }),
      ])

      setProfiles(profilesRes.data ?? [])
      setReports((reportsRes.data ?? []) as BugReport[])
      setTasks((tasksRes.data ?? []) as DevTask[])
      setLoading(false)
    }
    init()
  }, [router])

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault()
    if (!newSummary.trim()) return
    setAddingTask(true)

    const { data: task, error } = await supabase
      .from('dev_tasks')
      .insert({ summary: newSummary.trim(), detail: newDetail.trim() || null, deadline: newDeadline || null, report_id: newReportId || null })
      .select('*, dev_task_assignees(user_id), bug_reports(summary)')
      .single()

    if (error || !task) { alert('追加に失敗しました: ' + error?.message); setAddingTask(false); return }

    if (newAssignees.length > 0) {
      await supabase.from('dev_task_assignees').insert(newAssignees.map(uid => ({ task_id: task.id, user_id: uid })))
      task.dev_task_assignees = newAssignees.map(uid => ({ user_id: uid }))
    }

    setTasks(prev => [task as DevTask, ...prev])
    setNewSummary(''); setNewDetail(''); setNewDeadline(''); setNewAssignees([]); setNewReportId('')
    setAddingTask(false)
  }

  async function cycleTaskStatus(task: DevTask) {
    const next: TaskStatus = task.status === 'todo' ? 'in_progress' : task.status === 'in_progress' ? 'done' : 'todo'
    await supabase.from('dev_tasks').update({ status: next }).eq('id', task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next } : t))
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
      {/* 戻るボタン */}
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
        <h1 className="game-title" style={{ textAlign: 'center', marginBottom: 24 }}>🛠 開発者管理</h1>

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
              {t === 'todo' ? '📋 To Do 管理' : '📩 報告一覧'}
            </button>
          ))}
        </div>

        {/* ── To Do 管理 ── */}
        {tab === 'todo' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* タスク追加フォーム */}
            <div className="game-card" style={{ padding: 20 }}>
              <p style={{ color: '#3d6e00', fontWeight: 'bold', marginBottom: 14, fontSize: 15 }}>タスク追加</p>
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
                <button type="submit" className="game-button" disabled={addingTask}>
                  {addingTask ? '追加中...' : '追加'}
                </button>
              </form>
            </div>

            {/* タスクリスト */}
            {tasks.length === 0 && <p style={{ color: '#3d6e00', textAlign: 'center', fontWeight: 'bold' }}>タスクはありません</p>}
            {tasks.map(task => {
              const assigneeNames = task.dev_task_assignees.map(a => profiles.find(p => p.id === a.user_id)?.username ?? '').filter(Boolean)
              const isOpen = expandedTask === task.id
              const sc = STATUS_COLORS[task.status]
              return (
                <Fragment key={task.id}>
                  <div className="game-card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div
                      onClick={() => setExpandedTask(isOpen ? null : task.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer' }}
                    >
                      <span style={{ background: sc.bg, color: sc.text, borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                        {STATUS_LABELS[task.status]}
                      </span>
                      <span style={{ color: '#2d5500', flex: 1, fontSize: 14 }}>{task.summary}</span>
                      {task.deadline && <span style={{ color: '#5a8a1a', fontSize: 12, whiteSpace: 'nowrap' }}>{task.deadline}</span>}
                      {assigneeNames.length > 0 && <span style={{ color: '#3d6e00', fontSize: 12 }}>{assigneeNames.join(', ')}</span>}
                      <span style={{ color: '#3d6e00', fontSize: 14 }}>{isOpen ? '▲' : '▼'}</span>
                    </div>
                    {isOpen && (
                      <div style={{ padding: '0 16px 16px', borderTop: '2px solid #e8f5d0' }}>
                        {task.detail && <p style={{ color: '#3d6e00', marginTop: 12, fontSize: 14 }}>{task.detail}</p>}
                        {task.bug_reports && (
                          <p style={{ color: '#5a8a1a', fontSize: 13, marginTop: 8 }}>
                            紐付け報告: {task.bug_reports.summary}
                          </p>
                        )}
                        <div style={{ marginTop: 12 }}>
                          <button
                            onClick={() => cycleTaskStatus(task)}
                            style={{
                              background: 'white', border: '2px solid #3d6e00', borderRadius: 8,
                              color: '#3d6e00', padding: '6px 14px', cursor: 'pointer', fontSize: 13,
                              fontWeight: 'bold',
                            }}
                          >
                            ステータス変更 → {STATUS_LABELS[task.status === 'todo' ? 'in_progress' : task.status === 'in_progress' ? 'done' : 'todo']}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </Fragment>
              )
            })}
          </div>
        )}

        {/* ── 報告一覧 ── */}
        {tab === 'reports' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* フィルタ */}
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
                        {report.type === 'bug' ? '🐛 不具合' : '💡 要望'}
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

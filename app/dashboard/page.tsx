"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../lib/supabase'

// ─── 定数・型 ─────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  Foundation:  'Ⅰ. 基礎',
  Development: 'Ⅱ. 応用',
  Production:  'Ⅲ. 実践',
}

const COURSE_LABELS: Record<string, string> = {
  Unity:   'Unityコース',
  Blender: 'Blenderコース',
}

const STATUS_INFO: Record<string, { label: string; emoji: string; bg: string; color: string }> = {
  assigned:    { label: 'アサイン済',  emoji: '📌', bg: '#e8e8e8', color: '#555' },
  in_progress: { label: '取り組み中', emoji: '🔥', bg: '#d4f0a0', color: '#3d6e00' },
  submitted:   { label: '提出済',     emoji: '✅', bg: '#c8f0c0', color: '#1a6e00' },
}

function getWeekPhase(day: number): 'task' | 'midterm' | 'final' {
  if (day === 0) return 'final'
  if (day >= 1 && day <= 3) return 'task'
  return 'midterm'
}

const MILESTONES = [
  { key: 'task',    phase: 'task',    day: '月', label: '課題開始',  desc: '月曜日：今週の課題が配信されます。制作計画を入力しましょう。' },
  { key: 'midterm', phase: 'midterm', day: '木', label: '中間報告',  desc: '木曜日：進捗と日曜までの修正計画を報告しましょう。' },
  { key: 'final',   phase: 'final',   day: '日', label: '最終提出',  desc: '日曜日：動画・画像・自己評価をタイムラインに投稿しましょう。' },
]

// ビューIDはここに追加するだけで拡張できる
type ViewId = 'tasks' | 'history'

const NAV_ITEMS: { id: ViewId; icon: string; label: string }[] = [
  { id: 'tasks',   icon: '📋', label: '今週の課題' },
  { id: 'history', icon: '📚', label: '過去の課題' },
]

interface AssignmentTask {
  id: string
  title: string
  description: string | null
  target_course: string | null
  target_stage: string | null
}

interface AssignmentRecord {
  id: string
  status: 'assigned' | 'in_progress' | 'submitted'
  plan_text: string | null
  midterm_progress: string | null
  midterm_correction: string | null
  media_url: string | null
  self_evaluation: string | null
  retrospective: string | null
  submitted_at: string | null
  task: AssignmentTask
}

// ─── コンポーネント ────────────────────────────────────────

export default function DashboardPage() {
  const [username, setUsername]       = useState<string | null>(null)
  const [course, setCourse]           = useState<string | null>(null)
  const [stage, setStage]             = useState<string | null>(null)
  const [assignments, setAssignments] = useState<AssignmentRecord[]>([])
  const [loading, setLoading]         = useState(true)

  // サイドバー
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [currentView, setCurrentView] = useState<ViewId>('tasks')

  // 履歴アコーディオン
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({})

  // 制作計画
  const [planTexts, setPlanTexts]     = useState<Record<string, string>>({})
  const [savingPlan, setSavingPlan]   = useState<Record<string, boolean>>({})
  const [planSuccess, setPlanSuccess] = useState<Record<string, boolean>>({})

  // 中間報告
  const [midtermProgress, setMidtermProgress]     = useState<Record<string, string>>({})
  const [midtermCorrection, setMidtermCorrection] = useState<Record<string, string>>({})
  const [savingMidterm, setSavingMidterm]         = useState<Record<string, boolean>>({})
  const [midtermSuccess, setMidtermSuccess]       = useState<Record<string, boolean>>({})

  // 最終提出
  const [mediaUrls, setMediaUrls]         = useState<Record<string, string>>({})
  const [selfEvals, setSelfEvals]         = useState<Record<string, string>>({})
  const [retros, setRetros]               = useState<Record<string, string>>({})
  const [submitting, setSubmitting]       = useState<Record<string, boolean>>({})
  const [submitSuccess, setSubmitSuccess] = useState<Record<string, boolean>>({})

  const router = useRouter()
  const today      = new Date().getDay()
  const todayPhase = getWeekPhase(today)

  useEffect(() => {
    let mounted = true

    async function loadUser() {
      try {
        const { data, error } = await supabase.auth.getUser()
        if (error || !data?.user) { router.replace('/login'); return }

        const uid = data.user.id

        const { data: profile } = await supabase
          .from('profiles')
          .select('username, course, stage')
          .eq('id', uid)
          .single()

        if (mounted) {
          setUsername(profile?.username ?? null)
          setCourse(profile?.course ?? null)
          setStage(profile?.stage ?? null)
        }

        const { data: assignmentData } = await supabase
          .from('task_assignments')
          .select(`
            id, status, plan_text, midterm_progress, midterm_correction,
            media_url, self_evaluation, retrospective, submitted_at,
            task:tasks(id, title, description, target_course, target_stage)
          `)
          .eq('user_id', uid)

        if (mounted && assignmentData) {
          setAssignments(assignmentData as unknown as AssignmentRecord[])
          const plans: Record<string, string>   = {}
          const midProg: Record<string, string> = {}
          const midCorr: Record<string, string> = {}
          const medias: Record<string, string>  = {}
          const evals: Record<string, string>   = {}
          const retro: Record<string, string>   = {}
          assignmentData.forEach(a => {
            plans[a.id]   = a.plan_text           ?? ''
            midProg[a.id] = a.midterm_progress    ?? ''
            midCorr[a.id] = a.midterm_correction  ?? ''
            medias[a.id]  = a.media_url           ?? ''
            evals[a.id]   = a.self_evaluation     ?? ''
            retro[a.id]   = a.retrospective       ?? ''
          })
          setPlanTexts(plans)
          setMidtermProgress(midProg)
          setMidtermCorrection(midCorr)
          setMediaUrls(medias)
          setSelfEvals(evals)
          setRetros(retro)
        }
      } catch {
        router.replace('/login')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    loadUser()
    return () => { mounted = false }
  }, [router])

  // ─── ハンドラ ───────────────────────────────────────────

  async function savePlan(assignmentId: string) {
    setSavingPlan(prev => ({ ...prev, [assignmentId]: true }))
    setPlanSuccess(prev => ({ ...prev, [assignmentId]: false }))

    const { error } = await supabase.from('task_assignments').update({
      plan_text: planTexts[assignmentId] ?? '',
      status: 'in_progress',
      updated_at: new Date().toISOString(),
    }).eq('id', assignmentId)

    setSavingPlan(prev => ({ ...prev, [assignmentId]: false }))
    if (!error) {
      setPlanSuccess(prev => ({ ...prev, [assignmentId]: true }))
      setAssignments(prev => prev.map(a => a.id === assignmentId ? { ...a, status: 'in_progress', plan_text: planTexts[assignmentId] } : a))
    }
  }

  async function saveMidterm(assignmentId: string) {
    setSavingMidterm(prev => ({ ...prev, [assignmentId]: true }))
    setMidtermSuccess(prev => ({ ...prev, [assignmentId]: false }))
    const { error } = await supabase.from('task_assignments').update({
      midterm_progress:   midtermProgress[assignmentId]   ?? '',
      midterm_correction: midtermCorrection[assignmentId] ?? '',
      updated_at: new Date().toISOString(),
    }).eq('id', assignmentId)
    setSavingMidterm(prev => ({ ...prev, [assignmentId]: false }))
    if (!error) setMidtermSuccess(prev => ({ ...prev, [assignmentId]: true }))
  }

  async function submitWork(assignmentId: string) {
    setSubmitting(prev => ({ ...prev, [assignmentId]: true }))
    setSubmitSuccess(prev => ({ ...prev, [assignmentId]: false }))

    const now = new Date().toISOString()
    const { error } = await supabase.from('task_assignments').update({
      media_url:       mediaUrls[assignmentId] ?? '',
      self_evaluation: selfEvals[assignmentId] ?? '',
      retrospective:   retros[assignmentId]    ?? '',
      status:          'submitted',
      submitted_at:    now,
      updated_at:      now,
    }).eq('id', assignmentId)

    setSubmitting(prev => ({ ...prev, [assignmentId]: false }))
    if (!error) {
      setSubmitSuccess(prev => ({ ...prev, [assignmentId]: true }))
      setAssignments(prev => prev.map(a =>
        a.id === assignmentId ? { ...a, status: 'submitted', submitted_at: now } : a
      ))
    }
  }

  function navigate(viewId: ViewId) {
    setCurrentView(viewId)
    setSidebarOpen(false)
  }

  // ─── ローディング ──────────────────────────────────────

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'white', fontSize: 24, fontWeight: 'bold' }}>Loading...</p>
      </div>
    )
  }

  const currentMilestone = MILESTONES.find(m => m.phase === todayPhase)!
  const activeAssignments  = assignments.filter(a => a.status !== 'submitted')
  const submittedAssignments = assignments.filter(a => a.status === 'submitted')

  // ─── レンダリング ──────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh' }}>

      {/* ── サイドバー overlay ──────────────────────────── */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            zIndex: 100,
          }}
        />
      )}

      {/* ── サイドバー drawer ───────────────────────────── */}
      <div style={{
        position: 'fixed', top: 0, left: 0, bottom: 0,
        width: 220,
        background: '#1a3a00',
        zIndex: 101,
        transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.25s ease',
        display: 'flex', flexDirection: 'column',
        boxShadow: sidebarOpen ? '4px 0 20px rgba(0,0,0,0.4)' : 'none',
      }}>
        {/* ロゴ行 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 20px 16px',
          borderBottom: '2px solid #3d6e00',
        }}>
          <span style={{ color: '#6aac14', fontWeight: 'bold', fontSize: 18, letterSpacing: 1 }}>
            BONJORY
          </span>
          <button
            onClick={() => setSidebarOpen(false)}
            style={{
              background: 'none', border: 'none', color: '#6aac14',
              fontSize: 22, cursor: 'pointer', lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* ナビ項目 */}
        <nav style={{ flex: 1, padding: '12px 0' }}>
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                width: '100%', padding: '12px 20px',
                background: currentView === item.id ? '#3d6e00' : 'none',
                border: 'none', cursor: 'pointer',
                color: currentView === item.id ? '#fff' : '#a8d870',
                fontSize: 15, fontWeight: currentView === item.id ? 'bold' : 'normal',
                textAlign: 'left',
                transition: 'background 0.15s',
              }}
            >
              <span style={{ fontSize: 18 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* ログアウト */}
        <div style={{ padding: '16px 20px', borderTop: '2px solid #3d6e00' }}>
          <button
            onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#a8d870', fontSize: 14, padding: 0,
            }}
          >
            <span>🚪</span> ログアウト
          </button>
        </div>
      </div>

      {/* ── メインコンテンツ ─────────────────────────────── */}
      <div style={{ padding: '24px 24px 40px' }}>
        {/* ハンバーガーボタン */}
        <button
          onClick={() => setSidebarOpen(true)}
          style={{
            position: 'fixed', top: 16, left: 16, zIndex: 99,
            background: '#1a3a00', border: '2px solid #3d6e00',
            borderRadius: 8, padding: '6px 10px',
            cursor: 'pointer', color: '#6aac14', fontSize: 20, lineHeight: 1,
          }}
        >
          ☰
        </button>

        <div style={{ maxWidth: 560, margin: '0 auto', paddingTop: 48, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── ウェルカムカード ─────────────────────────── */}
          <div className="game-card" style={{ padding: '36px 32px', textAlign: 'center' }}>
            <p style={{ fontSize: 44, marginBottom: 12 }}>🎮</p>
            <h1 className="game-title" style={{ fontSize: 36, marginBottom: 8 }}>ようこそ！</h1>
            <p style={{ fontSize: 26, fontWeight: 'bold', color: '#6aac14', marginBottom: 20 }}>
              {username ?? '名無し'} さん
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <span style={{
                background: course ? '#6aac14' : '#aaa', color: 'white',
                borderRadius: 20, padding: '5px 16px', fontSize: 14, fontWeight: 'bold',
                border: `2px solid ${course ? '#3d6e00' : '#888'}`,
              }}>
                {course ? COURSE_LABELS[course] : '未設定'}
              </span>
              <span style={{
                background: stage ? '#3d6e00' : '#aaa', color: 'white',
                borderRadius: 20, padding: '5px 16px', fontSize: 14, fontWeight: 'bold',
                border: `2px solid ${stage ? '#2a4d00' : '#888'}`,
              }}>
                {stage ? STAGE_LABELS[stage] : '未設定'}
              </span>
            </div>
          </div>

          {/* ── ビュー切り替えタブ ───────────────────────── */}
          <div style={{ display: 'flex', gap: 4, background: '#1a3a00', borderRadius: 12, padding: 4 }}>
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id)}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 9,
                  border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 'bold',
                  background: currentView === item.id ? '#6aac14' : 'none',
                  color: currentView === item.id ? '#fff' : '#a8d870',
                  transition: 'background 0.15s',
                }}
              >
                {item.icon} {item.label}
              </button>
            ))}
          </div>

          {/* ══ VIEW: 今週の課題 ════════════════════════════ */}
          {currentView === 'tasks' && (
            <>
              {/* 週間サイクルカード */}
              <div className="game-card" style={{ padding: '28px 32px' }}>
                <h2 className="game-title" style={{ fontSize: 20, marginBottom: 24 }}>今週のサイクル</h2>
                <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 20 }}>
                  {MILESTONES.map((m, idx) => {
                    const isActive = m.phase === todayPhase
                    const isPast   = MILESTONES.findIndex(x => x.phase === todayPhase) > idx
                    return (
                      <div key={m.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                        {idx < MILESTONES.length - 1 && (
                          <div style={{
                            position: 'absolute', top: 16, left: '50%', width: '100%', height: 4,
                            background: isPast ? '#6aac14' : '#c8e89a', zIndex: 0,
                          }} />
                        )}
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%',
                          background: isActive ? '#6aac14' : isPast ? '#3d6e00' : '#c8e89a',
                          border: `4px solid ${isActive ? '#3d6e00' : isPast ? '#2a4d00' : '#8dc832'}`,
                          zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 14, fontWeight: 'bold', color: 'white',
                          boxShadow: isActive ? '0 0 0 4px rgba(106,172,20,0.3)' : 'none',
                        }}>
                          {m.day}
                        </div>
                        <p style={{
                          marginTop: 8, fontSize: 12,
                          fontWeight: isActive ? 'bold' : 'normal',
                          color: isActive ? '#3d6e00' : '#6aac14', textAlign: 'center',
                        }}>
                          {m.label}
                        </p>
                      </div>
                    )
                  })}
                </div>
                <div style={{ background: '#f0fae0', border: '2px solid #6aac14', borderRadius: 12, padding: '12px 16px' }}>
                  <p style={{ color: '#3d6e00', fontSize: 14, fontWeight: 'bold' }}>{currentMilestone.desc}</p>
                </div>
              </div>

              {/* アサイン済み課題カード */}
              {activeAssignments.length === 0 && assignments.length === 0 ? (
                <div className="game-card" style={{ padding: '28px 32px', textAlign: 'center' }}>
                  <p style={{ fontSize: 28, marginBottom: 8 }}>📭</p>
                  <p style={{ color: '#6aac14', fontSize: 16 }}>アサインされた課題はまだありません</p>
                </div>
              ) : activeAssignments.length === 0 ? (
                <div className="game-card" style={{ padding: '28px 32px', textAlign: 'center' }}>
                  <p style={{ fontSize: 28, marginBottom: 8 }}>🎉</p>
                  <p style={{ color: '#6aac14', fontSize: 16 }}>今週の課題はすべて提出済みです！</p>
                </div>
              ) : activeAssignments.map(assignment => {
                const si = STATUS_INFO[assignment.status]
                return (
                  <div key={assignment.id} className="game-card" style={{ padding: '28px 32px' }}>
                    {/* 課題ヘッダー */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 22 }}>📋</span>
                        <h2 className="game-title" style={{ fontSize: 20 }}>課題</h2>
                      </div>
                      <span style={{
                        background: si.bg, color: si.color, borderRadius: 12,
                        padding: '4px 12px', fontSize: 13, fontWeight: 'bold',
                      }}>
                        {si.emoji} {si.label}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                      {assignment.task.target_course && (
                        <span style={{ background: '#6aac14', color: 'white', borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 'bold' }}>
                          {assignment.task.target_course}
                        </span>
                      )}
                      {assignment.task.target_stage && (
                        <span style={{ background: '#3d6e00', color: 'white', borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 'bold' }}>
                          {assignment.task.target_stage}
                        </span>
                      )}
                    </div>

                    <p style={{ fontWeight: 'bold', color: '#2d5500', fontSize: 18, marginBottom: 8 }}>
                      {assignment.task.title}
                    </p>
                    {assignment.task.description && (
                      <p style={{ color: '#3d6e00', fontSize: 14, marginBottom: 16, lineHeight: 1.7 }}>
                        {assignment.task.description}
                      </p>
                    )}

                    <hr style={{ border: 'none', borderTop: '2px dashed #c8e89a', margin: '16px 0' }} />

                    {/* 制作計画 */}
                    <div style={{ marginBottom: 20 }}>
                      <label className="game-label">📝 今週の制作計画</label>
                      <textarea
                        className="game-input"
                        rows={3}
                        placeholder="今週どこまで作るか、どんな手順で進めるかを書こう..."
                        value={planTexts[assignment.id] ?? ''}
                        onChange={e => setPlanTexts(prev => ({ ...prev, [assignment.id]: e.target.value }))}
                        style={{ resize: 'vertical', marginBottom: 10 }}
                      />
                      <button
                        className="game-button"
                        disabled={savingPlan[assignment.id]}
                        onClick={() => savePlan(assignment.id)}
                      >
                        {savingPlan[assignment.id] ? '保存中…' : '計画を保存'}
                      </button>
                      {planSuccess[assignment.id] && (
                        <div className="game-success" style={{ marginTop: 8 }}>保存しました！ステータスを「取り組み中」に更新しました。</div>
                      )}
                    </div>

                    <hr style={{ border: 'none', borderTop: '2px dashed #c8e89a', margin: '16px 0' }} />

                    {/* 中間報告 */}
                    <div style={{ marginBottom: 20 }}>
                      <p className="game-label" style={{ marginBottom: 12 }}>
                        🔍 木曜中間報告
                        {todayPhase === 'midterm' && (
                          <span style={{
                            marginLeft: 8, background: '#6aac14', color: 'white',
                            borderRadius: 8, padding: '2px 8px', fontSize: 11,
                          }}>今日！</span>
                        )}
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div>
                          <label className="game-label" style={{ fontSize: 13 }}>現在の進捗状況</label>
                          <textarea
                            className="game-input"
                            rows={3}
                            placeholder="どこまで進んだか、詰まっている箇所はあるか..."
                            value={midtermProgress[assignment.id] ?? ''}
                            onChange={e => setMidtermProgress(prev => ({ ...prev, [assignment.id]: e.target.value }))}
                            style={{ resize: 'vertical' }}
                          />
                        </div>
                        <div>
                          <label className="game-label" style={{ fontSize: 13 }}>日曜までの修正計画</label>
                          <textarea
                            className="game-input"
                            rows={3}
                            placeholder="残りの期間でどこまで仕上げるか、何を変更するか..."
                            value={midtermCorrection[assignment.id] ?? ''}
                            onChange={e => setMidtermCorrection(prev => ({ ...prev, [assignment.id]: e.target.value }))}
                            style={{ resize: 'vertical' }}
                          />
                        </div>
                        <button
                          className="game-button"
                          disabled={savingMidterm[assignment.id]}
                          onClick={() => saveMidterm(assignment.id)}
                        >
                          {savingMidterm[assignment.id] ? '保存中…' : '中間報告を保存'}
                        </button>
                        {midtermSuccess[assignment.id] && (
                          <div className="game-success" style={{ marginTop: 8 }}>中間報告を保存しました！</div>
                        )}
                      </div>
                    </div>

                    <hr style={{ border: 'none', borderTop: '2px dashed #c8e89a', margin: '16px 0' }} />

                    {/* 最終提出 */}
                    <div>
                      <p className="game-label" style={{ marginBottom: 12 }}>🎬 最終提出</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div>
                          <label className="game-label">動画 / 画像URL</label>
                          <input
                            className="game-input"
                            type="url"
                            placeholder="https://youtube.com/... または画像URL"
                            value={mediaUrls[assignment.id] ?? ''}
                            onChange={e => setMediaUrls(prev => ({ ...prev, [assignment.id]: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="game-label">自己評価</label>
                          <textarea
                            className="game-input"
                            rows={3}
                            placeholder="今週の制作を振り返って、自分で評価してみよう..."
                            value={selfEvals[assignment.id] ?? ''}
                            onChange={e => setSelfEvals(prev => ({ ...prev, [assignment.id]: e.target.value }))}
                            style={{ resize: 'vertical' }}
                          />
                        </div>
                        <div>
                          <label className="game-label">計画の振り返り</label>
                          <textarea
                            className="game-input"
                            rows={3}
                            placeholder="月曜に立てた計画と、実際の進捗の差を振り返ろう..."
                            value={retros[assignment.id] ?? ''}
                            onChange={e => setRetros(prev => ({ ...prev, [assignment.id]: e.target.value }))}
                            style={{ resize: 'vertical' }}
                          />
                        </div>
                        <button
                          className="game-button"
                          disabled={submitting[assignment.id]}
                          onClick={() => submitWork(assignment.id)}
                        >
                          {submitting[assignment.id] ? '提出中…' : '🚀 提出する'}
                        </button>
                        {submitSuccess[assignment.id] && (
                          <div className="game-success">提出完了！お疲れさまでした 🎉</div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </>
          )}

          {/* ══ VIEW: 過去の課題 ════════════════════════════ */}
          {currentView === 'history' && (
            <>
              <div className="game-card" style={{ padding: '24px 28px' }}>
                <h2 className="game-title" style={{ fontSize: 22, marginBottom: 4 }}>📚 過去の課題</h2>
                <p style={{ color: '#3d6e00', fontSize: 13 }}>提出済みの課題履歴 — {submittedAssignments.length} 件</p>
              </div>

              {submittedAssignments.length === 0 ? (
                <div className="game-card" style={{ padding: '28px 32px', textAlign: 'center' }}>
                  <p style={{ fontSize: 28, marginBottom: 8 }}>📭</p>
                  <p style={{ color: '#6aac14', fontSize: 16 }}>まだ提出済みの課題はありません</p>
                </div>
              ) : submittedAssignments.map(a => {
                const isOpen = expandedHistory[a.id] ?? false
                return (
                  <div key={a.id} className="game-card" style={{ padding: '20px 28px' }}>
                    {/* ヘッダー行（クリックで開閉） */}
                    <button
                      onClick={() => setExpandedHistory(prev => ({ ...prev, [a.id]: !isOpen }))}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                        padding: 0, textAlign: 'left',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                          {a.task.target_course && (
                            <span style={{ background: '#6aac14', color: 'white', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 'bold' }}>
                              {a.task.target_course}
                            </span>
                          )}
                          {a.task.target_stage && (
                            <span style={{ background: '#3d6e00', color: 'white', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 'bold' }}>
                              {a.task.target_stage}
                            </span>
                          )}
                        </div>
                        <p style={{ fontWeight: 'bold', color: '#2d5500', fontSize: 16, marginBottom: 2 }}>
                          {a.task.title}
                        </p>
                        {a.submitted_at && (
                          <p style={{ color: '#6aac14', fontSize: 12 }}>
                            ✅ 提出日: {new Date(a.submitted_at).toLocaleDateString('ja-JP')}
                          </p>
                        )}
                      </div>
                      <span style={{ color: '#6aac14', fontSize: 20, marginLeft: 12 }}>
                        {isOpen ? '▲' : '▼'}
                      </span>
                    </button>

                    {/* 展開詳細 */}
                    {isOpen && (
                      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <hr style={{ border: 'none', borderTop: '2px dashed #c8e89a', margin: '4px 0' }} />

                        {a.plan_text && (
                          <div>
                            <p className="game-label" style={{ marginBottom: 4 }}>📝 制作計画</p>
                            <p style={{ color: '#2d5500', fontSize: 14, lineHeight: 1.7, background: '#f0fae0', borderRadius: 8, padding: '10px 14px' }}>
                              {a.plan_text}
                            </p>
                          </div>
                        )}

                        {(a.midterm_progress || a.midterm_correction) && (
                          <div>
                            <p className="game-label" style={{ marginBottom: 4 }}>🔍 中間報告</p>
                            {a.midterm_progress && (
                              <div style={{ marginBottom: 8 }}>
                                <p style={{ color: '#555', fontSize: 12, marginBottom: 2 }}>進捗状況</p>
                                <p style={{ color: '#2d5500', fontSize: 14, lineHeight: 1.7, background: '#f0fae0', borderRadius: 8, padding: '10px 14px' }}>
                                  {a.midterm_progress}
                                </p>
                              </div>
                            )}
                            {a.midterm_correction && (
                              <div>
                                <p style={{ color: '#555', fontSize: 12, marginBottom: 2 }}>修正計画</p>
                                <p style={{ color: '#2d5500', fontSize: 14, lineHeight: 1.7, background: '#f0fae0', borderRadius: 8, padding: '10px 14px' }}>
                                  {a.midterm_correction}
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {a.media_url && (
                          <div>
                            <p className="game-label" style={{ marginBottom: 4 }}>🎬 提出URL</p>
                            <a
                              href={a.media_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: '#3d6e00', fontSize: 14, wordBreak: 'break-all' }}
                            >
                              {a.media_url}
                            </a>
                          </div>
                        )}

                        {a.self_evaluation && (
                          <div>
                            <p className="game-label" style={{ marginBottom: 4 }}>⭐ 自己評価</p>
                            <p style={{ color: '#2d5500', fontSize: 14, lineHeight: 1.7, background: '#f0fae0', borderRadius: 8, padding: '10px 14px' }}>
                              {a.self_evaluation}
                            </p>
                          </div>
                        )}

                        {a.retrospective && (
                          <div>
                            <p className="game-label" style={{ marginBottom: 4 }}>🔄 計画の振り返り</p>
                            <p style={{ color: '#2d5500', fontSize: 14, lineHeight: 1.7, background: '#f0fae0', borderRadius: 8, padding: '10px 14px' }}>
                              {a.retrospective}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}

        </div>
      </div>
    </div>
  )
}

"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../lib/supabase'

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
  media_url: string | null
  self_evaluation: string | null
  retrospective: string | null
  submitted_at: string | null
  task: AssignmentTask
}

export default function DashboardPage() {
  const [username, setUsername]       = useState<string | null>(null)
  const [course, setCourse]           = useState<string | null>(null)
  const [stage, setStage]             = useState<string | null>(null)
  const [assignments, setAssignments] = useState<AssignmentRecord[]>([])
  const [loading, setLoading]         = useState(true)

  // 制作計画の入力state: assignmentId → text
  const [planTexts, setPlanTexts]       = useState<Record<string, string>>({})
  const [savingPlan, setSavingPlan]     = useState<Record<string, boolean>>({})
  const [planSuccess, setPlanSuccess]   = useState<Record<string, boolean>>({})

  // 提出フォームの入力state
  const [mediaUrls, setMediaUrls]       = useState<Record<string, string>>({})
  const [selfEvals, setSelfEvals]       = useState<Record<string, string>>({})
  const [retros, setRetros]             = useState<Record<string, string>>({})
  const [submitting, setSubmitting]     = useState<Record<string, boolean>>({})
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

        // アサインされた課題を取得
        const { data: assignmentData } = await supabase
          .from('task_assignments')
          .select(`
            id, status, plan_text, media_url, self_evaluation, retrospective, submitted_at,
            task:tasks(id, title, description, target_course, target_stage)
          `)
          .eq('user_id', uid)

        if (mounted && assignmentData) {
          setAssignments(assignmentData as unknown as AssignmentRecord[])
          // 初期値をセット
          const plans: Record<string, string> = {}
          const medias: Record<string, string> = {}
          const evals: Record<string, string>  = {}
          const retro: Record<string, string>  = {}
          assignmentData.forEach(a => {
            plans[a.id]  = a.plan_text       ?? ''
            medias[a.id] = a.media_url       ?? ''
            evals[a.id]  = a.self_evaluation ?? ''
            retro[a.id]  = a.retrospective   ?? ''
          })
          setPlanTexts(plans)
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

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'white', fontSize: 24, fontWeight: 'bold' }}>Loading...</p>
      </div>
    )
  }

  const currentMilestone = MILESTONES.find(m => m.phase === todayPhase)!

  return (
    <div style={{ minHeight: '100vh', padding: '32px 24px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ウェルカムカード */}
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
        {assignments.length === 0 ? (
          <div className="game-card" style={{ padding: '28px 32px', textAlign: 'center' }}>
            <p style={{ fontSize: 28, marginBottom: 8 }}>📭</p>
            <p style={{ color: '#6aac14', fontSize: 16 }}>アサインされた課題はまだありません</p>
          </div>
        ) : assignments.map(assignment => {
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

              {/* 提出フォーム */}
              <div>
                <p className="game-label" style={{ marginBottom: 12 }}>
                  🎬 最終提出{assignment.submitted_at ? `（提出済: ${new Date(assignment.submitted_at).toLocaleDateString('ja-JP')}）` : ''}
                </p>

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
                    style={{ background: assignment.status === 'submitted' ? '#3d6e00' : undefined }}
                  >
                    {submitting[assignment.id] ? '提出中…' : assignment.status === 'submitted' ? '✅ 再提出する' : '🚀 提出する'}
                  </button>
                  {submitSuccess[assignment.id] && (
                    <div className="game-success">提出完了！お疲れさまでした 🎉</div>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {/* ログアウト */}
        <button
          className="game-button"
          style={{ maxWidth: 200, margin: '0 auto' }}
          onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
        >
          ログアウト
        </button>

      </div>
    </div>
  )
}

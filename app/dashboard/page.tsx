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

interface Task {
  id: string
  title: string
  description: string | null
  target_course: string | null
  target_stage: string | null
}

export default function DashboardPage() {
  const [username, setUsername] = useState<string | null>(null)
  const [course, setCourse]     = useState<string | null>(null)
  const [stage, setStage]       = useState<string | null>(null)
  const [userId, setUserId]     = useState<string | null>(null)
  const [tasks, setTasks]       = useState<Task[]>([])
  const [planTexts, setPlanTexts] = useState<Record<string, string>>({})
  const [savingPlan, setSavingPlan] = useState<Record<string, boolean>>({})
  const [planSuccess, setPlanSuccess] = useState<Record<string, boolean>>({})
  const [loading, setLoading]   = useState(true)
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

        const userCourse = profile?.course ?? null
        const userStage  = profile?.stage  ?? null

        if (mounted) {
          setUsername(profile?.username ?? null)
          setCourse(userCourse)
          setStage(userStage)
          setUserId(uid)
        }

        // アクティブな課題を取得（自分のコース・ステージに合うもの）
        let query = supabase
          .from('tasks')
          .select('id, title, description, target_course, target_stage')
          .eq('is_active', true)

        const { data: taskList } = await query

        // クライアント側でコース・ステージフィルタリング
        const filtered = (taskList ?? []).filter(t => {
          const courseMatch = t.target_course === null || t.target_course === userCourse
          const stageMatch  = t.target_stage  === null || t.target_stage  === userStage
          return courseMatch && stageMatch
        })

        if (mounted) setTasks(filtered)

        // 各課題の既存プランを取得
        if (filtered.length > 0) {
          const taskIds = filtered.map(t => t.id)
          const { data: existingPlans } = await supabase
            .from('plans')
            .select('task_id, plan_text')
            .eq('user_id', uid)
            .in('task_id', taskIds)

          if (mounted && existingPlans) {
            const planMap: Record<string, string> = {}
            existingPlans.forEach(p => { planMap[p.task_id] = p.plan_text })
            setPlanTexts(planMap)
          }
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

  async function savePlan(taskId: string) {
    if (!userId) return
    setSavingPlan(prev => ({ ...prev, [taskId]: true }))
    setPlanSuccess(prev => ({ ...prev, [taskId]: false }))

    const { error } = await supabase
      .from('plans')
      .upsert(
        { task_id: taskId, user_id: userId, plan_text: planTexts[taskId] ?? '', updated_at: new Date().toISOString() },
        { onConflict: 'task_id,user_id' }
      )

    setSavingPlan(prev => ({ ...prev, [taskId]: false }))
    if (!error) setPlanSuccess(prev => ({ ...prev, [taskId]: true }))
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
      <div style={{ maxWidth: 520, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

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
            <p style={{ color: '#3d6e00', fontSize: 14, fontWeight: 'bold' }}>
              {currentMilestone.desc}
            </p>
          </div>
        </div>

        {/* 今週の課題カード */}
        {tasks.length > 0 && tasks.map(task => (
          <div key={task.id} className="game-card" style={{ padding: '28px 32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 22 }}>📋</span>
              <h2 className="game-title" style={{ fontSize: 20 }}>今週の課題</h2>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <span style={{
                background: '#6aac14', color: 'white',
                borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 'bold',
              }}>
                {task.target_course ?? '全コース'}
              </span>
              <span style={{
                background: '#3d6e00', color: 'white',
                borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 'bold',
              }}>
                {task.target_stage ?? '全ステージ'}
              </span>
            </div>

            <p style={{ fontWeight: 'bold', color: '#2d5500', fontSize: 18, marginBottom: 8 }}>
              {task.title}
            </p>
            {task.description && (
              <p style={{ color: '#3d6e00', fontSize: 14, marginBottom: 16, lineHeight: 1.6 }}>
                {task.description}
              </p>
            )}

            <div style={{ marginTop: 12 }}>
              <label className="game-label">今週の制作計画</label>
              <textarea
                className="game-input"
                rows={4}
                placeholder="今週どこまで作るか、どんな手順で進めるかを書いてみよう..."
                value={planTexts[task.id] ?? ''}
                onChange={e => setPlanTexts(prev => ({ ...prev, [task.id]: e.target.value }))}
                style={{ resize: 'vertical', marginBottom: 10 }}
              />
              <button
                className="game-button"
                disabled={savingPlan[task.id]}
                onClick={() => savePlan(task.id)}
              >
                {savingPlan[task.id] ? '保存中…' : '計画を保存'}
              </button>
              {planSuccess[task.id] && (
                <div className="game-success" style={{ marginTop: 8 }}>保存しました！</div>
              )}
            </div>
          </div>
        ))}

        {/* 課題なし */}
        {tasks.length === 0 && (
          <div className="game-card" style={{ padding: '28px 32px', textAlign: 'center' }}>
            <p style={{ fontSize: 28, marginBottom: 8 }}>📭</p>
            <p style={{ color: '#6aac14', fontSize: 16 }}>今週の課題はまだありません</p>
          </div>
        )}

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

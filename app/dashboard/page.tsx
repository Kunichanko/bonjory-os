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

type ViewId = 'tasks' | 'history' | 'timeline'

const NAV_ITEMS: { id: ViewId; icon: string; label: string }[] = [
  { id: 'tasks',    icon: '📋', label: '今週の課題' },
  { id: 'history',  icon: '📚', label: '過去の課題' },
  { id: 'timeline', icon: '🌐', label: 'タイムライン' },
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
  is_anonymous: boolean
  thumbnail_url: string | null
  task: AssignmentTask
}

interface TimelineItem {
  id: string
  user_id: string
  is_anonymous: boolean
  thumbnail_url: string | null
  self_evaluation: string | null
  retrospective: string | null
  media_url: string | null
  submitted_at: string | null
  task: {
    id: string
    title: string
    target_course: string | null
    target_stage: string | null
  }
  profile: {
    username: string | null
    course: string | null
    stage: string | null
  } | null
}

interface RankSetting {
  id: string
  name: string
  min_points: number
  color: string
  rank_order: number
}

interface Comment {
  id: string
  assignment_id: string
  user_id: string
  content: string
  created_at: string
  profile: { username: string | null } | null
}

// ─── コンポーネント ────────────────────────────────────────

export default function DashboardPage() {
  const [userId, setUserId]           = useState<string | null>(null)
  const [username, setUsername]       = useState<string | null>(null)
  const [course, setCourse]           = useState<string | null>(null)
  const [stage, setStage]             = useState<string | null>(null)
  const [assignments, setAssignments] = useState<AssignmentRecord[]>([])
  const [loading, setLoading]         = useState(true)

  // ポイント・ランク
  const [totalPoints, setTotalPoints] = useState(0)
  const [coolPoints, setCoolPoints]   = useState(0)
  const [rankSettings, setRankSettings] = useState<RankSetting[]>([])

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
  const [mediaUrls, setMediaUrls]           = useState<Record<string, string>>({})
  const [selfEvals, setSelfEvals]           = useState<Record<string, string>>({})
  const [retros, setRetros]                 = useState<Record<string, string>>({})
  const [isAnonymous, setIsAnonymous]       = useState<Record<string, boolean>>({})
  const [thumbnailFiles, setThumbnailFiles] = useState<Record<string, File | null>>({})
  const [thumbPreviews, setThumbPreviews]   = useState<Record<string, string>>({})
  const [uploadingThumb, setUploadingThumb] = useState<Record<string, boolean>>({})
  const [submitting, setSubmitting]         = useState<Record<string, boolean>>({})
  const [submitSuccess, setSubmitSuccess]   = useState<Record<string, boolean>>({})

  // タイムライン
  const [timeline, setTimeline]               = useState<TimelineItem[]>([])
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [selectedPost, setSelectedPost]       = useState<TimelineItem | null>(null)

  // コメント
  const [comments, setComments]             = useState<Record<string, Comment[]>>({})
  const [loadingComments, setLoadingComments] = useState(false)
  const [commentInputs, setCommentInputs]   = useState<Record<string, string>>({})
  const [postingComment, setPostingComment] = useState<Record<string, boolean>>({})

  const router = useRouter()
  const today      = new Date().getDay()
  const todayPhase = getWeekPhase(today)

  // ─── 初期データ読み込み ─────────────────────────────────

  useEffect(() => {
    let mounted = true

    async function loadUser() {
      try {
        const { data, error } = await supabase.auth.getUser()
        if (error || !data?.user) { router.replace('/login'); return }

        const uid = data.user.id
        if (mounted) setUserId(uid)

        const [profileRes, assignmentRes, ranksRes] = await Promise.all([
          supabase.from('profiles')
            .select('username, course, stage, total_points, cool_points')
            .eq('id', uid)
            .single(),
          supabase.from('task_assignments')
            .select(`
              id, status, plan_text, midterm_progress, midterm_correction,
              media_url, self_evaluation, retrospective, submitted_at,
              is_anonymous, thumbnail_url,
              task:tasks(id, title, description, target_course, target_stage)
            `)
            .eq('user_id', uid),
          supabase.from('rank_settings')
            .select('id, name, min_points, color, rank_order')
            .order('rank_order'),
        ])

        if (!mounted) return

        const profile = profileRes.data
        setUsername(profile?.username ?? null)
        setCourse(profile?.course ?? null)
        setStage(profile?.stage ?? null)
        setTotalPoints(profile?.total_points ?? 0)
        setCoolPoints(profile?.cool_points ?? 0)

        setRankSettings(ranksRes.data ?? [])

        const assignmentData = assignmentRes.data
        if (assignmentData) {
          setAssignments(assignmentData as unknown as AssignmentRecord[])
          const plans: Record<string, string>   = {}
          const midProg: Record<string, string> = {}
          const midCorr: Record<string, string> = {}
          const medias: Record<string, string>  = {}
          const evals: Record<string, string>   = {}
          const retro: Record<string, string>   = {}
          const anon: Record<string, boolean>   = {}
          assignmentData.forEach(a => {
            plans[a.id]   = a.plan_text           ?? ''
            midProg[a.id] = a.midterm_progress    ?? ''
            midCorr[a.id] = a.midterm_correction  ?? ''
            medias[a.id]  = a.media_url           ?? ''
            evals[a.id]   = a.self_evaluation     ?? ''
            retro[a.id]   = a.retrospective       ?? ''
            anon[a.id]    = a.is_anonymous        ?? false
          })
          setPlanTexts(plans)
          setMidtermProgress(midProg)
          setMidtermCorrection(midCorr)
          setMediaUrls(medias)
          setSelfEvals(evals)
          setRetros(retro)
          setIsAnonymous(anon)
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

  // ─── タイムライン読み込み ───────────────────────────────

  useEffect(() => {
    if (currentView !== 'timeline') return
    let mounted = true
    setTimelineLoading(true)

    async function fetchTimeline() {
      try {
        const { data: tlData, error: tlError } = await supabase
          .from('task_assignments')
          .select(`
            id, user_id, is_anonymous, thumbnail_url,
            self_evaluation, retrospective, media_url, submitted_at,
            task:tasks(id, title, target_course, target_stage)
          `)
          .eq('status', 'submitted')
          .order('submitted_at', { ascending: false })

        if (tlError) {
          console.error('Timeline fetch error:', tlError.message)
          if (mounted) setTimelineLoading(false)
          return
        }

        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, username, course, stage')

        const profileMap: Record<string, { username: string | null; course: string | null; stage: string | null }> = {}
        for (const p of profilesData ?? []) {
          profileMap[p.id] = { username: p.username, course: p.course, stage: p.stage }
        }

        const merged: TimelineItem[] = (tlData ?? []).map(a => ({
          ...(a as unknown as Omit<TimelineItem, 'profile'>),
          profile: profileMap[a.user_id] ?? null,
        }))

        if (mounted) {
          setTimeline(merged)
          setTimelineLoading(false)
        }
      } catch (err) {
        console.error('Timeline fetch failed:', err)
        if (mounted) setTimelineLoading(false)
      }
    }

    fetchTimeline()
    return () => { mounted = false }
  }, [currentView])

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
      setAssignments(prev => prev.map(a =>
        a.id === assignmentId ? { ...a, status: 'in_progress', plan_text: planTexts[assignmentId] } : a
      ))
    }
  }

  async function saveMidterm(assignmentId: string) {
    const wasEmpty = !assignments.find(a => a.id === assignmentId)?.midterm_progress
    const newProgress = midtermProgress[assignmentId] ?? ''

    setSavingMidterm(prev => ({ ...prev, [assignmentId]: true }))
    setMidtermSuccess(prev => ({ ...prev, [assignmentId]: false }))
    const { error } = await supabase.from('task_assignments').update({
      midterm_progress:   newProgress,
      midterm_correction: midtermCorrection[assignmentId] ?? '',
      updated_at: new Date().toISOString(),
    }).eq('id', assignmentId)
    setSavingMidterm(prev => ({ ...prev, [assignmentId]: false }))
    if (!error) {
      setMidtermSuccess(prev => ({ ...prev, [assignmentId]: true }))
      // 初回記入のみポイント付与
      if (wasEmpty && newProgress && userId) {
        const { data: pts } = await supabase.rpc('award_points', {
          p_user_id: userId, p_action_key: 'midterm_report',
        })
        if (typeof pts === 'number' && pts > 0) {
          setTotalPoints(p => p + pts)
          setCoolPoints(p => p + pts)
        }
      }
    }
  }

  async function submitWork(assignmentId: string) {
    const wasSubmitted = assignments.find(a => a.id === assignmentId)?.status === 'submitted'

    setSubmitting(prev => ({ ...prev, [assignmentId]: true }))
    setSubmitSuccess(prev => ({ ...prev, [assignmentId]: false }))

    const now = new Date().toISOString()

    // サムネイルアップロード
    let thumbUrl: string | null = null
    const thumbFile = thumbnailFiles[assignmentId]
    if (thumbFile && userId) {
      setUploadingThumb(prev => ({ ...prev, [assignmentId]: true }))
      const ext = thumbFile.name.split('.').pop() ?? 'jpg'
      const path = `${userId}/${assignmentId}.${ext}`
      const { data: upData, error: upErr } = await supabase.storage
        .from('thumbnails')
        .upload(path, thumbFile, { upsert: true })
      setUploadingThumb(prev => ({ ...prev, [assignmentId]: false }))
      if (!upErr && upData) {
        const { data: urlData } = supabase.storage.from('thumbnails').getPublicUrl(upData.path)
        thumbUrl = urlData.publicUrl
      }
    }

    const { error } = await supabase.from('task_assignments').update({
      media_url:       mediaUrls[assignmentId]   ?? '',
      self_evaluation: selfEvals[assignmentId]   ?? '',
      retrospective:   retros[assignmentId]      ?? '',
      is_anonymous:    isAnonymous[assignmentId] ?? false,
      thumbnail_url:   thumbUrl,
      status:          'submitted',
      submitted_at:    now,
      updated_at:      now,
    }).eq('id', assignmentId)

    setSubmitting(prev => ({ ...prev, [assignmentId]: false }))
    if (!error) {
      setSubmitSuccess(prev => ({ ...prev, [assignmentId]: true }))
      setAssignments(prev => prev.map(a =>
        a.id === assignmentId
          ? { ...a, status: 'submitted', submitted_at: now,
              is_anonymous: isAnonymous[assignmentId] ?? false,
              thumbnail_url: thumbUrl }
          : a
      ))
      // 初回提出のみポイント付与
      if (!wasSubmitted && userId) {
        const { data: pts } = await supabase.rpc('award_points', {
          p_user_id: userId, p_action_key: 'submission',
        })
        if (typeof pts === 'number' && pts > 0) {
          setTotalPoints(p => p + pts)
          setCoolPoints(p => p + pts)
        }
      }
    }
  }

  function handleThumbnailChange(assignmentId: string, file: File | null) {
    setThumbnailFiles(prev => ({ ...prev, [assignmentId]: file }))
    if (file) {
      const url = URL.createObjectURL(file)
      setThumbPreviews(prev => ({ ...prev, [assignmentId]: url }))
    } else {
      setThumbPreviews(prev => ({ ...prev, [assignmentId]: '' }))
    }
  }

  async function loadComments(assignmentId: string) {
    setLoadingComments(true)
    const { data, error } = await supabase
      .from('timeline_comments')
      .select('id, assignment_id, user_id, content, created_at')
      .eq('assignment_id', assignmentId)
      .order('created_at', { ascending: true })

    if (!error && data) {
      const userIds = [...new Set(data.map(c => c.user_id))]
      const { data: profilesData } = await supabase
        .from('profiles').select('id, username').in('id', userIds)
      const profileMap: Record<string, string | null> = {}
      for (const p of profilesData ?? []) profileMap[p.id] = p.username

      const enriched: Comment[] = data.map(c => ({
        ...c,
        profile: { username: profileMap[c.user_id] ?? null },
      }))
      setComments(prev => ({ ...prev, [assignmentId]: enriched }))
    }
    setLoadingComments(false)
  }

  async function postComment(assignmentId: string, postOwnerId: string) {
    const content = (commentInputs[assignmentId] ?? '').trim()
    if (!content || !userId) return

    setPostingComment(prev => ({ ...prev, [assignmentId]: true }))
    const { error } = await supabase
      .from('timeline_comments')
      .insert({ assignment_id: assignmentId, user_id: userId, content })

    if (!error) {
      setCommentInputs(prev => ({ ...prev, [assignmentId]: '' }))
      await loadComments(assignmentId)
      // 他人の投稿へのコメントのみポイント付与
      if (userId !== postOwnerId) {
        const { data: pts } = await supabase.rpc('award_points', {
          p_user_id: userId, p_action_key: 'comment',
        })
        if (typeof pts === 'number' && pts > 0) {
          setTotalPoints(p => p + pts)
          setCoolPoints(p => p + pts)
        }
      }
    }
    setPostingComment(prev => ({ ...prev, [assignmentId]: false }))
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

  const currentMilestone     = MILESTONES.find(m => m.phase === todayPhase)!
  const activeAssignments    = assignments.filter(a => a.status !== 'submitted')
  const submittedAssignments = assignments.filter(a => a.status === 'submitted')

  // ランク計算
  const sortedRanks = [...rankSettings].sort((a, b) => a.rank_order - b.rank_order)
  const currentRank = [...sortedRanks].reverse().find(r => coolPoints >= r.min_points) ?? sortedRanks[0] ?? null
  const nextRank    = currentRank
    ? sortedRanks.find(r => r.rank_order > currentRank.rank_order) ?? null
    : null

  // ─── レンダリング ──────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh' }}>

      {/* ── サイドバー overlay ──────────────────────────── */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100 }}
        />
      )}

      {/* ── サイドバー drawer ───────────────────────────── */}
      <div style={{
        position: 'fixed', top: 0, left: 0, bottom: 0,
        width: 220, background: '#1a3a00', zIndex: 101,
        transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.25s ease',
        display: 'flex', flexDirection: 'column',
        boxShadow: sidebarOpen ? '4px 0 20px rgba(0,0,0,0.4)' : 'none',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 20px 16px', borderBottom: '2px solid #3d6e00',
        }}>
          <span style={{ color: '#6aac14', fontWeight: 'bold', fontSize: 18, letterSpacing: 1 }}>
            BONJORY
          </span>
          <button onClick={() => setSidebarOpen(false)}
            style={{ background: 'none', border: 'none', color: '#6aac14', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>
            ×
          </button>
        </div>

        <nav style={{ flex: 1, padding: '12px 0' }}>
          {NAV_ITEMS.map(item => (
            <button key={item.id} onClick={() => navigate(item.id)} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              width: '100%', padding: '12px 20px',
              background: currentView === item.id ? '#3d6e00' : 'none',
              border: 'none', cursor: 'pointer',
              color: currentView === item.id ? '#fff' : '#a8d870',
              fontSize: 15, fontWeight: currentView === item.id ? 'bold' : 'normal',
              textAlign: 'left', transition: 'background 0.15s',
            }}>
              <span style={{ fontSize: 18 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div style={{ padding: '16px 20px', borderTop: '2px solid #3d6e00' }}>
          <button onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', color: '#a8d870', fontSize: 14, padding: 0 }}>
            <span>🚪</span> ログアウト
          </button>
        </div>
      </div>

      {/* ── メインコンテンツ ─────────────────────────────── */}
      <div style={{ padding: '24px 24px 40px' }}>
        {/* ハンバーガーボタン */}
        <button onClick={() => setSidebarOpen(true)} style={{
          position: 'fixed', top: 16, left: 16, zIndex: 99,
          background: '#1a3a00', border: '2px solid #3d6e00',
          borderRadius: 8, padding: '6px 10px',
          cursor: 'pointer', color: '#6aac14', fontSize: 20, lineHeight: 1,
        }}>
          ☰
        </button>

        {/* ── ランクウィジェット ─────────────────────────── */}
        {currentRank && (
          <div style={{
            position: 'fixed', top: 60, left: 8, zIndex: 98,
            background: '#1a3a00',
            border: `2px solid ${currentRank.color}`,
            borderRadius: 10, padding: '8px 12px',
            textAlign: 'center', minWidth: 90,
          }}>
            <p style={{ color: currentRank.color, fontWeight: 'bold', fontSize: 20, lineHeight: 1, marginBottom: 2 }}>
              {currentRank.name}
            </p>
            <p style={{ color: currentRank.color, fontSize: 10, marginBottom: 4 }}>ランク</p>
            <p style={{ color: '#a8d870', fontSize: 10, marginBottom: 4 }}>
              累計 <span style={{ fontWeight: 'bold' }}>{totalPoints}</span> pt
            </p>
            {nextRank ? (
              <p style={{ color: '#a8d870', fontSize: 10, lineHeight: 1.4 }}>
                次まで<br/>
                <span style={{ fontWeight: 'bold', fontSize: 12 }}>
                  {nextRank.min_points - coolPoints}
                </span> pt
              </p>
            ) : (
              <p style={{ color: '#f0a000', fontSize: 10 }}>最高ランク！</p>
            )}
          </div>
        )}

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
              <button key={item.id} onClick={() => setCurrentView(item.id)} style={{
                flex: 1, padding: '9px 0', borderRadius: 9,
                border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 'bold',
                background: currentView === item.id ? '#6aac14' : 'none',
                color: currentView === item.id ? '#fff' : '#a8d870',
                transition: 'background 0.15s',
              }}>
                {item.icon} {item.label}
              </button>
            ))}
          </div>

          {/* ══ VIEW: 今週の課題 ════════════════════════════ */}
          {currentView === 'tasks' && (
            <>
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 22 }}>📋</span>
                        <h2 className="game-title" style={{ fontSize: 20 }}>課題</h2>
                      </div>
                      <span style={{ background: si.bg, color: si.color, borderRadius: 12, padding: '4px 12px', fontSize: 13, fontWeight: 'bold' }}>
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
                        className="game-input" rows={3}
                        placeholder="今週どこまで作るか、どんな手順で進めるかを書こう..."
                        value={planTexts[assignment.id] ?? ''}
                        onChange={e => setPlanTexts(prev => ({ ...prev, [assignment.id]: e.target.value }))}
                        style={{ resize: 'vertical', marginBottom: 10 }}
                      />
                      <button className="game-button" disabled={savingPlan[assignment.id]} onClick={() => savePlan(assignment.id)}>
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
                          <span style={{ marginLeft: 8, background: '#6aac14', color: 'white', borderRadius: 8, padding: '2px 8px', fontSize: 11 }}>今日！</span>
                        )}
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div>
                          <label className="game-label" style={{ fontSize: 13 }}>現在の進捗状況</label>
                          <textarea className="game-input" rows={3}
                            placeholder="どこまで進んだか、詰まっている箇所はあるか..."
                            value={midtermProgress[assignment.id] ?? ''}
                            onChange={e => setMidtermProgress(prev => ({ ...prev, [assignment.id]: e.target.value }))}
                            style={{ resize: 'vertical' }} />
                        </div>
                        <div>
                          <label className="game-label" style={{ fontSize: 13 }}>日曜までの修正計画</label>
                          <textarea className="game-input" rows={3}
                            placeholder="残りの期間でどこまで仕上げるか、何を変更するか..."
                            value={midtermCorrection[assignment.id] ?? ''}
                            onChange={e => setMidtermCorrection(prev => ({ ...prev, [assignment.id]: e.target.value }))}
                            style={{ resize: 'vertical' }} />
                        </div>
                        <button className="game-button" disabled={savingMidterm[assignment.id]} onClick={() => saveMidterm(assignment.id)}>
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
                      <p className="game-label" style={{ marginBottom: 12 }}>
                        🎬 最終提出
                        {todayPhase === 'final' && (
                          <span style={{ marginLeft: 8, background: '#6aac14', color: 'white', borderRadius: 8, padding: '2px 8px', fontSize: 11 }}>今日！</span>
                        )}
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div>
                          <label className="game-label">動画 / 画像URL</label>
                          <input className="game-input" type="url"
                            placeholder="https://youtube.com/... または画像URL"
                            value={mediaUrls[assignment.id] ?? ''}
                            onChange={e => setMediaUrls(prev => ({ ...prev, [assignment.id]: e.target.value }))} />
                        </div>
                        <div>
                          <label className="game-label">自己評価</label>
                          <textarea className="game-input" rows={3}
                            placeholder="今週の制作を振り返って、自分で評価してみよう..."
                            value={selfEvals[assignment.id] ?? ''}
                            onChange={e => setSelfEvals(prev => ({ ...prev, [assignment.id]: e.target.value }))}
                            style={{ resize: 'vertical' }} />
                        </div>
                        <div>
                          <label className="game-label">計画の振り返り</label>
                          <textarea className="game-input" rows={3}
                            placeholder="月曜に立てた計画と、実際の進捗の差を振り返ろう..."
                            value={retros[assignment.id] ?? ''}
                            onChange={e => setRetros(prev => ({ ...prev, [assignment.id]: e.target.value }))}
                            style={{ resize: 'vertical' }} />
                        </div>

                        {/* サムネイル */}
                        <div>
                          <label className="game-label">サムネイル画像（任意）</label>
                          <p style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>タイムラインのカードに表示されるサムネイルです</p>
                          <input type="file" accept="image/*"
                            onChange={e => handleThumbnailChange(assignment.id, e.target.files?.[0] ?? null)}
                            style={{ display: 'block', fontSize: 13, color: '#3d6e00' }} />
                          {thumbPreviews[assignment.id] && (
                            <img src={thumbPreviews[assignment.id]} alt="preview"
                              style={{ marginTop: 8, width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 8, border: '2px solid #c8e89a' }} />
                          )}
                          {uploadingThumb[assignment.id] && (
                            <p style={{ color: '#6aac14', fontSize: 13, marginTop: 4 }}>アップロード中...</p>
                          )}
                        </div>

                        {/* 匿名設定 */}
                        <div>
                          <label className="game-label">投稿設定</label>
                          <button type="button"
                            onClick={() => setIsAnonymous(prev => ({ ...prev, [assignment.id]: !prev[assignment.id] }))}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              marginTop: 8, padding: '8px 20px', borderRadius: 20,
                              background: isAnonymous[assignment.id] ? '#3d6e00' : '#f0fae0',
                              border: `2px solid ${isAnonymous[assignment.id] ? '#2a4d00' : '#c8e89a'}`,
                              cursor: 'pointer', fontSize: 14, fontWeight: 'bold',
                              color: isAnonymous[assignment.id] ? '#fff' : '#3d6e00',
                              transition: 'all 0.15s',
                            }}>
                            <span>{isAnonymous[assignment.id] ? '🙈' : '👤'}</span>
                            {isAnonymous[assignment.id] ? '匿名投稿' : '実名投稿（公開）'}
                          </button>
                          <p style={{ color: '#888', fontSize: 12, marginTop: 6 }}>
                            {isAnonymous[assignment.id]
                              ? 'タイムラインには名前が表示されません'
                              : 'タイムラインにあなたの名前と作品が公開されます'}
                          </p>
                        </div>

                        <button className="game-button" disabled={submitting[assignment.id]} onClick={() => submitWork(assignment.id)}>
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
                    <button
                      onClick={() => setExpandedHistory(prev => ({ ...prev, [a.id]: !isOpen }))}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                        padding: 0, textAlign: 'left',
                      }}>
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

                    {isOpen && (
                      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <hr style={{ border: 'none', borderTop: '2px dashed #c8e89a', margin: '4px 0' }} />
                        {a.thumbnail_url && (
                          <img src={a.thumbnail_url} alt={a.task.title}
                            style={{ width: '100%', borderRadius: 8, maxHeight: 180, objectFit: 'cover' }} />
                        )}
                        {a.plan_text && (
                          <div>
                            <p className="game-label" style={{ marginBottom: 4 }}>📝 制作計画</p>
                            <p style={textBlockStyle}>{a.plan_text}</p>
                          </div>
                        )}
                        {(a.midterm_progress || a.midterm_correction) && (
                          <div>
                            <p className="game-label" style={{ marginBottom: 4 }}>🔍 中間報告</p>
                            {a.midterm_progress && (
                              <div style={{ marginBottom: 8 }}>
                                <p style={{ color: '#555', fontSize: 12, marginBottom: 2 }}>進捗状況</p>
                                <p style={textBlockStyle}>{a.midterm_progress}</p>
                              </div>
                            )}
                            {a.midterm_correction && (
                              <div>
                                <p style={{ color: '#555', fontSize: 12, marginBottom: 2 }}>修正計画</p>
                                <p style={textBlockStyle}>{a.midterm_correction}</p>
                              </div>
                            )}
                          </div>
                        )}
                        {a.media_url && (
                          <div>
                            <p className="game-label" style={{ marginBottom: 4 }}>🎬 提出URL</p>
                            <a href={a.media_url} target="_blank" rel="noopener noreferrer"
                              style={{ color: '#3d6e00', fontSize: 14, wordBreak: 'break-all' }}>
                              {a.media_url}
                            </a>
                          </div>
                        )}
                        {a.self_evaluation && (
                          <div>
                            <p className="game-label" style={{ marginBottom: 4 }}>⭐ 自己評価</p>
                            <p style={textBlockStyle}>{a.self_evaluation}</p>
                          </div>
                        )}
                        {a.retrospective && (
                          <div>
                            <p className="game-label" style={{ marginBottom: 4 }}>🔄 計画の振り返り</p>
                            <p style={textBlockStyle}>{a.retrospective}</p>
                          </div>
                        )}
                        <p style={{ color: a.is_anonymous ? '#888' : '#6aac14', fontSize: 12 }}>
                          {a.is_anonymous ? '🙈 匿名投稿' : '👤 実名投稿'}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}

          {/* ══ VIEW: タイムライン ════════════════════════════ */}
          {currentView === 'timeline' && (
            <>
              <div className="game-card" style={{ padding: '24px 28px' }}>
                <h2 className="game-title" style={{ fontSize: 22, marginBottom: 4 }}>🌐 タイムライン</h2>
                <p style={{ color: '#3d6e00', fontSize: 13 }}>部員の提出作品 — {timeline.length} 件</p>
              </div>

              {timelineLoading ? (
                <div className="game-card" style={{ padding: 40, textAlign: 'center' }}>
                  <p style={{ color: '#6aac14', fontSize: 16 }}>読み込み中...</p>
                </div>
              ) : timeline.length === 0 ? (
                <div className="game-card" style={{ padding: '28px 32px', textAlign: 'center' }}>
                  <p style={{ fontSize: 28, marginBottom: 8 }}>📭</p>
                  <p style={{ color: '#6aac14', fontSize: 16 }}>まだ提出された作品はありません</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {timeline.map(item => (
                    <button key={item.id}
                      onClick={() => { setSelectedPost(item); loadComments(item.id) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                      <div className="game-card" style={{ padding: 0, overflow: 'hidden', height: '100%' }}>
                        {item.thumbnail_url ? (
                          <img src={item.thumbnail_url} alt={item.task.title}
                            style={{ width: '100%', height: 110, objectFit: 'cover', display: 'block' }} />
                        ) : (
                          <div style={{
                            width: '100%', height: 110,
                            background: 'linear-gradient(135deg, #c8e89a, #6aac14)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <span style={{ fontSize: 32 }}>🎮</span>
                          </div>
                        )}
                        <div style={{ padding: '10px 12px' }}>
                          <p style={{ fontWeight: 'bold', color: '#2d5500', fontSize: 13, marginBottom: 4, lineHeight: 1.4 }}>
                            {item.task.title}
                          </p>
                          <p style={{ color: '#6aac14', fontSize: 11, marginBottom: 2 }}>
                            {item.is_anonymous ? '🙈 匿名' : `👤 ${item.profile?.username ?? '名無し'}`}
                          </p>
                          {item.submitted_at && (
                            <p style={{ color: '#aaa', fontSize: 11 }}>
                              {new Date(item.submitted_at).toLocaleDateString('ja-JP')}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

        </div>
      </div>

      {/* ── タイムライン詳細モーダル ─────────────────────── */}
      {selectedPost && (
        <>
          <div onClick={() => setSelectedPost(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 200 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 201, width: '90%', maxWidth: 520, maxHeight: '85vh',
            overflowY: 'auto', borderRadius: 16,
          }}>
            <div className="game-card" style={{ padding: '24px 28px', position: 'relative' }}>
              <button onClick={() => setSelectedPost(null)} style={{
                position: 'absolute', top: 12, right: 12,
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#6aac14', fontSize: 26, lineHeight: 1,
              }}>×</button>

              {selectedPost.thumbnail_url && (
                <img src={selectedPost.thumbnail_url} alt={selectedPost.task.title}
                  style={{ width: '100%', borderRadius: 8, marginBottom: 16, maxHeight: 200, objectFit: 'cover' }} />
              )}

              <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                {selectedPost.task.target_course && (
                  <span style={{ background: '#6aac14', color: 'white', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 'bold' }}>
                    {selectedPost.task.target_course}
                  </span>
                )}
                {selectedPost.task.target_stage && (
                  <span style={{ background: '#3d6e00', color: 'white', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 'bold' }}>
                    {selectedPost.task.target_stage}
                  </span>
                )}
              </div>

              <h3 style={{ fontWeight: 'bold', color: '#2d5500', fontSize: 18, marginBottom: 4 }}>
                {selectedPost.task.title}
              </h3>
              <p style={{ color: '#6aac14', fontSize: 14, marginBottom: 2 }}>
                {selectedPost.is_anonymous ? '🙈 匿名' : `👤 ${selectedPost.profile?.username ?? '名無し'}`}
              </p>
              {selectedPost.submitted_at && (
                <p style={{ color: '#aaa', fontSize: 12, marginBottom: 16 }}>
                  提出日: {new Date(selectedPost.submitted_at).toLocaleDateString('ja-JP')}
                </p>
              )}

              <hr style={{ border: 'none', borderTop: '2px dashed #c8e89a', margin: '12px 0' }} />

              {selectedPost.media_url && (
                <div style={{ marginBottom: 14 }}>
                  <p className="game-label" style={{ marginBottom: 4 }}>🎬 提出URL</p>
                  <a href={selectedPost.media_url} target="_blank" rel="noopener noreferrer"
                    style={{ color: '#3d6e00', fontSize: 14, wordBreak: 'break-all' }}>
                    {selectedPost.media_url}
                  </a>
                </div>
              )}

              {selectedPost.self_evaluation && (
                <div style={{ marginBottom: 14 }}>
                  <p className="game-label" style={{ marginBottom: 4 }}>⭐ 自己評価</p>
                  <p style={textBlockStyle}>{selectedPost.self_evaluation}</p>
                </div>
              )}

              {selectedPost.retrospective && (
                <div style={{ marginBottom: 16 }}>
                  <p className="game-label" style={{ marginBottom: 4 }}>🔄 計画の振り返り</p>
                  <p style={textBlockStyle}>{selectedPost.retrospective}</p>
                </div>
              )}

              {/* ── コメントセクション ──────────────────── */}
              <hr style={{ border: 'none', borderTop: '2px dashed #c8e89a', margin: '12px 0' }} />
              <p className="game-label" style={{ marginBottom: 10 }}>💬 コメント</p>

              {loadingComments ? (
                <p style={{ color: '#6aac14', fontSize: 13 }}>読み込み中...</p>
              ) : (comments[selectedPost.id] ?? []).length === 0 ? (
                <p style={{ color: '#aaa', fontSize: 13, marginBottom: 12 }}>まだコメントはありません</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  {(comments[selectedPost.id] ?? []).map(c => (
                    <div key={c.id} style={{
                      background: '#f0fae0', borderRadius: 8, padding: '8px 12px',
                      border: '1px solid #c8e89a',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ color: '#3d6e00', fontWeight: 'bold', fontSize: 12 }}>
                          👤 {c.profile?.username ?? '名無し'}
                        </span>
                        <span style={{ color: '#aaa', fontSize: 11 }}>
                          {new Date(c.created_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p style={{ color: '#2d5500', fontSize: 13, lineHeight: 1.5 }}>{c.content}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* コメント入力 */}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="game-input"
                  placeholder="コメントを入力..."
                  value={commentInputs[selectedPost.id] ?? ''}
                  onChange={e => setCommentInputs(prev => ({ ...prev, [selectedPost!.id]: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      postComment(selectedPost!.id, selectedPost!.user_id)
                    }
                  }}
                  style={{ flex: 1, marginBottom: 0 }}
                />
                <button
                  className="game-button"
                  disabled={postingComment[selectedPost.id] || !(commentInputs[selectedPost.id] ?? '').trim()}
                  onClick={() => postComment(selectedPost!.id, selectedPost!.user_id)}
                  style={{ width: 'auto', padding: '0 16px', marginBottom: 0, flexShrink: 0 }}
                >
                  {postingComment[selectedPost.id] ? '…' : '送信'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  )
}

// ─── スタイル定数 ──────────────────────────────────────────

const textBlockStyle: React.CSSProperties = {
  color: '#2d5500', fontSize: 14, lineHeight: 1.7,
  background: '#f0fae0', borderRadius: 8, padding: '10px 14px',
  whiteSpace: 'pre-wrap',
}

"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../lib/supabase'
import { marked } from 'marked'
import { FEATURE_LIST, PermissionKey, getEffectivePermissions } from '../../lib/permissions'
import SlimeIcon from '../components/SlimeIcon'
import { AnimatePresence, motion } from 'framer-motion'
import BonTopics from '../components/BonTopics'

// ─── 定数・型 ─────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  Foundation:  'Ⅰ. 基礎',
  Development: 'Ⅱ. 応用',
  Production:  'Ⅲ. 実践',
}

const COURSE_LABELS: Record<string, string> = {
  Unity:   'Unityコース',
  Blender: 'Blenderコース',
  Web:     'Web開発コース',
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

type ViewId = 'tasks' | 'history' | 'timeline' | 'past_timeline' | 'news'

const NAV_ITEMS: { id: ViewId; icon: string; label: string }[] = [
  { id: 'news',     icon: '📰', label: 'BON-TOPICS' },
  { id: 'tasks',    icon: '📋', label: '今週の課題' },
  { id: 'history',  icon: '📚', label: '過去の課題' },
  { id: 'timeline', icon: '🌐', label: 'タイムライン' },
]

// ─── タイムライン分類ユーティリティ ───────────────────────

function getMostRecentMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function isCurrentTimeline(submittedAt: string | null): boolean {
  if (!submittedAt) return false
  const taskMonday = getMostRecentMonday(new Date(submittedAt))
  const nowMonday  = getMostRecentMonday(new Date())
  const cutoff     = new Date(nowMonday.getTime() - 14 * 24 * 60 * 60 * 1000)
  return taskMonday >= cutoff
}

interface AssignmentTask {
  id: string
  title: string
  description: string | null
  description_is_markdown: boolean
  target_course: string | null
  target_stage: string | null
  allow_image_attachment: boolean
}

interface AssignmentRecord {
  id: string
  status: 'assigned' | 'in_progress' | 'submitted'
  plan_text: string | null
  midterm_progress: string | null
  midterm_correction: string | null
  media_url: string | null
  image_urls: string[] | null
  submission_comment: string | null
  self_evaluation: string | null
  retrospective: string | null
  course_request: string | null
  submitted_at: string | null
  is_anonymous: boolean
  thumbnail_url: string | null
  created_at: string
  deadline_at: string | null
  task: AssignmentTask
}

interface TimelineItem {
  id: string
  user_id: string
  is_anonymous: boolean
  thumbnail_url: string | null
  self_evaluation: string | null
  retrospective: string | null
  submission_comment: string | null
  media_url: string | null
  image_urls: string[] | null
  submitted_at: string | null
  hidden_in_timeline: boolean
  force_past_timeline: boolean
  force_current_timeline: boolean
  task: {
    id: string
    title: string
    target_course: string | null
    target_stage: string | null
    created_at: string
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

interface NotifLog {
  id: string
  title: string
  body: string
  url: string | null
  created_at: string
}

// ─── メディア判定ヘルパー ───────────────────────────────────

function getYoutubeEmbedUrl(url: string): string | null {
  const matchWatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
  if (matchWatch) return `https://www.youtube.com/embed/${matchWatch[1]}`
  const matchShort = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)
  if (matchShort) return `https://www.youtube.com/embed/${matchShort[1]}`
  const matchEmbed = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/)
  if (matchEmbed) return `https://www.youtube.com/embed/${matchEmbed[1]}`
  return null
}

function detectMediaType(url: string): 'youtube' | 'video' | 'image' | 'link' {
  if (!url) return 'link'
  if (getYoutubeEmbedUrl(url)) return 'youtube'
  if (/\.(mp4|webm|mov|avi)(\?|$)/i.test(url)) return 'video'
  if (/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url)) return 'image'
  if (url.includes('/storage/v1/object/public/media/images/')) return 'image'
  if (url.includes('/storage/v1/object/public/media/')) return 'video'
  return 'link'
}

// ─── プッシュ通知サブスクリプション ────────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i)
  return output
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
}

async function subscribePush() {
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidKey) return

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return

  const reg = await navigator.serviceWorker.ready
  const existingSub = await reg.pushManager.getSubscription()
  // 既存の購読があれば再利用し、毎回新しいendpointを作らない
  const sub = existingSub ?? await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
  })

  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) return

  await fetch('/api/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      keys: {
        p256dh: arrayBufferToBase64(sub.getKey('p256dh')!),
        auth:   arrayBufferToBase64(sub.getKey('auth')!),
      },
    }),
  })
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
  const [totalPoints, setTotalPoints]   = useState(0)
  const [rankOpen, setRankOpen]         = useState(true)
  const [coolPoints, setCoolPoints]     = useState(0)
  const [rankSettings, setRankSettings] = useState<RankSetting[]>([])
  const [userRole, setUserRole]         = useState<string | null>(null)
  const [commentDailyLimit, setCommentDailyLimit] = useState(0) // 0=無制限

  // 役職・権限
  const [effectivePerms, setEffectivePerms] = useState<Record<PermissionKey, boolean>>({
    course_management: false, task_management: false,
    point_settings: false, submission_review: false, finance: false, timeline_management: false,
    dm_management: false, announcement_management: false, assignment_management: false, gimmick_management: false,
    dev_management: false, news_management: false,
  })

  // スピーチ
  const [speechBlocks, setSpeechBlocks] = useState<{ id: string; is_active: boolean; sort_order: number }[]>([])
  const [speechLines, setSpeechLines]   = useState<{ id: string; block_id: string; text: string; type_speed_ms: number; display_ms: number; sort_order: number }[]>([])
  const [gimmickSettings, setGimmickSettings] = useState({ block_interval_min_sec: 10, block_interval_max_sec: 30 })
  const [slimeSpeech, setSlimeSpeech]     = useState('')
  const [slimeSpeechFull, setSlimeSpeechFull] = useState('')
  const [speechVisible, setSpeechVisible] = useState(false)

  // DM未読
  const [dmUnreadCount, setDmUnreadCount]           = useState(0)
  const [dmManageUnreadCount, setDmManageUnreadCount] = useState(0)
  const [notifOpen, setNotifOpen]         = useState(false)
  const [notifLogs, setNotifLogs]         = useState<NotifLog[]>([])
  const [notifVisibleCount, setNotifVisibleCount] = useState(3)
  const [notifUnread, setNotifUnread] = useState(0)
  const [positionNames, setPositionNames] = useState<string[]>([])

  // サイドバー
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [currentView, setCurrentView] = useState<ViewId>('tasks')

  // 履歴アコーディオン
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({})

  // 課題アコーディオン
  const [taskParentOpen, setTaskParentOpen] = useState<Record<string, boolean>>({})
  const [taskSectionOpen, setTaskSectionOpen] = useState<Record<string, { detail: boolean; plan: boolean; midterm: boolean; final: boolean }>>({})

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
  const [submissionComments, setSubmissionComments] = useState<Record<string, string>>({})
  const [selfEvals, setSelfEvals]             = useState<Record<string, string>>({})
  const [retros, setRetros]                   = useState<Record<string, string>>({})
  const [courseRequests, setCourseRequests]   = useState<Record<string, string>>({})
  const [isAnonymous, setIsAnonymous]         = useState<Record<string, boolean>>({})
  const [thumbnailFiles, setThumbnailFiles]   = useState<Record<string, File | null>>({})
  const [thumbPreviews, setThumbPreviews]     = useState<Record<string, string>>({})
  const [uploadingThumb, setUploadingThumb]   = useState<Record<string, boolean>>({})
  const [submitting, setSubmitting]           = useState<Record<string, boolean>>({})
  const [submitSuccess, setSubmitSuccess]     = useState<Record<string, boolean>>({})
  const [submitError, setSubmitError]         = useState<Record<string, string>>({})
  // 画像アップロード（複数枚、最大5枚）
  const [imageFiles, setImageFiles]           = useState<Record<string, File[]>>({})
  const [imagePreviews, setImagePreviews]     = useState<Record<string, string[]>>({})
  const [uploadingImages, setUploadingImages] = useState<Record<string, boolean>>({})

  // タイムライン
  const [timeline, setTimeline]               = useState<TimelineItem[]>([])
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [timelineLoaded, setTimelineLoaded]   = useState(false)
  const [selectedPost, setSelectedPost]       = useState<TimelineItem | null>(null)

  // タイムライン ソート・フィルター
  const [timelineSort, setTimelineSort]           = useState<'newest' | 'oldest'>('newest')
  const [timelineFilterCourse, setTimelineFilterCourse] = useState('')
  const [timelineFilterStage, setTimelineFilterStage]   = useState('')
  const [timelineViewMode, setTimelineViewMode]         = useState<'grid' | 'list'>('grid')

  // コメント
  const [comments, setComments]             = useState<Record<string, Comment[]>>({})
  const [loadingComments, setLoadingComments] = useState(false)
  const [commentInputs, setCommentInputs]   = useState<Record<string, string>>({})
  const [postingComment, setPostingComment] = useState<Record<string, boolean>>({})

  const router = useRouter()
  const today      = new Date().getDay()
  const todayPhase = getWeekPhase(today)

  // ─── スピーチループ ─────────────────────────────────────

  useEffect(() => {
    const activeBlocks = speechBlocks.filter(b => b.is_active)
    if (activeBlocks.length === 0) return

    let active = true
    const cleanups: Array<() => void> = []

    function safeTimeout(fn: () => void, delay: number) {
      const t = setTimeout(fn, delay)
      cleanups.push(() => clearTimeout(t))
    }

    function runBlock(blockId: string) {
      const blockLines = speechLines
        .filter(l => l.block_id === blockId)
        .sort((a, b) => a.sort_order - b.sort_order)
      if (blockLines.length === 0) { scheduleNext(); return }

      let lineIdx = 0

      function runLine() {
        if (!active) return
        if (lineIdx >= blockLines.length) {
          setSpeechVisible(false)
          scheduleNext()
          return
        }
        const line = blockLines[lineIdx]
        setSlimeSpeech('')
        setSlimeSpeechFull(line.text)
        setSpeechVisible(true)

        const chars = [...line.text]
        let charIdx = 0
        const iv = setInterval(() => {
          if (!active) { clearInterval(iv); return }
          charIdx++
          setSlimeSpeech(chars.slice(0, charIdx).join(''))
          if (charIdx >= chars.length) {
            clearInterval(iv)
            safeTimeout(() => { lineIdx++; runLine() }, line.display_ms ?? 2500)
          }
        }, line.type_speed_ms ?? 50)
        cleanups.push(() => clearInterval(iv))
      }

      runLine()
    }

    function scheduleNext() {
      if (!active) return
      const active2 = speechBlocks.filter(b => b.is_active)
      if (active2.length === 0) return
      const block = active2[Math.floor(Math.random() * active2.length)]
      const min = (gimmickSettings.block_interval_min_sec ?? 10) * 1000
      const max = (gimmickSettings.block_interval_max_sec ?? 30) * 1000
      safeTimeout(() => runBlock(block.id), min + Math.random() * Math.max(0, max - min))
    }

    // 初回は3〜5秒後に開始
    safeTimeout(() => {
      const b = activeBlocks[Math.floor(Math.random() * activeBlocks.length)]
      runBlock(b.id)
    }, 3000 + Math.random() * 2000)

    return () => {
      active = false
      setSpeechVisible(false)
      cleanups.forEach(fn => fn())
    }
  }, [speechBlocks, speechLines, gimmickSettings])

  // ─── 初期データ読み込み ─────────────────────────────────

  useEffect(() => {
    let mounted = true

    async function loadUser() {
      try {
        const { data, error } = await supabase.auth.getUser()
        if (error || !data?.user) { router.replace('/login'); return }

        const uid = data.user.id
        if (mounted) setUserId(uid)

        const [profileRes, assignmentRes, ranksRes, commentLimitRes, speechBlocksRes, speechLinesRes, gimmickSettingsRes] = await Promise.all([
          supabase.from('profiles')
            .select('username, course, stage, total_points, cool_points, role')
            .eq('id', uid)
            .single(),
          supabase.from('task_assignments')
            .select(`
              id, status, plan_text, midterm_progress, midterm_correction,
              media_url, self_evaluation, retrospective, submitted_at,
              is_anonymous, thumbnail_url, created_at, deadline_at,
              task:tasks(id, title, description, description_is_markdown, target_course, target_stage)
            `)
            .eq('user_id', uid)
            .eq('is_assigned', true),
          supabase.from('rank_settings')
            .select('id, name, min_points, color, rank_order')
            .order('rank_order'),
          supabase.from('point_settings')
            .select('base_points')
            .eq('action_key', 'comment_daily_limit')
            .single(),
          supabase.from('speech_blocks').select('id, is_active, sort_order').order('sort_order'),
          supabase.from('speech_lines').select('id, block_id, text, type_speed_ms, display_ms, sort_order').order('sort_order'),
          supabase.from('gimmick_settings').select('block_interval_min_sec, block_interval_max_sec').single(),
        ])

        if (!mounted) return

        const profile = profileRes.data
        setUsername(profile?.username ?? null)
        setCourse(profile?.course ?? null)
        setStage(profile?.stage ?? null)
        setTotalPoints(profile?.total_points ?? 0)
        setCoolPoints(profile?.cool_points ?? 0)
        setUserRole(profile?.role ?? null)

        // 役職・有効権限を取得
        const [perms, ppRes] = await Promise.all([
          getEffectivePermissions(uid),
          supabase.from('profile_positions').select('positions(name)').eq('profile_id', uid),
        ])
        if (mounted) {
          setEffectivePerms(perms)
          setPositionNames(
            (ppRes.data ?? []).map(pp => {
              const pos = (pp as unknown as { positions: { name: string } | null }).positions
              return pos?.name ?? ''
            }).filter(Boolean)
          )
        }

        // DM未読数を計算
        const [memberConvsRes, managerConvsRes, readsRes] = await Promise.all([
          supabase.from('dm_conversations').select('id, updated_at').eq('member_id', uid),
          supabase.from('dm_conversations').select('id, updated_at').eq('manager_id', uid),
          supabase.from('dm_reads').select('conversation_id, last_read_at').eq('user_id', uid),
        ])
        if (mounted) {
          const readsMap: Record<string, string> = {}
          ;(readsRes.data ?? []).forEach(r => { readsMap[r.conversation_id] = r.last_read_at })

          const allConvIds = [
            ...(memberConvsRes.data ?? []).map(c => c.id),
            ...(managerConvsRes.data ?? []).map(c => c.id),
          ]
          if (allConvIds.length > 0) {
            const { data: latestMsgs } = await supabase
              .from('dm_messages')
              .select('conversation_id, created_at, sender_id')
              .in('conversation_id', allConvIds)
              .order('created_at', { ascending: false })

            const memberConvIds = new Set((memberConvsRes.data ?? []).map(c => c.id))
            const managerConvIds = new Set((managerConvsRes.data ?? []).map(c => c.id))

            const seenMember  = new Set<string>()
            const seenManager = new Set<string>()
            let memberUnread  = 0
            let managerUnread = 0

            ;(latestMsgs ?? []).forEach(m => {
              if (m.sender_id === uid) return
              const lastRead = readsMap[m.conversation_id]
              const isUnread = !lastRead || new Date(m.created_at) > new Date(lastRead)
              if (isUnread) {
                if (memberConvIds.has(m.conversation_id) && !seenMember.has(m.conversation_id)) {
                  seenMember.add(m.conversation_id)
                  memberUnread++
                }
                if (managerConvIds.has(m.conversation_id) && !seenManager.has(m.conversation_id)) {
                  seenManager.add(m.conversation_id)
                  managerUnread++
                }
              }
            })

            setDmUnreadCount(memberUnread)
            setDmManageUnreadCount(managerUnread)
          }
        }

        setRankSettings(ranksRes.data ?? [])
        setCommentDailyLimit(commentLimitRes.data?.base_points ?? 0)
        setSpeechBlocks(speechBlocksRes.data ?? [])
        setSpeechLines(speechLinesRes.data ?? [])
        if (gimmickSettingsRes.data) setGimmickSettings(gimmickSettingsRes.data)

        const assignmentData = assignmentRes.data
        if (assignmentData) {
          setAssignments(assignmentData as unknown as AssignmentRecord[])
          // 子アコーディオン自動オープン（ページ読み込み時1回のみ）
          const initSections: Record<string, { detail: boolean; plan: boolean; midterm: boolean; final: boolean }> = {}
          for (const a of (assignmentData as any[])) {
            if (a.status === 'assigned') {
              initSections[a.id] = { detail: true, plan: true, midterm: false, final: false }
            } else if (a.status === 'in_progress') {
              initSections[a.id] = !a.midterm_progress
                ? { detail: false, plan: false, midterm: true, final: false }
                : { detail: false, plan: false, midterm: false, final: true }
            } else {
              initSections[a.id] = { detail: false, plan: false, midterm: false, final: false }
            }
          }
          setTaskSectionOpen(initSections)
          const plans: Record<string, string>   = {}
          const midProg: Record<string, string> = {}
          const midCorr: Record<string, string> = {}
          const subComments: Record<string, string> = {}
          const evals: Record<string, string>   = {}
          const retro: Record<string, string>   = {}
          const courseReqs: Record<string, string> = {}
          const anon: Record<string, boolean>   = {}
          assignmentData.forEach(a => {
            plans[a.id]       = a.plan_text           ?? ''
            midProg[a.id]     = a.midterm_progress    ?? ''
            midCorr[a.id]     = a.midterm_correction  ?? ''
            subComments[a.id] = (a as any).submission_comment  ?? ''
            evals[a.id]       = a.self_evaluation     ?? ''
            retro[a.id]       = a.retrospective       ?? ''
            courseReqs[a.id]  = (a as any).course_request      ?? ''
            anon[a.id]        = a.is_anonymous        ?? false
          })
          setPlanTexts(plans)
          setMidtermProgress(midProg)
          setMidtermCorrection(midCorr)
          setSubmissionComments(subComments)
          setSelfEvals(evals)
          setRetros(retro)
          setCourseRequests(courseReqs)
          setIsAnonymous(anon)
        }

        // 通知ログ読み込み
        const { data: logs } = await supabase
          .from('notification_logs')
          .select('id, title, body, url, created_at')
          .order('created_at', { ascending: false })
          .limit(50)
        if (mounted) {
          setNotifLogs((logs ?? []) as NotifLog[])
          const lastOpened = typeof window !== 'undefined'
            ? localStorage.getItem('notif_last_opened') : null
          const unread = (logs ?? []).filter(l =>
            !lastOpened || new Date(l.created_at) > new Date(lastOpened)
          ).length
          setNotifUnread(unread)
        }

        // プッシュ通知サブスクリプション登録（エラーは無視）
        subscribePush().catch(() => {})
      } catch {
        router.replace('/login')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    loadUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.replace('/login')
    })

    return () => { mounted = false; subscription.unsubscribe() }
  }, [router])

  // ─── タイムライン読み込み ───────────────────────────────

  useEffect(() => {
    if (currentView !== 'timeline' && currentView !== 'past_timeline') return
    if (timelineLoaded) return
    let mounted = true
    setTimelineLoading(true)

    async function fetchTimeline() {
      try {
        const { data: tlData, error: tlError } = await supabase
          .from('task_assignments')
          .select(`
            id, user_id, is_anonymous, thumbnail_url,
            self_evaluation, retrospective, submission_comment, media_url, image_urls, submitted_at,
            hidden_in_timeline, force_past_timeline, force_current_timeline,
            task:tasks(id, title, target_course, target_stage, created_at)
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
          setTimelineLoaded(true)
        }
      } catch (err) {
        console.error('Timeline fetch failed:', err)
        if (mounted) setTimelineLoading(false)
      }
    }

    fetchTimeline()
    return () => { mounted = false }
  }, [currentView, timelineLoaded])

  // ─── ハンドラ ───────────────────────────────────────────

  async function refreshAssignments() {
    if (!userId) return
    const { data } = await supabase.from('task_assignments')
      .select(`
        id, status, plan_text, midterm_progress, midterm_correction,
        media_url, self_evaluation, retrospective, submitted_at,
        is_anonymous, thumbnail_url, created_at, deadline_at,
        task:tasks(id, title, description, description_is_markdown, target_course, target_stage)
      `)
      .eq('user_id', userId)
      .eq('is_assigned', true)
    if (data) setAssignments(data as unknown as AssignmentRecord[])
  }

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
      setTaskSectionOpen(prev => ({ ...prev, [assignmentId]: { detail: false, plan: false, midterm: true, final: false } }))
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
      setTaskSectionOpen(prev => ({ ...prev, [assignmentId]: { detail: false, plan: false, midterm: false, final: true } }))
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
    setSubmitError(prev => ({ ...prev, [assignmentId]: '' }))

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

    // 画像ファイルアップロード（複数枚、最大5枚）
    const uploadedImageUrls: string[] = []
    const imgFiles = imageFiles[assignmentId] ?? []
    if (imgFiles.length > 0 && userId) {
      setUploadingImages(prev => ({ ...prev, [assignmentId]: true }))
      for (let i = 0; i < imgFiles.length; i++) {
        const f = imgFiles[i]
        const ext = f.name.split('.').pop() ?? 'jpg'
        const iPath = `images/${userId}/${assignmentId}/${i}.${ext}`
        const { data: iData, error: iErr } = await supabase.storage
          .from('media')
          .upload(iPath, f, { upsert: true })
        if (!iErr && iData) {
          const { data: iUrlData } = supabase.storage.from('media').getPublicUrl(iData.path)
          uploadedImageUrls.push(iUrlData.publicUrl)
        }
      }
      setUploadingImages(prev => ({ ...prev, [assignmentId]: false }))
    }

    const { error } = await supabase.from('task_assignments').update({
      image_urls:         uploadedImageUrls.length > 0 ? uploadedImageUrls : null,
      submission_comment: submissionComments[assignmentId] ?? '',
      self_evaluation:    selfEvals[assignmentId]   ?? '',
      retrospective:      retros[assignmentId]      ?? '',
      course_request:     courseRequests[assignmentId] ?? '',
      is_anonymous:       isAnonymous[assignmentId] ?? false,
      thumbnail_url:      thumbUrl,
      status:             'submitted',
      submitted_at:       now,
      updated_at:         now,
    }).eq('id', assignmentId)

    setSubmitting(prev => ({ ...prev, [assignmentId]: false }))
    if (error) {
      const msg = (error as any)?.message ?? JSON.stringify(error)
      if (msg.includes('JWT') || msg.includes('token') || msg.includes('session')) {
        setSubmitError(prev => ({ ...prev, [assignmentId]: 'セッションが切れています。ページを再読み込みしてください。' }))
      } else {
        setSubmitError(prev => ({ ...prev, [assignmentId]: `提出に失敗しました: ${msg}` }))
      }
      return
    }
    if (!error) {
      setSubmitSuccess(prev => ({ ...prev, [assignmentId]: true }))
      setAssignments(prev => prev.map(a =>
        a.id === assignmentId
          ? { ...a, status: 'submitted', submitted_at: now,
              is_anonymous: isAnonymous[assignmentId] ?? false,
              thumbnail_url: thumbUrl,
              image_urls: uploadedImageUrls.length > 0 ? uploadedImageUrls : a.image_urls }
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

    // コメントポイント付与可否チェック（他人投稿・初コメント・日次上限）
    let canEarnPoint = false
    if (userId !== postOwnerId) {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
      const [{ count: prevCount }, { data: todayComments }] = await Promise.all([
        supabase.from('timeline_comments')
          .select('id', { count: 'exact', head: true })
          .eq('assignment_id', assignmentId).eq('user_id', userId),
        supabase.from('timeline_comments')
          .select('assignment_id')
          .eq('user_id', userId)
          .gte('created_at', todayStart.toISOString()),
      ])
      const isFirst = (prevCount ?? 0) === 0
      const uniqueToday = new Set((todayComments ?? []).map(c => c.assignment_id)).size
      canEarnPoint = isFirst && (commentDailyLimit === 0 || uniqueToday < commentDailyLimit)
    }

    const { error } = await supabase
      .from('timeline_comments')
      .insert({ assignment_id: assignmentId, user_id: userId, content })

    if (!error) {
      setCommentInputs(prev => ({ ...prev, [assignmentId]: '' }))
      await loadComments(assignmentId)
      if (canEarnPoint) {
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

  function getDeadlineLabel(a: AssignmentRecord): string {
    let deadline: Date
    if (a.deadline_at) {
      deadline = new Date(a.deadline_at)
    } else {
      const created = new Date(a.created_at)
      const daysToSunday = created.getDay() === 0 ? 0 : 7 - created.getDay()
      deadline = new Date(created)
      deadline.setDate(created.getDate() + daysToSunday)
    }
    return `${deadline.getMonth() + 1}/${deadline.getDate()}(日)`
  }
  const submittedAssignments = assignments.filter(a => a.status === 'submitted')

  // ランク計算：rank_order ではなく min_points でソートして正確に判定
  const sortedByPoints = [...rankSettings].sort((a, b) => a.min_points - b.min_points)
  const currentRank    = [...sortedByPoints].reverse().find(r => coolPoints >= r.min_points) ?? sortedByPoints[0] ?? null
  const nextRank       = currentRank
    ? sortedByPoints.find(r => r.min_points > currentRank.min_points) ?? null
    : null

  // ─── タイムライン フィルター・分類 ─────────────────────

  function applyTimelineFilters(items: TimelineItem[]): TimelineItem[] {
    let list = [...items]
    if (timelineFilterCourse) list = list.filter(i => i.task.target_course === timelineFilterCourse)
    if (timelineFilterStage)  list = list.filter(i => i.task.target_stage === timelineFilterStage)
    list.sort((a, b) => {
      const dA = new Date(a.submitted_at ?? 0).getTime()
      const dB = new Date(b.submitted_at ?? 0).getTime()
      return timelineSort === 'newest' ? dB - dA : dA - dB
    })
    return list
  }

  const visibleTimeline = timeline.filter(i => !i.hidden_in_timeline)
  const currentTimeline = applyTimelineFilters(visibleTimeline.filter(i => !i.force_past_timeline && (i.force_current_timeline || isCurrentTimeline(i.submitted_at))))
  const pastTimeline    = applyTimelineFilters(visibleTimeline.filter(i => i.force_past_timeline || (!i.force_current_timeline && !isCurrentTimeline(i.submitted_at))))

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

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <nav style={{ padding: '12px 0' }}>
          {NAV_ITEMS.map(item => (
            <button key={item.id} onClick={() => navigate(item.id)} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              width: '100%', padding: '12px 20px',
              background: currentView === item.id ? '#3d6e00' : 'none',
              border: 'none', cursor: 'pointer',
              color: currentView === item.id ? '#fff' : '#a8d870',
              fontSize: 15, fontWeight: 'bold',
              textAlign: 'left', transition: 'background 0.15s',
            }}>
              <span style={{ fontSize: 18 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
          <button onClick={() => navigate('past_timeline')} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            width: '100%', padding: '12px 20px',
            background: currentView === 'past_timeline' ? '#3d6e00' : 'none',
            border: 'none', cursor: 'pointer',
            color: currentView === 'past_timeline' ? '#fff' : '#a8d870',
            fontSize: 15, fontWeight: currentView === 'past_timeline' ? 'bold' : 'normal',
            textAlign: 'left', transition: 'background 0.15s',
          }}>
            <span style={{ fontSize: 18 }}>📦</span>
            過去のタイムライン
          </button>

          {/* ダイレクトメッセージ - 全ユーザー */}
          <div style={{ position: 'relative' }}>
            <a href="/dm" style={{ textDecoration: 'none', display: 'block' }}>
              <button style={{
                display: 'flex', alignItems: 'center', gap: 12,
                width: '100%', padding: '12px 20px',
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#a8d870', fontSize: 15, textAlign: 'left', transition: 'background 0.15s',
              }}>
                <span style={{ fontSize: 18 }}>💬</span>
                DM送信
              </button>
            </a>
            {dmUnreadCount > 0 && (
              <span style={{
                position: 'absolute', top: 8, right: 12,
                background: 'red', color: 'white', borderRadius: 10,
                fontSize: 11, fontWeight: 'bold', minWidth: 18, height: 18,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 4px',
              }}>
                {dmUnreadCount}
              </span>
            )}
          </div>

          {/* DM受信 - dm_management権限のみ */}
          {(userRole === 'admin' || effectivePerms.dm_management) && (
            <div style={{ position: 'relative' }}>
              <a href="/dm/manage" style={{ textDecoration: 'none', display: 'block' }}>
                <button style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  width: '100%', padding: '12px 20px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#a8d870', fontSize: 15, textAlign: 'left', transition: 'background 0.15s',
                }}>
                  <span style={{ fontSize: 18 }}>📬</span>
                  DM受信
                </button>
              </a>
              {dmManageUnreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: 8, right: 12,
                  background: 'red', color: 'white', borderRadius: 10,
                  fontSize: 11, fontWeight: 'bold', minWidth: 18, height: 18,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 4px',
                }}>
                  {dmManageUnreadCount}
                </span>
              )}
            </div>
          )}

          {/* 不具合・要望 - 全ユーザー */}
          <a href="/reports" style={{ textDecoration: 'none', display: 'block' }}>
            <button style={{
              display: 'flex', alignItems: 'center', gap: 12,
              width: '100%', padding: '12px 20px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#a8d870', fontSize: 15, textAlign: 'left', transition: 'background 0.15s',
            }}>
              <span style={{ fontSize: 18 }}>🐛</span>
              不具合・要望
            </button>
          </a>
        </nav>

        {(userRole === 'admin' || FEATURE_LIST.some(f => effectivePerms[f.id])) && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid #3d6e00', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {userRole === 'admin' && (
              <a href="/admin/positions" style={{ textDecoration: 'none' }}>
                <button style={{
                  width: '100%', padding: '8px 0',
                  background: '#2d5500', border: '2px solid #6aac14',
                  borderRadius: 8, color: '#a8d870',
                  fontSize: 13, cursor: 'pointer', fontWeight: 'bold',
                }}>
                  🏷 役職管理
                </button>
              </a>
            )}
            {FEATURE_LIST.map(f => (userRole === 'admin' || effectivePerms[f.id]) && (
              <a key={f.id} href={f.path} style={{ textDecoration: 'none' }}>
                <button style={{
                  width: '100%', padding: '8px 0',
                  background: '#3d6e00', border: '2px solid #6aac14',
                  borderRadius: 8, color: '#fff',
                  fontSize: 13, cursor: 'pointer', fontWeight: 'bold',
                }}>
                  {f.icon} {f.label}
                </button>
              </a>
            ))}
          </div>
        )}
        </div>{/* scrollable area end */}

        <div style={{ padding: '12px 20px 0', borderTop: '2px solid #3d6e00' }}>
          <a href="/account"
            style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#a8d870', fontSize: 14, textDecoration: 'none', padding: '8px 0' }}>
            <span>⚙</span> アカウント設定
          </a>
        </div>
        <div style={{ padding: '0 20px 16px' }}>
          <button onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', color: '#a8d870', fontSize: 14, padding: '8px 0' }}>
            <span>🚪</span> ログアウト
          </button>
        </div>
      </div>

      {/* ── メインコンテンツ ─────────────────────────────── */}
      <div style={{ padding: '24px 24px 40px' }}>
        {/* ハンバーガーボタン */}
        <div style={{ position: 'fixed', top: 16, left: 16, zIndex: 99, display: 'inline-block' }}>
          <button onClick={() => setSidebarOpen(true)} style={{
            background: '#1a3a00', border: '2px solid #3d6e00',
            borderRadius: 8, padding: '6px 10px',
            cursor: 'pointer', color: '#6aac14', fontSize: 20, lineHeight: 1,
          }}>
            ☰
          </button>
          {(dmUnreadCount > 0 || dmManageUnreadCount > 0) && (
            <span style={{
              position: 'absolute', top: 2, right: 2,
              width: 8, height: 8, borderRadius: '50%',
              background: 'red', border: '1.5px solid white',
              display: 'block',
            }} />
          )}
        </div>

        {/* ベルアイコン */}
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 99, display: 'inline-block' }}>
          <button
            onClick={() => {
              const opening = !notifOpen
              setNotifOpen(opening)
              if (opening) {
                localStorage.setItem('notif_last_opened', new Date().toISOString())
                setNotifUnread(0)
                setNotifVisibleCount(3)
              }
            }}
            style={{
              background: '#1a3a00', border: '2px solid #3d6e00',
              borderRadius: 8, padding: '6px 10px',
              cursor: 'pointer', fontSize: 20, lineHeight: 1,
            }}
          >
            <span style={{ filter: 'grayscale(1) brightness(10)', display: 'inline-block' }}>🔔</span>
          </button>
          {notifUnread > 0 && (
            <span style={{
              position: 'absolute', top: 2, right: 2,
              width: 8, height: 8, borderRadius: '50%',
              background: 'red', border: '1.5px solid white',
              display: 'block',
            }} />
          )}
        </div>

        {/* ── 通知センター オーバーレイ ──────────────────── */}
        {notifOpen && (
          <div
            onClick={() => setNotifOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 149 }}
          />
        )}

        {/* ── 通知センター グリーンシャッター ───────────── */}
        <AnimatePresence>
          {notifOpen && (
            <motion.div
              key="notif-shutter"
              initial={{ y: '-100%' }}
              animate={{ y: 0 }}
              exit={{ y: '-100%' }}
              transition={{ type: 'spring', stiffness: 280, damping: 22 }}
              style={{
                position: 'fixed', top: -200, left: 0, right: 0,
                height: 'calc(50vh + 200px)',
                background: '#1a3a00',
                borderBottom: '4px solid #6aac14',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                zIndex: 150,
                display: 'flex', flexDirection: 'column',
                paddingTop: 200,
              }}
            >
              {/* ヘッダー */}
              <div style={{
                display: 'flex', alignItems: 'center',
                padding: '14px 20px',
                borderBottom: '1px solid #3d6e00',
                flexShrink: 0,
              }}>
                <span style={{ color: '#6aac14', fontWeight: 'bold', fontSize: 16 }}>
                  🔔 通知センター
                </span>
                <button
                  onClick={() => setNotifOpen(false)}
                  style={{
                    marginLeft: 'auto',
                    background: 'none', border: 'none',
                    color: '#a8d870', fontSize: 20, cursor: 'pointer', lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              </div>

              {/* 通知リスト */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
                <AnimatePresence initial={false}>
                  {notifLogs.length === 0 ? (
                    <p style={{ color: '#a8d870', textAlign: 'center', marginTop: 24, fontSize: 14 }}>
                      通知はありません
                    </p>
                  ) : notifLogs.slice(0, notifVisibleCount).map(log => (
                    <motion.div
                      key={log.id}
                      layout
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 24, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
                      transition={{ duration: 0.18 }}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                        background: '#2d5500',
                        border: '1px solid #3d6e00',
                        borderRadius: 10,
                        padding: '10px 12px',
                        marginBottom: 8,
                        overflow: 'hidden',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {log.url ? (
                          <a href={log.url} style={{ textDecoration: 'none' }}>
                            <p style={{ color: '#a8d870', fontWeight: 'bold', fontSize: 14, margin: 0 }}>{log.title}</p>
                          </a>
                        ) : (
                          <p style={{ color: '#a8d870', fontWeight: 'bold', fontSize: 14, margin: 0 }}>{log.title}</p>
                        )}
                        <p style={{ color: '#7ab83a', fontSize: 13, margin: '3px 0 0', wordBreak: 'break-all' }}>{log.body}</p>
                        <p style={{ color: '#5a8a1a', fontSize: 11, margin: '4px 0 0' }}>
                          {new Date(log.created_at).toLocaleString('ja-JP')}
                        </p>
                      </div>
                      <button
                        onClick={async () => {
                          await supabase.from('notification_logs')
                            .update({ deleted_at: new Date().toISOString() })
                            .eq('id', log.id)
                          setNotifLogs(prev => prev.filter(l => l.id !== log.id))
                        }}
                        style={{
                          background: 'none', border: 'none',
                          color: '#5a8a1a', fontSize: 16, cursor: 'pointer',
                          padding: '2px 4px', flexShrink: 0, lineHeight: 1,
                        }}
                      >
                        🗑
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {notifLogs.length > notifVisibleCount && (
                  <button
                    onClick={() => setNotifVisibleCount(c => c + 3)}
                    style={{
                      width: '100%', padding: '8px 0',
                      background: 'none', border: '1px solid #3d6e00',
                      borderRadius: 8, color: '#6aac14',
                      fontSize: 13, cursor: 'pointer', marginBottom: 8,
                    }}
                  >
                    さらに読み込む
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── ランクウィジェット ─────────────────────────── */}
        {currentRank && (
          <div style={{
            position: 'fixed', top: 64, left: 8, zIndex: 98,
            transform: rankOpen ? 'translateX(0)' : 'translateX(-93px)',
            transition: 'transform 0.3s ease',
            display: 'flex', alignItems: 'stretch',
          }}>
            {/* カード本体 */}
            <div style={{
              background: '#1a3a00',
              border: `3px solid ${currentRank.color}`,
              borderRight: 'none',
              borderRadius: '0 0 0 0',
              borderTopRightRadius: 0,
              borderBottomRightRadius: 0,
              borderTopLeftRadius: 12,
              borderBottomLeftRadius: 12,
              padding: '10px 10px',
              textAlign: 'center', width: 90,
            }}>
              <p style={{ color: currentRank.color, fontWeight: 'bold', fontSize: 26, lineHeight: 1, marginBottom: 2 }}>
                {currentRank.name}
              </p>
              <p style={{ color: currentRank.color, fontSize: 11, marginBottom: 4 }}>ランク</p>
              <p style={{ color: '#a8d870', fontSize: 11, marginBottom: 4 }}>
                累計 <span style={{ fontWeight: 'bold' }}>{totalPoints}</span> pt
              </p>
              {nextRank ? (
                <p style={{ color: '#a8d870', fontSize: 11, lineHeight: 1.4 }}>
                  次まで<br/>
                  <span style={{ fontWeight: 'bold', fontSize: 14 }}>
                    {nextRank.min_points - coolPoints}
                  </span> pt
                </p>
              ) : (
                <p style={{ color: '#f0a000', fontSize: 11 }}>最高ランク！</p>
              )}
            </div>
            {/* つまみ */}
            <button
              onClick={() => setRankOpen(o => !o)}
              style={{
                background: '#1a3a00',
                border: `3px solid ${currentRank.color}`,
                borderLeft: 'none',
                borderRadius: '0 10px 10px 0',
                width: 20, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 0,
              }}
            >
              <span style={{ color: currentRank.color, fontSize: 11, lineHeight: 1, userSelect: 'none' }}>
                {rankOpen ? '‹' : '›'}
              </span>
            </button>
          </div>
        )}

        <div className="stagger-children" style={{ maxWidth: 560, margin: '0 auto', paddingTop: 48, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── ウェルカムカード ─────────────────────────── */}
          <div style={{
            background: 'linear-gradient(135deg, #4e8a00 0%, #3d6e00 60%, #2a4d00 100%)',
            border: '3px solid #6aac14',
            borderRadius: 20,
            padding: '36px 32px',
            textAlign: 'center',
            boxShadow: '0 6px 0 #1a3a00',
          }}>
            <SlimeIcon
              size={80}
              speechText={slimeSpeech}
              speechFullText={slimeSpeechFull}
              speechVisible={speechVisible}
            />
            <h1 className="game-title" style={{ fontSize: 36, marginBottom: 8, color: '#ffffff', fontWeight: 900, textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>ようこそ！</h1>
            <p style={{ fontSize: 26, fontWeight: 'bold', color: '#d4f08a', marginBottom: 20 }}>
              {username ?? '名無し'} さん
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <span style={{
                background: course ? 'rgba(106,172,20,0.35)' : 'rgba(255,255,255,0.15)', color: '#d4f08a',
                borderRadius: 20, padding: '5px 16px', fontSize: 14, fontWeight: 'bold',
                border: `2px solid ${course ? '#a8d870' : 'rgba(255,255,255,0.3)'}`,
              }}>
                {course ? COURSE_LABELS[course] : '未設定'}
              </span>
              <span style={{
                background: stage ? 'rgba(42,77,0,0.5)' : 'rgba(255,255,255,0.15)', color: '#d4f08a',
                borderRadius: 20, padding: '5px 16px', fontSize: 14, fontWeight: 'bold',
                border: `2px solid ${stage ? '#a8d870' : 'rgba(255,255,255,0.3)'}`,
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

          {/* ══ VIEW: BON-TOPICS ══════════════════════════ */}
          {currentView === 'news' && userId && (
            <BonTopics userId={userId} userCourse={course} onAssign={refreshAssignments} />
          )}

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
                        <div className={isActive ? 'milestone-active' : ''} style={{
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
                          fontWeight: 'bold',
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
                const parentOpen = taskParentOpen[assignment.id] ?? false
                const sec = taskSectionOpen[assignment.id] ?? { detail: false, plan: false, midterm: false, final: false }
                const toggleSec = (key: 'detail' | 'plan' | 'midterm' | 'final') =>
                  setTaskSectionOpen(prev => {
                    const cur = prev[assignment.id] ?? { detail: false, plan: false, midterm: false, final: false }
                    return { ...prev, [assignment.id]: { ...cur, [key]: !cur[key] } }
                  })

                return (
                  <div key={assignment.id} className="game-card" style={{ padding: 0, overflow: 'hidden' }}>

                    {/* ── 親ヘッダー */}
                    <div
                      onClick={() => setTaskParentOpen(prev => ({ ...prev, [assignment.id]: !parentOpen }))}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', cursor: 'pointer', userSelect: 'none' }}
                    >
                      <span style={{ fontSize: 13, color: '#6aac14', flexShrink: 0, display: 'inline-block', transform: parentOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▶</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 'bold', color: '#2d5500', fontSize: 16, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {assignment.task.title}
                        </p>
                        <p style={{ color: '#6aac14', fontSize: 12, margin: 0, marginTop: 2, fontWeight: 'bold' }}>
                          最終提出: {getDeadlineLabel(assignment)}
                        </p>
                      </div>
                      <span style={{ background: si.bg, color: si.color, borderRadius: 12, padding: '4px 10px', fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {si.emoji} {si.label}
                      </span>
                    </div>

                    {/* ── 子セクション群 */}
                    {parentOpen && (
                      <div style={{ borderTop: '2px solid #d4f0a0' }}>

                        {/* 📋 課題 */}
                        <div style={{ borderBottom: '1px solid #e8ffd4' }}>
                          <div onClick={() => toggleSec('detail')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 20px', cursor: 'pointer', userSelect: 'none', background: '#f8fff0' }}>
                            <span style={{ fontSize: 12, color: '#6aac14', display: 'inline-block', transform: sec.detail ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>▶</span>
                            <span style={{ fontWeight: 'bold', color: '#2d5500', fontSize: 14, flex: 1 }}>📋 課題</span>
                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                              {assignment.task.target_course && <span style={{ background: '#6aac14', color: 'white', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 'bold' }}>{assignment.task.target_course}</span>}
                              {assignment.task.target_stage && <span style={{ background: '#3d6e00', color: 'white', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 'bold' }}>{assignment.task.target_stage}</span>}
                            </div>
                          </div>
                          {sec.detail && (
                            <div style={{ padding: '12px 20px 16px', borderTop: '1px solid #e8ffd4' }}>
                              {assignment.task.description ? (
                                assignment.task.description_is_markdown
                                  ? <div className="markdown-body" style={{ color: '#3d6e00', fontSize: 14, lineHeight: 1.7 }}
                                      dangerouslySetInnerHTML={{ __html: marked.parse(assignment.task.description, { breaks: true }) as string }} />
                                  : <p style={{ color: '#3d6e00', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0 }}>{assignment.task.description}</p>
                              ) : <p style={{ color: '#aaa', fontSize: 13, margin: 0 }}>（説明なし）</p>}
                            </div>
                          )}
                        </div>

                        {/* 📝 計画 */}
                        <div style={{ borderBottom: '1px solid #e8ffd4' }}>
                          <div onClick={() => toggleSec('plan')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 20px', cursor: 'pointer', userSelect: 'none', background: '#f8fff0' }}>
                            <span style={{ fontSize: 12, color: '#6aac14', display: 'inline-block', transform: sec.plan ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>▶</span>
                            <span style={{ fontWeight: 'bold', color: '#2d5500', fontSize: 14, flex: 1 }}>📝 計画</span>
                            {assignment.plan_text && <span style={{ background: '#c8f0c0', color: '#1a6e00', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 'bold' }}>✅ 入力済</span>}
                          </div>
                          {sec.plan && (
                            <div style={{ padding: '12px 20px 16px', borderTop: '1px solid #e8ffd4', display: 'flex', flexDirection: 'column', gap: 10 }}>
                              <textarea
                                className="game-input" rows={3}
                                placeholder="今週どこまで作るか、どんな手順で進めるかを書こう..."
                                value={planTexts[assignment.id] ?? ''}
                                onChange={e => setPlanTexts(prev => ({ ...prev, [assignment.id]: e.target.value }))}
                                style={{ resize: 'vertical' }}
                              />
                              <button className="game-button" disabled={savingPlan[assignment.id]} onClick={() => savePlan(assignment.id)}>
                                {savingPlan[assignment.id] ? '保存中…' : '計画を保存'}
                              </button>
                              {planSuccess[assignment.id] && <div className="game-success">保存しました！ステータスを「取り組み中」に更新しました。</div>}
                            </div>
                          )}
                        </div>

                        {/* 🔍 中間報告 */}
                        <div style={{ borderBottom: '1px solid #e8ffd4' }}>
                          <div onClick={() => toggleSec('midterm')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 20px', cursor: 'pointer', userSelect: 'none', background: '#f8fff0' }}>
                            <span style={{ fontSize: 12, color: '#6aac14', display: 'inline-block', transform: sec.midterm ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>▶</span>
                            <span style={{ fontWeight: 'bold', color: '#2d5500', fontSize: 14, flex: 1 }}>
                              🔍 中間報告
                              {todayPhase === 'midterm' && <span style={{ marginLeft: 8, background: '#6aac14', color: 'white', borderRadius: 8, padding: '1px 7px', fontSize: 11 }}>今日！</span>}
                            </span>
                            {assignment.midterm_progress && <span style={{ background: '#c8f0c0', color: '#1a6e00', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 'bold' }}>✅ 入力済</span>}
                          </div>
                          {sec.midterm && (
                            <div style={{ padding: '12px 20px 16px', borderTop: '1px solid #e8ffd4', display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                              {midtermSuccess[assignment.id] && <div className="game-success">中間報告を保存しました！</div>}
                            </div>
                          )}
                        </div>

                        {/* 🎬 最終提出 */}
                        <div>
                          <div onClick={() => toggleSec('final')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 20px', cursor: 'pointer', userSelect: 'none', background: '#f8fff0' }}>
                            <span style={{ fontSize: 12, color: '#6aac14', display: 'inline-block', transform: sec.final ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>▶</span>
                            <span style={{ fontWeight: 'bold', color: '#2d5500', fontSize: 14, flex: 1 }}>
                              🎬 最終提出
                              {todayPhase === 'final' && <span style={{ marginLeft: 8, background: '#6aac14', color: 'white', borderRadius: 8, padding: '1px 7px', fontSize: 11 }}>今日！</span>}
                            </span>
                            {(assignment.image_urls && assignment.image_urls.length > 0) && <span style={{ background: '#c8f0c0', color: '#1a6e00', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 'bold' }}>✅ 入力済</span>}
                          </div>
                          {sec.final && (
                            <div style={{ padding: '12px 20px 16px', borderTop: '1px solid #e8ffd4', display: 'flex', flexDirection: 'column', gap: 14 }}>
                              {assignment.task.allow_image_attachment !== false && (
                                <div>
                                  <label className="game-label">画像（最大5枚）</label>
                                  <p style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>制作物のスクリーンショットや完成画像を添付してください</p>
                                  <input type="file" accept="image/*" multiple
                                    onChange={e => {
                                      const files = Array.from(e.target.files ?? []).slice(0, 5)
                                      setImageFiles(prev => ({ ...prev, [assignment.id]: files }))
                                      setImagePreviews(prev => ({
                                        ...prev,
                                        [assignment.id]: files.map(f => URL.createObjectURL(f)),
                                      }))
                                    }}
                                    style={{ display: 'block', fontSize: 13, color: '#3d6e00' }} />
                                  <p style={{ color: '#888', fontSize: 12, marginTop: 4 }}>⚠️ 1枚あたり10MBまで（jpg・png・gif・webp）</p>
                                  {(imagePreviews[assignment.id] ?? []).length > 0 && (
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                                      {(imagePreviews[assignment.id] ?? []).map((src, i) => (
                                        <img key={i} src={src} alt={`preview-${i}`}
                                          style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '2px solid #c8e89a' }} />
                                      ))}
                                    </div>
                                  )}
                                  {uploadingImages[assignment.id] && <p style={{ color: '#6aac14', fontSize: 13, marginTop: 4 }}>画像アップロード中...</p>}
                                </div>
                              )}
                              <div>
                                <label className="game-label">📋 提出物を記載</label>
                                <textarea className="game-input" rows={3}
                                  placeholder="今回作ったものを説明してください。どんな機能を実装したか、工夫した点など..."
                                  value={submissionComments[assignment.id] ?? ''}
                                  onChange={e => setSubmissionComments(prev => ({ ...prev, [assignment.id]: e.target.value }))}
                                  style={{ resize: 'vertical' }} />
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
                              <div>
                                <label className="game-label">サムネイル画像（任意）</label>
                                <p style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>タイムラインのカードに表示されるサムネイルです</p>
                                <input type="file" accept="image/*"
                                  onChange={e => handleThumbnailChange(assignment.id, e.target.files?.[0] ?? null)}
                                  style={{ display: 'block', fontSize: 13, color: '#3d6e00' }} />
                                {thumbPreviews[assignment.id] && <img src={thumbPreviews[assignment.id]} alt="preview" style={{ marginTop: 8, width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 8, border: '2px solid #c8e89a' }} />}
                                {uploadingThumb[assignment.id] && <p style={{ color: '#6aac14', fontSize: 13, marginTop: 4 }}>アップロード中...</p>}
                              </div>
                              <div>
                                <label className="game-label">投稿設定</label>
                                <button type="button"
                                  onClick={() => setIsAnonymous(prev => ({ ...prev, [assignment.id]: !prev[assignment.id] }))}
                                  style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, padding: '8px 20px', borderRadius: 20, background: isAnonymous[assignment.id] ? '#3d6e00' : '#f0fae0', border: `2px solid ${isAnonymous[assignment.id] ? '#2a4d00' : '#c8e89a'}`, cursor: 'pointer', fontSize: 14, fontWeight: 'bold', color: isAnonymous[assignment.id] ? '#fff' : '#3d6e00', transition: 'all 0.15s' }}>
                                  <span>{isAnonymous[assignment.id] ? '🙈' : '👤'}</span>
                                  {isAnonymous[assignment.id] ? '匿名投稿' : '実名投稿（公開）'}
                                </button>
                                <p style={{ color: '#888', fontSize: 12, marginTop: 6 }}>
                                  {isAnonymous[assignment.id] ? 'タイムラインには名前が表示されません' : 'タイムラインにあなたの名前と作品が公開されます'}
                                </p>
                              </div>
                              <div style={{ borderTop: '2px dashed #c8e89a', paddingTop: 14 }}>
                                <label className="game-label">💬 コースへの要望</label>
                                <p style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>
                                  やってみたいこと・興味のある分野・自分の技術の進捗感など、運営への要望を自由に書いてください。次の課題の参考にします。
                                </p>
                                <textarea className="game-input" rows={4}
                                  placeholder="例：もっと〇〇を作ってみたい、今は△△が△割くらいできてきた気がする、□□が難しくて困っている..."
                                  value={courseRequests[assignment.id] ?? ''}
                                  onChange={e => setCourseRequests(prev => ({ ...prev, [assignment.id]: e.target.value }))}
                                  style={{ resize: 'vertical' }} />
                              </div>
                              <button className="game-button" disabled={submitting[assignment.id]} onClick={() => submitWork(assignment.id)}>
                                {submitting[assignment.id] ? '提出中…' : '🚀 提出する'}
                              </button>
                              {submitSuccess[assignment.id] && <div className="game-success">提出完了！お疲れさまでした 🎉</div>}
                              {submitError[assignment.id] && <div className="game-error">{submitError[assignment.id]}</div>}
                            </div>
                          )}
                        </div>

                      </div>
                    )}
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
                <p style={{ color: '#3d6e00', fontSize: 13, fontWeight: 'bold' }}>提出済みの課題履歴 — {submittedAssignments.length} 件</p>
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
                        {a.image_urls && a.image_urls.length > 0 && (
                          <div>
                            <p className="game-label" style={{ marginBottom: 8 }}>🖼️ 提出画像</p>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              {a.image_urls.map((url, i) => (
                                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                  <img src={url} alt={`image-${i + 1}`}
                                    style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 8, border: '2px solid #c8e89a' }} />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                        {(!a.image_urls || a.image_urls.length === 0) && a.media_url && (
                          <div>
                            <p className="game-label" style={{ marginBottom: 4 }}>🎬 提出URL（旧形式）</p>
                            <a href={a.media_url} target="_blank" rel="noopener noreferrer"
                              style={{ color: '#3d6e00', fontSize: 14, wordBreak: 'break-all' }}>
                              {a.media_url}
                            </a>
                          </div>
                        )}
                        {a.submission_comment && (
                          <div>
                            <p className="game-label" style={{ marginBottom: 4 }}>📋 提出物の説明</p>
                            <p style={textBlockStyle}>{a.submission_comment}</p>
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
                        {a.course_request && (
                          <div style={{ borderTop: '2px dashed #c8e89a', paddingTop: 12 }}>
                            <p className="game-label" style={{ marginBottom: 4 }}>💬 コースへの要望</p>
                            <p style={textBlockStyle}>{a.course_request}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}

          {/* ══ VIEW: タイムライン & 過去タイムライン ══════════ */}
          {(currentView === 'timeline' || currentView === 'past_timeline') && (() => {
            const isCurrentView = currentView === 'timeline'
            const displayList   = isCurrentView ? currentTimeline : pastTimeline
            return (
              <>
                <div className="game-card" style={{ padding: '24px 28px' }}>
                  <h2 className="game-title" style={{ fontSize: 22, marginBottom: 4 }}>
                    {isCurrentView ? '🌐 タイムライン' : '📦 過去のタイムライン'}
                  </h2>
                  <p style={{ color: '#3d6e00', fontSize: 13, fontWeight: 'bold' }}>
                    部員の提出作品 — {displayList.length} 件
                    {(timelineFilterCourse || timelineFilterStage) && ` (全${isCurrentView ? currentTimeline.length : pastTimeline.length}件中)`}
                  </p>
                </div>

                {/* フィルター・ソート */}
                <div className="game-card" style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select className="game-input" style={{ padding: '5px 10px', fontSize: 12, width: 'auto' }}
                      value={timelineSort} onChange={e => setTimelineSort(e.target.value as 'newest' | 'oldest')}>
                      <option value="newest">新しい順</option>
                      <option value="oldest">古い順</option>
                    </select>
                    <select className="game-input" style={{ padding: '5px 10px', fontSize: 12, width: 'auto' }}
                      value={timelineFilterCourse} onChange={e => setTimelineFilterCourse(e.target.value)}>
                      <option value="">全コース</option>
                      <option value="Unity">Unity</option>
                      <option value="Blender">Blender</option>
                    </select>
                    <select className="game-input" style={{ padding: '5px 10px', fontSize: 12, width: 'auto' }}
                      value={timelineFilterStage} onChange={e => setTimelineFilterStage(e.target.value)}>
                      <option value="">全ステージ</option>
                      <option value="Foundation">Ⅰ. 基礎</option>
                      <option value="Development">Ⅱ. 応用</option>
                      <option value="Production">Ⅲ. 実践</option>
                    </select>
                    {(timelineFilterCourse || timelineFilterStage) && (
                      <button onClick={() => { setTimelineFilterCourse(''); setTimelineFilterStage('') }}
                        style={{ padding: '4px 10px', borderRadius: 8, border: '2px solid #c0392b', background: 'none', color: '#c0392b', cursor: 'pointer', fontSize: 11, fontWeight: 'bold' }}>
                        リセット
                      </button>
                    )}
                    <button
                      onClick={() => setTimelineViewMode(m => m === 'grid' ? 'list' : 'grid')}
                      style={{
                        marginLeft: 'auto', padding: '4px 10px', borderRadius: 8,
                        border: '2px solid #3d6e00', background: 'none',
                        color: '#3d6e00', cursor: 'pointer', fontSize: 16, lineHeight: 1,
                      }}
                      title={timelineViewMode === 'grid' ? 'リスト表示に切替' : 'グリッド表示に切替'}
                    >
                      {timelineViewMode === 'grid' ? '☰' : '⊞'}
                    </button>
                  </div>
                </div>

                {timelineLoading ? (
                  <div className="game-card" style={{ padding: 40, textAlign: 'center' }}>
                    <p style={{ color: '#6aac14', fontSize: 16 }}>読み込み中...</p>
                  </div>
                ) : displayList.length === 0 ? (
                  <div className="game-card" style={{ padding: '28px 32px', textAlign: 'center' }}>
                    <p style={{ fontSize: 28, marginBottom: 8 }}>📭</p>
                    <p style={{ color: '#6aac14', fontSize: 16 }}>
                      {timelineFilterCourse || timelineFilterStage ? 'フィルター条件に一致する作品がありません' : 'まだ提出された作品はありません'}
                    </p>
                  </div>
                ) : timelineViewMode === 'grid' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {displayList.map(item => (
                      <button key={item.id}
                        onClick={() => { setSelectedPost(item); loadComments(item.id) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                        <div className="game-card timeline-card" style={{ padding: 0, overflow: 'hidden', height: '100%' }}>
                          {(item.thumbnail_url ?? item.image_urls?.[0]) ? (
                            <img src={(item.thumbnail_url ?? item.image_urls![0])!} alt={item.task.title}
                              style={{ width: '100%', height: 110, objectFit: 'cover', display: 'block' }} />
                          ) : (
                            <div style={{
                              width: '100%', height: 110,
                              background: 'linear-gradient(135deg, #c8e89a, #6aac14)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <img src="/icons/Handlime_icon.png" alt="icon" style={{ width: 48, height: 48, objectFit: 'contain' }} />
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
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {displayList.map(item => (
                      <button key={item.id}
                        onClick={() => { setSelectedPost(item); loadComments(item.id) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                        <div className="game-card timeline-card" style={{ padding: 0, overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'stretch' }}>
                            {(item.thumbnail_url ?? item.image_urls?.[0]) ? (
                              <img src={(item.thumbnail_url ?? item.image_urls![0])!} alt={item.task.title}
                                style={{ width: 90, height: 80, objectFit: 'cover', flexShrink: 0 }} />
                            ) : (
                              <div style={{
                                width: 90, height: 80, flexShrink: 0,
                                background: 'linear-gradient(135deg, #c8e89a, #6aac14)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                <img src="/icons/Handlime_icon.png" alt="icon" style={{ width: 40, height: 40, objectFit: 'contain' }} />
                              </div>
                            )}
                            <div style={{ padding: '10px 14px', flex: 1, minWidth: 0 }}>
                              <p style={{ fontWeight: 'bold', color: '#2d5500', fontSize: 14, marginBottom: 4, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.task.title}
                              </p>
                              <div style={{ display: 'flex', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                                {item.task.target_course && (
                                  <span style={{ background: '#6aac14', color: 'white', borderRadius: 8, padding: '1px 6px', fontSize: 10, fontWeight: 'bold' }}>
                                    {item.task.target_course}
                                  </span>
                                )}
                                {item.task.target_stage && (
                                  <span style={{ background: '#3d6e00', color: 'white', borderRadius: 8, padding: '1px 6px', fontSize: 10, fontWeight: 'bold' }}>
                                    {item.task.target_stage}
                                  </span>
                                )}
                              </div>
                              <p style={{ color: '#6aac14', fontSize: 11 }}>
                                {item.is_anonymous ? '🙈 匿名' : `👤 ${item.profile?.username ?? '名無し'}`}
                                {item.submitted_at && (
                                  <span style={{ color: '#aaa', marginLeft: 8 }}>
                                    {new Date(item.submitted_at).toLocaleDateString('ja-JP')}
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )
          })()}

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

              {selectedPost.image_urls && selectedPost.image_urls.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <p className="game-label" style={{ marginBottom: 8 }}>🖼️ 提出画像</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {selectedPost.image_urls.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                        <img src={url} alt={`image-${i + 1}`}
                          style={{ width: '100%', maxHeight: 300, objectFit: 'contain', borderRadius: 8, border: '2px solid #c8e89a', display: 'block' }} />
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {(!selectedPost.image_urls || selectedPost.image_urls.length === 0) && selectedPost.media_url && (() => {
                const mediaType = detectMediaType(selectedPost.media_url!)
                const embedUrl  = getYoutubeEmbedUrl(selectedPost.media_url!)
                return (
                  <div style={{ marginBottom: 14 }}>
                    <p className="game-label" style={{ marginBottom: 8 }}>🎬 提出作品</p>
                    {mediaType === 'youtube' && embedUrl ? (
                      <iframe
                        src={embedUrl}
                        style={{ width: '100%', height: 220, borderRadius: 8, border: 'none', display: 'block' }}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : mediaType === 'video' ? (
                      <video src={selectedPost.media_url!} controls
                        style={{ width: '100%', maxHeight: 220, borderRadius: 8, background: '#000', display: 'block' }} />
                    ) : mediaType === 'image' ? (
                      <img src={selectedPost.media_url!} alt="提出作品"
                        style={{ width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 8 }} />
                    ) : (
                      <a href={selectedPost.media_url!} target="_blank" rel="noopener noreferrer"
                        style={{ color: '#3d6e00', fontSize: 14, wordBreak: 'break-all' }}>
                        🔗 {selectedPost.media_url}
                      </a>
                    )}
                  </div>
                )
              })()}

              {selectedPost.submission_comment && (
                <div style={{ marginBottom: 14 }}>
                  <p className="game-label" style={{ marginBottom: 4 }}>📋 提出物</p>
                  <p style={textBlockStyle}>{selectedPost.submission_comment}</p>
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

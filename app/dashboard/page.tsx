"use client"

import { CSSProperties, Fragment, ReactNode, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../lib/supabase'
import { compressImage } from '../../lib/imageCompress'
import { compressVideo, MAX_VIDEO_BYTES } from '../../lib/videoCompress'
import { marked } from 'marked'
import { FEATURE_LIST, PermissionKey, getEffectivePermissions } from '../../lib/permissions'
import SlimeIcon from '../components/SlimeIcon'
import { AnimatePresence, motion } from 'framer-motion'
import dynamic from 'next/dynamic'
const BonTopics = dynamic(() => import('../components/BonTopics'), {
  ssr: false,
  loading: () => (
    <div className="game-card" style={{ padding: '28px 32px', textAlign: 'center' }}>
      <p style={{ color: '#6aac14', fontSize: 16 }}>読み込み中…</p>
    </div>
  ),
})
import Icon from '../components/Icon'
import {
  Newspaper, ClipboardList, BookOpen, Globe, MessageCircle, Inbox,
  Bug, Tag, Settings, LogOut, Menu, Bell, MailOpen, Film, Search,
  EyeOff, User, Rocket, FileText, Image, Link2, Star, RefreshCw, Check,
  LayoutGrid, List, X, AlertTriangle, Flower2, PartyPopper, Pin, Flame, CheckCircle2,
  Cloud, ChevronDown, Save,
} from 'lucide-react'

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

const STATUS_INFO: Record<string, { label: string; icon: string; bg: string; color: string }> = {
  assigned:    { label: 'アサイン済',  icon: 'Pin',          bg: '#e8e8e8', color: '#555' },
  in_progress: { label: '取り組み中', icon: 'Flame',        bg: '#d4f0a0', color: '#3d6e00' },
  submitted:   { label: '提出済',     icon: 'CheckCircle2', bg: '#c8f0c0', color: '#1a6e00' },
}

function getWeekPhase(day: number): 'task' | 'midterm' | 'final' {
  if (day === 0) return 'final'
  if (day >= 1 && day <= 3) return 'task'
  return 'midterm'
}

function FlipChars({ text, baseDelay = 0, stagger = 0.03, style }: { text: string; baseDelay?: number; stagger?: number; style?: CSSProperties }) {
  return (
    <span style={{ display: 'inline-flex', perspective: 240, ...style }}>
      {text.split('').map((ch, i) => (
        <motion.span
          key={`${ch}-${i}`}
          initial={{ rotateX: 90, opacity: 0 }}
          animate={{ rotateX: 0, opacity: 1 }}
          transition={{ duration: 0.25, delay: baseDelay + i * stagger, ease: 'easeOut' }}
          style={{ display: 'inline-block', transformOrigin: 'top center', whiteSpace: 'pre' }}
        >
          {ch}
        </motion.span>
      ))}
    </span>
  )
}

function ViewHeader({ badge, icon, title, subtitle }: { badge: string; icon: ReactNode; title: string; subtitle: ReactNode }) {
  return (
    <div style={{ background: 'linear-gradient(135deg, #1a3a00 0%, #2d5500 55%, #3d6e00 100%)', borderRadius: 10, padding: '20px 28px', position: 'relative', overflow: 'hidden' }}>
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: [1, 1.1, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ default: { duration: 3.4, repeat: Infinity, ease: 'easeInOut' }, opacity: { duration: 3.4, repeat: Infinity, ease: 'easeInOut' } }}
        style={{ position: 'absolute', top: -30, right: -30, width: 140, height: 140, borderRadius: '50%', background: 'radial-gradient(circle, rgba(106,172,20,0.18) 0%, transparent 70%)', pointerEvents: 'none' }}
      />
      <motion.p
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
        style={{ color: '#6aac14', fontSize: 10, fontWeight: 'bold', letterSpacing: '0.12em', marginBottom: 4 }}>{badge}</motion.p>
      <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 'bold', margin: '0 0 4px', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <motion.span
          initial={{ scale: 0.4, rotate: -20, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1, ease: 'backOut' }}
          style={{ display: 'inline-flex' }}>{icon}</motion.span>
        <FlipChars text={title} baseDelay={0.12} />
      </h2>
      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.4 }}
        style={{ color: 'rgba(168,216,112,0.8)', fontSize: 13, fontWeight: 'bold', margin: 0 }}>{subtitle}</motion.p>
    </div>
  )
}

const MILESTONES = [
  { key: 'task',    phase: 'task',    day: '月', label: '課題開始',  desc: '月曜日：今週の課題が配信されます。制作計画を入力しましょう。' },
  { key: 'midterm', phase: 'midterm', day: '木', label: '中間報告',  desc: '木曜日：進捗と日曜までの修正計画を報告しましょう。' },
  { key: 'final',   phase: 'final',   day: '日', label: '最終提出',  desc: '日曜日：動画・画像・自己評価をタイムラインに投稿しましょう。' },
]

type ViewId = 'tasks' | 'history' | 'timeline' | 'news'

const NAV_ITEMS: { id: ViewId; icon: string; label: string }[] = [
  { id: 'news',     icon: 'Newspaper',     label: 'BON-TOPICS' },
  { id: 'tasks',    icon: 'ClipboardList', label: '今週の課題' },
  { id: 'history',  icon: 'BookOpen',      label: '過去の課題' },
  { id: 'timeline', icon: 'Globe',         label: 'タイムライン' },
]

// ─── 時間帯テーマ（HUDヒーロー用） ─────────────────────────
type TimeTheme = { greeting: string; sky: string; pageTint: string; celestial: 'sun' | 'moon' }

function getTimeTheme(d = new Date()): TimeTheme {
  const h = d.getHours()
  if (h >= 5 && h < 10)  return { greeting: 'おはよう',   sky: 'linear-gradient(180deg, #7ec8e3 0%, #ffe9b0 100%)', pageTint: '#8cc63f', celestial: 'sun' }
  if (h >= 10 && h < 16) return { greeting: 'こんにちは', sky: 'linear-gradient(180deg, #4aa3df 0%, #a8dcf0 100%)', pageTint: '#79b81e', celestial: 'sun' }
  if (h >= 16 && h < 19) return { greeting: 'こんばんは', sky: 'linear-gradient(180deg, #e8884b 0%, #f7c873 100%)', pageTint: '#7aa31a', celestial: 'sun' }
  return                        { greeting: 'こんばんは', sky: 'linear-gradient(180deg, #0e1a3a 0%, #2a4470 100%)', pageTint: '#4d7e0a', celestial: 'moon' }
}

// ─── タイムライン ─────────────────────────────────────────

const TIMELINE_PAGE_SIZE = 8

interface AssignmentTask {
  id: string
  title: string
  description: string | null
  description_is_markdown: boolean
  target_course: string | null
  target_stage: string | null
  allow_image_attachment: boolean
}

interface PreviousSubmission {
  image_urls: string[] | null
  video_url?: string | null
  submission_comment: string | null
  self_evaluation: string | null
  retrospective: string | null
  submitted_at: string | null
  thumbnail_url: string | null
}

interface AssignmentRecord {
  id: string
  status: 'assigned' | 'in_progress' | 'submitted'
  plan_text: string | null
  midterm_progress: string | null
  midterm_correction: string | null
  media_url: string | null
  video_url: string | null
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
  resubmit_requested: boolean
  previous_submission: PreviousSubmission | null
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
  video_url: string | null
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

interface TicketType {
  id: string
  label: string
  color_start: string
  color_end: string
}

interface ActiveTicket {
  id: string
  type_id: string
  issued_at: string
  expires_at: string
  ticket_types: TicketType
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
  const [tasksLoading, setTasksLoading] = useState(true)

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
    dev_management: false, news_management: false, debug: false, ticket_admin: false, sns_management: false,
  })

  // チケット
  const [ticketTypes, setTicketTypes]   = useState<TicketType[]>([])
  const [activeTicket, setActiveTicket] = useState<ActiveTicket | null | undefined>(undefined) // undefined=未ロード
  const [selectedTypeId, setSelectedTypeId] = useState('')
  const [issuingTicket, setIssuingTicket]   = useState(false)
  const [revokingTicket, setRevokingTicket] = useState(false)
  const [ticketError, setTicketError]       = useState<string | null>(null)
  const [ticketBurstKey, setTicketBurstKey] = useState(0)

  // スピーチ
  const [speechBlocks, setSpeechBlocks] = useState<{ id: string; is_active: boolean; sort_order: number }[]>([])
  const [speechLines, setSpeechLines]   = useState<{ id: string; block_id: string; text: string; type_speed_ms: number; display_ms: number; sort_order: number }[]>([])
  const [gimmickSettings, setGimmickSettings] = useState({ block_interval_min_sec: 10, block_interval_max_sec: 30, sakura_enabled: false })
  const [slimeSpeech, setSlimeSpeech]     = useState('')
  const [slimeSpeechFull, setSlimeSpeechFull] = useState('')
  const [speechVisible, setSpeechVisible] = useState(false)

  // DM未読
  const [dmUnreadCount, setDmUnreadCount]           = useState(0)
  const [dmManageUnreadCount, setDmManageUnreadCount] = useState(0)
  const [notifOpen, setNotifOpen]         = useState(false)
  const [notifLogs, setNotifLogs]         = useState<NotifLog[]>([])
  const [notifUnread, setNotifUnread] = useState(0)
  const [notifLoaded, setNotifLoaded]   = useState(false)
  const [notifLoading, setNotifLoading] = useState(false)
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
  // existingImageUrls = 保存済み（アップロード済み）の画像URL。imageFiles/imagePreviews = まだアップロードしていない新規ファイル
  const [existingImageUrls, setExistingImageUrls] = useState<Record<string, string[]>>({})
  const [imageFiles, setImageFiles]           = useState<Record<string, File[]>>({})
  const [imagePreviews, setImagePreviews]     = useState<Record<string, string[]>>({})
  const [uploadingImages, setUploadingImages] = useState<Record<string, boolean>>({})
  // 動画アップロード（1本、30MBまで）
  // existingVideoUrls = 保存済み（アップロード済み）の動画URL。videoFiles/videoPreviews = まだアップロードしていない新規ファイル
  const [existingVideoUrls, setExistingVideoUrls] = useState<Record<string, string>>({})
  const [videoFiles, setVideoFiles]           = useState<Record<string, File | null>>({})
  const [videoPreviews, setVideoPreviews]     = useState<Record<string, string>>({})
  const [uploadingVideo, setUploadingVideo]   = useState<Record<string, boolean>>({})
  const [videoCompressProgress, setVideoCompressProgress] = useState<Record<string, number | null>>({})
  const [videoErrors, setVideoErrors]         = useState<Record<string, string>>({})
  // 公式X紹介同意（デフォルトtrue）
  const [xConsent, setXConsent]               = useState<Record<string, boolean>>({})
  const [xUsernames, setXUsernames]           = useState<Record<string, string>>({})
  // フィールドバリデーションエラー
  const [submitFieldErrors, setSubmitFieldErrors] = useState<Record<string, { comment?: boolean; selfEval?: boolean; retro?: boolean }>>({})
  // 最終提出の一時保存
  const [savingDraft, setSavingDraft]         = useState<Record<string, boolean>>({})
  const [draftSuccess, setDraftSuccess]       = useState<Record<string, boolean>>({})


  // タイムライン（timeline = 現在のフィルター×ソートでの累積取得リスト）
  const [timeline, setTimeline]               = useState<TimelineItem[]>([])
  const [timelineLoading, setTimelineLoading] = useState(true)
  const [timelineLoadingMore, setTimelineLoadingMore] = useState(false)
  const [timelineTotalCount, setTimelineTotalCount]   = useState(0)
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

    // ─── クリティカルパス: ヒーロー表示に必要な最小データ ───
    async function loadCritical(): Promise<string | null> {
      // getSession はローカル読み（getUser のようなネットワーク往復なし）。データ保護はRLSが担う
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { router.replace('/login'); return null }

      const uid = session.user.id
      if (mounted) setUserId(uid)

      const [profileRes, ranksRes] = await Promise.all([
        supabase.from('profiles')
          .select('username, course, stage, total_points, cool_points, role')
          .eq('id', uid)
          .single(),
        supabase.from('rank_settings')
          .select('id, name, min_points, color, rank_order')
          .order('rank_order'),
      ])
      if (!mounted) return null
      // 無効トークン等はここで失敗 → catch → /login
      if (profileRes.error) throw profileRes.error

      const profile = profileRes.data
      setUsername(profile?.username ?? null)
      setCourse(profile?.course ?? null)
      setStage(profile?.stage ?? null)
      setTotalPoints(profile?.total_points ?? 0)
      setCoolPoints(profile?.cool_points ?? 0)
      setUserRole(profile?.role ?? null)
      setRankSettings(ranksRes.data ?? [])
      return uid
    }

    // ─── バックグラウンド読み込み: 独立タスクを並列実行 ───
    function loadBackground(uid: string) {
      // 失敗してもページは落とさない（クリティカルパスのみ /login へ）
      const bg = (label: string, fn: () => Promise<void>) =>
        fn().catch(err => console.warn(`[dashboard] background load failed: ${label}`, err))

      bg('assignments', async () => {
        try {
          const assignmentRes = await supabase.from('task_assignments')
            .select(`
              id, status, plan_text, midterm_progress, midterm_correction,
              media_url, video_url, image_urls, submission_comment, self_evaluation, retrospective, submitted_at,
              is_anonymous, thumbnail_url, created_at, deadline_at, course_request,
              x_consent, x_username,
              resubmit_requested, previous_submission,
              task:tasks(id, title, description, description_is_markdown, target_course, target_stage, allow_image_attachment)
            `)
            .eq('user_id', uid)
            .eq('is_assigned', true)
          if (!mounted) return
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
            const existingImgs: Record<string, string[]> = {}
            const existingVids: Record<string, string> = {}
            const xCons: Record<string, boolean>  = {}
            const xUsers: Record<string, string>  = {}
            const thumbs: Record<string, string>  = {}
            assignmentData.forEach(a => {
              plans[a.id]       = a.plan_text           ?? ''
              midProg[a.id]     = a.midterm_progress    ?? ''
              midCorr[a.id]     = a.midterm_correction  ?? ''
              subComments[a.id] = (a as any).submission_comment  ?? ''
              evals[a.id]       = a.self_evaluation     ?? ''
              retro[a.id]       = a.retrospective       ?? ''
              courseReqs[a.id]  = (a as any).course_request      ?? ''
              anon[a.id]        = a.is_anonymous        ?? false
              existingImgs[a.id] = a.image_urls          ?? []
              existingVids[a.id] = (a as unknown as AssignmentRecord).video_url ?? ''
              xCons[a.id]       = (a as any).x_consent !== false
              xUsers[a.id]      = (a as any).x_username ?? ''
              thumbs[a.id]      = a.thumbnail_url        ?? ''
            })
            setPlanTexts(plans)
            setMidtermProgress(midProg)
            setMidtermCorrection(midCorr)
            setSubmissionComments(subComments)
            setSelfEvals(evals)
            setRetros(retro)
            setCourseRequests(courseReqs)
            setIsAnonymous(anon)
            setExistingImageUrls(existingImgs)
            setExistingVideoUrls(existingVids)
            setThumbPreviews(thumbs)
            setXConsent(xCons)
            setXUsernames(xUsers)
          }
        } finally {
          if (mounted) setTasksLoading(false)
        }
      })

      bg('permissions', async () => {
        const [perms, ppRes] = await Promise.all([
          getEffectivePermissions(uid),
          supabase.from('profile_positions').select('positions(name)').eq('profile_id', uid),
        ])
        if (!mounted) return
        setEffectivePerms(perms)
        setPositionNames(
          (ppRes.data ?? []).map(pp => {
            const pos = (pp as unknown as { positions: { name: string } | null }).positions
            return pos?.name ?? ''
          }).filter(Boolean)
        )
      })

      bg('speech', async () => {
        const [commentLimitRes, speechBlocksRes, speechLinesRes, gimmickSettingsRes] = await Promise.all([
          supabase.from('point_settings')
            .select('base_points')
            .eq('action_key', 'comment_daily_limit')
            .single(),
          supabase.from('speech_blocks').select('id, is_active, sort_order').order('sort_order'),
          supabase.from('speech_lines').select('id, block_id, text, type_speed_ms, display_ms, sort_order').order('sort_order'),
          supabase.from('gimmick_settings').select('block_interval_min_sec, block_interval_max_sec, sakura_enabled').single(),
        ])
        if (!mounted) return
        setCommentDailyLimit(commentLimitRes.data?.base_points ?? 0)
        setSpeechBlocks(speechBlocksRes.data ?? [])
        setSpeechLines(speechLinesRes.data ?? [])
        if (gimmickSettingsRes.data) setGimmickSettings(gimmickSettingsRes.data)
      })

      bg('dm-unread', async () => {
        const [memberConvsRes, managerConvsRes, readsRes] = await Promise.all([
          supabase.from('dm_conversations').select('id, updated_at').eq('member_id', uid),
          supabase.from('dm_conversations').select('id, updated_at').eq('manager_id', uid),
          supabase.from('dm_reads').select('conversation_id, last_read_at').eq('user_id', uid),
        ])
        if (!mounted) return
        const readsMap: Record<string, string> = {}
        ;(readsRes.data ?? []).forEach(r => { readsMap[r.conversation_id] = r.last_read_at })

        // 未読の可能性がある会話（最終更新が既読時刻より新しい）だけ照会
        const allConvs = [...(memberConvsRes.data ?? []), ...(managerConvsRes.data ?? [])]
        const candidateIds = allConvs
          .filter(c => { const lr = readsMap[c.id]; return !lr || new Date(c.updated_at) > new Date(lr) })
          .map(c => c.id)
        if (candidateIds.length === 0) {
          setDmUnreadCount(0)
          setDmManageUnreadCount(0)
          return
        }

        const { data: latestMsgs } = await supabase
          .from('dm_messages')
          .select('conversation_id, created_at, sender_id')
          .in('conversation_id', candidateIds)
          .order('created_at', { ascending: false })
          .limit(500)
        if (!mounted) return

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
      })

      bg('tickets', async () => {
        const [ticketTypesRes, activeTicketRes] = await Promise.all([
          supabase.from('ticket_types').select('id, label, color_start, color_end').order('created_at', { ascending: true }),
          supabase.from('tickets')
            .select('id, type_id, issued_at, expires_at, ticket_types(id, label, color_start, color_end)')
            .eq('user_id', uid)
            .gte('expires_at', new Date().toISOString())
            .lte('issued_at', new Date().toISOString())
            .order('issued_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ])
        if (!mounted) return
        setTicketTypes(ticketTypesRes.data ?? [])
        setActiveTicket((activeTicketRes.data as unknown as ActiveTicket) ?? null)
      })

      bg('notifications', async () => {
        // 通知未読数のみ取得（一覧はベルを開いたときに遅延読み込み）
        const lastOpened = typeof window !== 'undefined'
          ? localStorage.getItem('notif_last_opened') : null
        let countQuery = supabase
          .from('notification_logs')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', uid)
          .is('deleted_at', null)
        if (lastOpened) countQuery = countQuery.gt('created_at', lastOpened)
        const { count: unreadCount } = await countQuery
        if (mounted) setNotifUnread(unreadCount ?? 0)
      })

      // プッシュ通知サブスクリプション登録（エラーは無視）
      subscribePush().catch(() => {})
    }

    async function loadUser() {
      try {
        const uid = await loadCritical()
        if (!uid || !mounted) return
        setLoading(false)
        loadBackground(uid)
      } catch {
        router.replace('/login')
      }
    }

    loadUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.replace('/login')
    })

    return () => { mounted = false; subscription.unsubscribe() }
  }, [router])

  // ─── 通知一覧の遅延読み込み（ベルを開いたとき） ─────────
  async function loadNotifLogs() {
    if (!userId || notifLoading) return
    setNotifLoading(true)
    const { data: logs } = await supabase
      .from('notification_logs')
      .select('id, title, body, url, created_at')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(5)
    setNotifLogs((logs ?? []) as NotifLog[])
    setNotifLoaded(true)
    setNotifLoading(false)
  }

  // ─── タイムライン読み込み（8件ずつサーバーサイドページング） ───

  async function fetchTimelinePage(offset: number, fetchSize: number): Promise<{ items: TimelineItem[]; total: number } | null> {
    try {
      let q = supabase
        .from('task_assignments')
        .select(`
          id, user_id, is_anonymous, thumbnail_url,
          self_evaluation, retrospective, submission_comment, media_url, video_url, image_urls, submitted_at,
          hidden_in_timeline, force_past_timeline, force_current_timeline,
          task:tasks!inner(id, title, target_course, target_stage, created_at)
        `, { count: 'exact' })
        .eq('status', 'submitted')
        .or('hidden_in_timeline.is.null,hidden_in_timeline.eq.false')
      if (timelineFilterCourse) q = q.eq('task.target_course', timelineFilterCourse)
      if (timelineFilterStage)  q = q.eq('task.target_stage', timelineFilterStage)
      const { data: tlData, count, error: tlError } = await q
        .order('submitted_at', { ascending: timelineSort === 'oldest', nullsFirst: false })
        .range(offset, offset + fetchSize - 1)

      if (tlError) {
        console.error('Timeline fetch error:', tlError.message)
        return null
      }

      // プロフィールは取得したページの投稿者分のみ
      const userIds = [...new Set((tlData ?? []).map(a => a.user_id))]
      const profileMap: Record<string, { username: string | null; course: string | null; stage: string | null }> = {}
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, username, course, stage')
          .in('id', userIds)
        for (const p of profilesData ?? []) {
          profileMap[p.id] = { username: p.username, course: p.course, stage: p.stage }
        }
      }

      const items: TimelineItem[] = (tlData ?? []).map(a => ({
        ...(a as unknown as Omit<TimelineItem, 'profile'>),
        profile: profileMap[a.user_id] ?? null,
      }))
      return { items, total: count ?? 0 }
    } catch (err) {
      console.error('Timeline fetch failed:', err)
      return null
    }
  }

  useEffect(() => {
    if (currentView !== 'timeline') return
    let mounted = true
    setTimelineLoading(true)

    ;(async () => {
      const res = await fetchTimelinePage(0, TIMELINE_PAGE_SIZE)
      if (!mounted) return
      if (res) {
        setTimeline(res.items)
        setTimelineTotalCount(res.total)
      }
      setTimelineLoading(false)
    })()

    return () => { mounted = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView, timelineSort, timelineFilterCourse, timelineFilterStage])

  // さらに表示 / すべて表示
  async function loadMoreTimeline(fetchAll = false) {
    if (timelineLoadingMore) return
    const remaining = timelineTotalCount - timeline.length
    if (remaining <= 0) return
    setTimelineLoadingMore(true)
    const res = await fetchTimelinePage(timeline.length, fetchAll ? remaining : TIMELINE_PAGE_SIZE)
    if (res) {
      setTimeline(prev => {
        const seen = new Set(prev.map(i => i.id))
        return [...prev, ...res.items.filter(i => !seen.has(i.id))]
      })
      setTimelineTotalCount(res.total)
    }
    setTimelineLoadingMore(false)
  }

  // ─── ハンドラ ───────────────────────────────────────────

  async function refreshAssignments() {
    if (!userId) return
    const { data } = await supabase.from('task_assignments')
      .select(`
        id, status, plan_text, midterm_progress, midterm_correction,
        media_url, video_url, image_urls, self_evaluation, retrospective, submitted_at,
        is_anonymous, thumbnail_url, created_at, deadline_at, course_request,
        resubmit_requested, previous_submission,
        task:tasks(id, title, description, description_is_markdown, target_course, target_stage, allow_image_attachment)
      `)
      .eq('user_id', userId)
      .eq('is_assigned', true)
    if (data) setAssignments(data as unknown as AssignmentRecord[])
  }

  async function issueTicket() {
    if (!userId || !selectedTypeId) return
    setIssuingTicket(true)
    setTicketError(null)
    const { data, error } = await supabase
      .from('tickets')
      .insert({ user_id: userId, type_id: selectedTypeId })
      .select('id, type_id, issued_at, expires_at, ticket_types(id, label, color_start, color_end)')
      .single()
    setIssuingTicket(false)
    if (error) { setTicketError(error.message); return }
    setActiveTicket(data as unknown as ActiveTicket)
    setTicketBurstKey(k => k + 1)
  }

  async function revokeTicket() {
    if (!activeTicket) return
    setRevokingTicket(true)
    await supabase.from('tickets').delete().eq('id', activeTicket.id)
    setActiveTicket(null)
    setRevokingTicket(false)
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

  async function uploadFinalMedia(assignmentId: string) {
    // サムネイルアップロード
    let thumbUrl: string | null = null
    const thumbFile = thumbnailFiles[assignmentId]
    if (thumbFile && userId) {
      setUploadingThumb(prev => ({ ...prev, [assignmentId]: true }))
      const compressedThumb = await compressImage(thumbFile, { maxDimension: 600, quality: 0.8 })
      const ext = compressedThumb.name.split('.').pop() ?? 'jpg'
      const path = `${userId}/${assignmentId}.${ext}`
      const { data: upData, error: upErr } = await supabase.storage
        .from('thumbnails')
        .upload(path, compressedThumb, { upsert: true })
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
        const compressedImg = await compressImage(imgFiles[i], { maxDimension: 1600, quality: 0.8 })
        const ext = compressedImg.name.split('.').pop() ?? 'jpg'
        const iPath = `images/${userId}/${assignmentId}/${i}.${ext}`
        const { data: iData, error: iErr } = await supabase.storage
          .from('media')
          .upload(iPath, compressedImg, { upsert: true })
        if (!iErr && iData) {
          const { data: iUrlData } = supabase.storage.from('media').getPublicUrl(iData.path)
          uploadedImageUrls.push(iUrlData.publicUrl)
        }
      }
      setUploadingImages(prev => ({ ...prev, [assignmentId]: false }))
    }

    // 動画アップロード（1本、30MBまで。可能ならブラウザ上で圧縮してから保存）
    let videoUrl: string | null = existingVideoUrls[assignmentId] || null
    const vidFile = videoFiles[assignmentId]
    if (vidFile && userId) {
      setUploadingVideo(prev => ({ ...prev, [assignmentId]: true }))
      const compressedVid = await compressVideo(vidFile, ratio =>
        setVideoCompressProgress(prev => ({ ...prev, [assignmentId]: ratio }))
      )
      setVideoCompressProgress(prev => ({ ...prev, [assignmentId]: null }))
      const vExt = compressedVid.name.split('.').pop()?.toLowerCase() ?? 'mp4'
      const vPath = `videos/${userId}/${assignmentId}.${vExt}`
      const { data: vData, error: vErr } = await supabase.storage
        .from('media')
        .upload(vPath, compressedVid, { upsert: true })
      setUploadingVideo(prev => ({ ...prev, [assignmentId]: false }))
      if (!vErr && vData) {
        const { data: vUrlData } = supabase.storage.from('media').getPublicUrl(vData.path)
        videoUrl = vUrlData.publicUrl
      }
    }

    const mergedImageUrls = [...(existingImageUrls[assignmentId] ?? []), ...uploadedImageUrls]
    return {
      // 新規ファイルがなければ、現在表示中のサムネイル（既存 or 削除済みなら空）を維持する
      thumbUrl: thumbUrl ?? (thumbPreviews[assignmentId] || null),
      imageUrls: mergedImageUrls.length > 0 ? mergedImageUrls : null,
      videoUrl,
    }
  }

  // アップロード済みの新規ファイルを「既存」に移し、再アップロードされないようにする
  function commitUploadedMedia(assignmentId: string, thumbUrl: string | null, imageUrls: string[] | null, videoUrl: string | null) {
    setExistingImageUrls(prev => ({ ...prev, [assignmentId]: imageUrls ?? [] }))
    setImageFiles(prev => ({ ...prev, [assignmentId]: [] }))
    setImagePreviews(prev => ({ ...prev, [assignmentId]: [] }))
    setExistingVideoUrls(prev => ({ ...prev, [assignmentId]: videoUrl ?? '' }))
    setVideoFiles(prev => ({ ...prev, [assignmentId]: null }))
    setVideoPreviews(prev => ({ ...prev, [assignmentId]: '' }))
    setThumbnailFiles(prev => ({ ...prev, [assignmentId]: null }))
    setThumbPreviews(prev => ({ ...prev, [assignmentId]: thumbUrl ?? '' }))
  }

  async function saveDraftFinal(assignmentId: string) {
    setSavingDraft(prev => ({ ...prev, [assignmentId]: true }))
    setDraftSuccess(prev => ({ ...prev, [assignmentId]: false }))
    setSubmitError(prev => ({ ...prev, [assignmentId]: '' }))

    const { thumbUrl, imageUrls, videoUrl } = await uploadFinalMedia(assignmentId)
    const now = new Date().toISOString()

    const { error } = await supabase.from('task_assignments').update({
      image_urls:          imageUrls,
      video_url:           videoUrl,
      submission_comment:  submissionComments[assignmentId] ?? '',
      self_evaluation:     selfEvals[assignmentId]   ?? '',
      retrospective:       retros[assignmentId]      ?? '',
      course_request:      courseRequests[assignmentId] ?? '',
      is_anonymous:         isAnonymous[assignmentId] ?? false,
      x_consent:            xConsent[assignmentId] !== false,
      x_username:           xConsent[assignmentId] !== false ? (xUsernames[assignmentId] ?? '') : '',
      thumbnail_url:        thumbUrl,
      updated_at:           now,
    }).eq('id', assignmentId)

    setSavingDraft(prev => ({ ...prev, [assignmentId]: false }))
    if (error) {
      const msg = (error as any)?.message ?? JSON.stringify(error)
      setSubmitError(prev => ({ ...prev, [assignmentId]: `一時保存に失敗しました: ${msg}` }))
      return
    }
    setDraftSuccess(prev => ({ ...prev, [assignmentId]: true }))
    commitUploadedMedia(assignmentId, thumbUrl, imageUrls, videoUrl)
    setAssignments(prev => prev.map(a =>
      a.id === assignmentId ? { ...a, thumbnail_url: thumbUrl, image_urls: imageUrls, video_url: videoUrl } : a
    ))
  }

  async function submitWork(assignmentId: string) {
    // バリデーション
    const fieldErrors = {
      comment:  !(submissionComments[assignmentId] ?? '').trim(),
      selfEval: !(selfEvals[assignmentId] ?? '').trim(),
      retro:    !(retros[assignmentId] ?? '').trim(),
    }
    if (fieldErrors.comment || fieldErrors.selfEval || fieldErrors.retro) {
      setSubmitFieldErrors(prev => ({ ...prev, [assignmentId]: fieldErrors }))
      setSubmitError(prev => ({ ...prev, [assignmentId]: '必須項目を入力してください' }))
      return
    }
    setSubmitFieldErrors(prev => ({ ...prev, [assignmentId]: {} }))

    const wasSubmitted = assignments.find(a => a.id === assignmentId)?.status === 'submitted'

    setSubmitting(prev => ({ ...prev, [assignmentId]: true }))
    setSubmitSuccess(prev => ({ ...prev, [assignmentId]: false }))
    setSubmitError(prev => ({ ...prev, [assignmentId]: '' }))

    const now = new Date().toISOString()

    const { thumbUrl, imageUrls: uploadedImageUrls, videoUrl } = await uploadFinalMedia(assignmentId)

    const { error } = await supabase.from('task_assignments').update({
      image_urls:         uploadedImageUrls,
      video_url:          videoUrl,
      submission_comment: submissionComments[assignmentId] ?? '',
      self_evaluation:    selfEvals[assignmentId]   ?? '',
      retrospective:      retros[assignmentId]      ?? '',
      course_request:     courseRequests[assignmentId] ?? '',
      is_anonymous:        isAnonymous[assignmentId] ?? false,
      x_consent:           xConsent[assignmentId] !== false,
      x_username:          xConsent[assignmentId] !== false ? (xUsernames[assignmentId] ?? '') : '',
      thumbnail_url:       thumbUrl,
      status:              'submitted',
      submitted_at:        now,
      updated_at:          now,
      resubmit_requested:  false,
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
      commitUploadedMedia(assignmentId, thumbUrl, uploadedImageUrls, videoUrl)
      setAssignments(prev => prev.map(a =>
        a.id === assignmentId
          ? { ...a, status: 'submitted', submitted_at: now,
              is_anonymous: isAnonymous[assignmentId] ?? false,
              thumbnail_url: thumbUrl,
              image_urls: uploadedImageUrls,
              video_url: videoUrl }
          : a
      ))
      // タイムラインはビューを開くたびに再取得されるため明示的なリセットは不要
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

  function handleVideoChange(assignmentId: string, file: File | null) {
    if (file && file.size > MAX_VIDEO_BYTES) {
      setVideoErrors(prev => ({ ...prev, [assignmentId]: '動画は30MB以下にしてください' }))
      return
    }
    setVideoErrors(prev => ({ ...prev, [assignmentId]: '' }))
    setVideoFiles(prev => ({ ...prev, [assignmentId]: file }))
    setVideoPreviews(prev => ({ ...prev, [assignmentId]: file ? URL.createObjectURL(file) : '' }))
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

  const sakuraPetals = useMemo(() => Array.from({ length: 28 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    size: 14 + Math.random() * 10,
    duration: 6 + Math.random() * 8,
    delay: Math.random() * 10,
    drift: (Math.random() - 0.5) * 120,
  })), [])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'white', fontSize: 24, fontWeight: 'bold' }}>Loading...</p>
      </div>
    )
  }

  const currentMilestone     = MILESTONES.find(m => m.phase === todayPhase)!
  const activeAssignments    = assignments.filter(a => a.status !== 'submitted' || a.resubmit_requested)

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

  const sortedByPoints = [...rankSettings].sort((a, b) => a.min_points - b.min_points)
  const currentRank    = [...sortedByPoints].reverse().find(r => coolPoints >= r.min_points) ?? sortedByPoints[0] ?? null
  const nextRank       = currentRank
    ? sortedByPoints.find(r => r.min_points > currentRank.min_points) ?? null
    : null

  const timeTheme = getTimeTheme()
  const xpPct = currentRank && nextRank
    ? Math.min(100, Math.max(0, ((coolPoints - currentRank.min_points) / (nextRank.min_points - currentRank.min_points)) * 100))
    : 100


  // ─── レンダリング ──────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: `linear-gradient(180deg, ${timeTheme.pageTint} 0%, var(--green-main) 340px)` }}>

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
          <span
            onClick={() => router.push('/')}
            style={{ color: '#6aac14', fontWeight: 'bold', fontSize: 18, letterSpacing: 1, cursor: 'pointer' }}
          >
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
              <Icon name={item.icon} size={18}/>
              {item.label}
            </button>
          ))}
          <a href="/task-list" style={{ textDecoration: 'none', display: 'block' }}>
            <button style={{
              display: 'flex', alignItems: 'center', gap: 12,
              width: '100%', padding: '12px 20px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#a8d870', fontSize: 15, textAlign: 'left', transition: 'background 0.15s',
            }}>
              <List size={18}/>
              課題一覧
            </button>
          </a>


          {/* ダイレクトメッセージ - 全ユーザー */}
          <div style={{ position: 'relative' }}>
            <a href="/dm" style={{ textDecoration: 'none', display: 'block' }}>
              <button style={{
                display: 'flex', alignItems: 'center', gap: 12,
                width: '100%', padding: '12px 20px',
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#a8d870', fontSize: 15, textAlign: 'left', transition: 'background 0.15s',
              }}>
                <MessageCircle size={18}/>
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
                  <Inbox size={18}/>
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

          {/* デバッグ報告 - debug権限のみ */}
          {(userRole === 'admin' || effectivePerms.debug) && (
            <a href="/debug" style={{ textDecoration: 'none', display: 'block' }}>
              <button style={{
                display: 'flex', alignItems: 'center', gap: 12,
                width: '100%', padding: '12px 20px',
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#a8d870', fontSize: 15, textAlign: 'left', transition: 'background 0.15s',
              }}>
                <span style={{ fontSize: 18 }}>📄</span>
                デバッグ報告
              </button>
            </a>
          )}

          {/* 不具合・要望 - 全ユーザー */}
          <a href="/reports" style={{ textDecoration: 'none', display: 'block' }}>
            <button style={{
              display: 'flex', alignItems: 'center', gap: 12,
              width: '100%', padding: '12px 20px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#a8d870', fontSize: 15, textAlign: 'left', transition: 'background 0.15s',
            }}>
              <Bug size={18}/>
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
                  <Tag size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}/>役職管理
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
                  <Icon name={f.icon} size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}/>{f.label}
                </button>
              </a>
            ))}
          </div>
        )}
        </div>{/* scrollable area end */}

        <div style={{ padding: '12px 20px 0', borderTop: '2px solid #3d6e00' }}>
          <a href="/account"
            style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#a8d870', fontSize: 14, textDecoration: 'none', padding: '8px 0' }}>
            <Settings size={16}/> アカウント設定
          </a>
        </div>
        <div style={{ padding: '0 20px 16px' }}>
          <button onClick={async () => { await supabase.auth.signOut(); sessionStorage.setItem('dev_auto_login_disabled', '1'); router.push('/login') }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', color: '#a8d870', fontSize: 14, padding: '8px 0' }}>
            <LogOut size={16}/> ログアウト
          </button>
        </div>
      </div>

      {/* ── メインコンテンツ ─────────────────────────────── */}
      <div style={{ padding: '24px 24px 40px' }}>
        {/* ハンバーガーボタン */}
        <div style={{ position: 'fixed', top: 16, left: 16, zIndex: 99, display: 'inline-block' }}>
          <button onClick={() => setSidebarOpen(true)} className="hud-glass-btn">
            <Menu size={20}/>
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
                if (!notifLoaded) loadNotifLogs()
                localStorage.setItem('notif_last_opened', new Date().toISOString())
                setNotifUnread(0)
              }
            }}
            className="hud-glass-btn"
          >
            <Bell size={20}/>
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

        {/* ── 桜吹雪 ──────────────────────────────────────── */}
        {gimmickSettings.sakura_enabled && (
          <>
            <style>{`
              @keyframes sakura-fall {
                0%   { transform: translateY(-30px) translateX(0px) rotate(0deg); opacity: 1; }
                100% { transform: translateY(105vh) translateX(var(--drift)) rotate(540deg); opacity: 0.4; }
              }
            `}</style>
            <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999, overflow: 'hidden' }}>
              {sakuraPetals.map(p => (
                <div key={p.id} style={{
                  position: 'absolute',
                  top: '-30px',
                  left: `${p.left}%`,
                  animation: `sakura-fall ${p.duration}s ${p.delay}s linear infinite`,
                  ['--drift' as string]: `${p.drift}px`,
                }}><Flower2 size={p.size} color="#ffb7c5"/></div>
              ))}
            </div>
          </>
        )}

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
                  <Bell size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }}/>通知センター
                </span>
                <button
                  onClick={() => setNotifOpen(false)}
                  style={{
                    marginLeft: 'auto',
                    background: 'none', border: 'none',
                    color: '#a8d870', fontSize: 20, cursor: 'pointer', lineHeight: 1,
                    display: 'inline-flex', alignItems: 'center',
                  }}
                >
                  <X size={20}/>
                </button>
              </div>

              {/* 通知リスト */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
                <AnimatePresence initial={false}>
                  {notifLogs.length === 0 ? (
                    <p style={{ color: '#a8d870', textAlign: 'center', marginTop: 24, fontSize: 14 }}>
                      {notifLoading ? '読み込み中…' : '通知はありません'}
                    </p>
                  ) : notifLogs.map(log => (
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
                    </motion.div>
                  ))}
                </AnimatePresence>
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

          {/* ── ウェルカムカード（空+草原のHUDヒーロー） ───── */}
          <div style={{
            position: 'relative',
            border: '3px solid #6aac14',
            borderRadius: 20,
            textAlign: 'center',
            boxShadow: '0 6px 0 #1a3a00',
          }}>
            {/* 装飾レイヤー（ここだけクリップ。吹き出しはカード外にはみ出せる） */}
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 17 }}>
              {/* 空 */}
              <div style={{ position: 'absolute', inset: 0, background: timeTheme.sky }} />
              {/* 太陽 / 月 */}
              <div style={{
                position: 'absolute', top: 18, right: 28, width: 44, height: 44, borderRadius: '50%',
                background: timeTheme.celestial === 'sun' ? '#ffd75e' : '#f3eecd',
                boxShadow: timeTheme.celestial === 'sun'
                  ? '0 0 26px 8px rgba(255,224,110,0.65)'
                  : '0 0 20px 6px rgba(240,238,210,0.45)',
              }} />
              {/* 雲（速度差で擬似パララックス） */}
              <Cloud className="hud-cloud" size={46} fill="rgba(255,255,255,0.85)" color="rgba(255,255,255,0.85)" style={{ top: 14, animationDuration: '55s' }} />
              <Cloud className="hud-cloud" size={28} fill="rgba(255,255,255,0.55)" color="rgba(255,255,255,0.55)" style={{ top: 56, animationDuration: '85s', animationDelay: '-40s' }} />
              <Cloud className="hud-cloud" size={36} fill="rgba(255,255,255,0.7)" color="rgba(255,255,255,0.7)" style={{ top: 32, animationDuration: '70s', animationDelay: '-20s' }} />
              {/* 草原 */}
              <div style={{
                position: 'absolute', bottom: 0, left: '-5%', width: '110%', height: '58%',
                background: 'linear-gradient(180deg, #4e8a00 0%, #3d6e00 55%, #2a4d00 100%)',
                borderRadius: '100% 100% 0 0 / 40px 40px 0 0',
              }} />
            </div>
            {/* コンテンツ */}
            <div style={{ position: 'relative', padding: '36px 32px 28px' }}>
              <SlimeIcon
                size={80}
                speechText={slimeSpeech}
                speechFullText={slimeSpeechFull}
                speechVisible={speechVisible}
              />
              <h1 className="game-title" style={{ fontSize: 36, marginBottom: 8, color: '#ffffff', fontWeight: 900, textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>{timeTheme.greeting}！</h1>
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
              {/* XPバー */}
              {currentRank && (
                <div style={{ marginTop: 18, textAlign: 'left' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 'bold', color: '#d4f08a', marginBottom: 4 }}>
                    <span>ランク {currentRank.name}</span>
                    <span>{nextRank ? `次まで ${nextRank.min_points - coolPoints} pt` : 'MAX'}</span>
                  </div>
                  <div style={{ height: 14, background: '#1a3a00', borderRadius: 7, border: '2px solid rgba(168,216,112,0.4)', overflow: 'hidden' }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${xpPct}%` }}
                      transition={{ duration: 1.1, ease: 'easeOut', delay: 0.3 }}
                      style={{
                        height: '100%', borderRadius: 5, position: 'relative', overflow: 'hidden',
                        background: `linear-gradient(90deg, ${currentRank.color}, ${nextRank?.color ?? '#f0a000'})`,
                      }}
                    >
                      <span className="xp-shine" />
                    </motion.div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── ビュー切り替えタブ ───────────────────────── */}
          <div style={{ display: 'flex', gap: 4, background: '#1a3a00', borderRadius: 12, padding: 4 }}>
            {NAV_ITEMS.map(item => (
              <button key={item.id} onClick={() => setCurrentView(item.id)} style={{
                flex: 1, padding: '9px 0', borderRadius: 9,
                border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 'bold',
                background: 'none', position: 'relative',
                color: currentView === item.id ? '#fff' : '#a8d870',
                transition: 'color 0.2s',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                whiteSpace: 'nowrap',
              }}>
                {currentView === item.id && (
                  <motion.span
                    layoutId="view-tab-pill"
                    transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                    style={{ position: 'absolute', inset: 0, background: '#6aac14', borderRadius: 9, boxShadow: '0 2px 0 #3d6e00' }}
                  />
                )}
                <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Icon name={item.icon} size={13}/>{item.label}
                </span>
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
              <div style={{
                background: 'linear-gradient(135deg, #1a3a00 0%, #2d5500 55%, #3d6e00 100%)',
                borderRadius: 10, padding: '24px 28px', position: 'relative', overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(106,172,20,0.18) 0%, transparent 70%)', pointerEvents: 'none' }} />
                <p style={{ color: '#6aac14', fontSize: 10, fontWeight: 'bold', letterSpacing: '0.12em', marginBottom: 4 }}>WEEKLY CYCLE</p>
                <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', margin: '0 0 24px' }}>今週のサイクル</h2>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20, padding: '0 8px' }}>
                  {MILESTONES.map((m, idx) => {
                    const isActive = m.phase === todayPhase
                    const isPast   = MILESTONES.findIndex(x => x.phase === todayPhase) > idx
                    return (
                      <Fragment key={m.key}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1, position: 'relative' }}>
                          <motion.div
                            initial={{ scale: 0.6, opacity: 0 }}
                            animate={isActive
                              ? { scale: [1, 1.07, 1], opacity: 1, boxShadow: ['0 0 12px rgba(106,172,20,0.45)', '0 0 22px rgba(106,172,20,0.85)', '0 0 12px rgba(106,172,20,0.45)'] }
                              : { scale: 1, opacity: 1 }}
                            transition={isActive
                              ? { default: { duration: 2.2, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }, opacity: { duration: 0.4, delay: idx * 0.12, ease: 'easeOut' } }
                              : { duration: 0.4, delay: idx * 0.12, ease: 'easeOut' }}
                            style={{
                              width: 44, height: 44, borderRadius: '50%',
                              background: isActive ? '#6aac14' : isPast ? 'rgba(106,172,20,0.35)' : 'rgba(255,255,255,0.08)',
                              border: `2px solid ${isActive ? '#a8d870' : isPast ? '#6aac14' : 'rgba(255,255,255,0.2)'}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                            <FlipChars text={m.day} baseDelay={idx * 0.12 + 0.1}
                              style={{ fontSize: 15, fontWeight: 'bold', color: isActive ? '#fff' : isPast ? '#a8d870' : 'rgba(255,255,255,0.35)' }} />
                          </motion.div>
                          <p style={{ marginTop: 8, fontSize: 11, fontWeight: 'bold', color: isActive ? '#a8d870' : isPast ? '#6aac14' : 'rgba(255,255,255,0.3)', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <FlipChars text={m.label} baseDelay={idx * 0.1 + 0.15} />
                          </p>
                        </div>
                        {idx < MILESTONES.length - 1 && (
                          <div style={{ flex: 1, height: 3, margin: '0 6px', marginBottom: 22, background: 'rgba(255,255,255,0.12)', overflow: 'hidden', borderRadius: 2, position: 'relative' }}>
                            <motion.div
                              initial={{ scaleX: 0 }}
                              animate={isPast
                                ? { scaleX: 1, opacity: [1, 0.55, 1] }
                                : { scaleX: 0 }}
                              transition={isPast
                                ? { scaleX: { duration: 0.7, delay: 0.2 + idx * 0.15, ease: 'easeOut' }, opacity: { duration: 1.6, repeat: Infinity, ease: 'easeInOut', delay: 1 + idx * 0.3 } }
                                : { duration: 0.7, delay: 0.2 + idx * 0.15, ease: 'easeOut' }}
                              style={{ width: '100%', height: '100%', background: '#6aac14', transformOrigin: 'left', willChange: 'transform' }}
                            />
                          </div>
                        )}
                      </Fragment>
                    )
                  })}
                </div>
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.6 }}
                  style={{ background: 'rgba(106,172,20,0.15)', border: '1px solid rgba(106,172,20,0.35)', borderRadius: 8, padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <motion.div
                    animate={{ opacity: [1, 0.4, 1] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ width: 6, height: 6, borderRadius: '50%', background: '#6aac14', flexShrink: 0 }} />
                  <p style={{ color: '#c8f0a0', fontSize: 13, fontWeight: 'bold', margin: 0 }}>{currentMilestone.desc}</p>
                </motion.div>
              </div>

              {tasksLoading ? (
                <div className="game-card" style={{ padding: '28px 32px', textAlign: 'center' }}>
                  <p style={{ color: '#6aac14', fontSize: 16 }}>課題を読み込み中…</p>
                </div>
              ) : activeAssignments.length === 0 && assignments.length === 0 ? (
                <div className="game-card" style={{ padding: '28px 32px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><MailOpen size={28} color="#6aac14"/></div>
                  <p style={{ color: '#6aac14', fontSize: 16 }}>アサインされた課題はまだありません</p>
                </div>
              ) : activeAssignments.length === 0 ? (
                <div className="game-card" style={{ padding: '28px 32px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><PartyPopper size={28} color="#6aac14"/></div>
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
                      {assignment.resubmit_requested ? (
                        <span style={{ background: '#ff9800', color: '#fff', borderRadius: 12, padding: '4px 10px', fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          再提出リクエスト中
                        </span>
                      ) : (
                        <span style={{ background: si.bg, color: si.color, borderRadius: 12, padding: '4px 10px', fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Icon name={si.icon} size={12}/>{si.label}
                        </span>
                      )}
                    </div>

                    {/* ── 子セクション群 */}
                    {parentOpen && (
                      <div style={{ borderTop: '2px solid #d4f0a0' }}>

                        {/* 📋 課題 */}
                        <div style={{ borderBottom: '1px solid #e8ffd4' }}>
                          <div onClick={() => toggleSec('detail')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 20px', cursor: 'pointer', userSelect: 'none', background: '#f8fff0' }}>
                            <span style={{ fontSize: 12, color: '#6aac14', display: 'inline-block', transform: sec.detail ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>▶</span>
                            <span style={{ fontWeight: 'bold', color: '#2d5500', fontSize: 14, flex: 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}><ClipboardList size={14}/>課題</span>
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
                            <span style={{ fontWeight: 'bold', color: '#2d5500', fontSize: 14, flex: 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}><FileText size={14}/>計画</span>
                            {assignment.plan_text && <span style={{ background: '#c8f0c0', color: '#1a6e00', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Check size={11}/>入力済</span>}
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
                            <span style={{ fontWeight: 'bold', color: '#2d5500', fontSize: 14, flex: 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <Search size={14}/>中間報告
                              {todayPhase === 'midterm' && <span style={{ marginLeft: 8, background: '#6aac14', color: 'white', borderRadius: 8, padding: '1px 7px', fontSize: 11 }}>今日！</span>}
                            </span>
                            {assignment.midterm_progress && <span style={{ background: '#c8f0c0', color: '#1a6e00', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Check size={11}/>入力済</span>}
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

                        {/* 📋 前回の提出（再提出リクエスト時に表示） */}
                        {assignment.resubmit_requested && assignment.previous_submission && (() => {
                          const prev = assignment.previous_submission
                          const prevOpen = (taskSectionOpen[assignment.id + '_prev'] as unknown as boolean) ?? false
                          return (
                            <div style={{ borderBottom: '1px solid #ffe0b2' }}>
                              <div
                                onClick={() => setTaskSectionOpen(p => ({ ...p, [assignment.id + '_prev']: !prevOpen } as typeof p))}
                                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 20px', cursor: 'pointer', userSelect: 'none', background: '#fff8f0' }}
                              >
                                <span style={{ fontSize: 12, color: '#ff9800', display: 'inline-block', transform: prevOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>▶</span>
                                <span style={{ fontWeight: 'bold', color: '#e65100', fontSize: 14, flex: 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                  前回の提出内容
                                </span>
                                {prev.submitted_at && (
                                  <span style={{ fontSize: 11, color: '#e65100', whiteSpace: 'nowrap' }}>
                                    {new Date(prev.submitted_at).toLocaleDateString('ja-JP')}
                                  </span>
                                )}
                              </div>
                              {prevOpen && (
                                <div style={{ padding: '12px 20px 16px', borderTop: '1px solid #ffe0b2', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                  {prev.thumbnail_url && (
                                    <img src={prev.thumbnail_url} alt="前回サムネイル" style={{ width: '100%', borderRadius: 8, maxHeight: 160, objectFit: 'cover' }} />
                                  )}
                                  {prev.submission_comment && (
                                    <div>
                                      <p style={{ fontSize: 12, color: '#e65100', fontWeight: 'bold', marginBottom: 4 }}>提出物の説明</p>
                                      <p style={{ background: '#fff3e0', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#333', whiteSpace: 'pre-wrap' }}>{prev.submission_comment}</p>
                                    </div>
                                  )}
                                  {prev.self_evaluation && (
                                    <div>
                                      <p style={{ fontSize: 12, color: '#e65100', fontWeight: 'bold', marginBottom: 4 }}>自己評価</p>
                                      <p style={{ background: '#fff3e0', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#333', whiteSpace: 'pre-wrap' }}>{prev.self_evaluation}</p>
                                    </div>
                                  )}
                                  {prev.retrospective && (
                                    <div>
                                      <p style={{ fontSize: 12, color: '#e65100', fontWeight: 'bold', marginBottom: 4 }}>計画の振り返り</p>
                                      <p style={{ background: '#fff3e0', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#333', whiteSpace: 'pre-wrap' }}>{prev.retrospective}</p>
                                    </div>
                                  )}
                                  {prev.video_url && (
                                    <div>
                                      <p style={{ fontSize: 12, color: '#e65100', fontWeight: 'bold', marginBottom: 4 }}>提出動画</p>
                                      <video src={prev.video_url} controls playsInline preload="metadata" style={{ width: '100%', maxHeight: 160, borderRadius: 6, background: '#000', display: 'block' }} />
                                    </div>
                                  )}
                                  {prev.image_urls && prev.image_urls.length > 0 && (
                                    <div>
                                      <p style={{ fontSize: 12, color: '#e65100', fontWeight: 'bold', marginBottom: 4 }}>提出画像</p>
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                        {prev.image_urls.map((url, i) => (
                                          <img key={i} src={url} alt={`前回画像${i + 1}`} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6 }} />
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })()}

                        {/* 🎬 最終提出 */}
                        <div>
                          <div onClick={() => toggleSec('final')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 20px', cursor: 'pointer', userSelect: 'none', background: '#f8fff0' }}>
                            <span style={{ fontSize: 12, color: '#6aac14', display: 'inline-block', transform: sec.final ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>▶</span>
                            <span style={{ fontWeight: 'bold', color: '#2d5500', fontSize: 14, flex: 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <Film size={14}/>最終提出
                              {todayPhase === 'final' && <span style={{ marginLeft: 8, background: '#6aac14', color: 'white', borderRadius: 8, padding: '1px 7px', fontSize: 11 }}>今日！</span>}
                            </span>
                            {(assignment.image_urls && assignment.image_urls.length > 0) && <span style={{ background: '#c8f0c0', color: '#1a6e00', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Check size={11}/>入力済</span>}
                          </div>
                          {sec.final && (
                            <div style={{ padding: '12px 20px 16px', borderTop: '1px solid #e8ffd4', display: 'flex', flexDirection: 'column', gap: 14 }}>
                              {assignment.task.allow_image_attachment !== false && (
                                <>
                                <div>
                                  <label className="game-label">動画（1本まで・任意）</label>
                                  <p style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>制作物のプレイ動画などを1本添付できます</p>
                                  {existingVideoUrls[assignment.id] ? (
                                    <div style={{ position: 'relative', marginBottom: 8, borderRadius: 12, overflow: 'hidden', border: '2px solid #c8e89a' }}>
                                      <video src={existingVideoUrls[assignment.id]} controls playsInline preload="metadata" style={{ width: '100%', maxHeight: 220, display: 'block', background: '#000' }} />
                                      <button
                                        type="button"
                                        onClick={() => setExistingVideoUrls(prev => ({ ...prev, [assignment.id]: '' }))}
                                        style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(220,0,0,0.9)', color: 'white', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, lineHeight: '1' }}
                                      >🗑</button>
                                    </div>
                                  ) : videoPreviews[assignment.id] ? (
                                    <div style={{ position: 'relative', marginBottom: 8, borderRadius: 12, overflow: 'hidden', border: '2px solid #c8e89a' }}>
                                      <video src={videoPreviews[assignment.id]} controls playsInline style={{ width: '100%', maxHeight: 220, display: 'block', background: '#000' }} />
                                      <button
                                        type="button"
                                        onClick={() => handleVideoChange(assignment.id, null)}
                                        style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(220,0,0,0.9)', color: 'white', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, lineHeight: '1' }}
                                      >🗑</button>
                                    </div>
                                  ) : (
                                    <>
                                      <input
                                        type="file"
                                        accept="video/*"
                                        id={`video-add-${assignment.id}`}
                                        style={{ display: 'none' }}
                                        onChange={e => {
                                          handleVideoChange(assignment.id, e.target.files?.[0] ?? null)
                                          e.target.value = ''
                                        }}
                                      />
                                      <label
                                        htmlFor={`video-add-${assignment.id}`}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: 120, border: '2px dashed #c8e89a', borderRadius: 12, cursor: 'pointer', background: '#f5fff0', fontSize: 32, color: '#6aac14', marginBottom: 8 }}
                                      >▶</label>
                                    </>
                                  )}
                                  <p style={{ color: '#888', fontSize: 12, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={12}/>1本あたり30MBまで（mp4・webm・movなど）。アップロード時に自動で圧縮されます</p>
                                  {videoErrors[assignment.id] && <p style={{ color: '#e00', fontSize: 12, marginTop: 2 }}>{videoErrors[assignment.id]}</p>}
                                  {uploadingVideo[assignment.id] && (
                                    <p style={{ color: '#6aac14', fontSize: 13, marginTop: 4 }}>
                                      {videoCompressProgress[assignment.id] != null
                                        ? `動画を圧縮中... ${Math.round((videoCompressProgress[assignment.id] ?? 0) * 100)}%`
                                        : '動画アップロード中...'}
                                    </p>
                                  )}
                                </div>
                                <div>
                                  <label className="game-label">画像（最大5枚）</label>
                                  <p style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>制作物のスクリーンショットや完成画像を添付してください</p>
                                  {(existingImageUrls[assignment.id] ?? []).map((src, i) => (
                                    <div key={`existing-${i}`} style={{ position: 'relative', marginBottom: 8, borderRadius: 12, overflow: 'hidden', border: '2px solid #c8e89a' }}>
                                      <img src={src} alt={`保存済み画像${i + 1}`} style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }} />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const newExisting = (existingImageUrls[assignment.id] ?? []).filter((_, j) => j !== i)
                                          setExistingImageUrls(prev => ({ ...prev, [assignment.id]: newExisting }))
                                        }}
                                        style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(220,0,0,0.9)', color: 'white', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, lineHeight: '1' }}
                                      >🗑</button>
                                    </div>
                                  ))}
                                  {(imagePreviews[assignment.id] ?? []).map((src, i) => (
                                    <div key={`new-${i}`} style={{ position: 'relative', marginBottom: 8, borderRadius: 12, overflow: 'hidden', border: '2px solid #c8e89a' }}>
                                      <img src={src} alt={`preview-${i}`} style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }} />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const newFiles = (imageFiles[assignment.id] ?? []).filter((_, j) => j !== i)
                                          const newPreviews = (imagePreviews[assignment.id] ?? []).filter((_, j) => j !== i)
                                          setImageFiles(prev => ({ ...prev, [assignment.id]: newFiles }))
                                          setImagePreviews(prev => ({ ...prev, [assignment.id]: newPreviews }))
                                        }}
                                        style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(220,0,0,0.9)', color: 'white', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, lineHeight: '1' }}
                                      >🗑</button>
                                    </div>
                                  ))}
                                  {(existingImageUrls[assignment.id] ?? []).length + (imagePreviews[assignment.id] ?? []).length < 5 && (
                                    <>
                                      <input
                                        type="file"
                                        accept="image/*"
                                        id={`image-add-${assignment.id}`}
                                        style={{ display: 'none' }}
                                        onChange={e => {
                                          const file = e.target.files?.[0]
                                          if (!file) return
                                          setImageFiles(prev => ({ ...prev, [assignment.id]: [...(prev[assignment.id] ?? []), file] }))
                                          setImagePreviews(prev => ({ ...prev, [assignment.id]: [...(prev[assignment.id] ?? []), URL.createObjectURL(file)] }))
                                          e.target.value = ''
                                        }}
                                      />
                                      <label
                                        htmlFor={`image-add-${assignment.id}`}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: 120, border: '2px dashed #c8e89a', borderRadius: 12, cursor: 'pointer', background: '#f5fff0', fontSize: 32, color: '#6aac14', marginBottom: 8 }}
                                      >+</label>
                                    </>
                                  )}
                                  <p style={{ color: '#888', fontSize: 12, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={12}/>1枚あたり10MBまで（jpg・png・gif・webp）</p>
                                  {uploadingImages[assignment.id] && <p style={{ color: '#6aac14', fontSize: 13, marginTop: 4 }}>画像アップロード中...</p>}
                                </div>
                                </>
                              )}
                              <div>
                                <label className="game-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ClipboardList size={13}/>提出物を記載<span style={{ color: '#e00', marginLeft: 2 }}>*</span></label>
                                <textarea className="game-input" rows={3}
                                  placeholder="今回作ったものを説明してください。どんな機能を実装したか、工夫した点など..."
                                  value={submissionComments[assignment.id] ?? ''}
                                  onChange={e => {
                                    setSubmissionComments(prev => ({ ...prev, [assignment.id]: e.target.value }))
                                    if (e.target.value.trim()) setSubmitFieldErrors(prev => ({ ...prev, [assignment.id]: { ...prev[assignment.id], comment: false } }))
                                  }}
                                  style={{ resize: 'vertical', border: submitFieldErrors[assignment.id]?.comment ? '2px solid #e00' : undefined }} />
                                {submitFieldErrors[assignment.id]?.comment && <p style={{ color: '#e00', fontSize: 12, marginTop: 2 }}>この項目は必須です</p>}
                              </div>
                              <div>
                                <label className="game-label">自己評価<span style={{ color: '#e00', marginLeft: 2 }}>*</span></label>
                                <textarea className="game-input" rows={3}
                                  placeholder="今週の制作を振り返って、自分で評価してみよう..."
                                  value={selfEvals[assignment.id] ?? ''}
                                  onChange={e => {
                                    setSelfEvals(prev => ({ ...prev, [assignment.id]: e.target.value }))
                                    if (e.target.value.trim()) setSubmitFieldErrors(prev => ({ ...prev, [assignment.id]: { ...prev[assignment.id], selfEval: false } }))
                                  }}
                                  style={{ resize: 'vertical', border: submitFieldErrors[assignment.id]?.selfEval ? '2px solid #e00' : undefined }} />
                                {submitFieldErrors[assignment.id]?.selfEval && <p style={{ color: '#e00', fontSize: 12, marginTop: 2 }}>この項目は必須です</p>}
                              </div>
                              <div>
                                <label className="game-label">計画の振り返り<span style={{ color: '#e00', marginLeft: 2 }}>*</span></label>
                                <textarea className="game-input" rows={3}
                                  placeholder="月曜に立てた計画と、実際の進捗の差を振り返ろう..."
                                  value={retros[assignment.id] ?? ''}
                                  onChange={e => {
                                    setRetros(prev => ({ ...prev, [assignment.id]: e.target.value }))
                                    if (e.target.value.trim()) setSubmitFieldErrors(prev => ({ ...prev, [assignment.id]: { ...prev[assignment.id], retro: false } }))
                                  }}
                                  style={{ resize: 'vertical', border: submitFieldErrors[assignment.id]?.retro ? '2px solid #e00' : undefined }} />
                                {submitFieldErrors[assignment.id]?.retro && <p style={{ color: '#e00', fontSize: 12, marginTop: 2 }}>この項目は必須です</p>}
                              </div>
                              <div>
                                <label className="game-label">サムネイル画像（任意）</label>
                                <p style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>タイムラインのカードに表示されるサムネイルです</p>
                                {thumbPreviews[assignment.id] ? (
                                  <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '2px solid #c8e89a' }}>
                                    <img src={thumbPreviews[assignment.id]} alt="thumbnail-preview" style={{ width: '100%', maxHeight: 160, objectFit: 'cover', display: 'block' }} />
                                    <button
                                      type="button"
                                      onClick={() => handleThumbnailChange(assignment.id, null)}
                                      style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(220,0,0,0.9)', color: 'white', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, lineHeight: '1' }}
                                    >🗑</button>
                                  </div>
                                ) : (
                                  <>
                                    <input
                                      type="file"
                                      accept="image/*"
                                      id={`thumb-${assignment.id}`}
                                      style={{ display: 'none' }}
                                      onChange={e => handleThumbnailChange(assignment.id, e.target.files?.[0] ?? null)}
                                    />
                                    <label
                                      htmlFor={`thumb-${assignment.id}`}
                                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: 120, border: '2px dashed #c8e89a', borderRadius: 12, cursor: 'pointer', background: '#f5fff0', fontSize: 32, color: '#6aac14' }}
                                    >+</label>
                                  </>
                                )}
                                {uploadingThumb[assignment.id] && <p style={{ color: '#6aac14', fontSize: 13, marginTop: 4 }}>アップロード中...</p>}
                              </div>
                              <div>
                                <label className="game-label">投稿設定</label>
                                <button type="button"
                                  onClick={() => setIsAnonymous(prev => ({ ...prev, [assignment.id]: !prev[assignment.id] }))}
                                  style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, padding: '8px 20px', borderRadius: 20, background: isAnonymous[assignment.id] ? '#3d6e00' : '#f0fae0', border: `2px solid ${isAnonymous[assignment.id] ? '#2a4d00' : '#c8e89a'}`, cursor: 'pointer', fontSize: 14, fontWeight: 'bold', color: isAnonymous[assignment.id] ? '#fff' : '#3d6e00', transition: 'all 0.15s' }}>
                                  <span>{isAnonymous[assignment.id] ? <EyeOff size={16}/> : <User size={16}/>}</span>
                                  {isAnonymous[assignment.id] ? '匿名投稿' : '実名投稿（公開）'}
                                </button>
                                <p style={{ color: '#888', fontSize: 12, marginTop: 6 }}>
                                  {isAnonymous[assignment.id] ? 'タイムラインには名前が表示されません' : 'タイムラインにあなたの名前と作品が公開されます'}
                                </p>
                              </div>
                              <div>
                                <label className="game-label">公式Xでの紹介</label>
                                <p style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>提出された作品を公式Xアカウントでご紹介することがあります</p>
                                <div style={{ display: 'flex', gap: 20, marginTop: 4 }}>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14, color: '#3d6e00', fontWeight: 'bold' }}>
                                    <input
                                      type="radio"
                                      name={`x-consent-${assignment.id}`}
                                      checked={xConsent[assignment.id] !== false}
                                      onChange={() => setXConsent(prev => ({ ...prev, [assignment.id]: true }))}
                                      style={{ accentColor: '#6aac14' }}
                                    />
                                    同意する
                                  </label>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14, color: '#888' }}>
                                    <input
                                      type="radio"
                                      name={`x-consent-${assignment.id}`}
                                      checked={xConsent[assignment.id] === false}
                                      onChange={() => setXConsent(prev => ({ ...prev, [assignment.id]: false }))}
                                      style={{ accentColor: '#6aac14' }}
                                    />
                                    同意しない
                                  </label>
                                </div>
                                {xConsent[assignment.id] !== false && (
                                  <div style={{ marginTop: 10 }}>
                                    <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>紹介時のXユーザー名（任意・変更がある場合）</label>
                                    <input
                                      type="text"
                                      className="game-input"
                                      placeholder="@username"
                                      value={xUsernames[assignment.id] ?? ''}
                                      onChange={e => setXUsernames(prev => ({ ...prev, [assignment.id]: e.target.value }))}
                                      style={{ fontSize: 13 }}
                                    />
                                  </div>
                                )}
                              </div>
                              <div style={{ borderTop: '2px dashed #c8e89a', paddingTop: 14 }}>
                                <label className="game-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><MessageCircle size={13}/>コースへの要望</label>
                                <p style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>
                                  やってみたいこと・興味のある分野・自分の技術の進捗感など、運営への要望を自由に書いてください。次の課題の参考にします。
                                </p>
                                <textarea className="game-input" rows={4}
                                  placeholder="例：もっと〇〇を作ってみたい、今は△△が△割くらいできてきた気がする、□□が難しくて困っている..."
                                  value={courseRequests[assignment.id] ?? ''}
                                  onChange={e => setCourseRequests(prev => ({ ...prev, [assignment.id]: e.target.value }))}
                                  style={{ resize: 'vertical' }} />
                              </div>
                              <div style={{ display: 'flex', gap: 10 }}>
                                <button
                                  type="button"
                                  className="game-button"
                                  disabled={savingDraft[assignment.id]}
                                  onClick={() => saveDraftFinal(assignment.id)}
                                  style={{ flex: 1, background: '#f0fae0', color: '#3d6e00', border: '2px solid #c8e89a', boxShadow: 'none' }}
                                >
                                  {savingDraft[assignment.id] ? '保存中…' : <><Save size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }}/>一時保存</>}
                                </button>
                                <button className="game-button" disabled={submitting[assignment.id]} onClick={() => submitWork(assignment.id)} style={{ flex: 1 }}>
                                  {submitting[assignment.id] ? '提出中…' : <><Rocket size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }}/>提出する</>}
                                </button>
                              </div>
                              {draftSuccess[assignment.id] && <div className="game-success">一時保存しました</div>}
                              {submitSuccess[assignment.id] && <div className="game-success">提出完了！お疲れさまでした</div>}
                              {submitError[assignment.id] && <div className="game-error">{submitError[assignment.id]}</div>}
                            </div>
                          )}
                        </div>

                      </div>
                    )}
                  </div>
                )
              })}

              {/* ── 課題一覧ボタン ─────────────────────────── */}
              <a href="/task-list" style={{ textDecoration: 'none' }}>
                <button className="game-button" style={{
                  width: '100%', padding: '12px', fontSize: 15,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                  <List size={16}/>課題一覧
                </button>
              </a>

              {/* ══ 今週の課題チケット ══════════════════════ */}
              {activeTicket !== undefined && ticketTypes.length > 0 && (() => {
                const previewType = activeTicket?.ticket_types
                  ?? ticketTypes.find(t => t.id === selectedTypeId)
                  ?? ticketTypes[0]
                return (
                  <div
                    key={ticketBurstKey}
                    className={`ticket-card${ticketBurstKey > 0 ? ' ticket-card--burst' : ''}`}
                    style={{ marginTop: 8, borderRadius: 20, overflow: 'hidden', position: 'relative' }}
                  >
                    {/* ベース: 黒 */}
                    <div style={{ position: 'absolute', inset: 0, background: '#111', borderRadius: 20 }} />
                    {/* グラデーション: 発行時にフェードイン */}
                    <div style={{
                      position: 'absolute', inset: 0,
                      background: `linear-gradient(135deg, ${previewType.color_start}, ${previewType.color_end})`,
                      opacity: activeTicket ? 1 : 0,
                      transition: 'opacity 0.9s ease',
                      borderRadius: 20,
                    }} />
                    {/* 光沢 */}
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0, height: '50%',
                      background: 'linear-gradient(180deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 100%)',
                      borderRadius: '20px 20px 0 0', pointerEvents: 'none',
                      opacity: activeTicket ? 1 : 0.3,
                      transition: 'opacity 0.9s ease',
                    }} />
                    {/* チケット切り取り風の点線（上下） */}
                    <div className="ticket-card__perforation ticket-card__perforation--top" />
                    <div className="ticket-card__perforation ticket-card__perforation--bottom" />
                    {/* 発行時の演出 */}
                    {ticketBurstKey > 0 && (
                      <>
                        <div className="ticket-flash" />
                        <div className="ticket-shine-burst" />
                      </>
                    )}
                    {/* コンテンツ */}
                    <div style={{ position: 'relative', padding: '24px 28px', color: 'white' }}>
                      <p style={{ fontSize: 11, fontWeight: 'bold', opacity: 0.7, margin: '0 0 10px', letterSpacing: 1 }}>
                        チケットを発行
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        {/* 発行済み: 要件名＋期限 / 未発行: ドロップダウン */}
                        {activeTicket ? (
                          <div style={{
                            flex: '1 1 160px', padding: '10px 14px', borderRadius: 12,
                            border: '1px solid rgba(255,255,255,0.2)',
                            background: 'rgba(255,255,255,0.12)',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                            minWidth: 0,
                          }}>
                            <span style={{ fontSize: 14, fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {activeTicket.ticket_types.label}
                            </span>
                            <span style={{ fontSize: 12, opacity: 0.7, whiteSpace: 'nowrap', flexShrink: 0 }}>
                              〜{new Date(activeTicket.expires_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}
                            </span>
                          </div>
                        ) : (
                          <select
                            value={selectedTypeId}
                            onChange={e => setSelectedTypeId(e.target.value)}
                            style={{
                              flex: '1 1 160px', padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)',
                              fontSize: 14, fontWeight: 'bold', cursor: 'pointer',
                              background: 'rgba(255,255,255,0.12)', color: selectedTypeId ? 'white' : 'rgba(255,255,255,0.5)',
                            }}
                          >
                            <option value="" style={{ background: '#222', color: '#aaa' }}>チケットを選択してください</option>
                            {ticketTypes.map(tt => (
                              <option key={tt.id} value={tt.id} style={{ background: '#222', color: 'white' }}>{tt.label}</option>
                            ))}
                          </select>
                        )}
                        {/* 発行 / 解除 ボタン */}
                        <button
                          onClick={activeTicket ? revokeTicket : issueTicket}
                          disabled={issuingTicket || revokingTicket || (!activeTicket && !selectedTypeId)}
                          style={{
                            padding: '10px 22px', borderRadius: 12, border: 'none', cursor: 'pointer',
                            background: activeTicket ? 'rgba(255,80,80,0.35)' : 'rgba(255,255,255,0.25)',
                            color: 'white', fontWeight: 'bold', fontSize: 14,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                            transition: 'background 0.2s',
                            flexShrink: 0,
                          }}
                        >
                          {issuingTicket ? '発行中…' : revokingTicket ? '解除中…' : activeTicket ? '解除' : '発行'}
                        </button>
                      </div>
                      {ticketError && <p style={{ color: '#ff8080', fontSize: 13, marginTop: 10, margin: '10px 0 0' }}>{ticketError}</p>}
                    </div>
                  </div>
                )
              })()}
            </>
          )}

          {/* ══ VIEW: 過去の課題 ════════════════════════════ */}
          {currentView === 'history' && (
            <>
              <ViewHeader badge="HISTORY" icon={<BookOpen size={18}/>} title="過去の課題"
                subtitle={<>提出済みの課題履歴 — {submittedAssignments.length} 件</>} />

              {submittedAssignments.length === 0 ? (
                <div className="game-card" style={{ padding: '28px 32px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><MailOpen size={28} color="#6aac14"/></div>
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
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={12}/>提出日: {new Date(a.submitted_at).toLocaleDateString('ja-JP')}</span>
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
                            <p className="game-label" style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}><FileText size={13}/>制作計画</p>
                            <p style={textBlockStyle}>{a.plan_text}</p>
                          </div>
                        )}
                        {(a.midterm_progress || a.midterm_correction) && (
                          <div>
                            <p className="game-label" style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}><Search size={13}/>中間報告</p>
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
                        {a.video_url && (
                          <div>
                            <p className="game-label" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Film size={13}/>提出動画</p>
                            <video src={a.video_url} controls playsInline preload="metadata"
                              style={{ width: '100%', maxHeight: 260, borderRadius: 8, background: '#000', display: 'block', border: '2px solid #c8e89a' }} />
                          </div>
                        )}
                        {a.image_urls && a.image_urls.length > 0 && (
                          <div>
                            <p className="game-label" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Image size={13}/>提出画像</p>
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
                        {(!a.image_urls || a.image_urls.length === 0) && !a.video_url && a.media_url && (
                          <div>
                            <p className="game-label" style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}><Film size={13}/>提出URL（旧形式）</p>
                            <a href={a.media_url} target="_blank" rel="noopener noreferrer"
                              style={{ color: '#3d6e00', fontSize: 14, wordBreak: 'break-all' }}>
                              {a.media_url}
                            </a>
                          </div>
                        )}
                        {a.submission_comment && (
                          <div>
                            <p className="game-label" style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}><ClipboardList size={13}/>提出物の説明</p>
                            <p style={textBlockStyle}>{a.submission_comment}</p>
                          </div>
                        )}
                        {a.self_evaluation && (
                          <div>
                            <p className="game-label" style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}><Star size={13}/>自己評価</p>
                            <p style={textBlockStyle}>{a.self_evaluation}</p>
                          </div>
                        )}
                        {a.retrospective && (
                          <div>
                            <p className="game-label" style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}><RefreshCw size={13}/>計画の振り返り</p>
                            <p style={textBlockStyle}>{a.retrospective}</p>
                          </div>
                        )}
                        <p style={{ color: a.is_anonymous ? '#888' : '#6aac14', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                          {a.is_anonymous ? <><EyeOff size={12}/>匿名投稿</> : <><User size={12}/>実名投稿</>}
                        </p>
                        {a.course_request && (
                          <div style={{ borderTop: '2px dashed #c8e89a', paddingTop: 12 }}>
                            <p className="game-label" style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}><MessageCircle size={13}/>コースへの要望</p>
                            <p style={textBlockStyle}>{a.course_request}</p>
                          </div>
                        )}
                        {a.previous_submission && (() => {
                          const prev = a.previous_submission
                          const prevHistOpen = (expandedHistory[a.id + '_prev'] as unknown as boolean) ?? false
                          return (
                            <div style={{ borderTop: '2px dashed #ffe0b2', paddingTop: 12 }}>
                              <button
                                onClick={() => setExpandedHistory(p => ({ ...p, [a.id + '_prev']: !prevHistOpen }))}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 6, color: '#e65100', fontWeight: 'bold', fontSize: 13 }}
                              >
                                <span style={{ display: 'inline-block', transform: prevHistOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▶</span>
                                前回の提出内容
                                {prev.submitted_at && <span style={{ fontSize: 11, color: '#e65100', fontWeight: 'normal' }}>（{new Date(prev.submitted_at).toLocaleDateString('ja-JP')}）</span>}
                              </button>
                              {prevHistOpen && (
                                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                  {prev.thumbnail_url && (
                                    <img src={prev.thumbnail_url} alt="前回サムネイル" style={{ width: '100%', borderRadius: 8, maxHeight: 160, objectFit: 'cover' }} />
                                  )}
                                  {prev.submission_comment && (
                                    <div>
                                      <p style={{ fontSize: 12, color: '#e65100', fontWeight: 'bold', marginBottom: 4 }}>提出物の説明</p>
                                      <p style={{ ...textBlockStyle, background: '#fff3e0' }}>{prev.submission_comment}</p>
                                    </div>
                                  )}
                                  {prev.self_evaluation && (
                                    <div>
                                      <p style={{ fontSize: 12, color: '#e65100', fontWeight: 'bold', marginBottom: 4 }}>自己評価</p>
                                      <p style={{ ...textBlockStyle, background: '#fff3e0' }}>{prev.self_evaluation}</p>
                                    </div>
                                  )}
                                  {prev.retrospective && (
                                    <div>
                                      <p style={{ fontSize: 12, color: '#e65100', fontWeight: 'bold', marginBottom: 4 }}>計画の振り返り</p>
                                      <p style={{ ...textBlockStyle, background: '#fff3e0' }}>{prev.retrospective}</p>
                                    </div>
                                  )}
                                  {prev.video_url && (
                                    <video src={prev.video_url} controls playsInline preload="metadata" style={{ width: '100%', maxHeight: 160, borderRadius: 6, background: '#000', display: 'block', border: '2px solid #ffe0b2' }} />
                                  )}
                                  {prev.image_urls && prev.image_urls.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                      {prev.image_urls.map((url, i) => (
                                        <img key={i} src={url} alt={`前回画像${i + 1}`} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6, border: '2px solid #ffe0b2' }} />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })()}
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
                <ViewHeader badge="TIMELINE" icon={<Globe size={18}/>} title="タイムライン"
                  subtitle={<>部員の提出作品 — {timelineTotalCount} 件</>} />

                {/* フィルター・ソート */}
                <div style={{ background: '#fff', border: '2px solid #3d6e00', borderRadius: 10, padding: '12px 16px' }}>
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
                      {timelineViewMode === 'grid' ? <List size={16}/> : <LayoutGrid size={16}/>}
                    </button>
                  </div>
                </div>

                {timelineLoading ? (
                  <div className="game-card" style={{ padding: 40, textAlign: 'center' }}>
                    <p style={{ color: '#6aac14', fontSize: 16 }}>読み込み中...</p>
                  </div>
                ) : timeline.length === 0 ? (
                  <div className="game-card" style={{ padding: '28px 32px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><MailOpen size={28} color="#6aac14"/></div>
                    <p style={{ color: '#6aac14', fontSize: 16 }}>
                      {timelineFilterCourse || timelineFilterStage ? 'フィルター条件に一致する作品がありません' : 'まだ提出された作品はありません'}
                    </p>
                  </div>
                ) : timelineViewMode === 'grid' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {timeline.map(item => (
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
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{item.is_anonymous ? <><EyeOff size={11}/>匿名</> : <><User size={11}/>{item.profile?.username ?? '名無し'}</>}</span>
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
                    {timeline.map(item => (
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
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{item.is_anonymous ? <><EyeOff size={11}/>匿名</> : <><User size={11}/>{item.profile?.username ?? '名無し'}</>}</span>
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

                {!timelineLoading && timeline.length < timelineTotalCount && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <button className="timeline-more-btn" disabled={timelineLoadingMore} onClick={() => loadMoreTimeline(false)}>
                      {timelineLoadingMore ? '読み込み中…' : <>さらに表示 <ChevronDown className="chev" size={16}/></>}
                    </button>
                    <button className="timeline-more-btn timeline-more-btn--ghost" disabled={timelineLoadingMore} onClick={() => loadMoreTimeline(true)}>
                      すべて表示（残り {timelineTotalCount - timeline.length} 件）
                    </button>
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
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{selectedPost.is_anonymous ? <><EyeOff size={14}/>匿名</> : <><User size={14}/>{selectedPost.profile?.username ?? '名無し'}</>}</span>
              </p>
              {selectedPost.submitted_at && (
                <p style={{ color: '#aaa', fontSize: 12, marginBottom: 16 }}>
                  提出日: {new Date(selectedPost.submitted_at).toLocaleDateString('ja-JP')}
                </p>
              )}

              <hr style={{ border: 'none', borderTop: '2px dashed #c8e89a', margin: '12px 0' }} />

              {selectedPost.video_url && (
                <div style={{ marginBottom: 14 }}>
                  <p className="game-label" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Film size={13}/>提出動画</p>
                  <video src={selectedPost.video_url} controls playsInline preload="metadata"
                    style={{ width: '100%', maxHeight: 280, borderRadius: 8, background: '#000', display: 'block', border: '2px solid #c8e89a' }} />
                </div>
              )}
              {selectedPost.image_urls && selectedPost.image_urls.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <p className="game-label" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Image size={13}/>提出画像</p>
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
              {(!selectedPost.image_urls || selectedPost.image_urls.length === 0) && !selectedPost.video_url && selectedPost.media_url && (() => {
                const mediaType = detectMediaType(selectedPost.media_url!)
                const embedUrl  = getYoutubeEmbedUrl(selectedPost.media_url!)
                return (
                  <div style={{ marginBottom: 14 }}>
                    <p className="game-label" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Film size={13}/>提出作品</p>
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
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Link2 size={14}/>{selectedPost.media_url}</span>
                      </a>
                    )}
                  </div>
                )
              })()}

              {selectedPost.submission_comment && (
                <div style={{ marginBottom: 14 }}>
                  <p className="game-label" style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}><ClipboardList size={13}/>提出物</p>
                  <p style={textBlockStyle}>{selectedPost.submission_comment}</p>
                </div>
              )}

              {selectedPost.self_evaluation && (
                <div style={{ marginBottom: 14 }}>
                  <p className="game-label" style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}><Star size={13}/>自己評価</p>
                  <p style={textBlockStyle}>{selectedPost.self_evaluation}</p>
                </div>
              )}

              {selectedPost.retrospective && (
                <div style={{ marginBottom: 16 }}>
                  <p className="game-label" style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}><RefreshCw size={13}/>計画の振り返り</p>
                  <p style={textBlockStyle}>{selectedPost.retrospective}</p>
                </div>
              )}

              {/* ── コメントセクション ──────────────────── */}
              <hr style={{ border: 'none', borderTop: '2px dashed #c8e89a', margin: '12px 0' }} />
              <p className="game-label" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><MessageCircle size={13}/>コメント</p>

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
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><User size={12}/>{c.profile?.username ?? '名無し'}</span>
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

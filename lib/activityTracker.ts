import supabase from './supabase'

// ダッシュボード行動トラッキング（モジュールシングルトン）
// - startSession: ダッシュボード表示時に呼ぶ（冪等）
// - track: 操作ごとに経過秒数付きでバッファへ追加
// - 15秒ごとに anon クライアントで activity_events へ flush
// - pagehide / visibilitychange(hidden) 時は sendBeacon で最終送信（「ブラウザを閉じる」含む）
// - 開始から5分（300秒）で自動停止

const MAX_SECONDS = 300
const MAX_EVENTS = 200
const FLUSH_INTERVAL_MS = 15_000

type TrackedEvent = { s: number; label: string }

let sessionId: string | null = null
let startedAtMs = 0
let startedAtIso = ''
let sessionUsername: string | null = null
let accessToken: string | null = null
let buffer: TrackedEvent[] = []
let sentCount = 0
let stopped = false
let flushTimer: ReturnType<typeof setInterval> | null = null
let stopTimer: ReturnType<typeof setTimeout> | null = null
let listenersAttached = false

async function refreshToken() {
  const { data } = await supabase.auth.getSession()
  accessToken = data.session?.access_token ?? accessToken
}

async function flush() {
  if (!sessionId || sentCount >= buffer.length) return
  const pending = buffer.slice(sentCount)
  const rows = pending.map(e => ({
    session_id: sessionId,
    elapsed_seconds: e.s,
    label: e.label,
  }))
  const { error } = await supabase.from('activity_events').insert(rows)
  if (!error) sentCount += pending.length
  refreshToken()
}

function beaconFlush(isClose: boolean) {
  if (!sessionId) return
  if (isClose && !stopped) {
    const s = Math.min(MAX_SECONDS, Math.round((Date.now() - startedAtMs) / 1000))
    buffer.push({ s, label: 'ブラウザを閉じる' })
  }
  if (sentCount >= buffer.length || !accessToken) return
  const pending = buffer.slice(sentCount)
  const payload = JSON.stringify({
    token: accessToken,
    sessionId,
    username: sessionUsername,
    startedAt: startedAtIso,
    events: pending,
  })
  const ok = navigator.sendBeacon('/api/activity/beacon', new Blob([payload], { type: 'text/plain' }))
  if (ok) sentCount = buffer.length
}

function onPagehide() {
  beaconFlush(true)
}

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') beaconFlush(false)
}

function stopTracking() {
  stopped = true
  if (flushTimer) { clearInterval(flushTimer); flushTimer = null }
  if (stopTimer) { clearTimeout(stopTimer); stopTimer = null }
  flush()
}

export function startSession(userId: string, username: string | null) {
  if (sessionId || typeof window === 'undefined') return
  sessionId = crypto.randomUUID()
  startedAtMs = Date.now()
  startedAtIso = new Date(startedAtMs).toISOString()
  sessionUsername = username
  stopped = false

  supabase.from('activity_sessions')
    .insert({ id: sessionId, user_id: userId, username, started_at: startedAtIso })
    .then(() => {})
  refreshToken()

  flushTimer = setInterval(flush, FLUSH_INTERVAL_MS)
  stopTimer = setTimeout(stopTracking, MAX_SECONDS * 1000)

  if (!listenersAttached) {
    window.addEventListener('pagehide', onPagehide)
    document.addEventListener('visibilitychange', onVisibilityChange)
    listenersAttached = true
  }
}

export function track(label: string) {
  if (!sessionId || stopped || buffer.length >= MAX_EVENTS) return
  const s = Math.min(MAX_SECONDS, Math.round((Date.now() - startedAtMs) / 1000))
  buffer.push({ s, label: label.slice(0, 200) })
}

export function stopSession() {
  if (!sessionId) return
  stopTracking()
}

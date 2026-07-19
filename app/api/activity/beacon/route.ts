import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_SECONDS = 300
const MAX_EVENTS = 100
const KEEP_DAYS = 90

export async function POST(req: NextRequest) {
  try {
    // sendBeacon はヘッダーを付けられないため token はボディで受け取る
    const body = JSON.parse(await req.text())
    const { token, sessionId, username, startedAt, events } = body ?? {}

    if (typeof token !== 'string' || typeof sessionId !== 'string' || !UUID_RE.test(sessionId)) {
      return NextResponse.json({ error: 'Bad Request' }, { status: 400 })
    }
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // 既存セッションが別ユーザーのものなら拒否（なりすまし防止）
    const { data: existing } = await supabaseAdmin
      .from('activity_sessions').select('user_id').eq('id', sessionId).maybeSingle()
    if (existing && existing.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // 開いてすぐ閉じたケースでもセッション行が残るよう upsert
    const startedAtDate = startedAt ? new Date(startedAt) : new Date()
    const { error: sessionError } = await supabaseAdmin.from('activity_sessions').upsert({
      id: sessionId,
      user_id: user.id,
      username: typeof username === 'string' ? username.slice(0, 100) : null,
      started_at: isNaN(startedAtDate.getTime()) ? new Date().toISOString() : startedAtDate.toISOString(),
    }, { onConflict: 'id' })
    if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 })

    const rows = (Array.isArray(events) ? events : []).slice(0, MAX_EVENTS)
      .filter((e: unknown): e is { s: unknown; label: unknown } => !!e && typeof e === 'object')
      .map(e => ({
        session_id: sessionId,
        elapsed_seconds: Math.min(MAX_SECONDS, Math.max(0, Math.round(Number(e.s) || 0))),
        label: String(e.label ?? '').slice(0, 200),
      }))
      .filter(r => r.label.length > 0)
    if (rows.length > 0) {
      await supabaseAdmin.from('activity_events').insert(rows)
    }

    // 保持期間を超えた古いログを低頻度で削除
    if (Math.random() < 0.05) {
      try { await supabaseAdmin.rpc('prune_activity_sessions', { keep_days: KEEP_DAYS }) } catch { /* noop */ }
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getAssignmentDeadline(createdAt: string, deadlineAt: string | null): Date {
  if (deadlineAt) return new Date(deadlineAt)
  const created = new Date(createdAt)
  const daysToSunday = created.getDay() === 0 ? 0 : 7 - created.getDay()
  const sunday = new Date(created)
  sunday.setDate(created.getDate() + daysToSunday)
  sunday.setHours(23, 59, 59, 0)
  return sunday
}

function getNextMonday(deadline: Date): string {
  const d = new Date(deadline)
  const daysToMonday = d.getDay() === 0 ? 1 : 8 - d.getDay()
  d.setDate(d.getDate() + daysToMonday)
  return d.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  // Vercel Cron または手動実行（?secret=...）
  const cronSecret = req.headers.get('x-vercel-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // JST の今日の日付
  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const todayStr = nowJST.toISOString().slice(0, 10)

  let autoCreated = 0
  let activated = 0

  // ─── 1. 自動アサイン生成 ───────────────────────────────
  // auto_assign_enabled=true のユーザー
  const { data: autoProfiles } = await supabaseAdmin
    .from('profiles')
    .select('id, course')
    .eq('auto_assign_enabled', true)

  for (const profile of (autoProfiles ?? [])) {
    // そのユーザーに pending の reserved_assignment があるかチェック
    const { count: reservedCount } = await supabaseAdmin
      .from('reserved_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profile.id)
    if ((reservedCount ?? 0) > 0) continue // 予約済みなら自動アサインをスキップ

    // 提出済みアサインの最新を取得
    const { data: submitted } = await supabaseAdmin
      .from('task_assignments')
      .select('id, created_at, deadline_at, task:tasks(id, progress_number, target_course)')
      .eq('user_id', profile.id)
      .eq('is_assigned', true)
      .eq('status', 'submitted')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (!submitted) continue

    const submittedTask = (submitted as unknown as { task: { id: string; progress_number: number | null; target_course: string | null } }).task
    if (submittedTask.progress_number == null) continue

    // 次の課題を progress_number 順で取得（同コース優先、全コース対象も含む）
    const { data: nextTask } = await supabaseAdmin
      .from('tasks')
      .select('id, progress_number, target_course')
      .gt('progress_number', submittedTask.progress_number)
      .or(`target_course.eq.${profile.course},target_course.is.null`)
      .eq('is_active', true)
      .order('progress_number')
      .limit(1)
      .single()
    if (!nextTask) continue

    // activate_at = 現アサインのdeadline翌月曜日
    const deadline = getAssignmentDeadline(
      (submitted as unknown as { created_at: string }).created_at,
      (submitted as unknown as { deadline_at: string | null }).deadline_at
    )
    const activateAt = getNextMonday(deadline)

    // reserved_assignments に INSERT（UNIQUE(user_id, task_id) で重複防止）
    const { error } = await supabaseAdmin
      .from('reserved_assignments')
      .insert({
        user_id: profile.id,
        task_id: nextTask.id,
        trigger_assignment_id: (submitted as unknown as { id: string }).id,
        activate_at: activateAt,
        type: 'auto',
      })
    if (!error) autoCreated++
  }

  // ─── 2. 予約アサイン実行 ───────────────────────────────
  // activate_at <= today の reserved_assignments を取得
  const { data: readyReservations } = await supabaseAdmin
    .from('reserved_assignments')
    .select('id, user_id, task_id, trigger_assignment_id')
    .lte('activate_at', todayStr)

  for (const reservation of (readyReservations ?? [])) {
    // trigger_assignment が submitted かチェック
    if (reservation.trigger_assignment_id) {
      const { data: trigger } = await supabaseAdmin
        .from('task_assignments')
        .select('status')
        .eq('id', reservation.trigger_assignment_id)
        .single()
      if (!trigger || trigger.status !== 'submitted') continue
    }

    // task_assignments に INSERT
    const { error: insertError } = await supabaseAdmin
      .from('task_assignments')
      .insert({
        user_id: reservation.user_id,
        task_id: reservation.task_id,
        is_assigned: true,
        status: 'assigned',
      })
    if (insertError) continue // unique constraint violation などはスキップ

    // reserved_assignments から DELETE
    await supabaseAdmin.from('reserved_assignments').delete().eq('id', reservation.id)
    activated++
  }

  return NextResponse.json({ ok: true, autoCreated, activated })
}

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
  const { data: autoProfiles } = await supabaseAdmin
    .from('profiles')
    .select('id, course')
    .eq('auto_assign_enabled', true)

  for (const profile of (autoProfiles ?? [])) {
    const { count: reservedCount } = await supabaseAdmin
      .from('reserved_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profile.id)
    if ((reservedCount ?? 0) > 0) continue

    const { data: submitted } = await supabaseAdmin
      .from('task_assignments')
      .select('id, created_at, deadline_at, task:tasks(id, progress_number, target_course, deadline_days)')
      .eq('user_id', profile.id)
      .eq('is_assigned', true)
      .eq('status', 'submitted')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (!submitted) continue

    const submittedTask = (submitted as unknown as { task: { id: string; progress_number: number | null; target_course: string | null; deadline_days: number } }).task
    if (submittedTask.progress_number == null) continue

    const { data: nextTask } = await supabaseAdmin
      .from('tasks')
      .select('id, progress_number, target_course, deadline_days')
      .gt('progress_number', submittedTask.progress_number)
      .or(`target_course.eq.${profile.course},target_course.is.null`)
      .eq('is_active', true)
      .order('progress_number')
      .limit(1)
      .single()
    if (!nextTask) continue

    // activate_at = 今日 + 提出済み課題の deadline_days + 7日猶予
    const submittedDeadlineDays = submittedTask.deadline_days ?? 7
    const activateDateObj = new Date(nowJST)
    activateDateObj.setDate(activateDateObj.getDate() + submittedDeadlineDays + 7)
    const activateAt = activateDateObj.toISOString().slice(0, 10)

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
  // activate_at によるフィルターを外し、ループ内で二重条件チェック
  const { data: readyReservations } = await supabaseAdmin
    .from('reserved_assignments')
    .select('id, user_id, task_id, trigger_assignment_id, activate_at, task:tasks(deadline_days)')

  for (const reservation of (readyReservations ?? [])) {
    const activatePassed = reservation.activate_at <= todayStr
    let triggerEarly = false

    if (reservation.trigger_assignment_id) {
      const { data: trigger } = await supabaseAdmin
        .from('task_assignments')
        .select('status, submitted_at')
        .eq('id', reservation.trigger_assignment_id)
        .single()
      if (!trigger || trigger.status !== 'submitted') continue

      // 提出から7日経過していれば早期アクティベート
      if (trigger.submitted_at) {
        const earlyDate = new Date(trigger.submitted_at)
        earlyDate.setDate(earlyDate.getDate() + 7)
        triggerEarly = earlyDate.toISOString().slice(0, 10) <= todayStr
      }
    }

    if (!activatePassed && !triggerEarly) continue

    // 新しい課題の締切 = activate_at + task.deadline_days
    const taskDeadlineDays = (reservation as unknown as { task: { deadline_days: number } | null }).task?.deadline_days ?? 7
    const activateBase = new Date(reservation.activate_at + 'T00:00:00Z')
    activateBase.setUTCDate(activateBase.getUTCDate() + taskDeadlineDays)

    const { error: insertError } = await supabaseAdmin
      .from('task_assignments')
      .insert({
        user_id: reservation.user_id,
        task_id: reservation.task_id,
        is_assigned: true,
        status: 'assigned',
        deadline_at: activateBase.toISOString(),
      })
    if (insertError) continue

    await supabaseAdmin.from('reserved_assignments').delete().eq('id', reservation.id)
    activated++
  }

  return NextResponse.json({ ok: true, autoCreated, activated })
}

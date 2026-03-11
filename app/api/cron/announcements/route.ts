import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPushNotification } from '../../../../lib/webpush'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  // Cron 認証（Vercel は x-vercel-cron-secret を自動付与、それ以外は x-cron-secret）
  const cronSecret =
    req.headers.get('x-vercel-cron-secret') ??
    req.headers.get('x-cron-secret') ??
    req.nextUrl.searchParams.get('secret')
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  // Vercel は UTC で動作するため JST（UTC+9）に変換して比較
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const dayOfWeek = jst.getUTCDay()
  const nowMinutes = jst.getUTCHours() * 60 + jst.getUTCMinutes()

  // 定期通知：今日の曜日かつ時刻が±2分以内、かつ last_sent_at が 23 時間以上前
  const { data: recurringAnns } = await supabaseAdmin
    .from('announcements')
    .select('*')
    .eq('type', 'recurring')
    .eq('is_active', true)
    .eq('day_of_week', dayOfWeek)

  const matchingRecurring = (recurringAnns ?? []).filter(ann => {
    const timeStr = ann.time_of_day?.slice(0, 5)
    if (!timeStr) return false
    const [h, m] = timeStr.split(':').map(Number)
    const annMinutes = h * 60 + m
    if (Math.abs(annMinutes - nowMinutes) > 2) return false
    if (ann.last_sent_at) {
      const hoursSince = (now.getTime() - new Date(ann.last_sent_at).getTime()) / 3_600_000
      if (hoursSince < 23) return false
    }
    return true
  })

  // 予約/個人/リンク通知：scheduled_at が過去かつ未送信
  const { data: scheduledAnns } = await supabaseAdmin
    .from('announcements')
    .select('*')
    .in('type', ['scheduled', 'personal', 'link'])
    .is('sent_at', null)
    .lte('scheduled_at', now.toISOString())

  const allAnns = [...matchingRecurring, ...(scheduledAnns ?? [])]

  let totalSent = 0
  for (const ann of allAnns) {
    let subsQuery = supabaseAdmin.from('push_subscriptions').select('*')
    if (ann.type === 'personal' && ann.target_user_ids?.length > 0) {
      subsQuery = subsQuery.in('user_id', ann.target_user_ids)
    }
    const { data: subs } = await subsQuery

    const payload = { title: ann.title, body: ann.body, url: ann.url ?? '/dashboard' }
    const goneEndpoints: string[] = []

    await Promise.all((subs ?? []).map(async (sub: { endpoint: string; p256dh: string; auth: string }) => {
      const result = await sendPushNotification(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload
      )
      if (result.gone) goneEndpoints.push(sub.endpoint)
    }))

    if (goneEndpoints.length > 0) {
      await supabaseAdmin.from('push_subscriptions').delete().in('endpoint', goneEndpoints)
    }

    const updateData = ann.type === 'recurring'
      ? { last_sent_at: now.toISOString() }
      : { sent_at: now.toISOString() }
    await supabaseAdmin.from('announcements').update(updateData).eq('id', ann.id)

    totalSent += (subs?.length ?? 0) - goneEndpoints.length
  }

  // X投稿予約通知チェック（scheduled_at が現在時刻以前かつ未通知）
  const { data: scheduledXPosts } = await supabaseAdmin
    .from('x_posts')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now.toISOString())

  let xNotified = 0
  for (const post of scheduledXPosts ?? []) {
    let subsQuery = supabaseAdmin.from('push_subscriptions').select('*')
    if (post.notify_user_ids?.length > 0) {
      subsQuery = subsQuery.in('user_id', post.notify_user_ids)
    }
    const { data: xSubs } = await subsQuery

    const shortBody = post.content.slice(0, 60) + (post.content.length > 60 ? '…' : '')
    const xPayload = {
      title: '📣 X投稿の時間です！',
      body: shortBody,
      url: '/admin/x-posts',
    }
    const goneXEndpoints: string[] = []

    await Promise.all((xSubs ?? []).map(async (sub: { endpoint: string; p256dh: string; auth: string }) => {
      const result = await sendPushNotification(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        xPayload
      )
      if (result.gone) goneXEndpoints.push(sub.endpoint)
    }))

    if (goneXEndpoints.length > 0) {
      await supabaseAdmin.from('push_subscriptions').delete().in('endpoint', goneXEndpoints)
    }

    await supabaseAdmin.from('x_posts').update({
      status: 'notified',
      notified_at: now.toISOString(),
    }).eq('id', post.id)

    xNotified += (xSubs?.length ?? 0) - goneXEndpoints.length
  }

  return NextResponse.json({
    ok: true,
    processed: allAnns.length,
    sent: totalSent,
    xPostsNotified: scheduledXPosts?.length ?? 0,
    xSubscribersSent: xNotified,
  })
}

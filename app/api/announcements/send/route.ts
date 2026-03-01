import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPushNotification } from '../../../../lib/webpush'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  // 認証チェック
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 権限チェック（admin or announcement_management）
  const { data: profile } = await supabaseAdmin
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') {
    const { data: ppData } = await supabaseAdmin
      .from('profile_positions')
      .select('positions(permissions)')
      .eq('profile_id', user.id)
    const hasPermission = (ppData ?? []).some(pp => {
      const perms = (pp as { positions: { permissions: Record<string, boolean> } | null }).positions?.permissions ?? {}
      return perms['announcement_management'] === true
    })
    if (!hasPermission) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { announcementId } = await req.json()

  // アナウンス取得
  const { data: ann, error: annError } = await supabaseAdmin
    .from('announcements').select('*').eq('id', announcementId).single()
  if (annError || !ann) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })

  // サブスクリプション取得
  let subsQuery = supabaseAdmin.from('push_subscriptions').select('*')
  if (ann.type === 'personal' && ann.target_user_ids?.length > 0) {
    subsQuery = subsQuery.in('user_id', ann.target_user_ids)
  }
  const { data: subs } = await subsQuery

  const payload = {
    title: ann.title,
    body:  ann.body,
    url:   ann.url ?? '/dashboard',
  }

  const goneEndpoints: string[] = []
  await Promise.all((subs ?? []).map(async (sub: { endpoint: string; p256dh: string; auth: string }) => {
    const result = await sendPushNotification(
      { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      payload
    )
    if (result.gone) goneEndpoints.push(sub.endpoint)
  }))

  // 無効なサブスクリプションを削除
  if (goneEndpoints.length > 0) {
    await supabaseAdmin.from('push_subscriptions').delete().in('endpoint', goneEndpoints)
  }

  // 送信記録を更新
  const updateData = ann.type === 'recurring'
    ? { last_sent_at: new Date().toISOString() }
    : { sent_at: new Date().toISOString() }
  await supabaseAdmin.from('announcements').update(updateData).eq('id', announcementId)

  const sent = (subs?.length ?? 0) - goneEndpoints.length
  return NextResponse.json({ ok: true, sent })
}

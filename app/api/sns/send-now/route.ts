import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPushNotification } from '../../../../lib/webpush'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabaseAdmin
      .from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') {
      const { data: ppData } = await supabaseAdmin
        .from('profile_positions')
        .select('positions(permissions)')
        .eq('profile_id', user.id)
      const hasPermission = (ppData ?? []).some(pp => {
        const pos = (pp as unknown as { positions: { permissions: Record<string, boolean> } | { permissions: Record<string, boolean> }[] | null }).positions
        const perms = (Array.isArray(pos) ? pos[0]?.permissions : pos?.permissions) ?? {}
        return perms['sns_management'] === true
      })
      if (!hasPermission) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { postId } = await req.json()

    const { data: post, error: postError } = await supabaseAdmin
      .from('sns_posts').select('*').eq('id', postId).single()
    if (postError || !post) return NextResponse.json({ error: '投稿が見つかりません' }, { status: 404 })

    const { data: recipients } = await supabaseAdmin
      .from('sns_notification_recipients')
      .select('user_id')

    const recipientIds = (recipients ?? []).map((r: { user_id: string }) => r.user_id)
    if (recipientIds.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, total: 0 })
    }

    const { data: subs } = await supabaseAdmin
      .from('push_subscriptions')
      .select('*')
      .in('user_id', recipientIds)

    const preview = post.content.length > 60 ? post.content.slice(0, 60) + '…' : post.content
    const payload = {
      title: '📢 SNS投稿のお知らせ',
      body: preview,
      url: `/admin/sns/copy?id=${post.id}`,
    }

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

    await supabaseAdmin
      .from('sns_posts')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', postId)

    const sent = (subs?.length ?? 0) - goneEndpoints.length
    return NextResponse.json({ ok: true, sent, total: subs?.length ?? 0 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: '内部エラー', detail: msg }, { status: 500 })
  }
}

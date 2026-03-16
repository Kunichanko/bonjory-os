import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPushNotification } from '../../../../lib/webpush'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
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
        const pos = (pp as unknown as { positions: { permissions: Record<string, boolean> } | { permissions: Record<string, boolean> }[] | null }).positions
        const perms = (Array.isArray(pos) ? pos[0]?.permissions : pos?.permissions) ?? {}
        return perms['announcement_management'] === true
      })
      if (!hasPermission) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { announcementId } = await req.json()

    // アナウンス取得
    const { data: ann, error: annError } = await supabaseAdmin
      .from('announcements').select('*').eq('id', announcementId).single()
    if (annError || !ann) return NextResponse.json({ error: 'Announcement not found', detail: annError?.message }, { status: 404 })

    // サブスクリプション取得
    let subsQuery = supabaseAdmin.from('push_subscriptions').select('*')
    if (ann.type === 'personal' && ann.target_user_ids?.length > 0) {
      subsQuery = subsQuery.in('user_id', ann.target_user_ids)
    }
    const { data: subs, error: subsError } = await subsQuery
    if (subsError) return NextResponse.json({ error: 'push_subscriptions の取得に失敗', detail: subsError.message }, { status: 500 })

    const payload = {
      title: ann.title,
      body:  ann.body,
      url:   ann.url ?? '/dashboard',
    }

    const goneEndpoints: string[] = []
    const pushErrors: string[] = []
    await Promise.all((subs ?? []).map(async (sub: { endpoint: string; p256dh: string; auth: string }) => {
      try {
        const result = await sendPushNotification(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          payload
        )
        if (result.gone) goneEndpoints.push(sub.endpoint)
      } catch (e) {
        pushErrors.push(String(e))
      }
    }))

    // 無効なサブスクリプションを削除
    if (goneEndpoints.length > 0) {
      await supabaseAdmin.from('push_subscriptions').delete().in('endpoint', goneEndpoints)
    }

    // 送信記録を更新
    const updateData = (ann.type === 'recurring' || ann.type === 'immediate')
      ? { last_sent_at: new Date().toISOString() }
      : { sent_at: new Date().toISOString() }
    await supabaseAdmin.from('announcements').update(updateData).eq('id', announcementId)

    // 通知ログを挿入（テーブル未作成の場合も送信自体は成功扱い）
    try {
      const { data: allProfiles } = await supabaseAdmin.from('profiles').select('id')
      const targetIds: string[] = ann.type === 'personal' && ann.target_user_ids?.length
        ? ann.target_user_ids
        : (allProfiles ?? []).map((p: { id: string }) => p.id)
      if (targetIds.length > 0) {
        const { error: logErr } = await supabaseAdmin.from('notification_logs').insert(
          targetIds.map((uid: string) => ({
            user_id: uid,
            announcement_id: ann.id,
            title: ann.title,
            body: ann.body,
            url: ann.url ?? null,
          }))
        )
        if (logErr) console.warn('[notification_logs insert]', logErr.message)
      }
    } catch (logEx) {
      console.warn('[notification_logs]', logEx)
    }

    const sent = (subs?.length ?? 0) - goneEndpoints.length
    return NextResponse.json({
      ok: true,
      sent,
      total: subs?.length ?? 0,
      gone: goneEndpoints.length,
      pushErrors: pushErrors.length > 0 ? pushErrors : undefined,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[/api/announcements/send]', msg)
    return NextResponse.json({ error: '内部エラー', detail: msg }, { status: 500 })
  }
}

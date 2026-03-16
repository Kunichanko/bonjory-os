import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function DELETE(req: NextRequest) {
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

  const { targetUserId } = await req.json()
  if (!targetUserId) return NextResponse.json({ error: 'targetUserId required' }, { status: 400 })

  // push_subscriptions を全削除
  const { error: subErr } = await supabaseAdmin
    .from('push_subscriptions')
    .delete()
    .eq('user_id', targetUserId)

  if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 })

  // notification_logs を全削除（ハードデリート）
  const { error: logErr } = await supabaseAdmin
    .from('notification_logs')
    .delete()
    .eq('user_id', targetUserId)

  if (logErr) return NextResponse.json({ error: logErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

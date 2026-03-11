import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getEffectivePermissions } from '../../../../lib/permissions'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !authData?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const uid = authData.user.id
  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', uid).single()
  const isAdmin = profile?.role === 'admin'

  if (!isAdmin) {
    const perms = await getEffectivePermissions(uid)
    if (!perms.x_post_management) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const body = await req.json()
  const { id, content, media_urls, scheduled_at, notify_user_ids } = body

  if (!content?.trim()) return NextResponse.json({ error: 'content is required' }, { status: 400 })

  const status = scheduled_at ? 'scheduled' : 'draft'

  if (id) {
    // 既存レコードの更新
    const { data, error } = await supabaseAdmin
      .from('x_posts')
      .update({
        content: content.trim(),
        media_urls: media_urls ?? [],
        status,
        scheduled_at: scheduled_at ? new Date(scheduled_at).toISOString() : null,
        notify_user_ids: notify_user_ids ?? [],
      })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ post: data })
  } else {
    // 新規作成
    const { data, error } = await supabaseAdmin
      .from('x_posts')
      .insert({
        content: content.trim(),
        media_urls: media_urls ?? [],
        status,
        scheduled_at: scheduled_at ? new Date(scheduled_at).toISOString() : null,
        notify_user_ids: notify_user_ids ?? [],
        created_by: uid,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ post: data })
  }
}

export async function DELETE(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !authData?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const uid = authData.user.id
  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', uid).single()
  const isAdmin = profile?.role === 'admin'

  if (!isAdmin) {
    const perms = await getEffectivePermissions(uid)
    if (!perms.x_post_management) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { error } = await supabaseAdmin.from('x_posts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

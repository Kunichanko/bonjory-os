import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getEffectivePermissions } from '../../../../lib/permissions'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/quicktime',
]
const MAX_IMAGE_SIZE = 5 * 1024 * 1024   // 5MB
const MAX_VIDEO_SIZE = 15 * 1024 * 1024  // 15MB

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

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const mimeType = file.type
  if (!ALLOWED_TYPES.includes(mimeType)) {
    return NextResponse.json({ error: `Unsupported file type: ${mimeType}` }, { status: 400 })
  }

  const isVideo = mimeType.startsWith('video/')
  const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE
  if (file.size > maxSize) {
    return NextResponse.json({
      error: `File too large. Max: ${isVideo ? '15MB' : '5MB'}`,
    }, { status: 400 })
  }

  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const { error: uploadError } = await supabaseAdmin.storage
    .from('x-post-media')
    .upload(path, buffer, { contentType: mimeType, upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: urlData } = supabaseAdmin.storage.from('x-post-media').getPublicUrl(path)

  return NextResponse.json({ url: urlData.publicUrl, mimeType, path })
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

  const { path } = await req.json()
  if (!path) return NextResponse.json({ error: 'path is required' }, { status: 400 })

  const { error } = await supabaseAdmin.storage.from('x-post-media').remove([path])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

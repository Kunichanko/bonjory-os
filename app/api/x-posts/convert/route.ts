import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from '@google/generative-ai'
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

  const { text } = await req.json()
  if (!text?.trim()) return NextResponse.json({ error: 'text is required' }, { status: 400 })

  // Geminiプロンプトをx_post_settingsから取得
  const { data: settings } = await supabaseAdmin
    .from('x_post_settings')
    .select('system_prompt')
    .eq('id', 1)
    .single()

  const systemPrompt = settings?.system_prompt ??
    'あなたはBONJORY公式Xアカウントの投稿担当です。以下の文章をBONJORYらしい口調（元気で親しみやすく、絵文字を多用）に変換してください。280文字以内にまとめてください。'

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
  const result = await model.generateContent(`${systemPrompt}\n\n${text}`)
  const converted = result.response.text().trim()

  return NextResponse.json({ converted })
}

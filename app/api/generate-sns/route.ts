import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']

async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.85, maxOutputTokens: 1024 },
  })
  const errors: string[] = []
  for (const model of MODELS) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
    )
    if (res.ok) {
      const data = await res.json()
      return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    }
    const errText = await res.text()
    errors.push(`[${model}] ${res.status}: ${errText}`)
  }
  throw new Error(`Gemini API エラー（全モデル失敗）:\n${errors.join('\n')}`)
}

export async function POST(req: NextRequest) {
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

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません' }, { status: 500 })
  }

  const { input, samples } = await req.json() as { input: string; samples: string[] }
  if (!input?.trim()) return NextResponse.json({ error: '入力が空です' }, { status: 400 })

  const samplesText = (samples ?? [])
    .map((s, i) => `【例${i + 1}】\n${s}`)
    .join('\n\n')

  const prompt = `あなたはSNS投稿の文体変換アシスタントです。
以下のサンプル投稿を参考に、同じ文体・トーン・絵文字の使い方・ハッシュタグのスタイル・文字数を意識して、
指定された内容を魅力的なX（旧Twitter）投稿に変換してください。

【サンプル投稿】
${samplesText}

【変換したい内容】
${input.trim()}

変換後の投稿文のみを返してください。説明や前置きは不要です。`

  try {
    const result = await callGemini(apiKey, prompt)
    return NextResponse.json({ text: result.trim() })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

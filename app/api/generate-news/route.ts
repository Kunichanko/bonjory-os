import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']

function fixJsonNewlines(s: string): string {
  let result = ''
  let inString = false
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (inString) {
      if (ch === '\\') { result += ch + (s[i + 1] ?? ''); i += 2; continue }
      if (ch === '"') inString = false
      else if (ch === '\n') { result += '\\n'; i++; continue }
      else if (ch === '\r') { i++; continue }
    } else {
      if (ch === '"') inString = true
    }
    result += ch; i++
  }
  return result
}

async function callGemini(apiKey: string, prompt: string, maxTokens = 2000): Promise<string> {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.8, maxOutputTokens: maxTokens },
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
  // 認証チェック
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 権限チェック（admin or news_management）
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
      return perms['news_management'] === true
    })
    if (!hasPermission) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません' }, { status: 500 })
  }

  const { mode, searchTerm, title, input, prompt, maxTokens, tasks, course, stage } = await req.json()
  const tokens = Math.min(Math.max(Number(maxTokens) || 2000, 500), 8000)

  try {
    if (mode === 'research') {
      const keyword = (searchTerm ?? '').trim() || '最新技術トレンド'
      const p = `検索キーワード「${keyword}」に関連する、ゲーム開発・Web開発・3DCG・AIワークフロー等の最新トレンドに関するゲーム部の部員向けニュース記事のタイトル候補を5つ考えてください。
必ず以下のJSON配列のみを返してください（前後に余分なテキスト・コードブロック不可）：
["タイトル1", "タイトル2", "タイトル3", "タイトル4", "タイトル5"]`
      const raw = await callGemini(apiKey, p, 1024)
      const stripped = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim()
      let candidates: string[]
      try {
        candidates = JSON.parse(fixJsonNewlines(stripped)) as string[]
      } catch {
        // 部分的な配列からタイトルを抽出するフォールバック
        const matches = stripped.match(/"([^"]+)"/g)
        if (!matches || matches.length === 0) throw new Error(`JSON パース失敗: ${stripped.slice(0, 200)}`)
        candidates = matches.map(m => m.replace(/"/g, ''))
      }
      return NextResponse.json({ candidates })
    }

    if (mode === 'detail') {
      const p = `タイトル「${title}」について、ゲーム部の部員向けに詳しい解説記事を執筆してください。
プレーンテキスト（改行のみ、Markdown記法なし）で返してください。`
      const text = await callGemini(apiKey, p, tokens)
      return NextResponse.json({ text: text.trim() })
    }

    if (mode === 'task') {
      const courseLabel = (course as string) || '全コース'
      const stageLabel  = (stage as string)  || '全ステージ'
      const taskList = ((tasks ?? []) as { title: string; description: string | null }[])
        .map((t, i) => `【課題${i + 1}】${t.title}\n${t.description ?? '（説明なし）'}`)
        .join('\n\n')
      const p = `${courseLabel}の${stageLabel}向け課題をもとに、その学習内容に関連するニュース記事を執筆してください。

【参考課題】
${taskList}

ゲーム部の部員が読むことを想定し、課題との関連性を交えた記事を書いてください。
プレーンテキスト（改行のみ、Markdown記法なし）で返してください。`
      const text = await callGemini(apiKey, p, tokens)
      return NextResponse.json({ text: text.trim() })
    }

    if (mode === 'refine') {
      const p = `以下の文章を、指示に従って修正してください。

【文章】
${input}

【修正指示】
${prompt}

修正後の文章のみを返してください。`
      const text = await callGemini(apiKey, p, tokens)
      return NextResponse.json({ text: text.trim() })
    }

    if (mode === 'markdown') {
      const p = `以下の文章を、見出し（##, ###）・箇条書き（-）・コードブロック（\`\`\`）等を使った適切なMarkdown形式に整形してください。
整形後のMarkdownのみを返してください。

${input}`
      const text = await callGemini(apiKey, p, tokens)
      return NextResponse.json({ text: text.trim() })
    }

    return NextResponse.json({ error: '不明なmode' }, { status: 400 })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

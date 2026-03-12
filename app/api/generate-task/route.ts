import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const COURSE_LABELS: Record<string, string> = {
  '': '全コース',
  'Unity': 'Unityコース',
  'Blender': 'Blenderコース',
  'Web': 'Web開発コース',
}
const STAGE_LABELS: Record<string, string> = {
  '': '全ステージ',
  'Foundation': '基礎(Foundation)',
  'Development': '応用(Development)',
  'Production': '実践(Production)',
}

function buildPrompt(
  course: string,
  stage: string,
  theme: string,
  generationType: string,
  inputTasks: Array<{ title: string; description: string | null }>,
  useMarkdown: boolean,
): string {
  const courseLabel = COURSE_LABELS[course] ?? course
  const stageLabel  = STAGE_LABELS[stage]  ?? stage
  const mdNote = useMarkdown
    ? '説明はMarkdown形式（見出し・箇条書きなど）で記述してください。'
    : '説明はプレーンテキストで記述してください。'

  const formatInstruction = `
必ず以下のJSONのみを返してください（前後に余分なテキスト・コードブロック不可）：
{"title": "課題タイトル（簡潔に）", "description": "課題の詳細説明"}
${mdNote}`

  if (generationType === 'custom') {
    return `${theme}\n${formatInstruction}`
  }

  const taskList = inputTasks.length > 0
    ? inputTasks.map((t, i) =>
        `【課題${i + 1}】${t.title}\n${t.description ?? '（説明なし）'}`
      ).join('\n\n')
    : null

  if (generationType === 'sequential') {
    const context = taskList
      ? `以下の過去課題を参考にしてください：\n\n${taskList}\n\n`
      : ''
    return `${context}${courseLabel}の${stageLabel}向けに、テーマ「${theme}」を踏まえた次のステップとなる課題を1件生成してください。\n${formatInstruction}`
  }

  if (generationType === 'event') {
    const context = taskList ? `参考課題：\n${taskList}\n\n` : ''
    return `${context}${courseLabel}の${stageLabel}向けに、テーマ「${theme}」に関する短くシンプルなイベント課題（1〜2時間程度で完了できる）を1件生成してください。\n${formatInstruction}`
  }

  // individual (default)
  const context = taskList ? `参考課題：\n${taskList}\n\n` : ''
  return `${context}${courseLabel}の${stageLabel}向けに、テーマ「${theme}」に関する課題を1件生成してください。\n${formatInstruction}`
}

export async function POST(req: NextRequest) {
  // 認証チェック
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 権限チェック（admin or task_management）
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
      return perms['task_management'] === true
    })
    if (!hasPermission) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { course, stage, theme, generationType, inputTasks, useMarkdown } = await req.json()

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません' }, { status: 500 })
  }

  const prompt = buildPrompt(course, stage, theme, generationType, inputTasks ?? [], useMarkdown)

  const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
  })

  let rawText = ''
  const errors: string[] = []
  let succeeded = false
  for (const model of MODELS) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
    )
    if (res.ok) {
      const data = await res.json()
      rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      succeeded = true
      break
    }
    const errText = await res.text()
    errors.push(`[${model}] ${res.status}: ${errText}`)
  }

  if (!succeeded) {
    return NextResponse.json({ error: `Gemini API エラー（全モデル失敗）:\n${errors.join('\n')}` }, { status: 500 })
  }

  // ```json ... ``` ブロックをストリップ
  const stripped = rawText.replace(/```json\s*/gi, '').replace(/```/g, '').trim()

  // JSON文字列内の生改行・CR を \n エスケープに変換
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

  const cleaned = fixJsonNewlines(stripped)

  let parsed: { title: string; description: string }
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return NextResponse.json(
      { error: `生成結果のパースに失敗しました。\n\nGemini の出力:\n${rawText}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ title: parsed.title, description: parsed.description })
}

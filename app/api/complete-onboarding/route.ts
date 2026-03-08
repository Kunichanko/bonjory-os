import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { course } = await req.json()
  if (!course) return NextResponse.json({ error: 'course is required' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('profiles')
    .upsert({ id: user.id, course, stage: 'Foundation' }, { onConflict: 'id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 初期課題を自動割り当て
  const { data: initialTask } = await supabaseAdmin
    .from('course_initial_tasks')
    .select('task_id')
    .eq('course', course)
    .single()

  if (initialTask?.task_id) {
    await supabaseAdmin.from('task_assignments').insert({
      user_id: user.id,
      task_id: initialTask.task_id,
      status: 'assigned',
      is_assigned: true,
    })
  }

  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !userData?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = userData.user.id

  const { taskId } = await req.json()
  if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 })

  // タスクの存在確認
  const { data: task, error: taskErr } = await supabaseAdmin
    .from('tasks')
    .select('id, title')
    .eq('id', taskId)
    .single()
  if (taskErr || !task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  // upsert task_assignments
  const { error: upsertErr } = await supabaseAdmin
    .from('task_assignments')
    .upsert(
      { user_id: userId, task_id: taskId, is_assigned: true, status: 'assigned' },
      { onConflict: 'user_id,task_id' }
    )
  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  return NextResponse.json({ success: true, title: task.title })
}

export async function DELETE(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !userData?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = userData.user.id

  const { taskId } = await req.json()
  if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('task_assignments')
    .update({ is_assigned: false })
    .match({ user_id: userId, task_id: taskId })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

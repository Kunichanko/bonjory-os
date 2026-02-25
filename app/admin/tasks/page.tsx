"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../../lib/supabase'
import { getEffectivePermissions } from '../../../lib/permissions'

interface Task {
  id: string
  title: string
  description: string | null
  target_course: string | null
  target_stage: string | null
  is_active: boolean
  created_at: string
}

const COURSE_OPTIONS = [
  { label: '全コース', value: '' },
  { label: 'Unityコース', value: 'Unity' },
  { label: 'Blenderコース', value: 'Blender' },
]

const STAGE_OPTIONS = [
  { label: '全ステージ', value: '' },
  { label: 'Ⅰ. 基礎 (Foundation)', value: 'Foundation' },
  { label: 'Ⅱ. 応用 (Development)', value: 'Development' },
  { label: 'Ⅲ. 実践 (Production)', value: 'Production' },
]

export default function AdminTasksPage() {
  const router = useRouter()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [title, setTitle]               = useState('')
  const [description, setDescription]   = useState('')
  const [targetCourse, setTargetCourse] = useState('')
  const [targetStage, setTargetStage]   = useState('')

  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser()
        if (authError || !authData?.user) { router.replace('/login'); return }

        const { data: me, error: meError } = await supabase
          .from('profiles').select('role').eq('id', authData.user.id).single()
        if (meError || !me) { router.replace('/dashboard'); return }
        if (me.role !== 'admin') {
          const perms = await getEffectivePermissions(authData.user.id)
          if (!perms.task_management) { router.replace('/dashboard'); return }
        }

        const { data: taskList, error: listError } = await supabase
          .from('tasks')
          .select('id, title, description, target_course, target_stage, is_active, created_at')
          .order('created_at', { ascending: false })
        if (listError) throw listError
        if (mounted) setTasks(taskList ?? [])
      } catch (err: any) {
        console.error(err)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    init()
    return () => { mounted = false }
  }, [router])

  async function handleCreate(e: { preventDefault(): void }) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setSubmitting(true)

    const { data: authData } = await supabase.auth.getUser()

    const { data: newTask, error: insertError } = await supabase
      .from('tasks')
      .insert({
        title,
        description: description || null,
        target_course: targetCourse || null,
        target_stage: targetStage || null,
        created_by: authData?.user?.id,
        is_active: true,
      })
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
    } else {
      setTasks(prev => [newTask, ...prev])
      setTitle('')
      setDescription('')
      setTargetCourse('')
      setTargetStage('')
      setSuccess('課題を作成しました！')
    }
    setSubmitting(false)
  }

  async function toggleActive(taskId: string, current: boolean) {
    const { error } = await supabase
      .from('tasks')
      .update({ is_active: !current })
      .eq('id', taskId)

    if (!error) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, is_active: !current } : t))
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'white', fontSize: 24, fontWeight: 'bold' }}>Loading...</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', padding: '32px 24px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>

        {/* ヘッダー */}
        <div className="game-card" style={{ padding: '24px 32px', marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 className="game-title" style={{ fontSize: 32 }}>課題管理</h1>
              <p style={{ color: '#3d6e00', marginTop: 4, fontSize: 14 }}>
                課題数: {tasks.length} 件
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <a href="/admin">
                <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15 }}>
                  部員管理
                </button>
              </a>
              <a href="/admin/submissions">
                <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15 }}>
                  提出状況
                </button>
              </a>
              <a href="/admin/points">
                <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15 }}>
                  ポイント設定
                </button>
              </a>
              <button
                className="game-button"
                style={{ width: 'auto', padding: '8px 20px', fontSize: 15, background: '#888', borderColor: '#555' }}
                onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
              >
                ログアウト
              </button>
            </div>
          </div>
        </div>

        {/* 課題作成フォーム */}
        <div className="game-card" style={{ padding: '28px 32px', marginBottom: 24 }}>
          <h2 className="game-title" style={{ fontSize: 22, marginBottom: 20 }}>新しい課題を作成</h2>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="game-label">課題タイトル *</label>
              <input
                className="game-input"
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                required
                placeholder="例：キャラクターモデルを1体完成させよう"
              />
            </div>

            <div>
              <label className="game-label">課題の説明</label>
              <textarea
                className="game-input"
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={4}
                placeholder="課題の詳細・参考資料・提出条件などを記入..."
                style={{ resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <label className="game-label">対象コース</label>
                <select
                  className="game-input"
                  value={targetCourse}
                  onChange={e => setTargetCourse(e.target.value)}
                >
                  {COURSE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label className="game-label">対象ステージ</label>
                <select
                  className="game-input"
                  value={targetStage}
                  onChange={e => setTargetStage(e.target.value)}
                >
                  {STAGE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <button className="game-button" type="submit" disabled={submitting} style={{ marginTop: 4 }}>
              {submitting ? '作成中…' : '課題を作成'}
            </button>

            {error   && <div className="game-error">{error}</div>}
            {success && <div className="game-success">{success}</div>}
          </form>
        </div>

        {/* 課題一覧 */}
        <div className="game-card" style={{ padding: '24px 28px' }}>
          <h2 className="game-title" style={{ fontSize: 22, marginBottom: 20 }}>課題一覧</h2>
          {tasks.length === 0 ? (
            <p style={{ color: '#6aac14', textAlign: 'center', padding: 24 }}>まだ課題がありません</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {tasks.map(task => (
                <div
                  key={task.id}
                  style={{
                    border: `3px solid ${task.is_active ? '#6aac14' : '#ccc'}`,
                    borderRadius: 12,
                    padding: '16px 20px',
                    background: task.is_active ? '#f8fff0' : '#f5f5f5',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: 'bold', color: '#2d5500', fontSize: 16, marginBottom: 4 }}>
                        {task.title}
                      </p>
                      {task.description && (
                        <p style={{ color: '#3d6e00', fontSize: 14, marginBottom: 8 }}>{task.description}</p>
                      )}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{
                          background: '#6aac14', color: 'white',
                          borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 'bold',
                        }}>
                          {task.target_course ?? '全コース'}
                        </span>
                        <span style={{
                          background: '#3d6e00', color: 'white',
                          borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 'bold',
                        }}>
                          {task.target_stage ?? '全ステージ'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleActive(task.id, task.is_active)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 8,
                        border: `2px solid ${task.is_active ? '#c0392b' : '#6aac14'}`,
                        background: task.is_active ? '#fdecea' : '#e8ffd4',
                        color: task.is_active ? '#c0392b' : '#1a6e00',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        fontSize: 13,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {task.is_active ? '停止する' : '有効にする'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

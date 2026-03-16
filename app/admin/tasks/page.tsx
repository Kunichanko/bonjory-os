"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { marked } from 'marked'
import supabase from '../../../lib/supabase'
import { getEffectivePermissions, PermissionKey } from '../../../lib/permissions'

interface Task {
  id: string
  title: string
  description: string | null
  description_is_markdown: boolean
  target_course: string | null
  target_stage: string | null
  is_active: boolean
  created_at: string
  progress_number: number | null
  allow_image_attachment: boolean
}

const COURSE_OPTIONS = [
  { label: '全コース', value: '' },
  { label: 'Unityコース', value: 'Unity' },
  { label: 'Blenderコース', value: 'Blender' },
  { label: 'Web開発コース', value: 'Web' },
]

const STAGE_OPTIONS = [
  { label: '全ステージ', value: '' },
  { label: 'Ⅰ. 基礎 (Foundation)', value: 'Foundation' },
  { label: 'Ⅱ. 応用 (Development)', value: 'Development' },
  { label: 'Ⅲ. 実践 (Production)', value: 'Production' },
]

function MarkdownToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', marginTop: 4 }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 36, height: 20, borderRadius: 10, position: 'relative', transition: 'background 0.2s',
          background: checked ? '#6aac14' : '#ccc', flexShrink: 0,
        }}
      >
        <div style={{
          position: 'absolute', top: 2, left: checked ? 18 : 2, width: 16, height: 16,
          borderRadius: '50%', background: 'white', transition: 'left 0.2s',
        }} />
      </div>
      <span style={{ fontSize: 13, color: checked ? '#2d5500' : '#888', fontWeight: checked ? 'bold' : 'normal' }}>
        マークダウンとして設定する
      </span>
    </label>
  )
}

function MarkdownContent({ content }: { content: string }) {
  const html = marked.parse(content, { breaks: true }) as string
  return (
    <div
      className="markdown-body"
      style={{ fontSize: 14, color: '#3d6e00', lineHeight: 1.7 }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export default function AdminTasksPage() {
  const router = useRouter()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // 新規作成フォーム
  const [title, setTitle]                     = useState('')
  const [description, setDescription]         = useState('')
  const [isMarkdown, setIsMarkdown]           = useState(false)
  const [targetCourse, setTargetCourse]       = useState('')
  const [targetStage, setTargetStage]         = useState('')
  const [progressNumber, setProgressNumber]   = useState('')
  const [allowImageAttachment, setAllowImageAttachment] = useState(true)

  // 編集状態
  const [editingId, setEditingId]                         = useState<string | null>(null)
  const [editTitle, setEditTitle]                         = useState('')
  const [editDescription, setEditDescription]             = useState('')
  const [editIsMarkdown, setEditIsMarkdown]               = useState(false)
  const [editTargetCourse, setEditTargetCourse]           = useState('')
  const [editTargetStage, setEditTargetStage]             = useState('')
  const [editProgressNumber, setEditProgressNumber]       = useState('')
  const [editAllowImageAttachment, setEditAllowImageAttachment] = useState(true)
  const [editSaving, setEditSaving]                       = useState(false)
  const [editError, setEditError]                         = useState<string | null>(null)

  // 初期課題設定
  const [initialTasks, setInitialTasks]       = useState<Record<string, string>>({})
  const [initialSaving, setInitialSaving]     = useState<string | null>(null)

  // AI 課題生成
  const [aiOpen, setAiOpen]                             = useState(false)
  const [aiCourse, setAiCourse]                         = useState('')
  const [aiStage, setAiStage]                           = useState('')
  const [aiTheme, setAiTheme]                           = useState('')
  const [aiGenType, setAiGenType]                       = useState<'sequential' | 'individual' | 'event' | 'custom'>('individual')
  const [aiInputTaskIds, setAiInputTaskIds]             = useState<string[]>([])
  const [aiUseMarkdown, setAiUseMarkdown]               = useState(true)
  const [aiAutoProgress, setAiAutoProgress]             = useState(true)
  const [aiGenerating, setAiGenerating]                 = useState(false)
  const [aiError, setAiError]                           = useState<string | null>(null)
  const [aiResultTitle, setAiResultTitle]               = useState('')
  const [aiResultDescription, setAiResultDescription]   = useState('')
  const [aiResultMarkdown, setAiResultMarkdown]         = useState(true)
  const [aiSubmitting, setAiSubmitting]                 = useState(false)
  const [aiSuccess, setAiSuccess]                       = useState<string | null>(null)

  // アコーディオン & フィルター
  const [expandedId, setExpandedId]           = useState<string | null>(null)
  const [filterText, setFilterText]           = useState('')
  const [filterCourse, setFilterCourse]       = useState('')
  const [filterStage, setFilterStage]         = useState('')
  const [filterActive, setFilterActive]       = useState<'all' | 'active' | 'inactive'>('all')

  const [userRole, setUserRole]         = useState<string | null>(null)
  const [effectivePerms, setEffectivePerms] = useState<Record<PermissionKey, boolean>>({
    course_management: false, task_management: false, assignment_management: false,
    point_settings: false, submission_review: false, finance: false, timeline_management: false,
    dm_management: false, announcement_management: false, gimmick_management: false, news_management: false,
  })

  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser()
        if (authError || !authData?.user) { router.replace('/login'); return }

        const { data: me, error: meError } = await supabase
          .from('profiles').select('role').eq('id', authData.user.id).single()
        if (meError || !me) { router.replace('/dashboard'); return }
        const perms = await getEffectivePermissions(authData.user.id)
        if (me.role !== 'admin' && !perms.task_management) { router.replace('/dashboard'); return }
        if (mounted) { setUserRole(me.role); setEffectivePerms(perms) }

        const [{ data: taskList, error: listError }, { data: initList }] = await Promise.all([
          supabase
            .from('tasks')
            .select('id, title, description, description_is_markdown, target_course, target_stage, is_active, created_at, progress_number, allow_image_attachment')
            .order('created_at', { ascending: false }),
          supabase.from('course_initial_tasks').select('course, task_id'),
        ])
        if (listError) throw listError
        if (mounted) {
          setTasks(taskList ?? [])
          const map: Record<string, string> = {}
          for (const row of (initList ?? [])) map[row.course] = row.task_id
          setInitialTasks(map)
        }
      } catch (err: any) {
        const msg = err?.message ?? err?.details ?? JSON.stringify(err)
        console.error('tasks init error:', msg, err)
        if (mounted) setError(`読み込みエラー: ${msg}`)
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
        description_is_markdown: isMarkdown,
        target_course: targetCourse || null,
        target_stage: targetStage || null,
        progress_number: progressNumber !== '' ? parseFloat(progressNumber) : null,
        created_by: authData?.user?.id,
        is_active: true,
        allow_image_attachment: allowImageAttachment,
      })
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
    } else {
      setTasks(prev => [newTask, ...prev])
      setTitle('')
      setDescription('')
      setIsMarkdown(false)
      setTargetCourse('')
      setTargetStage('')
      setProgressNumber('')
      setAllowImageAttachment(true)
      setSuccess('課題を作成しました！')
    }
    setSubmitting(false)
  }

  function startEdit(task: Task) {
    setEditingId(task.id)
    setEditTitle(task.title)
    setEditDescription(task.description ?? '')
    setEditIsMarkdown(task.description_is_markdown)
    setEditTargetCourse(task.target_course ?? '')
    setEditTargetStage(task.target_stage ?? '')
    setEditProgressNumber(task.progress_number != null ? String(task.progress_number) : '')
    setEditAllowImageAttachment(task.allow_image_attachment ?? true)
    setEditError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditError(null)
  }

  async function handleSaveEdit() {
    if (!editingId) return
    setEditSaving(true)
    setEditError(null)

    const { error } = await supabase
      .from('tasks')
      .update({
        title: editTitle,
        description: editDescription || null,
        description_is_markdown: editIsMarkdown,
        target_course: editTargetCourse || null,
        target_stage: editTargetStage || null,
        progress_number: editProgressNumber !== '' ? parseFloat(editProgressNumber) : null,
        allow_image_attachment: editAllowImageAttachment,
      })
      .eq('id', editingId)

    if (error) {
      setEditError(error.message)
    } else {
      setTasks(prev => prev.map(t => t.id === editingId ? {
        ...t,
        title: editTitle,
        description: editDescription || null,
        description_is_markdown: editIsMarkdown,
        target_course: editTargetCourse || null,
        target_stage: editTargetStage || null,
        progress_number: editProgressNumber !== '' ? parseFloat(editProgressNumber) : null,
        allow_image_attachment: editAllowImageAttachment,
      } : t))
      setEditingId(null)
    }
    setEditSaving(false)
  }

  async function handleDelete(taskId: string, taskTitle: string) {
    if (!window.confirm(`「${taskTitle}」を削除しますか？\nこの操作は取り消せません。`)) return
    const { error } = await supabase.from('tasks').delete().eq('id', taskId)
    if (!error) {
      setTasks(prev => prev.filter(t => t.id !== taskId))
      // 初期課題に設定されていたら解除
      setInitialTasks(prev => {
        const next = { ...prev }
        for (const course of Object.keys(next)) {
          if (next[course] === taskId) delete next[course]
        }
        return next
      })
    }
  }

  async function handleSaveInitialTask(course: string, taskId: string) {
    setInitialSaving(course)
    if (taskId === '') {
      await supabase.from('course_initial_tasks').delete().eq('course', course)
      setInitialTasks(prev => { const n = { ...prev }; delete n[course]; return n })
    } else {
      await supabase.from('course_initial_tasks').upsert({ course, task_id: taskId }, { onConflict: 'course' })
      setInitialTasks(prev => ({ ...prev, [course]: taskId }))
    }
    setInitialSaving(null)
  }

  function suggestProgressNumber(course: string, stage: string): string {
    const filtered = tasks.filter(t =>
      (!course || t.target_course === course) &&
      (!stage  || t.target_stage  === stage)  &&
      t.progress_number != null
    )
    if (filtered.length === 0) return '1'
    const max = Math.max(...filtered.map(t => t.progress_number!))
    return String(Math.round((max + 1) * 10) / 10)
  }

  async function handleGenerate() {
    setAiError(null)
    setAiSuccess(null)
    setAiResultTitle('')
    setAiResultDescription('')
    setAiGenerating(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) throw new Error('ログインが必要です')

      const inputTasks = tasks
        .filter(t => aiInputTaskIds.includes(t.id))
        .map(t => ({ title: t.title, description: t.description }))

      const res = await fetch('/api/generate-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          course: aiCourse,
          stage: aiStage,
          theme: aiTheme,
          generationType: aiGenType,
          inputTasks,
          useMarkdown: aiUseMarkdown,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '生成に失敗しました')
      setAiResultTitle(json.title ?? '')
      setAiResultDescription(json.description ?? '')
      setAiResultMarkdown(aiUseMarkdown)
    } catch (err: any) {
      setAiError(err.message)
    } finally {
      setAiGenerating(false)
    }
  }

  async function handleAiRegister() {
    setAiError(null)
    setAiSuccess(null)
    setAiSubmitting(true)
    const { data: authData } = await supabase.auth.getUser()
    const progressNum = aiAutoProgress ? suggestProgressNumber(aiCourse, aiStage) : ''
    const { data: newTask, error: insertError } = await supabase
      .from('tasks')
      .insert({
        title: aiResultTitle,
        description: aiResultDescription || null,
        description_is_markdown: aiResultMarkdown,
        target_course: aiCourse || null,
        target_stage: aiStage || null,
        progress_number: progressNum !== '' ? parseFloat(progressNum) : null,
        created_by: authData?.user?.id,
        is_active: true,
        allow_image_attachment: true,
      })
      .select()
      .single()
    if (insertError) {
      setAiError(insertError.message)
    } else {
      setTasks(prev => [newTask, ...prev])
      setAiResultTitle('')
      setAiResultDescription('')
      setAiSuccess('課題を登録しました！')
    }
    setAiSubmitting(false)
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <h1 className="game-title" style={{ fontSize: 32 }}>課題管理</h1>
              <p style={{ color: '#3d6e00', marginTop: 4, fontSize: 14 }}>
                課題数: {tasks.length} 件
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {(userRole === 'admin' || effectivePerms.course_management) && (
                <a href="/admin">
                  <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15 }}>
                    部員管理
                  </button>
                </a>
              )}
              {(userRole === 'admin' || effectivePerms.submission_review) && (
                <a href="/admin/submissions">
                  <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15 }}>
                    提出状況
                  </button>
                </a>
              )}
              {(userRole === 'admin' || effectivePerms.point_settings) && (
                <a href="/admin/points">
                  <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15 }}>
                    ポイント設定
                  </button>
                </a>
              )}
              {(userRole === 'admin' || effectivePerms.timeline_management) && (
                <a href="/admin/timeline">
                  <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15 }}>
                    🎬 タイムライン管理
                  </button>
                </a>
              )}
              {userRole === 'admin' && (
                <a href="/admin/positions">
                  <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15 }}>
                    🏷 役職管理
                  </button>
                </a>
              )}
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
              <MarkdownToggle checked={isMarkdown} onChange={setIsMarkdown} />
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
              <div style={{ width: 120 }}>
                <label className="game-label">進行番号</label>
                <input
                  className="game-input"
                  type="number"
                  step="0.1"
                  min="0"
                  value={progressNumber}
                  onChange={e => setProgressNumber(e.target.value)}
                  placeholder="例: 1.0"
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                <div
                  onClick={() => setAllowImageAttachment(!allowImageAttachment)}
                  style={{
                    width: 36, height: 20, borderRadius: 10, position: 'relative', transition: 'background 0.2s',
                    background: allowImageAttachment ? '#6aac14' : '#ccc', flexShrink: 0,
                  }}
                >
                  <div style={{
                    position: 'absolute', top: 2, left: allowImageAttachment ? 18 : 2, width: 16, height: 16,
                    borderRadius: '50%', background: 'white', transition: 'left 0.2s',
                  }} />
                </div>
                <span style={{ fontSize: 13, color: allowImageAttachment ? '#2d5500' : '#888', fontWeight: allowImageAttachment ? 'bold' : 'normal' }}>
                  画像の添付を許可する
                </span>
              </label>
            </div>

            <button className="game-button" type="submit" disabled={submitting} style={{ marginTop: 4 }}>
              {submitting ? '作成中…' : '課題を作成'}
            </button>

            {error   && <div className="game-error">{error}</div>}
            {success && <div className="game-success">{success}</div>}
          </form>
        </div>

        {/* AI 課題生成 */}
        <div className="game-card" style={{ padding: '0', marginBottom: 24, overflow: 'hidden' }}>
          <div
            onClick={() => setAiOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '18px 28px',
              cursor: 'pointer', userSelect: 'none',
            }}
          >
            <span style={{
              fontSize: 13, color: aiOpen ? '#6aac14' : '#888',
              transform: aiOpen ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s', display: 'inline-block', flexShrink: 0,
            }}>▶</span>
            <span className="game-title" style={{ fontSize: 20, flex: 1 }}>AI課題生成 (Gemini)</span>
            <span style={{ fontSize: 12, color: '#888', background: '#e8ffd4', padding: '2px 10px', borderRadius: 10, fontWeight: 'bold' }}>Beta</span>
          </div>

          {aiOpen && (
            <div style={{ borderTop: '1px solid #d4f0a0', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* コース・ステージ */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <label className="game-label">対象コース</label>
                  <select className="game-input" value={aiCourse} onChange={e => { setAiCourse(e.target.value); setAiInputTaskIds([]) }}>
                    {COURSE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <label className="game-label">対象ステージ</label>
                  <select className="game-input" value={aiStage} onChange={e => { setAiStage(e.target.value); setAiInputTaskIds([]) }}>
                    {STAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label className="game-label">生成の種類</label>
                  <select
                    className="game-input"
                    value={aiGenType}
                    onChange={e => setAiGenType(e.target.value as typeof aiGenType)}
                  >
                    <option value="sequential">連続課題（過去課題の続き）</option>
                    <option value="individual">個別課題（テーマ指定）</option>
                    <option value="event">イベント課題（短時間・簡単）</option>
                    <option value="custom">指定課題（プロンプト直接指定）</option>
                  </select>
                </div>
              </div>

              {/* テーマ */}
              <div>
                <label className="game-label">
                  {aiGenType === 'custom' ? 'プロンプト（自由入力）' : 'テーマ'}
                </label>
                <textarea
                  className="game-input"
                  value={aiTheme}
                  onChange={e => setAiTheme(e.target.value)}
                  rows={3}
                  style={{ resize: 'vertical', fontSize: 14 }}
                  placeholder={
                    aiGenType === 'custom'
                      ? '生成の指示を自由に記述してください...'
                      : '例: ShaderGraphを使った光のエフェクト、256ポリゴンでキャラクターを作る...'
                  }
                />
              </div>

              {/* インプット課題（custom以外） */}
              {aiGenType !== 'custom' && (
                <div>
                  <label className="game-label">
                    インプット課題
                    <span style={{ fontSize: 11, fontWeight: 'normal', color: '#888', marginLeft: 8 }}>
                      多く選ぶほど生成精度が上がります
                    </span>
                  </label>
                  {(() => {
                    const filtered = tasks.filter(t =>
                      (!aiCourse || t.target_course === aiCourse) &&
                      (!aiStage  || t.target_stage  === aiStage)
                    )
                    if (filtered.length === 0) return (
                      <p style={{ color: '#aaa', fontSize: 13, margin: 0 }}>（該当する課題がありません）</p>
                    )
                    return (
                      <div style={{
                        maxHeight: 180, overflowY: 'auto', border: '1.5px solid #b8d870',
                        borderRadius: 8, padding: '8px 12px', background: '#f8fff0',
                        display: 'flex', flexDirection: 'column', gap: 4,
                      }}>
                        {filtered.map(t => (
                          <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', fontSize: 13, color: '#2d5500' }}>
                            <input
                              type="checkbox"
                              checked={aiInputTaskIds.includes(t.id)}
                              onChange={e => setAiInputTaskIds(prev =>
                                e.target.checked ? [...prev, t.id] : prev.filter(id => id !== t.id)
                              )}
                              style={{ accentColor: '#6aac14', width: 15, height: 15, flexShrink: 0 }}
                            />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {t.progress_number != null && <span style={{ color: '#6aac14', fontWeight: 'bold', marginRight: 4 }}>#{t.progress_number}</span>}
                              {t.title}
                            </span>
                          </label>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* トグル */}
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                  <div
                    onClick={() => setAiUseMarkdown(v => !v)}
                    style={{ width: 36, height: 20, borderRadius: 10, position: 'relative', transition: 'background 0.2s', background: aiUseMarkdown ? '#6aac14' : '#ccc', flexShrink: 0 }}
                  >
                    <div style={{ position: 'absolute', top: 2, left: aiUseMarkdown ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
                  </div>
                  <span style={{ fontSize: 13, color: aiUseMarkdown ? '#2d5500' : '#888', fontWeight: aiUseMarkdown ? 'bold' : 'normal' }}>マークダウンで生成</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                  <div
                    onClick={() => setAiAutoProgress(v => !v)}
                    style={{ width: 36, height: 20, borderRadius: 10, position: 'relative', transition: 'background 0.2s', background: aiAutoProgress ? '#6aac14' : '#ccc', flexShrink: 0 }}
                  >
                    <div style={{ position: 'absolute', top: 2, left: aiAutoProgress ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
                  </div>
                  <span style={{ fontSize: 13, color: aiAutoProgress ? '#2d5500' : '#888', fontWeight: aiAutoProgress ? 'bold' : 'normal' }}>
                    進行番号を自動振り分け
                    {aiAutoProgress && <span style={{ color: '#6aac14', marginLeft: 6 }}>→ #{suggestProgressNumber(aiCourse, aiStage)}</span>}
                  </span>
                </label>
              </div>

              {/* 生成ボタン */}
              <button
                className="game-button"
                onClick={handleGenerate}
                disabled={aiGenerating || (!aiTheme.trim())}
                style={{ background: '#3d6e00', borderColor: '#6aac14' }}
              >
                {aiGenerating ? '生成中…' : 'AIで課題を生成'}
              </button>
              {aiError && <div className="game-error" style={{ whiteSpace: 'pre-wrap' }}>{aiError}</div>}

              {/* 生成結果 */}
              {(aiResultTitle || aiResultDescription) && (
                <div style={{ borderTop: '1px dashed #b8d870', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ fontSize: 13, color: '#3d6e00', margin: 0, fontWeight: 'bold' }}>生成結果（編集して登録してください）</p>
                  <div>
                    <label className="game-label">課題タイトル</label>
                    <input
                      className="game-input"
                      value={aiResultTitle}
                      onChange={e => setAiResultTitle(e.target.value)}
                      style={{ fontSize: 15 }}
                    />
                  </div>
                  <div>
                    <label className="game-label">課題の説明</label>
                    <textarea
                      className="game-input"
                      value={aiResultDescription}
                      onChange={e => setAiResultDescription(e.target.value)}
                      rows={8}
                      style={{ resize: 'vertical', fontSize: 13 }}
                    />
                    <MarkdownToggle checked={aiResultMarkdown} onChange={setAiResultMarkdown} />
                  </div>
                  <button
                    className="game-button"
                    onClick={handleAiRegister}
                    disabled={aiSubmitting || !aiResultTitle.trim()}
                  >
                    {aiSubmitting ? '登録中…' : 'このまま登録'}
                  </button>
                  {aiSuccess && <div className="game-success">{aiSuccess}</div>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 課題一覧 */}
        <div className="game-card" style={{ padding: '24px 28px' }}>
          <h2 className="game-title" style={{ fontSize: 22, marginBottom: 16 }}>課題一覧</h2>

          {/* フィルター */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            <input
              className="game-input"
              type="text"
              placeholder="課題名で検索…"
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              style={{ fontSize: 14 }}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select
                className="game-input"
                value={filterCourse}
                onChange={e => setFilterCourse(e.target.value)}
                style={{ flex: 1, minWidth: 120, fontSize: 13 }}
              >
                {COURSE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select
                className="game-input"
                value={filterStage}
                onChange={e => setFilterStage(e.target.value)}
                style={{ flex: 1, minWidth: 140, fontSize: 13 }}
              >
                {STAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select
                className="game-input"
                value={filterActive}
                onChange={e => setFilterActive(e.target.value as 'all' | 'active' | 'inactive')}
                style={{ flex: 1, minWidth: 100, fontSize: 13 }}
              >
                <option value="all">全て</option>
                <option value="active">有効のみ</option>
                <option value="inactive">停止中</option>
              </select>
            </div>
          </div>

          {tasks.length === 0 ? (
            <p style={{ color: '#6aac14', textAlign: 'center', padding: 24 }}>まだ課題がありません</p>
          ) : (() => {
            const filtered = tasks.filter(t => {
              if (filterText && !t.title.toLowerCase().includes(filterText.toLowerCase())) return false
              if (filterCourse && t.target_course !== filterCourse) return false
              if (filterStage && t.target_stage !== filterStage) return false
              if (filterActive === 'active' && !t.is_active) return false
              if (filterActive === 'inactive' && t.is_active) return false
              return true
            })
            if (filtered.length === 0) return (
              <p style={{ color: '#6aac14', textAlign: 'center', padding: 24 }}>該当する課題がありません</p>
            )
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filtered.map(task => {
                  const isExpanded = expandedId === task.id
                  const isEditing = editingId === task.id
                  return (
                    <div
                      key={task.id}
                      style={{
                        border: `2px solid ${task.is_active ? '#6aac14' : '#bbb'}`,
                        borderRadius: 10,
                        background: task.is_active ? '#f8fff0' : '#f5f5f5',
                        overflow: 'hidden',
                      }}
                    >
                      {/* ─── 折りたたみヘッダー行 ─── */}
                      <div
                        onClick={() => {
                          if (isEditing) return
                          setExpandedId(isExpanded ? null : task.id)
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '12px 16px', cursor: isEditing ? 'default' : 'pointer',
                          userSelect: 'none',
                        }}
                      >
                        <span style={{
                          fontSize: 13, color: isExpanded ? '#6aac14' : '#888',
                          transition: 'transform 0.2s',
                          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                          display: 'inline-block', flexShrink: 0,
                        }}>▶</span>
                        <span style={{ fontWeight: 'bold', color: '#2d5500', fontSize: 15, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {task.title}
                        </span>
                        <div style={{ display: 'flex', gap: 5, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {task.progress_number != null && (
                            <span style={{ background: '#a8d870', color: '#1a3a00', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 'bold', whiteSpace: 'nowrap' }}>#{task.progress_number}</span>
                          )}
                          <span style={{ background: '#6aac14', color: 'white', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                            {task.target_course ?? '全コース'}
                          </span>
                          <span style={{ background: '#3d6e00', color: 'white', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                            {task.target_stage ?? '全ステージ'}
                          </span>
                          {!task.is_active && (
                            <span style={{ background: '#999', color: 'white', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 'bold' }}>停止中</span>
                          )}
                          {task.description_is_markdown && (
                            <span style={{ background: '#0288d1', color: 'white', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 'bold' }}>MD</span>
                          )}
                          {!task.allow_image_attachment && (
                            <span style={{ background: '#e65100', color: 'white', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 'bold' }}>画像添付不可</span>
                          )}
                        </div>
                      </div>

                      {/* ─── 展開部分 ─── */}
                      {(isExpanded || isEditing) && (
                        <div style={{ borderTop: '1px solid #d4f0a0', padding: '14px 16px' }}>
                          {isEditing ? (
                            /* ─── 編集フォーム ─── */
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                              <div>
                                <label className="game-label" style={{ fontSize: 12 }}>タイトル</label>
                                <input
                                  className="game-input"
                                  value={editTitle}
                                  onChange={e => setEditTitle(e.target.value)}
                                  style={{ fontSize: 14 }}
                                />
                              </div>
                              <div>
                                <label className="game-label" style={{ fontSize: 12 }}>説明</label>
                                <textarea
                                  className="game-input"
                                  value={editDescription}
                                  onChange={e => {
                                    setEditDescription(e.target.value)
                                    e.target.style.height = 'auto'
                                    e.target.style.height = e.target.scrollHeight + 'px'
                                  }}
                                  onFocus={e => {
                                    e.target.style.height = 'auto'
                                    e.target.style.height = e.target.scrollHeight + 'px'
                                  }}
                                  onBlur={e => { e.target.style.height = '' }}
                                  rows={4}
                                  style={{ resize: 'vertical', fontSize: 13, minHeight: 100, overflow: 'hidden' }}
                                />
                                <MarkdownToggle checked={editIsMarkdown} onChange={setEditIsMarkdown} />
                              </div>
                              <div style={{ display: 'flex', gap: 12 }}>
                                <div style={{ flex: 1 }}>
                                  <label className="game-label" style={{ fontSize: 12 }}>対象コース</label>
                                  <select className="game-input" value={editTargetCourse} onChange={e => setEditTargetCourse(e.target.value)} style={{ fontSize: 13 }}>
                                    {COURSE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                  </select>
                                </div>
                                <div style={{ flex: 1 }}>
                                  <label className="game-label" style={{ fontSize: 12 }}>対象ステージ</label>
                                  <select className="game-input" value={editTargetStage} onChange={e => setEditTargetStage(e.target.value)} style={{ fontSize: 13 }}>
                                    {STAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                  </select>
                                </div>
                                <div style={{ width: 100 }}>
                                  <label className="game-label" style={{ fontSize: 12 }}>進行番号</label>
                                  <input
                                    className="game-input"
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    value={editProgressNumber}
                                    onChange={e => setEditProgressNumber(e.target.value)}
                                    placeholder="1.0"
                                    style={{ fontSize: 13 }}
                                  />
                                </div>
                              </div>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                                <div
                                  onClick={() => setEditAllowImageAttachment(!editAllowImageAttachment)}
                                  style={{
                                    width: 36, height: 20, borderRadius: 10, position: 'relative', transition: 'background 0.2s',
                                    background: editAllowImageAttachment ? '#6aac14' : '#ccc', flexShrink: 0,
                                  }}
                                >
                                  <div style={{
                                    position: 'absolute', top: 2, left: editAllowImageAttachment ? 18 : 2, width: 16, height: 16,
                                    borderRadius: '50%', background: 'white', transition: 'left 0.2s',
                                  }} />
                                </div>
                                <span style={{ fontSize: 13, color: editAllowImageAttachment ? '#2d5500' : '#888', fontWeight: editAllowImageAttachment ? 'bold' : 'normal' }}>
                                  画像の添付を許可する
                                </span>
                              </label>
                              {editError && <div className="game-error" style={{ fontSize: 12 }}>{editError}</div>}
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                  onClick={handleSaveEdit}
                                  disabled={editSaving}
                                  style={{ padding: '6px 16px', borderRadius: 8, border: '2px solid #6aac14', background: '#6aac14', color: 'white', fontWeight: 'bold', cursor: 'pointer', fontSize: 13 }}>
                                  {editSaving ? '保存中…' : '保存'}
                                </button>
                                <button
                                  onClick={() => { cancelEdit(); setExpandedId(task.id) }}
                                  style={{ padding: '6px 16px', borderRadius: 8, border: '2px solid #888', background: 'none', color: '#888', fontWeight: 'bold', cursor: 'pointer', fontSize: 13 }}>
                                  キャンセル
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* ─── 詳細表示 ─── */
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button
                                  onClick={() => { startEdit(task); setExpandedId(null) }}
                                  style={{ padding: '6px 14px', borderRadius: 8, border: '2px solid #3d6e00', background: 'white', color: '#3d6e00', fontWeight: 'bold', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }}
                                >
                                  編集
                                </button>
                                <button
                                  onClick={() => toggleActive(task.id, task.is_active)}
                                  style={{ padding: '6px 14px', borderRadius: 8, border: `2px solid ${task.is_active ? '#c0392b' : '#6aac14'}`, background: task.is_active ? '#fdecea' : '#e8ffd4', color: task.is_active ? '#c0392b' : '#1a6e00', fontWeight: 'bold', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }}
                                >
                                  {task.is_active ? '停止する' : '有効にする'}
                                </button>
                                <button
                                  onClick={() => handleDelete(task.id, task.title)}
                                  style={{ padding: '6px 14px', borderRadius: 8, border: '2px solid #c0392b', background: '#fdecea', color: '#c0392b', fontWeight: 'bold', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }}
                                >
                                  削除
                                </button>
                              </div>
                              {task.description ? (
                                task.description_is_markdown
                                  ? <MarkdownContent content={task.description} />
                                  : <p style={{ color: '#3d6e00', fontSize: 14, whiteSpace: 'pre-wrap', margin: 0 }}>{task.description}</p>
                              ) : (
                                <p style={{ color: '#aaa', fontSize: 13, margin: 0 }}>（説明なし）</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>

        {/* 初期課題設定 */}
        <div className="game-card" style={{ padding: '24px 28px', marginTop: 24 }}>
          <h2 className="game-title" style={{ fontSize: 22, marginBottom: 6 }}>初期課題設定</h2>
          <p style={{ color: '#3d6e00', fontSize: 13, marginBottom: 20 }}>
            新入部員がコースを選択したとき自動で割り当てられる課題を設定します。
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {(['Unity', 'Blender', 'Web'] as const).map(course => (
              <div key={course} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{
                  minWidth: 110, fontWeight: 'bold', fontSize: 14, color: '#2d5500',
                  background: '#e8ffd4', borderRadius: 8, padding: '4px 12px', textAlign: 'center',
                }}>
                  {course}コース
                </span>
                <select
                  className="game-input"
                  style={{ flex: 1, fontSize: 14 }}
                  value={initialTasks[course] ?? ''}
                  onChange={e => handleSaveInitialTask(course, e.target.value)}
                  disabled={initialSaving === course}
                >
                  <option value="">（なし）</option>
                  {tasks.filter(t => t.is_active && (!t.target_course || t.target_course === course)).map(t => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
                {initialSaving === course && (
                  <span style={{ fontSize: 12, color: '#6aac14', whiteSpace: 'nowrap' }}>保存中…</span>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>

      <a href="/dashboard" style={{ textDecoration: 'none' }}>
        <button style={{
          position: 'fixed', top: 20, left: 16, zIndex: 50,
          background: '#1a3a00', border: '3px solid #6aac14', borderRadius: 12,
          color: '#a8d870', fontSize: 13, fontWeight: 'bold',
          padding: '10px 18px', cursor: 'pointer',
          boxShadow: '0 4px 0 #0d2000',
        }}>
          ← ダッシュボード
        </button>
      </a>
    </div>
  )
}

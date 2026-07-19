"use client"

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { marked } from 'marked'
import supabase from '../../../lib/supabase'
import { getEffectivePermissions, PermissionKey } from '../../../lib/permissions'
import { ClipboardList } from 'lucide-react'

interface Task {
  id: string
  title: string
  description: string | null
  description_is_markdown: boolean
  target_course: string | null
  target_stage: string | null
  is_active: boolean
  is_public: boolean
  created_at: string
  progress_number: number | null
  allow_image_attachment: boolean
}

interface AiTaskTheme {
  id: string
  content: string
  gen_type: string | null
  created_at: string
}

interface TaskCourse {
  id: string
  name: string
  target_course: string | null
  target_stage:  string | null
  created_at:    string
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
  const [isPublic, setIsPublic]                         = useState(false)

  // 編集状態
  const [editingId, setEditingId]                         = useState<string | null>(null)
  const [editTitle, setEditTitle]                         = useState('')
  const [editDescription, setEditDescription]             = useState('')
  const [editIsMarkdown, setEditIsMarkdown]               = useState(false)
  const [editTargetCourse, setEditTargetCourse]           = useState('')
  const [editTargetStage, setEditTargetStage]             = useState('')
  const [editProgressNumber, setEditProgressNumber]       = useState('')
  const [editAllowImageAttachment, setEditAllowImageAttachment] = useState(true)
  const [editIsPublic, setEditIsPublic]                   = useState(false)
  const [editSaving, setEditSaving]                       = useState(false)
  const [editError, setEditError]                         = useState<string | null>(null)

  // 初期課題設定
  const [initialTasks, setInitialTasks]       = useState<Record<string, string>>({})
  const [initialSaving, setInitialSaving]     = useState<string | null>(null)

  // 新規作成アコーディオン
  const [createOpen, setCreateOpen]         = useState(false)

  // コース管理
  const [courses, setCourses]                   = useState<TaskCourse[]>([])
  const [courseOpen, setCourseOpen]             = useState(false)
  const [courseExpandedId, setCourseExpandedId] = useState<string | null>(null)
  const [courseTaskOrders, setCourseTaskOrders] = useState<Record<string, string[]>>({})
  const [taskCourseMap, setTaskCourseMap]       = useState<Record<string, string>>({})
  const courseSavingRef                         = useRef(false)
  const saveOrderTimers                         = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const [editingCourseId, setEditingCourseId]   = useState<string | null>(null)
  const [editingCourseName, setEditingCourseName] = useState('')

  // コース作成フォーム
  const [newCourseName, setNewCourseName]     = useState('')
  const [newCourseTarget, setNewCourseTarget] = useState('')
  const [newCourseStage, setNewCourseStage]   = useState('')

  // AI 課題生成
  const [aiOpen, setAiOpen] = useState(false)
  const [aiCourse, setAiCourse] = useState<string>(() => {
    try { return JSON.parse(localStorage.getItem('admin-ai-settings') ?? '{}').aiCourse ?? '' } catch { return '' }
  })
  const [aiStage, setAiStage] = useState<string>(() => {
    try { return JSON.parse(localStorage.getItem('admin-ai-settings') ?? '{}').aiStage ?? '' } catch { return '' }
  })
  const [aiTheme, setAiTheme]                           = useState('')
  const [aiGenType, setAiGenType] = useState<'sequential' | 'individual' | 'event' | 'custom'>(() => {
    try { return JSON.parse(localStorage.getItem('admin-ai-settings') ?? '{}').aiGenType ?? 'individual' } catch { return 'individual' }
  })
  const [aiInputTaskIds, setAiInputTaskIds]             = useState<string[]>([])
  const [aiUseMarkdown, setAiUseMarkdown] = useState<boolean>(() => {
    try { const v = JSON.parse(localStorage.getItem('admin-ai-settings') ?? '{}').aiUseMarkdown; return v === undefined ? true : v } catch { return true }
  })
  const [aiAutoProgress, setAiAutoProgress] = useState<boolean>(() => {
    try { const v = JSON.parse(localStorage.getItem('admin-ai-settings') ?? '{}').aiAutoProgress; return v === undefined ? true : v } catch { return true }
  })
  const [aiGenerating, setAiGenerating]                 = useState(false)
  const [aiError, setAiError]                           = useState<string | null>(null)
  const [aiResultTitle, setAiResultTitle]               = useState('')
  const [aiResultDescription, setAiResultDescription]   = useState('')
  const [aiResultMarkdown, setAiResultMarkdown]         = useState(true)
  const [aiSubmitting, setAiSubmitting]                 = useState(false)
  const [aiSuccess, setAiSuccess]                       = useState<string | null>(null)
  const [savedThemes, setSavedThemes]                   = useState<AiTaskTheme[]>([])
  const [themeSaving, setThemeSaving]                   = useState(false)
  const [themeSaveSuccess, setThemeSaveSuccess]         = useState(false)
  const themesLoadedRef                                 = useRef(false)

  // アコーディオン & フィルター
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filterText, setFilterText] = useState<string>(() => {
    try { return JSON.parse(localStorage.getItem('admin-tasks-filters') ?? '{}').filterText ?? '' } catch { return '' }
  })
  const [filterCourse, setFilterCourse] = useState<string>(() => {
    try { return JSON.parse(localStorage.getItem('admin-tasks-filters') ?? '{}').filterCourse ?? '' } catch { return '' }
  })
  const [filterStage, setFilterStage] = useState<string>(() => {
    try { return JSON.parse(localStorage.getItem('admin-tasks-filters') ?? '{}').filterStage ?? '' } catch { return '' }
  })
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>(() => {
    try { return JSON.parse(localStorage.getItem('admin-tasks-filters') ?? '{}').filterActive ?? 'all' } catch { return 'all' }
  })
  const [filterCustomCourse, setFilterCustomCourse] = useState<string>(() => {
    try { return JSON.parse(localStorage.getItem('admin-tasks-filters') ?? '{}').filterCustomCourse ?? '' } catch { return '' }
  })

  const [userRole, setUserRole]         = useState<string | null>(null)
  const [effectivePerms, setEffectivePerms] = useState<Record<PermissionKey, boolean>>({
    course_management: false, task_management: false, assignment_management: false,
    point_settings: false, submission_review: false, finance: false, timeline_management: false,
    dm_management: false, announcement_management: false, gimmick_management: false,
    dev_management: false,
    news_management: false, ticket_admin: false, debug: false, sns_management: false, stats_management: false,
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

        const [
          { data: taskList, error: listError },
          { data: initList },
          { data: courseList },
          { data: assignList },
        ] = await Promise.all([
          supabase
            .from('tasks')
            .select('id, title, description, description_is_markdown, target_course, target_stage, is_active, is_public, created_at, progress_number, allow_image_attachment')
            .order('created_at', { ascending: false }),
          supabase.from('course_initial_tasks').select('course, task_id'),
          supabase.from('task_courses').select('id, name, target_course, target_stage, created_at').order('created_at'),
          supabase.from('task_course_assignments').select('task_course_id, task_id, sort_order').order('sort_order'),
        ])
        if (listError) throw listError
        if (mounted) {
          setTasks(taskList ?? [])
          const map: Record<string, string> = {}
          for (const row of (initList ?? [])) map[row.course] = row.task_id
          setInitialTasks(map)
          setCourses(courseList ?? [])
          const orderMap: Record<string, string[]> = {}
          const tcMap: Record<string, string> = {}
          for (const row of (assignList ?? [])) {
            if (!orderMap[row.task_course_id]) orderMap[row.task_course_id] = []
            orderMap[row.task_course_id].push(row.task_id)
            tcMap[row.task_id] = row.task_course_id
          }
          setCourseTaskOrders(orderMap)
          setTaskCourseMap(tcMap)
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

  useEffect(() => {
    try {
      localStorage.setItem('admin-tasks-filters', JSON.stringify({
        filterText, filterCourse, filterStage, filterActive, filterCustomCourse,
      }))
    } catch {}
  }, [filterText, filterCourse, filterStage, filterActive, filterCustomCourse])

  useEffect(() => {
    try {
      localStorage.setItem('admin-ai-settings', JSON.stringify({
        aiCourse, aiStage, aiGenType, aiUseMarkdown, aiAutoProgress,
      }))
    } catch {}
  }, [aiCourse, aiStage, aiGenType, aiUseMarkdown, aiAutoProgress])

  useEffect(() => {
    if (!aiOpen || themesLoadedRef.current) return
    themesLoadedRef.current = true
    supabase
      .from('ai_task_themes')
      .select('id, content, gen_type, created_at')
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setSavedThemes(data) })
  }, [aiOpen])

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (courseSavingRef.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

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
        is_public: isPublic,
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
      setIsPublic(false)
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
    setEditIsPublic(task.is_public ?? false)
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
        is_public: editIsPublic,
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
        is_public: editIsPublic,
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

  async function handleSaveTheme() {
    if (!aiTheme.trim()) return
    setThemeSaving(true)
    const { data: authData } = await supabase.auth.getUser()
    const { data: saved } = await supabase
      .from('ai_task_themes')
      .insert({ content: aiTheme.trim(), gen_type: aiGenType, created_by: authData?.user?.id })
      .select('id, content, gen_type, created_at')
      .single()
    if (saved) {
      setSavedThemes(prev => [saved, ...prev])
      setThemeSaveSuccess(true)
      setTimeout(() => setThemeSaveSuccess(false), 2000)
    }
    setThemeSaving(false)
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

  async function togglePublic(taskId: string, current: boolean) {
    const { error } = await supabase
      .from('tasks')
      .update({ is_public: !current })
      .eq('id', taskId)

    if (!error) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, is_public: !current } : t))
    }
  }

  async function handleCreateCourse() {
    if (!newCourseName.trim()) return
    const { data: authData } = await supabase.auth.getUser()
    const { data: created, error } = await supabase
      .from('task_courses')
      .insert({
        name:          newCourseName.trim(),
        target_course: newCourseTarget || null,
        target_stage:  newCourseStage  || null,
        created_by:    authData?.user?.id,
      })
      .select('id, name, target_course, target_stage, created_at')
      .single()
    if (!error && created) {
      setCourses(prev => [...prev, created])
      setCourseTaskOrders(prev => ({ ...prev, [created.id]: [] }))
      setNewCourseName('')
      setNewCourseTarget('')
      setNewCourseStage('')
    }
  }

  async function saveOrderToDb(courseId: string, taskIds: string[]) {
    courseSavingRef.current = true
    const upserts = taskIds.map((taskId, i) => ({
      task_course_id: courseId,
      task_id:        taskId,
      sort_order:     i,
    }))
    await supabase
      .from('task_course_assignments')
      .upsert(upserts, { onConflict: 'task_course_id,task_id' })
    courseSavingRef.current = false
  }

  function handleMoveTask(courseId: string, taskId: string, dir: 'up' | 'down') {
    setCourseTaskOrders(prev => {
      const current = [...(prev[courseId] ?? [])]
      const idx = current.indexOf(taskId)
      if (idx < 0) return prev
      if (dir === 'up'   && idx === 0)                  return prev
      if (dir === 'down' && idx === current.length - 1) return prev
      const swapIdx = dir === 'up' ? idx - 1 : idx + 1
      ;[current[idx], current[swapIdx]] = [current[swapIdx], current[idx]]
      const next = { ...prev, [courseId]: current }
      if (saveOrderTimers.current[courseId]) clearTimeout(saveOrderTimers.current[courseId])
      saveOrderTimers.current[courseId] = setTimeout(() => saveOrderToDb(courseId, current), 300)
      return next
    })
  }

  async function handleCourseAssign(taskId: string, courseId: string) {
    const prevCourseId = taskCourseMap[taskId]
    setTaskCourseMap(prev => {
      const next = { ...prev }
      if (courseId) next[taskId] = courseId
      else delete next[taskId]
      return next
    })
    setCourseTaskOrders(prev => {
      const next = { ...prev }
      if (prevCourseId && next[prevCourseId]) {
        next[prevCourseId] = next[prevCourseId].filter(id => id !== taskId)
      }
      if (courseId) {
        next[courseId] = [...(next[courseId] ?? []), taskId]
      }
      return next
    })
    if (prevCourseId) {
      await supabase.from('task_course_assignments')
        .delete()
        .eq('task_course_id', prevCourseId)
        .eq('task_id', taskId)
    }
    if (courseId) {
      const sortOrder = courseTaskOrders[courseId]?.length ?? 0
      await supabase.from('task_course_assignments')
        .upsert(
          { task_course_id: courseId, task_id: taskId, sort_order: sortOrder },
          { onConflict: 'task_course_id,task_id' }
        )
    }
  }

  async function handleRenameCourse(courseId: string) {
    const name = editingCourseName.trim()
    if (!name) return
    const { error } = await supabase.from('task_courses').update({ name }).eq('id', courseId)
    if (!error) {
      setCourses(prev => prev.map(c => c.id === courseId ? { ...c, name } : c))
      setEditingCourseId(null)
    }
  }

  async function handleDeleteCourse(courseId: string, courseName: string) {
    if (!window.confirm(`「${courseName}」を削除しますか？\n課題自体は削除されません。`)) return
    const { error } = await supabase.from('task_courses').delete().eq('id', courseId)
    if (!error) {
      setCourses(prev => prev.filter(c => c.id !== courseId))
      setCourseTaskOrders(prev => { const n = { ...prev }; delete n[courseId]; return n })
      setTaskCourseMap(prev => {
        const n = { ...prev }
        for (const tid of Object.keys(n)) { if (n[tid] === courseId) delete n[tid] }
        return n
      })
      if (filterCustomCourse === courseId) setFilterCustomCourse('')
      setCourseExpandedId(null)
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
        <div style={{
          background: 'linear-gradient(135deg, #1a3a00 0%, #2d5500 55%, #3d6e00 100%)',
          borderRadius: 10, padding: '24px 32px', marginBottom: 24,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(106,172,20,0.18) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <p style={{ color: '#6aac14', fontSize: 10, fontWeight: 'bold', letterSpacing: '0.14em', margin: '0 0 6px' }}>TASK MANAGEMENT</p>
          <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 'bold', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <ClipboardList size={24} />課題管理
          </h1>
          <p style={{ color: 'rgba(168,216,112,0.8)', fontSize: 13, fontWeight: 'bold', margin: 0 }}>
            課題数: {tasks.length} 件
          </p>
        </div>

        {/* コース管理 */}
        <div className="game-card" style={{ padding: 0, marginBottom: 24, overflow: 'hidden' }}>
          <div
            onClick={() => setCourseOpen(o => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 28px', cursor: 'pointer', userSelect: 'none' }}
          >
            <span style={{
              fontSize: 13, color: courseOpen ? '#6aac14' : '#888',
              transform: courseOpen ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s', display: 'inline-block', flexShrink: 0,
            }}>▶</span>
            <span className="game-title" style={{ fontSize: 20, flex: 1 }}>コース管理</span>
          </div>

          {courseOpen && (
            <div style={{ borderTop: '1px solid #d4f0a0', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* コース作成フォーム */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: 2, minWidth: 160 }}>
                  <label className="game-label">コース名</label>
                  <input
                    className="game-input"
                    type="text"
                    value={newCourseName}
                    onChange={e => setNewCourseName(e.target.value)}
                    placeholder="例：初心者向けUnity入門"
                  />
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <label className="game-label">対象コース</label>
                  <select className="game-input" value={newCourseTarget} onChange={e => setNewCourseTarget(e.target.value)}>
                    {COURSE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <label className="game-label">段階</label>
                  <select className="game-input" value={newCourseStage} onChange={e => setNewCourseStage(e.target.value)}>
                    {STAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <button
                  className="game-button"
                  onClick={handleCreateCourse}
                  disabled={!newCourseName.trim()}
                  style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
                >
                  作成
                </button>
              </div>

              {/* 作成済みコース一覧 */}
              {courses.length === 0 ? (
                <p style={{ color: '#aaa', fontSize: 13, margin: 0 }}>（コースがまだありません）</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {courses.map(course => {
                    const isSubOpen = courseExpandedId === course.id
                    const orderedTaskIds = courseTaskOrders[course.id] ?? []
                    return (
                      <div key={course.id} style={{ border: '1.5px solid #3d6e00', borderRadius: 10, overflow: 'hidden', background: '#f8fff0' }}>
                        {/* サブヘッダー */}
                        <div
                          onClick={() => { if (editingCourseId !== course.id) setCourseExpandedId(isSubOpen ? null : course.id) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: editingCourseId === course.id ? 'default' : 'pointer', userSelect: 'none' }}
                        >
                          <span style={{
                            fontSize: 12, color: isSubOpen ? '#6aac14' : '#888',
                            transform: isSubOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s', display: 'inline-block', flexShrink: 0,
                          }}>▶</span>
                          {editingCourseId === course.id ? (
                            <div
                              onClick={e => e.stopPropagation()}
                              style={{ display: 'flex', gap: 6, flex: 1, alignItems: 'center' }}
                            >
                              <input
                                className="game-input"
                                value={editingCourseName}
                                onChange={e => setEditingCourseName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleRenameCourse(course.id); if (e.key === 'Escape') setEditingCourseId(null) }}
                                autoFocus
                                style={{ fontSize: 13, flex: 1, padding: '4px 8px' }}
                              />
                              <button
                                onClick={() => handleRenameCourse(course.id)}
                                disabled={!editingCourseName.trim()}
                                style={{ padding: '3px 10px', borderRadius: 6, border: '1.5px solid #6aac14', background: '#6aac14', color: 'white', fontWeight: 'bold', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}
                              >保存</button>
                              <button
                                onClick={() => setEditingCourseId(null)}
                                style={{ padding: '3px 10px', borderRadius: 6, border: '1.5px solid #888', background: 'none', color: '#888', fontWeight: 'bold', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}
                              >キャンセル</button>
                            </div>
                          ) : (
                            <>
                              <span style={{ fontWeight: 'bold', color: '#2d5500', fontSize: 14, flex: 1 }}>{course.name}</span>
                              <button
                                onClick={e => { e.stopPropagation(); setEditingCourseId(course.id); setEditingCourseName(course.name) }}
                                style={{ padding: '2px 8px', borderRadius: 6, border: '1.5px solid #3d6e00', background: 'white', color: '#3d6e00', fontSize: 11, fontWeight: 'bold', cursor: 'pointer', flexShrink: 0 }}
                              >編集</button>
                              <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                                {course.target_course && (
                                  <span style={{ background: '#6aac14', color: 'white', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 'bold' }}>
                                    {course.target_course}
                                  </span>
                                )}
                                {course.target_stage && (
                                  <span style={{ background: '#3d6e00', color: 'white', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 'bold' }}>
                                    {course.target_stage}
                                  </span>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                        {/* サブボディ */}
                        {isSubOpen && (
                          <div style={{ borderTop: '1px solid #d4f0a0', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {orderedTaskIds.length === 0 ? (
                              <p style={{ color: '#aaa', fontSize: 13, margin: 0 }}>（課題が割り当てられていません）</p>
                            ) : (
                              orderedTaskIds.map((tid, idx) => {
                                const t = tasks.find(x => x.id === tid)
                                if (!t) return null
                                return (
                                  <div key={tid} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ flex: 1, fontSize: 13, color: '#2d5500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {t.title}
                                    </span>
                                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                      <button
                                        onClick={() => handleMoveTask(course.id, tid, 'up')}
                                        disabled={idx === 0}
                                        style={{ padding: '2px 8px', borderRadius: 6, border: '1.5px solid #3d6e00', background: idx === 0 ? '#eee' : '#e8ffd4', color: idx === 0 ? '#bbb' : '#2d5500', cursor: idx === 0 ? 'default' : 'pointer', fontSize: 13, fontWeight: 'bold' }}
                                      >▲</button>
                                      <button
                                        onClick={() => handleMoveTask(course.id, tid, 'down')}
                                        disabled={idx === orderedTaskIds.length - 1}
                                        style={{ padding: '2px 8px', borderRadius: 6, border: '1.5px solid #3d6e00', background: idx === orderedTaskIds.length - 1 ? '#eee' : '#e8ffd4', color: idx === orderedTaskIds.length - 1 ? '#bbb' : '#2d5500', cursor: idx === orderedTaskIds.length - 1 ? 'default' : 'pointer', fontSize: 13, fontWeight: 'bold' }}
                                      >▼</button>
                                    </div>
                                  </div>
                                )
                              })
                            )}
                            <div style={{ borderTop: '1px solid #d4f0a0', marginTop: 6, paddingTop: 10 }}>
                              <button
                                onClick={() => handleDeleteCourse(course.id, course.name)}
                                style={{ padding: '5px 14px', borderRadius: 8, border: '1.5px solid #c0392b', background: '#fdecea', color: '#c0392b', fontWeight: 'bold', fontSize: 12, cursor: 'pointer' }}
                              >コースを削除</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 課題作成フォーム */}
        <div className="game-card" style={{ padding: '0', marginBottom: 24, overflow: 'hidden' }}>
          <div
            onClick={() => setCreateOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '18px 28px',
              cursor: 'pointer', userSelect: 'none',
            }}
          >
            <span style={{
              fontSize: 13, color: createOpen ? '#6aac14' : '#888',
              transform: createOpen ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s', display: 'inline-block', flexShrink: 0,
            }}>▶</span>
            <span className="game-title" style={{ fontSize: 20, flex: 1 }}>新しい課題を作成</span>
          </div>
          {createOpen && (
          <div style={{ borderTop: '1px solid #d4f0a0', padding: '20px 28px' }}>
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

            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
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
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                <div
                  onClick={() => setIsPublic(!isPublic)}
                  style={{
                    width: 36, height: 20, borderRadius: 10, position: 'relative', transition: 'background 0.2s',
                    background: isPublic ? '#6aac14' : '#ccc', flexShrink: 0,
                  }}
                >
                  <div style={{
                    position: 'absolute', top: 2, left: isPublic ? 18 : 2, width: 16, height: 16,
                    borderRadius: '50%', background: 'white', transition: 'left 0.2s',
                  }} />
                </div>
                <span style={{ fontSize: 13, color: isPublic ? '#2d5500' : '#888', fontWeight: isPublic ? 'bold' : 'normal' }}>
                  課題一覧に公開する
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
          )}
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <label className="game-label" style={{ marginBottom: 0, flex: 1 }}>
                    {aiGenType === 'custom' ? 'プロンプト（自由入力）' : 'テーマ'}
                  </label>
                  <button
                    onClick={handleSaveTheme}
                    disabled={!aiTheme.trim() || themeSaving}
                    style={{
                      padding: '3px 12px', borderRadius: 6, fontSize: 12, fontWeight: 'bold', cursor: 'pointer',
                      border: themeSaveSuccess ? '1.5px solid #6aac14' : '1.5px solid #3d6e00',
                      background: themeSaveSuccess ? '#e8ffd4' : 'white',
                      color: themeSaveSuccess ? '#2d5500' : '#3d6e00',
                      whiteSpace: 'nowrap', transition: 'all 0.2s',
                    }}
                  >{themeSaveSuccess ? '保存済み ✓' : themeSaving ? '保存中…' : '保存'}</button>
                </div>
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
                {savedThemes.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#888', whiteSpace: 'nowrap' }}>保存済み:</span>
                    <select
                      className="game-input"
                      style={{ fontSize: 12, flex: 1 }}
                      value=""
                      onChange={e => { if (e.target.value) setAiTheme(e.target.value) }}
                    >
                      <option value="">── 選択して読み込む ──</option>
                      {savedThemes.map(t => (
                        <option key={t.id} value={t.content}>
                          {t.content.length > 60 ? t.content.slice(0, 60) + '…' : t.content}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
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
            <select
              className="game-input"
              value={filterCustomCourse}
              onChange={e => setFilterCustomCourse(e.target.value)}
              style={{ fontSize: 13 }}
            >
              <option value="">カスタムコース: 全て</option>
              {courses.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
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
              if (filterCustomCourse && taskCourseMap[t.id] !== filterCustomCourse) return false
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
                          <span style={{ background: task.is_public ? '#2196f3' : '#9e9e9e', color: 'white', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                            {task.is_public ? '公開' : '非公開'}
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
                              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
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
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                                  <div
                                    onClick={() => setEditIsPublic(!editIsPublic)}
                                    style={{
                                      width: 36, height: 20, borderRadius: 10, position: 'relative', transition: 'background 0.2s',
                                      background: editIsPublic ? '#6aac14' : '#ccc', flexShrink: 0,
                                    }}
                                  >
                                    <div style={{
                                      position: 'absolute', top: 2, left: editIsPublic ? 18 : 2, width: 16, height: 16,
                                      borderRadius: '50%', background: 'white', transition: 'left 0.2s',
                                    }} />
                                  </div>
                                  <span style={{ fontSize: 13, color: editIsPublic ? '#2d5500' : '#888', fontWeight: editIsPublic ? 'bold' : 'normal' }}>
                                    課題一覧に公開する
                                  </span>
                                </label>
                              </div>
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
                                  onClick={() => togglePublic(task.id, task.is_public)}
                                  style={{ padding: '6px 14px', borderRadius: 8, border: `2px solid ${task.is_public ? '#1565c0' : '#2196f3'}`, background: task.is_public ? '#e3f2fd' : '#fff', color: task.is_public ? '#1565c0' : '#1976d2', fontWeight: 'bold', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }}
                                >
                                  {task.is_public ? '非公開にする' : '公開する'}
                                </button>
                                <button
                                  onClick={() => handleDelete(task.id, task.title)}
                                  style={{ padding: '6px 14px', borderRadius: 8, border: '2px solid #c0392b', background: '#fdecea', color: '#c0392b', fontWeight: 'bold', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }}
                                >
                                  削除
                                </button>
                              </div>
                              {/* カスタムコース割り当て */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <label className="game-label" style={{ fontSize: 12, marginBottom: 0, whiteSpace: 'nowrap' }}>カスタムコース</label>
                                <select
                                  className="game-input"
                                  style={{ fontSize: 13, flex: 1 }}
                                  value={taskCourseMap[task.id] ?? ''}
                                  onChange={e => handleCourseAssign(task.id, e.target.value)}
                                >
                                  <option value="">（なし）</option>
                                  {courses.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                  ))}
                                </select>
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

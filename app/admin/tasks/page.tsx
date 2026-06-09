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
  { label: '蜈ｨ繧ｳ繝ｼ繧ｹ', value: '' },
  { label: 'Unity繧ｳ繝ｼ繧ｹ', value: 'Unity' },
  { label: 'Blender繧ｳ繝ｼ繧ｹ', value: 'Blender' },
  { label: 'Web髢狗匱繧ｳ繝ｼ繧ｹ', value: 'Web' },
]

const STAGE_OPTIONS = [
  { label: '蜈ｨ繧ｹ繝・・繧ｸ', value: '' },
  { label: '竇. 蝓ｺ遉・(Foundation)', value: 'Foundation' },
  { label: '竇｡. 蠢懃畑 (Development)', value: 'Development' },
  { label: '竇｢. 螳溯ｷｵ (Production)', value: 'Production' },
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
        繝槭・繧ｯ繝繧ｦ繝ｳ縺ｨ縺励※險ｭ螳壹☆繧・
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

  // 譁ｰ隕丈ｽ懈・繝輔か繝ｼ繝
  const [title, setTitle]                     = useState('')
  const [description, setDescription]         = useState('')
  const [isMarkdown, setIsMarkdown]           = useState(false)
  const [targetCourse, setTargetCourse]       = useState('')
  const [targetStage, setTargetStage]         = useState('')
  const [progressNumber, setProgressNumber]   = useState('')
  const [allowImageAttachment, setAllowImageAttachment] = useState(true)
  const [isPublic, setIsPublic]                         = useState(false)

  // 邱ｨ髮・憾諷・
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

  // 蛻晄悄隱ｲ鬘瑚ｨｭ螳・
  const [initialTasks, setInitialTasks]       = useState<Record<string, string>>({})
  const [initialSaving, setInitialSaving]     = useState<string | null>(null)

  // 譁ｰ隕丈ｽ懈・繧｢繧ｳ繝ｼ繝・ぅ繧ｪ繝ｳ
  const [createOpen, setCreateOpen]         = useState(false)

  // 繧ｳ繝ｼ繧ｹ邂｡逅・
  const [courses, setCourses]                   = useState<TaskCourse[]>([])
  const [courseOpen, setCourseOpen]             = useState(false)
  const [courseExpandedId, setCourseExpandedId] = useState<string | null>(null)
  const [courseTaskOrders, setCourseTaskOrders] = useState<Record<string, string[]>>({})
  const [taskCourseMap, setTaskCourseMap]       = useState<Record<string, string>>({})
  const courseSavingRef                         = useRef(false)
  const saveOrderTimers                         = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const [editingCourseId, setEditingCourseId]   = useState<string | null>(null)
  const [editingCourseName, setEditingCourseName] = useState('')

  // 繧ｳ繝ｼ繧ｹ菴懈・繝輔か繝ｼ繝
  const [newCourseName, setNewCourseName]     = useState('')
  const [newCourseTarget, setNewCourseTarget] = useState('')
  const [newCourseStage, setNewCourseStage]   = useState('')

  // AI 隱ｲ鬘檎函謌・
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

  // 繧｢繧ｳ繝ｼ繝・ぅ繧ｪ繝ｳ & 繝輔ぅ繝ｫ繧ｿ繝ｼ
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
    news_management: false, ticket_admin: false, debug: false, sns_management: false,
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
        if (mounted) setError(`隱ｭ縺ｿ霎ｼ縺ｿ繧ｨ繝ｩ繝ｼ: ${msg}`)
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
      setSuccess('隱ｲ鬘後ｒ菴懈・縺励∪縺励◆・・)
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
    if (!window.confirm(`縲・{taskTitle}縲阪ｒ蜑企勁縺励∪縺吶°・歃n縺薙・謫堺ｽ懊・蜿悶ｊ豸医○縺ｾ縺帙ｓ縲Ａ)) return
    const { error } = await supabase.from('tasks').delete().eq('id', taskId)
    if (!error) {
      setTasks(prev => prev.filter(t => t.id !== taskId))
      // 蛻晄悄隱ｲ鬘後↓險ｭ螳壹＆繧後※縺・◆繧芽ｧ｣髯､
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
      if (!token) throw new Error('繝ｭ繧ｰ繧､繝ｳ縺悟ｿ・ｦ√〒縺・)

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
      if (!res.ok) throw new Error(json.error ?? '逕滓・縺ｫ螟ｱ謨励＠縺ｾ縺励◆')
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
      setAiSuccess('隱ｲ鬘後ｒ逋ｻ骭ｲ縺励∪縺励◆・・)
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
    if (!window.confirm(`縲・{courseName}縲阪ｒ蜑企勁縺励∪縺吶°・歃n隱ｲ鬘瑚・菴薙・蜑企勁縺輔ｌ縺ｾ縺帙ｓ縲Ａ)) return
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

        {/* 繝倥ャ繝繝ｼ */}
        <div style={{
          background: 'linear-gradient(135deg, #1a3a00 0%, #2d5500 55%, #3d6e00 100%)',
          borderRadius: 10, padding: '24px 32px', marginBottom: 24,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(106,172,20,0.18) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <p style={{ color: '#6aac14', fontSize: 10, fontWeight: 'bold', letterSpacing: '0.14em', margin: '0 0 6px' }}>TASK MANAGEMENT</p>
          <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 'bold', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <ClipboardList size={24} />隱ｲ鬘檎ｮ｡逅・
          </h1>
          <p style={{ color: 'rgba(168,216,112,0.8)', fontSize: 13, fontWeight: 'bold', margin: 0 }}>
            隱ｲ鬘梧焚: {tasks.length} 莉ｶ
          </p>
        </div>

        {/* 繧ｳ繝ｼ繧ｹ邂｡逅・*/}
        <div className="game-card" style={{ padding: 0, marginBottom: 24, overflow: 'hidden' }}>
          <div
            onClick={() => setCourseOpen(o => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 28px', cursor: 'pointer', userSelect: 'none' }}
          >
            <span style={{
              fontSize: 13, color: courseOpen ? '#6aac14' : '#888',
              transform: courseOpen ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s', display: 'inline-block', flexShrink: 0,
            }}>笆ｶ</span>
            <span className="game-title" style={{ fontSize: 20, flex: 1 }}>繧ｳ繝ｼ繧ｹ邂｡逅・/span>
          </div>

          {courseOpen && (
            <div style={{ borderTop: '1px solid #d4f0a0', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* 繧ｳ繝ｼ繧ｹ菴懈・繝輔か繝ｼ繝 */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: 2, minWidth: 160 }}>
                  <label className="game-label">繧ｳ繝ｼ繧ｹ蜷・/label>
                  <input
                    className="game-input"
                    type="text"
                    value={newCourseName}
                    onChange={e => setNewCourseName(e.target.value)}
                    placeholder="萓具ｼ壼・蠢・・髄縺繕nity蜈･髢"
                  />
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <label className="game-label">蟇ｾ雎｡繧ｳ繝ｼ繧ｹ</label>
                  <select className="game-input" value={newCourseTarget} onChange={e => setNewCourseTarget(e.target.value)}>
                    {COURSE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <label className="game-label">谿ｵ髫・/label>
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
                  菴懈・
                </button>
              </div>

              {/* 菴懈・貂医∩繧ｳ繝ｼ繧ｹ荳隕ｧ */}
              {courses.length === 0 ? (
                <p style={{ color: '#aaa', fontSize: 13, margin: 0 }}>・医さ繝ｼ繧ｹ縺後∪縺縺ゅｊ縺ｾ縺帙ｓ・・/p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {courses.map(course => {
                    const isSubOpen = courseExpandedId === course.id
                    const orderedTaskIds = courseTaskOrders[course.id] ?? []
                    return (
                      <div key={course.id} style={{ border: '1.5px solid #3d6e00', borderRadius: 10, overflow: 'hidden', background: '#f8fff0' }}>
                        {/* 繧ｵ繝悶・繝・ム繝ｼ */}
                        <div
                          onClick={() => { if (editingCourseId !== course.id) setCourseExpandedId(isSubOpen ? null : course.id) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: editingCourseId === course.id ? 'default' : 'pointer', userSelect: 'none' }}
                        >
                          <span style={{
                            fontSize: 12, color: isSubOpen ? '#6aac14' : '#888',
                            transform: isSubOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s', display: 'inline-block', flexShrink: 0,
                          }}>笆ｶ</span>
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
                              >菫晏ｭ・/button>
                              <button
                                onClick={() => setEditingCourseId(null)}
                                style={{ padding: '3px 10px', borderRadius: 6, border: '1.5px solid #888', background: 'none', color: '#888', fontWeight: 'bold', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}
                              >繧ｭ繝｣繝ｳ繧ｻ繝ｫ</button>
                            </div>
                          ) : (
                            <>
                              <span style={{ fontWeight: 'bold', color: '#2d5500', fontSize: 14, flex: 1 }}>{course.name}</span>
                              <button
                                onClick={e => { e.stopPropagation(); setEditingCourseId(course.id); setEditingCourseName(course.name) }}
                                style={{ padding: '2px 8px', borderRadius: 6, border: '1.5px solid #3d6e00', background: 'white', color: '#3d6e00', fontSize: 11, fontWeight: 'bold', cursor: 'pointer', flexShrink: 0 }}
                              >邱ｨ髮・/button>
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
                        {/* 繧ｵ繝悶・繝・ぅ */}
                        {isSubOpen && (
                          <div style={{ borderTop: '1px solid #d4f0a0', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {orderedTaskIds.length === 0 ? (
                              <p style={{ color: '#aaa', fontSize: 13, margin: 0 }}>・郁ｪｲ鬘後′蜑ｲ繧雁ｽ薙※繧峨ｌ縺ｦ縺・∪縺帙ｓ・・/p>
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
                                      >笆ｲ</button>
                                      <button
                                        onClick={() => handleMoveTask(course.id, tid, 'down')}
                                        disabled={idx === orderedTaskIds.length - 1}
                                        style={{ padding: '2px 8px', borderRadius: 6, border: '1.5px solid #3d6e00', background: idx === orderedTaskIds.length - 1 ? '#eee' : '#e8ffd4', color: idx === orderedTaskIds.length - 1 ? '#bbb' : '#2d5500', cursor: idx === orderedTaskIds.length - 1 ? 'default' : 'pointer', fontSize: 13, fontWeight: 'bold' }}
                                      >笆ｼ</button>
                                    </div>
                                  </div>
                                )
                              })
                            )}
                            <div style={{ borderTop: '1px solid #d4f0a0', marginTop: 6, paddingTop: 10 }}>
                              <button
                                onClick={() => handleDeleteCourse(course.id, course.name)}
                                style={{ padding: '5px 14px', borderRadius: 8, border: '1.5px solid #c0392b', background: '#fdecea', color: '#c0392b', fontWeight: 'bold', fontSize: 12, cursor: 'pointer' }}
                              >繧ｳ繝ｼ繧ｹ繧貞炎髯､</button>
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

        {/* 隱ｲ鬘御ｽ懈・繝輔か繝ｼ繝 */}
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
            }}>笆ｶ</span>
            <span className="game-title" style={{ fontSize: 20, flex: 1 }}>譁ｰ縺励＞隱ｲ鬘後ｒ菴懈・</span>
          </div>
          {createOpen && (
          <div style={{ borderTop: '1px solid #d4f0a0', padding: '20px 28px' }}>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="game-label">隱ｲ鬘後ち繧､繝医Ν *</label>
              <input
                className="game-input"
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                required
                placeholder="萓具ｼ壹く繝｣繝ｩ繧ｯ繧ｿ繝ｼ繝｢繝・Ν繧・菴灘ｮ梧・縺輔○繧医≧"
              />
            </div>

            <div>
              <label className="game-label">隱ｲ鬘後・隱ｬ譏・/label>
              <textarea
                className="game-input"
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={4}
                placeholder="隱ｲ鬘後・隧ｳ邏ｰ繝ｻ蜿り・ｳ・侭繝ｻ謠仙・譚｡莉ｶ縺ｪ縺ｩ繧定ｨ伜・..."
                style={{ resize: 'vertical' }}
              />
              <MarkdownToggle checked={isMarkdown} onChange={setIsMarkdown} />
            </div>

            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <label className="game-label">蟇ｾ雎｡繧ｳ繝ｼ繧ｹ</label>
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
                <label className="game-label">蟇ｾ雎｡繧ｹ繝・・繧ｸ</label>
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
                <label className="game-label">騾ｲ陦檎分蜿ｷ</label>
                <input
                  className="game-input"
                  type="number"
                  step="0.1"
                  min="0"
                  value={progressNumber}
                  onChange={e => setProgressNumber(e.target.value)}
                  placeholder="萓・ 1.0"
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
                  逕ｻ蜒上・豺ｻ莉倥ｒ險ｱ蜿ｯ縺吶ｋ
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
                  隱ｲ鬘御ｸ隕ｧ縺ｫ蜈ｬ髢九☆繧・
                </span>
              </label>
            </div>

            <button className="game-button" type="submit" disabled={submitting} style={{ marginTop: 4 }}>
              {submitting ? '菴懈・荳ｭ窶ｦ' : '隱ｲ鬘後ｒ菴懈・'}
            </button>

            {error   && <div className="game-error">{error}</div>}
            {success && <div className="game-success">{success}</div>}
          </form>
          </div>
          )}
        </div>

        {/* AI 隱ｲ鬘檎函謌・*/}
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
            }}>笆ｶ</span>
            <span className="game-title" style={{ fontSize: 20, flex: 1 }}>AI隱ｲ鬘檎函謌・(Gemini)</span>
            <span style={{ fontSize: 12, color: '#888', background: '#e8ffd4', padding: '2px 10px', borderRadius: 10, fontWeight: 'bold' }}>Beta</span>
          </div>

          {aiOpen && (
            <div style={{ borderTop: '1px solid #d4f0a0', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* 繧ｳ繝ｼ繧ｹ繝ｻ繧ｹ繝・・繧ｸ */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <label className="game-label">蟇ｾ雎｡繧ｳ繝ｼ繧ｹ</label>
                  <select className="game-input" value={aiCourse} onChange={e => { setAiCourse(e.target.value); setAiInputTaskIds([]) }}>
                    {COURSE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <label className="game-label">蟇ｾ雎｡繧ｹ繝・・繧ｸ</label>
                  <select className="game-input" value={aiStage} onChange={e => { setAiStage(e.target.value); setAiInputTaskIds([]) }}>
                    {STAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label className="game-label">逕滓・縺ｮ遞ｮ鬘・/label>
                  <select
                    className="game-input"
                    value={aiGenType}
                    onChange={e => setAiGenType(e.target.value as typeof aiGenType)}
                  >
                    <option value="sequential">騾｣邯夊ｪｲ鬘鯉ｼ磯℃蜴ｻ隱ｲ鬘後・邯壹″・・/option>
                    <option value="individual">蛟句挨隱ｲ鬘鯉ｼ医ユ繝ｼ繝樊欠螳夲ｼ・/option>
                    <option value="event">繧､繝吶Φ繝郁ｪｲ鬘鯉ｼ育洒譎る俣繝ｻ邁｡蜊假ｼ・/option>
                    <option value="custom">謖・ｮ夊ｪｲ鬘鯉ｼ医・繝ｭ繝ｳ繝励ヨ逶ｴ謗･謖・ｮ夲ｼ・/option>
                  </select>
                </div>
              </div>

              {/* 繝・・繝・*/}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <label className="game-label" style={{ marginBottom: 0, flex: 1 }}>
                    {aiGenType === 'custom' ? '繝励Ο繝ｳ繝励ヨ・郁・逕ｱ蜈･蜉幢ｼ・ : '繝・・繝・}
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
                  >{themeSaveSuccess ? '菫晏ｭ俶ｸ医∩ 笨・ : themeSaving ? '菫晏ｭ倅ｸｭ窶ｦ' : '菫晏ｭ・}</button>
                </div>
                <textarea
                  className="game-input"
                  value={aiTheme}
                  onChange={e => setAiTheme(e.target.value)}
                  rows={3}
                  style={{ resize: 'vertical', fontSize: 14 }}
                  placeholder={
                    aiGenType === 'custom'
                      ? '逕滓・縺ｮ謖・､ｺ繧定・逕ｱ縺ｫ險倩ｿｰ縺励※縺上□縺輔＞...'
                      : '萓・ ShaderGraph繧剃ｽｿ縺｣縺溷・縺ｮ繧ｨ繝輔ぉ繧ｯ繝医・56繝昴Μ繧ｴ繝ｳ縺ｧ繧ｭ繝｣繝ｩ繧ｯ繧ｿ繝ｼ繧剃ｽ懊ｋ...'
                  }
                />
                {savedThemes.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#888', whiteSpace: 'nowrap' }}>菫晏ｭ俶ｸ医∩:</span>
                    <select
                      className="game-input"
                      style={{ fontSize: 12, flex: 1 }}
                      value=""
                      onChange={e => { if (e.target.value) setAiTheme(e.target.value) }}
                    >
                      <option value="">笏笏 驕ｸ謚槭＠縺ｦ隱ｭ縺ｿ霎ｼ繧 笏笏</option>
                      {savedThemes.map(t => (
                        <option key={t.id} value={t.content}>
                          {t.content.length > 60 ? t.content.slice(0, 60) + '窶ｦ' : t.content}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* 繧､繝ｳ繝励ャ繝郁ｪｲ鬘鯉ｼ・ustom莉･螟厄ｼ・*/}
              {aiGenType !== 'custom' && (
                <div>
                  <label className="game-label">
                    繧､繝ｳ繝励ャ繝郁ｪｲ鬘・
                    <span style={{ fontSize: 11, fontWeight: 'normal', color: '#888', marginLeft: 8 }}>
                      螟壹￥驕ｸ縺ｶ縺ｻ縺ｩ逕滓・邊ｾ蠎ｦ縺御ｸ翫′繧翫∪縺・
                    </span>
                  </label>
                  {(() => {
                    const filtered = tasks.filter(t =>
                      (!aiCourse || t.target_course === aiCourse) &&
                      (!aiStage  || t.target_stage  === aiStage)
                    )
                    if (filtered.length === 0) return (
                      <p style={{ color: '#aaa', fontSize: 13, margin: 0 }}>・郁ｩｲ蠖薙☆繧玖ｪｲ鬘後′縺ゅｊ縺ｾ縺帙ｓ・・/p>
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

              {/* 繝医げ繝ｫ */}
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                  <div
                    onClick={() => setAiUseMarkdown(v => !v)}
                    style={{ width: 36, height: 20, borderRadius: 10, position: 'relative', transition: 'background 0.2s', background: aiUseMarkdown ? '#6aac14' : '#ccc', flexShrink: 0 }}
                  >
                    <div style={{ position: 'absolute', top: 2, left: aiUseMarkdown ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
                  </div>
                  <span style={{ fontSize: 13, color: aiUseMarkdown ? '#2d5500' : '#888', fontWeight: aiUseMarkdown ? 'bold' : 'normal' }}>繝槭・繧ｯ繝繧ｦ繝ｳ縺ｧ逕滓・</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                  <div
                    onClick={() => setAiAutoProgress(v => !v)}
                    style={{ width: 36, height: 20, borderRadius: 10, position: 'relative', transition: 'background 0.2s', background: aiAutoProgress ? '#6aac14' : '#ccc', flexShrink: 0 }}
                  >
                    <div style={{ position: 'absolute', top: 2, left: aiAutoProgress ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
                  </div>
                  <span style={{ fontSize: 13, color: aiAutoProgress ? '#2d5500' : '#888', fontWeight: aiAutoProgress ? 'bold' : 'normal' }}>
                    騾ｲ陦檎分蜿ｷ繧定・蜍墓険繧雁・縺・
                    {aiAutoProgress && <span style={{ color: '#6aac14', marginLeft: 6 }}>竊・#{suggestProgressNumber(aiCourse, aiStage)}</span>}
                  </span>
                </label>
              </div>

              {/* 逕滓・繝懊ち繝ｳ */}
              <button
                className="game-button"
                onClick={handleGenerate}
                disabled={aiGenerating || (!aiTheme.trim())}
                style={{ background: '#3d6e00', borderColor: '#6aac14' }}
              >
                {aiGenerating ? '逕滓・荳ｭ窶ｦ' : 'AI縺ｧ隱ｲ鬘後ｒ逕滓・'}
              </button>
              {aiError && <div className="game-error" style={{ whiteSpace: 'pre-wrap' }}>{aiError}</div>}

              {/* 逕滓・邨先棡 */}
              {(aiResultTitle || aiResultDescription) && (
                <div style={{ borderTop: '1px dashed #b8d870', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ fontSize: 13, color: '#3d6e00', margin: 0, fontWeight: 'bold' }}>逕滓・邨先棡・育ｷｨ髮・＠縺ｦ逋ｻ骭ｲ縺励※縺上□縺輔＞・・/p>
                  <div>
                    <label className="game-label">隱ｲ鬘後ち繧､繝医Ν</label>
                    <input
                      className="game-input"
                      value={aiResultTitle}
                      onChange={e => setAiResultTitle(e.target.value)}
                      style={{ fontSize: 15 }}
                    />
                  </div>
                  <div>
                    <label className="game-label">隱ｲ鬘後・隱ｬ譏・/label>
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
                    {aiSubmitting ? '逋ｻ骭ｲ荳ｭ窶ｦ' : '縺薙・縺ｾ縺ｾ逋ｻ骭ｲ'}
                  </button>
                  {aiSuccess && <div className="game-success">{aiSuccess}</div>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 隱ｲ鬘御ｸ隕ｧ */}
        <div className="game-card" style={{ padding: '24px 28px' }}>
          <h2 className="game-title" style={{ fontSize: 22, marginBottom: 16 }}>隱ｲ鬘御ｸ隕ｧ</h2>

          {/* 繝輔ぅ繝ｫ繧ｿ繝ｼ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            <input
              className="game-input"
              type="text"
              placeholder="隱ｲ鬘悟錐縺ｧ讀懃ｴ｢窶ｦ"
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
                <option value="all">蜈ｨ縺ｦ</option>
                <option value="active">譛牙柑縺ｮ縺ｿ</option>
                <option value="inactive">蛛懈ｭ｢荳ｭ</option>
              </select>
            </div>
            <select
              className="game-input"
              value={filterCustomCourse}
              onChange={e => setFilterCustomCourse(e.target.value)}
              style={{ fontSize: 13 }}
            >
              <option value="">繧ｫ繧ｹ繧ｿ繝繧ｳ繝ｼ繧ｹ: 蜈ｨ縺ｦ</option>
              {courses.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {tasks.length === 0 ? (
            <p style={{ color: '#6aac14', textAlign: 'center', padding: 24 }}>縺ｾ縺隱ｲ鬘後′縺ゅｊ縺ｾ縺帙ｓ</p>
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
              <p style={{ color: '#6aac14', textAlign: 'center', padding: 24 }}>隧ｲ蠖薙☆繧玖ｪｲ鬘後′縺ゅｊ縺ｾ縺帙ｓ</p>
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
                      {/* 笏笏笏 謚倥ｊ縺溘◆縺ｿ繝倥ャ繝繝ｼ陦・笏笏笏 */}
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
                        }}>笆ｶ</span>
                        <span style={{ fontWeight: 'bold', color: '#2d5500', fontSize: 15, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {task.title}
                        </span>
                        <div style={{ display: 'flex', gap: 5, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {task.progress_number != null && (
                            <span style={{ background: '#a8d870', color: '#1a3a00', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 'bold', whiteSpace: 'nowrap' }}>#{task.progress_number}</span>
                          )}
                          <span style={{ background: '#6aac14', color: 'white', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                            {task.target_course ?? '蜈ｨ繧ｳ繝ｼ繧ｹ'}
                          </span>
                          <span style={{ background: '#3d6e00', color: 'white', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                            {task.target_stage ?? '蜈ｨ繧ｹ繝・・繧ｸ'}
                          </span>
                          <span style={{ background: task.is_public ? '#2196f3' : '#9e9e9e', color: 'white', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                            {task.is_public ? '蜈ｬ髢・ : '髱槫・髢・}
                          </span>
                          {!task.is_active && (
                            <span style={{ background: '#999', color: 'white', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 'bold' }}>蛛懈ｭ｢荳ｭ</span>
                          )}
                          {task.description_is_markdown && (
                            <span style={{ background: '#0288d1', color: 'white', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 'bold' }}>MD</span>
                          )}
                          {!task.allow_image_attachment && (
                            <span style={{ background: '#e65100', color: 'white', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 'bold' }}>逕ｻ蜒乗ｷｻ莉倅ｸ榊庄</span>
                          )}
                        </div>
                      </div>

                      {/* 笏笏笏 螻暮幕驛ｨ蛻・笏笏笏 */}
                      {(isExpanded || isEditing) && (
                        <div style={{ borderTop: '1px solid #d4f0a0', padding: '14px 16px' }}>
                          {isEditing ? (
                            /* 笏笏笏 邱ｨ髮・ヵ繧ｩ繝ｼ繝 笏笏笏 */
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                              <div>
                                <label className="game-label" style={{ fontSize: 12 }}>繧ｿ繧､繝医Ν</label>
                                <input
                                  className="game-input"
                                  value={editTitle}
                                  onChange={e => setEditTitle(e.target.value)}
                                  style={{ fontSize: 14 }}
                                />
                              </div>
                              <div>
                                <label className="game-label" style={{ fontSize: 12 }}>隱ｬ譏・/label>
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
                                  <label className="game-label" style={{ fontSize: 12 }}>蟇ｾ雎｡繧ｳ繝ｼ繧ｹ</label>
                                  <select className="game-input" value={editTargetCourse} onChange={e => setEditTargetCourse(e.target.value)} style={{ fontSize: 13 }}>
                                    {COURSE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                  </select>
                                </div>
                                <div style={{ flex: 1 }}>
                                  <label className="game-label" style={{ fontSize: 12 }}>蟇ｾ雎｡繧ｹ繝・・繧ｸ</label>
                                  <select className="game-input" value={editTargetStage} onChange={e => setEditTargetStage(e.target.value)} style={{ fontSize: 13 }}>
                                    {STAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                  </select>
                                </div>
                                <div style={{ width: 100 }}>
                                  <label className="game-label" style={{ fontSize: 12 }}>騾ｲ陦檎分蜿ｷ</label>
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
                                    逕ｻ蜒上・豺ｻ莉倥ｒ險ｱ蜿ｯ縺吶ｋ
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
                                    隱ｲ鬘御ｸ隕ｧ縺ｫ蜈ｬ髢九☆繧・
                                  </span>
                                </label>
                              </div>
                              {editError && <div className="game-error" style={{ fontSize: 12 }}>{editError}</div>}
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                  onClick={handleSaveEdit}
                                  disabled={editSaving}
                                  style={{ padding: '6px 16px', borderRadius: 8, border: '2px solid #6aac14', background: '#6aac14', color: 'white', fontWeight: 'bold', cursor: 'pointer', fontSize: 13 }}>
                                  {editSaving ? '菫晏ｭ倅ｸｭ窶ｦ' : '菫晏ｭ・}
                                </button>
                                <button
                                  onClick={() => { cancelEdit(); setExpandedId(task.id) }}
                                  style={{ padding: '6px 16px', borderRadius: 8, border: '2px solid #888', background: 'none', color: '#888', fontWeight: 'bold', cursor: 'pointer', fontSize: 13 }}>
                                  繧ｭ繝｣繝ｳ繧ｻ繝ｫ
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* 笏笏笏 隧ｳ邏ｰ陦ｨ遉ｺ 笏笏笏 */
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button
                                  onClick={() => { startEdit(task); setExpandedId(null) }}
                                  style={{ padding: '6px 14px', borderRadius: 8, border: '2px solid #3d6e00', background: 'white', color: '#3d6e00', fontWeight: 'bold', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }}
                                >
                                  邱ｨ髮・
                                </button>
                                <button
                                  onClick={() => toggleActive(task.id, task.is_active)}
                                  style={{ padding: '6px 14px', borderRadius: 8, border: `2px solid ${task.is_active ? '#c0392b' : '#6aac14'}`, background: task.is_active ? '#fdecea' : '#e8ffd4', color: task.is_active ? '#c0392b' : '#1a6e00', fontWeight: 'bold', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }}
                                >
                                  {task.is_active ? '蛛懈ｭ｢縺吶ｋ' : '譛牙柑縺ｫ縺吶ｋ'}
                                </button>
                                <button
                                  onClick={() => togglePublic(task.id, task.is_public)}
                                  style={{ padding: '6px 14px', borderRadius: 8, border: `2px solid ${task.is_public ? '#1565c0' : '#2196f3'}`, background: task.is_public ? '#e3f2fd' : '#fff', color: task.is_public ? '#1565c0' : '#1976d2', fontWeight: 'bold', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }}
                                >
                                  {task.is_public ? '髱槫・髢九↓縺吶ｋ' : '蜈ｬ髢九☆繧・}
                                </button>
                                <button
                                  onClick={() => handleDelete(task.id, task.title)}
                                  style={{ padding: '6px 14px', borderRadius: 8, border: '2px solid #c0392b', background: '#fdecea', color: '#c0392b', fontWeight: 'bold', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }}
                                >
                                  蜑企勁
                                </button>
                              </div>
                              {/* 繧ｫ繧ｹ繧ｿ繝繧ｳ繝ｼ繧ｹ蜑ｲ繧雁ｽ薙※ */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <label className="game-label" style={{ fontSize: 12, marginBottom: 0, whiteSpace: 'nowrap' }}>繧ｫ繧ｹ繧ｿ繝繧ｳ繝ｼ繧ｹ</label>
                                <select
                                  className="game-input"
                                  style={{ fontSize: 13, flex: 1 }}
                                  value={taskCourseMap[task.id] ?? ''}
                                  onChange={e => handleCourseAssign(task.id, e.target.value)}
                                >
                                  <option value="">・医↑縺暦ｼ・/option>
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
                                <p style={{ color: '#aaa', fontSize: 13, margin: 0 }}>・郁ｪｬ譏弱↑縺暦ｼ・/p>
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

        {/* 蛻晄悄隱ｲ鬘瑚ｨｭ螳・*/}
        <div className="game-card" style={{ padding: '24px 28px', marginTop: 24 }}>
          <h2 className="game-title" style={{ fontSize: 22, marginBottom: 6 }}>蛻晄悄隱ｲ鬘瑚ｨｭ螳・/h2>
          <p style={{ color: '#3d6e00', fontSize: 13, marginBottom: 20 }}>
            譁ｰ蜈･驛ｨ蜩｡縺後さ繝ｼ繧ｹ繧帝∈謚槭＠縺溘→縺崎・蜍輔〒蜑ｲ繧雁ｽ薙※繧峨ｌ繧玖ｪｲ鬘後ｒ險ｭ螳壹＠縺ｾ縺吶・
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {(['Unity', 'Blender', 'Web'] as const).map(course => (
              <div key={course} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{
                  minWidth: 110, fontWeight: 'bold', fontSize: 14, color: '#2d5500',
                  background: '#e8ffd4', borderRadius: 8, padding: '4px 12px', textAlign: 'center',
                }}>
                  {course}繧ｳ繝ｼ繧ｹ
                </span>
                <select
                  className="game-input"
                  style={{ flex: 1, fontSize: 14 }}
                  value={initialTasks[course] ?? ''}
                  onChange={e => handleSaveInitialTask(course, e.target.value)}
                  disabled={initialSaving === course}
                >
                  <option value="">・医↑縺暦ｼ・/option>
                  {tasks.filter(t => t.is_active && (!t.target_course || t.target_course === course)).map(t => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
                {initialSaving === course && (
                  <span style={{ fontSize: 12, color: '#6aac14', whiteSpace: 'nowrap' }}>菫晏ｭ倅ｸｭ窶ｦ</span>
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
          竊・繝繝・す繝･繝懊・繝・
        </button>
      </a>
    </div>
  )
}


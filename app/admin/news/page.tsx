"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Cropper from 'react-easy-crop'
import type { Area } from 'react-easy-crop'
import supabase from '../../../lib/supabase'
import { getEffectivePermissions, PermissionKey } from '../../../lib/permissions'
import { Newspaper, FileText, Image as ImageIcon, Link2, ClipboardList, Bot, Search, Check } from 'lucide-react'

type BlockType = 'text' | 'image' | 'link' | 'assignment'

interface BlockDraft {
  draftId: string
  dbId?: string
  type: BlockType
  content: string
  isMarkdown: boolean
  imageFile?: File
  imageUrl?: string
  imagePreview?: string
  linkUrl: string
  linkLabel: string
  taskId: string
}

interface BonTopic {
  id: string
  title: string
  title_color: string
  thumbnail_url: string | null
  thumbnail_aspect_ratio: number
  target_courses: string[]
  is_published: boolean
  created_at: string
}

interface TaskOption {
  id: string
  title: string
  description: string | null
  target_course: string
  target_stage: string
}

const COURSE_OPTIONS = [
  { label: 'Unity繧ｳ繝ｼ繧ｹ', value: 'Unity' },
  { label: 'Blender繧ｳ繝ｼ繧ｹ', value: 'Blender' },
  { label: 'Web繧ｳ繝ｼ繧ｹ', value: 'Web' },
]
const ASPECT_PRESETS = [
  { label: '讓ｪ髟ｷ (16:9)', value: 16 / 9 },
  { label: '豁｣譁ｹ蠖｢ (1:1)', value: 1 },
  { label: '邵ｦ髟ｷ (3:4)',  value: 3 / 4 },
]
const TITLE_COLOR_PRESETS = [
  '#ffffff', '#f0f0f0', '#ffeb3b', '#ff9800', '#f44336',
  '#4caf50', '#2196f3', '#9c27b0', '#1a1a1a', '#3d6e00',
]

async function getCroppedBlob(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const img = new Image()
  img.src = imageSrc
  await new Promise<void>(res => { img.onload = () => res() })
  const canvas = document.createElement('canvas')
  canvas.width  = pixelCrop.width
  canvas.height = pixelCrop.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height)
  return new Promise<Blob>(res => canvas.toBlob(b => res(b!), 'image/jpeg', 0.85))
}

let draftCounter = 0
function newDraftId() { return `draft-${++draftCounter}` }

export default function NewsAdminPage() {
  const router = useRouter()
  const [loading, setLoading]   = useState(true)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [effectivePerms, setEffectivePerms] = useState<Record<PermissionKey, boolean>>({
    course_management: false, task_management: false, point_settings: false,
    submission_review: false, finance: false, timeline_management: false,
    dm_management: false, announcement_management: false, assignment_management: false,
    gimmick_management: false, news_management: false, dev_management: false, ticket_admin: false, debug: false, sns_management: false,
  })

  const [topics, setTopics]   = useState<BonTopic[]>([])
  const [allTasks, setAllTasks] = useState<TaskOption[]>([])

  // 笏笏 繝輔か繝ｼ繝 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
  const [editId, setEditId]             = useState<string | null>(null)
  const [formTitle, setFormTitle]       = useState('')
  const [titleColor, setTitleColor]     = useState('#ffffff')
  const [targetCourses, setTargetCourses] = useState<string[]>([])
  const [isPublished, setIsPublished]   = useState(true)
  const [blocks, setBlocks]             = useState<BlockDraft[]>([])

  // 笏笏 繧ｵ繝繝阪う繝ｫ 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
  const [thumbSrc, setThumbSrc]             = useState<string | null>(null)  // for cropper (data URL)
  const [thumbPreview, setThumbPreview]     = useState<string | null>(null)  // after crop
  const [existingThumbUrl, setExistingThumbUrl] = useState<string | null>(null)
  const [cropOpen, setCropOpen]             = useState(false)
  const [aspectRatio, setAspectRatio]       = useState(16 / 9)
  const [crop, setCrop]                     = useState({ x: 0, y: 0 })
  const [zoom, setZoom]                     = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [croppedBlob, setCroppedBlob]       = useState<Blob | null>(null)
  const [croppedAspect, setCroppedAspect]   = useState(16 / 9)

  // 笏笏 AI繧ｹ繝・・繧ｷ繝ｧ繝ｳ 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
  const [aiCandidates, setAiCandidates] = useState<string[]>([])
  const [aiSearchTerm, setAiSearchTerm] = useState('')
  const [aiMaxTokens, setAiMaxTokens]   = useState(2000)
  const [aiInput, setAiInput]           = useState('')
  const [aiPrompt, setAiPrompt]         = useState('')
  const [aiOutput, setAiOutput]         = useState('')
  const [aiLoading, setAiLoading]       = useState(false)
  const [aiError, setAiError]           = useState<string | null>(null)
  const [aiTaskCourse, setAiTaskCourse] = useState('')
  const [aiTaskStage, setAiTaskStage]   = useState('')
  const [aiTaskIds, setAiTaskIds]       = useState<string[]>([])

  // 笏笏 菫晏ｭ・笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
  const [saving, setSaving]     = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 笏笏 蛻晄悄蛹・笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
  useEffect(() => {
    async function init() {
      const { data, error } = await supabase.auth.getUser()
      if (error || !data?.user) { router.replace('/login'); return }
      const uid = data.user.id

      const [profileRes, permsRes, topicsRes, tasksRes] = await Promise.all([
        supabase.from('profiles').select('role').eq('id', uid).single(),
        getEffectivePermissions(uid),
        supabase.from('bon_topics').select('*').order('created_at', { ascending: false }),
        supabase.from('tasks').select('id, title, description, target_course, target_stage').order('created_at', { ascending: false }),
      ])

      const role = profileRes.data?.role ?? null
      setUserRole(role)
      setEffectivePerms(permsRes)

      if (role !== 'admin' && !permsRes.news_management) {
        router.replace('/dashboard'); return
      }

      setTopics(topicsRes.data ?? [])
      setAllTasks(tasksRes.data ?? [])
      setLoading(false)
    }
    init()
  }, [router])

  // 笏笏 繝倥Ν繝代・ 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
  const isAdmin = userRole === 'admin'

  function resetForm() {
    setEditId(null)
    setFormTitle('')
    setTitleColor('#ffffff')
    setTargetCourses([])
    setIsPublished(true)
    setBlocks([])
    setThumbSrc(null)
    setThumbPreview(null)
    setExistingThumbUrl(null)
    setCroppedBlob(null)
    setCroppedAspect(16 / 9)
    setAspectRatio(16 / 9)
    setSaveError(null)
  }

  async function startEdit(topic: BonTopic) {
    resetForm()
    setEditId(topic.id)
    setFormTitle(topic.title)
    setTitleColor(topic.title_color)
    setTargetCourses(topic.target_courses ?? [])
    setIsPublished(topic.is_published)
    setExistingThumbUrl(topic.thumbnail_url)
    setCroppedAspect(topic.thumbnail_aspect_ratio ?? 16 / 9)

    const { data: blkData } = await supabase
      .from('bon_topic_blocks')
      .select('*')
      .eq('topic_id', topic.id)
      .order('sort_order')

    setBlocks((blkData ?? []).map(b => ({
      draftId:    newDraftId(),
      dbId:       b.id,
      type:       b.type as BlockType,
      content:    b.content ?? '',
      isMarkdown: b.is_markdown ?? false,
      imageUrl:   b.image_url ?? undefined,
      imagePreview: b.image_url ?? undefined,
      linkUrl:    b.link_url ?? '',
      linkLabel:  b.link_label ?? '',
      taskId:     b.task_id ?? '',
    })))
  }

  function addBlock(type: BlockType) {
    setBlocks(prev => [...prev, {
      draftId: newDraftId(), type,
      content: '', isMarkdown: false,
      linkUrl: '', linkLabel: '', taskId: '',
    }])
  }

  function updateBlock(draftId: string, patch: Partial<BlockDraft>) {
    setBlocks(prev => prev.map(b => b.draftId === draftId ? { ...b, ...patch } : b))
  }

  function moveBlock(draftId: string, dir: -1 | 1) {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.draftId === draftId)
      if (idx + dir < 0 || idx + dir >= prev.length) return prev
      const arr = [...prev]
      ;[arr[idx], arr[idx + dir]] = [arr[idx + dir], arr[idx]]
      return arr
    })
  }

  function removeBlock(draftId: string) {
    setBlocks(prev => prev.filter(b => b.draftId !== draftId))
  }

  // 笏笏 繧ｵ繝繝阪う繝ｫ繝医Μ繝溘Φ繧ｰ 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels)
  }, [])

  async function applyCrop() {
    if (!thumbSrc || !croppedAreaPixels) return
    const blob = await getCroppedBlob(thumbSrc, croppedAreaPixels)
    setCroppedBlob(blob)
    setCroppedAspect(croppedAreaPixels.width / croppedAreaPixels.height)
    setThumbPreview(URL.createObjectURL(blob))
    setCropOpen(false)
  }

  // 笏笏 AI繧ｹ繝・・繧ｷ繝ｧ繝ｳ髢｢謨ｰ 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
  async function callGenerateNews(body: object) {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token ?? ''
    const res = await fetch('/api/generate-news', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const e = await res.json()
      throw new Error(e.error ?? 'API繧ｨ繝ｩ繝ｼ')
    }
    return res.json()
  }

  async function handleResearch() {
    if (!aiSearchTerm.trim()) return
    setAiLoading(true); setAiError(null)
    try {
      const data = await callGenerateNews({ mode: 'research', searchTerm: aiSearchTerm, maxTokens: aiMaxTokens }) as { candidates: string[] }
      setAiCandidates(data.candidates)
    } catch (e: unknown) { setAiError((e as Error).message) }
    finally { setAiLoading(false) }
  }

  async function handleSelectCandidate(t: string) {
    setAiLoading(true); setAiError(null)
    try {
      const data = await callGenerateNews({ mode: 'detail', title: t, maxTokens: aiMaxTokens }) as { text: string }
      setAiInput(data.text); setAiCandidates([])
    } catch (e: unknown) { setAiError((e as Error).message) }
    finally { setAiLoading(false) }
  }

  async function handleGenerateFromTask() {
    if (aiTaskIds.length === 0) return
    setAiLoading(true); setAiError(null)
    try {
      const selectedTasks = allTasks
        .filter(t => aiTaskIds.includes(t.id))
        .map(t => ({ title: t.title, description: t.description }))
      const data = await callGenerateNews({
        mode: 'task', course: aiTaskCourse, stage: aiTaskStage,
        tasks: selectedTasks, maxTokens: aiMaxTokens,
      }) as { text: string }
      setAiInput(data.text)
    } catch (e: unknown) { setAiError((e as Error).message) }
    finally { setAiLoading(false) }
  }

  async function handleRefine() {
    if (!aiInput.trim() || !aiPrompt.trim()) return
    setAiLoading(true); setAiError(null)
    try {
      const data = await callGenerateNews({ mode: 'refine', input: aiInput, prompt: aiPrompt, maxTokens: aiMaxTokens }) as { text: string }
      setAiOutput(data.text)
    } catch (e: unknown) { setAiError((e as Error).message) }
    finally { setAiLoading(false) }
  }

  async function handleMarkdown() {
    if (!aiInput.trim()) return
    setAiLoading(true); setAiError(null)
    try {
      const data = await callGenerateNews({ mode: 'markdown', input: aiInput, maxTokens: aiMaxTokens }) as { text: string }
      setAiOutput(data.text)
    } catch (e: unknown) { setAiError((e as Error).message) }
    finally { setAiLoading(false) }
  }

  // 笏笏 菫晏ｭ・笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
  async function handleSave() {
    if (!formTitle.trim()) { setSaveError('繧ｿ繧､繝医Ν繧貞・蜉帙＠縺ｦ縺上□縺輔＞'); return }
    setSaving(true); setSaveError(null); setSaveSuccess(false)

    let topicId = editId

    // 1. bon_topics upsert
    const topicPayload: Record<string, unknown> = {
      title: formTitle.trim(),
      title_color: titleColor,
      target_courses: targetCourses,
      is_published: isPublished,
      thumbnail_aspect_ratio: croppedAspect,
    }
    if (topicId) {
      const { error } = await supabase.from('bon_topics').update(topicPayload).eq('id', topicId)
      if (error) { setSaveError(error.message); setSaving(false); return }
    } else {
      const { data, error } = await supabase.from('bon_topics').insert(topicPayload).select('id').single()
      if (error || !data) { setSaveError(error?.message ?? 'insert failed'); setSaving(false); return }
      topicId = data.id
      setEditId(topicId)
    }

    // 2. 繧ｵ繝繝阪う繝ｫ繧｢繝・・繝ｭ繝ｼ繝・
    if (croppedBlob && topicId) {
      const { data: upData, error: upErr } = await supabase.storage
        .from('media')
        .upload(`bon-topics/${topicId}.jpg`, croppedBlob, { upsert: true, contentType: 'image/jpeg' })
      if (!upErr && upData) {
        const { data: urlData } = supabase.storage.from('media').getPublicUrl(upData.path)
        await supabase.from('bon_topics').update({ thumbnail_url: urlData.publicUrl }).eq('id', topicId)
      }
    }

    // 3. 繝悶Ο繝・け菫晏ｭ假ｼ亥・蜑企勁竊貞・ insert・・
    await supabase.from('bon_topic_blocks').delete().eq('topic_id', topicId)

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i]
      let imageUrl = b.imageUrl ?? null

      // 逕ｻ蜒上ヶ繝ｭ繝・け縺ｮ繧｢繝・・繝ｭ繝ｼ繝・
      if (b.type === 'image' && b.imageFile) {
        const ext = b.imageFile.name.split('.').pop() ?? 'jpg'
        const path = `bon-topics-blocks/${topicId}-${i}.${ext}`
        const { data: iUp, error: iErr } = await supabase.storage
          .from('media').upload(path, b.imageFile, { upsert: true })
        if (!iErr && iUp) {
          const { data: iUrl } = supabase.storage.from('media').getPublicUrl(iUp.path)
          imageUrl = iUrl.publicUrl
        }
      }

      await supabase.from('bon_topic_blocks').insert({
        topic_id:   topicId,
        type:       b.type,
        sort_order: i,
        content:    b.type === 'text'       ? b.content  : null,
        is_markdown: b.type === 'text'      ? b.isMarkdown : false,
        image_url:  b.type === 'image'      ? imageUrl   : null,
        link_url:   b.type === 'link'       ? b.linkUrl  : null,
        link_label: b.type === 'link'       ? b.linkLabel: null,
        task_id:    b.type === 'assignment' ? (b.taskId || null) : null,
      })
    }

    // 4. 荳隕ｧ譖ｴ譁ｰ
    const { data: refreshed } = await supabase.from('bon_topics').select('*').order('created_at', { ascending: false })
    setTopics(refreshed ?? [])

    setSaving(false)
    setSaveSuccess(true)
    if (successTimer.current) clearTimeout(successTimer.current)
    successTimer.current = setTimeout(() => setSaveSuccess(false), 3000)
  }

  async function handleDelete(id: string) {
    if (!confirm('縺薙・險倅ｺ九ｒ蜑企勁縺励∪縺吶°・・)) return
    await supabase.from('bon_topics').delete().eq('id', id)
    setTopics(prev => prev.filter(t => t.id !== id))
    if (editId === id) resetForm()
  }

  async function togglePublish(topic: BonTopic) {
    await supabase.from('bon_topics').update({ is_published: !topic.is_published }).eq('id', topic.id)
    setTopics(prev => prev.map(t => t.id === topic.id ? { ...t, is_published: !t.is_published } : t))
  }

  if (loading) return <div style={{ color: '#a8d870', textAlign: 'center', marginTop: 80 }}>隱ｭ縺ｿ霎ｼ縺ｿ荳ｭ窶ｦ</div>

  const labelStyle: React.CSSProperties = { fontSize: 12, color: '#3d6e00', fontWeight: 'bold', marginBottom: 4, display: 'block' }
  const sectionGap: React.CSSProperties = { marginBottom: 16 }

  return (
    <div style={{ minHeight: '100vh', padding: '56px 24px 48px', maxWidth: 900, margin: '0 auto' }}>
      {/* 謌ｻ繧九・繧ｿ繝ｳ */}
      <button
        onClick={() => router.push('/dashboard')}
        style={{ position: 'fixed', top: 20, left: 16, zIndex: 50, background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer', textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}
      >竊・/button>

      <div>
        <div className="game-card" style={{ marginBottom: 24, padding: '16px 20px' }}>
          <h1 className="game-title" style={{ fontSize: 20, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}><Newspaper size={18}/>繝九Η繝ｼ繧ｹ邂｡逅・/h1>
          <p style={{ fontSize: 12, color: '#6aac14', margin: 0 }}>BON-TOPICS縺ｮ險倅ｺ九ｒ菴懈・繝ｻ邱ｨ髮・＠縺ｾ縺・/p>
        </div>

        {/* 荳頑ｮｵ: 邱ｨ髮・ヵ繧ｩ繝ｼ繝 + AI繧ｹ繝・・繧ｷ繝ｧ繝ｳ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 16 }}>

          {/* 笏笏 邱ｨ髮・ヵ繧ｩ繝ｼ繝 笏笏 */}
          <div className="game-card" style={{ padding: '20px 24px' }}>
            <h2 style={{ fontSize: 16, color: '#3d6e00', fontWeight: 'bold', marginBottom: 16 }}>
              {editId ? '險倅ｺ九ｒ邱ｨ髮・ : '譁ｰ縺励＞險倅ｺ九ｒ菴懈・'}
            </h2>

            {saveError && <div className="game-error" style={{ marginBottom: 12 }}>{saveError}</div>}
            {saveSuccess && <div className="game-success" style={{ marginBottom: 12 }}>菫晏ｭ倥＠縺ｾ縺励◆・・/div>}

            {/* 繧ｿ繧､繝医Ν */}
            <div style={sectionGap}>
              <label style={labelStyle}>繧ｿ繧､繝医Ν</label>
              <input className="game-input" value={formTitle} onChange={e => setFormTitle(e.target.value)}
                placeholder="險倅ｺ九ち繧､繝医Ν繧貞・蜉・ style={{ width: '100%', fontSize: 14 }} />
            </div>

            {/* 繧ｿ繧､繝医Ν濶ｲ */}
            <div style={sectionGap}>
              <label style={labelStyle}>繧ｿ繧､繝医Ν譁・ｭ苓牡</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {TITLE_COLOR_PRESETS.map(c => (
                  <button key={c} onClick={() => setTitleColor(c)}
                    style={{ width: 28, height: 28, borderRadius: 6, background: c, border: titleColor === c ? '3px solid #6aac14' : '2px solid #ccc', cursor: 'pointer', flexShrink: 0 }} />
                ))}
                <input type="color" value={titleColor} onChange={e => setTitleColor(e.target.value)}
                  style={{ width: 36, height: 28, border: '2px solid #3d6e00', borderRadius: 6, cursor: 'pointer', padding: 0 }} />
                <span style={{ fontSize: 11, color: '#6aac14' }}>{titleColor}</span>
              </div>
            </div>

            {/* 繧ｵ繝繝阪う繝ｫ */}
            <div style={sectionGap}>
              <label style={labelStyle}>繧ｵ繝繝阪う繝ｫ</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                {ASPECT_PRESETS.map(p => (
                  <button key={p.label} onClick={() => setAspectRatio(p.value)}
                    className={aspectRatio === p.value ? 'game-button' : ''}
                    style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '2px solid #3d6e00', background: aspectRatio === p.value ? '#3d6e00' : '#f0fae0', color: aspectRatio === p.value ? '#fff' : '#3d6e00', cursor: 'pointer' }}
                  >{p.label}</button>
                ))}
              </div>
              <input type="file" accept="image/*" onChange={e => {
                const f = e.target.files?.[0]
                if (!f) return
                const reader = new FileReader()
                reader.onload = ev => { setThumbSrc(ev.target?.result as string); setCropOpen(true) }
                reader.readAsDataURL(f)
                e.target.value = ''
              }} style={{ fontSize: 13, color: '#3d6e00' }} />
              {(thumbPreview || existingThumbUrl) && (
                <div style={{ marginTop: 8, position: 'relative', display: 'inline-block' }}>
                  <img src={thumbPreview ?? existingThumbUrl!} alt="thumb"
                    style={{ height: 80, borderRadius: 8, border: '2px solid #c8e89a', objectFit: 'cover' }} />
                  {thumbPreview && (
                    <button onClick={() => { setCroppedBlob(null); setThumbPreview(null) }}
                      style={{ position: 'absolute', top: -6, right: -6, background: '#e74c3c', color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, fontSize: 10, cursor: 'pointer', lineHeight: '18px', textAlign: 'center' }}>ﾃ・/button>
                  )}
                </div>
              )}
            </div>

            {/* 蟇ｾ雎｡繧ｳ繝ｼ繧ｹ */}
            <div style={sectionGap}>
              <label style={labelStyle}>蟇ｾ雎｡繧ｳ繝ｼ繧ｹ <span style={{ fontWeight: 'normal', color: '#6aac14' }}>(譛ｪ驕ｸ謚・蜈ｨ繧ｳ繝ｼ繧ｹ蜷代￠)</span></label>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {COURSE_OPTIONS.map(c => (
                  <label key={c.value} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer', color: '#3d6e00' }}>
                    <input type="checkbox" checked={targetCourses.includes(c.value)}
                      onChange={e => setTargetCourses(prev => e.target.checked ? [...prev, c.value] : prev.filter(x => x !== c.value))} />
                    {c.label}
                  </label>
                ))}
              </div>
            </div>

            {/* 蜈ｬ髢玖ｨｭ螳・*/}
            <div style={{ ...sectionGap, display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>蜈ｬ髢九☆繧・/label>
              <div onClick={() => setIsPublished(p => !p)}
                style={{ width: 44, height: 24, borderRadius: 12, background: isPublished ? '#6aac14' : '#ccc', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
                <div style={{ position: 'absolute', top: 2, left: isPublished ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
              </div>
            </div>

            {/* 繝悶Ο繝・け繧ｨ繝・ぅ繧ｿ */}
            <div style={{ ...sectionGap, marginTop: 20 }}>
              <label style={labelStyle}>繧ｳ繝ｳ繝・Φ繝・ヶ繝ｭ繝・け</label>

              {blocks.map((b, idx) => (
                <div key={b.draftId} style={{ border: '2px solid #c8e89a', borderRadius: 8, padding: 12, marginBottom: 8, background: '#f8fef0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 'bold', color: '#3d6e00', background: '#c8e89a', borderRadius: 4, padding: '2px 6px' }}>
                      {b.type === 'text' ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><FileText size={10}/>繝・く繧ｹ繝・/span>
                        : b.type === 'image' ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><ImageIcon size={10}/>逕ｻ蜒・/span>
                        : b.type === 'link' ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Link2 size={10}/>繝ｪ繝ｳ繧ｯ</span>
                        : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><ClipboardList size={10}/>隱ｲ鬘・/span>
                      }
                    </span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                      <button onClick={() => moveBlock(b.draftId, -1)} disabled={idx === 0}
                        style={{ fontSize: 12, padding: '2px 8px', border: '1px solid #3d6e00', borderRadius: 4, background: '#fff', cursor: 'pointer', color: '#3d6e00' }}>竊・/button>
                      <button onClick={() => moveBlock(b.draftId, 1)} disabled={idx === blocks.length - 1}
                        style={{ fontSize: 12, padding: '2px 8px', border: '1px solid #3d6e00', borderRadius: 4, background: '#fff', cursor: 'pointer', color: '#3d6e00' }}>竊・/button>
                      <button onClick={() => removeBlock(b.draftId)}
                        style={{ fontSize: 12, padding: '2px 8px', border: '1px solid #e74c3c', borderRadius: 4, background: '#fff', cursor: 'pointer', color: '#e74c3c' }}>蜑企勁</button>
                    </div>
                  </div>

                  {b.type === 'text' && (
                    <>
                      <textarea className="game-input" value={b.content}
                        onChange={e => updateBlock(b.draftId, { content: e.target.value })}
                        rows={4} style={{ width: '100%', fontSize: 13, resize: 'vertical' }}
                        placeholder="繝・く繧ｹ繝医ｒ蜈･蜉帚ｦ" />
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#3d6e00', cursor: 'pointer', marginTop: 4 }}>
                        <input type="checkbox" checked={b.isMarkdown} onChange={e => updateBlock(b.draftId, { isMarkdown: e.target.checked })} />
                        繝槭・繧ｯ繝繧ｦ繝ｳ縺ｧ險倩ｿｰ
                      </label>
                    </>
                  )}

                  {b.type === 'image' && (
                    <div>
                      <input type="file" accept="image/*" onChange={e => {
                        const f = e.target.files?.[0]
                        if (!f) return
                        updateBlock(b.draftId, { imageFile: f, imagePreview: URL.createObjectURL(f) })
                        e.target.value = ''
                      }} style={{ fontSize: 13, color: '#3d6e00' }} />
                      {(b.imagePreview || b.imageUrl) && (
                        <img src={b.imagePreview ?? b.imageUrl}
                          style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', marginTop: 8, border: '2px solid #c8e89a' }} alt="img" />
                      )}
                    </div>
                  )}

                  {b.type === 'link' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <input className="game-input" value={b.linkUrl}
                        onChange={e => updateBlock(b.draftId, { linkUrl: e.target.value })}
                        placeholder="https://..." style={{ fontSize: 13 }} />
                      <input className="game-input" value={b.linkLabel}
                        onChange={e => updateBlock(b.draftId, { linkLabel: e.target.value })}
                        placeholder="繝ｪ繝ｳ繧ｯ縺ｮ繝ｩ繝吶Ν" style={{ fontSize: 13 }} />
                    </div>
                  )}

                  {b.type === 'assignment' && (
                    <select className="game-input" value={b.taskId}
                      onChange={e => updateBlock(b.draftId, { taskId: e.target.value })}
                      style={{ width: '100%', fontSize: 13 }}>
                      <option value="">-- 隱ｲ鬘後ｒ驕ｸ謚・--</option>
                      {allTasks.map(t => (
                        <option key={t.id} value={t.id}>{t.title}・・t.target_course || '蜈ｨ繧ｳ繝ｼ繧ｹ'} / {t.target_stage || '蜈ｨ繧ｹ繝・・繧ｸ'}・・/option>
                      ))}
                    </select>
                  )}
                </div>
              ))}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {([['text', '繝・く繧ｹ繝・], ['image', '逕ｻ蜒・], ['link', '繝ｪ繝ｳ繧ｯ'], ['assignment', '隱ｲ鬘・]] as [BlockType, string][]).map(([t, label]) => {
                  const BIcon = t === 'text' ? FileText : t === 'image' ? ImageIcon : t === 'link' ? Link2 : ClipboardList
                  return (
                    <button key={t} onClick={() => addBlock(t)}
                      style={{ fontSize: 12, padding: '5px 12px', border: '2px dashed #3d6e00', borderRadius: 6, background: '#f0fae0', color: '#3d6e00', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      + <BIcon size={12}/>{label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="game-button" onClick={handleSave} disabled={saving} style={{ flex: 1 }}>
                {saving ? '菫晏ｭ倅ｸｭ窶ｦ' : editId ? '譖ｴ譁ｰ縺吶ｋ' : '菴懈・縺吶ｋ'}
              </button>
              {editId && (
                <button onClick={resetForm}
                  style={{ padding: '10px 16px', border: '2px solid #3d6e00', borderRadius: 8, background: '#fff', color: '#3d6e00', cursor: 'pointer', fontSize: 14 }}>
                  繧ｭ繝｣繝ｳ繧ｻ繝ｫ
                </button>
              )}
            </div>
          </div>

          {/* 笏笏 AI繧ｹ繝・・繧ｷ繝ｧ繝ｳ 笏笏 */}
          <div className="game-card" style={{ padding: '20px 24px' }}>
            <h2 style={{ fontSize: 16, color: '#3d6e00', fontWeight: 'bold', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}><Bot size={15}/>AI繧ｹ繝・・繧ｷ繝ｧ繝ｳ</h2>

            {aiError && <div className="game-error" style={{ marginBottom: 12 }}>{aiError}</div>}

            {/* 繝医・繧ｯ繝ｳ繧ｹ繝ｩ繧､繝繝ｼ */}
            <div style={sectionGap}>
              <label style={labelStyle}>逕滓・繝医・繧ｯ繝ｳ荳企剞: <strong>{aiMaxTokens.toLocaleString()}</strong></label>
              <input type="range" min={500} max={8000} step={500} value={aiMaxTokens}
                onChange={e => setAiMaxTokens(Number(e.target.value))}
                style={{ width: '100%', marginBottom: 2 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#6aac14' }}>
                <span>500・育洒繧・ｼ・/span><span>8,000・磯聞繧・ｼ・/span>
              </div>
            </div>

            {/* A. 繧ｭ繝ｼ繝ｯ繝ｼ繝峨Μ繧ｵ繝ｼ繝・*/}
            <div style={sectionGap}>
              <label style={labelStyle}>A. 繧ｭ繝ｼ繝ｯ繝ｼ繝峨Μ繧ｵ繝ｼ繝・/label>
              <input className="game-input" value={aiSearchTerm}
                onChange={e => setAiSearchTerm(e.target.value)}
                placeholder="萓・ Claude Code 荳ｦ蛻鈴幕逋ｺ縲ゞnity 6 譁ｰ讖溯・窶ｦ"
                style={{ width: '100%', fontSize: 13, marginBottom: 8 }}
                onKeyDown={e => { if (e.key === 'Enter' && aiSearchTerm.trim()) handleResearch() }} />
              <button className="game-button" onClick={handleResearch}
                disabled={aiLoading || !aiSearchTerm.trim()}
                style={{ width: 'auto', padding: '8px 16px', fontSize: 13 }}>
                {aiLoading && aiCandidates.length === 0 ? '逕滓・荳ｭ窶ｦ' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Search size={13}/>繝ｪ繧ｵ繝ｼ繝・/span>}
              </button>
              {aiCandidates.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <p style={{ fontSize: 12, color: '#3d6e00', marginBottom: 6 }}>繧ｿ繧､繝医Ν蛟呵｣懶ｼ医け繝ｪ繝・け縺ｧ隧ｳ邏ｰ逕滓・・・</p>
                  {aiCandidates.map((c, i) => (
                    <button key={i} onClick={() => handleSelectCandidate(c)} disabled={aiLoading}
                      style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 4, padding: '6px 10px',
                        border: '1px solid #6aac14', borderRadius: 6, background: '#f0fae0', color: '#1a3a00',
                        cursor: 'pointer', fontSize: 13 }}>
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* B. 隱ｲ鬘後・繝ｼ繧ｹ險倅ｺ狗函謌・*/}
            <div style={sectionGap}>
              <label style={labelStyle}>B. 隱ｲ鬘後・繝ｼ繧ｹ險倅ｺ狗函謌・/label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <select className="game-input" style={{ flex: 1, fontSize: 12 }}
                  value={aiTaskCourse}
                  onChange={e => { setAiTaskCourse(e.target.value); setAiTaskIds([]) }}>
                  <option value="">蜈ｨ繧ｳ繝ｼ繧ｹ</option>
                  {['Unity', 'Blender', 'Web'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select className="game-input" style={{ flex: 1, fontSize: 12 }}
                  value={aiTaskStage}
                  onChange={e => { setAiTaskStage(e.target.value); setAiTaskIds([]) }}>
                  <option value="">蜈ｨ繧ｹ繝・・繧ｸ</option>
                  {['Foundation', 'Development', 'Production'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {(() => {
                const filtered = allTasks.filter(t =>
                  (!aiTaskCourse || t.target_course === aiTaskCourse) &&
                  (!aiTaskStage  || t.target_stage  === aiTaskStage)
                )
                return (
                  <>
                    <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid #c8e89a', borderRadius: 6, padding: '6px 8px', background: '#f8fef0', marginBottom: 8 }}>
                      {filtered.length === 0
                        ? <p style={{ fontSize: 12, color: '#aaa', margin: 0 }}>蟇ｾ雎｡隱ｲ鬘後↑縺・/p>
                        : filtered.map(t => (
                          <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#2d5500', cursor: 'pointer', marginBottom: 4 }}>
                            <input type="checkbox"
                              checked={aiTaskIds.includes(t.id)}
                              onChange={e => setAiTaskIds(prev => e.target.checked ? [...prev, t.id] : prev.filter(id => id !== t.id))} />
                            {t.title}
                          </label>
                        ))
                      }
                    </div>
                    <button className="game-button" onClick={handleGenerateFromTask}
                      disabled={aiLoading || aiTaskIds.length === 0}
                      style={{ width: 'auto', padding: '8px 16px', fontSize: 13 }}>
                      {aiLoading && aiTaskIds.length > 0 ? '逕滓・荳ｭ窶ｦ' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><ClipboardList size={13}/>隱ｲ鬘後・繝ｼ繧ｹ縺ｧ險倅ｺ狗函謌須aiTaskIds.length > 0 ? `・・{aiTaskIds.length}莉ｶ・荏 : ''}</span>}
                    </button>
                  </>
                )
              })()}
            </div>

            {/* C. 蜈･蜉帙だ繝ｼ繝ｳ */}
            <div style={sectionGap}>
              <label style={labelStyle}>C. 蜈･蜉帙だ繝ｼ繝ｳ</label>
              <textarea value={aiInput} onChange={e => setAiInput(e.target.value)} rows={8}
                className="game-input" style={{ width: '100%', fontSize: 12, resize: 'vertical' }}
                placeholder="繝ｪ繧ｵ繝ｼ繝∫ｵ先棡 or 逶ｴ謗･蜈･蜉帚ｦ" />
            </div>

            {/* 繝励Ο繝ｳ繝励ヨ + 螳溯｡・*/}
            <div style={sectionGap}>
              <label style={labelStyle}>繝励Ο繝ｳ繝励ヨ・井ｿｮ豁｣謖・､ｺ・・/label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                  className="game-input" style={{ flex: 1, fontSize: 13 }}
                  placeholder="萓・ 繧ゅ▲縺ｨ蛻晏ｿ・・髄縺代↓縲∫ｮ・擅譖ｸ縺阪ｒ蠅励ｄ縺励※窶ｦ"
                  onKeyDown={e => { if (e.key === 'Enter') handleRefine() }} />
                <button className="game-button" onClick={handleRefine}
                  disabled={aiLoading || !aiInput.trim() || !aiPrompt.trim()}
                  style={{ width: 'auto', padding: '8px 14px', fontSize: 13 }}>
                  {aiLoading && aiPrompt.trim() ? '逕滓・荳ｭ窶ｦ' : '螳溯｡・}
                </button>
              </div>
            </div>

            {/* 蜃ｺ蜉帙だ繝ｼ繝ｳ */}
            <div style={sectionGap}>
              <label style={labelStyle}>蜃ｺ蜉帙だ繝ｼ繝ｳ</label>
              <textarea readOnly value={aiOutput} rows={8}
                style={{ width: '100%', fontSize: 12, background: '#f0fae0', border: '2px solid #c8e89a',
                  borderRadius: 8, padding: '8px 10px', resize: 'vertical', color: '#1a3a00', boxSizing: 'border-box' }}
                placeholder="蜃ｺ蜉帷ｵ先棡縺後％縺薙↓陦ｨ遉ｺ縺輔ｌ縺ｾ縺・ />
              {aiOutput && (
                <button onClick={() => { setAiInput(aiOutput); setAiPrompt(''); setAiOutput('') }}
                  style={{ marginTop: 6, padding: '6px 14px', border: '2px solid #3d6e00', borderRadius: 6,
                    background: '#3d6e00', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 'bold' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={13}/>遒ｺ螳夲ｼ亥・蜉帙↓驕ｩ逕ｨ・・/span>
                </button>
              )}
            </div>

            {/* D. 繝槭・繧ｯ繝繧ｦ繝ｳ蜃ｺ蜉・*/}
            <button className="game-button" onClick={handleMarkdown}
              disabled={aiLoading || !aiInput.trim()}
              style={{ width: 'auto', padding: '8px 16px', fontSize: 13 }}>
              {aiLoading && !aiPrompt.trim() && aiInput.trim() ? '逕滓・荳ｭ窶ｦ' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><ClipboardList size={13}/>D. 繝槭・繧ｯ繝繧ｦ繝ｳ蜃ｺ蜉・/span>}
            </button>
          </div>

        </div>{/* /荳頑ｮｵ繧ｰ繝ｪ繝・ラ */}

        {/* 荳区ｮｵ: 險倅ｺ倶ｸ隕ｧ・亥・蟷・ｼ・*/}
        <div className="game-card" style={{ padding: '16px 20px' }}>
          <h2 style={{ fontSize: 15, color: '#3d6e00', fontWeight: 'bold', marginBottom: 12 }}>險倅ｺ倶ｸ隕ｧ ({topics.length}莉ｶ)</h2>
          {topics.length === 0 && <p style={{ color: '#6aac14', fontSize: 13 }}>險倅ｺ九′縺ゅｊ縺ｾ縺帙ｓ</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
            {topics.map(t => (
              <div key={t.id} style={{ border: '1px solid #c8e89a', borderRadius: 8, padding: 8, background: '#f8fef0' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
                  {t.thumbnail_url && (
                    <img src={t.thumbnail_url} alt="" style={{ width: 60, height: 40, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 'bold', color: '#1a3a00', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</p>
                    <p style={{ fontSize: 11, color: '#6aac14', margin: 0 }}>{new Date(t.created_at).toLocaleDateString('ja-JP')}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: t.is_published ? '#c8f0c0' : '#f0d0c0', color: t.is_published ? '#1a6e00' : '#8a3000' }}>
                    {t.is_published ? '蜈ｬ髢倶ｸｭ' : '髱槫・髢・}
                  </span>
                  <button onClick={() => togglePublish(t)}
                    style={{ fontSize: 11, padding: '2px 8px', border: '1px solid #3d6e00', borderRadius: 4, background: '#fff', cursor: 'pointer', color: '#3d6e00' }}>
                    {t.is_published ? '髱槫・髢九↓' : '蜈ｬ髢九☆繧・}
                  </button>
                  <button onClick={() => startEdit(t)}
                    style={{ fontSize: 11, padding: '2px 8px', border: '1px solid #3d6e00', borderRadius: 4, background: '#fff', cursor: 'pointer', color: '#3d6e00' }}>邱ｨ髮・/button>
                  {isAdmin && (
                    <button onClick={() => handleDelete(t.id)}
                      style={{ fontSize: 11, padding: '2px 8px', border: '1px solid #e74c3c', borderRadius: 4, background: '#fff', cursor: 'pointer', color: '#e74c3c' }}>蜑企勁</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 笏笏 繧ｯ繝ｭ繝・・繝｢繝ｼ繝繝ｫ 笏笏 */}
      {cropOpen && thumbSrc && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '90vw', maxWidth: 500, background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
            <div style={{ position: 'relative', width: '100%', height: 360, background: '#000' }}>
              <Cropper
                image={thumbSrc}
                crop={crop}
                zoom={zoom}
                aspect={aspectRatio}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <div style={{ padding: 16 }}>
              <label style={labelStyle}>繧ｺ繝ｼ繝</label>
              <input type="range" min={1} max={3} step={0.05} value={zoom}
                onChange={e => setZoom(Number(e.target.value))}
                style={{ width: '100%', marginBottom: 12 }} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setCropOpen(false)}
                  style={{ padding: '8px 16px', border: '2px solid #ccc', borderRadius: 8, background: '#fff', cursor: 'pointer' }}>繧ｭ繝｣繝ｳ繧ｻ繝ｫ</button>
                <button className="game-button" onClick={applyCrop} style={{ width: 'auto', padding: '8px 24px' }}>豎ｺ螳・/button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../../lib/supabase'
import { getEffectivePermissions, PermissionKey } from '../../../lib/permissions'
import { Sparkles, Flower, X } from 'lucide-react'

interface SpeechBlock {
  id: string
  label: string
  sort_order: number
  is_active: boolean
}

interface SpeechLine {
  id: string
  block_id: string
  text: string
  type_speed_ms: number
  display_ms: number
  sort_order: number
}

interface GimmickSettings {
  block_interval_min_sec: number
  block_interval_max_sec: number
  sakura_enabled: boolean
}

const EMPTY_PERMS: Record<PermissionKey, boolean> = {
  course_management: false, task_management: false, point_settings: false,
  submission_review: false, finance: false, timeline_management: false,
  dm_management: false, announcement_management: false, assignment_management: false, gimmick_management: false,
  dev_management: false,
  news_management: false, ticket_admin: false, debug: false, sns_management: false,
  }

export default function GimmickPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [effectivePerms, setEffectivePerms] = useState<Record<PermissionKey, boolean>>(EMPTY_PERMS)

  const [blocks, setBlocks] = useState<SpeechBlock[]>([])
  const [lines, setLines] = useState<SpeechLine[]>([])
  const [expandedBlock, setExpandedBlock] = useState<string | null>(null)
  const [settings, setSettings] = useState<GimmickSettings>({ block_interval_min_sec: 10, block_interval_max_sec: 30, sakura_enabled: false })
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null)
  const [defaultTypeSpeedSec, setDefaultTypeSpeedSec] = useState(0.05)
  const [defaultDisplaySec, setDefaultDisplaySec] = useState(2.5)

  useEffect(() => {
    let mounted = true
    async function init() {
      try {
        const { data: authData } = await supabase.auth.getUser()
        if (!authData?.user) { router.replace('/login'); return }
        const { data: me } = await supabase.from('profiles').select('role').eq('id', authData.user.id).single()
        if (!me) { router.replace('/dashboard'); return }
        const perms = await getEffectivePermissions(authData.user.id)
        if (me.role !== 'admin' && !perms.gimmick_management) { router.replace('/dashboard'); return }
        if (mounted) setEffectivePerms(perms)
        await loadAll(mounted)
      } catch {
        router.replace('/dashboard')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    init()
    return () => { mounted = false }
  }, [router])

  async function loadAll(mounted = true) {
    const [blocksRes, linesRes, settingsRes] = await Promise.all([
      supabase.from('speech_blocks').select('id, label, sort_order, is_active').order('sort_order'),
      supabase.from('speech_lines').select('id, block_id, text, type_speed_ms, display_ms, sort_order').order('sort_order'),
      supabase.from('gimmick_settings').select('block_interval_min_sec, block_interval_max_sec, sakura_enabled').single(),
    ])
    if (!mounted) return
    setBlocks(blocksRes.data ?? [])
    setLines(linesRes.data ?? [])
    if (settingsRes.data) setSettings(settingsRes.data)
  }

  // 笏笏 繧ｰ繝ｭ繝ｼ繝舌Ν險ｭ螳・笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

  async function saveSettings() {
    setSettingsSaving(true); setSettingsMsg(null)
    const min = Math.max(1, settings.block_interval_min_sec)
    const max = Math.max(min, settings.block_interval_max_sec)
    const { error } = await supabase.from('gimmick_settings').update({ block_interval_min_sec: min, block_interval_max_sec: max }).eq('id', 1)
    setSettingsSaving(false)
    setSettings(s => ({ ...s, block_interval_min_sec: min, block_interval_max_sec: max }))
    setSettingsMsg(error ? `繧ｨ繝ｩ繝ｼ: ${error.message}` : '菫晏ｭ倥＠縺ｾ縺励◆')
    setTimeout(() => setSettingsMsg(null), 2500)
  }

  async function toggleSakura() {
    const newVal = !settings.sakura_enabled
    setSettings(s => ({ ...s, sakura_enabled: newVal }))
    await supabase.from('gimmick_settings').update({ sakura_enabled: newVal }).eq('id', 1)
  }

  // 笏笏 繝悶Ο繝・け謫堺ｽ・笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

  async function addBlock() {
    const nextOrder = blocks.length
    const { data, error } = await supabase.from('speech_blocks').insert({ label: '譁ｰ縺励＞繝悶Ο繝・け', sort_order: nextOrder }).select().single()
    if (error || !data) return
    setBlocks(prev => [...prev, data])
    setExpandedBlock(data.id)
  }

  async function updateBlockLabel(id: string, label: string) {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, label } : b))
    await supabase.from('speech_blocks').update({ label }).eq('id', id)
  }

  async function toggleBlockActive(id: string, current: boolean) {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, is_active: !current } : b))
    await supabase.from('speech_blocks').update({ is_active: !current }).eq('id', id)
  }

  async function deleteBlock(id: string) {
    if (!confirm('縺薙・繝悶Ο繝・け縺ｨ縺吶∋縺ｦ縺ｮ荳險繧貞炎髯､縺励∪縺吶°・・)) return
    await supabase.from('speech_blocks').delete().eq('id', id)
    setBlocks(prev => prev.filter(b => b.id !== id))
    setLines(prev => prev.filter(l => l.block_id !== id))
    if (expandedBlock === id) setExpandedBlock(null)
  }

  // 笏笏 繝ｩ繧､繝ｳ謫堺ｽ・笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

  function linesForBlock(blockId: string) {
    return lines.filter(l => l.block_id === blockId).sort((a, b) => a.sort_order - b.sort_order)
  }

  async function addLine(blockId: string) {
    const existing = linesForBlock(blockId)
    const nextOrder = existing.length
    const { data, error } = await supabase.from('speech_lines')
      .insert({ block_id: blockId, text: '', type_speed_ms: Math.round(defaultTypeSpeedSec * 1000), display_ms: Math.round(defaultDisplaySec * 1000), sort_order: nextOrder })
      .select().single()
    if (error || !data) return
    setLines(prev => [...prev, data])
  }

  async function updateLine(id: string, field: keyof SpeechLine, value: string | number) {
    setLines(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l))
    await supabase.from('speech_lines').update({ [field]: value }).eq('id', id)
  }

  async function deleteLine(id: string) {
    await supabase.from('speech_lines').delete().eq('id', id)
    setLines(prev => prev.filter(l => l.id !== id))
  }

  async function moveLine(id: string, direction: 'up' | 'down', blockId: string) {
    const bl = linesForBlock(blockId)
    const idx = bl.findIndex(l => l.id === id)
    if (direction === 'up' && idx === 0) return
    if (direction === 'down' && idx === bl.length - 1) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    const a = bl[idx], b = bl[swapIdx]
    setLines(prev => prev.map(l => {
      if (l.id === a.id) return { ...l, sort_order: b.sort_order }
      if (l.id === b.id) return { ...l, sort_order: a.sort_order }
      return l
    }))
    await Promise.all([
      supabase.from('speech_lines').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('speech_lines').update({ sort_order: a.sort_order }).eq('id', b.id),
    ])
  }

  // 笏笏 繝ｬ繝ｳ繝繝ｪ繝ｳ繧ｰ 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#a8d870' }}>隱ｭ縺ｿ霎ｼ縺ｿ荳ｭ窶ｦ</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', padding: '24px 16px 48px' }}>
      <button onClick={() => router.push('/dashboard')} style={{
        position: 'fixed', top: 20, left: 16, zIndex: 50,
        background: '#3d6e00', color: '#a8d870', border: '2px solid #6aac14',
        borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: 'pointer',
      }}>竊・繝繝・す繝･繝懊・繝・/button>

      <div style={{ maxWidth: 640, margin: '0 auto', paddingTop: 56 }}>
        <h1 className="game-title" style={{ fontSize: 28, marginBottom: 32, textAlign: 'center', color: '#ffffff', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <Sparkles size={26}/>繧ｮ繝溘ャ繧ｯ邂｡逅・
        </h1>

        {/* 繧ｰ繝ｭ繝ｼ繝舌Ν險ｭ螳・*/}
        <div className="game-card" style={{ padding: '24px 28px', marginBottom: 24 }}>
          <h2 style={{ color: '#6aac14', fontSize: 16, fontWeight: 'bold', marginBottom: 16 }}>繝悶Ο繝・け髢馴囈險ｭ螳・/h2>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label className="game-label">譛蟆擾ｼ育ｧ抵ｼ・/label>
              <input className="game-input" type="number" min={1} style={{ width: 90 }}
                value={settings.block_interval_min_sec}
                onChange={e => setSettings(s => ({ ...s, block_interval_min_sec: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="game-label">譛螟ｧ・育ｧ抵ｼ・/label>
              <input className="game-input" type="number" min={1} style={{ width: 90 }}
                value={settings.block_interval_max_sec}
                onChange={e => setSettings(s => ({ ...s, block_interval_max_sec: Number(e.target.value) }))} />
            </div>
            <button className="game-button" style={{ width: 'auto', padding: '10px 20px', fontSize: 14 }}
              onClick={saveSettings} disabled={settingsSaving}>
              {settingsSaving ? '菫晏ｭ倅ｸｭ窶ｦ' : '菫晏ｭ・}
            </button>
          </div>
          {settingsMsg && <p style={{ color: '#3d6e00', fontSize: 13, marginTop: 8 }}>{settingsMsg}</p>}
          <p style={{ color: '#a8d870', fontSize: 12, marginTop: 8 }}>
            繝悶Ο繝・け髢薙・髢馴囈繧偵Λ繝ｳ繝繝縺ｧ豎ｺ螳壹＠縺ｾ縺呻ｼ域怙蟆上懈怙螟ｧ遘抵ｼ・
          </p>

          <hr style={{ border: 'none', borderTop: '1px solid #c8e89a', margin: '16px 0' }} />
          <h2 style={{ color: '#6aac14', fontSize: 16, fontWeight: 'bold', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Flower size={15}/>繧ｨ繝輔ぉ繧ｯ繝・/h2>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={settings.sakura_enabled}
              onChange={toggleSakura}
              style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#6aac14' }}
            />
            <span style={{ color: '#3d6e00', fontWeight: 'bold', fontSize: 14 }}>譯懷聖髮ｪ・亥・蜩｡縺ｮ繝繝・す繝･繝懊・繝峨↓陦ｨ遉ｺ・・/span>
          </label>

          <hr style={{ border: 'none', borderTop: '1px solid #c8e89a', margin: '16px 0' }} />
          <h2 style={{ color: '#6aac14', fontSize: 16, fontWeight: 'bold', marginBottom: 12 }}>譁ｰ隕丈ｸ險縺ｮ繝・ヵ繧ｩ繝ｫ繝亥､</h2>
          <p style={{ color: '#a8d870', fontSize: 12, marginBottom: 12 }}>縲御ｸ險繧定ｿｽ蜉縲肴凾縺ｫ閾ｪ蜍輔〒險ｭ螳壹＆繧後ｋ蛟､縺ｧ縺・/p>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <label className="game-label">繧ｿ繧､繝斐Φ繧ｰ騾溷ｺｦ (遘・譁・ｭ・</label>
              <input className="game-input" type="number" min={0.01} max={2} step={0.01} style={{ width: 110 }}
                value={defaultTypeSpeedSec}
                onChange={e => setDefaultTypeSpeedSec(Number(e.target.value))} />
            </div>
            <div>
              <label className="game-label">陦ｨ遉ｺ譎る俣 (遘・</label>
              <input className="game-input" type="number" min={0.5} step={0.1} style={{ width: 110 }}
                value={defaultDisplaySec}
                onChange={e => setDefaultDisplaySec(Number(e.target.value))} />
            </div>
          </div>
        </div>

        {/* 繝悶Ο繝・け荳隕ｧ */}
        {blocks.map(block => {
          const blockLines = linesForBlock(block.id)
          const isExpanded = expandedBlock === block.id
          return (
            <div key={block.id} className="game-card" style={{ padding: '20px 24px', marginBottom: 16 }}>
              {/* 繝悶Ο繝・け繝倥ャ繝繝ｼ */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <input
                  className="game-input"
                  style={{ flex: 1, minWidth: 160, fontSize: 15, fontWeight: 'bold' }}
                  value={block.label}
                  onChange={e => updateBlockLabel(block.id, e.target.value)}
                  onBlur={e => updateBlockLabel(block.id, e.target.value)}
                />
                <button onClick={() => toggleBlockActive(block.id, block.is_active)} style={{
                  background: block.is_active ? '#6aac14' : '#aaa',
                  color: 'white', border: 'none', borderRadius: 12,
                  padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap',
                }}>
                  {block.is_active ? '譛牙柑' : '辟｡蜉ｹ'}
                </button>
                <button onClick={() => setExpandedBlock(isExpanded ? null : block.id)} style={{
                  background: '#e8ffd4', color: '#3d6e00', border: '2px solid #6aac14',
                  borderRadius: 8, padding: '4px 12px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                }}>
                  {isExpanded ? '笆ｲ 髢峨§繧・ : `笆ｼ 荳險 (${blockLines.length})`}
                </button>
                <button onClick={() => deleteBlock(block.id)} style={{
                  background: '#fdecea', color: '#c0392b', border: '2px solid #c0392b',
                  borderRadius: 8, padding: '4px 12px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                }}>
                  蜑企勁
                </button>
              </div>

              {/* 荳險繝ｪ繧ｹ繝・*/}
              {isExpanded && (
                <div style={{ marginTop: 16 }}>
                  {blockLines.map((line, idx) => (
                    <div key={line.id} style={{
                      background: '#f8fff0', border: '2px solid #c8e89a', borderRadius: 10,
                      padding: '12px 14px', marginBottom: 10,
                      display: 'flex', flexDirection: 'column', gap: 8,
                    }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <textarea
                          className="game-input"
                          style={{ flex: 1, minHeight: 60, resize: 'vertical', fontSize: 14 }}
                          value={line.text}
                          placeholder="繧ｻ繝ｪ繝輔ｒ蜈･蜉帚ｦ"
                          onChange={e => updateLine(line.id, 'text', e.target.value)}
                          onBlur={e => updateLine(line.id, 'text', e.target.value)}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <button onClick={() => moveLine(line.id, 'up', block.id)} disabled={idx === 0}
                            style={{ background: idx === 0 ? '#eee' : '#e8ffd4', border: '1px solid #6aac14', borderRadius: 6, padding: '4px 8px', cursor: idx === 0 ? 'default' : 'pointer', fontSize: 12 }}>竊・/button>
                          <button onClick={() => moveLine(line.id, 'down', block.id)} disabled={idx === blockLines.length - 1}
                            style={{ background: idx === blockLines.length - 1 ? '#eee' : '#e8ffd4', border: '1px solid #6aac14', borderRadius: 6, padding: '4px 8px', cursor: idx === blockLines.length - 1 ? 'default' : 'pointer', fontSize: 12 }}>竊・/button>
                          <button onClick={() => deleteLine(line.id)}
                            style={{ background: '#fdecea', color: '#c0392b', border: '1px solid #c0392b', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}><X size={11}/></button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <div>
                          <label className="game-label" style={{ fontSize: 11 }}>繧ｿ繧､繝斐Φ繧ｰ騾溷ｺｦ (遘・譁・ｭ・</label>
                          <input className="game-input" type="number" min={0.01} max={2} step={0.01} style={{ width: 100, fontSize: 13 }}
                            value={+(line.type_speed_ms / 1000).toFixed(3)}
                            onChange={e => updateLine(line.id, 'type_speed_ms', Math.round(Number(e.target.value) * 1000))}
                            onBlur={e => updateLine(line.id, 'type_speed_ms', Math.round(Number(e.target.value) * 1000))} />
                        </div>
                        <div>
                          <label className="game-label" style={{ fontSize: 11 }}>陦ｨ遉ｺ譎る俣 (遘・</label>
                          <input className="game-input" type="number" min={0.5} step={0.1} style={{ width: 100, fontSize: 13 }}
                            value={+(line.display_ms / 1000).toFixed(2)}
                            onChange={e => updateLine(line.id, 'display_ms', Math.round(Number(e.target.value) * 1000))}
                            onBlur={e => updateLine(line.id, 'display_ms', Math.round(Number(e.target.value) * 1000))} />
                        </div>
                      </div>
                    </div>
                  ))}
                  <button onClick={() => addLine(block.id)} style={{
                    width: '100%', padding: '10px', background: '#e8ffd4',
                    color: '#3d6e00', border: '2px dashed #6aac14', borderRadius: 10,
                    cursor: 'pointer', fontWeight: 'bold', fontSize: 14,
                  }}>
                    ・・荳險繧定ｿｽ蜉
                  </button>
                </div>
              )}
            </div>
          )
        })}

        <button onClick={addBlock} className="game-button" style={{ marginTop: 8 }}>
          ・・譁ｰ縺励＞繝悶Ο繝・け繧定ｿｽ蜉
        </button>
      </div>
    </div>
  )
}


"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../../lib/supabase'
import { getEffectivePermissions, PermissionKey } from '../../../lib/permissions'

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
}

const EMPTY_PERMS: Record<PermissionKey, boolean> = {
  course_management: false, task_management: false, point_settings: false,
  submission_review: false, finance: false, timeline_management: false,
  dm_management: false, announcement_management: false, assignment_management: false, gimmick_management: false, news_management: false,
}

export default function GimmickPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [effectivePerms, setEffectivePerms] = useState<Record<PermissionKey, boolean>>(EMPTY_PERMS)

  const [blocks, setBlocks] = useState<SpeechBlock[]>([])
  const [lines, setLines] = useState<SpeechLine[]>([])
  const [expandedBlock, setExpandedBlock] = useState<string | null>(null)
  const [settings, setSettings] = useState<GimmickSettings>({ block_interval_min_sec: 10, block_interval_max_sec: 30 })
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
      supabase.from('gimmick_settings').select('block_interval_min_sec, block_interval_max_sec').single(),
    ])
    if (!mounted) return
    setBlocks(blocksRes.data ?? [])
    setLines(linesRes.data ?? [])
    if (settingsRes.data) setSettings(settingsRes.data)
  }

  // ── グローバル設定 ───────────────────────────────────────

  async function saveSettings() {
    setSettingsSaving(true); setSettingsMsg(null)
    const min = Math.max(1, settings.block_interval_min_sec)
    const max = Math.max(min, settings.block_interval_max_sec)
    const { error } = await supabase.from('gimmick_settings').update({ block_interval_min_sec: min, block_interval_max_sec: max }).eq('id', 1)
    setSettingsSaving(false)
    setSettings(s => ({ ...s, block_interval_min_sec: min, block_interval_max_sec: max }))
    setSettingsMsg(error ? `エラー: ${error.message}` : '保存しました')
    setTimeout(() => setSettingsMsg(null), 2500)
  }

  // ── ブロック操作 ─────────────────────────────────────────

  async function addBlock() {
    const nextOrder = blocks.length
    const { data, error } = await supabase.from('speech_blocks').insert({ label: '新しいブロック', sort_order: nextOrder }).select().single()
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
    if (!confirm('このブロックとすべての一言を削除しますか？')) return
    await supabase.from('speech_blocks').delete().eq('id', id)
    setBlocks(prev => prev.filter(b => b.id !== id))
    setLines(prev => prev.filter(l => l.block_id !== id))
    if (expandedBlock === id) setExpandedBlock(null)
  }

  // ── ライン操作 ───────────────────────────────────────────

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

  // ── レンダリング ─────────────────────────────────────────

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#a8d870' }}>読み込み中…</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', padding: '24px 16px 48px' }}>
      <button onClick={() => router.push('/dashboard')} style={{
        position: 'fixed', top: 20, left: 16, zIndex: 50,
        background: '#3d6e00', color: '#a8d870', border: '2px solid #6aac14',
        borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: 'pointer',
      }}>← ダッシュボード</button>

      <div style={{ maxWidth: 640, margin: '0 auto', paddingTop: 56 }}>
        <h1 className="game-title" style={{ fontSize: 28, marginBottom: 32, textAlign: 'center', color: '#ffffff', fontWeight: 900 }}>
          🎭 ギミック管理
        </h1>

        {/* グローバル設定 */}
        <div className="game-card" style={{ padding: '24px 28px', marginBottom: 24 }}>
          <h2 style={{ color: '#6aac14', fontSize: 16, fontWeight: 'bold', marginBottom: 16 }}>ブロック間隔設定</h2>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label className="game-label">最小（秒）</label>
              <input className="game-input" type="number" min={1} style={{ width: 90 }}
                value={settings.block_interval_min_sec}
                onChange={e => setSettings(s => ({ ...s, block_interval_min_sec: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="game-label">最大（秒）</label>
              <input className="game-input" type="number" min={1} style={{ width: 90 }}
                value={settings.block_interval_max_sec}
                onChange={e => setSettings(s => ({ ...s, block_interval_max_sec: Number(e.target.value) }))} />
            </div>
            <button className="game-button" style={{ width: 'auto', padding: '10px 20px', fontSize: 14 }}
              onClick={saveSettings} disabled={settingsSaving}>
              {settingsSaving ? '保存中…' : '保存'}
            </button>
          </div>
          {settingsMsg && <p style={{ color: '#3d6e00', fontSize: 13, marginTop: 8 }}>{settingsMsg}</p>}
          <p style={{ color: '#a8d870', fontSize: 12, marginTop: 8 }}>
            ブロック間の間隔をランダムで決定します（最小〜最大秒）
          </p>

          <hr style={{ border: 'none', borderTop: '1px solid #c8e89a', margin: '16px 0' }} />
          <h2 style={{ color: '#6aac14', fontSize: 16, fontWeight: 'bold', marginBottom: 12 }}>新規一言のデフォルト値</h2>
          <p style={{ color: '#a8d870', fontSize: 12, marginBottom: 12 }}>「一言を追加」時に自動で設定される値です</p>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <label className="game-label">タイピング速度 (秒/文字)</label>
              <input className="game-input" type="number" min={0.01} max={2} step={0.01} style={{ width: 110 }}
                value={defaultTypeSpeedSec}
                onChange={e => setDefaultTypeSpeedSec(Number(e.target.value))} />
            </div>
            <div>
              <label className="game-label">表示時間 (秒)</label>
              <input className="game-input" type="number" min={0.5} step={0.1} style={{ width: 110 }}
                value={defaultDisplaySec}
                onChange={e => setDefaultDisplaySec(Number(e.target.value))} />
            </div>
          </div>
        </div>

        {/* ブロック一覧 */}
        {blocks.map(block => {
          const blockLines = linesForBlock(block.id)
          const isExpanded = expandedBlock === block.id
          return (
            <div key={block.id} className="game-card" style={{ padding: '20px 24px', marginBottom: 16 }}>
              {/* ブロックヘッダー */}
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
                  {block.is_active ? '有効' : '無効'}
                </button>
                <button onClick={() => setExpandedBlock(isExpanded ? null : block.id)} style={{
                  background: '#e8ffd4', color: '#3d6e00', border: '2px solid #6aac14',
                  borderRadius: 8, padding: '4px 12px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                }}>
                  {isExpanded ? '▲ 閉じる' : `▼ 一言 (${blockLines.length})`}
                </button>
                <button onClick={() => deleteBlock(block.id)} style={{
                  background: '#fdecea', color: '#c0392b', border: '2px solid #c0392b',
                  borderRadius: 8, padding: '4px 12px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                }}>
                  削除
                </button>
              </div>

              {/* 一言リスト */}
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
                          placeholder="セリフを入力…"
                          onChange={e => updateLine(line.id, 'text', e.target.value)}
                          onBlur={e => updateLine(line.id, 'text', e.target.value)}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <button onClick={() => moveLine(line.id, 'up', block.id)} disabled={idx === 0}
                            style={{ background: idx === 0 ? '#eee' : '#e8ffd4', border: '1px solid #6aac14', borderRadius: 6, padding: '4px 8px', cursor: idx === 0 ? 'default' : 'pointer', fontSize: 12 }}>↑</button>
                          <button onClick={() => moveLine(line.id, 'down', block.id)} disabled={idx === blockLines.length - 1}
                            style={{ background: idx === blockLines.length - 1 ? '#eee' : '#e8ffd4', border: '1px solid #6aac14', borderRadius: 6, padding: '4px 8px', cursor: idx === blockLines.length - 1 ? 'default' : 'pointer', fontSize: 12 }}>↓</button>
                          <button onClick={() => deleteLine(line.id)}
                            style={{ background: '#fdecea', color: '#c0392b', border: '1px solid #c0392b', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 11 }}>✕</button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <div>
                          <label className="game-label" style={{ fontSize: 11 }}>タイピング速度 (秒/文字)</label>
                          <input className="game-input" type="number" min={0.01} max={2} step={0.01} style={{ width: 100, fontSize: 13 }}
                            value={+(line.type_speed_ms / 1000).toFixed(3)}
                            onChange={e => updateLine(line.id, 'type_speed_ms', Math.round(Number(e.target.value) * 1000))}
                            onBlur={e => updateLine(line.id, 'type_speed_ms', Math.round(Number(e.target.value) * 1000))} />
                        </div>
                        <div>
                          <label className="game-label" style={{ fontSize: 11 }}>表示時間 (秒)</label>
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
                    ＋ 一言を追加
                  </button>
                </div>
              )}
            </div>
          )
        })}

        <button onClick={addBlock} className="game-button" style={{ marginTop: 8 }}>
          ＋ 新しいブロックを追加
        </button>
      </div>
    </div>
  )
}

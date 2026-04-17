'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../../lib/supabase'
import { getEffectivePermissions, PermissionKey } from '../../../lib/permissions'
import Icon from '../../components/Icon'
import { Trash2, Plus, Pencil, X, Check, Tag } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface TicketType {
  id: string
  label: string
  color_start: string
  color_end: string
  created_at: string
}

interface ActiveTicketRow {
  ticket_id: string
  user_id: string
  username: string | null
  label: string
  color_start: string
  color_end: string
  issued_at: string
  expires_at: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function isActive(row: ActiveTicketRow) {
  const now = Date.now()
  return new Date(row.issued_at).getTime() <= now && new Date(row.expires_at).getTime() >= now
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function TicketsAdminPage() {
  const router = useRouter()
  const [loading, setLoading]   = useState(true)

  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([])
  const [activeTickets, setActiveTickets] = useState<ActiveTicketRow[]>([])

  // form: new ticket type
  const [newLabel, setNewLabel]       = useState('')
  const [newColorStart, setNewColorStart] = useState('#6aac14')
  const [newColorEnd, setNewColorEnd]     = useState('#3d6e00')
  const [saving, setSaving]           = useState(false)
  const [saveErr, setSaveErr]         = useState<string | null>(null)

  // inline edit
  const [editingId, setEditingId]         = useState<string | null>(null)
  const [editLabel, setEditLabel]         = useState('')
  const [editColorStart, setEditColorStart] = useState('')
  const [editColorEnd, setEditColorEnd]     = useState('')
  const [editSaving, setEditSaving]       = useState(false)

  const [deletingId, setDeletingId] = useState<string | null>(null)

  // ─── Init ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const init = async () => {
      const { data: authData } = await supabase.auth.getUser()
      if (!authData.user) { router.replace('/'); return }
      const { data: me } = await supabase.from('profiles').select('role').eq('id', authData.user.id).single()
      if (!me) { router.replace('/'); return }
      const perms = await getEffectivePermissions(authData.user.id)
      if (me.role !== 'admin' && !perms.ticket_admin) { router.replace('/dashboard'); return }
      await loadData()
      setLoading(false)
    }
    init()
  }, [])

  const loadData = async () => {
    const [typesRes, ticketsRes] = await Promise.all([
      supabase.from('ticket_types').select('*').order('created_at', { ascending: true }),
      supabase.rpc('get_active_tickets_for_admin'),
    ])
    if (typesRes.data)   setTicketTypes(typesRes.data)
    if (ticketsRes.data) setActiveTickets(ticketsRes.data as ActiveTicketRow[])
  }

  // ─── Ticket type CRUD ─────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!newLabel.trim()) { setSaveErr('要件名を入力してください'); return }
    setSaving(true); setSaveErr(null)
    const { error } = await supabase.from('ticket_types').insert({
      label: newLabel.trim(), color_start: newColorStart, color_end: newColorEnd,
    })
    if (error) { setSaveErr(error.message); setSaving(false); return }
    setNewLabel(''); setNewColorStart('#6aac14'); setNewColorEnd('#3d6e00')
    setSaving(false)
    await loadData()
  }

  const startEdit = (t: TicketType) => {
    setEditingId(t.id)
    setEditLabel(t.label)
    setEditColorStart(t.color_start)
    setEditColorEnd(t.color_end)
  }

  const handleUpdate = async (id: string) => {
    if (!editLabel.trim()) return
    setEditSaving(true)
    await supabase.from('ticket_types').update({
      label: editLabel.trim(), color_start: editColorStart, color_end: editColorEnd,
    }).eq('id', id)
    setEditingId(null)
    setEditSaving(false)
    await loadData()
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    await supabase.from('ticket_types').delete().eq('id', id)
    setDeletingId(null)
    await loadData()
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0fae0' }}>
      <p style={{ color: '#6aac14', fontWeight: 'bold' }}>読み込み中…</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f0fae0', padding: '24px 16px', maxWidth: 860, margin: '0 auto' }}>

      {/* ── ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6aac14', fontSize: 22, lineHeight: 1 }}>←</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tag size={22} color="#6aac14" />
          <h1 className="game-title" style={{ fontSize: 22, margin: 0 }}>チケット管理</h1>
        </div>
      </div>

      {/* ── 有効チケット一覧 */}
      <div className="game-card" style={{ padding: '24px 28px', marginBottom: 28 }}>
        <h2 className="game-title" style={{ fontSize: 17, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="ClipboardList" size={16} /> 有効なチケット（発行済み）
        </h2>

        {activeTickets.length === 0 ? (
          <p style={{ color: '#888', fontSize: 14 }}>現在有効なチケットはありません。</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #d4f0a0' }}>
                  {['発行者', '要件名', '発行日時', '期限'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 10px', color: '#3d6e00', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeTickets.map(row => {
                  const active = isActive(row)
                  return (
                    <tr
                      key={row.ticket_id}
                      style={{
                        borderBottom: '1px solid #e8ffd4',
                        background: active ? '#fffde7' : undefined,
                        outline: active ? '2px solid #f6c90e' : undefined,
                        outlineOffset: -1,
                      }}
                    >
                      <td style={{ padding: '8px 10px', fontWeight: 'bold', color: '#2d5500' }}>
                        {row.username ?? '（名無し）'}
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{
                          display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 'bold', color: 'white',
                          background: `linear-gradient(90deg, ${row.color_start}, ${row.color_end})`,
                        }}>
                          {row.label}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', color: '#555', whiteSpace: 'nowrap' }}>{fmtDate(row.issued_at)}</td>
                      <td style={{ padding: '8px 10px', color: active ? '#c0392b' : '#888', fontWeight: active ? 'bold' : 'normal', whiteSpace: 'nowrap' }}>
                        {fmtDate(row.expires_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── チケット種別マスター */}
      <div className="game-card" style={{ padding: '24px 28px' }}>
        <h2 className="game-title" style={{ fontSize: 17, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="Tag" size={16} /> チケット種別マスター
        </h2>

        {/* 新規追加フォーム */}
        <div style={{ background: '#f8fff0', border: '1px solid #d4f0a0', borderRadius: 10, padding: '16px', marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 180px' }}>
            <label style={{ fontSize: 12, fontWeight: 'bold', color: '#3d6e00', display: 'block', marginBottom: 4 }}>要件名</label>
            <input
              className="game-input"
              placeholder="例: プラチカ2B"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ flex: '0 0 auto' }}>
            <label style={{ fontSize: 12, fontWeight: 'bold', color: '#3d6e00', display: 'block', marginBottom: 4 }}>開始色</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="color" value={newColorStart} onChange={e => setNewColorStart(e.target.value)}
                style={{ width: 44, height: 36, border: '2px solid #6aac14', borderRadius: 8, cursor: 'pointer', padding: 2 }} />
              <span style={{ fontSize: 12, color: '#555', fontFamily: 'monospace' }}>{newColorStart}</span>
            </div>
          </div>
          <div style={{ flex: '0 0 auto' }}>
            <label style={{ fontSize: 12, fontWeight: 'bold', color: '#3d6e00', display: 'block', marginBottom: 4 }}>終了色</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="color" value={newColorEnd} onChange={e => setNewColorEnd(e.target.value)}
                style={{ width: 44, height: 36, border: '2px solid #6aac14', borderRadius: 8, cursor: 'pointer', padding: 2 }} />
              <span style={{ fontSize: 12, color: '#555', fontFamily: 'monospace' }}>{newColorEnd}</span>
            </div>
          </div>
          {/* プレビュー */}
          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'flex-end' }}>
            <span style={{
              display: 'inline-block', padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 'bold', color: 'white',
              background: `linear-gradient(90deg, ${newColorStart}, ${newColorEnd})`,
              boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
            }}>
              {newLabel || 'プレビュー'}
            </span>
          </div>
          <button
            className="game-button"
            onClick={handleCreate}
            disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
          >
            <Plus size={15} />{saving ? '追加中…' : '追加'}
          </button>
          {saveErr && <p style={{ color: '#c0392b', fontSize: 13, width: '100%', margin: 0 }}>{saveErr}</p>}
        </div>

        {/* 種別リスト */}
        {ticketTypes.length === 0 ? (
          <p style={{ color: '#888', fontSize: 14 }}>種別がまだありません。</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ticketTypes.map(t => (
              <div key={t.id} style={{ border: '1px solid #d4f0a0', borderRadius: 10, overflow: 'hidden' }}>
                {editingId === t.id ? (
                  // ── 編集フォーム
                  <div style={{ padding: '12px 16px', background: '#fffde7', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
                    <div style={{ flex: '1 1 160px' }}>
                      <label style={{ fontSize: 12, fontWeight: 'bold', color: '#3d6e00', display: 'block', marginBottom: 4 }}>要件名</label>
                      <input className="game-input" value={editLabel} onChange={e => setEditLabel(e.target.value)} style={{ width: '100%' }} />
                    </div>
                    <div style={{ flex: '0 0 auto' }}>
                      <label style={{ fontSize: 12, fontWeight: 'bold', color: '#3d6e00', display: 'block', marginBottom: 4 }}>開始色</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="color" value={editColorStart} onChange={e => setEditColorStart(e.target.value)}
                          style={{ width: 44, height: 36, border: '2px solid #6aac14', borderRadius: 8, cursor: 'pointer', padding: 2 }} />
                        <span style={{ fontSize: 12, color: '#555', fontFamily: 'monospace' }}>{editColorStart}</span>
                      </div>
                    </div>
                    <div style={{ flex: '0 0 auto' }}>
                      <label style={{ fontSize: 12, fontWeight: 'bold', color: '#3d6e00', display: 'block', marginBottom: 4 }}>終了色</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="color" value={editColorEnd} onChange={e => setEditColorEnd(e.target.value)}
                          style={{ width: 44, height: 36, border: '2px solid #6aac14', borderRadius: 8, cursor: 'pointer', padding: 2 }} />
                        <span style={{ fontSize: 12, color: '#555', fontFamily: 'monospace' }}>{editColorEnd}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                      <button className="game-button" onClick={() => handleUpdate(t.id)} disabled={editSaving}
                        style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Check size={14} />{editSaving ? '保存中…' : '保存'}
                      </button>
                      <button onClick={() => setEditingId(null)}
                        style={{ background: 'none', border: '2px solid #ccc', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 'bold', color: '#555' }}>
                        <X size={14} />キャンセル
                      </button>
                    </div>
                  </div>
                ) : (
                  // ── 通常表示
                  <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, background: '#fafffe' }}>
                    <span style={{
                      display: 'inline-block', padding: '4px 14px', borderRadius: 20, fontSize: 13, fontWeight: 'bold', color: 'white',
                      background: `linear-gradient(90deg, ${t.color_start}, ${t.color_end})`,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                      flexShrink: 0,
                    }}>
                      {t.label}
                    </span>
                    <span style={{ fontSize: 12, color: '#888', fontFamily: 'monospace', flex: 1 }}>
                      {t.color_start} → {t.color_end}
                    </span>
                    <button onClick={() => startEdit(t)}
                      style={{ background: 'none', border: '2px solid #6aac14', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: '#3d6e00', fontWeight: 'bold', fontSize: 13 }}>
                      <Pencil size={13} />編集
                    </button>
                    <button
                      onClick={() => handleDelete(t.id)}
                      disabled={deletingId === t.id}
                      style={{ background: 'none', border: '2px solid #e74c3c', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: '#c0392b', fontWeight: 'bold', fontSize: 13 }}>
                      <Trash2 size={13} />{deletingId === t.id ? '削除中…' : '削除'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

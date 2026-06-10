"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../../lib/supabase'
import { FEATURE_LIST, PermissionKey } from '../../../lib/permissions'
import Icon from '../../components/Icon'
import { Film, Inbox, X } from 'lucide-react'

interface Position {
  id: string
  name: string
  permissions: Record<PermissionKey, boolean>
  created_at: string
}

export default function AdminPositionsPage() {
  const router = useRouter()
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser()
        if (authError || !authData?.user) { router.replace('/login'); return }

        const { data: me, error: meError } = await supabase
          .from('profiles').select('role').eq('id', authData.user.id).single()
        if (meError || !me || me.role !== 'admin') { router.replace('/dashboard'); return }

        const { data: posData } = await supabase
          .from('positions')
          .select('id, name, permissions, created_at')
          .order('created_at', { ascending: true })

        if (mounted) {
          setPositions((posData ?? []) as Position[])
        }
      } catch (err) {
        console.error(err)
        if (mounted) router.replace('/dashboard')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    init()
    return () => { mounted = false }
  }, [router])

  async function togglePermission(positionId: string, key: PermissionKey, current: boolean) {
    setSavingId(positionId)
    const position = positions.find(p => p.id === positionId)
    if (!position) return
    const newPerms = { ...position.permissions, [key]: !current }
    const { error: upErr } = await supabase
      .from('positions')
      .update({ permissions: newPerms })
      .eq('id', positionId)
    if (!upErr) {
      setPositions(prev => prev.map(p => p.id === positionId ? { ...p, permissions: newPerms } : p))
    }
    setSavingId(null)
  }

  async function addPosition() {
    const name = newName.trim()
    if (!name) return
    setAdding(true)
    setError(null)
    const emptyPerms: Record<PermissionKey, boolean> = {
      course_management: false, task_management: false,
      point_settings: false, submission_review: false, finance: false,
      timeline_management: false, dm_management: false, announcement_management: false, assignment_management: false, gimmick_management: false,
      dev_management: false, news_management: false, debug: false, ticket_admin: false, sns_management: false,
    }
    const { data, error: insErr } = await supabase
      .from('positions')
      .insert({ name, permissions: emptyPerms })
      .select('id, name, permissions, created_at')
      .single()
    if (insErr) {
      setError(insErr.message)
    } else if (data) {
      setPositions(prev => [...prev, data as Position])
      setNewName('')
    }
    setAdding(false)
  }

  async function deletePosition(positionId: string) {
    const { error: delErr } = await supabase.from('positions').delete().eq('id', positionId)
    if (!delErr) {
      setPositions(prev => prev.filter(p => p.id !== positionId))
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
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* ヘッダー */}
        <div className="game-card" style={{ padding: '24px 32px', marginBottom: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <h1 className="game-title" style={{ fontSize: 32 }}>役職管理</h1>
              <p style={{ color: '#3d6e00', marginTop: 4, fontSize: 14 }}>役職ごとにアクセスできる機能を設定します</p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <a href="/admin">
                <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15 }}>
                  ← 部員管理
                </button>
              </a>
              <a href="/admin/timeline">
                <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Film size={14}/>タイムライン管理
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

        {/* チェックボックス行列 */}
        <div className="game-card" style={{ padding: '24px 28px', overflowX: 'auto', marginBottom: 24 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '3px solid #3d6e00' }}>
                <th className="game-label" style={{ display: 'table-cell', textAlign: 'left', padding: '8px 12px', fontSize: 13, minWidth: 140 }}>
                  役職名
                </th>
                {FEATURE_LIST.map(f => (
                  <th key={f.id} className="game-label" style={{ display: 'table-cell', textAlign: 'center', padding: '8px 10px', fontSize: 12, minWidth: 100, whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name={f.icon} size={12}/>{f.label}</span>
                  </th>
                ))}
                <th className="game-label" style={{ display: 'table-cell', textAlign: 'center', padding: '8px 10px', fontSize: 12, minWidth: 100, whiteSpace: 'nowrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Inbox size={12}/>DM管理</span>
                </th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {positions.length === 0 && (
                <tr>
                  <td colSpan={FEATURE_LIST.length + 3} style={{ textAlign: 'center', padding: 40, color: '#6aac14', fontSize: 16 }}>
                    役職がありません。下のフォームから追加してください。
                  </td>
                </tr>
              )}
              {positions.map((pos, idx) => (
                <tr
                  key={pos.id}
                  style={{
                    borderBottom: idx < positions.length - 1 ? '1px solid #c8e89a' : 'none',
                    background: idx % 2 === 0 ? '#f8fff0' : '#ffffff',
                    opacity: savingId === pos.id ? 0.6 : 1,
                  }}
                >
                  <td style={{ padding: '10px 12px', color: '#2d5500', fontWeight: 'bold', fontSize: 14 }}>
                    {pos.name}
                  </td>
                  {FEATURE_LIST.map(f => (
                    <td key={f.id} style={{ textAlign: 'center', padding: '10px 8px' }}>
                      <input
                        type="checkbox"
                        checked={pos.permissions[f.id] ?? false}
                        disabled={savingId === pos.id}
                        onChange={() => togglePermission(pos.id, f.id, pos.permissions[f.id] ?? false)}
                        style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#6aac14' }}
                      />
                    </td>
                  ))}
                  <td style={{ textAlign: 'center', padding: '10px 8px' }}>
                    <input
                      type="checkbox"
                      checked={pos.permissions['dm_management'] ?? false}
                      disabled={savingId === pos.id}
                      onChange={() => togglePermission(pos.id, 'dm_management', pos.permissions['dm_management'] ?? false)}
                      style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#6aac14' }}
                    />
                  </td>
                  <td style={{ textAlign: 'center', padding: '8px' }}>
                    <button
                      onClick={() => deletePosition(pos.id)}
                      title="役職を削除"
                      style={{
                        background: 'none', border: '2px solid #c0392b', cursor: 'pointer',
                        color: '#c0392b', padding: '2px 8px',
                        borderRadius: 6, display: 'inline-flex', alignItems: 'center',
                      }}
                    >
                      <X size={14}/>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 新規役職追加フォーム */}
        <div className="game-card" style={{ padding: '20px 28px' }}>
          <p className="game-label" style={{ marginBottom: 12 }}>新しい役職を追加</p>
          {error && <p className="game-error" style={{ marginBottom: 10 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <input
              className="game-input"
              type="text"
              placeholder="役職名（例: 広報担当）"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addPosition() }}
              style={{ flex: 1, maxWidth: 320 }}
              disabled={adding}
            />
            <button
              onClick={addPosition}
              disabled={adding || !newName.trim()}
              className="game-button"
              style={{ width: 'auto', padding: '8px 24px', fontSize: 15 }}
            >
              {adding ? '追加中…' : '追加'}
            </button>
          </div>
          <p style={{ color: '#888', fontSize: 12, marginTop: 8 }}>
            ※ 追加後、チェックボックスで機能へのアクセス権限を設定してください。
          </p>
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

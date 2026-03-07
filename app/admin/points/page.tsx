"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../../lib/supabase'
import { getEffectivePermissions, PermissionKey } from '../../../lib/permissions'

// ─── 型 ───────────────────────────────────────────────────

interface PointSetting {
  action_key: string
  label: string
  base_points: number
}

interface MultiplierEvent {
  id: string
  label: string
  multiplier: number
  starts_at: string
  ends_at: string
}

interface RankSetting {
  id: string
  name: string
  min_points: number
  color: string
  rank_order: number
}

interface MemberPoints {
  id: string
  username: string | null
  cool_points: number
  total_points: number
}

// ─── コンポーネント ────────────────────────────────────────

export default function AdminPointsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole]     = useState<string | null>(null)
  const [effectivePerms, setEffectivePerms] = useState<Record<PermissionKey, boolean>>({
    course_management: false, task_management: false,
    point_settings: false, submission_review: false, finance: false, timeline_management: false,
    dm_management: false, announcement_management: false, gimmick_management: false,
  })

  // ポイント設定
  const [pointSettings, setPointSettings]     = useState<PointSetting[]>([])
  const [editingPoints, setEditingPoints]     = useState<Record<string, number>>({})
  const [savingPoint, setSavingPoint]         = useState<Record<string, boolean>>({})

  // 倍率ウィーク
  const [multipliers, setMultipliers]         = useState<MultiplierEvent[]>([])
  const [newMult, setNewMult]                 = useState({ label: '', multiplier: 2, starts_at: '', ends_at: '' })
  const [creatingMult, setCreatingMult]       = useState(false)

  // ランク設定
  const [rankSettings, setRankSettings]       = useState<RankSetting[]>([])
  const [newRank, setNewRank]                 = useState({ name: '', min_points: 0, color: '#6aac14' })
  const [creatingRank, setCreatingRank]       = useState(false)

  // 部員ポイント一覧
  const [memberPoints, setMemberPoints]       = useState<MemberPoints[]>([])
  const [resetting, setResetting]             = useState(false)

  // ─── 初期化 ───────────────────────────────────────────

  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        const { data: authData } = await supabase.auth.getUser()
        if (!authData?.user) { router.replace('/login'); return }

        const { data: me } = await supabase
          .from('profiles').select('role').eq('id', authData.user.id).single()
        if (!me) { router.replace('/dashboard'); return }
        const perms = await getEffectivePermissions(authData.user.id)
        if (me.role !== 'admin' && !perms.point_settings) { router.replace('/dashboard'); return }
        if (mounted) { setUserRole(me.role); setEffectivePerms(perms) }

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
    const [psRes, multRes, rankRes, membersRes] = await Promise.all([
      supabase.from('point_settings').select('action_key, label, base_points'),
      supabase.from('point_multiplier_events')
        .select('id, label, multiplier, starts_at, ends_at')
        .order('starts_at', { ascending: false }),
      supabase.from('rank_settings')
        .select('id, name, min_points, color, rank_order')
        .order('rank_order'),
      supabase.from('profiles')
        .select('id, username, cool_points, total_points')
        .order('cool_points', { ascending: false }),
    ])

    if (!mounted) return

    const ps = psRes.data ?? []
    setPointSettings(ps)
    const pts: Record<string, number> = {}
    ps.forEach(p => { pts[p.action_key] = p.base_points })
    setEditingPoints(pts)

    setMultipliers(multRes.data ?? [])
    setRankSettings(rankRes.data ?? [])
    setMemberPoints((membersRes.data ?? []) as MemberPoints[])
  }

  // ─── ポイント設定保存 ──────────────────────────────────

  async function savePointSetting(actionKey: string) {
    setSavingPoint(prev => ({ ...prev, [actionKey]: true }))
    await supabase.from('point_settings').update({
      base_points: editingPoints[actionKey] ?? 0,
      updated_at: new Date().toISOString(),
    }).eq('action_key', actionKey)
    setSavingPoint(prev => ({ ...prev, [actionKey]: false }))
    setPointSettings(prev => prev.map(p =>
      p.action_key === actionKey ? { ...p, base_points: editingPoints[actionKey] ?? 0 } : p
    ))
  }

  // ─── 倍率ウィーク ──────────────────────────────────────

  async function createMultiplier() {
    if (!newMult.label || !newMult.starts_at || !newMult.ends_at) return
    setCreatingMult(true)
    const { data } = await supabase.from('point_multiplier_events').insert({
      label: newMult.label,
      multiplier: newMult.multiplier,
      starts_at: newMult.starts_at,
      ends_at: newMult.ends_at,
    }).select().single()
    if (data) setMultipliers(prev => [data as MultiplierEvent, ...prev])
    setNewMult({ label: '', multiplier: 2, starts_at: '', ends_at: '' })
    setCreatingMult(false)
  }

  async function deleteMultiplier(id: string) {
    await supabase.from('point_multiplier_events').delete().eq('id', id)
    setMultipliers(prev => prev.filter(m => m.id !== id))
  }

  // ─── ランク設定 ────────────────────────────────────────

  async function createRank() {
    if (!newRank.name) return
    setCreatingRank(true)
    const maxOrder = Math.max(0, ...rankSettings.map(r => r.rank_order))
    const { data } = await supabase.from('rank_settings').insert({
      name: newRank.name,
      min_points: newRank.min_points,
      color: newRank.color,
      rank_order: maxOrder + 1,
    }).select().single()
    if (data) setRankSettings(prev => [...prev, data as RankSetting].sort((a, b) => a.rank_order - b.rank_order))
    setNewRank({ name: '', min_points: 0, color: '#6aac14' })
    setCreatingRank(false)
  }

  async function deleteRank(id: string) {
    await supabase.from('rank_settings').delete().eq('id', id)
    setRankSettings(prev => prev.filter(r => r.id !== id))
  }

  // ─── クールリセット ────────────────────────────────────

  async function resetCool() {
    if (!confirm('全部員のクールポイントを 0 にリセットします。この操作は取り消せません。実行しますか？')) return
    setResetting(true)
    const { error } = await supabase.rpc('reset_cool_points')
    if (!error) {
      setMemberPoints(prev => prev.map(m => ({ ...m, cool_points: 0 })))
    } else {
      alert('リセットに失敗しました: ' + error.message)
    }
    setResetting(false)
  }

  // ─── 倍率イベントのアクティブ判定 ────────────────────

  function isActive(evt: MultiplierEvent): boolean {
    const now = new Date()
    return new Date(evt.starts_at) <= now && now <= new Date(evt.ends_at)
  }

  // ─── ローディング ──────────────────────────────────────

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'white', fontSize: 24, fontWeight: 'bold' }}>Loading...</p>
      </div>
    )
  }

  // ─── レンダリング ──────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', padding: '32px 24px' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ヘッダー */}
        <div className="game-card" style={{ padding: '24px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 className="game-title" style={{ fontSize: 28 }}>ポイント・ランク設定</h1>
              <p style={{ color: '#3d6e00', marginTop: 4, fontSize: 13 }}>ポイント・倍率ウィーク・ランクを管理します</p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {(userRole === 'admin' || effectivePerms.course_management) && (
                <a href="/admin">
                  <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15 }}>部員管理</button>
                </a>
              )}
              {(userRole === 'admin' || effectivePerms.task_management) && (
                <a href="/admin/tasks">
                  <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15 }}>課題管理</button>
                </a>
              )}
              {(userRole === 'admin' || effectivePerms.submission_review) && (
                <a href="/admin/submissions">
                  <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15 }}>提出状況</button>
                </a>
              )}
              {(userRole === 'admin' || effectivePerms.timeline_management) && (
                <a href="/admin/timeline">
                  <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15 }}>🎬 タイムライン管理</button>
                </a>
              )}
              {userRole === 'admin' && (
                <a href="/admin/positions">
                  <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15 }}>🏷 役職管理</button>
                </a>
              )}
              <button className="game-button"
                style={{ width: 'auto', padding: '8px 20px', fontSize: 15, background: '#888', borderColor: '#555' }}
                onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}>
                ログアウト
              </button>
            </div>
          </div>
        </div>

        {/* ── セクション1: ポイント設定 ──────────────────── */}
        <div className="game-card" style={{ padding: '24px 32px' }}>
          <h2 className="game-title" style={{ fontSize: 20, marginBottom: 16 }}>🎯 アクションポイント設定</h2>
          <p style={{ color: '#3d6e00', fontSize: 13, marginBottom: 16 }}>各アクションで獲得できるポイントを設定します。倍率ウィーク中はこの値に倍率がかかります。</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {pointSettings.map(ps => (
              <div key={ps.action_key} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', background: '#f0fae0', borderRadius: 10, border: '1px solid #c8e89a',
              }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 'bold', color: '#2d5500', fontSize: 15 }}>{ps.label}</p>
                  <p style={{ color: '#888', fontSize: 12 }}>action_key: {ps.action_key}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="number" min={0}
                    value={editingPoints[ps.action_key] ?? ps.base_points}
                    onChange={e => setEditingPoints(prev => ({ ...prev, [ps.action_key]: parseInt(e.target.value) || 0 }))}
                    style={{
                      width: 70, padding: '6px 10px', borderRadius: 8,
                      border: '2px solid #c8e89a', fontSize: 16, fontWeight: 'bold',
                      color: '#2d5500', textAlign: 'center',
                    }}
                  />
                  <span style={{ color: '#3d6e00', fontSize: 14 }}>pt</span>
                  <button className="game-button"
                    disabled={savingPoint[ps.action_key]}
                    onClick={() => savePointSetting(ps.action_key)}
                    style={{ width: 'auto', padding: '6px 16px', fontSize: 13 }}>
                    {savingPoint[ps.action_key] ? '保存中' : '保存'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── セクション2: 倍率ウィーク ──────────────────── */}
        <div className="game-card" style={{ padding: '24px 32px' }}>
          <h2 className="game-title" style={{ fontSize: 20, marginBottom: 8 }}>⚡ ポイント倍率ウィーク</h2>
          <p style={{ color: '#3d6e00', fontSize: 13, marginBottom: 16 }}>期間中はポイントが指定した倍率で付与されます。複数のイベントが重なった場合、最大倍率が適用されます。</p>

          {/* 新規作成フォーム */}
          <div style={{ background: '#f0fae0', border: '2px dashed #6aac14', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
            <p style={{ fontWeight: 'bold', color: '#3d6e00', marginBottom: 12, fontSize: 14 }}>新規イベント作成</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              <input className="game-input" placeholder="イベント名（例: ゴールデンウィーク特別）"
                value={newMult.label}
                onChange={e => setNewMult(prev => ({ ...prev, label: e.target.value }))}
                style={{ flex: 2, minWidth: 200, marginBottom: 0 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="number" min={1} step={0.5}
                  value={newMult.multiplier}
                  onChange={e => setNewMult(prev => ({ ...prev, multiplier: parseFloat(e.target.value) || 2 }))}
                  style={{
                    width: 60, padding: '6px 8px', borderRadius: 8,
                    border: '2px solid #c8e89a', fontSize: 15, fontWeight: 'bold', textAlign: 'center',
                  }} />
                <span style={{ color: '#3d6e00', fontSize: 14, fontWeight: 'bold' }}>倍</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={{ color: '#3d6e00', fontSize: 13, fontWeight: 'bold' }}>開始</label>
                <input type="datetime-local"
                  value={newMult.starts_at}
                  onChange={e => setNewMult(prev => ({ ...prev, starts_at: e.target.value }))}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '2px solid #c8e89a', fontSize: 13 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={{ color: '#3d6e00', fontSize: 13, fontWeight: 'bold' }}>終了</label>
                <input type="datetime-local"
                  value={newMult.ends_at}
                  onChange={e => setNewMult(prev => ({ ...prev, ends_at: e.target.value }))}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '2px solid #c8e89a', fontSize: 13 }} />
              </div>
              <button className="game-button" disabled={creatingMult || !newMult.label}
                onClick={createMultiplier}
                style={{ width: 'auto', padding: '8px 20px' }}>
                {creatingMult ? '作成中…' : '+ 作成'}
              </button>
            </div>
          </div>

          {/* イベント一覧 */}
          {multipliers.length === 0 ? (
            <p style={{ color: '#aaa', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>倍率イベントはありません</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {multipliers.map(evt => (
                <div key={evt.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', borderRadius: 10,
                  border: `2px solid ${isActive(evt) ? '#6aac14' : '#c8e89a'}`,
                  background: isActive(evt) ? '#e8f8d0' : '#f0fae0',
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 'bold', color: '#2d5500', fontSize: 15 }}>{evt.label}</span>
                      <span style={{
                        background: '#f0a000', color: 'white',
                        borderRadius: 10, padding: '1px 8px', fontSize: 12, fontWeight: 'bold',
                      }}>
                        ×{evt.multiplier}
                      </span>
                      {isActive(evt) && (
                        <span style={{ background: '#6aac14', color: 'white', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 'bold' }}>
                          ⚡ 開催中
                        </span>
                      )}
                    </div>
                    <p style={{ color: '#555', fontSize: 12 }}>
                      {new Date(evt.starts_at).toLocaleString('ja-JP')} 〜 {new Date(evt.ends_at).toLocaleString('ja-JP')}
                    </p>
                  </div>
                  <button onClick={() => deleteMultiplier(evt.id)}
                    style={{
                      background: '#ffecec', border: '1px solid #ffaaaa',
                      borderRadius: 8, padding: '4px 12px', cursor: 'pointer',
                      color: '#cc3333', fontSize: 13,
                    }}>
                    削除
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── セクション3: ランク設定 ────────────────────── */}
        <div className="game-card" style={{ padding: '24px 32px' }}>
          <h2 className="game-title" style={{ fontSize: 20, marginBottom: 8 }}>🏅 ランク設定</h2>
          <p style={{ color: '#3d6e00', fontSize: 13, marginBottom: 16 }}>
            クールポイントに基づくランクを設定します。ランクは rank_order 順（昇順）で、最高の min_points 以上が現在のランクになります。
          </p>

          {/* 新規ランク追加フォーム */}
          <div style={{ background: '#f0fae0', border: '2px dashed #6aac14', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
            <p style={{ fontWeight: 'bold', color: '#3d6e00', marginBottom: 12, fontSize: 14 }}>新規ランク追加</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <input className="game-input" placeholder="ランク名（例: S）"
                value={newRank.name}
                onChange={e => setNewRank(prev => ({ ...prev, name: e.target.value }))}
                style={{ width: 100, marginBottom: 0 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={{ color: '#3d6e00', fontSize: 13, fontWeight: 'bold' }}>昇格ポイント</label>
                <input type="number" min={0}
                  value={newRank.min_points}
                  onChange={e => setNewRank(prev => ({ ...prev, min_points: parseInt(e.target.value) || 0 }))}
                  style={{ width: 80, padding: '6px 8px', borderRadius: 8, border: '2px solid #c8e89a', fontSize: 14, textAlign: 'center' }} />
                <span style={{ color: '#3d6e00', fontSize: 13 }}>pt 以上</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={{ color: '#3d6e00', fontSize: 13, fontWeight: 'bold' }}>カラー</label>
                <input type="color" value={newRank.color}
                  onChange={e => setNewRank(prev => ({ ...prev, color: e.target.value }))}
                  style={{ width: 40, height: 32, border: 'none', cursor: 'pointer', borderRadius: 6 }} />
                <span style={{ color: '#555', fontSize: 12 }}>{newRank.color}</span>
              </div>
              <button className="game-button" disabled={creatingRank || !newRank.name}
                onClick={createRank}
                style={{ width: 'auto', padding: '8px 20px' }}>
                {creatingRank ? '追加中…' : '+ 追加'}
              </button>
            </div>
          </div>

          {/* ランク一覧 */}
          {rankSettings.length === 0 ? (
            <p style={{ color: '#aaa', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>ランク設定はありません</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rankSettings.map(rank => (
                <div key={rank.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', borderRadius: 10,
                  border: `2px solid ${rank.color}`,
                  background: '#f0fae0',
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: rank.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 'bold', color: 'white', fontSize: 18, flexShrink: 0,
                  }}>
                    {rank.name}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 'bold', color: '#2d5500', fontSize: 15 }}>{rank.name} ランク</p>
                    <p style={{ color: '#555', fontSize: 12 }}>{rank.min_points} pt 以上 / 順位: {rank.rank_order}</p>
                  </div>
                  <button onClick={() => deleteRank(rank.id)}
                    style={{
                      background: '#ffecec', border: '1px solid #ffaaaa',
                      borderRadius: 8, padding: '4px 12px', cursor: 'pointer',
                      color: '#cc3333', fontSize: 13,
                    }}>
                    削除
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── セクション4: 部員ポイント一覧 + クールリセット ── */}
        <div className="game-card" style={{ padding: '24px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <h2 className="game-title" style={{ fontSize: 20, marginBottom: 4 }}>📊 部員ポイント一覧</h2>
              <p style={{ color: '#3d6e00', fontSize: 13 }}>ポイントは本人とadminにのみ表示されます</p>
            </div>
            <button className="game-button"
              disabled={resetting}
              onClick={resetCool}
              style={{
                width: 'auto', padding: '8px 20px',
                background: '#cc3333', borderColor: '#991111', fontSize: 14,
              }}>
              {resetting ? 'リセット中…' : '🔄 クールリセット'}
            </button>
          </div>

          {memberPoints.length === 0 ? (
            <p style={{ color: '#aaa', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>部員データがありません</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* ヘッダー行 */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr auto auto',
                padding: '8px 16px', color: '#888', fontSize: 12, fontWeight: 'bold',
              }}>
                <span>部員名</span>
                <span style={{ textAlign: 'right', marginRight: 24 }}>クールPt</span>
                <span style={{ textAlign: 'right' }}>累計Pt</span>
              </div>
              {memberPoints.map((m, idx) => {
                // ランク計算
                const sortedRanks = [...rankSettings].sort((a, b) => a.rank_order - b.rank_order)
                const rank = [...sortedRanks].reverse().find(r => (m.cool_points ?? 0) >= r.min_points)
                return (
                  <div key={m.id} style={{
                    display: 'grid', gridTemplateColumns: '1fr auto auto',
                    padding: '10px 16px', borderRadius: 10,
                    background: idx === 0 ? '#e8f8d0' : '#f0fae0',
                    border: `1px solid ${idx === 0 ? '#6aac14' : '#c8e89a'}`,
                    alignItems: 'center',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {idx === 0 && <span style={{ fontSize: 16 }}>👑</span>}
                      {rank && (
                        <span style={{
                          background: rank.color, color: 'white',
                          borderRadius: 8, padding: '1px 8px', fontSize: 11, fontWeight: 'bold',
                        }}>
                          {rank.name}
                        </span>
                      )}
                      <span style={{ fontWeight: 'bold', color: '#2d5500', fontSize: 15 }}>
                        {m.username ?? '名前なし'}
                      </span>
                    </div>
                    <span style={{
                      fontWeight: 'bold', color: '#3d6e00', fontSize: 16,
                      textAlign: 'right', marginRight: 24,
                    }}>
                      {m.cool_points ?? 0} pt
                    </span>
                    <span style={{ color: '#888', fontSize: 13, textAlign: 'right' }}>
                      {m.total_points ?? 0} pt
                    </span>
                  </div>
                )
              })}
            </div>
          )}
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

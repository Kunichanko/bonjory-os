"use client"

import { Fragment, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../../lib/supabase'
import { getEffectivePermissions } from '../../../lib/permissions'
import { BarChart2 } from 'lucide-react'

// ─── 型 ───────────────────────────────────────────────────

interface ActivitySession {
  id: string
  user_id: string
  username: string | null
  started_at: string
}

interface ActivityEvent {
  elapsed_seconds: number
  label: string
}

const PAGE_SIZE = 50

// ─── コンポーネント ────────────────────────────────────────

export default function AdminStatsPage() {
  const router = useRouter()
  const [sessions, setSessions]     = useState<ActivitySession[]>([])
  const [expanded, setExpanded]     = useState<Record<string, boolean>>({})
  const [events, setEvents]         = useState<Record<string, ActivityEvent[] | null>>({})
  const [hasMore, setHasMore]       = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [recentStarts, setRecentStarts] = useState<string[]>([])
  const [loading, setLoading]       = useState(true)

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
        if (me.role !== 'admin' && !perms.stats_management) { router.replace('/dashboard'); return }

        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        const [sessionsRes, recentRes] = await Promise.all([
          supabase.from('activity_sessions')
            .select('id, user_id, username, started_at')
            .order('started_at', { ascending: false })
            .range(0, PAGE_SIZE - 1),
          supabase.from('activity_sessions')
            .select('started_at')
            .gte('started_at', monthAgo),
        ])

        if (!mounted) return
        setSessions(sessionsRes.data ?? [])
        setHasMore((sessionsRes.data ?? []).length === PAGE_SIZE)
        setRecentStarts((recentRes.data ?? []).map(r => r.started_at))
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

  async function loadMore() {
    if (loadingMore) return
    setLoadingMore(true)
    const { data } = await supabase.from('activity_sessions')
      .select('id, user_id, username, started_at')
      .order('started_at', { ascending: false })
      .range(sessions.length, sessions.length + PAGE_SIZE - 1)
    setSessions(prev => {
      const seen = new Set(prev.map(s => s.id))
      return [...prev, ...(data ?? []).filter(s => !seen.has(s.id))]
    })
    setHasMore((data ?? []).length === PAGE_SIZE)
    setLoadingMore(false)
  }

  async function toggleSession(sessionId: string) {
    const opening = !(expanded[sessionId] ?? false)
    setExpanded(prev => ({ ...prev, [sessionId]: opening }))
    if (opening && events[sessionId] === undefined) {
      setEvents(prev => ({ ...prev, [sessionId]: null }))
      const { data } = await supabase.from('activity_events')
        .select('elapsed_seconds, label')
        .eq('session_id', sessionId)
        .order('elapsed_seconds', { ascending: true })
        .order('id', { ascending: true })
      setEvents(prev => ({ ...prev, [sessionId]: data ?? [] }))
    }
  }

  // 直近30日の時間帯別アクセス数（0〜23時）
  const hourlyCounts = useMemo(() => {
    const counts = Array.from({ length: 24 }, () => 0)
    for (const iso of recentStarts) counts[new Date(iso).getHours()]++
    return counts
  }, [recentStarts])
  const maxHourly = Math.max(1, ...hourlyCounts)

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <BarChart2 size={30} color="#6aac14" />
            <div>
              <h1 className="game-title" style={{ fontSize: 32 }}>統計管理</h1>
              <p style={{ color: '#3d6e00', marginTop: 4, fontSize: 14 }}>
                ユーザーのアクセス・行動ログ（各セッション最大5分間・90日間保存）
              </p>
            </div>
          </div>
        </div>

        {/* 時間帯別アクセス集計 */}
        <div className="game-card" style={{ padding: '24px 32px', marginBottom: 24 }}>
          <h2 style={{ color: '#2d5500', fontSize: 20, fontWeight: 'bold', marginBottom: 12 }}>
            時間帯別アクセス数（直近30日）
          </h2>
          {recentStarts.length === 0 ? (
            <p style={{ color: '#6aac14', fontSize: 14 }}>データがありません</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '4px 10px', alignItems: 'center' }}>
              {hourlyCounts.map((count, h) => (
                <Fragment key={h}>
                  <span style={{ color: '#3d6e00', fontSize: 12, fontWeight: 'bold', textAlign: 'right' }}>{h}時</span>
                  <div style={{ background: '#e8ffd4', borderRadius: 4, height: 14, overflow: 'hidden' }}>
                    <div style={{
                      width: `${(count / maxHourly) * 100}%`, height: '100%',
                      background: '#6aac14', borderRadius: 4, transition: 'width 0.3s',
                    }} />
                  </div>
                  <span style={{ color: '#3d6e00', fontSize: 12, minWidth: 32 }}>{count}件</span>
                </Fragment>
              ))}
            </div>
          )}
        </div>

        {/* セッション一覧 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sessions.length === 0 && (
            <div className="game-card" style={{ padding: '24px 32px' }}>
              <p style={{ color: '#6aac14', fontSize: 14 }}>まだ行動ログがありません</p>
            </div>
          )}
          {sessions.map(session => {
            const isOpen = expanded[session.id] ?? false
            const dt = new Date(session.started_at)
            const sessionEvents = events[session.id]
            return (
              <div key={session.id} className="game-card" style={{ padding: 0, overflow: 'hidden' }}>
                <button
                  onClick={() => toggleSession(session.id)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                    padding: '14px 20px', textAlign: 'left',
                  }}>
                  <span style={{ color: '#2d5500', fontSize: 15, fontWeight: 'bold' }}>
                    {dt.toLocaleDateString('ja-JP')} {dt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                    {'　'}{session.username ?? '不明'}
                  </span>
                  <span style={{ color: '#6aac14', fontSize: 13 }}>{isOpen ? '▲' : '▼'}</span>
                </button>
                {isOpen && (
                  <div style={{ padding: '0 20px 16px' }}>
                    <hr style={{ border: 'none', borderTop: '2px dashed #a8d870', margin: '0 0 12px' }} />
                    {sessionEvents === null || sessionEvents === undefined ? (
                      <p style={{ color: '#6aac14', fontSize: 13 }}>読み込み中…</p>
                    ) : sessionEvents.length === 0 ? (
                      <p style={{ color: '#6aac14', fontSize: 13 }}>操作記録なし</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {sessionEvents.map((e, i) => (
                          <p key={i} style={{ color: '#3d6e00', fontSize: 13, margin: 0, fontFamily: 'monospace' }}>
                            <span style={{ display: 'inline-block', minWidth: 52, fontWeight: 'bold' }}>{e.elapsed_seconds}秒</span>
                            {e.label}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* もっと見る */}
        {hasMore && (
          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <button className="game-button" onClick={loadMore} disabled={loadingMore}
              style={{ width: 'auto', padding: '10px 32px', fontSize: 15 }}>
              {loadingMore ? '読み込み中…' : 'もっと見る'}
            </button>
          </div>
        )}
      </div>

      {/* ダッシュボードへ戻る */}
      <a href="/dashboard">
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

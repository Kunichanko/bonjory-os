"use client"

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../../lib/supabase'
import { getEffectivePermissions, PermissionKey } from '../../../lib/permissions'

// ─── 型 ───────────────────────────────────────────────────

interface TimelinePost {
  id: string
  user_id: string
  is_anonymous: boolean
  thumbnail_url: string | null
  media_url: string | null
  self_evaluation: string | null
  retrospective: string | null
  submitted_at: string | null
  task: {
    id: string
    title: string
    target_course: string | null
    target_stage: string | null
    created_at: string
  }
  profile: {
    username: string | null
    course: string | null
    stage: string | null
  } | null
}

// ─── ユーティリティ ────────────────────────────────────────

function getMostRecentMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() // 0=Sun, 1=Mon...
  const diff = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function isCurrentTimeline(taskCreatedAt: string): boolean {
  const taskMonday = getMostRecentMonday(new Date(taskCreatedAt))
  const nowMonday  = getMostRecentMonday(new Date())
  const cutoff     = new Date(nowMonday.getTime() - 14 * 24 * 60 * 60 * 1000)
  return taskMonday >= cutoff
}

function extractStoragePath(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  return decodeURIComponent(url.slice(idx + marker.length).split('?')[0])
}

const STAGE_LABELS: Record<string, string> = {
  Foundation:  'Ⅰ. 基礎',
  Development: 'Ⅱ. 応用',
  Production:  'Ⅲ. 実践',
}

// ─── コンポーネント ────────────────────────────────────────

export default function AdminTimelinePage() {
  const router = useRouter()
  const [loading, setLoading]     = useState(true)
  const [userRole, setUserRole]   = useState<string | null>(null)
  const [canManage, setCanManage] = useState(false)
  const [posts, setPosts]         = useState<TimelinePost[]>([])
  const [tab, setTab]             = useState<'current' | 'past'>('current')
  const [expanded, setExpanded]   = useState<string | null>(null)

  // フィルター・ソート
  const [sortOrder, setSortOrder]           = useState<'newest' | 'oldest'>('newest')
  const [filterCourse, setFilterCourse]     = useState('')
  const [filterStage, setFilterStage]       = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo]     = useState('')

  // 削除状態
  const [deleting, setDeleting]   = useState<Record<string, string>>({}) // id -> 'thumb'|'video'|'both'
  const [bulkDeleting, setBulkDeleting] = useState(false)

  // リフレッシュ確認
  const [refreshConfirm, setRefreshConfirm] = useState(false)
  const [refreshing, setRefreshing]         = useState(false)

  // ─── 初期化 ─────────────────────────────────────────────

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
        const isAdmin = me.role === 'admin'
        if (!isAdmin && !perms.timeline_management) { router.replace('/dashboard'); return }

        if (mounted) {
          setUserRole(me.role)
          setCanManage(isAdmin || perms.timeline_management)
        }

        // 全提出済みアサインメントを取得
        const { data: postsData } = await supabase
          .from('task_assignments')
          .select(`
            id, user_id, is_anonymous, thumbnail_url, media_url,
            self_evaluation, retrospective, submitted_at,
            task:tasks(id, title, target_course, target_stage, created_at)
          `)
          .eq('status', 'submitted')
          .order('submitted_at', { ascending: false })

        const { data: profilesData } = await supabase
          .from('profiles').select('id, username, course, stage')

        if (!mounted) return

        const profileMap: Record<string, { username: string | null; course: string | null; stage: string | null }> = {}
        for (const p of profilesData ?? []) profileMap[p.id] = p

        const merged: TimelinePost[] = (postsData ?? []).map(a => ({
          ...(a as unknown as Omit<TimelinePost, 'profile'>),
          profile: profileMap[a.user_id] ?? null,
        }))

        setPosts(merged)
      } catch {
        router.replace('/dashboard')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    init()
    return () => { mounted = false }
  }, [router])

  // ─── フィルター・ソート済みリスト ────────────────────────

  const filteredPosts = useMemo(() => {
    let list = posts.filter(p => tab === 'current'
      ? isCurrentTimeline(p.task.created_at)
      : !isCurrentTimeline(p.task.created_at)
    )
    if (filterCourse) list = list.filter(p => p.task.target_course === filterCourse)
    if (filterStage)  list = list.filter(p => p.task.target_stage === filterStage)
    if (filterDateFrom) list = list.filter(p => p.submitted_at && p.submitted_at >= filterDateFrom)
    if (filterDateTo)   list = list.filter(p => p.submitted_at && p.submitted_at <= filterDateTo + 'T23:59:59')
    list.sort((a, b) => {
      const dA = new Date(a.submitted_at ?? 0).getTime()
      const dB = new Date(b.submitted_at ?? 0).getTime()
      return sortOrder === 'newest' ? dB - dA : dA - dB
    })
    return list
  }, [posts, tab, filterCourse, filterStage, filterDateFrom, filterDateTo, sortOrder])

  // ─── ストレージ削除 ──────────────────────────────────────

  async function deleteFile(postId: string, type: 'thumb' | 'video') {
    const post = posts.find(p => p.id === postId)
    if (!post) return
    setDeleting(prev => ({ ...prev, [postId]: type }))
    try {
      if (type === 'thumb' && post.thumbnail_url) {
        const path = extractStoragePath(post.thumbnail_url, 'thumbnails')
        if (path) await supabase.storage.from('thumbnails').remove([path])
        await supabase.from('task_assignments').update({ thumbnail_url: null }).eq('id', postId)
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, thumbnail_url: null } : p))
      } else if (type === 'video' && post.media_url) {
        const path = extractStoragePath(post.media_url, 'media')
        if (path) await supabase.storage.from('media').remove([path])
        await supabase.from('task_assignments').update({ media_url: null }).eq('id', postId)
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, media_url: null } : p))
      }
    } finally {
      setDeleting(prev => { const n = { ...prev }; delete n[postId]; return n })
    }
  }

  async function bulkDelete(type: 'thumb' | 'video' | 'both') {
    setBulkDeleting(true)
    try {
      for (const post of filteredPosts) {
        if ((type === 'thumb' || type === 'both') && post.thumbnail_url) {
          const path = extractStoragePath(post.thumbnail_url, 'thumbnails')
          if (path) await supabase.storage.from('thumbnails').remove([path])
          await supabase.from('task_assignments').update({ thumbnail_url: null }).eq('id', post.id)
        }
        if ((type === 'video' || type === 'both') && post.media_url) {
          const path = extractStoragePath(post.media_url, 'media')
          if (path) await supabase.storage.from('media').remove([path])
          await supabase.from('task_assignments').update({ media_url: null }).eq('id', post.id)
        }
      }
      // 状態を一括更新
      setPosts(prev => prev.map(p => {
        if (!filteredPosts.some(f => f.id === p.id)) return p
        const updated = { ...p }
        if (type === 'thumb' || type === 'both') updated.thumbnail_url = null
        if (type === 'video' || type === 'both') updated.media_url = null
        return updated
      }))
    } finally {
      setBulkDeleting(false)
    }
  }

  // タイムラインリフレッシュ（最新→過去への手動移行は分類ロジックが自動で行うため、
  // ここでは「現在の最新タイムラインを確認」する意図でページをリロード）
  async function handleRefresh() {
    setRefreshing(true)
    setRefreshConfirm(false)
    // 再フェッチ
    const { data: postsData } = await supabase
      .from('task_assignments')
      .select(`
        id, user_id, is_anonymous, thumbnail_url, media_url,
        self_evaluation, retrospective, submitted_at,
        task:tasks(id, title, target_course, target_stage, created_at)
      `)
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: false })

    const { data: profilesData } = await supabase
      .from('profiles').select('id, username, course, stage')

    const profileMap: Record<string, { username: string | null; course: string | null; stage: string | null }> = {}
    for (const p of profilesData ?? []) profileMap[p.id] = p

    const merged: TimelinePost[] = (postsData ?? []).map(a => ({
      ...(a as unknown as Omit<TimelinePost, 'profile'>),
      profile: profileMap[a.user_id] ?? null,
    }))

    setPosts(merged)
    setRefreshing(false)
  }

  // ─── ローディング ────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'white', fontSize: 24, fontWeight: 'bold' }}>Loading...</p>
      </div>
    )
  }

  const currentCount = posts.filter(p => isCurrentTimeline(p.task.created_at)).length
  const pastCount    = posts.filter(p => !isCurrentTimeline(p.task.created_at)).length

  // ─── レンダリング ────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', padding: '32px 24px 80px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ヘッダー */}
        <div className="game-card" style={{ padding: '24px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 className="game-title" style={{ fontSize: 28 }}>🎬 タイムライン管理</h1>
              <p style={{ color: '#3d6e00', marginTop: 4, fontSize: 13 }}>
                最新: {currentCount}件 ／ 過去: {pastCount}件
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {canManage && (
                refreshConfirm ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ color: '#c0392b', fontSize: 13, fontWeight: 'bold' }}>本当にリフレッシュしますか?</span>
                    <button onClick={handleRefresh} disabled={refreshing}
                      style={{ padding: '6px 14px', borderRadius: 8, background: '#c0392b', border: '2px solid #8e1c0e', color: 'white', fontWeight: 'bold', cursor: 'pointer', fontSize: 13 }}>
                      {refreshing ? '実行中…' : '実行'}
                    </button>
                    <button onClick={() => setRefreshConfirm(false)}
                      style={{ padding: '6px 14px', borderRadius: 8, background: '#888', border: '2px solid #555', color: 'white', fontWeight: 'bold', cursor: 'pointer', fontSize: 13 }}>
                      キャンセル
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setRefreshConfirm(true)}
                    className="game-button" style={{ width: 'auto', padding: '8px 18px', fontSize: 14 }}>
                    🔄 リフレッシュ
                  </button>
                )
              )}
              {userRole === 'admin' && (
                <a href="/admin/positions">
                  <button className="game-button" style={{ width: 'auto', padding: '8px 18px', fontSize: 14 }}>
                    🏷 役職管理
                  </button>
                </a>
              )}
              <a href="/admin">
                <button className="game-button" style={{ width: 'auto', padding: '8px 18px', fontSize: 14 }}>
                  部員管理
                </button>
              </a>
              <button className="game-button"
                style={{ width: 'auto', padding: '8px 18px', fontSize: 14, background: '#888', borderColor: '#555' }}
                onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}>
                ログアウト
              </button>
            </div>
          </div>
        </div>

        {/* タブ */}
        <div style={{ display: 'flex', gap: 4, background: '#1a3a00', borderRadius: 12, padding: 4 }}>
          {([['current', `🌟 最新タイムライン (${currentCount}件)`], ['past', `📦 過去タイムライン (${pastCount}件)`]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              flex: 1, padding: '10px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: 'bold',
              background: tab === id ? '#6aac14' : 'none',
              color: tab === id ? '#fff' : '#a8d870',
            }}>{label}</button>
          ))}
        </div>

        {/* フィルター・ソート */}
        <div className="game-card" style={{ padding: '14px 20px' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ color: '#3d6e00', fontWeight: 'bold', fontSize: 13, whiteSpace: 'nowrap' }}>並び替え:</span>
            <select className="game-input" style={{ padding: '5px 10px', fontSize: 13, width: 'auto' }}
              value={sortOrder} onChange={e => setSortOrder(e.target.value as 'newest' | 'oldest')}>
              <option value="newest">新しい順</option>
              <option value="oldest">古い順</option>
            </select>

            <span style={{ color: '#3d6e00', fontWeight: 'bold', fontSize: 13, whiteSpace: 'nowrap' }}>コース:</span>
            <select className="game-input" style={{ padding: '5px 10px', fontSize: 13, width: 'auto' }}
              value={filterCourse} onChange={e => setFilterCourse(e.target.value)}>
              <option value="">全て</option>
              <option value="Unity">Unity</option>
              <option value="Blender">Blender</option>
            </select>

            <span style={{ color: '#3d6e00', fontWeight: 'bold', fontSize: 13, whiteSpace: 'nowrap' }}>ステージ:</span>
            <select className="game-input" style={{ padding: '5px 10px', fontSize: 13, width: 'auto' }}
              value={filterStage} onChange={e => setFilterStage(e.target.value)}>
              <option value="">全て</option>
              <option value="Foundation">Ⅰ. 基礎</option>
              <option value="Development">Ⅱ. 応用</option>
              <option value="Production">Ⅲ. 実践</option>
            </select>

            <span style={{ color: '#3d6e00', fontWeight: 'bold', fontSize: 13, whiteSpace: 'nowrap' }}>日付:</span>
            <input type="date" className="game-input" style={{ padding: '5px 10px', fontSize: 13, width: 'auto' }}
              value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
            <span style={{ color: '#3d6e00', fontSize: 13 }}>〜</span>
            <input type="date" className="game-input" style={{ padding: '5px 10px', fontSize: 13, width: 'auto' }}
              value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />

            {(filterCourse || filterStage || filterDateFrom || filterDateTo) && (
              <button onClick={() => { setFilterCourse(''); setFilterStage(''); setFilterDateFrom(''); setFilterDateTo('') }}
                style={{ padding: '5px 12px', borderRadius: 8, border: '2px solid #c0392b', background: 'none', color: '#c0392b', cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
                リセット
              </button>
            )}
          </div>

          <p style={{ color: '#888', fontSize: 12, marginTop: 8 }}>表示中: {filteredPosts.length} 件</p>

          {/* 一括削除 */}
          {canManage && filteredPosts.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ color: '#c0392b', fontWeight: 'bold', fontSize: 12 }}>一括削除 ({filteredPosts.length}件):</span>
              <button onClick={() => bulkDelete('thumb')} disabled={bulkDeleting}
                style={{ padding: '4px 12px', borderRadius: 8, border: '2px solid #c0392b', background: 'none', color: '#c0392b', cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
                {bulkDeleting ? '削除中…' : 'サムネイル削除'}
              </button>
              <button onClick={() => bulkDelete('video')} disabled={bulkDeleting}
                style={{ padding: '4px 12px', borderRadius: 8, border: '2px solid #c0392b', background: 'none', color: '#c0392b', cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
                {bulkDeleting ? '削除中…' : '動画削除'}
              </button>
              <button onClick={() => bulkDelete('both')} disabled={bulkDeleting}
                style={{ padding: '4px 12px', borderRadius: 8, border: '2px solid #c0392b', background: '#c0392b', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
                {bulkDeleting ? '削除中…' : '全メディア削除'}
              </button>
            </div>
          )}
        </div>

        {/* 投稿リスト */}
        {filteredPosts.length === 0 ? (
          <div className="game-card" style={{ padding: '40px', textAlign: 'center' }}>
            <p style={{ fontSize: 28, marginBottom: 8 }}>📭</p>
            <p style={{ color: '#6aac14', fontSize: 16 }}>該当する投稿がありません</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredPosts.map(post => {
              const isOpen = expanded === post.id
              return (
                <div key={post.id} className="game-card" style={{ overflow: 'hidden' }}>
                  {/* 投稿ヘッダー */}
                  <button onClick={() => setExpanded(isOpen ? null : post.id)} style={{
                    width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                    padding: '14px 20px', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    {post.thumbnail_url ? (
                      <img src={post.thumbnail_url} alt={post.task.title}
                        style={{ width: 72, height: 54, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
                    ) : (
                      <div style={{
                        width: 72, height: 54, borderRadius: 8, flexShrink: 0,
                        background: 'linear-gradient(135deg, #c8e89a, #6aac14)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                      }}>🎮</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 'bold', color: '#2d5500', fontSize: 14, marginBottom: 2 }}>
                        {post.task.title}
                      </p>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                        {post.task.target_course && (
                          <span style={{ background: '#6aac14', color: 'white', borderRadius: 8, padding: '1px 7px', fontSize: 11, fontWeight: 'bold' }}>
                            {post.task.target_course}
                          </span>
                        )}
                        {post.task.target_stage && (
                          <span style={{ background: '#3d6e00', color: 'white', borderRadius: 8, padding: '1px 7px', fontSize: 11, fontWeight: 'bold' }}>
                            {STAGE_LABELS[post.task.target_stage] ?? post.task.target_stage}
                          </span>
                        )}
                      </div>
                      <p style={{ color: '#6aac14', fontSize: 12 }}>
                        {post.is_anonymous ? '🙈 匿名' : `👤 ${post.profile?.username ?? '名無し'}`}
                        {post.submitted_at && ` · ${new Date(post.submitted_at).toLocaleDateString('ja-JP')}`}
                      </p>
                    </div>
                    <span style={{ color: '#6aac14', fontSize: 18 }}>{isOpen ? '▲' : '▼'}</span>
                  </button>

                  {/* 展開パネル */}
                  {isOpen && (
                    <div style={{ padding: '0 20px 16px', borderTop: '2px dashed #c8e89a' }}>

                      {/* 削除ボタン (管理者のみ) */}
                      {canManage && (
                        <div style={{ display: 'flex', gap: 8, padding: '12px 0', flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ color: '#c0392b', fontWeight: 'bold', fontSize: 12 }}>ストレージ削除:</span>
                          <button
                            onClick={() => deleteFile(post.id, 'thumb')}
                            disabled={!post.thumbnail_url || deleting[post.id] === 'thumb'}
                            style={{
                              padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 'bold', cursor: 'pointer',
                              border: '2px solid #c0392b', background: 'none', color: '#c0392b',
                              opacity: !post.thumbnail_url ? 0.4 : 1,
                            }}>
                            {deleting[post.id] === 'thumb' ? '削除中…' : post.thumbnail_url ? 'サムネイル削除' : 'サムネなし'}
                          </button>
                          <button
                            onClick={() => deleteFile(post.id, 'video')}
                            disabled={!post.media_url || deleting[post.id] === 'video'}
                            style={{
                              padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 'bold', cursor: 'pointer',
                              border: '2px solid #c0392b', background: 'none', color: '#c0392b',
                              opacity: !post.media_url ? 0.4 : 1,
                            }}>
                            {deleting[post.id] === 'video' ? '削除中…' : post.media_url && !post.media_url.includes('youtube') && !post.media_url.includes('youtu.be') ? '動画削除' : post.media_url ? 'URL投稿(削除不可)' : 'メディアなし'}
                          </button>
                        </div>
                      )}

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                        {post.thumbnail_url && (
                          <img src={post.thumbnail_url} alt={post.task.title}
                            style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8 }} />
                        )}
                        {post.media_url && (
                          <div>
                            <p style={{ color: '#3d6e00', fontWeight: 'bold', fontSize: 13, marginBottom: 4 }}>🎬 提出作品</p>
                            <a href={post.media_url} target="_blank" rel="noopener noreferrer"
                              style={{ color: '#3d6e00', fontSize: 13, wordBreak: 'break-all' }}>
                              🔗 {post.media_url}
                            </a>
                          </div>
                        )}
                        {post.self_evaluation && (
                          <div>
                            <p style={{ color: '#3d6e00', fontWeight: 'bold', fontSize: 13, marginBottom: 4 }}>⭐ 自己評価</p>
                            <p style={{ color: '#2d5500', fontSize: 13, background: '#f0fae0', borderRadius: 8, padding: '8px 12px', whiteSpace: 'pre-wrap' }}>{post.self_evaluation}</p>
                          </div>
                        )}
                        {post.retrospective && (
                          <div>
                            <p style={{ color: '#3d6e00', fontWeight: 'bold', fontSize: 13, marginBottom: 4 }}>🔄 計画の振り返り</p>
                            <p style={{ color: '#2d5500', fontSize: 13, background: '#f0fae0', borderRadius: 8, padding: '8px 12px', whiteSpace: 'pre-wrap' }}>{post.retrospective}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

      </div>

      {/* ダッシュボードへ戻るボタン */}
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

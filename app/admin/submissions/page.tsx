"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../../lib/supabase'
import { getEffectivePermissions, PermissionKey } from '../../../lib/permissions'

// ─── 型 ───────────────────────────────────────────────────

interface Profile {
  id: string
  username: string | null
  course: string | null
  stage: string | null
}

interface AssignmentDetail {
  id: string
  user_id: string
  status: 'assigned' | 'in_progress' | 'submitted'
  plan_text: string | null
  midterm_progress: string | null
  midterm_correction: string | null
  media_url: string | null
  image_urls: string[] | null
  submission_comment: string | null
  self_evaluation: string | null
  retrospective: string | null
  course_request: string | null
  submitted_at: string | null
  is_anonymous: boolean
  thumbnail_url: string | null
  task: {
    id: string
    title: string
    target_course: string | null
    target_stage: string | null
  }
}

// ─── 定数 ─────────────────────────────────────────────────

const STATUS_INFO: Record<string, { label: string; bg: string; color: string }> = {
  assigned:    { label: 'アサイン済',  bg: '#e8e8e8', color: '#555' },
  in_progress: { label: '取り組み中', bg: '#d4f0a0', color: '#3d6e00' },
  submitted:   { label: '提出済',     bg: '#3d6e00', color: '#fff' },
}

const COURSE_LABELS: Record<string, string> = {
  Unity:   'Unityコース',
  Blender: 'Blenderコース',
}

const STAGE_LABELS: Record<string, string> = {
  Foundation:  'Ⅰ. 基礎',
  Development: 'Ⅱ. 応用',
  Production:  'Ⅲ. 実践',
}

// ─── コンポーネント ────────────────────────────────────────

export default function AdminSubmissionsPage() {
  const router = useRouter()
  const [profiles, setProfiles]     = useState<Profile[]>([])
  const [assignments, setAssignments] = useState<Record<string, AssignmentDetail[]>>({})
  const [expandedMember, setExpandedMember] = useState<string | null>(null)
  const [expandedTask, setExpandedTask]     = useState<Record<string, boolean>>({})
  const [loading, setLoading]       = useState(true)
  const [userRole, setUserRole]     = useState<string | null>(null)
  const [effectivePerms, setEffectivePerms] = useState<Record<PermissionKey, boolean>>({
    course_management: false, task_management: false,
    point_settings: false, submission_review: false, finance: false, timeline_management: false,
    dm_management: false, announcement_management: false, assignment_management: false, gimmick_management: false,
    dev_management: false,
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
        if (me.role !== 'admin' && !perms.submission_review) { router.replace('/dashboard'); return }
        if (mounted) { setUserRole(me.role); setEffectivePerms(perms) }

        const [profilesRes, assignmentsRes] = await Promise.all([
          supabase.from('profiles')
            .select('id, username, course, stage')
            .order('created_at', { ascending: true }),
          supabase.from('task_assignments')
            .select(`
              id, user_id, status, plan_text, midterm_progress, midterm_correction,
              media_url, image_urls, submission_comment, self_evaluation, retrospective, course_request, submitted_at,
              is_anonymous, thumbnail_url,
              task:tasks(id, title, target_course, target_stage)
            `)
            .order('created_at', { ascending: true }),
        ])

        if (!mounted) return

        setProfiles(profilesRes.data ?? [])

        // userId → AssignmentDetail[] のマップを構築
        const map: Record<string, AssignmentDetail[]> = {}
        for (const a of (assignmentsRes.data ?? [])) {
          if (!map[a.user_id]) map[a.user_id] = []
          map[a.user_id].push(a as unknown as AssignmentDetail)
        }
        setAssignments(map)
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
              <h1 className="game-title" style={{ fontSize: 32 }}>提出状況一覧</h1>
              <p style={{ color: '#3d6e00', marginTop: 4, fontSize: 14 }}>部員数: {profiles.length} 名</p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {(userRole === 'admin' || effectivePerms.course_management) && (
                <a href="/admin">
                  <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15 }}>
                    部員管理
                  </button>
                </a>
              )}
              {(userRole === 'admin' || effectivePerms.task_management) && (
                <a href="/admin/tasks">
                  <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15 }}>
                    課題管理
                  </button>
                </a>
              )}
              {(userRole === 'admin' || effectivePerms.point_settings) && (
                <a href="/admin/points">
                  <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15 }}>
                    ポイント設定
                  </button>
                </a>
              )}
              {(userRole === 'admin' || effectivePerms.timeline_management) && (
                <a href="/admin/timeline">
                  <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15 }}>
                    🎬 タイムライン管理
                  </button>
                </a>
              )}
              {userRole === 'admin' && (
                <a href="/admin/positions">
                  <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15 }}>
                    🏷 役職管理
                  </button>
                </a>
              )}
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

        {/* 部員カード一覧 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {profiles.length === 0 && (
            <div className="game-card" style={{ padding: 40, textAlign: 'center' }}>
              <p style={{ color: '#6aac14', fontSize: 16 }}>部員が見つかりません</p>
            </div>
          )}

          {profiles.map(profile => {
            const memberAssignments = assignments[profile.id] ?? []
            const isOpen = expandedMember === profile.id
            const submittedCount  = memberAssignments.filter(a => a.status === 'submitted').length
            const inProgressCount = memberAssignments.filter(a => a.status === 'in_progress').length
            const assignedCount   = memberAssignments.filter(a => a.status === 'assigned').length

            return (
              <div key={profile.id} className="game-card" style={{ padding: '20px 28px' }}>
                {/* 部員ヘッダー行 */}
                <button
                  onClick={() => setExpandedMember(isOpen ? null : profile.id)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                    padding: 0, textAlign: 'left',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 'bold', color: '#2d5500', fontSize: 18 }}>
                        {profile.username ?? '名前なし'}
                      </span>
                      {profile.course && (
                        <span style={{ background: '#6aac14', color: 'white', borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 'bold' }}>
                          {COURSE_LABELS[profile.course] ?? profile.course}
                        </span>
                      )}
                      {profile.stage && (
                        <span style={{ background: '#3d6e00', color: 'white', borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 'bold' }}>
                          {STAGE_LABELS[profile.stage] ?? profile.stage}
                        </span>
                      )}
                    </div>

                    {/* ステータスサマリー */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {memberAssignments.length === 0 ? (
                        <span style={{ color: '#aaa', fontSize: 13 }}>課題なし</span>
                      ) : (
                        <>
                          {submittedCount > 0 && (
                            <span style={{ background: '#3d6e00', color: '#fff', borderRadius: 10, padding: '2px 10px', fontSize: 12, fontWeight: 'bold' }}>
                              ✅ 提出済 {submittedCount}
                            </span>
                          )}
                          {inProgressCount > 0 && (
                            <span style={{ background: '#d4f0a0', color: '#3d6e00', borderRadius: 10, padding: '2px 10px', fontSize: 12, fontWeight: 'bold' }}>
                              🔥 取り組み中 {inProgressCount}
                            </span>
                          )}
                          {assignedCount > 0 && (
                            <span style={{ background: '#e8e8e8', color: '#555', borderRadius: 10, padding: '2px 10px', fontSize: 12, fontWeight: 'bold' }}>
                              📌 未着手 {assignedCount}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <span style={{ color: '#6aac14', fontSize: 20, marginLeft: 12 }}>
                    {isOpen ? '▲' : '▼'}
                  </span>
                </button>

                {/* 展開：課題詳細一覧 */}
                {isOpen && (
                  <div style={{ marginTop: 20 }}>
                    <hr style={{ border: 'none', borderTop: '2px dashed #c8e89a', marginBottom: 16 }} />

                    {memberAssignments.length === 0 ? (
                      <p style={{ color: '#aaa', fontSize: 14, textAlign: 'center', padding: '12px 0' }}>
                        課題がアサインされていません
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {memberAssignments.map(a => {
                          const si = STATUS_INFO[a.status]
                          const taskKey = `${profile.id}_${a.id}`
                          const isTaskOpen = expandedTask[taskKey] ?? false

                          return (
                            <div
                              key={a.id}
                              style={{
                                border: `2px solid ${a.status === 'submitted' ? '#6aac14' : '#c8e89a'}`,
                                borderRadius: 10,
                                background: a.status === 'submitted' ? '#f8fff0' : '#fff',
                                overflow: 'hidden',
                              }}
                            >
                              {/* 課題タイトル行 */}
                              <button
                                onClick={() => setExpandedTask(prev => ({ ...prev, [taskKey]: !isTaskOpen }))}
                                style={{
                                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                  width: '100%', padding: '12px 16px',
                                  background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                                }}
                              >
                                <div style={{ flex: 1 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                                    <span style={{ fontWeight: 'bold', color: '#2d5500', fontSize: 15 }}>
                                      {a.task.title}
                                    </span>
                                    <span style={{
                                      background: si.bg, color: si.color,
                                      borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 'bold',
                                    }}>
                                      {si.label}
                                    </span>
                                  </div>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    {a.task.target_course && (
                                      <span style={{ background: '#e8f5d0', color: '#3d6e00', borderRadius: 8, padding: '1px 7px', fontSize: 11 }}>
                                        {a.task.target_course}
                                      </span>
                                    )}
                                    {a.task.target_stage && (
                                      <span style={{ background: '#e8f5d0', color: '#3d6e00', borderRadius: 8, padding: '1px 7px', fontSize: 11 }}>
                                        {a.task.target_stage}
                                      </span>
                                    )}
                                    {a.submitted_at && (
                                      <span style={{ color: '#6aac14', fontSize: 11 }}>
                                        提出: {new Date(a.submitted_at).toLocaleDateString('ja-JP')}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <span style={{ color: '#6aac14', fontSize: 16, marginLeft: 8 }}>
                                  {isTaskOpen ? '▲' : '▼'}
                                </span>
                              </button>

                              {/* 展開：提出内容詳細 */}
                              {isTaskOpen && (
                                <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                  <hr style={{ border: 'none', borderTop: '1px dashed #c8e89a', margin: '0 0 4px' }} />

                                  {/* サムネイルと投稿設定 */}
                                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                                    {a.thumbnail_url ? (
                                      <img src={a.thumbnail_url} alt={a.task.title}
                                        style={{ width: 100, height: 70, objectFit: 'cover', borderRadius: 6, border: '2px solid #c8e89a', flexShrink: 0 }} />
                                    ) : (
                                      <div style={{
                                        width: 100, height: 70, borderRadius: 6, border: '2px dashed #c8e89a',
                                        background: '#f0fae0', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        flexShrink: 0,
                                      }}>
                                        <span style={{ color: '#c8e89a', fontSize: 22 }}>🎮</span>
                                      </div>
                                    )}
                                    <div>
                                      <span style={{
                                        display: 'inline-block',
                                        background: a.is_anonymous ? '#555' : '#6aac14',
                                        color: 'white', borderRadius: 10, padding: '2px 10px',
                                        fontSize: 12, fontWeight: 'bold',
                                      }}>
                                        {a.is_anonymous ? '🙈 匿名投稿' : '👤 実名投稿'}
                                      </span>
                                    </div>
                                  </div>

                                  {a.plan_text ? (
                                    <DetailBlock icon="📝" label="制作計画" text={a.plan_text} />
                                  ) : (
                                    <EmptyBlock label="制作計画" />
                                  )}

                                  {(a.midterm_progress || a.midterm_correction) && (
                                    <div>
                                      <p className="game-label" style={{ marginBottom: 6 }}>🔍 中間報告</p>
                                      {a.midterm_progress && (
                                        <div style={{ marginBottom: 6 }}>
                                          <p style={{ color: '#888', fontSize: 12, marginBottom: 2 }}>進捗状況</p>
                                          <p style={textBlockStyle}>{a.midterm_progress}</p>
                                        </div>
                                      )}
                                      {a.midterm_correction && (
                                        <div>
                                          <p style={{ color: '#888', fontSize: 12, marginBottom: 2 }}>修正計画</p>
                                          <p style={textBlockStyle}>{a.midterm_correction}</p>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {!a.midterm_progress && !a.midterm_correction && (
                                    <EmptyBlock label="中間報告" />
                                  )}

                                  {a.image_urls && a.image_urls.length > 0 ? (
                                    <div>
                                      <p className="game-label" style={{ marginBottom: 8 }}>🖼️ 提出画像 ({a.image_urls.length}枚)</p>
                                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        {a.image_urls.map((url, i) => (
                                          <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                            <img src={url} alt={`image-${i + 1}`}
                                              style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6, border: '2px solid #c8e89a' }} />
                                          </a>
                                        ))}
                                      </div>
                                    </div>
                                  ) : a.media_url ? (
                                    <div>
                                      <p className="game-label" style={{ marginBottom: 4 }}>🎬 提出URL（旧形式）</p>
                                      <a
                                        href={a.media_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ color: '#3d6e00', fontSize: 13, wordBreak: 'break-all' }}
                                      >
                                        {a.media_url}
                                      </a>
                                    </div>
                                  ) : (
                                    <EmptyBlock label="提出画像" />
                                  )}

                                  {a.submission_comment ? (
                                    <DetailBlock icon="📋" label="提出物の説明" text={a.submission_comment} />
                                  ) : (
                                    <EmptyBlock label="提出物の説明" />
                                  )}

                                  {a.self_evaluation ? (
                                    <DetailBlock icon="⭐" label="自己評価" text={a.self_evaluation} />
                                  ) : (
                                    <EmptyBlock label="自己評価" />
                                  )}

                                  {a.retrospective ? (
                                    <DetailBlock icon="🔄" label="計画の振り返り" text={a.retrospective} />
                                  ) : (
                                    <EmptyBlock label="計画の振り返り" />
                                  )}

                                  {a.course_request && (
                                    <div style={{ borderTop: '2px dashed #c8e89a', paddingTop: 12, marginTop: 4 }}>
                                      <DetailBlock icon="💬" label="コースへの要望" text={a.course_request} />
                                    </div>
                                  )}
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
            )
          })}
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

// ─── サブコンポーネント ────────────────────────────────────

const textBlockStyle: React.CSSProperties = {
  color: '#2d5500', fontSize: 14, lineHeight: 1.7,
  background: '#f0fae0', borderRadius: 8, padding: '10px 14px',
  whiteSpace: 'pre-wrap',
}

function DetailBlock({ icon, label, text }: { icon: string; label: string; text: string }) {
  return (
    <div>
      <p className="game-label" style={{ marginBottom: 4 }}>{icon} {label}</p>
      <p style={textBlockStyle}>{text}</p>
    </div>
  )
}

function EmptyBlock({ label }: { label: string }) {
  return (
    <p style={{ color: '#bbb', fontSize: 13 }}>
      {label}: <span style={{ fontStyle: 'italic' }}>未入力</span>
    </p>
  )
}

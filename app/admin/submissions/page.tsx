"use client"

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../../lib/supabase'
import { getEffectivePermissions, PermissionKey } from '../../../lib/permissions'
import { Film, Tag, Gamepad2, User, Search, Image, FileText, ClipboardList, Star, RefreshCw, MessageCircle, X as XIcon } from 'lucide-react'
import Icon from '../../components/Icon'

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
  video_url: string | null
  image_urls: string[] | null
  submission_comment: string | null
  self_evaluation: string | null
  retrospective: string | null
  course_request: string | null
  submitted_at: string | null
  is_anonymous: boolean
  thumbnail_url: string | null
  x_consent: boolean
  x_username: string | null
  task: {
    id: string
    title: string
    target_course: string | null
    target_stage: string | null
  }
}

interface SubmissionRow extends AssignmentDetail {
  profile: Profile
}

// ─── 定数 ─────────────────────────────────────────────────

const COURSE_LABELS: Record<string, string> = {
  Unity:   'Unityコース',
  Blender: 'Blenderコース',
}

const STAGE_LABELS: Record<string, string> = {
  Foundation:  'Ⅰ. 基礎',
  Development: 'Ⅱ. 応用',
  Production:  'Ⅲ. 実践',
}

const PAGE_SIZE = 8

// ─── コンポーネント ────────────────────────────────────────

export default function AdminSubmissionsPage() {
  const router = useRouter()
  const [rows, setRows]             = useState<SubmissionRow[]>([])
  const [expanded, setExpanded]     = useState<Record<string, boolean>>({})
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [loading, setLoading]       = useState(true)
  const [userRole, setUserRole]     = useState<string | null>(null)
  const [effectivePerms, setEffectivePerms] = useState<Record<PermissionKey, boolean>>({
    course_management: false, task_management: false,
    point_settings: false, submission_review: false, finance: false, timeline_management: false,
    dm_management: false, announcement_management: false, assignment_management: false, gimmick_management: false,
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
        if (me.role !== 'admin' && !perms.submission_review) { router.replace('/dashboard'); return }
        if (mounted) { setUserRole(me.role); setEffectivePerms(perms) }

        const [profilesRes, assignmentsRes] = await Promise.all([
          supabase.from('profiles')
            .select('id, username, course, stage'),
          supabase.from('task_assignments')
            .select(`
              id, user_id, status, plan_text, midterm_progress, midterm_correction,
              media_url, video_url, image_urls, submission_comment, self_evaluation, retrospective, course_request, submitted_at,
              is_anonymous, thumbnail_url, x_consent, x_username,
              task:tasks(id, title, target_course, target_stage)
            `)
            .not('submitted_at', 'is', null)
            .order('submitted_at', { ascending: false }),
        ])

        if (!mounted) return

        const profileMap: Record<string, Profile> = {}
        for (const p of (profilesRes.data ?? [])) profileMap[p.id] = p

        const merged: SubmissionRow[] = (assignmentsRes.data ?? [])
          .map(a => ({ ...(a as unknown as AssignmentDetail), profile: profileMap[a.user_id] ?? { id: a.user_id, username: null, course: null, stage: null } }))

        setRows(merged)
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

  const visibleRows = useMemo(() => rows.slice(0, visibleCount), [rows, visibleCount])
  const hasMore = visibleCount < rows.length

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
              <p style={{ color: '#3d6e00', marginTop: 4, fontSize: 14 }}>提出件数: {rows.length} 件</p>
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
                  <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Film size={14}/>タイムライン管理
                  </button>
                </a>
              )}
              {userRole === 'admin' && (
                <a href="/admin/positions">
                  <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Tag size={14}/>役職管理
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

        {/* 提出一覧（アコーディオン） */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.length === 0 && (
            <div className="game-card" style={{ padding: 40, textAlign: 'center' }}>
              <p style={{ color: '#6aac14', fontSize: 16 }}>提出はまだありません</p>
            </div>
          )}

          {visibleRows.map(row => {
            const isOpen = expanded[row.id] ?? false

            return (
              <div key={row.id} className="game-card" style={{ padding: 0, overflow: 'hidden' }}>
                {/* 行ヘッダー：日時 / 課題名 / 提出者 */}
                <button
                  onClick={() => setExpanded(prev => ({ ...prev, [row.id]: !isOpen }))}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                    padding: '16px 24px', textAlign: 'left', gap: 16,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ color: '#6aac14', fontSize: 13, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                        {row.submitted_at ? new Date(row.submitted_at).toLocaleString('ja-JP') : '—'}
                      </span>
                      <span style={{ fontWeight: 'bold', color: '#2d5500', fontSize: 16 }}>
                        {row.task.title}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#3d6e00', fontSize: 13 }}>
                        <User size={13}/>{row.profile.username ?? '名前なし'}
                      </span>
                      {row.profile.course && (
                        <span style={{ background: '#6aac14', color: 'white', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 'bold' }}>
                          {COURSE_LABELS[row.profile.course] ?? row.profile.course}
                        </span>
                      )}
                      {row.profile.stage && (
                        <span style={{ background: '#3d6e00', color: 'white', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 'bold' }}>
                          {STAGE_LABELS[row.profile.stage] ?? row.profile.stage}
                        </span>
                      )}
                      {row.is_anonymous && (
                        <span style={{ background: '#555', color: 'white', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 'bold' }}>
                          匿名投稿
                        </span>
                      )}
                    </div>
                  </div>
                  <span style={{ color: '#6aac14', fontSize: 18, flexShrink: 0 }}>
                    {isOpen ? '▲' : '▼'}
                  </span>
                </button>

                {/* 展開：提出内容詳細 */}
                {isOpen && (
                  <div style={{ padding: '0 24px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <hr style={{ border: 'none', borderTop: '2px dashed #c8e89a', margin: '0 0 4px' }} />

                    {/* サムネイル */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      {row.thumbnail_url ? (
                        <img src={row.thumbnail_url} alt={row.task.title}
                          style={{ width: 100, height: 70, objectFit: 'cover', borderRadius: 6, border: '2px solid #c8e89a', flexShrink: 0 }} />
                      ) : (
                        <div style={{
                          width: 100, height: 70, borderRadius: 6, border: '2px dashed #c8e89a',
                          background: '#f0fae0', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          <Gamepad2 size={22} style={{ color: '#c8e89a' }}/>
                        </div>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {(row.task.target_course || row.task.target_stage) && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            {row.task.target_course && (
                              <span style={{ background: '#e8f5d0', color: '#3d6e00', borderRadius: 8, padding: '1px 7px', fontSize: 11 }}>
                                {row.task.target_course}
                              </span>
                            )}
                            {row.task.target_stage && (
                              <span style={{ background: '#e8f5d0', color: '#3d6e00', borderRadius: 8, padding: '1px 7px', fontSize: 11 }}>
                                {row.task.target_stage}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {row.plan_text ? (
                      <DetailBlock icon="FileText" label="制作計画" text={row.plan_text} />
                    ) : (
                      <EmptyBlock label="制作計画" />
                    )}

                    {(row.midterm_progress || row.midterm_correction) ? (
                      <div>
                        <p className="game-label" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}><Search size={13}/>中間報告</p>
                        {row.midterm_progress && (
                          <div style={{ marginBottom: 6 }}>
                            <p style={{ color: '#888', fontSize: 12, marginBottom: 2 }}>進捗状況</p>
                            <p style={textBlockStyle}>{row.midterm_progress}</p>
                          </div>
                        )}
                        {row.midterm_correction && (
                          <div>
                            <p style={{ color: '#888', fontSize: 12, marginBottom: 2 }}>修正計画</p>
                            <p style={textBlockStyle}>{row.midterm_correction}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <EmptyBlock label="中間報告" />
                    )}

                    {row.video_url && (
                      <div>
                        <p className="game-label" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}><Film size={13}/>提出動画</p>
                        <video src={row.video_url} controls playsInline preload="metadata"
                          style={{ width: '100%', maxHeight: 240, borderRadius: 8, background: '#000', display: 'block', border: '2px solid #c8e89a' }} />
                      </div>
                    )}

                    {row.image_urls && row.image_urls.length > 0 ? (
                      <div>
                        <p className="game-label" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}><Image size={13}/>提出画像 ({row.image_urls.length}枚)</p>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {row.image_urls.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                              <img src={url} alt={`image-${i + 1}`}
                                style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6, border: '2px solid #c8e89a' }} />
                            </a>
                          ))}
                        </div>
                      </div>
                    ) : row.media_url && !row.video_url ? (
                      <div>
                        <p className="game-label" style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}><Film size={13}/>提出URL（旧形式）</p>
                        <a
                          href={row.media_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#3d6e00', fontSize: 13, wordBreak: 'break-all' }}
                        >
                          {row.media_url}
                        </a>
                      </div>
                    ) : (
                      <EmptyBlock label="提出画像" />
                    )}

                    {row.submission_comment ? (
                      <DetailBlock icon="ClipboardList" label="提出物の説明" text={row.submission_comment} />
                    ) : (
                      <EmptyBlock label="提出物の説明" />
                    )}

                    {row.self_evaluation ? (
                      <DetailBlock icon="Star" label="自己評価" text={row.self_evaluation} />
                    ) : (
                      <EmptyBlock label="自己評価" />
                    )}

                    {row.retrospective ? (
                      <DetailBlock icon="RefreshCw" label="計画の振り返り" text={row.retrospective} />
                    ) : (
                      <EmptyBlock label="計画の振り返り" />
                    )}

                    {row.course_request && (
                      <DetailBlock icon="MessageCircle" label="コースへの要望" text={row.course_request} />
                    )}

                    {/* 公式X紹介同意 */}
                    <div style={{ borderTop: '2px dashed #c8e89a', paddingTop: 12, marginTop: 4 }}>
                      <p className="game-label" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}><XIcon size={13}/>公式Xでの紹介</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{
                          display: 'inline-block',
                          background: row.x_consent ? '#6aac14' : '#aaa',
                          color: 'white', borderRadius: 10, padding: '2px 10px',
                          fontSize: 12, fontWeight: 'bold',
                        }}>
                          {row.x_consent ? '同意あり' : '同意なし'}
                        </span>
                        {row.x_username && (
                          <span style={{ color: '#3d6e00', fontSize: 13 }}>@{row.x_username}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* もっと見る */}
        {hasMore && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 20 }}>
            <button
              className="game-button"
              style={{ width: 'auto', padding: '8px 24px', fontSize: 14 }}
              onClick={() => setVisibleCount(c => Math.min(c + PAGE_SIZE, rows.length))}
            >
              さらに表示
            </button>
            <button
              className="game-button"
              style={{ width: 'auto', padding: '8px 24px', fontSize: 14, background: '#888', borderColor: '#555' }}
              onClick={() => setVisibleCount(rows.length)}
            >
              すべて表示
            </button>
          </div>
        )}

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
      <p className="game-label" style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name={icon} size={13}/>{label}</p>
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

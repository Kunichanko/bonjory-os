"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../../lib/supabase'
import { getEffectivePermissions, PermissionKey } from '../../../lib/permissions'
import { Film, Tag, CheckCircle2, Flame, Pin, Gamepad2, User, Search, Image, FileText, ClipboardList, Star, RefreshCw, MessageCircle } from 'lucide-react'
import Icon from '../../components/Icon'

// 笏笏笏 蝙・笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

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

// 笏笏笏 螳壽焚 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

const STATUS_INFO: Record<string, { label: string; bg: string; color: string }> = {
  assigned:    { label: '繧｢繧ｵ繧､繝ｳ貂・,  bg: '#e8e8e8', color: '#555' },
  in_progress: { label: '蜿悶ｊ邨・∩荳ｭ', bg: '#d4f0a0', color: '#3d6e00' },
  submitted:   { label: '謠仙・貂・,     bg: '#3d6e00', color: '#fff' },
}

const COURSE_LABELS: Record<string, string> = {
  Unity:   'Unity繧ｳ繝ｼ繧ｹ',
  Blender: 'Blender繧ｳ繝ｼ繧ｹ',
}

const STAGE_LABELS: Record<string, string> = {
  Foundation:  '竇. 蝓ｺ遉・,
  Development: '竇｡. 蠢懃畑',
  Production:  '竇｢. 螳溯ｷｵ',
}

// 笏笏笏 繧ｳ繝ｳ繝昴・繝阪Φ繝・笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

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

        // userId 竊・AssignmentDetail[] 縺ｮ繝槭ャ繝励ｒ讒狗ｯ・
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

        {/* 繝倥ャ繝繝ｼ */}
        <div className="game-card" style={{ padding: '24px 32px', marginBottom: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <h1 className="game-title" style={{ fontSize: 32 }}>謠仙・迥ｶ豕∽ｸ隕ｧ</h1>
              <p style={{ color: '#3d6e00', marginTop: 4, fontSize: 14 }}>驛ｨ蜩｡謨ｰ: {profiles.length} 蜷・/p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {(userRole === 'admin' || effectivePerms.course_management) && (
                <a href="/admin">
                  <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15 }}>
                    驛ｨ蜩｡邂｡逅・
                  </button>
                </a>
              )}
              {(userRole === 'admin' || effectivePerms.task_management) && (
                <a href="/admin/tasks">
                  <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15 }}>
                    隱ｲ鬘檎ｮ｡逅・
                  </button>
                </a>
              )}
              {(userRole === 'admin' || effectivePerms.point_settings) && (
                <a href="/admin/points">
                  <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15 }}>
                    繝昴う繝ｳ繝郁ｨｭ螳・
                  </button>
                </a>
              )}
              {(userRole === 'admin' || effectivePerms.timeline_management) && (
                <a href="/admin/timeline">
                  <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Film size={14}/>繧ｿ繧､繝繝ｩ繧､繝ｳ邂｡逅・
                  </button>
                </a>
              )}
              {userRole === 'admin' && (
                <a href="/admin/positions">
                  <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Tag size={14}/>蠖ｹ閨ｷ邂｡逅・
                  </button>
                </a>
              )}
              <button
                className="game-button"
                style={{ width: 'auto', padding: '8px 20px', fontSize: 15, background: '#888', borderColor: '#555' }}
                onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
              >
                繝ｭ繧ｰ繧｢繧ｦ繝・
              </button>
            </div>
          </div>
        </div>

        {/* 驛ｨ蜩｡繧ｫ繝ｼ繝我ｸ隕ｧ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {profiles.length === 0 && (
            <div className="game-card" style={{ padding: 40, textAlign: 'center' }}>
              <p style={{ color: '#6aac14', fontSize: 16 }}>驛ｨ蜩｡縺瑚ｦ九▽縺九ｊ縺ｾ縺帙ｓ</p>
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
                {/* 驛ｨ蜩｡繝倥ャ繝繝ｼ陦・*/}
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
                        {profile.username ?? '蜷榊燕縺ｪ縺・}
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

                    {/* 繧ｹ繝・・繧ｿ繧ｹ繧ｵ繝槭Μ繝ｼ */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {memberAssignments.length === 0 ? (
                        <span style={{ color: '#aaa', fontSize: 13 }}>隱ｲ鬘後↑縺・/span>
                      ) : (
                        <>
                          {submittedCount > 0 && (
                            <span style={{ background: '#3d6e00', color: '#fff', borderRadius: 10, padding: '2px 10px', fontSize: 12, fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <CheckCircle2 size={11}/>謠仙・貂・{submittedCount}
                            </span>
                          )}
                          {inProgressCount > 0 && (
                            <span style={{ background: '#d4f0a0', color: '#3d6e00', borderRadius: 10, padding: '2px 10px', fontSize: 12, fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Flame size={11}/>蜿悶ｊ邨・∩荳ｭ {inProgressCount}
                            </span>
                          )}
                          {assignedCount > 0 && (
                            <span style={{ background: '#e8e8e8', color: '#555', borderRadius: 10, padding: '2px 10px', fontSize: 12, fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Pin size={11}/>譛ｪ逹謇・{assignedCount}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <span style={{ color: '#6aac14', fontSize: 20, marginLeft: 12 }}>
                    {isOpen ? '笆ｲ' : '笆ｼ'}
                  </span>
                </button>

                {/* 螻暮幕・夊ｪｲ鬘瑚ｩｳ邏ｰ荳隕ｧ */}
                {isOpen && (
                  <div style={{ marginTop: 20 }}>
                    <hr style={{ border: 'none', borderTop: '2px dashed #c8e89a', marginBottom: 16 }} />

                    {memberAssignments.length === 0 ? (
                      <p style={{ color: '#aaa', fontSize: 14, textAlign: 'center', padding: '12px 0' }}>
                        隱ｲ鬘後′繧｢繧ｵ繧､繝ｳ縺輔ｌ縺ｦ縺・∪縺帙ｓ
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
                              {/* 隱ｲ鬘後ち繧､繝医Ν陦・*/}
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
                                        謠仙・: {new Date(a.submitted_at).toLocaleDateString('ja-JP')}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <span style={{ color: '#6aac14', fontSize: 16, marginLeft: 8 }}>
                                  {isTaskOpen ? '笆ｲ' : '笆ｼ'}
                                </span>
                              </button>

                              {/* 螻暮幕・壽署蜃ｺ蜀・ｮｹ隧ｳ邏ｰ */}
                              {isTaskOpen && (
                                <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                  <hr style={{ border: 'none', borderTop: '1px dashed #c8e89a', margin: '0 0 4px' }} />

                                  {/* 繧ｵ繝繝阪う繝ｫ縺ｨ謚慕ｨｿ險ｭ螳・*/}
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
                                        <Gamepad2 size={22} style={{ color: '#c8e89a' }}/>
                                      </div>
                                    )}
                                    <div>
                                      <span style={{
                                        display: 'inline-block',
                                        background: a.is_anonymous ? '#555' : '#6aac14',
                                        color: 'white', borderRadius: 10, padding: '2px 10px',
                                        fontSize: 12, fontWeight: 'bold',
                                      }}>
                                        {a.is_anonymous
                                          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><User size={11} style={{ opacity: 0.5 }}/>蛹ｿ蜷肴兜遞ｿ</span>
                                          : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><User size={11}/>螳溷錐謚慕ｨｿ</span>
                                        }
                                      </span>
                                    </div>
                                  </div>

                                  {a.plan_text ? (
                                    <DetailBlock icon="FileText" label="蛻ｶ菴懆ｨ育判" text={a.plan_text} />
                                  ) : (
                                    <EmptyBlock label="蛻ｶ菴懆ｨ育判" />
                                  )}

                                  {(a.midterm_progress || a.midterm_correction) && (
                                    <div>
                                      <p className="game-label" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}><Search size={13}/>荳ｭ髢灘ｱ蜻・/p>
                                      {a.midterm_progress && (
                                        <div style={{ marginBottom: 6 }}>
                                          <p style={{ color: '#888', fontSize: 12, marginBottom: 2 }}>騾ｲ謐礼憾豕・/p>
                                          <p style={textBlockStyle}>{a.midterm_progress}</p>
                                        </div>
                                      )}
                                      {a.midterm_correction && (
                                        <div>
                                          <p style={{ color: '#888', fontSize: 12, marginBottom: 2 }}>菫ｮ豁｣險育判</p>
                                          <p style={textBlockStyle}>{a.midterm_correction}</p>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {!a.midterm_progress && !a.midterm_correction && (
                                    <EmptyBlock label="荳ｭ髢灘ｱ蜻・ />
                                  )}

                                  {a.image_urls && a.image_urls.length > 0 ? (
                                    <div>
                                      <p className="game-label" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}><Image size={13}/>謠仙・逕ｻ蜒・({a.image_urls.length}譫・</p>
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
                                      <p className="game-label" style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}><Film size={13}/>謠仙・URL・域立蠖｢蠑擾ｼ・/p>
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
                                    <EmptyBlock label="謠仙・逕ｻ蜒・ />
                                  )}

                                  {a.submission_comment ? (
                                    <DetailBlock icon="ClipboardList" label="謠仙・迚ｩ縺ｮ隱ｬ譏・ text={a.submission_comment} />
                                  ) : (
                                    <EmptyBlock label="謠仙・迚ｩ縺ｮ隱ｬ譏・ />
                                  )}

                                  {a.self_evaluation ? (
                                    <DetailBlock icon="Star" label="閾ｪ蟾ｱ隧穂ｾ｡" text={a.self_evaluation} />
                                  ) : (
                                    <EmptyBlock label="閾ｪ蟾ｱ隧穂ｾ｡" />
                                  )}

                                  {a.retrospective ? (
                                    <DetailBlock icon="RefreshCw" label="險育判縺ｮ謖ｯ繧願ｿ斐ｊ" text={a.retrospective} />
                                  ) : (
                                    <EmptyBlock label="險育判縺ｮ謖ｯ繧願ｿ斐ｊ" />
                                  )}

                                  {a.course_request && (
                                    <div style={{ borderTop: '2px dashed #c8e89a', paddingTop: 12, marginTop: 4 }}>
                                      <DetailBlock icon="MessageCircle" label="繧ｳ繝ｼ繧ｹ縺ｸ縺ｮ隕∵悍" text={a.course_request} />
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
          竊・繝繝・す繝･繝懊・繝・
        </button>
      </a>
    </div>
  )
}

// 笏笏笏 繧ｵ繝悶さ繝ｳ繝昴・繝阪Φ繝・笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

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
      {label}: <span style={{ fontStyle: 'italic' }}>譛ｪ蜈･蜉・/span>
    </p>
  )
}


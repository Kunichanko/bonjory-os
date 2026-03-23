"use client"

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../../lib/supabase'
import { getEffectivePermissions, PermissionKey } from '../../../lib/permissions'

type AnnouncementType = 'recurring' | 'scheduled' | 'personal' | 'link' | 'immediate'

interface Announcement {
  id: string
  type: AnnouncementType
  title: string
  body: string
  url: string | null
  scheduled_at: string | null
  day_of_week: number | null
  time_of_day: string | null
  target_user_ids: string[] | null
  is_active: boolean
  sent_at: string | null
  last_sent_at: string | null
  created_at: string
}

interface Profile {
  id: string
  username: string | null
}

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

const TYPE_LABELS: Record<AnnouncementType, string> = {
  recurring: '🔁 定期',
  scheduled: '📅 予約',
  personal:  '👤 個人',
  link:      '🔗 リンク',
  immediate: '⚡ 即時',
}

const TYPE_COLORS: Record<AnnouncementType, string> = {
  recurring: '#6aac14',
  scheduled: '#3498db',
  personal:  '#9b59b6',
  link:      '#e67e22',
  immediate: '#e74c3c',
}

export default function AnnouncementsPage() {
  const router = useRouter()
  const [loading, setLoading]               = useState(true)
  const [userRole, setUserRole]             = useState<string | null>(null)
  const [effectivePerms, setEffectivePerms] = useState<Record<PermissionKey, boolean>>({
    course_management: false, task_management: false,
    point_settings: false, submission_review: false, finance: false,
    timeline_management: false, dm_management: false, announcement_management: false, assignment_management: false, gimmick_management: false,
    dev_management: false,
 news_management: false,
  })

  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [allProfiles, setAllProfiles]     = useState<Profile[]>([])
  const [error, setError]                 = useState<string | null>(null)
  const [success, setSuccess]             = useState<string | null>(null)

  // フォーム state
  const [formType, setFormType]               = useState<AnnouncementType>('scheduled')
  const [formTitle, setFormTitle]             = useState('')
  const [formBody, setFormBody]               = useState('')
  const [formUrl, setFormUrl]                 = useState('')
  const [formScheduledAt, setFormScheduledAt] = useState('')
  const [formDayOfWeek, setFormDayOfWeek]     = useState<number>(1)
  const [formTimeOfDay, setFormTimeOfDay]     = useState('18:00')
  const [formTargetIds, setFormTargetIds]     = useState<string[]>([])
  const [submitting, setSubmitting]           = useState(false)
  const [sendingId, setSendingId]             = useState<string | null>(null)

  // 通知リセット state
  const [resetTargetId, setResetTargetId]   = useState('')
  const [resetting, setResetting]           = useState(false)

  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let mounted = true
    async function init() {
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser()
        if (authError || !authData?.user) { router.replace('/login'); return }
        const uid = authData.user.id

        const [meRes, permsRes] = await Promise.all([
          supabase.from('profiles').select('role').eq('id', uid).single(),
          getEffectivePermissions(uid),
        ])

        const isAdmin = meRes.data?.role === 'admin'
        if (!isAdmin && !permsRes.announcement_management) {
          router.replace('/dashboard'); return
        }

        if (mounted) {
          setUserRole(meRes.data?.role ?? null)
          setEffectivePerms(permsRes)
        }

        const [annsRes, profilesRes] = await Promise.all([
          supabase.from('announcements').select('*').order('created_at', { ascending: false }),
          supabase.from('profiles').select('id, username').order('username'),
        ])

        if (mounted) {
          setAnnouncements((annsRes.data ?? []) as Announcement[])
          setAllProfiles((profilesRes.data ?? []) as Profile[])
        }
      } catch (err) {
        console.error(err)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    init()
    return () => { mounted = false }
  }, [router])

  function showSuccess(msg: string) {
    setSuccess(msg)
    if (successTimer.current) clearTimeout(successTimer.current)
    successTimer.current = setTimeout(() => setSuccess(null), 3000)
  }

  async function refreshList() {
    const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending: false })
    setAnnouncements((data ?? []) as Announcement[])
  }

  async function createAnnouncement() {
    if (!formTitle.trim() || !formBody.trim()) {
      setError('タイトルと本文は必須です')
      return
    }
    if (formType !== 'recurring' && formType !== 'immediate' && !formScheduledAt) {
      setError('送信日時を指定してください')
      return
    }
    if (formType === 'personal' && formTargetIds.length === 0) {
      setError('送信対象を1人以上選択してください')
      return
    }

    setSubmitting(true)
    setError(null)

    const payload: Record<string, unknown> = {
      type:  formType,
      title: formTitle.trim(),
      body:  formBody.trim(),
      url:   formUrl.trim() || null,
    }

    if (formType === 'recurring') {
      payload.day_of_week = formDayOfWeek
      payload.time_of_day = formTimeOfDay
    } else if (formType !== 'immediate') {
      payload.scheduled_at = new Date(formScheduledAt).toISOString()
    }

    if (formType === 'personal') {
      payload.target_user_ids = formTargetIds
    }

    const { error: insErr } = await supabase.from('announcements').insert(payload)

    if (insErr) {
      setError(insErr.message)
    } else {
      showSuccess('アナウンスを作成しました')
      setFormTitle('')
      setFormBody('')
      setFormUrl('')
      setFormScheduledAt('')
      setFormTargetIds([])
      await refreshList()
    }
    setSubmitting(false)
  }

  async function sendNow(announcementId: string) {
    setSendingId(announcementId)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      const res = await fetch('/api/announcements/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ announcementId }),
      })
      const result = await res.json()
      if (!res.ok) {
        const detail = result.detail ? ` — ${result.detail}` : ''
        setError(`${result.error ?? '送信に失敗しました'}${detail}`)
      } else {
        const warnings = result.pushErrors?.length
          ? ` (pushエラー ${result.pushErrors.length}件: ${result.pushErrors[0]})`
          : ''
        showSuccess(`送信完了（${result.sent}/${result.total}件）${warnings}`)
        await refreshList()
      }
    } catch (e) {
      setError(`送信エラー: ${e instanceof Error ? e.message : String(e)}`)
    }
    setSendingId(null)
  }

  async function toggleActive(ann: Announcement) {
    const { error: updErr } = await supabase.from('announcements')
      .update({ is_active: !ann.is_active })
      .eq('id', ann.id)
    if (!updErr) {
      setAnnouncements(prev => prev.map(a => a.id === ann.id ? { ...a, is_active: !ann.is_active } : a))
    }
  }

  async function deleteAnnouncement(id: string) {
    await supabase.from('announcements').delete().eq('id', id)
    setAnnouncements(prev => prev.filter(a => a.id !== id))
  }

  async function resetNotifications() {
    if (!resetTargetId) return
    const target = allProfiles.find(p => p.id === resetTargetId)
    if (!confirm(`${target?.username ?? resetTargetId} の通知登録・ログを全削除しますか？`)) return
    setResetting(true)
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData?.session?.access_token
    const res = await fetch('/api/admin/reset-notifications', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ targetUserId: resetTargetId }),
    })
    setResetting(false)
    if (res.ok) {
      setSuccess(`${target?.username ?? resetTargetId} の通知をリセットしました`)
    } else {
      const data = await res.json()
      setError(data.error ?? 'リセットに失敗しました')
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
      <div style={{ maxWidth: 860, margin: '0 auto' }}>

        {/* ヘッダー */}
        <div className="game-card" style={{ padding: '24px 32px', marginBottom: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <h1 className="game-title" style={{ fontSize: 30 }}>📢 アナウンス管理</h1>
              <p style={{ color: '#3d6e00', marginTop: 4, fontSize: 13 }}>
                プッシュ通知の作成・管理
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {(userRole === 'admin' || effectivePerms.course_management) && (
                <a href="/admin"><button className="game-button" style={{ width: 'auto', padding: '8px 18px', fontSize: 14 }}>部員管理</button></a>
              )}
              <button
                className="game-button"
                style={{ width: 'auto', padding: '8px 18px', fontSize: 14, background: '#888', borderColor: '#555' }}
                onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
              >
                ログアウト
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="game-error" style={{
            marginBottom: 16,
            wordBreak: 'break-all',
            whiteSpace: 'pre-wrap',
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <span style={{ flex: 1 }}>{error}</span>
            <button
              onClick={() => setError(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c0392b', fontSize: 18, lineHeight: 1, flexShrink: 0, padding: 0 }}
            >✕</button>
          </div>
        )}
        {success && (
          <div style={{
            background: '#d4f0a0', color: '#1a4a00', border: '2px solid #6aac14',
            borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontWeight: 'bold',
          }}>
            {success}
          </div>
        )}

        {/* 作成フォーム */}
        <div className="game-card" style={{ padding: '24px 28px', marginBottom: 24 }}>
          <h2 className="game-title" style={{ fontSize: 20, marginBottom: 16 }}>新しいアナウンスを作成</h2>

          {/* タイプ切り替えタブ */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            {(['recurring', 'scheduled', 'personal', 'link', 'immediate'] as AnnouncementType[]).map(t => (
              <button
                key={t}
                onClick={() => setFormType(t)}
                style={{
                  padding: '8px 18px', fontSize: 14, fontWeight: 'bold',
                  borderRadius: 10, cursor: 'pointer',
                  background: formType === t ? TYPE_COLORS[t] : '#e8ffd4',
                  color: formType === t ? 'white' : '#2d5500',
                  border: `2px solid ${TYPE_COLORS[t]}`,
                }}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* タイトル */}
            <div>
              <label className="game-label">タイトル *</label>
              <input
                className="game-input"
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                placeholder="例：新しい課題が出されました！"
              />
            </div>

            {/* 本文 */}
            <div>
              <label className="game-label">本文 *</label>
              <textarea
                className="game-input"
                value={formBody}
                onChange={e => setFormBody(e.target.value)}
                placeholder="通知の詳細テキスト"
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </div>

            {/* 定期通知：曜日・時刻 */}
            {formType === 'recurring' && (
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <label className="game-label">送信曜日</label>
                  <select className="game-input" value={formDayOfWeek} onChange={e => setFormDayOfWeek(Number(e.target.value))}>
                    {DAY_LABELS.map((d, i) => <option key={i} value={i}>{d}曜日</option>)}
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <label className="game-label">送信時刻</label>
                  <input
                    className="game-input"
                    type="time"
                    value={formTimeOfDay}
                    onChange={e => setFormTimeOfDay(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* 予約・個人・リンク：送信日時 */}
            {formType !== 'recurring' && formType !== 'immediate' && (
              <div>
                <label className="game-label">送信日時 *</label>
                <input
                  className="game-input"
                  type="datetime-local"
                  value={formScheduledAt}
                  onChange={e => setFormScheduledAt(e.target.value)}
                />
              </div>
            )}

            {/* 個人通知：対象ユーザー */}
            {formType === 'personal' && (
              <div>
                <label className="game-label">送信対象 *（複数選択可）</label>
                <div style={{
                  maxHeight: 200, overflowY: 'auto',
                  border: '3px solid #3d6e00', borderRadius: 12,
                  padding: '8px 12px', background: '#f8fff0',
                }}>
                  {allProfiles.map(p => (
                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formTargetIds.includes(p.id)}
                        onChange={e => {
                          if (e.target.checked) setFormTargetIds(prev => [...prev, p.id])
                          else setFormTargetIds(prev => prev.filter(id => id !== p.id))
                        }}
                        style={{ accentColor: '#6aac14', width: 16, height: 16 }}
                      />
                      <span style={{ color: '#2d5500', fontSize: 14 }}>{p.username ?? p.id}</span>
                    </label>
                  ))}
                </div>
                <p style={{ color: '#6aac14', fontSize: 12, marginTop: 4 }}>選択中: {formTargetIds.length}人</p>
              </div>
            )}

            {/* 即時通知：説明 */}
            {formType === 'immediate' && (
              <p style={{ color: '#a8555a', fontSize: 13, background: '#fff0f0', border: '1px solid #e74c3c', borderRadius: 8, padding: '8px 12px' }}>
                ⚡ ボタンを押すと全端末に即時送信されます。スケジュール設定は不要です。
              </p>
            )}

            {/* リンク通知：URL */}
            {formType === 'link' && (
              <div>
                <label className="game-label">リンクURL *</label>
                <input
                  className="game-input"
                  type="url"
                  value={formUrl}
                  onChange={e => setFormUrl(e.target.value)}
                  placeholder="https://example.com"
                />
              </div>
            )}

            <button
              className="game-button"
              onClick={createAnnouncement}
              disabled={submitting}
              style={{ width: 'auto', padding: '10px 28px', fontSize: 16, alignSelf: 'flex-start' }}
            >
              {submitting ? '作成中…' : '作成する'}
            </button>
          </div>
        </div>

        {/* 通知リセット */}
        <div className="game-card" style={{ padding: '20px 28px', marginBottom: 24 }}>
          <h2 className="game-title" style={{ fontSize: 20, marginBottom: 4 }}>🔕 通知リセット</h2>
          <p style={{ color: '#5a8a1a', fontSize: 13, marginBottom: 16 }}>
            指定した部員のプッシュ通知登録と通知ログをすべて削除します。
            複数デバイスのエントリが蓄積している場合もこちらで解消できます。
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              className="game-input"
              style={{ flex: 1, minWidth: 160 }}
              value={resetTargetId}
              onChange={e => setResetTargetId(e.target.value)}
            >
              <option value="">部員を選択...</option>
              {allProfiles.map(p => (
                <option key={p.id} value={p.id}>{p.username ?? p.id}</option>
              ))}
            </select>
            <button
              className="game-button"
              style={{ width: 'auto', padding: '10px 24px', fontSize: 15, opacity: resetting || !resetTargetId ? 0.6 : 1 }}
              disabled={resetting || !resetTargetId}
              onClick={resetNotifications}
            >
              {resetting ? 'リセット中...' : 'リセット実行'}
            </button>
          </div>
        </div>

        {/* アナウンス一覧 */}
        <div className="game-card" style={{ padding: '20px 28px' }}>
          <h2 className="game-title" style={{ fontSize: 20, marginBottom: 16 }}>
            作成済みアナウンス（{announcements.length}件）
          </h2>

          {announcements.length === 0 ? (
            <p style={{ color: '#6aac14', textAlign: 'center', padding: 24 }}>アナウンスがありません</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {announcements.map(ann => (
                <div
                  key={ann.id}
                  style={{
                    border: `2px solid ${TYPE_COLORS[ann.type]}`,
                    borderRadius: 12,
                    padding: '14px 18px',
                    background: ann.is_active ? '#f8fff0' : '#f5f5f5',
                    opacity: ann.type === 'recurring' && !ann.is_active ? 0.6 : 1,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      {/* タイプバッジ + タイトル */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{
                          background: TYPE_COLORS[ann.type], color: 'white',
                          borderRadius: 8, padding: '2px 10px', fontSize: 11, fontWeight: 'bold',
                        }}>
                          {TYPE_LABELS[ann.type]}
                        </span>
                        <strong style={{ color: '#2d5500', fontSize: 15 }}>{ann.title}</strong>
                      </div>

                      <p style={{ color: '#555', fontSize: 13, marginBottom: 4 }}>{ann.body}</p>

                      {/* スケジュール情報 */}
                      {ann.type === 'recurring' && (
                        <p style={{ color: '#3d6e00', fontSize: 12 }}>
                          毎週{DAY_LABELS[ann.day_of_week ?? 1]}曜日 {ann.time_of_day?.slice(0, 5)}
                          {ann.last_sent_at && (
                            <span style={{ color: '#888', marginLeft: 8 }}>
                              最終送信: {new Date(ann.last_sent_at).toLocaleString('ja-JP')}
                            </span>
                          )}
                        </p>
                      )}
                      {ann.type === 'immediate' && (
                        <p style={{ color: '#888', fontSize: 12 }}>
                          {ann.last_sent_at
                            ? `最終送信: ${new Date(ann.last_sent_at).toLocaleString('ja-JP')}`
                            : '未送信'}
                        </p>
                      )}
                      {ann.scheduled_at && (
                        <p style={{ color: '#3d6e00', fontSize: 12 }}>
                          送信日時: {new Date(ann.scheduled_at).toLocaleString('ja-JP')}
                          {ann.sent_at && <span style={{ color: '#6aac14', marginLeft: 8 }}>✓ 送信済</span>}
                        </p>
                      )}
                      {ann.url && (
                        <p style={{ color: '#888', fontSize: 12 }}>URL: {ann.url}</p>
                      )}
                      {ann.type === 'personal' && ann.target_user_ids && (
                        <p style={{ color: '#9b59b6', fontSize: 12 }}>対象: {ann.target_user_ids.length}人</p>
                      )}
                    </div>

                    {/* アクションボタン */}
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {/* 定期通知のみ 有効/無効トグル */}
                      {ann.type === 'recurring' && (
                        <button
                          onClick={() => toggleActive(ann)}
                          style={{
                            padding: '5px 12px', fontSize: 12, fontWeight: 'bold',
                            borderRadius: 8, cursor: 'pointer',
                            background: ann.is_active ? '#e8ffd4' : '#f5f5f5',
                            color: ann.is_active ? '#1a6e00' : '#888',
                            border: `2px solid ${ann.is_active ? '#6aac14' : '#ccc'}`,
                          }}
                        >
                          {ann.is_active ? '有効' : '無効'}
                        </button>
                      )}

                      {/* 今すぐ送信（定期・即時 or 未送信のもの） */}
                      {(ann.type === 'recurring' || ann.type === 'immediate' || !ann.sent_at) && (
                        <button
                          onClick={() => sendNow(ann.id)}
                          disabled={sendingId === ann.id}
                          style={{
                            padding: '5px 12px', fontSize: 12, fontWeight: 'bold',
                            borderRadius: 8, cursor: 'pointer',
                            background: sendingId === ann.id ? '#ccc' : '#fff3e0',
                            color: sendingId === ann.id ? '#888' : '#a04000',
                            border: '2px solid #e67e22',
                          }}
                        >
                          {sendingId === ann.id ? '送信中…' : '今すぐ送信'}
                        </button>
                      )}

                      {/* 削除 */}
                      <button
                        onClick={() => deleteAnnouncement(ann.id)}
                        style={{
                          padding: '5px 10px', fontSize: 13, fontWeight: 'bold',
                          borderRadius: 8, cursor: 'pointer',
                          background: 'none', color: '#c0392b',
                          border: '2px solid #c0392b',
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

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

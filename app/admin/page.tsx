"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../lib/supabase'

type Course = 'Unity' | 'Blender' | null
type Stage  = 'Foundation' | 'Development' | 'Production' | null

interface Profile {
  id: string
  username: string | null
  email: string | null
  course: Course
  stage: Stage
}

const COURSE_OPTIONS: { label: string; value: Course }[] = [
  { label: '—', value: null },
  { label: 'Unity', value: 'Unity' },
  { label: 'Blender', value: 'Blender' },
]

const STAGE_OPTIONS: { label: string; value: Stage }[] = [
  { label: '—', value: null },
  { label: 'Foundation（基礎）', value: 'Foundation' },
  { label: 'Development（応用）', value: 'Development' },
  { label: 'Production（実践）', value: 'Production' },
]

export default function AdminPage() {
  const router = useRouter()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser()
        if (authError || !authData?.user) {
          router.replace('/login')
          return
        }

        const { data: me, error: meError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', authData.user.id)
          .single()

        if (meError || !me || me.role !== 'admin') {
          router.replace('/dashboard')
          return
        }

        const { data: allProfiles, error: listError } = await supabase
          .from('profiles')
          .select('id, username, email, course, stage')
          .order('created_at', { ascending: true })

        if (listError) throw listError
        if (mounted) setProfiles(allProfiles ?? [])
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

  async function handleUpdate(
    profileId: string,
    field: 'course' | 'stage',
    value: Course | Stage,
  ) {
    const key = `${profileId}_${field}`
    setSaving(prev => ({ ...prev, [profileId]: field }))
    setErrors(prev => { const next = { ...prev }; delete next[key]; return next })

    const { error } = await supabase
      .from('profiles')
      .update({ [field]: value })
      .eq('id', profileId)

    if (error) {
      setErrors(prev => ({ ...prev, [key]: error.message }))
    } else {
      setProfiles(prev =>
        prev.map(p => p.id === profileId ? { ...p, [field]: value } : p)
      )
    }

    setSaving(prev => { const next = { ...prev }; delete next[profileId]; return next })
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 className="game-title" style={{ fontSize: 32 }}>部員管理</h1>
              <p style={{ color: '#3d6e00', marginTop: 4, fontSize: 14 }}>
                部員数: {profiles.length} 名
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <a href="/admin/tasks">
                <button className="game-button" style={{ width: 'auto', padding: '8px 20px', fontSize: 15 }}>
                  課題管理
                </button>
              </a>
              <button
                className="game-button"
                style={{ width: 'auto', padding: '8px 20px', fontSize: 15, background: '#888', borderColor: '#555' }}
                onClick={async () => {
                  await supabase.auth.signOut()
                  router.push('/login')
                }}
              >
                ログアウト
              </button>
            </div>
          </div>
        </div>

        {/* 部員テーブル */}
        <div className="game-card" style={{ padding: '24px 28px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '3px solid #3d6e00' }}>
                {['ユーザー名', 'メール', 'コース', 'ステージ'].map(h => (
                  <th
                    key={h}
                    className="game-label"
                    style={{ textAlign: 'left', padding: '8px 12px', fontSize: 13 }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {profiles.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: 40, color: '#6aac14', fontSize: 16 }}>
                    部員が見つかりません
                  </td>
                </tr>
              )}
              {profiles.map((profile, idx) => (
                <tr
                  key={profile.id}
                  style={{
                    borderBottom: idx < profiles.length - 1 ? '1px solid #c8e89a' : 'none',
                    background: idx % 2 === 0 ? '#f8fff0' : '#ffffff',
                  }}
                >
                  <td style={{ padding: '10px 12px', color: '#2d5500', fontWeight: 'bold' }}>
                    {profile.username ?? '—'}
                  </td>

                  <td style={{ padding: '10px 12px', color: '#3d6e00', fontSize: 14 }}>
                    {profile.email ?? '—'}
                  </td>

                  {/* コース */}
                  <td style={{ padding: '8px 12px' }}>
                    <select
                      className="game-input"
                      style={{ padding: '6px 10px', fontSize: 14 }}
                      value={profile.course ?? ''}
                      disabled={saving[profile.id] === 'course'}
                      onChange={e => handleUpdate(
                        profile.id,
                        'course',
                        (e.target.value || null) as Course,
                      )}
                    >
                      {COURSE_OPTIONS.map(opt => (
                        <option key={String(opt.value)} value={opt.value ?? ''}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    {errors[`${profile.id}_course`] && (
                      <div className="game-error" style={{ marginTop: 4, fontSize: 12 }}>
                        {errors[`${profile.id}_course`]}
                      </div>
                    )}
                  </td>

                  {/* ステージ */}
                  <td style={{ padding: '8px 12px' }}>
                    <select
                      className="game-input"
                      style={{ padding: '6px 10px', fontSize: 14 }}
                      value={profile.stage ?? ''}
                      disabled={saving[profile.id] === 'stage'}
                      onChange={e => handleUpdate(
                        profile.id,
                        'stage',
                        (e.target.value || null) as Stage,
                      )}
                    >
                      {STAGE_OPTIONS.map(opt => (
                        <option key={String(opt.value)} value={opt.value ?? ''}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    {errors[`${profile.id}_stage`] && (
                      <div className="game-error" style={{ marginTop: 4, fontSize: 12 }}>
                        {errors[`${profile.id}_stage`]}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  )
}

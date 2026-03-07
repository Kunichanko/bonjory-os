"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../lib/supabase'

export default function AccountPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [currentUsername, setCurrentUsername] = useState('')
  const [currentEmail, setCurrentEmail] = useState('')

  // Username section
  const [newUsername, setNewUsername] = useState('')
  const [usernameSaving, setUsernameSaving] = useState(false)
  const [usernameMsg, setUsernameMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Email section
  const [newEmail, setNewEmail] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailMsg, setEmailMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Password section
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    async function init() {
      const { data, error } = await supabase.auth.getUser()
      if (error || !data?.user) { router.replace('/login'); return }

      const uid = data.user.id
      setCurrentEmail(data.user.email ?? '')

      const { data: profile } = await supabase
        .from('profiles').select('username').eq('id', uid).single()
      setCurrentUsername(profile?.username ?? '')
      setNewUsername(profile?.username ?? '')
      setLoading(false)
    }
    init()
  }, [router])

  async function handleSaveUsername(e: React.FormEvent) {
    e.preventDefault()
    setUsernameMsg(null)
    if (!newUsername.trim()) { setUsernameMsg({ type: 'error', text: '名前を入力してください' }); return }
    setUsernameSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/update-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ username: newUsername }),
      })
      const json = await res.json()
      if (!res.ok) { setUsernameMsg({ type: 'error', text: json.error ?? '保存に失敗しました' }); return }
      setCurrentUsername(newUsername.trim())
      setUsernameMsg({ type: 'success', text: '名前を更新しました' })
    } catch (err: any) {
      setUsernameMsg({ type: 'error', text: err?.message ?? '保存に失敗しました' })
    } finally {
      setUsernameSaving(false)
    }
  }

  async function handleSaveEmail(e: React.FormEvent) {
    e.preventDefault()
    setEmailMsg(null)
    if (!newEmail.trim()) { setEmailMsg({ type: 'error', text: 'メールアドレスを入力してください' }); return }
    setEmailSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() })
      if (error) { setEmailMsg({ type: 'error', text: error.message }); return }
      setCurrentEmail(newEmail.trim())
      setNewEmail('')
      setEmailMsg({ type: 'success', text: 'メールアドレスを更新しました' })
    } catch (err: any) {
      setEmailMsg({ type: 'error', text: err?.message ?? '保存に失敗しました' })
    } finally {
      setEmailSaving(false)
    }
  }

  async function handleSavePassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordMsg(null)
    if (!newPassword) { setPasswordMsg({ type: 'error', text: 'パスワードを入力してください' }); return }
    if (newPassword.length < 6) { setPasswordMsg({ type: 'error', text: 'パスワードは6文字以上にしてください' }); return }
    if (newPassword !== confirmPassword) { setPasswordMsg({ type: 'error', text: 'パスワードが一致しません' }); return }
    setPasswordSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) { setPasswordMsg({ type: 'error', text: error.message }); return }
      setNewPassword('')
      setConfirmPassword('')
      setPasswordMsg({ type: 'success', text: 'パスワードを更新しました' })
    } catch (err: any) {
      setPasswordMsg({ type: 'error', text: err?.message ?? '保存に失敗しました' })
    } finally {
      setPasswordSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#a8d870' }}>読み込み中…</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', padding: '24px 16px 48px' }}>
      {/* Back button */}
      <button
        onClick={() => router.push('/dashboard')}
        style={{
          position: 'fixed', top: 20, left: 16, zIndex: 50,
          background: '#3d6e00', color: '#a8d870', border: '2px solid #6aac14',
          borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: 'pointer',
        }}
      >
        ← ダッシュボード
      </button>

      <div style={{ maxWidth: 500, margin: '0 auto', paddingTop: 56 }}>
        <h1 className="game-title" style={{ fontSize: 32, marginBottom: 32, textAlign: 'center', color: '#ffffff', fontWeight: 900 }}>
          アカウント設定
        </h1>

        {/* Username */}
        <div className="game-card" style={{ padding: '24px 28px', marginBottom: 24 }}>
          <h2 style={{ color: '#6aac14', fontSize: 16, fontWeight: 'bold', marginBottom: 4 }}>ユーザー名</h2>
          <p style={{ color: '#a8d870', fontSize: 13, marginBottom: 16 }}>現在: {currentUsername || '（未設定）'}</p>
          <form onSubmit={handleSaveUsername} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="game-label">新しい名前</label>
              <input
                className="game-input"
                type="text"
                value={newUsername}
                onChange={e => setNewUsername(e.target.value)}
                placeholder="ユーザー名を入力"
                maxLength={50}
              />
            </div>
            <button className="game-button" type="submit" disabled={usernameSaving}>
              {usernameSaving ? '保存中…' : '名前を変更'}
            </button>
            {usernameMsg && (
              <div className={usernameMsg.type === 'success' ? 'game-success' : 'game-error'}>
                {usernameMsg.text}
              </div>
            )}
          </form>
        </div>

        {/* Email */}
        <div className="game-card" style={{ padding: '24px 28px', marginBottom: 24 }}>
          <h2 style={{ color: '#6aac14', fontSize: 16, fontWeight: 'bold', marginBottom: 4 }}>メールアドレス</h2>
          <p style={{ color: '#a8d870', fontSize: 13, marginBottom: 16 }}>現在: {currentEmail || '（未設定）'}</p>
          <form onSubmit={handleSaveEmail} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="game-label">新しいメールアドレス</label>
              <input
                className="game-input"
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="example@email.com"
              />
            </div>
            <button className="game-button" type="submit" disabled={emailSaving}>
              {emailSaving ? '保存中…' : 'メールアドレスを変更'}
            </button>
            {emailMsg && (
              <div className={emailMsg.type === 'success' ? 'game-success' : 'game-error'}>
                {emailMsg.text}
              </div>
            )}
          </form>
        </div>

        {/* Password */}
        <div className="game-card" style={{ padding: '24px 28px' }}>
          <h2 style={{ color: '#6aac14', fontSize: 16, fontWeight: 'bold', marginBottom: 16 }}>パスワード変更</h2>
          <form onSubmit={handleSavePassword} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="game-label">新しいパスワード</label>
              <input
                className="game-input"
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="6文字以上"
              />
            </div>
            <div>
              <label className="game-label">パスワード（確認）</label>
              <input
                className="game-input"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="もう一度入力"
              />
            </div>
            <button className="game-button" type="submit" disabled={passwordSaving}>
              {passwordSaving ? '保存中…' : 'パスワードを変更'}
            </button>
            {passwordMsg && (
              <div className={passwordMsg.type === 'success' ? 'game-success' : 'game-error'}>
                {passwordMsg.text}
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}

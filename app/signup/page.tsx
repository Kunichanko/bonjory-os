"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../lib/supabase'
import SlimeIcon from '../components/SlimeIcon'

const CARD: React.CSSProperties = {
  width: '100%', maxWidth: 420,
  background: 'linear-gradient(135deg, #4e8a00 0%, #3d6e00 60%, #2a4d00 100%)',
  border: '3px solid #6aac14',
  borderRadius: 24,
  padding: '36px 32px 32px',
  boxShadow: '0 8px 0 #1a3a00, 0 12px 40px rgba(0,0,0,0.35)',
}

const LABEL: React.CSSProperties = {
  display: 'block', color: '#d4f08a', fontSize: 13, fontWeight: 'bold',
  marginBottom: 6, letterSpacing: 0.5,
}

const INPUT: React.CSSProperties = {
  width: '100%', padding: '12px 16px', fontSize: 15, borderRadius: 12,
  border: '2px solid #6aac14', background: 'rgba(255,255,255,0.12)',
  color: '#ffffff', outline: 'none', boxSizing: 'border-box',
}

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault()
    setError(null)
    if (password !== confirmPassword) {
      setError('パスワードが一致しません')
      return
    }
    setLoading(true)
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email, password,
        options: { data: { username } },
      })
      if (signUpError) { setError(signUpError.message); return }
      router.push('/login')
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={CARD}>
        <SlimeIcon size={80} />
        <h1 style={{ fontSize: 34, fontWeight: 900, textAlign: 'center', color: '#ffffff', marginBottom: 28,
          textShadow: '0 2px 4px rgba(0,0,0,0.3)', letterSpacing: 1 }}>
          サインアップ
        </h1>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label style={LABEL}>ユーザー名</label>
            <input style={INPUT} type="text" value={username} onChange={e => setUsername(e.target.value)}
              required placeholder="あなたの名前" />
          </div>
          <div>
            <label style={LABEL}>メールアドレス</label>
            <input style={INPUT} type="email" value={email} onChange={e => setEmail(e.target.value)}
              required placeholder="example@email.com" />
          </div>
          <div>
            <label style={LABEL}>パスワード</label>
            <input style={INPUT} type="password" value={password} onChange={e => setPassword(e.target.value)}
              required placeholder="••••••••" />
          </div>
          <div>
            <label style={LABEL}>パスワード（確認）</label>
            <input style={INPUT} type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              required placeholder="••••••••" />
          </div>

          <button className="game-button" type="submit" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? '送信中…' : 'サインアップ'}
          </button>

          {error && (
            <div style={{ background: 'rgba(255,80,80,0.2)', border: '1px solid #ff6b6b', borderRadius: 8,
              padding: '10px 14px', color: '#ffb3b3', fontSize: 13 }}>
              {error}
            </div>
          )}
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, color: '#a8d870', fontSize: 14 }}>
          すでにアカウントをお持ちの方は{' '}
          <a href="/login" style={{ color: '#d4f08a', fontWeight: 'bold', textDecoration: 'underline' }}>
            ログイン
          </a>
        </p>
      </div>
    </div>
  )
}

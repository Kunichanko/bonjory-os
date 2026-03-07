"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
        return
      }
      const { data: profile } = await supabase
        .from('profiles').select('course').eq('id', data.user.id).single()
      router.push(profile?.course ? '/dashboard' : '/onboarding')
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div className="game-card" style={{ width: '100%', maxWidth: 400, padding: '40px 36px' }}>
        <h1 className="game-title" style={{ fontSize: 36, textAlign: 'center', marginBottom: 32 }}>
          ログイン
        </h1>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <label className="game-label">メールアドレス</label>
            <input
              className="game-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="example@email.com"
            />
          </div>

          <div>
            <label className="game-label">パスワード</label>
            <input
              className="game-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
          </div>

          <button className="game-button" type="submit" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? '送信中…' : 'ログイン'}
          </button>

          {error && <div className="game-error">エラー: {error}</div>}
        </form>

        <p style={{ textAlign: 'center', marginTop: 24, color: '#3d6e00', fontSize: 14 }}>
          アカウントをお持ちでない方は{' '}
          <a href="/signup" style={{ color: '#6aac14', fontWeight: 'bold', textDecoration: 'underline' }}>
            サインアップ
          </a>
        </p>
      </div>
    </div>
  )
}

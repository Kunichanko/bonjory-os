"use client"

import { useState } from 'react'
import supabase from '../../lib/supabase'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)

    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username },
        },
      })

      if (signUpError) {
        setError(signUpError.message)
        return
      }

      setSuccess('アカウントを作成しました！')
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
          サインアップ
        </h1>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <label className="game-label">ユーザー名</label>
            <input
              className="game-input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="あなたの名前"
            />
          </div>

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
            {loading ? '送信中…' : 'サインアップ'}
          </button>

          {error && <div className="game-error">エラー: {error}</div>}
          {success && <div className="game-success">{success}</div>}
        </form>

        <p style={{ textAlign: 'center', marginTop: 24, color: '#3d6e00', fontSize: 14 }}>
          すでにアカウントをお持ちの方は{' '}
          <a href="/login" style={{ color: '#6aac14', fontWeight: 'bold', textDecoration: 'underline' }}>
            ログイン
          </a>
        </p>
      </div>
    </div>
  )
}

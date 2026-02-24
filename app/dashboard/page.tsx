"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '../../lib/supabase'

export default function DashboardPage() {
  const [username, setUsername] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    let mounted = true

    async function loadUser() {
      try {
        const { data, error } = await supabase.auth.getUser()
        if (error || !data?.user) {
          router.replace('/login')
          return
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', data.user.id)
          .single()

        if (mounted) setUsername(profile?.username ?? null)
      } catch {
        router.replace('/login')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    loadUser()
    return () => { mounted = false }
  }, [router])

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <p style={{ color: 'white', fontSize: 24, fontWeight: 'bold' }}>Loading...</p>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div className="game-card" style={{ width: '100%', maxWidth: 480, padding: '48px 40px', textAlign: 'center' }}>
        <p style={{ fontSize: 48, marginBottom: 16 }}>🎮</p>
        <h1 className="game-title" style={{ fontSize: 40, marginBottom: 12 }}>
          ようこそ！
        </h1>
        <p style={{
          fontSize: 28,
          fontWeight: 'bold',
          color: '#6aac14',
          marginBottom: 32,
          textShadow: '1px 1px 0 rgba(0,0,0,0.15)',
        }}>
          {username ?? '名無し'} さん
        </p>

        <button
          className="game-button"
          onClick={async () => {
            await supabase.auth.signOut()
            router.push('/login')
          }}
          style={{ maxWidth: 200, margin: '0 auto' }}
        >
          ログアウト
        </button>
      </div>
    </div>
  )
}

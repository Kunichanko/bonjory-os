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
    return () => {
      mounted = false
    }
  }, [router])

  if (loading) return <div style={{ padding: 24 }}>Loading...</div>

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Dashboard</h1>
      <p>ようこそ、{username ?? '名無し'} さん！</p>
    </main>
  )
}

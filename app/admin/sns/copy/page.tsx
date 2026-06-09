'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import supabase from '@/lib/supabase'

function CopyContent() {
  const params = useSearchParams()
  const id = params.get('id')
  const [status, setStatus] = useState<'loading' | 'copied' | 'error'>('loading')
  const [content, setContent] = useState('')

  useEffect(() => {
    if (!id) { setStatus('error'); return }
    supabase
      .from('sns_posts')
      .select('content')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) { setStatus('error'); return }
        setContent(data.content)
        navigator.clipboard.writeText(data.content)
          .then(() => {
            setStatus('copied')
            setTimeout(() => { window.location.href = '/admin/sns' }, 2500)
          })
          .catch(() => setStatus('error'))
      })
  }, [id])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 20, padding: 24 }}>
      {status === 'loading' && (
        <p style={{ color: '#3d6e00', fontWeight: 'bold' }}>コピー中...</p>
      )}

      {status === 'copied' && (
        <>
          <div style={{ fontSize: 48 }}>✅</div>
          <p style={{ fontWeight: 'bold', fontSize: 18, color: '#1a3a00' }}>クリップボードにコピーしました</p>
          {content && (
            <div style={{
              background: '#f6fff0', border: '2px solid #6aac14', borderRadius: 12,
              padding: '12px 16px', fontSize: 14, lineHeight: 1.7,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              maxWidth: 480, color: '#1a1a1a',
            }}>
              {content}
            </div>
          )}
          <p style={{ color: '#888', fontSize: 13 }}>SNS管理画面に移動します...</p>
        </>
      )}

      {status === 'error' && (
        <>
          <div style={{ fontSize: 48 }}>❌</div>
          <p style={{ color: '#c00', fontWeight: 'bold' }}>コピーに失敗しました</p>
          <a href="/admin/sns" style={{
            background: '#1a3a00', color: '#a8d870', borderRadius: 12,
            padding: '10px 24px', textDecoration: 'none', fontWeight: 'bold', fontSize: 14,
          }}>SNS管理へ戻る</a>
        </>
      )}
    </div>
  )
}

export default function SnsColyPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#3d6e00', fontWeight: 'bold' }}>読み込み中...</p>
      </div>
    }>
      <CopyContent />
    </Suspense>
  )
}

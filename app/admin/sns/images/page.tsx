'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase'
import { getEffectivePermissions } from '@/lib/permissions'
import { generateUuid } from '@/lib/uuid'
import { Trash2, Download, Upload, Image as ImageIcon } from 'lucide-react'

interface SnsImage {
  id: string
  storage_path: string | null
  image_url: string
  file_name: string
  created_at: string
}

function publicUrlFor(storagePath: string) {
  return supabase.storage.from('media').getPublicUrl(storagePath).data.publicUrl
}

export default function SnsImagesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [images, setImages] = useState<SnsImage[]>([])
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      const isAdmin = profile?.role === 'admin'
      if (!isAdmin) {
        const perms = await getEffectivePermissions(user.id)
        if (!perms.sns_management) { router.push('/dashboard'); return }
      }

      const { data } = await supabase
        .from('sns_images')
        .select('id, storage_path, image_url, file_name, created_at')
        .is('post_id', null)
        .order('created_at', { ascending: false })
      setImages((data ?? []) as SnsImage[])
      setLoading(false)
    }
    init()
  }, [router])

  async function handleUpload(file: File) {
    setUploading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `sns-images/${generateUuid()}.${ext}`
    const { error: upErr } = await supabase.storage.from('media').upload(path, file)
    if (upErr) { alert('アップロードに失敗しました: ' + upErr.message); setUploading(false); return }

    const { data, error } = await supabase
      .from('sns_images')
      .insert({ storage_path: path, image_url: publicUrlFor(path), file_name: file.name, uploaded_by: user?.id ?? null })
      .select('id, storage_path, image_url, file_name, created_at')
      .single()
    if (error || !data) { alert('登録に失敗しました: ' + error?.message); setUploading(false); return }
    setImages(prev => [data as SnsImage, ...prev])
    setUploading(false)
  }

  async function handleDelete(image: SnsImage) {
    if (!confirm('この画像を削除しますか？')) return
    setDeletingId(image.id)
    if (image.storage_path) await supabase.storage.from('media').remove([image.storage_path])
    const { error } = await supabase.from('sns_images').delete().eq('id', image.id)
    if (error) { alert('削除に失敗しました: ' + error.message); setDeletingId(null); return }
    setImages(prev => prev.filter(i => i.id !== image.id))
    setDeletingId(null)
  }

  async function handleDownload(image: SnsImage) {
    const res = await fetch(image.image_url)
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = image.file_name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(a.href)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#3d6e00', fontWeight: 'bold' }}>読み込み中...</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', padding: '80px 16px 60px' }}>
      <a href="/admin/sns" style={{ textDecoration: 'none' }}>
        <button style={{
          position: 'fixed', top: 20, left: 16, zIndex: 50,
          background: '#1a3a00', border: '3px solid #6aac14', borderRadius: 12,
          color: '#a8d870', fontSize: 13, fontWeight: 'bold',
          padding: '10px 18px', cursor: 'pointer',
          boxShadow: '0 4px 0 #0d2000',
        }}>
          ← SNS管理
        </button>
      </a>

      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <h1 className="game-title" style={{ textAlign: 'center', marginBottom: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <ImageIcon size={24} />画像管理
        </h1>

        <div style={{
          background: 'white', border: '3px solid #3d6e00', borderRadius: 16,
          padding: 24, marginBottom: 24,
          boxShadow: '0 4px 0 #1a3a00',
        }}>
          <h2 style={{ fontSize: 17, fontWeight: 'bold', color: '#1a3a00', marginBottom: 4 }}>
            共有画像ライブラリ
          </h2>
          <p style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
            SNS管理権限を持つ部員全員が共有してアクセス・ダウンロードできます
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) handleUpload(file)
              e.target.value = ''
            }}
          />
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                background: uploading ? '#aaa' : '#3d6e00',
                border: 'none', borderRadius: 12, color: 'white',
                fontSize: 15, fontWeight: 'bold', padding: '12px 40px',
                cursor: uploading ? 'not-allowed' : 'pointer',
                boxShadow: uploading ? 'none' : '0 4px 0 #1a3a00',
                display: 'inline-flex', alignItems: 'center', gap: 8,
              }}
            >
              <Upload size={16} />
              {uploading ? 'アップロード中...' : '画像をアップロード'}
            </button>
          </div>
        </div>

        <div style={{
          background: 'white', border: '3px solid #3d6e00', borderRadius: 16,
          padding: 24,
          boxShadow: '0 4px 0 #1a3a00',
        }}>
          <h2 style={{ fontSize: 17, fontWeight: 'bold', color: '#1a3a00', marginBottom: 16 }}>
            画像一覧
            <span style={{ fontSize: 13, color: '#666', fontWeight: 'normal', marginLeft: 8 }}>（{images.length}件）</span>
          </h2>

          {images.length === 0 ? (
            <p style={{ color: '#999', fontSize: 14, textAlign: 'center', padding: '12px 0' }}>画像はありません</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
              {images.map(image => (
                <div key={image.id} style={{
                  border: '2px solid #e0e0e0', borderRadius: 10, overflow: 'hidden',
                  background: '#fafafa',
                }}>
                  <img src={image.image_url} alt={image.file_name} style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px' }}>
                    <button
                      onClick={() => handleDownload(image)}
                      title="ダウンロード"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3d6e00', padding: 4, display: 'flex', alignItems: 'center' }}
                    >
                      <Download size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(image)}
                      disabled={deletingId === image.id}
                      title="削除"
                      style={{ background: 'none', border: 'none', cursor: deletingId === image.id ? 'not-allowed' : 'pointer', color: '#ccc', padding: 4, display: 'flex', alignItems: 'center' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

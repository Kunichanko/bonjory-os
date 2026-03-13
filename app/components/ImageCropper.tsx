"use client"

import { useRef, useState } from 'react'
import supabase from '../../lib/supabase'

interface CropRect { x: number; y: number; w: number; h: number }

interface Props {
  imageDataUrl: string   // data URL of the uploaded image (before crop)
  onCrop: (publicUrl: string, aspectRatio: number) => void
  onCancel: () => void
}

export default function ImageCropper({ imageDataUrl, onCrop, onCancel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef       = useRef<HTMLImageElement>(null)

  const [crop,      setCrop]      = useState<CropRect | null>(null)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState('')

  // ── マウスイベント ────────────────────────────────────────
  function relPos(e: React.MouseEvent): { x: number; y: number } {
    const rect = containerRef.current!.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(e.clientX - rect.left, rect.width)),
      y: Math.max(0, Math.min(e.clientY - rect.top,  rect.height)),
    }
  }

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    const p = relPos(e)
    setDragStart(p)
    setCrop(null)
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!dragStart) return
    const p = relPos(e)
    setCrop({
      x: Math.min(p.x, dragStart.x),
      y: Math.min(p.y, dragStart.y),
      w: Math.abs(p.x - dragStart.x),
      h: Math.abs(p.y - dragStart.y),
    })
  }

  function onMouseUp() {
    setDragStart(null)
  }

  // ── トリミング実行 ────────────────────────────────────────
  async function handleCrop() {
    if (!crop || crop.w < 10 || crop.h < 10) return
    if (!imgRef.current || !containerRef.current) return

    setUploading(true)
    setError('')

    const img       = imgRef.current
    const container = containerRef.current
    const scaleX    = img.naturalWidth  / container.offsetWidth
    const scaleY    = img.naturalHeight / container.offsetHeight

    const sx = Math.round(crop.x * scaleX)
    const sy = Math.round(crop.y * scaleY)
    const sw = Math.round(crop.w * scaleX)
    const sh = Math.round(crop.h * scaleY)

    const canvas  = document.createElement('canvas')
    canvas.width  = sw
    canvas.height = sh
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)

    canvas.toBlob(async (blob) => {
      if (!blob) { setError('画像の処理に失敗しました'); setUploading(false); return }

      const fileName = `news_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`
      const { data, error: uploadErr } = await supabase.storage
        .from('news-images')
        .upload(fileName, blob, { contentType: 'image/jpeg', upsert: false })

      if (uploadErr || !data) {
        setError('アップロードに失敗しました: ' + (uploadErr?.message ?? ''))
        setUploading(false)
        return
      }

      const { data: urlData } = supabase.storage
        .from('news-images')
        .getPublicUrl(data.path)

      setUploading(false)
      onCrop(urlData.publicUrl, crop.w / crop.h)
    }, 'image/jpeg', 0.92)
  }

  // ── オリジナルをそのままアップロード ─────────────────────
  async function handleUseOriginal() {
    setUploading(true)
    setError('')

    const res     = await fetch(imageDataUrl)
    const blob    = await res.blob()
    const fileName = `news_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`

    const { data, error: uploadErr } = await supabase.storage
      .from('news-images')
      .upload(fileName, blob, { contentType: 'image/jpeg', upsert: false })

    if (uploadErr || !data) {
      setError('アップロードに失敗しました: ' + (uploadErr?.message ?? ''))
      setUploading(false)
      return
    }

    const { data: urlData } = supabase.storage
      .from('news-images')
      .getPublicUrl(data.path)

    // 元画像のアスペクト比を取得
    const img = imgRef.current
    const ar  = img ? img.naturalWidth / img.naturalHeight : 1

    setUploading(false)
    onCrop(urlData.publicUrl, ar)
  }

  const canCrop = crop && crop.w >= 10 && crop.h >= 10

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div className="game-card" style={{ padding: 20, maxWidth: '92vw', maxHeight: '92vh', overflow: 'auto', background: '#fff' }}>
        <h3 className="game-title" style={{ marginBottom: 8, fontSize: 18 }}>✂️ サムネイルをトリミング</h3>
        <p style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
          ドラッグして切り取る範囲を選択してください。選択した範囲のアスペクト比がカードの形になります。
        </p>

        {/* ── 画像エリア ── */}
        <div
          ref={containerRef}
          style={{
            position: 'relative', display: 'inline-block',
            cursor: 'crosshair', userSelect: 'none', lineHeight: 0,
          }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={imageDataUrl}
            alt="crop preview"
            style={{ maxWidth: '72vw', maxHeight: '58vh', display: 'block' }}
            draggable={false}
          />

          {/* 暗幕オーバーレイ */}
          {crop && (
            <>
              {/* 上 */}
              <div style={{ position:'absolute', left:0, top:0, width:'100%', height: crop.y, background:'rgba(0,0,0,0.45)', pointerEvents:'none' }} />
              {/* 下 */}
              <div style={{ position:'absolute', left:0, top: crop.y + crop.h, width:'100%', bottom:0, background:'rgba(0,0,0,0.45)', pointerEvents:'none',
                height: `calc(100% - ${crop.y + crop.h}px)` }} />
              {/* 左 */}
              <div style={{ position:'absolute', left:0, top: crop.y, width: crop.x, height: crop.h, background:'rgba(0,0,0,0.45)', pointerEvents:'none' }} />
              {/* 右 */}
              <div style={{ position:'absolute', left: crop.x + crop.w, top: crop.y,
                width: `calc(100% - ${crop.x + crop.w}px)`, height: crop.h, background:'rgba(0,0,0,0.45)', pointerEvents:'none' }} />

              {/* 選択枠 */}
              <div style={{
                position:'absolute', left: crop.x, top: crop.y, width: crop.w, height: crop.h,
                border: '2px solid white',
                boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
                pointerEvents:'none',
              }}>
                {/* アスペクト比ラベル */}
                {crop.w >= 40 && crop.h >= 20 && (
                  <span style={{
                    position:'absolute', bottom:4, right:6, fontSize:11, color:'#fff',
                    background:'rgba(0,0,0,0.6)', borderRadius:4, padding:'1px 5px',
                  }}>
                    {(crop.w / crop.h).toFixed(2)}
                  </span>
                )}
              </div>
            </>
          )}

          {!crop && (
            <div style={{
              position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
              background:'rgba(0,0,0,0.2)', pointerEvents:'none',
            }}>
              <span style={{ color:'#fff', fontSize:13, fontWeight:'bold', background:'rgba(0,0,0,0.5)', borderRadius:8, padding:'6px 12px' }}>
                ドラッグして範囲を選択
              </span>
            </div>
          )}
        </div>

        {error && <p style={{ color:'#e74c3c', fontSize:13, marginTop:8 }}>{error}</p>}

        {/* ── ボタン ── */}
        <div style={{ display:'flex', gap:8, marginTop:16, flexWrap:'wrap' }}>
          <button
            className="game-button"
            onClick={handleCrop}
            disabled={!canCrop || uploading}
            style={{ opacity: canCrop && !uploading ? 1 : 0.5 }}
          >
            {uploading ? '処理中…' : '✂️ トリミングして使用'}
          </button>
          <button
            className="game-button"
            onClick={handleUseOriginal}
            disabled={uploading}
            style={{ background:'#6c757d', opacity: uploading ? 0.5 : 1 }}
          >
            そのまま使用
          </button>
          <button
            className="game-button"
            onClick={() => setCrop(null)}
            disabled={uploading}
            style={{ background:'#aaa' }}
          >
            リセット
          </button>
          <button
            className="game-button"
            onClick={onCancel}
            disabled={uploading}
            style={{ background:'#e74c3c' }}
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  )
}

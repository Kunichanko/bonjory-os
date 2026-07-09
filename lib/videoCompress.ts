// 提出動画のブラウザ内圧縮（ベストエフォート）
//
// canvas.captureStream + WebAudio + MediaRecorder でリアルタイム再エンコードする。
// エンコードには動画の再生時間と同じだけ時間がかかるため、
// 「圧縮しても縮まない・時間がかかりすぎる」ケースは元ファイルのまま返す。
// ブラウザが必要APIに対応していない場合や途中で失敗した場合も元ファイルを返す。

export const MAX_VIDEO_BYTES = 30 * 1024 * 1024 // アップロード上限 30MB

const TARGET_VIDEO_BITRATE = 2_000_000
const TARGET_AUDIO_BITRATE = 96_000
const MAX_DIMENSION = 1280
const CAPTURE_FPS = 30
// これより小さいファイルは圧縮の効果が薄いのでそのまま使う
const SKIP_BELOW_BYTES = 5 * 1024 * 1024
// 元の実効ビットレートがターゲットに近い場合、再エンコードしてもほぼ縮まない
const SKIP_BITRATE_RATIO = 1.15
// リアルタイム再生でエンコードするため、長すぎる動画はスキップ
const MAX_COMPRESS_DURATION_SEC = 6 * 60

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return null
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ]
  return candidates.find(c => MediaRecorder.isTypeSupported(c)) ?? null
}

export async function compressVideo(
  file: File,
  onProgress?: (ratio: number) => void,
): Promise<File> {
  if (file.size < SKIP_BELOW_BYTES) return file
  const mimeType = pickMimeType()
  if (!mimeType) return file
  try {
    const compressed = await transcode(file, mimeType, onProgress)
    // 圧縮結果が元より大きければ元ファイルを採用
    return compressed && compressed.size < file.size ? compressed : file
  } catch {
    return file
  }
}

// null を返した場合は「圧縮不要・不可」の意味（元ファイルをそのまま使う）
function transcode(
  file: File,
  mimeType: string,
  onProgress?: (ratio: number) => void,
): Promise<File | null> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.src = objectUrl
    video.playsInline = true
    video.preload = 'auto'

    let settled = false
    let rafId = 0
    let audioCtx: AudioContext | null = null

    const cleanup = () => {
      cancelAnimationFrame(rafId)
      video.pause()
      URL.revokeObjectURL(objectUrl)
      audioCtx?.close().catch(() => {})
    }
    const fail = (err: unknown) => { if (!settled) { settled = true; cleanup(); reject(err) } }
    const skip = () => { if (!settled) { settled = true; cleanup(); resolve(null) } }

    video.onerror = () => fail(new Error('video load failed'))
    video.onloadedmetadata = () => {
      try {
        const duration = video.duration
        if (!isFinite(duration) || duration <= 0 || duration > MAX_COMPRESS_DURATION_SEC) { skip(); return }
        const sourceBitrate = (file.size * 8) / duration
        if (sourceBitrate <= (TARGET_VIDEO_BITRATE + TARGET_AUDIO_BITRATE) * SKIP_BITRATE_RATIO) { skip(); return }

        let width = video.videoWidth
        let height = video.videoHeight
        if (!width || !height) { skip(); return }
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width >= height) {
            height = Math.round((height / width) * MAX_DIMENSION)
            width = MAX_DIMENSION
          } else {
            width = Math.round((width / height) * MAX_DIMENSION)
            height = MAX_DIMENSION
          }
        }
        // エンコーダによっては奇数サイズで失敗するため偶数に丸める
        width -= width % 2
        height -= height % 2

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) { skip(); return }

        const stream = canvas.captureStream(CAPTURE_FPS)

        // 音声は WebAudio 経由で取り出す（グラフに接続するとスピーカーには流れない）。
        // 要素を muted にすると WebAudio 側も無音になるため muted にはしない。
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (AC) {
          audioCtx = new AC()
          const srcNode = audioCtx.createMediaElementSource(video)
          const destNode = audioCtx.createMediaStreamDestination()
          srcNode.connect(destNode)
          for (const track of destNode.stream.getAudioTracks()) stream.addTrack(track)
        } else {
          video.muted = true
        }

        const recorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: TARGET_VIDEO_BITRATE,
          audioBitsPerSecond: TARGET_AUDIO_BITRATE,
        })
        const chunks: Blob[] = []
        recorder.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data) }
        recorder.onerror = () => fail(new Error('recorder error'))
        recorder.onstop = () => {
          if (settled) return
          settled = true
          cleanup()
          const containerType = mimeType.split(';')[0]
          const ext = containerType === 'video/mp4' ? 'mp4' : 'webm'
          const nameBase = file.name.replace(/\.[^.]+$/, '')
          resolve(new File(chunks, `${nameBase}.${ext}`, { type: containerType }))
        }

        const stopRecorder = () => { if (recorder.state !== 'inactive') recorder.stop() }

        const draw = () => {
          if (settled) return
          ctx.drawImage(video, 0, 0, width, height)
          if (video.ended) { stopRecorder(); return }
          rafId = requestAnimationFrame(draw)
        }

        video.onended = stopRecorder
        video.ontimeupdate = () => onProgress?.(Math.min(1, video.currentTime / duration))

        audioCtx?.resume().catch(() => {})
        video.play().then(() => {
          recorder.start(1000)
          rafId = requestAnimationFrame(draw)
        }).catch(fail) // 自動再生がブロックされた場合などは元ファイルにフォールバック
      } catch (err) {
        fail(err)
      }
    }
  })
}

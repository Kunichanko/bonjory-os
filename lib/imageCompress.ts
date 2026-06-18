let webpSupport: boolean | null = null

function supportsWebP(): boolean {
  if (webpSupport !== null) return webpSupport
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  webpSupport = canvas.toDataURL('image/webp').startsWith('data:image/webp')
  return webpSupport
}

export function compressImage(
  file: File,
  { maxDimension, quality = 0.8 }: { maxDimension: number; quality?: number },
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)

      let { width, height } = img
      if (width > maxDimension || height > maxDimension) {
        if (width >= height) {
          height = Math.round((height / width) * maxDimension)
          width = maxDimension
        } else {
          width = Math.round((width / height) * maxDimension)
          height = maxDimension
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(file)
        return
      }
      ctx.drawImage(img, 0, 0, width, height)

      const useWebp = supportsWebP()
      const mimeType = useWebp ? 'image/webp' : 'image/jpeg'
      const ext = useWebp ? 'webp' : 'jpg'

      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(file)
          return
        }
        const nameBase = file.name.replace(/\.[^.]+$/, '')
        resolve(new File([blob], `${nameBase}.${ext}`, { type: mimeType }))
      }, mimeType, quality)
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('image load failed'))
    }

    img.src = objectUrl
  })
}

import { featherAlpha } from './mask/ops'
import { releaseCanvas } from './resources'

/**
 * Encodes as WebP when the browser can (keeps alpha, ~5–10× smaller than PNG). Safari falls back to
 * PNG when it cannot encode WebP, which we detect from the returned type.
 */
export async function encodeImage(canvas: HTMLCanvasElement, quality = 0.8): Promise<Blob> {
  const toBlob = (type: string, q?: number) =>
    new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, type, q)
    })
  const webp = await toBlob('image/webp', quality)
  if (webp?.type === 'image/webp') return webp
  const png = await toBlob('image/png')
  if (!png) throw new Error('Could not encode image')
  return png
}

export async function encodeJpeg(source: CanvasImageSource, width: number, height: number, quality = 0.9): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')?.drawImage(source, 0, 0, width, height)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        releaseCanvas(canvas)
        if (b) resolve(b)
        else reject(new Error('Could not encode JPEG'))
      },
      'image/jpeg',
      quality,
    )
  })
}

/** The photo with the mask applied as a (feathered) alpha channel, encoded WebP/PNG. */
export async function exportCutout(
  photo: CanvasImageSource,
  mask: Uint8Array,
  width: number,
  height: number,
  featherPx: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D unavailable')
  ctx.drawImage(photo, 0, 0, width, height)
  const pixels = ctx.getImageData(0, 0, width, height)
  const alpha = featherAlpha(mask, width, height, featherPx)
  for (let i = 0; i < alpha.length; i++) pixels.data[i * 4 + 3] = alpha[i] ?? 0
  ctx.putImageData(pixels, 0, 0)
  try {
    return await encodeImage(canvas)
  } finally {
    releaseCanvas(canvas)
  }
}

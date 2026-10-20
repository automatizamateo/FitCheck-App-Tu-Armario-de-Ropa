import { COLOR_PALETTE } from '../../domain/attributes'
import { dominantColors } from '../../lib/colors'
import { encodeImage } from '../../lib/encode'
import { boundingBox, featherAlpha, type Box } from '../../lib/mask/ops'
import { releaseCanvas, trackCanvas } from '../../lib/resources'

function canvas2d(w: number, h: number) {
  const canvas = trackCanvas(document.createElement('canvas'))
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D unavailable')
  return { canvas, ctx }
}

export interface Cutout {
  image: Blob // WebP with alpha (PNG where WebP can't be encoded), cropped to the garment
  box: Box // where the crop sits in the photo, in photo pixels
}

/**
 * Crops the photo to the mask's bounding box (plus the feather) and makes everything outside the mask
 * transparent. Null when the mask is empty. The photo is at most 1200 px on its long side already.
 */
export async function cropCutout(photo: ImageBitmap, mask: Uint8Array, featherPx: number): Promise<Cutout | null> {
  const { width, height } = photo
  const bb = boundingBox(mask, width, height)
  if (!bb) return null
  const pad = Math.max(1, featherPx + 1)
  const x = Math.max(0, bb.x - pad)
  const y = Math.max(0, bb.y - pad)
  const w = Math.min(width, bb.x + bb.w + pad) - x
  const h = Math.min(height, bb.y + bb.h + pad) - y

  const sub = new Uint8Array(w * h)
  for (let r = 0; r < h; r++) sub.set(mask.subarray((y + r) * width + x, (y + r) * width + x + w), r * w)
  const alpha = featherAlpha(sub, w, h, featherPx)

  const { canvas, ctx } = canvas2d(w, h)
  try {
    ctx.drawImage(photo, x, y, w, h, 0, 0, w, h)
    const pixels = ctx.getImageData(0, 0, w, h)
    for (let i = 0; i < alpha.length; i++) pixels.data[i * 4 + 3] = alpha[i] ?? 0
    ctx.putImageData(pixels, 0, 0)
    return { image: await encodeImage(canvas, 0.8), box: { x, y, w, h } }
  } finally {
    releaseCanvas(canvas)
  }
}

/** Decodes an image blob scaled to fit `maxSide`, runs `read` on its pixels, then frees everything. */
async function withPixels<T>(blob: Blob, maxSide: number, read: (data: ImageData, scale: number) => T): Promise<T> {
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const { canvas, ctx } = canvas2d(w, h)
  try {
    ctx.drawImage(bitmap, 0, 0, w, h)
    return read(ctx.getImageData(0, 0, w, h), scale)
  } finally {
    bitmap.close()
    releaseCanvas(canvas)
  }
}

/** ~240 px WebP (0.7) for grids (SPEC §7). */
export async function makeThumbnail(blob: Blob, maxSide = 240): Promise<Blob> {
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const { canvas, ctx } = canvas2d(
    Math.max(1, Math.round(bitmap.width * scale)),
    Math.max(1, Math.round(bitmap.height * scale)),
  )
  try {
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return await encodeImage(canvas, 0.7)
  } finally {
    bitmap.close()
    releaseCanvas(canvas)
  }
}

/** Auto-suggested color names for a cut-out. */
export function suggestColors(cutout: Blob): Promise<string[]> {
  return withPixels(cutout, 96, (img) => dominantColors(img.data, COLOR_PALETTE))
}

/** Bounding box of the opaque pixels of a base-model view (the person), in view pixels. */
export function personBox(view: Blob): Promise<Box | null> {
  return withPixels(view, 256, (img, scale) => {
    const mask = new Uint8Array(img.width * img.height)
    for (let i = 0; i < mask.length; i++) mask[i] = (img.data[i * 4 + 3] ?? 0) >= 128 ? 1 : 0
    const b = boundingBox(mask, img.width, img.height)
    return b && { x: b.x / scale, y: b.y / scale, w: b.w / scale, h: b.h / scale }
  })
}

// Composing a base-model view with garment layers on a canvas (SPEC §10).

import type { GarmentLayer, Transform } from '../domain/types'
import { outfitLayerMatrix } from './align'
import { encodeImage } from './encode'
import { compose, fit, type Similarity } from './gesture/similarity'
import { releaseCanvas, trackBitmap, trackCanvas } from './resources'

export interface BaseImage {
  image: Blob
  width: number
  height: number
}

/** A garment layer as drawn in an outfit: the item's placement plus the outfit's override. */
export type CompositeLayer = Pick<GarmentLayer, 'image' | 'bbox' | 'transform'> & { override?: Transform }

export function setMatrix(ctx: CanvasRenderingContext2D, t: Similarity, dpr: number) {
  ctx.setTransform(dpr * t.a, dpr * t.b, -dpr * t.b, dpr * t.a, dpr * t.tx, dpr * t.ty)
}

/**
 * Renders the composition into a small image (thumbnails). Decodes one image at a time and closes
 * it right after drawing, so at most one full-size bitmap is alive.
 */
export async function renderComposite(
  base: BaseImage,
  layers: readonly CompositeLayer[],
  maxSide = 320,
  quality = 0.7,
): Promise<Blob> {
  const s = Math.min(1, maxSide / Math.max(base.width, base.height))
  const canvas = trackCanvas(document.createElement('canvas'))
  canvas.width = Math.max(1, Math.round(base.width * s))
  canvas.height = Math.max(1, Math.round(base.height * s))
  try {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D unavailable')
    ctx.imageSmoothingQuality = 'high'
    const view = fit(base.width, base.height, canvas.width, canvas.height, 0)
    const draw = async (blob: Blob, matrix: (w: number, h: number) => Similarity) => {
      const bitmap = trackBitmap(await createImageBitmap(blob))
      try {
        setMatrix(ctx, compose(view, matrix(bitmap.width, bitmap.height)), 1)
        ctx.drawImage(bitmap, 0, 0)
      } finally {
        bitmap.close()
      }
    }
    await draw(base.image, (w) => ({ a: base.width / w, b: 0, tx: 0, ty: 0 }))
    for (const layer of layers) await draw(layer.image, (w, h) => outfitLayerMatrix(layer, w, h, layer.override))
    return await encodeImage(canvas, quality)
  } finally {
    releaseCanvas(canvas)
  }
}

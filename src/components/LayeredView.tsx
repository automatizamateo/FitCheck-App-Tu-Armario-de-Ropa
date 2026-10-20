import { useEffect, useRef } from 'react'
import type { GarmentLayer } from '../domain/types'
import { layerToSimilarity } from '../lib/align'
import { compose, fit, type Similarity } from '../lib/gesture/similarity'
import { trackBitmap } from '../lib/resources'

export interface BaseImage {
  image: Blob
  width: number
  height: number
}

interface LayeredViewProps {
  base: BaseImage
  /** Drawn in this order (sort by layer before passing). */
  layers: Pick<GarmentLayer, 'image' | 'bbox' | 'transform'>[]
  className?: string
}

/** The base model with garment layers on top, fitted to the element. Decodes once; frees bitmaps on unmount. */
export function LayeredView({ base, layers, className = '' }: LayeredViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    let bitmaps: ImageBitmap[] = []
    const draw = () => {
      const [baseBmp, ...layerBmps] = bitmaps
      const ctx = canvas.getContext('2d')
      if (!ctx || !baseBmp) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      const view = fit(base.width, base.height, w, h)
      const set = (t: Similarity) => {
        ctx.setTransform(dpr * t.a, dpr * t.b, -dpr * t.b, dpr * t.a, dpr * t.tx, dpr * t.ty)
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      set(view)
      ctx.drawImage(baseBmp, 0, 0, base.width, base.height)
      layerBmps.forEach((bmp, i) => {
        const layer = layers[i]
        if (!layer) return
        set(compose(view, layerToSimilarity(layer, bmp.width, bmp.height)))
        ctx.drawImage(bmp, 0, 0)
      })
    }
    void Promise.all(
      [base.image, ...layers.map((l) => l.image)].map(async (b) => trackBitmap(await createImageBitmap(b))),
    ).then((decoded) => {
      if (cancelled) {
        decoded.forEach((b) => {
          b.close()
        })
        return
      }
      bitmaps = decoded
      draw()
    })
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    return () => {
      cancelled = true
      observer.disconnect()
      bitmaps.forEach((b) => {
        b.close()
      })
      canvas.width = canvas.height = 0
    }
  }, [base, layers])

  return <canvas ref={canvasRef} className={`block h-full w-full ${className}`} />
}

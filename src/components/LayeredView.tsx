import { useEffect, useRef } from 'react'
import { outfitLayerMatrix } from '../lib/align'
import { setMatrix, type BaseImage, type CompositeLayer } from '../lib/composite'
import { compose, fit } from '../lib/gesture/similarity'
import { releaseCanvas, trackBitmap } from '../lib/resources'

export type { BaseImage } from '../lib/composite'

interface LayeredViewProps {
  base: BaseImage
  /** Drawn in this order (sort by layer before passing). Pass a memoized array: a new one re-decodes. */
  layers: readonly CompositeLayer[]
  className?: string
}

/**
 * The base model with garment layers on top, fitted to the element. Decodes one image set; frees
 * the bitmaps when the inputs change (e.g. switching view) or on unmount.
 */
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
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      setMatrix(ctx, view, dpr)
      ctx.drawImage(baseBmp, 0, 0, base.width, base.height)
      layerBmps.forEach((bmp, i) => {
        const layer = layers[i]
        if (!layer) return
        setMatrix(ctx, compose(view, outfitLayerMatrix(layer, bmp.width, bmp.height, layer.override)), dpr)
        ctx.drawImage(bmp, 0, 0)
      })
    }
    void Promise.all(
      [base.image, ...layers.map((l) => l.image)].map(async (b) => trackBitmap(await createImageBitmap(b))),
    ).then(
      (decoded) => {
        if (cancelled) {
          decoded.forEach((b) => {
            b.close()
          })
          return
        }
        bitmaps = decoded
        draw()
      },
      () => undefined,
    )
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    return () => {
      cancelled = true
      observer.disconnect()
      bitmaps.forEach((b) => {
        b.close()
      })
      releaseCanvas(canvas)
    }
  }, [base, layers])

  return <canvas ref={canvasRef} className={`block h-full w-full ${className}`} />
}

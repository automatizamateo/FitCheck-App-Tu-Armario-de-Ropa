import { useCallback, useEffect, useRef, useState } from 'react'
import type { BaseImage } from '../../components/LayeredView'
import { compose, fit, invert, type Similarity } from '../../lib/gesture/similarity'
import { useGestures } from '../../lib/gesture/useGestures'
import { trackBitmap } from '../../lib/resources'

interface AlignScreenProps {
  view: string
  base: BaseImage
  cutout: { image: Blob; w: number; h: number }
  /** Automatic placement (cut-out pixels → base view pixels). */
  auto: Similarity
  method: 'pose' | 'box'
  busy: boolean
  onConfirm: (placement: Similarity) => void
  onBack: () => void
}

/**
 * The garment over the base model. One finger drags it, two fingers scale and rotate it. The
 * base model stays fixed (no view zoom), so every gesture moves the garment.
 */
export function AlignScreen({ view, base, cutout, auto, method, busy, onConfirm, onBack }: AlignScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const placement = useRef<Similarity>(auto)
  const fitView = useRef<Similarity>({ a: 1, b: 0, tx: 0, ty: 0 })
  const bitmaps = useRef<{ base: ImageBitmap; garment: ImageBitmap } | null>(null)
  const frame = useRef(0)
  const [seeThrough, setSeeThrough] = useState(false)
  const seeThroughRef = useRef(seeThrough)
  useEffect(() => {
    seeThroughRef.current = seeThrough
  })

  const render = useCallback(() => {
    frame.current = 0
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const bmps = bitmaps.current
    if (!canvas || !ctx || !bmps) return
    const dpr = canvas.width / Math.max(1, canvas.clientWidth)
    const set = (t: Similarity) => {
      ctx.setTransform(dpr * t.a, dpr * t.b, -dpr * t.b, dpr * t.a, dpr * t.tx, dpr * t.ty)
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    set(fitView.current)
    ctx.drawImage(bmps.base, 0, 0, base.width, base.height)
    set(compose(fitView.current, placement.current))
    ctx.globalAlpha = seeThroughRef.current ? 0.55 : 1
    ctx.drawImage(bmps.garment, 0, 0, cutout.w, cutout.h)
    ctx.globalAlpha = 1
  }, [base.width, base.height, cutout.w, cutout.h])

  const invalidate = useCallback(() => {
    frame.current ||= requestAnimationFrame(render)
  }, [render])

  useEffect(() => {
    invalidate()
  }, [seeThrough, invalidate])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    void Promise.all([createImageBitmap(base.image), createImageBitmap(cutout.image)]).then(([b, g]) => {
      if (cancelled) {
        b.close()
        g.close()
        return
      }
      bitmaps.current = { base: trackBitmap(b), garment: trackBitmap(g) }
      invalidate()
    })
    const observer = new ResizeObserver(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(canvas.clientWidth * dpr)
      canvas.height = Math.round(canvas.clientHeight * dpr)
      fitView.current = fit(base.width, base.height, canvas.clientWidth, canvas.clientHeight)
      invalidate()
    })
    observer.observe(canvas)
    return () => {
      cancelled = true
      observer.disconnect()
      cancelAnimationFrame(frame.current)
      frame.current = 0
      bitmaps.current?.base.close()
      bitmaps.current?.garment.close()
      bitmaps.current = null
      canvas.width = canvas.height = 0
    }
  }, [base, cutout.image, invalidate])

  useGestures(
    canvasRef,
    {
      onDragMove: (p, prev) => {
        const s = fitView.current.a
        placement.current = compose({ a: 1, b: 0, tx: (p.x - prev.x) / s, ty: (p.y - prev.y) / s }, placement.current)
        invalidate()
      },
      onPinch: (delta) => {
        // A screen-space change, expressed in base-view coordinates.
        const v = fitView.current
        placement.current = compose(invert(v), compose(delta, compose(v, placement.current)))
        invalidate()
      },
    },
    { rotate: true },
  )

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0c0a09] text-white select-none [-webkit-touch-callout:none]">
      <div className="pt-safe px-safe flex h-[calc(env(safe-area-inset-top)+3.5rem)] items-center justify-between">
        <button type="button" onClick={onBack} className="-ml-2 h-11 px-2 text-[15px]">
          Back
        </button>
        <div className="text-center">
          <p className="text-[15px] font-semibold capitalize">Fit {view}</p>
          <p className="text-xs text-white/60">Drag · pinch · twist with two fingers</p>
        </div>
        <span className="w-14" />
      </div>

      <div className="relative min-h-0 flex-1">
        <canvas ref={canvasRef} className="block h-full w-full touch-none" />
        {method === 'box' && (
          <p className="absolute inset-x-3 top-2 rounded-2xl bg-black/75 p-3 text-sm backdrop-blur">
            Your pose wasn’t found in this photo, so it was placed by body area. Adjust it with your fingers.
          </p>
        )}
      </div>

      <div className="pb-safe px-safe space-y-3 pt-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              placement.current = auto
              invalidate()
            }}
            className="h-11 flex-1 rounded-xl bg-white/10 text-sm font-medium active:scale-95"
          >
            Reset
          </button>
          <button
            type="button"
            aria-pressed={seeThrough}
            onClick={() => {
              setSeeThrough((v) => !v)
            }}
            className={`h-11 flex-1 rounded-xl text-sm font-medium active:scale-95 ${seeThrough ? 'bg-white text-black' : 'bg-white/10'}`}
          >
            See-through
          </button>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            onConfirm(placement.current)
          }}
          className="mb-3 h-12 w-full rounded-full bg-white text-[15px] font-semibold text-black disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Looks right'}
        </button>
      </div>
    </div>
  )
}

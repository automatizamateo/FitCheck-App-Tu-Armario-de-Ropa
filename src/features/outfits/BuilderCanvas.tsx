import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { Transform } from '../../domain/types'
import {
  IDENTITY_TRANSFORM,
  layerCenter,
  outfitLayerMatrix,
  overrideToSimilarity,
  similarityToOverride,
} from '../../lib/align'
import { setMatrix, type BaseImage, type CompositeLayer } from '../../lib/composite'
import { debugLog } from '../../lib/debugLog'
import { apply, compose, fit, invert, scaleOf, type Point, type Similarity } from '../../lib/gesture/similarity'
import { useGestures } from '../../lib/gesture/useGestures'
import { formatResources, releaseCanvas, trackBitmap, trackCanvas } from '../../lib/resources'

export type CanvasEntry = CompositeLayer & { id: string }

interface BuilderCanvasProps {
  base: BaseImage
  /** Layers of the current view in drawing order. Pass a memoized array. */
  entries: readonly CanvasEntry[]
  selected: string | null
  onSelect: (id: string | null) => void
  /** A finished move / pinch / twist of one item, as its new override for this view. */
  onTransform: (id: string, t: Transform) => void
  /** Horizontal swipe on the background: +1 = next view. */
  onSwipe: (direction: 1 | -1) => void
}

interface Decoded {
  bitmap: ImageBitmap
  alpha: Uint8Array // coarse alpha grid for hit testing
  aw: number
  ah: number
}

const ALPHA_GRID = 64
const MIN_SCALE = 0.3
const MAX_SCALE = 3
const SWIPE_MIN_PX = 50

async function decode(blob: Blob): Promise<Decoded> {
  const bitmap = trackBitmap(await createImageBitmap(blob))
  const s = Math.min(1, ALPHA_GRID / Math.max(bitmap.width, bitmap.height))
  const aw = Math.max(1, Math.round(bitmap.width * s))
  const ah = Math.max(1, Math.round(bitmap.height * s))
  const canvas = trackCanvas(document.createElement('canvas'))
  canvas.width = aw
  canvas.height = ah
  const alpha = new Uint8Array(aw * ah)
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (ctx) {
      ctx.drawImage(bitmap, 0, 0, aw, ah)
      const data = ctx.getImageData(0, 0, aw, ah).data
      for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3] ?? 0
    }
  } finally {
    releaseCanvas(canvas)
  }
  return { bitmap, alpha, aw, ah }
}

/**
 * The outfit builder canvas: base model + layers. Tap an item to select it; drag moves the item
 * under the finger, two fingers scale/rotate the selected item; a swipe on the background switches
 * view. Only the current view's images are decoded: switching view frees the previous set first.
 * Gestures never re-render React; the result is reported once when the fingers lift.
 */
export function BuilderCanvas({ base, entries, selected, onSelect, onTransform, onSwipe }: BuilderCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const view = useRef<Similarity>({ a: 1, b: 0, tx: 0, ty: 0 })
  const baseBmp = useRef<{ blob: Blob; bitmap: ImageBitmap } | null>(null)
  const layers = useRef(new Map<Blob, Decoded>())
  const props = useRef({ base, entries, selected, onSelect, onTransform, onSwipe })
  const live = useRef<{ id: string; override: Transform } | null>(null)
  const gesture = useRef<{ kind: 'item'; id: string } | { kind: 'swipe'; start: Point; last: Point } | null>(null)
  const frame = useRef(0)
  const commitTimer = useRef(0)

  useLayoutEffect(() => {
    props.current = { base, entries, selected, onSelect, onTransform, onSwipe }
  })

  const matrixOf = useCallback((e: CanvasEntry, d: Decoded) => {
    const o = live.current?.id === e.id ? live.current.override : e.override
    return compose(view.current, outfitLayerMatrix(e, d.bitmap.width, d.bitmap.height, o))
  }, [])

  const render = useCallback(() => {
    frame.current = 0
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const b = baseBmp.current
    if (!canvas || !ctx || !b) return
    const { base: img, entries: list, selected: sel } = props.current
    const dpr = canvas.width / Math.max(1, canvas.clientWidth)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setMatrix(ctx, view.current, dpr)
    ctx.drawImage(b.bitmap, 0, 0, img.width, img.height)
    let outline: Point[] | null = null
    for (const e of list) {
      const d = layers.current.get(e.image)
      if (!d) continue
      const m = matrixOf(e, d)
      setMatrix(ctx, m, dpr)
      ctx.drawImage(d.bitmap, 0, 0)
      if (e.id === sel) {
        const { width: w, height: h } = d.bitmap
        outline = [
          { x: 0, y: 0 },
          { x: w, y: 0 },
          { x: w, y: h },
          { x: 0, y: h },
        ].map((p) => apply(m, p))
      }
    }
    if (outline) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.beginPath()
      outline.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y)
        else ctx.lineTo(p.x, p.y)
      })
      ctx.closePath()
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'
      ctx.setLineDash([])
      ctx.stroke()
      ctx.lineWidth = 1.5
      ctx.strokeStyle = '#ffffff'
      ctx.setLineDash([6, 4])
      ctx.stroke()
      ctx.setLineDash([])
    }
  }, [matrixOf])

  const invalidate = useCallback(() => {
    frame.current ||= requestAnimationFrame(render)
  }, [render])

  // New props: drop a finished gesture's preview (the committed override is now in `entries`) and redraw.
  useEffect(() => {
    if (!gesture.current) live.current = null
    invalidate()
  }, [entries, selected, invalidate])

  // Keep exactly the images of this view decoded. Old ones are closed before new ones are decoded.
  const imagesKey = entries.map((e) => e.id).join('|')
  useEffect(() => {
    let cancelled = false
    const isCancelled = () => cancelled
    void (async () => {
      const { base: img, entries: list } = props.current
      const wanted = new Set(list.map((e) => e.image))
      for (const [blob, d] of layers.current) {
        if (wanted.has(blob)) continue
        d.bitmap.close()
        layers.current.delete(blob)
      }
      if (baseBmp.current && baseBmp.current.blob !== img.image) {
        baseBmp.current.bitmap.close()
        baseBmp.current = null
      }
      try {
        if (!baseBmp.current) {
          const bitmap = trackBitmap(await createImageBitmap(img.image))
          if (isCancelled()) {
            bitmap.close()
            return
          }
          baseBmp.current = { blob: img.image, bitmap }
          invalidate()
        }
        for (const blob of wanted) {
          if (layers.current.has(blob)) continue
          const d = await decode(blob)
          if (isCancelled() || !props.current.entries.some((e) => e.image === blob)) {
            d.bitmap.close()
            if (isCancelled()) return
            continue
          }
          layers.current.set(blob, d)
          invalidate()
        }
        debugLog('builder images', { layers: layers.current.size, res: formatResources() })
      } catch (err) {
        debugLog(`builder decode failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [base.image, imagesKey, invalidate])

  // Size, and free everything on unmount.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const decoded = layers.current
    const observer = new ResizeObserver(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(canvas.clientWidth * dpr)
      canvas.height = Math.round(canvas.clientHeight * dpr)
      const { base: img } = props.current
      view.current = fit(img.width, img.height, canvas.clientWidth, canvas.clientHeight)
      invalidate()
    })
    observer.observe(canvas)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame.current)
      frame.current = 0
      window.clearTimeout(commitTimer.current)
      for (const d of decoded.values()) d.bitmap.close()
      decoded.clear()
      baseBmp.current?.bitmap.close()
      baseBmp.current = null
      releaseCanvas(canvas)
    }
  }, [invalidate])

  // A new base view can have another size.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    view.current = fit(base.width, base.height, canvas.clientWidth, canvas.clientHeight)
    invalidate()
  }, [base.width, base.height, invalidate])

  /** Topmost item under `p`: inside its image and not on a transparent pixel (the selected one: anywhere in its box). */
  const hitTest = (p: Point): string | null => {
    const { entries: list, selected: sel } = props.current
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i]
      const d = e && layers.current.get(e.image)
      if (!e || !d) continue
      const q = apply(invert(matrixOf(e, d)), p)
      const { width: w, height: h } = d.bitmap
      if (q.x < 0 || q.y < 0 || q.x >= w || q.y >= h) continue
      if (e.id === sel) return e.id
      const gx = Math.min(d.aw - 1, Math.floor((q.x / w) * d.aw))
      const gy = Math.min(d.ah - 1, Math.floor((q.y / h) * d.ah))
      if ((d.alpha[gy * d.aw + gx] ?? 0) > 40) return e.id
    }
    return null
  }

  const current = (id: string): { entry: CanvasEntry; override: Transform } | null => {
    const entry = props.current.entries.find((e) => e.id === id)
    if (!entry) return null
    const override = live.current?.id === id ? live.current.override : (entry.override ?? IDENTITY_TRANSFORM)
    return { entry, override }
  }

  const commit = () => {
    window.clearTimeout(commitTimer.current)
    const l = live.current
    if (l) props.current.onTransform(l.id, l.override)
  }

  const select = (id: string | null) => {
    props.current = { ...props.current, selected: id }
    props.current.onSelect(id)
    invalidate()
  }

  useGestures(
    canvasRef,
    {
      onDragStart: (p) => {
        const id = hitTest(p)
        if (id) {
          const c = current(id)
          if (!c) return
          gesture.current = { kind: 'item', id }
          live.current = { id, override: c.override }
          if (id !== props.current.selected) select(id)
        } else {
          gesture.current = { kind: 'swipe', start: p, last: p }
        }
      },
      onDragMove: (p, prev) => {
        const g = gesture.current
        if (g?.kind === 'swipe') {
          g.last = p
          return
        }
        if (g?.kind !== 'item' || live.current?.id !== g.id) return
        const s = view.current.a
        const o = live.current.override
        live.current = { id: g.id, override: { ...o, dx: o.dx + (p.x - prev.x) / s, dy: o.dy + (p.y - prev.y) / s } }
        invalidate()
      },
      onDragEnd: (p, { tap }) => {
        const g = gesture.current
        gesture.current = null
        if (g?.kind === 'swipe') {
          const dx = p.x - g.start.x
          const dy = p.y - g.start.y
          if (tap) select(null)
          else if (Math.abs(dx) > SWIPE_MIN_PX && Math.abs(dx) > 1.5 * Math.abs(dy)) {
            props.current.onSwipe(dx < 0 ? 1 : -1)
          }
          return
        }
        if (g?.kind === 'item' && !tap) commit()
        else live.current = null
      },
      onDragCancel: () => {
        // A second finger arrived: the pinch takes over from where the item was before the drag.
        gesture.current = null
        live.current = null
        invalidate()
      },
      onPinch: (delta) => {
        const id = props.current.selected
        if (!id) return
        const c = current(id)
        if (!c) return
        const center = layerCenter(c.entry)
        const v = view.current
        const d = compose(invert(v), compose(delta, v)) // screen change → base-view pixels
        let next = compose(d, overrideToSimilarity(c.override, center))
        const s = scaleOf(next)
        if (s < MIN_SCALE || s > MAX_SCALE) {
          const k = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s)) / s
          const pivot = apply(next, center)
          next = compose({ a: k, b: 0, tx: pivot.x - k * pivot.x, ty: pivot.y - k * pivot.y }, next)
        }
        live.current = { id, override: similarityToOverride(next, center) }
        invalidate()
        // Trackpad pinch (wheel) has no end event: commit when it pauses.
        window.clearTimeout(commitTimer.current)
        commitTimer.current = window.setTimeout(commit, 300)
      },
      onPinchEnd: commit,
    },
    { rotate: true },
  )

  return <canvas ref={canvasRef} className="block h-full w-full touch-none" />
}

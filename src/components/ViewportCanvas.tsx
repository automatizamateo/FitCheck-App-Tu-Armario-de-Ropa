import { useCallback, useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import { useGestures } from '../lib/gesture/useGestures'
import {
  apply,
  clampScale,
  compose,
  fit,
  invert,
  scaleOf,
  type Point,
  type Similarity,
} from '../lib/gesture/similarity'

export interface ViewportHandle {
  /** Schedules a redraw on the next animation frame. */
  invalidate: () => void
  resetView: () => void
  toContent: (p: Point) => Point
  /** Screen pixels per content pixel. */
  scale: () => number
}

/** Single-finger tool (brush, tap-to-select…), in content coordinates. Without it one finger pans. */
export interface ViewportTool {
  onStart?: (p: Point) => void
  onMove?: (p: Point, prev: Point) => void
  onEnd?: (p: Point, info: { tap: boolean }) => void
  onCancel?: () => void
}

interface ViewportCanvasProps {
  contentWidth: number
  contentHeight: number
  /** Called inside requestAnimationFrame with the context already transformed to content coordinates. */
  draw: (ctx: CanvasRenderingContext2D, view: Similarity) => void
  tool?: ViewportTool
  rotate?: boolean
  onDoubleTap?: () => void
  minZoom?: number // relative to "fit"
  maxZoom?: number
  className?: string
  ref?: Ref<ViewportHandle>
}

/**
 * Canvas with pan / pinch-zoom / optional rotate and double-tap-to-fit, drawn in rAF.
 * DPR-aware; no React renders during gestures.
 */
export function ViewportCanvas({
  contentWidth,
  contentHeight,
  draw,
  tool,
  rotate = false,
  onDoubleTap,
  minZoom = 0.5,
  maxZoom = 10,
  className = '',
  ref,
}: ViewportCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const view = useRef<Similarity>({ a: 1, b: 0, tx: 0, ty: 0 })
  const fitScale = useRef(1)
  const size = useRef({ w: 0, h: 0, dpr: 1 })
  const frame = useRef(0)
  const drawRef = useRef(draw)
  useEffect(() => {
    drawRef.current = draw
  })

  const render = useCallback(() => {
    frame.current = 0
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const { w, h, dpr } = size.current
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    ctx.save()
    const v = view.current
    ctx.transform(v.a, v.b, -v.b, v.a, v.tx, v.ty)
    drawRef.current(ctx, v)
    ctx.restore()
  }, [])

  const invalidate = useCallback(() => {
    frame.current ||= requestAnimationFrame(render)
  }, [render])

  const resetView = useCallback(() => {
    const { w, h } = size.current
    if (!w || !h || !contentWidth || !contentHeight) return
    view.current = fit(contentWidth, contentHeight, w, h)
    fitScale.current = scaleOf(view.current)
    invalidate()
  }, [contentWidth, contentHeight, invalidate])

  useImperativeHandle(
    ref,
    () => ({
      invalidate,
      resetView,
      toContent: (p) => apply(invert(view.current), p),
      scale: () => scaleOf(view.current),
    }),
    [invalidate, resetView],
  )

  // Match the backing store to the element size × devicePixelRatio.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      const { width, height } = entry.contentRect
      size.current = { w: width, h: height, dpr }
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      resetView()
    })
    observer.observe(canvas)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame.current)
      frame.current = 0
    }
  }, [resetView])

  const toContent = (p: Point) => apply(invert(view.current), p)

  useGestures(
    canvasRef,
    {
      onDragStart: (p) => tool?.onStart?.(toContent(p)),
      onDragMove: (p, prev) => {
        if (tool) {
          tool.onMove?.(toContent(p), toContent(prev))
          return
        }
        view.current = compose({ a: 1, b: 0, tx: p.x - prev.x, ty: p.y - prev.y }, view.current)
        invalidate()
      },
      onDragEnd: (p, info) => tool?.onEnd?.(toContent(p), info),
      onDragCancel: () => tool?.onCancel?.(),
      onPinch: (delta, center) => {
        view.current = clampScale(
          compose(delta, view.current),
          center,
          fitScale.current * minZoom,
          fitScale.current * maxZoom,
        )
        invalidate()
      },
      onDoubleTap: () => {
        resetView()
        onDoubleTap?.()
      },
    },
    { rotate },
  )

  return (
    <canvas
      ref={canvasRef}
      className={`block h-full w-full touch-none select-none [-webkit-touch-callout:none] [-webkit-user-select:none] ${className}`}
    />
  )
}

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { about, fromPinch, type Point, type Similarity } from './similarity'

export interface GestureHandlers {
  /** One finger (or mouse) pressed. */
  onDragStart?: (p: Point) => void
  onDragMove?: (p: Point, prev: Point) => void
  /** tap = short press without movement. */
  onDragEnd?: (p: Point, info: { tap: boolean }) => void
  /** A second finger arrived (or the system cancelled): undo whatever the drag did. */
  onDragCancel?: () => void
  /** Incremental two-finger transform in element coordinates (also trackpad pinch / scroll). */
  onPinch?: (delta: Similarity, center: Point) => void
  onPinchEnd?: () => void
  onDoubleTap?: (p: Point) => void
}

export interface GestureOptions {
  rotate?: boolean
}

const TAP_MAX_MOVE = 8 // px
const TAP_MAX_MS = 300
const DOUBLE_TAP_MS = 320
const DOUBLE_TAP_DIST = 32

/**
 * Pointer Events gesture layer for canvases: one-finger drag, two-finger pinch/pan/rotate,
 * double-tap. Handlers are read from a ref, so passing new functions never re-attaches listeners
 * and pointer moves never cause React renders. Blocks Safari's page scroll, bounce, zoom and the
 * long-press callout on the element.
 */
export function useGestures(ref: RefObject<HTMLElement | null>, handlers: GestureHandlers, options: GestureOptions = {}) {
  const latest = useRef({ handlers, options })
  useLayoutEffect(() => {
    latest.current = { handlers, options }
  })

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const pointers = new Map<number, Point>()
    let mode: 'idle' | 'drag' | 'pinch' | 'settling' = 'idle'
    let dragStart = { p: { x: 0, y: 0 }, t: 0, moved: 0 }
    let lastTap: { p: Point; t: number } | null = null

    const local = (e: PointerEvent): Point => {
      const r = el.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const h = () => latest.current.handlers

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      e.preventDefault()
      el.setPointerCapture(e.pointerId)
      pointers.set(e.pointerId, local(e))
      if (pointers.size === 1 && mode === 'idle') {
        mode = 'drag'
        dragStart = { p: local(e), t: performance.now(), moved: 0 }
        h().onDragStart?.(dragStart.p)
      } else if (pointers.size === 2) {
        if (mode === 'drag') h().onDragCancel?.()
        mode = 'pinch'
        lastTap = null
      }
    }

    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId)
      if (!prev) return
      e.preventDefault()
      if (mode === 'drag') {
        // Coalesced events give smooth brush strokes when the main thread is busy.
        const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : []
        let last = prev
        for (const ce of events.length ? events : [e]) {
          const p = local(ce)
          dragStart.moved = Math.max(dragStart.moved, Math.hypot(p.x - dragStart.p.x, p.y - dragStart.p.y))
          h().onDragMove?.(p, last)
          last = p
        }
        pointers.set(e.pointerId, last)
        return
      }
      const next = local(e)
      if (mode === 'pinch' && pointers.size >= 2) {
        const ids = [...pointers.keys()].slice(0, 2)
        const before = ids.map((id) => pointers.get(id) ?? next)
        pointers.set(e.pointerId, next)
        const after = ids.map((id) => pointers.get(id) ?? next)
        const [p1, p2] = before as [Point, Point]
        const [q1, q2] = after as [Point, Point]
        const delta = fromPinch(p1, p2, q1, q2, latest.current.options.rotate ?? false)
        h().onPinch?.(delta, { x: (q1.x + q2.x) / 2, y: (q1.y + q2.y) / 2 })
        return
      }
      pointers.set(e.pointerId, next)
    }

    const onUp = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return
      const p = local(e)
      pointers.delete(e.pointerId)
      if (mode === 'drag') {
        mode = 'idle'
        if (e.type === 'pointercancel') {
          h().onDragCancel?.()
          return
        }
        const tap = dragStart.moved < TAP_MAX_MOVE && performance.now() - dragStart.t < TAP_MAX_MS
        h().onDragEnd?.(p, { tap })
        if (!tap) return
        const now = performance.now()
        if (lastTap && now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(p.x - lastTap.p.x, p.y - lastTap.p.y) < DOUBLE_TAP_DIST) {
          lastTap = null
          h().onDoubleTap?.(p)
        } else {
          lastTap = { p, t: now }
        }
        return
      }
      if (mode === 'pinch' && pointers.size < 2) {
        h().onPinchEnd?.()
        mode = 'settling' // ignore the remaining finger until all are lifted
      }
      if (pointers.size === 0) mode = 'idle'
    }

    // Desktop: trackpad pinch arrives as ctrl+wheel; plain wheel pans.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const c = { x: e.clientX - r.left, y: e.clientY - r.top }
      const delta = e.ctrlKey ? about(c, Math.exp(-e.deltaY * 0.01), 0) : about(c, 1, 0, -e.deltaX, -e.deltaY)
      h().onPinch?.(delta, c)
    }

    const block = (e: Event) => {
      e.preventDefault()
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('wheel', onWheel, { passive: false })
    // Safari-only pinch events and touch scrolling/bounce; the callout on long-press.
    el.addEventListener('gesturestart', block)
    el.addEventListener('gesturechange', block)
    el.addEventListener('touchstart', block, { passive: false })
    el.addEventListener('touchmove', block, { passive: false })
    el.addEventListener('contextmenu', block)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('gesturestart', block)
      el.removeEventListener('gesturechange', block)
      el.removeEventListener('touchstart', block)
      el.removeEventListener('touchmove', block)
      el.removeEventListener('contextmenu', block)
    }
  }, [ref])
}

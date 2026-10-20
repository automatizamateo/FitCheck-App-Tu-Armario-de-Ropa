// Rough live-memory picture for the debug log. Safari has no performance.memory, so we count what we
// own: workers (each holds a model), ImageBitmaps and canvases. A closed or transferred ImageBitmap
// reports 0×0, and a released canvas is set to 0×0, so neither is counted once freed.

let workers = 0
const bitmaps = new Set<WeakRef<ImageBitmap>>()
const canvases = new Set<WeakRef<HTMLCanvasElement | OffscreenCanvas>>()

export function trackWorker(delta: 1 | -1) {
  workers = Math.max(0, workers + delta)
}

export function trackBitmap<T extends ImageBitmap>(bitmap: T): T {
  bitmaps.add(new WeakRef(bitmap))
  return bitmap
}

export function trackCanvas<T extends HTMLCanvasElement | OffscreenCanvas>(canvas: T): T {
  canvases.add(new WeakRef(canvas))
  return canvas
}

/** Frees a canvas's backing store right away instead of waiting for GC (matters on iOS). */
export function releaseCanvas(canvas: HTMLCanvasElement | OffscreenCanvas | null | undefined) {
  if (!canvas) return
  canvas.width = 0
  canvas.height = 0
}

function live<T extends { width: number; height: number }>(set: Set<WeakRef<T>>): T[] {
  const out: T[] = []
  for (const ref of set) {
    const item = ref.deref()
    if (item && item.width > 0 && item.height > 0) out.push(item)
    else set.delete(ref)
  }
  return out
}

export interface ResourceSnapshot {
  workers: number
  bitmaps: number
  canvases: number
  pixelMB: number // RGBA bytes held by live bitmaps + canvases
  heapMB?: number // Chrome only
}

export function resourceSnapshot(): ResourceSnapshot {
  const b = live(bitmaps)
  const c = live(canvases)
  const bytes = [...b, ...c].reduce((sum, x) => sum + x.width * x.height * 4, 0)
  const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize
  return {
    workers,
    bitmaps: b.length,
    canvases: c.length,
    pixelMB: Math.round(bytes / 1e5) / 10,
    ...(heap ? { heapMB: Math.round(heap / 1e6) } : {}),
  }
}

/** Compact form for log lines: "w1 b2 c0 4.3MB". */
export function formatResources(s: ResourceSnapshot = resourceSnapshot()): string {
  return `[w${s.workers} b${s.bitmaps} c${s.canvases} ${s.pixelMB}MB${s.heapMB ? ` heap ${s.heapMB}MB` : ''}]`
}

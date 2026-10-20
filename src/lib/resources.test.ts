import { describe, expect, it } from 'vitest'
import { formatResources, releaseCanvas, resourceSnapshot, trackBitmap, trackCanvas, trackWorker } from './resources'

describe('resource counters', () => {
  it('counts live workers, bitmaps and canvases, and forgets freed ones', () => {
    const before = resourceSnapshot()
    trackWorker(1)
    const bitmap = { width: 100, height: 50 } as ImageBitmap
    trackBitmap(bitmap)
    const canvas = { width: 10, height: 10 } as HTMLCanvasElement
    trackCanvas(canvas)
    const now = resourceSnapshot()
    expect(now.workers).toBe(before.workers + 1)
    expect(now.bitmaps).toBe(before.bitmaps + 1)
    expect(now.canvases).toBe(before.canvases + 1)
    expect(now.pixelMB).toBeCloseTo(before.pixelMB + 0.02, 1)

    // A closed/transferred bitmap reports 0×0; a released canvas is set to 0×0.
    Object.assign(bitmap, { width: 0, height: 0 })
    releaseCanvas(canvas)
    trackWorker(-1)
    expect(resourceSnapshot()).toMatchObject({ workers: before.workers, bitmaps: before.bitmaps, canvases: before.canvases })
    expect(formatResources()).toMatch(/^\[w\d+ b\d+ c\d+ [\d.]+MB/)
  })
})

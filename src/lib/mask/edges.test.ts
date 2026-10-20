import { describe, expect, it } from 'vitest'
import { boxFilter, guidedFilter, morphClose, morphOpen, smoothMaskEdges } from './edges'
import { area, iou } from './ops'

/** w×h mask that is 1 where fn(x, y) holds. */
function maskOf(w: number, h: number, fn: (x: number, y: number) => boolean): Uint8Array {
  const m = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = fn(x, y) ? 1 : 0
  return m
}

/** First column (scanning left → right in row y) where the mask is 0, i.e. where the left-side object ends. */
function edgeX(mask: Uint8Array, w: number, y: number): number {
  for (let x = 0; x < w; x++) if (!mask[y * w + x]) return x
  return w
}

describe('edge cleanup', () => {
  it('box filter averages and keeps constants', () => {
    const src = Float32Array.from([0, 0, 3, 0, 0])
    const out = boxFilter(src, 5, 1, 1)
    expect(out[2]).toBeCloseTo(1)
    expect(out[0]).toBeCloseTo(0)
    expect(boxFilter(new Float32Array(9).fill(0.4), 3, 3, 2).every((v) => Math.abs(v - 0.4) < 1e-6)).toBe(true)
  })

  it('closing fills a narrow notch; opening removes a thin spur', () => {
    const w = 40
    const h = 40
    const notched = maskOf(w, h, (x, y) => x >= 10 && x < 30 && y >= 10 && y < 30 && !(x === 20 && y < 20))
    const closed = morphClose(notched, w, h, 2)
    expect(closed[15 * w + 20]).toBe(1)

    const spur = maskOf(w, h, (x, y) => (x >= 10 && x < 30 && y >= 10 && y < 30) || (y === 20 && x >= 30 && x < 38))
    const opened = morphOpen(spur, w, h, 1)
    expect(opened[20 * w + 35]).toBe(0)
    expect(opened[20 * w + 20]).toBe(1)
  })

  it('guided filter pulls a misplaced mask edge onto the photo edge', () => {
    const w = 60
    const h = 20
    const guide = new Float32Array(w * h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) guide[y * w + x] = x < 30 ? 0.8 : 0.2
    const p = new Float32Array(w * h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p[y * w + x] = x < 33 ? 1 : 0 // 3 px too wide
    const q = guidedFilter(guide, p, w, h, 8, 1e-3)
    const qMask = Uint8Array.from(q, (v) => (v >= 0.5 ? 1 : 0))
    expect(Math.abs(edgeX(qMask, w, 10) - 30)).toBeLessThanOrEqual(1)
  })

  it('snaps a full-size mask to the guide edge, smooths jaggies, and only changes pixels near the edge', () => {
    const w = 480
    const h = 80
    // Photo: bright person on the left (x < 60), dark wall on the right. Guide at full size (≤ 512 px).
    const guide = { data: new Float32Array(w * h), width: w, height: h }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) guide.data[y * w + x] = x < 60 ? 0.85 : 0.15
    // Coarse mask: edge 3 px too far right, with a 1-px jaggy every other row.
    const coarse = maskOf(w, h, (x, y) => x < 63 + (y % 2))
    const out = smoothMaskEdges(coarse, w, h, guide)
    for (const y of [20, 21, 40, 41]) expect(Math.abs(edgeX(out, w, y) - 60)).toBeLessThanOrEqual(1)
    // Far from the edge nothing changes.
    for (let y = 0; y < h; y++) {
      expect(out[y * w + 5]).toBe(1)
      expect(out[y * w + 110]).toBe(0)
      expect(out[y * w + 400]).toBe(0)
    }
    expect(iou(out, coarse)).toBeGreaterThan(0.9)
  })

  it('without a guide it still keeps the shape', () => {
    const w = 100
    const h = 100
    const disk = maskOf(w, h, (x, y) => (x - 50) ** 2 + (y - 50) ** 2 < 30 ** 2)
    const out = smoothMaskEdges(disk, w, h, null)
    expect(iou(out, disk)).toBeGreaterThan(0.95)
    expect(Math.abs(area(out) - area(disk)) / area(disk)).toBeLessThan(0.05)
  })
})

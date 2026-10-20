import { describe, expect, it } from 'vitest'
import {
  area,
  blendBoundary,
  boundingBox,
  cleanupMask,
  dilate,
  distanceToMask,
  erode,
  featherAlpha,
  iou,
  removeSmallRegions,
  samplePromptPoints,
  threshold,
} from './ops'

/** Mask from rows of '#' (1) and '.' (0). */
function grid(rows: string[]) {
  const height = rows.length
  const width = rows[0]?.length ?? 0
  const mask = new Uint8Array(width * height)
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) mask[y * width + x] = row.charAt(x) === '#' ? 1 : 0
  })
  return { mask, width, height }
}

function rect(width: number, height: number, x0: number, y0: number, x1: number, y1: number) {
  const mask = new Uint8Array(width * height)
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) mask[y * width + x] = 1
  return mask
}

describe('mask ops', () => {
  it('thresholds probabilities', () => {
    expect([...threshold(Uint8Array.from([0, 127, 128, 255]))]).toEqual([0, 0, 1, 1])
  })

  it('computes approximately Euclidean distances', () => {
    const { mask, width, height } = grid(['#....', '.....', '.....'])
    const d = distanceToMask(mask, width, height)
    expect(d[0]).toBe(0)
    expect(d[4]).toBeCloseTo(4, 5) // straight line
    expect(d[2 * width + 2]).toBeCloseTo(8 / 3, 5) // 2 diagonal steps (chamfer 4/3 each)
  })

  it('dilates and erodes symmetrically', () => {
    const W = 20
    const square = rect(W, W, 5, 5, 15, 15)
    expect(area(dilate(square, W, W, 1))).toBe(10 * 10 + 4 * 10) // grows one pixel on each side, not corners
    expect(area(erode(square, W, W, 1))).toBe(8 * 8)
    expect(iou(erode(dilate(square, W, W, 2), W, W, 2), square)).toBe(1) // closing keeps a convex shape
  })

  it('removes specks and fills pinholes but keeps big regions', () => {
    const { mask, width, height } = grid([
      '#.........',
      '..######..',
      '..##.###..',
      '..######..',
      '.........#',
    ])
    const specksRemoved = removeSmallRegions(mask, width, height, 3, 1)
    expect(specksRemoved[0]).toBe(0)
    expect(specksRemoved[4 * width + 9]).toBe(0)
    expect(specksRemoved[2 * width + 4]).toBe(0) // hole untouched by speck pass
    const cleaned = cleanupMask(mask, width, height, 0.05) // minArea = 3 px
    expect(cleaned[2 * width + 4]).toBe(1) // hole filled
    expect(area(cleaned)).toBe(18)
  })

  it('feathers edges without touching interior or far background', () => {
    const W = 12
    const square = rect(W, W, 3, 3, 9, 9)
    const alpha = featherAlpha(square, W, W, 1)
    expect(alpha[6 * W + 6]).toBe(255)
    expect(alpha[0]).toBe(0)
    const edge = alpha[6 * W + 3] ?? 0
    expect(edge).toBeGreaterThan(0)
    expect(edge).toBeLessThan(255)
    expect(featherAlpha(square, W, W, 0)[6 * W + 3]).toBe(255)
  })

  it('finds the bounding box and IoU', () => {
    const W = 10
    const a = rect(W, W, 2, 3, 6, 8)
    expect(boundingBox(a, W, W)).toEqual({ x: 2, y: 3, w: 4, h: 5 })
    expect(boundingBox(new Uint8Array(W * W), W, W)).toBeNull()
    const b = rect(W, W, 4, 3, 8, 8)
    expect(iou(a, b)).toBeCloseTo(10 / 30)
  })

  it('lets the fine mask decide only near the coarse edge', () => {
    const W = 40
    const coarse = rect(W, W, 10, 10, 30, 30)
    const fine = rect(W, W, 12, 0, 40, 40) // disagrees near the left edge and far outside
    const out = blendBoundary(coarse, fine, W, W, 3)
    expect(out[20 * W + 20]).toBe(1) // interior kept
    expect(out[20 * W + 11]).toBe(0) // in band: fine says no
    expect(out[20 * W + 31]).toBe(1) // in band: fine says yes
    expect(out[20 * W + 38]).toBe(0) // far outside: fine ignored
    expect(out[2 * W + 20]).toBe(0)
  })

  it('samples positive points inside and negative points outside', () => {
    const W = 60
    const mask = rect(W, W, 20, 5, 40, 55)
    const { positive, negative } = samplePromptPoints(mask, W, W, 5)
    expect(positive.length).toBe(5)
    for (const [x, y] of positive) expect(mask[y * W + x]).toBe(1)
    expect(negative.length).toBeGreaterThan(0)
    for (const [x, y] of negative) expect(mask[y * W + x]).toBe(0)
  })
})

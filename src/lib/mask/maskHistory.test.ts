import { describe, expect, it } from 'vitest'
import { MaskHistory } from './maskHistory'

const W = 100
const H = 80

function withBox(base: Uint8Array, x0: number, y0: number, w: number, h: number, value: 0 | 1): Uint8Array {
  const m = base.slice()
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) m[y * W + x] = value
  return m
}

describe('MaskHistory', () => {
  it('undoes and redoes edits exactly', () => {
    const empty = new Uint8Array(W * H)
    const a = withBox(empty, 10, 10, 30, 40, 1)
    const b = withBox(a, 20, 20, 5, 5, 0)
    const h = new MaskHistory(empty, W, H)
    h.commit(a)
    h.commit(b)
    expect(h.current).toEqual(b)
    expect(h.undo()).toEqual(a)
    expect(h.undo()).toEqual(empty)
    expect(h.canUndo).toBe(false)
    expect(h.redo()).toEqual(a)
    expect(h.redo()).toEqual(b)
    expect(h.canRedo).toBe(false)
  })

  it('ignores no-op commits and drops the redo branch on a new edit', () => {
    const empty = new Uint8Array(W * H)
    const h = new MaskHistory(empty, W, H)
    expect(h.commit(empty.slice())).toBe(false)
    expect(h.canUndo).toBe(false)
    h.commit(withBox(empty, 0, 0, 5, 5, 1))
    h.undo()
    h.commit(withBox(empty, 50, 50, 5, 5, 1))
    expect(h.canRedo).toBe(false)
  })

  it('stores only the changed area: a small stroke costs little', () => {
    const big = withBox(new Uint8Array(W * H), 5, 5, 90, 70, 1)
    const h = new MaskHistory(big, W, H)
    h.commit(withBox(big, 40, 40, 3, 3, 0))
    expect(h.bytes).toBeLessThan(200)
  })

  it('stays under its byte cap by dropping the oldest steps, and still undoes correctly', () => {
    let m = new Uint8Array(W * H)
    const h = new MaskHistory(m, W, H, 1500)
    const states: Uint8Array[] = []
    for (let i = 0; i < 40; i++) {
      // Checkerboard-ish rows so each diff has many runs.
      m = m.slice()
      for (let x = 0; x < W; x += 2) m[(i % H) * W + x] = m[(i % H) * W + x] ? 0 : 1
      h.commit(m)
      states.push(m)
    }
    expect(h.bytes).toBeLessThanOrEqual(1500)
    let steps = 0
    while (h.canUndo) {
      h.undo()
      steps++
      expect(h.current).toEqual(states[states.length - 1 - steps])
    }
    expect(steps).toBeGreaterThan(0)
    expect(steps).toBeLessThan(40)
  })
})

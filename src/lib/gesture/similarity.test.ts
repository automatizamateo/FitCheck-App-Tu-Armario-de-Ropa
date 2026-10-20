import { describe, expect, it } from 'vitest'
import { about, apply, clampScale, compose, fit, fromPinch, IDENTITY, invert, rotationOf, scaleOf } from './similarity'

const close = (p: { x: number; y: number }, q: { x: number; y: number }) => {
  expect(p.x).toBeCloseTo(q.x, 6)
  expect(p.y).toBeCloseTo(q.y, 6)
}

describe('similarity transforms', () => {
  it('composes and inverts', () => {
    const t = compose(about({ x: 3, y: 4 }, 2, 0.5, 10, -2), about({ x: 0, y: 0 }, 0.7, -1.2, 1, 1))
    const p = { x: 5, y: -7 }
    close(apply(invert(t), apply(t, p)), p)
    close(apply(compose(t, invert(t)), p), p)
  })

  it('keeps the pinch midpoint under the fingers and scales by finger distance', () => {
    const p1 = { x: 100, y: 100 }
    const p2 = { x: 200, y: 100 }
    const q1 = { x: 50, y: 150 }
    const q2 = { x: 250, y: 150 }
    const d = fromPinch(p1, p2, q1, q2, false)
    expect(scaleOf(d)).toBeCloseTo(2)
    close(apply(d, { x: 150, y: 100 }), { x: 150, y: 150 })
    close(apply(d, p1), q1)
    close(apply(d, p2), q2)
  })

  it('rotates only when allowed', () => {
    const p1 = { x: 0, y: 0 }
    const p2 = { x: 10, y: 0 }
    const q1 = { x: 0, y: 0 }
    const q2 = { x: 0, y: 10 }
    expect(rotationOf(fromPinch(p1, p2, q1, q2, true))).toBeCloseTo(Math.PI / 2)
    expect(rotationOf(fromPinch(p1, p2, q1, q2, false))).toBeCloseTo(0)
  })

  it('fits content centered in the viewport', () => {
    const t = fit(200, 400, 400, 400, 0)
    expect(scaleOf(t)).toBe(1)
    close(apply(t, { x: 0, y: 0 }), { x: 100, y: 0 })
    close(apply(t, { x: 200, y: 400 }), { x: 300, y: 400 })
  })

  it('clamps scale around a fixed point', () => {
    const center = { x: 50, y: 50 }
    const big = about(center, 20, 0)
    const clamped = clampScale(big, center, 0.5, 8)
    expect(scaleOf(clamped)).toBeCloseTo(8)
    close(apply(clamped, center), center)
    expect(clampScale(IDENTITY, center, 0.5, 8)).toEqual(IDENTITY)
  })
})

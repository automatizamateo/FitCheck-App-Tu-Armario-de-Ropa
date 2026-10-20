import { describe, expect, it } from 'vitest'
import { about, apply, compose, rotationOf, scaleOf, type Point } from './gesture/similarity'
import {
  alignByBox,
  alignByLandmarks,
  fitSimilarity,
  layerToSimilarity,
  MAX_AUTO_ROTATION,
  placementToLayer,
} from './align'
import type { PoseLandmarks } from '../domain/types'

function must<T>(value: T | null | undefined): T {
  expect(value).toBeTruthy()
  return value as T
}

const close = (p: Point, q: Point, eps = 1e-6) => {
  expect(p.x).toBeCloseTo(q.x, -Math.log10(eps))
  expect(p.y).toBeCloseTo(q.y, -Math.log10(eps))
}

describe('fitSimilarity', () => {
  it('recovers an exact scale + rotation + translation', () => {
    const t = about({ x: 0, y: 0 }, 1.3, 0.1, 40, -25)
    const from = [
      { x: 10, y: 20 },
      { x: 200, y: 30 },
      { x: 120, y: 300 },
    ]
    const s = must(
      fitSimilarity(
        from,
        from.map((p) => apply(t, p)),
      ),
    )
    for (const p of from) close(apply(s, p), apply(t, p), 1e-6)
  })

  it('clamps large rotations and keeps the best scale for the clamped angle', () => {
    const t = about({ x: 0, y: 0 }, 1, Math.PI / 2, 0, 0)
    const from = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]
    const s = must(
      fitSimilarity(
        from,
        from.map((p) => apply(t, p)),
      ),
    )
    expect(rotationOf(s)).toBeCloseTo(MAX_AUTO_ROTATION)
  })

  it('refuses fewer than two points or points in one spot', () => {
    expect(fitSimilarity([{ x: 1, y: 1 }], [{ x: 2, y: 2 }])).toBeNull()
    expect(
      fitSimilarity(
        [
          { x: 5, y: 5 },
          { x: 6, y: 5 },
        ],
        [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
        ],
      ),
    ).toBeNull()
  })
})

describe('alignByLandmarks', () => {
  const base: PoseLandmarks = {
    leftShoulder: { x: 0.6, y: 0.25 },
    rightShoulder: { x: 0.4, y: 0.25 },
    leftHip: { x: 0.58, y: 0.55 },
    rightHip: { x: 0.42, y: 0.55 },
  }

  it('maps the garment shoulders and hips onto the base model ones, in crop coordinates', () => {
    // Garment photo: same person 10 % smaller and shifted; the cut-out is cropped at (100, 150).
    const garment: PoseLandmarks = {}
    for (const [k, l] of Object.entries(base)) {
      garment[k as keyof PoseLandmarks] = { x: 0.5 + (l.x - 0.5) * 0.9 + 0.03, y: 0.5 + (l.y - 0.5) * 0.9 - 0.02 }
    }
    const offset = { x: -100, y: -150 }
    const s = must(
      alignByLandmarks(
        { landmarks: garment, width: 1000, height: 1200, offset },
        { landmarks: base, width: 1000, height: 1200 },
        ['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip'],
      ),
    )
    expect(scaleOf(s)).toBeCloseTo(1 / 0.9, 3)
    const ls = must(garment.leftShoulder)
    close(apply(s, { x: ls.x * 1000 - 100, y: ls.y * 1200 - 150 }), { x: 600, y: 300 }, 1e-3)
  })

  it('ignores low-visibility landmarks and gives up when too few remain', () => {
    const garment: PoseLandmarks = {
      leftShoulder: { x: 0.6, y: 0.25, visibility: 0.1 },
      rightShoulder: { x: 0.4, y: 0.25 },
    }
    expect(
      alignByLandmarks({ landmarks: garment, width: 100, height: 100 }, { landmarks: base, width: 100, height: 100 }, [
        'leftShoulder',
        'rightShoulder',
      ]),
    ).toBeNull()
  })

  it('rejects implausible scales (e.g. a mismatched landmark)', () => {
    const garment: PoseLandmarks = { leftShoulder: { x: 0.51, y: 0.25 }, rightShoulder: { x: 0.49, y: 0.25 } }
    expect(
      alignByLandmarks(
        { landmarks: garment, width: 1000, height: 1000 },
        { landmarks: base, width: 1000, height: 1000 },
        ['leftShoulder', 'rightShoulder'],
      ),
    ).toBeNull()
  })
})

describe('alignByBox', () => {
  it('fits the cut-out into the category region, centered, top-aligned', () => {
    const person = { x: 100, y: 50, w: 400, h: 1000 }
    const s = alignByBox({ w: 200, h: 100 }, person, { top: 0.15, bottom: 0.55, width: 1 })
    // Region is 400 × 400 → width-limited: scale 2.
    expect(scaleOf(s)).toBeCloseTo(2)
    close(apply(s, { x: 0, y: 0 }), { x: 100, y: 200 })
    close(apply(s, { x: 200, y: 0 }), { x: 500, y: 200 })
  })
})

describe('stored layer', () => {
  it('round-trips: placement → bbox + transform → drawing matrix', () => {
    const cutout = { w: 300, h: 420 }
    const auto = about({ x: 0, y: 0 }, 1.1, 0.05, 120, 260)
    // The user dragged, pinched and rotated it away from the auto placement.
    const userPlaced = compose(about({ x: 300, y: 400 }, 1.2, -0.1, 15, -8), auto)
    for (const p of [auto, userPlaced]) {
      const layer = placementToLayer(p, auto, cutout)
      expect(layer.bbox.w / layer.bbox.h).toBeCloseTo(cutout.w / cutout.h)
      // The stored image may be encoded at another resolution: only its aspect ratio matters.
      const m = layerToSimilarity(layer, cutout.w / 2, cutout.h / 2)
      for (const q of [
        { x: 0, y: 0 },
        { x: cutout.w, y: cutout.h },
        { x: 37, y: 250 },
      ]) {
        close(apply(m, { x: q.x / 2, y: q.y / 2 }), apply(p, q), 1e-6)
      }
    }
  })

  it('the auto placement is stored as an identity fine-tune apart from its rotation', () => {
    const auto = about({ x: 0, y: 0 }, 1.1, 0.05, 120, 260)
    const { transform } = placementToLayer(auto, auto, { w: 300, h: 420 })
    expect(transform.dx).toBeCloseTo(0)
    expect(transform.dy).toBeCloseTo(0)
    expect(transform.scale).toBeCloseTo(1)
    expect(transform.rotation).toBeCloseTo(0.05)
  })
})

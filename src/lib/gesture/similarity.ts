/**
 * 2D similarity transform (uniform scale + rotation + translation):
 *   x' = a·x − b·y + tx
 *   y' = b·x + a·y + ty
 * with a = s·cos θ, b = s·sin θ. Maps content coordinates to screen coordinates.
 */
export interface Similarity {
  a: number
  b: number
  tx: number
  ty: number
}

export interface Point {
  x: number
  y: number
}

export const IDENTITY: Similarity = { a: 1, b: 0, tx: 0, ty: 0 }

export function apply(t: Similarity, p: Point): Point {
  return { x: t.a * p.x - t.b * p.y + t.tx, y: t.b * p.x + t.a * p.y + t.ty }
}

/** compose(outer, inner) = outer ∘ inner (inner applied first). */
export function compose(outer: Similarity, inner: Similarity): Similarity {
  return {
    a: outer.a * inner.a - outer.b * inner.b,
    b: outer.b * inner.a + outer.a * inner.b,
    tx: outer.a * inner.tx - outer.b * inner.ty + outer.tx,
    ty: outer.b * inner.tx + outer.a * inner.ty + outer.ty,
  }
}

export function invert(t: Similarity): Similarity {
  const d = t.a * t.a + t.b * t.b
  const a = t.a / d
  const b = -t.b / d
  return { a, b, tx: -(a * t.tx - b * t.ty), ty: -(b * t.tx + a * t.ty) }
}

export function scaleOf(t: Similarity): number {
  return Math.hypot(t.a, t.b)
}

export function rotationOf(t: Similarity): number {
  return Math.atan2(t.b, t.a)
}

/** Uniform scale `s` and rotation `theta` about `center`, then translate by (dx, dy). */
export function about(center: Point, s: number, theta: number, dx = 0, dy = 0): Similarity {
  const a = s * Math.cos(theta)
  const b = s * Math.sin(theta)
  return { a, b, tx: center.x - a * center.x + b * center.y + dx, ty: center.y - b * center.x - a * center.y + dy }
}

/**
 * The incremental transform that moves two fingers from (p1, p2) to (q1, q2): the midpoint follows
 * the fingers, the distance sets the scale and (optionally) the angle sets the rotation.
 */
export function fromPinch(p1: Point, p2: Point, q1: Point, q2: Point, allowRotate: boolean): Similarity {
  const before = Math.hypot(p2.x - p1.x, p2.y - p1.y)
  const after = Math.hypot(q2.x - q1.x, q2.y - q1.y)
  const s = before > 0 ? after / before : 1
  const theta = allowRotate
    ? Math.atan2(q2.y - q1.y, q2.x - q1.x) - Math.atan2(p2.y - p1.y, p2.x - p1.x)
    : 0
  const m = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
  const n = { x: (q1.x + q2.x) / 2, y: (q1.y + q2.y) / 2 }
  return about(m, s, theta, n.x - m.x, n.y - m.y)
}

/** Transform that fits a content box centered inside a viewport, with padding (0–1). */
export function fit(contentW: number, contentH: number, viewW: number, viewH: number, padding = 0.04): Similarity {
  const s = Math.min(viewW / contentW, viewH / contentH) * (1 - padding)
  return { a: s, b: 0, tx: (viewW - contentW * s) / 2, ty: (viewH - contentH * s) / 2 }
}

/** Clamps the scale of `next` to [min, max], keeping `center` fixed on screen. */
export function clampScale(next: Similarity, center: Point, min: number, max: number): Similarity {
  const s = scaleOf(next)
  if (s >= min && s <= max) return next
  const factor = (s < min ? min : max) / s
  return compose(about(center, factor, 0), next)
}

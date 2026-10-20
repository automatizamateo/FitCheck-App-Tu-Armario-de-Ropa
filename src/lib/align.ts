// Placing a garment cut-out on the base model. A placement is a Similarity that maps the cut-out's
// pixel coordinates (cropped image, origin top-left) to base-model view pixels.

import type { Box } from './mask/ops'
import type { GarmentLayer, LandmarkName, PoseLandmarks, Transform } from '../domain/types'
import { about, apply, compose, rotationOf, scaleOf, type Point, type Similarity } from './gesture/similarity'

export const MAX_AUTO_ROTATION = (15 * Math.PI) / 180
/** Garment and base photos are taken from the same spot, so the scale between them is close to 1. */
export const AUTO_SCALE_RANGE = [0.5, 2] as const
const MIN_VISIBILITY = 0.5
const MIN_SPREAD_PX = 12

/**
 * Least-squares similarity (scale, rotation, translation) taking `from` points onto `to` points
 * (2D Procrustes, closed form). Rotation is clamped to ±maxRotation. Null with fewer than 2 points
 * or when the source points are all in one spot.
 */
export function fitSimilarity(from: Point[], to: Point[], maxRotation = MAX_AUTO_ROTATION): Similarity | null {
  const n = Math.min(from.length, to.length)
  if (n < 2) return null
  const mean = (ps: Point[]) => ({
    x: ps.slice(0, n).reduce((s, p) => s + p.x, 0) / n,
    y: ps.slice(0, n).reduce((s, p) => s + p.y, 0) / n,
  })
  const cf = mean(from)
  const ct = mean(to)
  let sxx = 0
  let dot = 0
  let cross = 0
  for (let i = 0; i < n; i++) {
    const f = from[i] as Point
    const t = to[i] as Point
    const fx = f.x - cf.x
    const fy = f.y - cf.y
    const tx = t.x - ct.x
    const ty = t.y - ct.y
    sxx += fx * fx + fy * fy
    dot += fx * tx + fy * ty
    cross += fx * ty - fy * tx
  }
  if (Math.sqrt(sxx / n) < MIN_SPREAD_PX) return null
  let theta = Math.atan2(cross, dot)
  // Scale of the best fit for the chosen angle: projection of the target spread onto the rotated source.
  theta = Math.max(-maxRotation, Math.min(maxRotation, theta))
  const s = (dot * Math.cos(theta) + cross * Math.sin(theta)) / sxx
  if (!(s > 0)) return null
  const a = s * Math.cos(theta)
  const b = s * Math.sin(theta)
  return { a, b, tx: ct.x - (a * cf.x - b * cf.y), ty: ct.y - (b * cf.x + a * cf.y) }
}

export interface PoseFrame {
  landmarks: PoseLandmarks
  /** Size of the image the normalized landmarks refer to. */
  width: number
  height: number
  /** Where that image's origin sits in the coordinates we want (e.g. minus the crop offset). */
  offset?: Point
}

function toPx(frame: PoseFrame, name: LandmarkName): Point | null {
  const l = frame.landmarks[name]
  if (!l || (l.visibility ?? 1) < MIN_VISIBILITY) return null
  return { x: l.x * frame.width + (frame.offset?.x ?? 0), y: l.y * frame.height + (frame.offset?.y ?? 0) }
}

/**
 * Pose-based placement: the landmarks visible in both photos, matched by least squares. Null when
 * too few match or the result is implausible (then use alignByBox).
 */
export function alignByLandmarks(garment: PoseFrame, base: PoseFrame, names: LandmarkName[]): Similarity | null {
  const from: Point[] = []
  const to: Point[] = []
  for (const name of names) {
    const f = toPx(garment, name)
    const t = toPx(base, name)
    if (f && t) {
      from.push(f)
      to.push(t)
    }
  }
  const s = fitSimilarity(from, to)
  if (!s) return null
  const scale = scaleOf(s)
  return scale >= AUTO_SCALE_RANGE[0] && scale <= AUTO_SCALE_RANGE[1] ? s : null
}

/**
 * Fallback placement without pose: fits the cut-out (size w×h) into the body region for its kind,
 * given as fractions of the base person's bounding box. Keeps the aspect ratio, centers it
 * horizontally and aligns its top with the region's top.
 */
export function alignByBox(
  cutout: { w: number; h: number },
  person: Box,
  region: { top: number; bottom: number; width: number },
): Similarity {
  const rw = person.w * region.width
  const rh = person.h * (region.bottom - region.top)
  const s = Math.min(rw / cutout.w, rh / cutout.h)
  const cx = person.x + person.w / 2
  const top = person.y + person.h * region.top
  return { a: s, b: 0, tx: cx - (cutout.w * s) / 2, ty: top }
}

/**
 * Splits a placement into what is stored (SPEC §5): `bbox`, the auto placement without rotation, and
 * `transform`, the fine-tune on top of it (offset of the center, extra scale, rotation).
 */
export function placementToLayer(
  placement: Similarity,
  auto: Similarity,
  cutout: { w: number; h: number },
): Pick<GarmentLayer, 'bbox' | 'transform'> {
  const autoScale = scaleOf(auto)
  const autoCenter = apply(auto, { x: cutout.w / 2, y: cutout.h / 2 })
  const w = cutout.w * autoScale
  const h = cutout.h * autoScale
  const bbox = { x: autoCenter.x - w / 2, y: autoCenter.y - h / 2, w, h }
  const center = apply(placement, { x: cutout.w / 2, y: cutout.h / 2 })
  const transform: Transform = {
    dx: center.x - autoCenter.x,
    dy: center.y - autoCenter.y,
    scale: scaleOf(placement) / autoScale,
    rotation: rotationOf(placement),
  }
  return { bbox, transform }
}

/**
 * The matrix that draws a stored layer: its image stretched over `bbox`, then rotated and scaled
 * about the bbox center by `transform` and moved by (dx, dy). Maps image pixels (size imgW×imgH) to
 * base-view pixels. Outfits (Phase 4) compose their own override on top of this.
 */
export function layerToSimilarity(
  layer: Pick<GarmentLayer, 'bbox' | 'transform'>,
  imgW: number,
  imgH: number,
): Similarity {
  const { bbox, transform: t } = layer
  const center = { x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h / 2 }
  // Stretch: image → bbox (uniform; bbox keeps the image aspect ratio).
  const s0 = bbox.w / imgW
  const place: Similarity = { a: s0, b: 0, tx: center.x - (imgW * s0) / 2, ty: center.y - (imgH * s0) / 2 }
  const fineTune = about(center, t.scale, t.rotation, t.dx, t.dy)
  return compose(fineTune, place)
}

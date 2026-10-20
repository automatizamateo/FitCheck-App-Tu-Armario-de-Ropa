// Cheap edge cleanup for a coarse person mask, with no second neural model: morphological close/open,
// a small blur-and-threshold, and a guided filter that pulls the contour onto edges in the photo.
// Runs on a downscaled copy; only pixels near the original edge may change.

import { blendBoundary, cleanupMask, dilate, erode } from './ops'
import { resizeBilinearToUint8, resizeMask } from './resample'

/** Long side the cleanup works at. */
export const EDGE_WORK_SIDE = 512

export interface Guide {
  data: Float32Array // luminance 0–1, row-major
  width: number
  height: number
}

/** Mean over a (2r+1)² window, edges clamped. O(n) per pass. */
export function boxFilter(src: Float32Array, width: number, height: number, r: number): Float32Array {
  if (r <= 0) return src.slice()
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  const size = 2 * r + 1
  const cx = (x: number) => (x < 0 ? 0 : x >= width ? width - 1 : x)
  const cy = (y: number) => (y < 0 ? 0 : y >= height ? height - 1 : y)
  for (let y = 0; y < height; y++) {
    const row = y * width
    let sum = 0
    for (let x = -r; x <= r; x++) sum += src[row + cx(x)] ?? 0
    for (let x = 0; x < width; x++) {
      tmp[row + x] = sum / size
      sum += (src[row + cx(x + r + 1)] ?? 0) - (src[row + cx(x - r)] ?? 0)
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0
    for (let y = -r; y <= r; y++) sum += tmp[cy(y) * width + x] ?? 0
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum / size
      sum += (tmp[cy(y + r + 1) * width + x] ?? 0) - (tmp[cy(y - r) * width + x] ?? 0)
    }
  }
  return out
}

/**
 * Grey-guide guided filter (He et al.): smooths `p` while keeping edges where the guide has them.
 * Where the guide is flat (variance well below eps) the output is just a blur of `p`.
 */
export function guidedFilter(guide: Float32Array, p: Float32Array, width: number, height: number, r: number, eps: number): Float32Array {
  const n = guide.length
  const ip = new Float32Array(n)
  const ii = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const g = guide[i] ?? 0
    ip[i] = g * (p[i] ?? 0)
    ii[i] = g * g
  }
  const meanI = boxFilter(guide, width, height, r)
  const meanP = boxFilter(p, width, height, r)
  const corrIP = boxFilter(ip, width, height, r)
  const corrII = boxFilter(ii, width, height, r)
  const a = new Float32Array(n)
  const b = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const mi = meanI[i] ?? 0
    const mp = meanP[i] ?? 0
    const ai = ((corrIP[i] ?? 0) - mi * mp) / ((corrII[i] ?? 0) - mi * mi + eps)
    a[i] = ai
    b[i] = mp - ai * mi
  }
  const meanA = boxFilter(a, width, height, r)
  const meanB = boxFilter(b, width, height, r)
  const q = new Float32Array(n)
  for (let i = 0; i < n; i++) q[i] = (meanA[i] ?? 0) * (guide[i] ?? 0) + (meanB[i] ?? 0)
  return q
}

/** Closing (dilate then erode): fills notches and gaps narrower than ~2r. */
export function morphClose(mask: Uint8Array, width: number, height: number, r: number): Uint8Array {
  return erode(dilate(mask, width, height, r), width, height, r)
}

/** Opening (erode then dilate): removes spurs and bridges thinner than ~2r. */
export function morphOpen(mask: Uint8Array, width: number, height: number, r: number): Uint8Array {
  return dilate(erode(mask, width, height, r), width, height, r)
}

/**
 * Smooths and snaps the contour of a full-resolution 0/1 mask. `guide` is the photo's luminance at a
 * reduced size (≤ EDGE_WORK_SIDE); without it only the morphology and blur steps run.
 */
export function smoothMaskEdges(mask: Uint8Array, width: number, height: number, guide: Guide | null): Uint8Array {
  const scale = Math.min(1, EDGE_WORK_SIDE / Math.max(width, height))
  const sw = guide?.width ?? Math.max(1, Math.round(width * scale))
  const sh = guide?.height ?? Math.max(1, Math.round(height * scale))
  const side = Math.max(sw, sh)

  // 1. Morphology at the small size: close small gaps, then remove thin spurs.
  const morphR = Math.max(1, Math.round(side * 0.004))
  let small = resizeMask(mask, width, height, sw, sh)
  small = morphOpen(morphClose(small, sw, sh, morphR), sw, sh, morphR)

  // 2. Blur-and-threshold (via the guided filter, or a plain blur without a guide).
  let p: Float32Array = new Float32Array(small.length)
  for (let i = 0; i < small.length; i++) p[i] = small[i] ? 1 : 0
  p = boxFilter(p, sw, sh, 1)
  const soft = guide ? guidedFilter(guide.data, p, sw, sh, Math.max(2, Math.round(side * 0.016)), 1e-3) : p

  // 3. Back to full size; the threshold happens after upsampling so the contour stays smooth.
  const up = resizeBilinearToUint8(soft, sw, sh, width, height)
  const fine = new Uint8Array(up.length)
  for (let i = 0; i < up.length; i++) fine[i] = (up[i] ?? 0) >= 128 ? 1 : 0

  // 4. Only let it move the contour a little: the coarse mask decides everything else.
  const band = Math.max(2, Math.round(Math.max(width, height) * 0.008))
  return cleanupMask(blendBoundary(mask, fine, width, height, band), width, height)
}

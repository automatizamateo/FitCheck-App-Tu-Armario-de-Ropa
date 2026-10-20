/**
 * For per-pixel logits laid out [C, h, w], returns the softmax probability that each pixel
 * belongs to any of `classes`.
 */
export function groupProbability(
  logits: Float32Array,
  channels: number,
  width: number,
  height: number,
  classes: readonly number[],
): Float32Array {
  const n = width * height
  const out = new Float32Array(n)
  const inGroup = new Uint8Array(channels)
  for (const c of classes) if (c >= 0 && c < channels) inGroup[c] = 1
  for (let p = 0; p < n; p++) {
    let max = -Infinity
    for (let c = 0; c < channels; c++) max = Math.max(max, logits[c * n + p] ?? -Infinity)
    let total = 0
    let group = 0
    for (let c = 0; c < channels; c++) {
      const e = Math.exp((logits[c * n + p] ?? -Infinity) - max)
      total += e
      if (inGroup[c]) group += e
    }
    out[p] = total > 0 ? group / total : 0
  }
  return out
}

/** Bilinear resize (align_corners = false) of a [0,1] map to a 0–255 Uint8Array. */
export function resizeBilinearToUint8(
  src: Float32Array,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): Uint8Array {
  const out = new Uint8Array(dw * dh)
  const sx = sw / dw
  const sy = sh / dh
  for (let y = 0; y < dh; y++) {
    const fy = Math.min(Math.max((y + 0.5) * sy - 0.5, 0), sh - 1)
    const y0 = Math.floor(fy)
    const y1 = Math.min(y0 + 1, sh - 1)
    const wy = fy - y0
    for (let x = 0; x < dw; x++) {
      const fx = Math.min(Math.max((x + 0.5) * sx - 0.5, 0), sw - 1)
      const x0 = Math.floor(fx)
      const x1 = Math.min(x0 + 1, sw - 1)
      const wx = fx - x0
      const top = (src[y0 * sw + x0] ?? 0) * (1 - wx) + (src[y0 * sw + x1] ?? 0) * wx
      const bottom = (src[y1 * sw + x0] ?? 0) * (1 - wx) + (src[y1 * sw + x1] ?? 0) * wx
      out[y * dw + x] = Math.round(255 * Math.min(1, Math.max(0, top * (1 - wy) + bottom * wy)))
    }
  }
  return out
}

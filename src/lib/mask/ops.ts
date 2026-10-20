// Binary masks are Uint8Array with 0 (out) / 1 (in), row-major, width × height.

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export function threshold(values: Uint8Array, t = 128): Uint8Array {
  const out = new Uint8Array(values.length)
  for (let i = 0; i < values.length; i++) out[i] = (values[i] ?? 0) >= t ? 1 : 0
  return out
}

export function invert(mask: Uint8Array): Uint8Array {
  const out = new Uint8Array(mask.length)
  for (let i = 0; i < mask.length; i++) out[i] = mask[i] ? 0 : 1
  return out
}

/**
 * Chamfer (3-4) distance from every pixel to the nearest pixel where mask = 1, in pixels (approx. Euclidean).
 * Two passes, O(n).
 */
export function distanceToMask(mask: Uint8Array, width: number, height: number): Float32Array {
  const INF = 1e9
  const d = new Float32Array(width * height)
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : INF
  const at = (x: number, y: number) => d[y * width + x] ?? INF
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      let v = d[i] ?? INF
      if (v === 0) continue
      if (x > 0) v = Math.min(v, at(x - 1, y) + 3)
      if (y > 0) {
        v = Math.min(v, at(x, y - 1) + 3)
        if (x > 0) v = Math.min(v, at(x - 1, y - 1) + 4)
        if (x < width - 1) v = Math.min(v, at(x + 1, y - 1) + 4)
      }
      d[i] = v
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x
      let v = d[i] ?? INF
      if (v === 0) continue
      if (x < width - 1) v = Math.min(v, at(x + 1, y) + 3)
      if (y < height - 1) {
        v = Math.min(v, at(x, y + 1) + 3)
        if (x < width - 1) v = Math.min(v, at(x + 1, y + 1) + 4)
        if (x > 0) v = Math.min(v, at(x - 1, y + 1) + 4)
      }
      d[i] = v
    }
  }
  for (let i = 0; i < d.length; i++) d[i] = (d[i] ?? INF) / 3
  return d
}

export function dilate(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return mask.slice()
  const dist = distanceToMask(mask, width, height)
  const out = new Uint8Array(mask.length)
  for (let i = 0; i < out.length; i++) out[i] = (dist[i] ?? Infinity) <= radius ? 1 : 0
  return out
}

export function erode(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  return invert(dilate(invert(mask), width, height, radius))
}

/**
 * Removes 4-connected regions of `value` smaller than minArea by flipping them.
 * value = 1 removes specks; value = 0 fills small holes.
 */
export function removeSmallRegions(
  mask: Uint8Array,
  width: number,
  _height: number,
  minArea: number,
  value: 0 | 1 = 1,
): Uint8Array {
  const out = mask.slice()
  const seen = new Uint8Array(mask.length)
  const stack: number[] = []
  const region: number[] = []
  for (let start = 0; start < out.length; start++) {
    if (seen[start] || (out[start] ?? 0) !== value) continue
    region.length = 0
    stack.push(start)
    seen[start] = 1
    while (stack.length) {
      const i = stack.pop() ?? 0
      region.push(i)
      const x = i % width
      const neighbors = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width]
      for (const n of neighbors) {
        if (n < 0 || n >= out.length || seen[n] || (out[n] ?? 0) !== value) continue
        seen[n] = 1
        stack.push(n)
      }
    }
    if (region.length < minArea) for (const i of region) out[i] = value ? 0 : 1
  }
  return out
}

/** Removes specks and fills pinholes, each smaller than the given fraction of the image. */
export function cleanupMask(mask: Uint8Array, width: number, height: number, minFraction = 0.002): Uint8Array {
  const minArea = Math.max(1, Math.round(width * height * minFraction))
  return removeSmallRegions(removeSmallRegions(mask, width, height, minArea, 1), width, height, minArea, 0)
}

/** Soft alpha (0–255) from a binary mask with a box blur of the given radius in pixels. */
export function featherAlpha(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const alpha = new Uint8Array(mask.length)
  if (radius <= 0) {
    for (let i = 0; i < mask.length; i++) alpha[i] = mask[i] ? 255 : 0
    return alpha
  }
  const r = Math.round(radius)
  const tmp = new Float32Array(mask.length)
  const size = 2 * r + 1
  for (let y = 0; y < height; y++) {
    let sum = 0
    for (let x = -r; x <= r; x++) sum += mask[y * width + clamp(x, 0, width - 1)] ?? 0
    for (let x = 0; x < width; x++) {
      tmp[y * width + x] = sum / size
      sum += (mask[y * width + clamp(x + r + 1, 0, width - 1)] ?? 0) - (mask[y * width + clamp(x - r, 0, width - 1)] ?? 0)
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0
    for (let y = -r; y <= r; y++) sum += tmp[clamp(y, 0, height - 1) * width + x] ?? 0
    for (let y = 0; y < height; y++) {
      alpha[y * width + x] = Math.round((255 * sum) / size)
      sum +=
        (tmp[clamp(y + r + 1, 0, height - 1) * width + x] ?? 0) - (tmp[clamp(y - r, 0, height - 1) * width + x] ?? 0)
    }
  }
  return alpha
}

export function boundingBox(mask: Uint8Array, width: number, height: number): Box | null {
  let x0 = width
  let y0 = height
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

export function area(mask: Uint8Array): number {
  let n = 0
  for (const v of mask) n += v ? 1 : 0
  return n
}

export function iou(a: Uint8Array, b: Uint8Array): number {
  let inter = 0
  let union = 0
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ? 1 : 0
    const bv = b[i] ? 1 : 0
    inter += av & bv
    union += av | bv
  }
  return union === 0 ? 1 : inter / union
}

/**
 * Trusts `coarse` away from its edges and `fine` only within `band` pixels of the coarse edge.
 * Lets an edge refiner fix contours without being able to add or remove whole regions.
 */
export function blendBoundary(
  coarse: Uint8Array,
  fine: Uint8Array,
  width: number,
  height: number,
  band: number,
): Uint8Array {
  const inner = erode(coarse, width, height, band)
  const outer = dilate(coarse, width, height, band)
  const out = new Uint8Array(coarse.length)
  for (let i = 0; i < out.length; i++) out[i] = inner[i] ? 1 : outer[i] ? (fine[i] ? 1 : 0) : 0
  return out
}

export interface PromptPoints {
  positive: [number, number][]
  negative: [number, number][]
}

/**
 * Picks prompt points for a point-prompted segmenter (SAM): positives deep inside the mask spread
 * vertically, negatives in the background just outside the object.
 */
export function samplePromptPoints(mask: Uint8Array, width: number, height: number, count = 6): PromptPoints {
  const box = boundingBox(mask, width, height)
  if (!box) return { positive: [], negative: [] }
  const inside = distanceToMask(invert(mask), width, height) // distance to nearest background
  const positive: [number, number][] = []
  for (let k = 0; k < count; k++) {
    const y = Math.round(box.y + ((k + 0.5) / count) * box.h)
    let best = -1
    let bestD = 0
    for (let x = box.x; x < box.x + box.w; x++) {
      const d = inside[y * width + x] ?? 0
      if (mask[y * width + x] && d > bestD) {
        bestD = d
        best = x
      }
    }
    if (best >= 0 && bestD >= 2) positive.push([best, y])
  }
  const margin = Math.max(4, Math.round(0.04 * Math.max(box.w, box.h)))
  const candidates: [number, number][] = [
    [box.x - margin, box.y + box.h / 2],
    [box.x + box.w - 1 + margin, box.y + box.h / 2],
    [box.x + box.w / 2, box.y - margin],
    [box.x - margin, box.y + box.h * 0.15],
    [box.x + box.w - 1 + margin, box.y + box.h * 0.15],
  ]
  const negative = candidates
    .map(([x, y]) => [Math.round(clamp(x, 0, width - 1)), Math.round(clamp(y, 0, height - 1))] as [number, number])
    .filter(([x, y]) => !mask[y * width + x])
  return { positive, negative }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

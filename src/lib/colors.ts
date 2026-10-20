// Dominant named colors of a cut-out, for the auto-suggested colors on an item (SPEC §4).

export interface Swatch {
  name: string
  hex: string
}

type Lab = [number, number, number]

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** sRGB (0–255) → CIE L*a*b* (D65), where plain distances roughly match how different colors look. */
export function rgbToLab(r: number, g: number, b: number): Lab {
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const R = lin(r)
  const G = lin(g)
  const B = lin(b)
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const fx = f(x)
  const fy = f(y)
  const fz = f(z)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/**
 * Names of the palette colors covering the most of the opaque pixels (alpha ≥ 128) in `rgba`, most
 * common first. A color must cover at least `minShare` of them; at most `max` are returned, and the
 * most common one always is (if there are any opaque pixels).
 */
export function dominantColors(
  rgba: Uint8ClampedArray | Uint8Array,
  palette: readonly Swatch[],
  max = 3,
  minShare = 0.15,
): string[] {
  const labs = palette.map((s) => rgbToLab(...hexToRgb(s.hex)))
  const counts = new Array<number>(palette.length).fill(0)
  const cache = new Map<number, number>()
  let total = 0
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if ((rgba[i + 3] ?? 0) < 128) continue
    // Quantize to 5 bits per channel so repeated shades are classified once.
    const key = ((rgba[i] ?? 0) >> 3) * 1024 + ((rgba[i + 1] ?? 0) >> 3) * 32 + ((rgba[i + 2] ?? 0) >> 3)
    let best = cache.get(key)
    if (best === undefined) {
      const lab = rgbToLab(rgba[i] ?? 0, rgba[i + 1] ?? 0, rgba[i + 2] ?? 0)
      let bestD = Infinity
      best = 0
      for (let p = 0; p < labs.length; p++) {
        const q = labs[p] as Lab
        const d = (lab[0] - q[0]) ** 2 + (lab[1] - q[1]) ** 2 + (lab[2] - q[2]) ** 2
        if (d < bestD) {
          bestD = d
          best = p
        }
      }
      cache.set(key, best)
    }
    counts[best] = (counts[best] ?? 0) + 1
    total++
  }
  if (total === 0) return []
  const ranked = counts
    .map((count, i) => ({ name: palette[i]?.name ?? '', share: count / total }))
    .filter((c) => c.share > 0)
    .sort((a, b) => b.share - a.share)
  return ranked
    .filter((c, i) => i === 0 || c.share >= minShare)
    .slice(0, max)
    .map((c) => c.name)
}

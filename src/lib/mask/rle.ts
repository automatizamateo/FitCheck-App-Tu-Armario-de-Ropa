/**
 * Run-length encoding for binary masks (any non-zero = 1). Runs alternate, starting with a run of 0s
 * (possibly empty). A 1200×900 person mask shrinks from ~1 MB to a few KB, which keeps 20+ undo
 * steps cheap on iPhone.
 */
export function encodeRLE(mask: Uint8Array): Uint32Array {
  const runs: number[] = []
  let current = 0
  let length = 0
  for (const v of mask) {
    const bit = v ? 1 : 0
    if (bit === current) {
      length++
    } else {
      runs.push(length)
      current = bit
      length = 1
    }
  }
  runs.push(length)
  return Uint32Array.from(runs)
}

export function decodeRLE(runs: Uint32Array, size: number, on = 1): Uint8Array {
  const out = new Uint8Array(size)
  let pos = 0
  let bit = 0
  for (const run of runs) {
    if (bit) out.fill(on, pos, Math.min(size, pos + run))
    pos += run
    bit ^= 1
  }
  return out
}

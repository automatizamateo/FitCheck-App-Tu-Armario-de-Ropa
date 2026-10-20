import { decodeRLE, encodeRLE } from './rle'

/** One edit: the XOR of before/after inside the changed bounding box, run-length encoded. */
interface Diff {
  x: number
  y: number
  w: number
  h: number
  runs: Uint32Array
}

const DIFF_OVERHEAD_BYTES = 64

/**
 * Undo/redo for a 0/1 mask that stores only what each edit changed. XOR is its own inverse, so one
 * diff serves both undo and redo. Total diff memory is capped at `maxBytes`; the oldest steps are
 * dropped first. A brush stroke on a 1200 px mask usually costs well under 1 KB.
 */
export class MaskHistory {
  readonly width: number
  readonly height: number
  private readonly mask: Uint8Array
  private undos: Diff[] = []
  private redos: Diff[] = []
  private readonly maxBytes: number

  constructor(initial: Uint8Array, width: number, height: number, maxBytes = 2_000_000) {
    this.width = width
    this.height = height
    this.mask = initial.slice()
    this.maxBytes = maxBytes
  }

  /** The current mask (a live view: copy it if you keep it). */
  get current(): Uint8Array {
    return this.mask
  }

  get canUndo(): boolean {
    return this.undos.length > 0
  }

  get canRedo(): boolean {
    return this.redos.length > 0
  }

  /** Bytes held by all undo + redo steps. */
  get bytes(): number {
    return [...this.undos, ...this.redos].reduce((sum, d) => sum + d.runs.byteLength + DIFF_OVERHEAD_BYTES, 0)
  }

  /** Records `next` as a new step. Returns false (and records nothing) when it is identical. */
  commit(next: Uint8Array): boolean {
    const { width, height } = this
    let x0 = width
    let y0 = height
    let x1 = -1
    let y1 = -1
    for (let y = 0; y < height; y++) {
      const row = y * width
      for (let x = 0; x < width; x++) {
        if ((this.mask[row + x] ? 1 : 0) === (next[row + x] ? 1 : 0)) continue
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
    if (x1 < 0) return false
    const w = x1 - x0 + 1
    const h = y1 - y0 + 1
    const xor = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y0 + y) * width + x0 + x
        const after = next[i] ? 1 : 0
        xor[y * w + x] = (this.mask[i] ? 1 : 0) ^ after
        this.mask[i] = after
      }
    }
    this.undos.push({ x: x0, y: y0, w, h, runs: encodeRLE(xor) })
    this.redos = []
    while (this.undos.length > 1 && this.bytes > this.maxBytes) this.undos.shift()
    return true
  }

  undo(): Uint8Array | null {
    const d = this.undos.pop()
    if (!d) return null
    this.apply(d)
    this.redos.push(d)
    return this.mask
  }

  redo(): Uint8Array | null {
    const d = this.redos.pop()
    if (!d) return null
    this.apply(d)
    this.undos.push(d)
    return this.mask
  }

  private apply(d: Diff) {
    const xor = decodeRLE(d.runs, d.w * d.h)
    for (let y = 0; y < d.h; y++) {
      for (let x = 0; x < d.w; x++) {
        if (xor[y * d.w + x]) {
          const i = (d.y + y) * this.width + d.x + x
          this.mask[i] = this.mask[i] ? 0 : 1
        }
      }
    }
  }
}

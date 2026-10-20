import { describe, expect, it } from 'vitest'
import { groupProbability, resizeBilinearToUint8, resizeMask } from './resample'

describe('resample', () => {
  it('sums softmax probabilities over a class group', () => {
    // 3 classes, 1 pixel: logits [0, ln 2, ln 1] → softmax [1/4, 2/4, 1/4]
    const logits = Float32Array.from([0, Math.log(2), 0])
    expect(groupProbability(logits, 3, 1, 1, [1])[0]).toBeCloseTo(0.5)
    expect(groupProbability(logits, 3, 1, 1, [1, 2])[0]).toBeCloseTo(0.75)
    expect(groupProbability(logits, 3, 1, 1, [])[0]).toBe(0)
  })

  it('upsamples bilinearly with align_corners=false', () => {
    const src = Float32Array.from([0, 1]) // 2×1
    const out = resizeBilinearToUint8(src, 2, 1, 4, 1)
    expect([...out]).toEqual([0, 64, 191, 255])
  })

  it('keeps constant maps constant', () => {
    const out = resizeBilinearToUint8(new Float32Array(4).fill(1), 2, 2, 7, 5)
    expect(out.every((v) => v === 255)).toBe(true)
  })

  it('resizes a 0/1 mask down and back up without losing the shape', () => {
    const w = 40
    const h = 40
    const mask = new Uint8Array(w * h)
    for (let y = 8; y < 32; y++) for (let x = 8; x < 32; x++) mask[y * w + x] = 1
    const small = resizeMask(mask, w, h, 20, 20)
    expect(small.reduce((a, b) => a + b, 0)).toBe(12 * 12)
    const back = resizeMask(small, 20, 20, w, h)
    expect(back.every((v) => v === 0 || v === 1)).toBe(true)
    expect(back[20 * w + 20]).toBe(1)
    expect(back[2 * w + 2]).toBe(0)
  })
})

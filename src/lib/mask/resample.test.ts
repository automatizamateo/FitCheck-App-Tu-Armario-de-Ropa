import { describe, expect, it } from 'vitest'
import { groupProbability, resizeBilinearToUint8 } from './resample'

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
})

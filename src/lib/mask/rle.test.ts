import { describe, expect, it } from 'vitest'
import { decodeRLE, encodeRLE } from './rle'

describe('RLE', () => {
  it('round-trips binary masks', () => {
    const mask = Uint8Array.from([0, 0, 1, 1, 1, 0, 1, 0, 0])
    expect([...encodeRLE(mask)]).toEqual([2, 3, 1, 1, 2])
    expect([...decodeRLE(encodeRLE(mask), mask.length)]).toEqual([...mask])
  })

  it('handles masks starting with 1 and all-zero masks', () => {
    const starts = Uint8Array.from([1, 1, 0])
    expect([...encodeRLE(starts)]).toEqual([0, 2, 1])
    expect([...decodeRLE(encodeRLE(starts), 3)]).toEqual([1, 1, 0])
    expect([...decodeRLE(encodeRLE(new Uint8Array(4)), 4)]).toEqual([0, 0, 0, 0])
  })

  it('treats any non-zero value as 1 and can decode to 255', () => {
    expect([...decodeRLE(encodeRLE(Uint8Array.from([0, 255, 7])), 3, 255)]).toEqual([0, 255, 255])
  })

  it('compresses a large blob mask', () => {
    const W = 1200
    const mask = new Uint8Array(W * 900)
    for (let y = 100; y < 800; y++) mask.fill(1, y * W + 400, y * W + 800)
    expect(encodeRLE(mask).byteLength).toBeLessThan(mask.byteLength / 50)
  })
})

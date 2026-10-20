import { describe, expect, it } from 'vitest'
import { CLOTHES_LABELS } from '../ml/models'
import { CATEGORIES } from './categories'
import { ACCESSORY_TYPES } from './categories'
import { alignmentLandmarks, bodyRegion, garmentClasses, garmentKind, suggestName } from './garments'
import { COLOR_PALETTE } from './attributes'
import { dominantColors } from '../lib/colors'

const names = (classes: number[] | null) => classes?.map((i) => CLOTHES_LABELS[i])

describe('category → clothes-parsing classes (SPEC §6.3)', () => {
  it('maps tops to Upper-clothes + Dress', () => {
    for (const c of ['T-Shirts', 'Shirts', 'Sweaters & Hoodies', 'Jackets & Coats'] as const) {
      expect(names(garmentClasses(garmentKind(c)))).toEqual(['Upper-clothes', 'Dress'])
    }
  })

  it('maps bottoms, shoes, hats and scarves', () => {
    expect(names(garmentClasses(garmentKind('Pants')))).toEqual(['Pants', 'Skirt'])
    expect(names(garmentClasses(garmentKind('Shorts')))).toEqual(['Pants', 'Skirt'])
    expect(names(garmentClasses(garmentKind('Shoes')))).toEqual(['Left-shoe', 'Right-shoe'])
    expect(names(garmentClasses(garmentKind('Accessories', 'Cap / Hat')))).toEqual(['Hat'])
    expect(names(garmentClasses(garmentKind('Accessories', 'Scarf')))).toEqual(['Scarf'])
  })

  it('sends socks, necklaces and other accessories straight to the brush', () => {
    expect(garmentClasses(garmentKind('Socks'))).toBeNull()
    expect(garmentClasses(garmentKind('Accessories', 'Necklace'))).toBeNull()
    expect(garmentClasses(garmentKind('Accessories', 'Other'))).toBeNull()
    expect(garmentClasses(garmentKind('Accessories', 'Sunglasses (custom)'))).toBeNull()
  })

  it('every category and accessory type has landmarks and a body region', () => {
    const kinds = [
      ...CATEGORIES.map((c) => garmentKind(c)),
      ...ACCESSORY_TYPES.map((t) => garmentKind('Accessories', t)),
    ]
    for (const k of kinds) {
      expect(alignmentLandmarks(k).length).toBeGreaterThanOrEqual(2)
      const r = bodyRegion(k)
      expect(r.bottom).toBeGreaterThan(r.top)
    }
    expect(alignmentLandmarks(garmentKind('Shoes'))).toContain('leftAnkle')
    expect(alignmentLandmarks(garmentKind('Pants'))).toContain('leftKnee')
    expect(alignmentLandmarks(garmentKind('Accessories', 'Necklace'))).toContain('nose')
  })

  it('suggests short names', () => {
    expect(suggestName('T-Shirts', undefined, 'Navy')).toBe('Navy T-Shirt')
    expect(suggestName('Accessories', 'Cap / Hat', 'Black')).toBe('Black Cap')
    expect(suggestName('Accessories', 'Necklace', undefined)).toBe('Necklace')
  })
})

describe('dominant colors', () => {
  const pixels = (...groups: [number, number, number, number, number][]) => {
    const out: number[] = []
    for (const [r, g, b, a, n] of groups) for (let i = 0; i < n; i++) out.push(r, g, b, a)
    return Uint8ClampedArray.from(out)
  }

  it('names the main colors of the opaque pixels, most common first', () => {
    const rgba = pixels([30, 42, 70, 255, 600], [250, 250, 250, 255, 300], [200, 30, 30, 255, 50], [0, 255, 0, 0, 5000])
    expect(dominantColors(rgba, COLOR_PALETTE)).toEqual(['Navy', 'White'])
  })

  it('drops colors under the minimum share but always keeps the top one', () => {
    expect(dominantColors(pixels([17, 17, 17, 255, 95], [240, 200, 70, 255, 5]), COLOR_PALETTE)).toEqual(['Black'])
    expect(dominantColors(pixels([0, 0, 0, 0, 10]), COLOR_PALETTE)).toEqual([])
  })

  it('caps the number of colors', () => {
    const rgba = pixels(
      [255, 255, 255, 255, 25],
      [17, 17, 17, 255, 25],
      [192, 57, 43, 255, 25],
      [47, 111, 209, 255, 25],
    )
    expect(dominantColors(rgba, COLOR_PALETTE, 3)).toHaveLength(3)
  })
})

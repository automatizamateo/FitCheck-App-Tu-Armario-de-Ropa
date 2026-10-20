import { describe, expect, it } from 'vitest'
import { CATEGORIES, defaultLayer } from './categories'

describe('categories', () => {
  it('draws socks below pants, tops below jackets, and accessories on top', () => {
    expect(defaultLayer('Socks')).toBeLessThan(defaultLayer('Pants'))
    expect(defaultLayer('T-Shirts')).toBeLessThan(defaultLayer('Shirts'))
    expect(defaultLayer('Shirts')).toBeLessThan(defaultLayer('Jackets & Coats'))
    expect(Math.max(...CATEGORIES.map(defaultLayer))).toBe(defaultLayer('Accessories'))
  })

  it('has all 9 categories', () => {
    expect(CATEGORIES).toHaveLength(9)
  })
})

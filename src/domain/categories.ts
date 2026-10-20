import type { Category } from './types'

// Lower layer = drawn first (closer to the body).
export const CATEGORY_LAYERS: Readonly<Record<Category, number>> = {
  Socks: 10,
  Pants: 20,
  Shorts: 20,
  'T-Shirts': 30,
  Shirts: 35,
  'Sweaters & Hoodies': 40,
  'Jackets & Coats': 50,
  Shoes: 60,
  Accessories: 70,
}

export const CATEGORIES = Object.keys(CATEGORY_LAYERS) as Category[]

export const ACCESSORY_TYPES = ['Cap / Hat', 'Necklace', 'Scarf', 'Other'] as const

export function defaultLayer(category: Category): number {
  return CATEGORY_LAYERS[category]
}

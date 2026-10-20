import { describe, expect, it } from 'vitest'
import type { Item } from './types'
import { activeFilterCount, DAY_MS, filterItems, isUnused, NO_ITEM_FILTERS, normalize, sortItems } from './wardrobe'

const NOW = 1_000 * DAY_MS
const layer = {
  image: new Blob(),
  bbox: { x: 0, y: 0, w: 1, h: 1 },
  transform: { dx: 0, dy: 0, scale: 1, rotation: 0 },
}

function item(id: string, over: Partial<Item> = {}): Item {
  return {
    id,
    name: id,
    category: 'T-Shirts',
    styleIds: [],
    seasons: [],
    colors: [],
    favorite: false,
    layer: 30,
    views: { front: layer },
    thumbnail: new Blob(),
    createdAt: NOW - DAY_MS,
    wearCount: 0,
    ...over,
  }
}

const items = [
  item('tee', { name: 'Navy T-Shirt', brand: 'Uniqlo', colors: ['Navy'], styleIds: ['casual'], seasons: ['Summer'] }),
  item('jeans', { name: 'Black Jeans', category: 'Pants', layer: 20, brand: 'Levi’s', favorite: true }),
  item('coat', { name: 'Wool Coat', category: 'Jackets & Coats', createdAt: NOW - 200 * DAY_MS }),
  item('cap', { name: 'Café Cap', category: 'Accessories', accessoryType: 'Cap / Hat' }),
]
const ids = (list: Item[]) => list.map((i) => i.id)

describe('wardrobe filters', () => {
  it('filters by category, style, season, color and favorites', () => {
    const f = NO_ITEM_FILTERS
    expect(ids(filterItems(items, { ...f, category: 'Pants' }, NOW, 60))).toEqual(['jeans'])
    expect(ids(filterItems(items, { ...f, styleId: 'casual' }, NOW, 60))).toEqual(['tee'])
    expect(ids(filterItems(items, { ...f, season: 'Summer' }, NOW, 60))).toEqual(['tee'])
    expect(ids(filterItems(items, { ...f, color: 'Navy' }, NOW, 60))).toEqual(['tee'])
    expect(ids(filterItems(items, { ...f, favorites: true }, NOW, 60))).toEqual(['jeans'])
    expect(ids(filterItems(items, f, NOW, 60))).toEqual(ids(items))
  })

  it('searches name, brand and accessory type, ignoring case and accents, all words', () => {
    const q = (query: string) => ids(filterItems(items, { ...NO_ITEM_FILTERS, query }, NOW, 60))
    expect(q('uniqlo')).toEqual(['tee'])
    expect(q('cafe')).toEqual(['cap'])
    expect(q('  BLACK jeans ')).toEqual(['jeans'])
    expect(q('black coat')).toEqual([])
    expect(q('hat')).toEqual(['cap'])
    expect(normalize('Ça Va')).toBe('ca va')
  })

  it('unused = not worn for more than the threshold, or never worn and added before it', () => {
    expect(isUnused({ createdAt: NOW - 61 * DAY_MS }, NOW, 60)).toBe(true)
    expect(isUnused({ createdAt: NOW - 59 * DAY_MS }, NOW, 60)).toBe(false)
    expect(isUnused({ createdAt: NOW - 300 * DAY_MS, lastWornAt: NOW - 10 * DAY_MS }, NOW, 60)).toBe(false)
    expect(isUnused({ createdAt: NOW - 300 * DAY_MS, lastWornAt: NOW - 90 * DAY_MS }, NOW, 60)).toBe(true)
    expect(ids(filterItems(items, { ...NO_ITEM_FILTERS, unused: true }, NOW, 60))).toEqual(['coat'])
  })

  it('counts the filters behind the Filters button', () => {
    expect(activeFilterCount(NO_ITEM_FILTERS)).toBe(0)
    expect(activeFilterCount({ ...NO_ITEM_FILTERS, category: 'Pants', query: 'x' })).toBe(0)
    expect(activeFilterCount({ ...NO_ITEM_FILTERS, color: 'Red', favorites: true, unused: true })).toBe(3)
  })
})

describe('wardrobe sorting', () => {
  const list = [
    item('a', { createdAt: 1, wearCount: 5, lastWornAt: 50 }),
    item('b', { createdAt: 3, wearCount: 0 }),
    item('c', { createdAt: 2, wearCount: 5, lastWornAt: 90 }),
    item('d', { createdAt: 4, wearCount: 1, lastWornAt: 10 }),
  ]

  it('newest first', () => {
    expect(ids(sortItems(list, 'newest'))).toEqual(['d', 'b', 'c', 'a'])
  })
  it('most worn, ties by most recently worn', () => {
    expect(ids(sortItems(list, 'mostWorn'))).toEqual(['c', 'a', 'd', 'b'])
  })
  it('least worn, ties by oldest', () => {
    expect(ids(sortItems(list, 'leastWorn'))).toEqual(['b', 'd', 'a', 'c'])
  })
  it('last worn first, never worn last', () => {
    expect(ids(sortItems(list, 'lastWorn'))).toEqual(['c', 'a', 'd', 'b'])
  })
  it('does not change the input', () => {
    sortItems(list, 'newest')
    expect(ids(list)).toEqual(['a', 'b', 'c', 'd'])
  })
})

import { describe, expect, it } from 'vitest'
import { apply, compose, type Point } from '../lib/gesture/similarity'
import {
  layerCenter,
  layerToSimilarity,
  outfitLayerMatrix,
  overrideToSimilarity,
  similarityToOverride,
} from '../lib/align'
import {
  canMoveLayer,
  duplicateOutfit,
  effectiveLayer,
  filterOutfits,
  layerOrder,
  moveLayer,
  NO_OUTFIT_FILTERS,
  planItemDelete,
  removeItem,
  resetTransform,
  setTransform,
  toggleItem,
  type OutfitContent,
} from './outfits'
import type { Category, Outfit } from './types'

const it_ = (id: string, category: Category, layer?: number) => ({
  id,
  category,
  layer:
    layer ??
    {
      Socks: 10,
      Pants: 20,
      Shorts: 20,
      'T-Shirts': 30,
      Shirts: 35,
      'Sweaters & Hoodies': 40,
      'Jackets & Coats': 50,
      Shoes: 60,
      Accessories: 70,
    }[category],
})
const tee = it_('tee', 'T-Shirts')
const shirt = it_('shirt', 'Shirts')
const jacket = it_('jacket', 'Jackets & Coats')
const jeans = it_('jeans', 'Pants')
const shorts = it_('shorts', 'Shorts')
const shoes = it_('shoes', 'Shoes')
const sneakers = it_('sneakers', 'Shoes')
const cap = it_('cap', 'Accessories')
const chain = it_('chain', 'Accessories')
const all = [tee, shirt, jacket, jeans, shorts, shoes, sneakers, cap, chain]

const empty: OutfitContent = { itemIds: [], overrides: {} }
const build = (...ids: string[]): OutfitContent => ({ itemIds: ids, overrides: {} })

describe('picking items', () => {
  it('adds, and removes when tapped again', () => {
    const a = toggleItem(empty, tee, all)
    expect(a).toMatchObject({ added: true, replaced: [] })
    expect(a.content.itemIds).toEqual(['tee'])
    expect(toggleItem(a.content, tee, all)).toMatchObject({ added: false, content: { itemIds: [] } })
  })

  it('swaps single-slot items (shoes; pants and shorts share a slot) and drops their overrides', () => {
    let c = build('jeans', 'shoes')
    c = setTransform(c, 'shoes', 'front', { dx: 5, dy: 0, scale: 1, rotation: 0 })
    const r = toggleItem(c, sneakers, all)
    expect(r.replaced).toEqual(['shoes'])
    expect(r.content.itemIds).toEqual(['jeans', 'sneakers'])
    expect(r.content.overrides).toEqual({})
    expect(toggleItem(r.content, shorts, all).content.itemIds).toEqual(['sneakers', 'shorts'])
  })

  it('stacks layered tops and accessories', () => {
    let c = empty
    for (const i of [tee, shirt, jacket, cap, chain]) c = toggleItem(c, i, all).content
    expect(c.itemIds).toEqual(['tee', 'shirt', 'jacket', 'cap', 'chain'])
  })
})

describe('layer order', () => {
  it('sorts by outfit override, then item layer, then category default; ties keep insertion order', () => {
    const c = build('cap', 'jacket', 'tee', 'jeans', 'shoes')
    expect(layerOrder(c, all, 'front')).toEqual(['jeans', 'tee', 'jacket', 'shoes', 'cap'])
    const custom = [...all.filter((i) => i.id !== 'tee'), { ...tee, layer: 55 }]
    expect(layerOrder(c, custom, 'front')).toEqual(['jeans', 'jacket', 'tee', 'shoes', 'cap'])
    const broken = [...all.filter((i) => i.id !== 'tee'), { ...tee, layer: Number.NaN }]
    expect(effectiveLayer(c, broken[broken.length - 1] ?? tee, 'front')).toBe(30)
    expect(layerOrder(build('shorts', 'jeans'), all, 'front')).toEqual(['shorts', 'jeans'])
  })

  it('ignores ids of items that no longer exist', () => {
    expect(layerOrder(build('ghost', 'tee'), all, 'front')).toEqual(['tee'])
  })

  it('bring forward / send backward swap neighbours in one view only', () => {
    const c = build('tee', 'jacket', 'jeans')
    const tucked = moveLayer(c, all, 'front', 'tee', 1) // tee over the jacket
    expect(layerOrder(tucked, all, 'front')).toEqual(['jeans', 'jacket', 'tee'])
    expect(layerOrder(tucked, all, 'back')).toEqual(['jeans', 'tee', 'jacket'])
    expect(layerOrder(moveLayer(tucked, all, 'front', 'tee', -1), all, 'front')).toEqual(['jeans', 'tee', 'jacket'])
  })

  it('keeps the order strict with equal layers and leaves room for items added later', () => {
    const c = moveLayer(build('jeans', 'shorts'), all, 'front', 'jeans', 1)
    expect(layerOrder(c, all, 'front')).toEqual(['shorts', 'jeans'])
    const withTee = { ...c, itemIds: [...c.itemIds, 'tee', 'shoes'] }
    expect(layerOrder(withTee, all, 'front')).toEqual(['shorts', 'jeans', 'tee', 'shoes'])
  })

  it('cannot move past the ends', () => {
    const c = build('tee', 'jacket')
    expect(canMoveLayer(c, all, 'front', 'jacket', 1)).toBe(false)
    expect(canMoveLayer(c, all, 'front', 'jacket', -1)).toBe(true)
    expect(canMoveLayer(c, all, 'front', 'ghost', -1)).toBe(false)
    expect(moveLayer(c, all, 'front', 'jacket', 1)).toBe(c)
  })
})

describe('per-view overrides', () => {
  it('stores a transform per view, keeps the layer on reset, and drops identity overrides', () => {
    let c = build('tee', 'jacket')
    c = setTransform(c, 'tee', 'side', { dx: 3, dy: 4, scale: 1.1, rotation: 0.1 })
    expect(c.overrides.tee?.side).toMatchObject({ dx: 3, scale: 1.1 })
    expect(c.overrides.tee?.front).toBeUndefined()
    expect(resetTransform(c, 'tee', 'side').overrides).toEqual({})
    c = moveLayer(c, all, 'side', 'tee', 1)
    const reset = resetTransform(c, 'tee', 'side')
    expect(reset.overrides.tee?.side).toEqual({
      dx: 0,
      dy: 0,
      scale: 1,
      rotation: 0,
      layer: expect.any(Number) as number,
    })
    expect(layerOrder(reset, all, 'side')).toEqual(['jacket', 'tee'])
  })

  it('removing an item drops its overrides', () => {
    const c = setTransform(build('tee', 'cap'), 'cap', 'front', { dx: 1, dy: 0, scale: 1, rotation: 0 })
    expect(removeItem(c, 'cap')).toEqual({ itemIds: ['tee'], overrides: {} })
  })
})

describe('override math', () => {
  const layer = { bbox: { x: 100, y: 200, w: 300, h: 150 }, transform: { dx: 10, dy: -5, scale: 1.2, rotation: 0.2 } }
  const close = (p: Point, q: Point) => {
    expect(p.x).toBeCloseTo(q.x, 6)
    expect(p.y).toBeCloseTo(q.y, 6)
  }

  it('layerCenter is where the item matrix puts the image center', () => {
    close(apply(layerToSimilarity(layer, 600, 300), { x: 300, y: 150 }), layerCenter(layer))
  })

  it('override ↔ matrix round-trips', () => {
    const c = layerCenter(layer)
    const o = { dx: -12, dy: 7, scale: 0.85, rotation: -0.4 }
    const back = similarityToOverride(overrideToSimilarity(o, c), c)
    expect(back.dx).toBeCloseTo(o.dx)
    expect(back.dy).toBeCloseTo(o.dy)
    expect(back.scale).toBeCloseTo(o.scale)
    expect(back.rotation).toBeCloseTo(o.rotation)
  })

  it('an override scales/rotates about the layer center and then moves it', () => {
    const o = { dx: 20, dy: 30, scale: 2, rotation: Math.PI / 2 }
    const m = outfitLayerMatrix(layer, 600, 300, o)
    const c = layerCenter(layer)
    close(apply(m, { x: 300, y: 150 }), { x: c.x + 20, y: c.y + 30 })
    expect(outfitLayerMatrix(layer, 600, 300)).toEqual(layerToSimilarity(layer, 600, 300))
  })

  it('a gesture composed onto an override converts back to the same drawing', () => {
    const c = layerCenter(layer)
    const o = { dx: 5, dy: 5, scale: 1.1, rotation: 0.05 }
    const gesture = { a: 0.9, b: 0.1, tx: 12, ty: -8 }
    const next = similarityToOverride(compose(gesture, overrideToSimilarity(o, c)), c)
    const p = { x: 42, y: 17 }
    close(
      apply(outfitLayerMatrix(layer, 600, 300, next), p),
      apply(compose(gesture, outfitLayerMatrix(layer, 600, 300, o)), p),
    )
  })
})

function outfit(id: string, itemIds: string[], over: Partial<Outfit> = {}): Outfit {
  return {
    id,
    name: id,
    itemIds,
    overrides: Object.fromEntries(itemIds.map((i) => [i, { front: { dx: 1, dy: 0, scale: 1, rotation: 0 } }])),
    styleIds: [],
    seasons: [],
    favorite: false,
    thumbnail: new Blob(),
    createdAt: 1,
    updatedAt: 1,
    ...over,
  }
}

describe('deleting an item (SPEC §5)', () => {
  it('removes it from outfits, and outfits left empty are deleted', () => {
    const plan = planItemDelete(
      [outfit('o1', ['tee', 'jeans']), outfit('o2', ['tee']), outfit('o3', ['jeans'])],
      'tee',
      99,
    )
    expect(plan.updated.map((o) => [o.id, o.itemIds, Object.keys(o.overrides), o.updatedAt])).toEqual([
      ['o1', ['jeans'], ['jeans'], 99],
    ])
    expect(plan.deleted.map((o) => o.id)).toEqual(['o2'])
  })
})

describe('outfits gallery', () => {
  const list = [
    outfit('work', ['shirt', 'jeans'], { name: 'Office day', styleIds: ['smart'], occasion: 'Work', updatedAt: 3 }),
    outfit('beach', ['tee', 'shorts'], { seasons: ['Summer'], favorite: true, occasion: 'weekend', updatedAt: 5 }),
    outfit('date', ['shirt', 'jacket'], { styleIds: ['smart', 'elegant'], occasion: 'Date', updatedAt: 4 }),
  ]
  const ids = (f: Partial<typeof NO_OUTFIT_FILTERS>) =>
    filterOutfits(list, { ...NO_OUTFIT_FILTERS, ...f }).map((o) => o.id)

  it('lists most recently updated first', () => {
    expect(ids({})).toEqual(['beach', 'date', 'work'])
  })
  it('filters by style, season, occasion (any case), favorites, contained item and name', () => {
    expect(ids({ styleId: 'smart' })).toEqual(['date', 'work'])
    expect(ids({ season: 'Summer' })).toEqual(['beach'])
    expect(ids({ occasion: 'Weekend' })).toEqual(['beach'])
    expect(ids({ favorites: true })).toEqual(['beach'])
    expect(ids({ itemId: 'shirt' })).toEqual(['date', 'work'])
    expect(ids({ itemId: 'shirt', styleId: 'elegant' })).toEqual(['date'])
    expect(ids({ query: 'office' })).toEqual(['work'])
  })

  it('duplicates with a new id and name, deep-copied overrides and the same thumbnail', () => {
    const src = list[0] as Outfit
    const copy = duplicateOutfit(src, 'new', 10)
    expect(copy).toMatchObject({ id: 'new', name: 'Office day (copy)', createdAt: 10, updatedAt: 10, favorite: false })
    expect(copy.thumbnail).toBe(src.thumbnail)
    expect(copy.overrides).toEqual(src.overrides)
    expect(copy.overrides).not.toBe(src.overrides)
  })
})

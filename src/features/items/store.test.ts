import { afterEach, describe, expect, it } from 'vitest'
import { db } from '../../db/db'
import type { GarmentLayer } from '../../domain/types'
import {
  discardItemDraft,
  getItemDraft,
  saveItemDraftView,
  saveItemFromDraft,
  skipItemDraftView,
  startItemDraft,
} from './store'

const layer = (): GarmentLayer => ({
  image: new Blob(['x'], { type: 'image/webp' }),
  bbox: { x: 1, y: 2, w: 30, h: 40 },
  transform: { dx: 0, dy: 0, scale: 1, rotation: 0 },
})

const details = {
  name: '  Navy T-Shirt ',
  styleIds: ['builtin-casual'],
  seasons: [],
  colors: ['Navy'],
  brand: ' ',
  notes: '',
  favorite: true,
}

afterEach(async () => {
  await discardItemDraft()
  await db.items.clear()
})

describe('item draft', () => {
  it('saves confirmed views, remembers skipped ones, and un-skips a view that is added later', async () => {
    await startItemDraft('T-Shirts')
    await saveItemDraftView('front', layer())
    await skipItemDraftView('side')
    expect((await getItemDraft())?.skipped).toEqual(['side'])
    const d = await saveItemDraftView('side', layer())
    expect(d.skipped).toEqual([])
    expect(Object.keys(d.views).sort()).toEqual(['front', 'side'])
  })

  it('saves an item with fewer than 3 views, with defaults from its category, and clears the draft', async () => {
    await startItemDraft('Accessories', 'Necklace')
    await saveItemDraftView('front', layer())
    const id = await saveItemFromDraft(details, new Blob(['t']))
    const item = await db.items.get(id)
    expect(item).toMatchObject({
      name: 'Navy T-Shirt',
      category: 'Accessories',
      accessoryType: 'Necklace',
      layer: 70,
      favorite: true,
      wearCount: 0,
      brand: undefined,
      notes: undefined,
    })
    expect(Object.keys(item?.views ?? {})).toEqual(['front'])
    expect(await getItemDraft()).toBeUndefined()
  })

  it('refuses to save an item with no views', async () => {
    await startItemDraft('Socks')
    await expect(saveItemFromDraft(details, new Blob(['t']))).rejects.toThrow(/at least one view/)
    expect(await db.items.count()).toBe(0)
  })
})

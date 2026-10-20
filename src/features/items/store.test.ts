import { afterEach, describe, expect, it } from 'vitest'
import { db } from '../../db/db'
import type { GarmentLayer, Outfit } from '../../domain/types'
import {
  applyRetakeDraft,
  deleteItem,
  discardItemDraft,
  getItemDraft,
  saveItemDraftView,
  saveItemFromDraft,
  skipItemDraftView,
  previewItemDelete,
  startItemDraft,
  startRetakeDraft,
  thumbnailView,
  updateItemDetails,
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

describe('editing an existing item', () => {
  const add = async (id: string) => {
    await startItemDraft('T-Shirts')
    await saveItemDraftView('front', layer())
    const itemId = await saveItemFromDraft({ ...details, name: id }, new Blob(['t']))
    return itemId
  }
  const outfit = (id: string, itemIds: string[]): Outfit => ({
    id,
    name: id,
    itemIds,
    overrides: {},
    styleIds: [],
    seasons: [],
    favorite: false,
    thumbnail: new Blob(),
    createdAt: 1,
    updatedAt: 1,
  })

  afterEach(async () => {
    await db.outfits.clear()
    await db.wearLog.clear()
  })

  it('retakes (adds) one view into the item and replaces the thumbnail only when given', async () => {
    const id = await add('Tee')
    const item = await db.items.get(id)
    if (!item) throw new Error('missing')
    const d = await startRetakeDraft(item, 'side')
    expect(d.skipped.sort()).toEqual(['back', 'front'])
    await saveItemDraftView('side', layer())
    await expect(applyRetakeDraft()).resolves.toEqual({ itemId: id, view: 'side' })
    const after = await db.items.get(id)
    expect(Object.keys(after?.views ?? {}).sort()).toEqual(['front', 'side'])
    expect(after?.thumbnail).toEqual(item.thumbnail)
    expect(await getItemDraft()).toBeUndefined()
    expect(thumbnailView({ side: layer(), back: layer() })).toBe('side')
  })

  it('updates details', async () => {
    const id = await add('Tee')
    await updateItemDetails(id, { ...details, name: ' Better tee ', brand: '  Cos ' })
    expect(await db.items.get(id)).toMatchObject({ name: 'Better tee', brand: 'Cos', notes: undefined })
  })

  it('deletes an item: removed from outfits, empty outfits deleted, wear log kept', async () => {
    const tee = await add('Tee')
    const jeans = await add('Jeans')
    await db.outfits.bulkAdd([outfit('both', [tee, jeans]), outfit('alone', [tee]), outfit('other', [jeans])])
    await db.wearLog.add({ id: 'w1', date: '2026-10-01', outfitId: 'alone' })
    const preview = await previewItemDelete(tee)
    expect(preview.updated.map((o) => o.id)).toEqual(['both'])
    expect(preview.deleted.map((o) => o.id)).toEqual(['alone'])
    expect(await db.outfits.count()).toBe(3)

    await deleteItem(tee)
    expect(await db.items.get(tee)).toBeUndefined()
    expect((await db.outfits.get('both'))?.itemIds).toEqual([jeans])
    expect(await db.outfits.get('alone')).toBeUndefined()
    expect((await db.outfits.get('other'))?.itemIds).toEqual([jeans])
    expect(await db.wearLog.get('w1')).toMatchObject({ outfitId: 'alone' })
  })
})

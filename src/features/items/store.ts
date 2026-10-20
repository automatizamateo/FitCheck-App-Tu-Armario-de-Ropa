import { db } from '../../db/db'
import { defaultLayer } from '../../domain/categories'
import type { Category, GarmentLayer, Item, ItemDraft, Season, View } from '../../domain/types'

export async function getItemDraft(): Promise<ItemDraft | undefined> {
  return db.itemDraft.get('draft')
}

export async function startItemDraft(category: Category, accessoryType?: string): Promise<ItemDraft> {
  const draft: ItemDraft = { id: 'draft', category, accessoryType, views: {}, skipped: [], startedAt: Date.now() }
  await db.itemDraft.put(draft)
  return draft
}

/** Saves one confirmed (cut out and aligned) view of the item being added. */
export async function saveItemDraftView(view: View, layer: GarmentLayer): Promise<ItemDraft> {
  return db.transaction('rw', db.itemDraft, async () => {
    const draft = await db.itemDraft.get('draft')
    if (!draft) throw new Error('No item in progress')
    draft.views[view] = layer
    draft.skipped = draft.skipped.filter((v) => v !== view)
    await db.itemDraft.put(draft)
    return draft
  })
}

export async function skipItemDraftView(view: View): Promise<ItemDraft> {
  return db.transaction('rw', db.itemDraft, async () => {
    const draft = await db.itemDraft.get('draft')
    if (!draft) throw new Error('No item in progress')
    if (!draft.skipped.includes(view)) draft.skipped.push(view)
    await db.itemDraft.put(draft)
    return draft
  })
}

export async function discardItemDraft(): Promise<void> {
  await db.itemDraft.delete('draft')
}

export interface ItemDetails {
  name: string
  styleIds: string[]
  seasons: Season[]
  colors: string[]
  brand?: string
  notes?: string
  favorite: boolean
}

/** Turns the draft into an item (in one transaction) and returns its id. */
export async function saveItemFromDraft(details: ItemDetails, thumbnail: Blob): Promise<string> {
  const id = crypto.randomUUID()
  await db.transaction('rw', db.itemDraft, db.items, async () => {
    const draft = await db.itemDraft.get('draft')
    if (!draft) throw new Error('No item in progress')
    if (Object.keys(draft.views).length === 0) throw new Error('Add at least one view first')
    const item: Item = {
      id,
      ...details,
      brand: details.brand?.trim() || undefined,
      notes: details.notes?.trim() || undefined,
      name: details.name.trim(),
      category: draft.category,
      accessoryType: draft.accessoryType,
      layer: defaultLayer(draft.category),
      views: draft.views,
      thumbnail,
      createdAt: Date.now(),
      wearCount: 0,
    }
    await db.items.add(item)
    await db.itemDraft.delete('draft')
  })
  return id
}

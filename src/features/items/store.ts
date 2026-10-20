import { db } from '../../db/db'
import { defaultLayer } from '../../domain/categories'
import { planItemDelete, type ItemDeletePlan } from '../../domain/outfits'
import {
  VIEWS,
  type Category,
  type GarmentLayer,
  type Item,
  type ItemDraft,
  type Season,
  type View,
} from '../../domain/types'

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

/** Starts retaking (or adding a missing) view of an existing item; the other views are skipped. */
export async function startRetakeDraft(item: Item, view: View): Promise<ItemDraft> {
  const draft: ItemDraft = {
    id: 'draft',
    itemId: item.id,
    category: item.category,
    accessoryType: item.accessoryType,
    views: {},
    skipped: VIEWS.filter((v) => v !== view),
    startedAt: Date.now(),
  }
  await db.itemDraft.put(draft)
  return draft
}

/**
 * Writes the retaken view into its item and clears the draft. `thumbnail` replaces the item's when
 * given (the view the grid shows changed). Returns the view that was replaced.
 */
export async function applyRetakeDraft(thumbnail?: Blob): Promise<{ itemId: string; view: View }> {
  return db.transaction('rw', db.itemDraft, db.items, async () => {
    const draft = await db.itemDraft.get('draft')
    if (!draft?.itemId) throw new Error('No view retake in progress')
    const view = VIEWS.find((v) => draft.views[v])
    const layer = view && draft.views[view]
    if (!view || !layer) throw new Error('Take the photo first')
    const item = await db.items.get(draft.itemId)
    if (!item) throw new Error('This item was deleted')
    item.views[view] = layer
    if (thumbnail) item.thumbnail = thumbnail
    await db.items.put(item)
    await db.itemDraft.delete('draft')
    return { itemId: item.id, view }
  })
}

/** The view the grid thumbnail is made from: the first one the item has (front, side, back). */
export function thumbnailView(views: Partial<Record<View, GarmentLayer>>): View | undefined {
  return VIEWS.find((v) => views[v])
}

export async function updateItemDetails(id: string, details: ItemDetails): Promise<void> {
  await db.items.update(id, {
    ...details,
    name: details.name.trim(),
    brand: details.brand?.trim() || undefined,
    notes: details.notes?.trim() || undefined,
  })
}

export async function setItemFavorite(id: string, favorite: boolean): Promise<void> {
  await db.items.update(id, { favorite })
}

/** Outfits affected by deleting an item, for the confirmation (SPEC §5). */
export async function previewItemDelete(itemId: string): Promise<ItemDeletePlan> {
  const outfits = await db.outfits.where('itemIds').equals(itemId).toArray()
  return planItemDelete(outfits, itemId, Date.now())
}

/**
 * Deletes an item, removes it from every outfit and deletes outfits left empty, in one transaction.
 * Wear log entries are kept (shown as "Deleted outfit"). Returns what happened to the outfits.
 */
export async function deleteItem(itemId: string): Promise<ItemDeletePlan> {
  return db.transaction('rw', db.items, db.outfits, async () => {
    const plan = planItemDelete(await db.outfits.where('itemIds').equals(itemId).toArray(), itemId, Date.now())
    await db.outfits.bulkPut(plan.updated)
    await db.outfits.bulkDelete(plan.deleted.map((o) => o.id))
    await db.items.delete(itemId)
    return plan
  })
}

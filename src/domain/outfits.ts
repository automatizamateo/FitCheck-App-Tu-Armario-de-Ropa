// Outfit composition rules (SPEC §5, §8.4, §10). Pure: the builder, the gallery and the tests share them.

import { CATEGORY_LAYERS } from './categories'
import { normalize } from './wardrobe'
import type { Category, Item, Outfit, OutfitOverride, Season, Transform, View } from './types'

/** What the builder edits; an outfit is only item references plus per-view overrides. */
export type OutfitContent = Pick<Outfit, 'itemIds' | 'overrides'>

/** Categories where several items can be worn together (layered tops, accessories). */
const STACKABLE: ReadonlySet<Category> = new Set([
  'T-Shirts',
  'Shirts',
  'Sweaters & Hoodies',
  'Jackets & Coats',
  'Accessories',
])

/** Items in the same slot replace each other (you wear one pair of pants or shorts). */
function slot(category: Category): string {
  return category === 'Pants' || category === 'Shorts' ? 'bottoms' : category
}

export function isStackable(category: Category): boolean {
  return STACKABLE.has(category)
}

type ItemRef = Pick<Item, 'id' | 'category'>

/**
 * Tapping an item in the picker: removes it if it is in the outfit, adds it otherwise. Adding an
 * item to a single slot (pants, shoes…) swaps out whatever was there; `replaced` lists those ids.
 */
export function toggleItem(
  content: OutfitContent,
  item: ItemRef,
  all: readonly ItemRef[],
): { content: OutfitContent; added: boolean; replaced: string[] } {
  if (content.itemIds.includes(item.id)) return { content: removeItem(content, item.id), added: false, replaced: [] }
  const byId = new Map(all.map((i) => [i.id, i]))
  const replaced = isStackable(item.category)
    ? []
    : content.itemIds.filter((id) => {
        const other = byId.get(id)
        return other !== undefined && slot(other.category) === slot(item.category)
      })
  let next = content
  for (const id of replaced) next = removeItem(next, id)
  return { content: { ...next, itemIds: [...next.itemIds, item.id] }, added: true, replaced }
}

export function removeItem(content: OutfitContent, itemId: string): OutfitContent {
  const overrides = Object.fromEntries(Object.entries(content.overrides).filter(([id]) => id !== itemId))
  return { itemIds: content.itemIds.filter((id) => id !== itemId), overrides }
}

export function getOverride(content: OutfitContent, itemId: string, view: View): OutfitOverride | undefined {
  return content.overrides[itemId]?.[view]
}

function putOverride(content: OutfitContent, itemId: string, view: View, o: OutfitOverride | undefined): OutfitContent {
  const perView: Partial<Record<View, OutfitOverride>> = Object.fromEntries(
    Object.entries(content.overrides[itemId] ?? {}).filter(([v]) => v !== view),
  )
  if (o) perView[view] = o
  const overrides = Object.fromEntries(Object.entries(content.overrides).filter(([id]) => id !== itemId))
  if (Object.keys(perView).length) overrides[itemId] = perView
  return { ...content, overrides }
}

const isIdentity = (t: Transform) =>
  Math.abs(t.dx) < 0.01 && Math.abs(t.dy) < 0.01 && Math.abs(t.scale - 1) < 1e-4 && Math.abs(t.rotation) < 1e-4

/** Sets the position/scale/rotation override for one item in one view, keeping its layer override. */
export function setTransform(content: OutfitContent, itemId: string, view: View, t: Transform): OutfitContent {
  const layer = getOverride(content, itemId, view)?.layer
  if (isIdentity(t) && layer === undefined) return putOverride(content, itemId, view, undefined)
  return putOverride(content, itemId, view, { dx: t.dx, dy: t.dy, scale: t.scale, rotation: t.rotation, layer })
}

/** "Reset": back to the item's own placement in this view (the layer order is kept). */
export function resetTransform(content: OutfitContent, itemId: string, view: View): OutfitContent {
  return setTransform(content, itemId, view, { dx: 0, dy: 0, scale: 1, rotation: 0 })
}

type LayeredItem = Pick<Item, 'id' | 'category' | 'layer'>

/** Layer used to sort an item in a view: outfit override → item → category default (SPEC §10). */
export function effectiveLayer(content: OutfitContent, item: LayeredItem, view: View): number {
  const own = Number.isFinite(item.layer) ? item.layer : CATEGORY_LAYERS[item.category]
  return getOverride(content, item.id, view)?.layer ?? own
}

/** Ids in drawing order (first = closest to the body); ties keep the order the items were added. */
export function layerOrder(content: OutfitContent, items: readonly LayeredItem[], view: View): string[] {
  const byId = new Map(items.map((i) => [i.id, i]))
  return content.itemIds
    .map((id, index) => ({ id, index, item: byId.get(id) }))
    .filter((e): e is { id: string; index: number; item: LayeredItem } => e.item !== undefined)
    .map((e) => ({ ...e, layer: effectiveLayer(content, e.item, view) }))
    .sort((a, b) => a.layer - b.layer || a.index - b.index)
    .map((e) => e.id)
}

/**
 * "Bring forward" (+1) / "Send backward" (−1) in one view: swaps the item with its neighbour and
 * writes layer overrides for every item of that view so the new order sticks. The values reuse the
 * current layers (kept strictly increasing), so items added later still land where their category
 * belongs (shoes over pants, etc.).
 */
export function moveLayer(
  content: OutfitContent,
  items: readonly LayeredItem[],
  view: View,
  itemId: string,
  direction: 1 | -1,
): OutfitContent {
  const order = layerOrder(content, items, view)
  const i = order.indexOf(itemId)
  const j = i + direction
  if (i < 0 || j < 0 || j >= order.length) return content
  const byId = new Map(items.map((it) => [it.id, it]))
  const values = order.map((id) => {
    const item = byId.get(id)
    return item ? effectiveLayer(content, item, view) : 0
  })
  for (let k = 1; k < values.length; k++) values[k] = Math.max(values[k] ?? 0, (values[k - 1] ?? 0) + 1)
  const next = [...order]
  next[i] = order[j] as string
  next[j] = itemId
  let out = content
  next.forEach((id, k) => {
    const current = getOverride(out, id, view)
    out = putOverride(out, id, view, {
      ...(current ?? { dx: 0, dy: 0, scale: 1, rotation: 0 }),
      layer: values[k],
    })
  })
  return out
}

/** Can the item move further in that direction? (for disabling the buttons) */
export function canMoveLayer(
  content: OutfitContent,
  items: readonly LayeredItem[],
  view: View,
  itemId: string,
  direction: 1 | -1,
): boolean {
  const order = layerOrder(content, items, view)
  const j = order.indexOf(itemId) + direction
  return order.includes(itemId) && j >= 0 && j < order.length
}

// ── Delete rules (SPEC §5) ─────────────────────────────────────────────────────

export interface ItemDeletePlan {
  /** Outfits that keep other items: the item (and its overrides) is removed from them. */
  updated: Outfit[]
  /** Outfits that only had this item: deleted (their wear log entries stay, as "Deleted outfit"). */
  deleted: Outfit[]
}

export function planItemDelete(outfits: readonly Outfit[], itemId: string, now: number): ItemDeletePlan {
  const updated: Outfit[] = []
  const deleted: Outfit[] = []
  for (const outfit of outfits) {
    if (!outfit.itemIds.includes(itemId)) continue
    const content = removeItem(outfit, itemId)
    if (content.itemIds.length === 0) deleted.push(outfit)
    else updated.push({ ...outfit, ...content, updatedAt: now })
  }
  return { updated, deleted }
}

// ── Outfits gallery (SPEC §8.5) ────────────────────────────────────────────────

export interface OutfitFilters {
  styleId: string | null
  season: Season | null
  occasion: string | null
  favorites: boolean
  itemId: string | null
  query: string
}

export const NO_OUTFIT_FILTERS: OutfitFilters = {
  styleId: null,
  season: null,
  occasion: null,
  favorites: false,
  itemId: null,
  query: '',
}

export function filterOutfits<T extends Outfit>(outfits: readonly T[], f: OutfitFilters): T[] {
  const words = normalize(f.query).split(/\s+/).filter(Boolean)
  const occasion = f.occasion && normalize(f.occasion)
  return outfits
    .filter((o) => {
      if (f.styleId && !o.styleIds.includes(f.styleId)) return false
      if (f.season && !o.seasons.includes(f.season)) return false
      if (occasion && normalize(o.occasion ?? '') !== occasion) return false
      if (f.favorites && !o.favorite) return false
      if (f.itemId && !o.itemIds.includes(f.itemId)) return false
      if (words.length) {
        const haystack = normalize(`${o.name} ${o.occasion ?? ''}`)
        if (!words.every((w) => haystack.includes(w))) return false
      }
      return true
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

/** A copy with a new id and name; the thumbnail blob is shared (blobs are immutable). */
export function duplicateOutfit(outfit: Outfit, id: string, now: number): Outfit {
  return {
    ...structuredClone({ ...outfit, thumbnail: undefined }),
    thumbnail: outfit.thumbnail,
    id,
    name: `${outfit.name} (copy)`,
    favorite: false,
    createdAt: now,
    updatedAt: now,
  }
}

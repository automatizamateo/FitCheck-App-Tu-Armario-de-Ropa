import { db } from '../../db/db'
import { duplicateOutfit, layerOrder, type OutfitContent } from '../../domain/outfits'
import type { BaseModel, Item, Outfit, Season, View } from '../../domain/types'
import { renderComposite, type CompositeLayer } from '../../lib/composite'
import { debugLog } from '../../lib/debugLog'
import { formatResources } from '../../lib/resources'

export interface OutfitDetails {
  name: string
  styleIds: string[]
  seasons: Season[]
  occasion?: string
  favorite: boolean
}

/** The layers of one view in drawing order, with the outfit's overrides. Items without that view are left out. */
export function composeView(
  content: OutfitContent,
  items: readonly Item[],
  view: View,
): (CompositeLayer & { id: string })[] {
  const byId = new Map(items.map((i) => [i.id, i]))
  return layerOrder(content, items, view).flatMap((id) => {
    const layer = byId.get(id)?.views[view]
    return layer
      ? [
          {
            id,
            image: layer.image,
            bbox: layer.bbox,
            transform: layer.transform,
            override: content.overrides[id]?.[view],
          },
        ]
      : []
  })
}

/** Front view (or the first view any item has) composed small, for the gallery (SPEC §5). */
export async function renderOutfitThumbnail(
  base: BaseModel,
  content: OutfitContent,
  items: readonly Item[],
): Promise<Blob> {
  const views: View[] = ['front', 'side', 'back']
  const view = views.find((v) => composeView(content, items, v).length > 0) ?? 'front'
  debugLog('▶ outfit thumbnail', { view, items: content.itemIds.length, res: formatResources() })
  const blob = await renderComposite(base.views[view], composeView(content, items, view))
  debugLog('✓ outfit thumbnail', { kb: Math.round(blob.size / 1024), res: formatResources() })
  return blob
}

/** Creates (no id) or updates an outfit. Only references, overrides and a small thumbnail are stored. */
export async function saveOutfit(
  content: OutfitContent,
  details: OutfitDetails,
  thumbnail: Blob,
  id?: string,
): Promise<string> {
  const now = Date.now()
  const existing = id ? await db.outfits.get(id) : undefined
  const outfit: Outfit = {
    id: existing?.id ?? crypto.randomUUID(),
    name: details.name.trim(),
    itemIds: [...content.itemIds],
    overrides: content.overrides,
    styleIds: details.styleIds,
    seasons: details.seasons,
    occasion: details.occasion?.trim() || undefined,
    favorite: details.favorite,
    thumbnail,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  if (outfit.itemIds.length === 0) throw new Error('Add at least one item first')
  await db.outfits.put(outfit)
  return outfit.id
}

export async function copyOutfit(id: string): Promise<string> {
  const outfit = await db.outfits.get(id)
  if (!outfit) throw new Error('This outfit was deleted')
  const copy = duplicateOutfit(outfit, crypto.randomUUID(), Date.now())
  await db.outfits.add(copy)
  return copy.id
}

/** Wear log entries stay and are shown as "Deleted outfit" (SPEC §5). */
export async function deleteOutfit(id: string): Promise<void> {
  await db.outfits.delete(id)
}

export async function setOutfitFavorite(id: string, favorite: boolean): Promise<void> {
  await db.outfits.update(id, { favorite })
}

/**
 * Re-renders the thumbnails of outfits after their items changed (an item deleted or a view retaken).
 * One at a time; a failure only leaves an old thumbnail.
 */
export async function refreshOutfitThumbnails(outfitIds: readonly string[]): Promise<void> {
  const base = await db.baseModel.get('base')
  if (!base) return
  for (const id of outfitIds) {
    try {
      const outfit = await db.outfits.get(id)
      if (!outfit) continue
      const items = (await db.items.bulkGet(outfit.itemIds)).filter((i): i is Item => i !== undefined)
      const thumbnail = await renderOutfitThumbnail(base, outfit, items)
      await db.outfits.update(id, { thumbnail })
    } catch (err) {
      debugLog(`outfit thumbnail refresh failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

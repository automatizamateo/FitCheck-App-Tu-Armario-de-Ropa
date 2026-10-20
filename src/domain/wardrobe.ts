// Wardrobe grid filters and sorting (SPEC §8.2). Pure, so the grid and the tests share them.

import { VIEWS, type Category, type Item, type Season, type View } from './types'

export const DAY_MS = 24 * 60 * 60 * 1000

export type ItemSort = 'newest' | 'mostWorn' | 'leastWorn' | 'lastWorn'

export const ITEM_SORTS: readonly { value: ItemSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'mostWorn', label: 'Most worn' },
  { value: 'leastWorn', label: 'Least worn' },
  { value: 'lastWorn', label: 'Last worn' },
]

export interface ItemFilters {
  category: Category | null
  styleId: string | null
  season: Season | null
  color: string | null
  favorites: boolean
  unused: boolean
  query: string
}

export const NO_ITEM_FILTERS: ItemFilters = {
  category: null,
  styleId: null,
  season: null,
  color: null,
  favorites: false,
  unused: false,
  query: '',
}

/** Filters set besides category and search (for the "Filters (n)" button). */
export function activeFilterCount(f: ItemFilters): number {
  return [f.styleId, f.season, f.color].filter(Boolean).length + Number(f.favorites) + Number(f.unused)
}

/**
 * Unused (SPEC §8.7): not worn for more than `days`, or never worn and added more than `days` ago.
 */
export function isUnused(item: Pick<Item, 'lastWornAt' | 'createdAt'>, now: number, days: number): boolean {
  return now - (item.lastWornAt ?? item.createdAt) > days * DAY_MS
}

export function missingViews(item: Pick<Item, 'views'>): View[] {
  return VIEWS.filter((v) => !item.views[v])
}

/** Lower-cased, accent-free text for search ("Café" matches "cafe"). */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

export function filterItems<T extends Item>(items: readonly T[], f: ItemFilters, now: number, unusedDays: number): T[] {
  const words = normalize(f.query).split(/\s+/).filter(Boolean)
  return items.filter((item) => {
    if (f.category && item.category !== f.category) return false
    if (f.styleId && !item.styleIds.includes(f.styleId)) return false
    if (f.season && !item.seasons.includes(f.season)) return false
    if (f.color && !item.colors.includes(f.color)) return false
    if (f.favorites && !item.favorite) return false
    if (f.unused && !isUnused(item, now, unusedDays)) return false
    if (words.length) {
      const haystack = normalize(`${item.name} ${item.brand ?? ''} ${item.accessoryType ?? ''}`)
      if (!words.every((w) => haystack.includes(w))) return false
    }
    return true
  })
}

const newest = (a: Item, b: Item) => b.createdAt - a.createdAt

const SORTERS: Record<ItemSort, (a: Item, b: Item) => number> = {
  newest,
  mostWorn: (a, b) => b.wearCount - a.wearCount || (b.lastWornAt ?? 0) - (a.lastWornAt ?? 0) || newest(a, b),
  // Least worn first; among equals, the one waiting longest (oldest) first.
  leastWorn: (a, b) => a.wearCount - b.wearCount || a.createdAt - b.createdAt,
  // Most recently worn first; never-worn items go last.
  lastWorn: (a, b) => (b.lastWornAt ?? -Infinity) - (a.lastWornAt ?? -Infinity) || newest(a, b),
}

export function sortItems<T extends Item>(items: readonly T[], sort: ItemSort): T[] {
  const cmp = SORTERS[sort]
  return [...items].sort((a, b) => {
    const d = cmp(a, b)
    return Number.isNaN(d) ? 0 : d
  })
}

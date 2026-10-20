import { create } from 'zustand'
import { NO_OUTFIT_FILTERS, type OutfitFilters } from '../domain/outfits'
import { NO_ITEM_FILTERS, type ItemFilters, type ItemSort } from '../domain/wardrobe'

interface UIState {
  installBannerHidden: boolean // hidden for this session only; it comes back on next launch
  hideInstallBanner: () => void
  // Grid filters survive opening an item or outfit and coming back (this session only).
  itemFilters: ItemFilters
  itemSort: ItemSort
  setItemFilters: (changes: Partial<ItemFilters>) => void
  setItemSort: (sort: ItemSort) => void
  outfitFilters: OutfitFilters
  setOutfitFilters: (changes: Partial<OutfitFilters>) => void
}

export const useUI = create<UIState>()((set) => ({
  installBannerHidden: false,
  hideInstallBanner: () => {
    set({ installBannerHidden: true })
  },
  itemFilters: NO_ITEM_FILTERS,
  itemSort: 'newest',
  setItemFilters: (changes) => {
    set((s) => ({ itemFilters: { ...s.itemFilters, ...changes } }))
  },
  setItemSort: (itemSort) => {
    set({ itemSort })
  },
  outfitFilters: NO_OUTFIT_FILTERS,
  setOutfitFilters: (changes) => {
    set((s) => ({ outfitFilters: { ...s.outfitFilters, ...changes } }))
  },
}))

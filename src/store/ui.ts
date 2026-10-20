import { create } from 'zustand'

interface UIState {
  installBannerHidden: boolean // hidden for this session only; it comes back on next launch
  hideInstallBanner: () => void
}

export const useUI = create<UIState>()((set) => ({
  installBannerHidden: false,
  hideInstallBanner: () => {
    set({ installBannerHidden: true })
  },
}))

declare global {
  interface Navigator {
    /** iOS Safari only: true when launched from the Home Screen. */
    standalone?: boolean
  }
}

export function isStandalone(): boolean {
  return navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches
}

export function isIOS(): boolean {
  // iPadOS reports itself as Mac; touch points disambiguate.
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1)
}

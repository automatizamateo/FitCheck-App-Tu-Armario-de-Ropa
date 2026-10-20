let switchEl: HTMLInputElement | null = null

/**
 * Short haptic tick. Uses the Vibration API where it exists; on iOS Safari (no Vibration API)
 * toggling a native `<input type="checkbox" switch>` produces a system haptic on iOS 18+.
 * Silently does nothing elsewhere. Must be called from a user gesture or timer started by one.
 */
export function haptic() {
  if (typeof navigator.vibrate === 'function') {
    navigator.vibrate(12)
    return
  }
  try {
    if (!switchEl) {
      const label = document.createElement('label')
      label.ariaHidden = 'true'
      label.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-99px'
      switchEl = document.createElement('input')
      switchEl.type = 'checkbox'
      switchEl.setAttribute('switch', '')
      label.appendChild(switchEl)
      document.body.appendChild(label)
    }
    ;(switchEl.parentElement as HTMLLabelElement).click()
  } catch {
    /* no haptics available */
  }
}

// iOS kills a page that uses too much memory and reloads it, so no JS error ever fires.
// We record what was running before risky work and clear it afterwards; a leftover marker
// on the next load means the page died mid-task.
const KEY = 'fitcheck-lab-inflight'

export function markInFlight(what: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ what, at: Date.now() }))
  } catch {
    /* storage unavailable: crash detection is best-effort */
  }
}

export function clearInFlight() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

export function readLeftoverMarker(): { what: string; at: number } | null {
  try {
    const raw = localStorage.getItem(KEY)
    localStorage.removeItem(KEY)
    return raw ? (JSON.parse(raw) as { what: string; at: number }) : null
  } catch {
    return null
  }
}

// iOS kills a page that uses too much memory and reloads it, so no JS error ever fires.
// Record what is about to run before risky work and clear it afterwards; a leftover record
// on the next load means the page died mid-task (or the user closed the app at that moment).

export function markInFlight(key: string, info: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify({ info, at: Date.now() }))
  } catch {
    /* storage unavailable: crash detection is best-effort */
  }
}

export function clearInFlight(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/** Returns and clears a record left by a previous page load. */
export function takeLeftover(key: string): { info: unknown; at: number } | null {
  try {
    const raw = localStorage.getItem(key)
    localStorage.removeItem(key)
    return raw ? (JSON.parse(raw) as { info: unknown; at: number }) : null
  } catch {
    return null
  }
}

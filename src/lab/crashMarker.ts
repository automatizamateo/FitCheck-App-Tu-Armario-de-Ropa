import { clearInFlight as clear, markInFlight as mark, takeLeftover } from '../lib/crashGuard'

const KEY = 'fitcheck-lab-inflight'

export function markInFlight(what: string) {
  mark(KEY, what)
}

export function clearInFlight() {
  clear(KEY)
}

export function readLeftoverMarker(): { what: string; at: number } | null {
  const leftover = takeLeftover(KEY)
  return leftover ? { what: String(leftover.info), at: leftover.at } : null
}

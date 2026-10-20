import { getSettings, updateMlSettings } from '../db/settings'
import { clearInFlight, markInFlight, takeLeftover } from '../lib/crashGuard'
import { crashRecovery, type InFlightMl } from './mlConfig'

const KEY = 'fitcheck-ml-inflight'

/** Runs `task` with a crash marker, so an iOS out-of-memory kill is noticed on the next launch. */
export async function guardMl<T>(info: InFlightMl, task: () => Promise<T>): Promise<T> {
  markInFlight(KEY, info)
  try {
    return await task()
  } finally {
    clearInFlight(KEY)
  }
}

/** Call once at startup: steps the ML setup down if the last session died during inference. */
export async function recoverFromMlCrash(): Promise<void> {
  const leftover = takeLeftover(KEY)
  if (!leftover) return
  const settings = await getSettings()
  const { changes, notice } = crashRecovery(settings.ml, leftover.info as InFlightMl)
  await updateMlSettings({ ...changes, pendingNotice: notice })
}

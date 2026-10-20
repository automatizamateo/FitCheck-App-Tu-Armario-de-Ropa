import { getSettings, updateMlSettings } from '../db/settings'
import { clearInFlight, markInFlight, takeLeftover } from '../lib/crashGuard'
import { debugLog } from '../lib/debugLog'
import { isIOS } from '../lib/platform'
import { crashRecovery, type InFlightMl } from './mlConfig'

const KEY = 'fitcheck-ml-inflight'
const RECOVERY_KEY = 'fitcheck-ml-recovery'

export const stepName = (info: InFlightMl) => `${info.stage}.${info.step ?? 'run'}`

/**
 * Runs one heavy step with a crash marker written before it starts, so an iOS out-of-memory kill is
 * noticed on the next launch, and logs its start, duration and errors to the debug log.
 */
export async function guardMl<T>(info: InFlightMl, task: () => Promise<T>): Promise<T> {
  const name = stepName(info)
  markInFlight(KEY, info)
  debugLog(`▶ ${name}`, info.modelId || info.device ? { model: info.modelId, device: info.device } : undefined)
  const start = performance.now()
  try {
    const result = await task()
    debugLog(`✓ ${name} ${Math.round(performance.now() - start)} ms`)
    return result
  } catch (err) {
    debugLog(`✗ ${name} ${Math.round(performance.now() - start)} ms: ${err instanceof Error ? err.message : String(err)}`)
    throw err
  } finally {
    clearInFlight(KEY)
  }
}

/** Set at launch after a crash; the base model flow shows a recovery screen until it is cleared. */
export interface PendingRecovery {
  crashed: InFlightMl
  at: number // when the crashed step started
  notice: string
  steppedDown: boolean
}

export function readRecovery(): PendingRecovery | null {
  try {
    const raw = localStorage.getItem(RECOVERY_KEY)
    return raw ? (JSON.parse(raw) as PendingRecovery) : null
  } catch {
    return null
  }
}

export function clearRecovery() {
  try {
    localStorage.removeItem(RECOVERY_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Call once at startup, before rendering: if the last session died during an ML step, steps the setup
 * down one level and records a pending recovery. Nothing is re-run automatically.
 */
export async function recoverFromMlCrash(): Promise<void> {
  const leftover = takeLeftover(KEY)
  if (!leftover) return
  const crashed = leftover.info as InFlightMl
  const settings = await getSettings()
  const { changes, notice, steppedDown } = crashRecovery(settings.ml, crashed, isIOS())
  await updateMlSettings({ ...changes, pendingNotice: notice })
  const recovery: PendingRecovery = { crashed, at: leftover.at, notice, steppedDown }
  try {
    localStorage.setItem(RECOVERY_KEY, JSON.stringify(recovery))
  } catch {
    /* without storage the yellow notice still explains what happened */
  }
  debugLog(`⚠ previous launch was killed during ${stepName(crashed)}`, { stepDown: changes })
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/db'
import { getSettings, updateMlSettings } from '../db/settings'
import { memoryStorage } from '../test/memoryStorage'
import { clearRecovery, guardMl, readRecovery, recoverFromMlCrash } from './crashRecovery'
import { LIGHT_SEGMENTATION_MODEL } from './models'

/** Simulates iOS killing the page in the middle of `step`: the marker is written but never cleared. */
async function crashDuring(stage: 'segment' | 'pose' | 'refine') {
  void guardMl({ stage, step: 'run' }, () => new Promise(() => undefined))
  await Promise.resolve()
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', maxTouchPoints: 5 })
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await db.settings.clear()
})

describe('launch after a crash', () => {
  it('does nothing after a clean exit', async () => {
    await guardMl({ stage: 'segment' }, () => Promise.resolve(1))
    await recoverFromMlCrash()
    expect(readRecovery()).toBeNull()
  })

  it('records a pending recovery (no auto-resume) and steps down one level per crash', async () => {
    await updateMlSettings({ refineEdges: 'on' })

    await crashDuring('refine')
    await recoverFromMlCrash()
    expect(readRecovery()?.crashed.stage).toBe('refine')
    expect((await getSettings()).ml.refineEdges).toBe('off')
    expect((await getSettings()).ml.pendingNotice).toMatch(/Refine edges/)

    // The user taps Retry and it crashes again, this time in segmentation.
    clearRecovery()
    await crashDuring('segment')
    await recoverFromMlCrash()
    expect((await getSettings()).ml.model).toBe(LIGHT_SEGMENTATION_MODEL)

    clearRecovery()
    await crashDuring('segment')
    await recoverFromMlCrash()
    expect((await getSettings()).ml.device).toBe('wasm')

    // Nothing left to lower: still a recovery screen, never a loop.
    clearRecovery()
    await crashDuring('segment')
    await recoverFromMlCrash()
    expect(readRecovery()?.steppedDown).toBe(false)

    // The marker is consumed: the next launch is clean.
    clearRecovery()
    await recoverFromMlCrash()
    expect(readRecovery()).toBeNull()
  })
})

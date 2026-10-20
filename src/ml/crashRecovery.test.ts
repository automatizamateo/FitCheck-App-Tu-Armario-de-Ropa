import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/db'
import { getSettings, updateMlSettings } from '../db/settings'
import { memoryStorage } from '../test/memoryStorage'
import { clearRecovery, guardMl, readRecovery, recoverFromMlCrash } from './crashRecovery'
import { LIGHT_SEGMENTATION_MODEL } from './models'

/** Simulates iOS killing the page in the middle of `step`: the marker is written but never cleared. */
async function crashDuring(stage: 'segment' | 'pose' | 'refine', step: 'load' | 'run' = 'run') {
  void guardMl({ stage, step }, () => new Promise(() => undefined))
  await Promise.resolve()
}

const IPHONE = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', maxTouchPoints: 5 }
const DESKTOP = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 }

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('navigator', IPHONE)
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
    vi.stubGlobal('navigator', DESKTOP) // on iOS, auto already starts at B0 + CPU
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

  it('the reported iPhone case: killed at pose.load with B2 on WebGPU → B0 + WASM, then pose off', async () => {
    await updateMlSettings({ model: 'Xenova/segformer_b2_clothes', device: 'webgpu' })
    await crashDuring('pose', 'load')
    await recoverFromMlCrash()
    let ml = (await getSettings()).ml
    expect(readRecovery()?.crashed).toEqual({ stage: 'pose', step: 'load' })
    expect(ml).toMatchObject({ model: LIGHT_SEGMENTATION_MODEL, device: 'wasm', poseCrashes: 1 })
    expect(ml.skipPose).toBeFalsy()

    clearRecovery()
    await crashDuring('pose', 'load')
    await recoverFromMlCrash()
    ml = (await getSettings()).ml
    expect(ml.skipPose).toBe(true)
    expect(ml.pendingNotice).toMatch(/pose detection is now off/)
  })
})

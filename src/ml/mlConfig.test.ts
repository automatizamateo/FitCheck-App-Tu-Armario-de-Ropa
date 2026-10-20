import { describe, expect, it } from 'vitest'
import { DEFAULT_ML_SETTINGS } from '../db/db'
import type { MlSettings } from '../domain/types'
import { crashRecovery, resolveSegmentationConfig, shouldRefine, type InFlightMl } from './mlConfig'
import { DEFAULT_SEGMENTATION_MODEL, LIGHT_SEGMENTATION_MODEL } from './models'

const ml = DEFAULT_ML_SETTINGS

describe('ML config', () => {
  it('uses B2 on auto backend by default outside iOS', () => {
    expect(resolveSegmentationConfig(ml, false)).toEqual({ modelId: DEFAULT_SEGMENTATION_MODEL, device: 'auto', dtype: 'auto' })
  })

  it('falls back to WASM after WebGPU failed, only when on auto', () => {
    expect(resolveSegmentationConfig({ ...ml, webgpuBroken: true }, false).device).toBe('wasm')
    expect(resolveSegmentationConfig({ ...ml, webgpuBroken: true, device: 'webgpu' }, false).device).toBe('webgpu')
  })

  it('on iOS, auto starts at the safest setup: B0, WASM, q8', () => {
    expect(resolveSegmentationConfig(ml, true)).toEqual({ modelId: LIGHT_SEGMENTATION_MODEL, device: 'wasm', dtype: 'q8' })
  })

  it('on iOS, auto steps up to B2 only after a full run, and never to WebGPU', () => {
    const proven = { ...ml, iosVerifiedRuns: 1 }
    expect(resolveSegmentationConfig(proven, true)).toEqual({ modelId: DEFAULT_SEGMENTATION_MODEL, device: 'wasm', dtype: 'q8' })
    expect(resolveSegmentationConfig({ ...ml, iosVerifiedRuns: 50 }, true).device).toBe('wasm')
  })

  it('on iOS, explicit choices still win', () => {
    const explicit: MlSettings = { ...ml, model: DEFAULT_SEGMENTATION_MODEL, device: 'webgpu', dtype: 'fp16' }
    expect(resolveSegmentationConfig(explicit, true)).toEqual({ modelId: DEFAULT_SEGMENTATION_MODEL, device: 'webgpu', dtype: 'fp16' })
    expect(resolveSegmentationConfig({ ...ml, device: 'wasm', dtype: 'fp32' }, true).dtype).toBe('fp32')
  })

  it('never refines automatically on iOS; only an explicit On enables it there', () => {
    expect(shouldRefine(ml, true)).toBe(false)
    expect(shouldRefine({ ...ml, refineBenchmarkMs: 100 }, true)).toBe(false)
    expect(shouldRefine({ ...ml, refineEdges: 'on' }, true)).toBe(true)
    expect(shouldRefine({ ...ml, refineEdges: 'off' }, true)).toBe(false)
  })

  it('elsewhere refines on auto unless it was slow', () => {
    expect(shouldRefine(ml, false)).toBe(true)
    expect(shouldRefine({ ...ml, refineBenchmarkMs: 5000 }, false)).toBe(true)
    expect(shouldRefine({ ...ml, refineBenchmarkMs: 9000 }, false)).toBe(false)
    expect(shouldRefine({ ...ml, refineEdges: 'on', refineBenchmarkMs: 9000 }, false)).toBe(true)
    expect(shouldRefine({ ...ml, refineEdges: 'off' }, false)).toBe(false)
  })
})

describe('crash step-down', () => {
  /** Simulates repeated crashes in the same step, applying each step-down like the app does at launch. */
  function crashRepeatedly(start: MlSettings, crashed: InFlightMl, ios: boolean, times: number) {
    let current = start
    const results = []
    for (let i = 0; i < times; i++) {
      const r = crashRecovery(current, crashed, ios)
      results.push(r)
      current = { ...current, ...r.changes }
    }
    return { results, final: current }
  }

  it('a refine crash turns refinement off, even when it was switched on by hand', () => {
    const r = crashRecovery({ ...ml, refineEdges: 'on' }, { stage: 'refine', step: 'run' }, true)
    expect(r.changes).toEqual({ refineEdges: 'off' })
    expect(r.steppedDown).toBe(true)
    expect(r.notice).toMatch(/Refine edges/)
  })

  it('walks refine off → lighter model → CPU, one level per crash, then stops changing', () => {
    const { results, final } = crashRepeatedly({ ...ml, refineEdges: 'on' }, { stage: 'refine', step: 'run' }, false, 4)
    expect(results.map((r) => r.changes)).toEqual([
      { refineEdges: 'off' },
      { model: LIGHT_SEGMENTATION_MODEL },
      { device: 'wasm', dtype: 'auto' },
      {},
    ])
    expect(results[3]?.steppedDown).toBe(false)
    expect(results[3]?.notice).toMatch(/lightest/)
    expect(final).toMatchObject({ refineEdges: 'off', model: LIGHT_SEGMENTATION_MODEL, device: 'wasm' })
  })

  it('a segmentation crash steps the model down first, skipping refine when it was not running', () => {
    const { results } = crashRepeatedly({ ...ml, refineEdges: 'off' }, { stage: 'segment', step: 'run', device: 'webgpu' }, false, 3)
    expect(results.map((r) => r.changes)).toEqual([{ model: LIGHT_SEGMENTATION_MODEL }, { device: 'wasm', dtype: 'auto' }, {}])
  })

  it('on iOS after a proven run (B2), a segmentation crash goes back to B0', () => {
    expect(crashRecovery({ ...ml, iosVerifiedRuns: 1 }, { stage: 'segment' }, true).changes).toEqual({
      model: LIGHT_SEGMENTATION_MODEL,
    })
  })

  it('a pose crash drops straight to B0 + WASM; a second one in a row turns pose off', () => {
    // The reported case: B2 on WebGPU, killed at pose.load.
    const start: MlSettings = { ...ml, model: DEFAULT_SEGMENTATION_MODEL, device: 'webgpu' }
    const { results, final } = crashRepeatedly(start, { stage: 'pose', step: 'load' }, true, 2)
    expect(results[0]?.changes).toEqual({ model: LIGHT_SEGMENTATION_MODEL, device: 'wasm', dtype: 'auto', poseCrashes: 1 })
    expect(results[1]?.changes).toEqual({ poseCrashes: 2, skipPose: true })
    expect(results[1]?.notice).toMatch(/pose detection is now off/)
    expect(final.skipPose).toBe(true)
  })

  it('a pose crash at the safe iOS default changes nothing the first time, then skips pose', () => {
    const { results } = crashRepeatedly(ml, { stage: 'pose', step: 'load' }, true, 2)
    expect(results[0]?.changes).toEqual({ poseCrashes: 1 })
    expect(results[0]?.steppedDown).toBe(false)
    expect(results[1]?.changes).toMatchObject({ skipPose: true })
  })

  it('skips rungs that would change nothing', () => {
    // Already on the light model and WebGPU already failed (auto → WASM): only refine is left.
    const settings: MlSettings = { ...ml, model: LIGHT_SEGMENTATION_MODEL, webgpuBroken: true, refineEdges: 'on' }
    expect(crashRecovery(settings, { stage: 'segment' }, true).changes).toEqual({ refineEdges: 'off' })
    // On desktop, auto refine is on, so a refine crash must switch it off explicitly.
    expect(crashRecovery(ml, { stage: 'refine' }, false).changes).toEqual({ refineEdges: 'off' })
  })

  it('overrides explicit model and device choices so the same crash cannot repeat', () => {
    const explicit: MlSettings = { ...ml, model: DEFAULT_SEGMENTATION_MODEL, device: 'webgpu', dtype: 'fp32' }
    expect(crashRecovery(explicit, { stage: 'segment' }, true).changes).toEqual({ model: LIGHT_SEGMENTATION_MODEL })
    const light = { ...explicit, model: LIGHT_SEGMENTATION_MODEL }
    expect(crashRecovery(light, { stage: 'segment' }, true).changes).toEqual({ device: 'wasm', dtype: 'auto' })
  })
})

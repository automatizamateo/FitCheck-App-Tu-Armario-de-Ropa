import { describe, expect, it } from 'vitest'
import { DEFAULT_ML_SETTINGS } from '../db/db'
import type { MlSettings } from '../domain/types'
import { crashRecovery, resolveSegmentationConfig, shouldRefine, type InFlightMl } from './mlConfig'
import { DEFAULT_SEGMENTATION_MODEL, LIGHT_SEGMENTATION_MODEL } from './models'

const ml = DEFAULT_ML_SETTINGS

describe('ML config', () => {
  it('uses B2 on auto backend by default', () => {
    expect(resolveSegmentationConfig(ml)).toEqual({ modelId: DEFAULT_SEGMENTATION_MODEL, device: 'auto', dtype: 'auto' })
  })

  it('falls back to WASM after WebGPU failed, only when on auto', () => {
    expect(resolveSegmentationConfig({ ...ml, webgpuBroken: true }).device).toBe('wasm')
    expect(resolveSegmentationConfig({ ...ml, webgpuBroken: true, device: 'webgpu' }).device).toBe('webgpu')
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
    const { results, final } = crashRepeatedly({ ...ml, refineEdges: 'on' }, { stage: 'refine', step: 'run' }, true, 4)
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
    const { results } = crashRepeatedly(ml, { stage: 'segment', step: 'run', device: 'webgpu' }, true, 3)
    expect(results.map((r) => r.changes)).toEqual([{ model: LIGHT_SEGMENTATION_MODEL }, { device: 'wasm', dtype: 'auto' }, {}])
  })

  it('a pose crash also lightens the segmentation model that is still loaded', () => {
    expect(crashRecovery(ml, { stage: 'pose', step: 'load' }, true).changes).toEqual({ model: LIGHT_SEGMENTATION_MODEL })
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

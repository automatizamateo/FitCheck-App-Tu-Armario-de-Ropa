import { describe, expect, it } from 'vitest'
import { DEFAULT_ML_SETTINGS } from '../db/db'
import { crashRecovery, resolveSegmentationConfig, shouldRefine } from './mlConfig'
import { DEFAULT_SEGMENTATION_MODEL, LIGHT_SEGMENTATION_MODEL } from './models'

const ml = DEFAULT_ML_SETTINGS

describe('ML config', () => {
  it('uses B2 on auto backend by default', () => {
    expect(resolveSegmentationConfig(ml)).toEqual({ modelId: DEFAULT_SEGMENTATION_MODEL, device: 'auto', dtype: 'auto' })
  })

  it('falls back to B0 after a crash, and to WASM after WebGPU failed, only when on auto', () => {
    expect(resolveSegmentationConfig({ ...ml, crashFallback: true }).modelId).toBe(LIGHT_SEGMENTATION_MODEL)
    expect(resolveSegmentationConfig({ ...ml, crashFallback: true, model: DEFAULT_SEGMENTATION_MODEL }).modelId).toBe(
      DEFAULT_SEGMENTATION_MODEL,
    )
    expect(resolveSegmentationConfig({ ...ml, webgpuBroken: true }).device).toBe('wasm')
    expect(resolveSegmentationConfig({ ...ml, webgpuBroken: true, device: 'webgpu' }).device).toBe('webgpu')
  })

  it('refines on auto unless it was slow or crashed', () => {
    expect(shouldRefine(ml)).toBe(true)
    expect(shouldRefine({ ...ml, refineBenchmarkMs: 5000 })).toBe(true)
    expect(shouldRefine({ ...ml, refineBenchmarkMs: 9000 })).toBe(false)
    expect(shouldRefine({ ...ml, refineCrashed: true })).toBe(false)
    expect(shouldRefine({ ...ml, refineEdges: 'on', refineBenchmarkMs: 9000 })).toBe(true)
    expect(shouldRefine({ ...ml, refineEdges: 'off' })).toBe(false)
  })

  it('steps down one level per crash, with a one-time notice', () => {
    const first = crashRecovery(ml, { stage: 'segment', modelId: DEFAULT_SEGMENTATION_MODEL, device: 'webgpu' })
    expect(first.changes).toEqual({ crashFallback: true })
    expect(first.notice).toMatch(/lighter/)

    const second = crashRecovery({ ...ml, ...first.changes }, { stage: 'segment', modelId: LIGHT_SEGMENTATION_MODEL, device: 'webgpu' })
    expect(second.changes).toEqual({ webgpuBroken: true })

    const refine = crashRecovery(ml, { stage: 'refine' })
    expect(refine.changes).toEqual({ refineCrashed: true })
  })

  it('never overrides explicit choices', () => {
    const explicit = { ...ml, model: DEFAULT_SEGMENTATION_MODEL, device: 'webgpu' as const, refineEdges: 'on' as const }
    expect(crashRecovery(explicit, { stage: 'segment', modelId: DEFAULT_SEGMENTATION_MODEL, device: 'webgpu' }).changes).toEqual({})
    expect(crashRecovery(explicit, { stage: 'refine' }).changes).toEqual({})
  })
})

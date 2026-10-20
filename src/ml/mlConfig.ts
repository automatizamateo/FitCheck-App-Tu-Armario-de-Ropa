import type { MlSettings } from '../domain/types'
import { DEFAULT_SEGMENTATION_MODEL, LIGHT_SEGMENTATION_MODEL, type Device, type Dtype } from './models'

export const REFINE_AUTO_LIMIT_MS = 6000

export interface SegmentationConfig {
  modelId: string
  device: Device // 'auto' = try WebGPU in the worker, fall back to WASM
  dtype: Dtype | 'auto' // 'auto' = fp16 on WebGPU, q8 on WASM
}

/** Turns stored preferences (and what we learned about this device) into what to load. */
export function resolveSegmentationConfig(ml: MlSettings): SegmentationConfig {
  const modelId = ml.model !== 'auto' ? ml.model : ml.crashFallback ? LIGHT_SEGMENTATION_MODEL : DEFAULT_SEGMENTATION_MODEL
  const device: Device = ml.device === 'auto' && ml.webgpuBroken ? 'wasm' : ml.device
  return { modelId, device, dtype: ml.dtype }
}

/** Same backend policy for the edge refiner. */
export function resolveRefinerConfig(ml: MlSettings): Pick<SegmentationConfig, 'device' | 'dtype'> {
  const { device, dtype } = resolveSegmentationConfig(ml)
  return { device, dtype }
}

export function shouldRefine(ml: MlSettings): boolean {
  if (ml.refineEdges !== 'auto') return ml.refineEdges === 'on'
  return !ml.refineCrashed && (ml.refineBenchmarkMs ?? 0) <= REFINE_AUTO_LIMIT_MS
}

export type MlStage = 'segment' | 'refine' | 'pose'

export interface InFlightMl {
  stage: MlStage
  modelId?: string
  device?: 'webgpu' | 'wasm' | Device
}

/**
 * Decides what to change after iOS killed the page during an ML stage. Only touches settings that
 * are on 'auto', so explicit choices in Settings → Advanced are respected.
 */
export function crashRecovery(ml: MlSettings, crashed: InFlightMl): { changes: Partial<MlSettings>; notice?: string } {
  const prefix = 'FitCheck ran out of memory last time while processing a photo'
  if (crashed.stage === 'refine' && ml.refineEdges === 'auto' && !ml.refineCrashed) {
    return {
      changes: { refineCrashed: true },
      notice: `${prefix}, so “Refine edges” is now off. You can turn it back on in Settings → Advanced.`,
    }
  }
  if (crashed.stage === 'segment' && ml.model === 'auto' && !ml.crashFallback && crashed.modelId === DEFAULT_SEGMENTATION_MODEL) {
    return {
      changes: { crashFallback: true },
      notice: `${prefix}, so it switched to a lighter background-removal model. Results may be a little less precise. You can change this in Settings → Advanced.`,
    }
  }
  if (crashed.stage === 'segment' && ml.device === 'auto' && !ml.webgpuBroken && crashed.device === 'webgpu') {
    return {
      changes: { webgpuBroken: true },
      notice: `${prefix}, so it switched from the GPU to the CPU. Processing will be slower but more stable.`,
    }
  }
  return {
    changes: {},
    notice: `${prefix}. If this keeps happening, try a lighter setup in Settings → Advanced.`,
  }
}

import type { MlSettings } from '../domain/types'
import { DEFAULT_SEGMENTATION_MODEL, LIGHT_SEGMENTATION_MODEL, type Device, type Dtype } from './models'

export const REFINE_AUTO_LIMIT_MS = 6000
/** Hard limit for one SlimSAM run; past it the worker is killed and the SegFormer mask is kept. */
export const REFINE_TIMEOUT_MS = 15_000
/** Loading SlimSAM from cache takes a few seconds; this also covers its first 14 MB download. */
export const REFINE_LOAD_TIMEOUT_MS = 90_000
/** Long side of the image SlimSAM gets. Its encoder always works at 1024² internally, so this mostly cuts pre/post-processing memory. */
export const REFINE_MAX_SIDE = 512

export interface SegmentationConfig {
  modelId: string
  device: Device // 'auto' = try WebGPU in the worker, fall back to WASM
  dtype: Dtype | 'auto' // 'auto' = fp16 on WebGPU, q8 on WASM
}

/** Turns stored preferences (and what we learned about this device) into what to load. */
export function resolveSegmentationConfig(ml: MlSettings): SegmentationConfig {
  const modelId = ml.model !== 'auto' ? ml.model : DEFAULT_SEGMENTATION_MODEL
  const device: Device = ml.device === 'auto' && ml.webgpuBroken ? 'wasm' : ml.device
  return { modelId, device, dtype: ml.dtype }
}

/**
 * SlimSAM refinement is opt-in on iOS: it is what gets the page killed on iPhones. Elsewhere 'auto'
 * keeps it on until a run is too slow.
 */
export function shouldRefine(ml: MlSettings, ios: boolean): boolean {
  if (ml.refineEdges !== 'auto') return ml.refineEdges === 'on'
  if (ios) return false
  return (ml.refineBenchmarkMs ?? 0) <= REFINE_AUTO_LIMIT_MS
}

export type MlStage = 'segment' | 'pose' | 'refine'

export interface InFlightMl {
  stage: MlStage
  step?: 'load' | 'run' | 'post'
  modelId?: string
  device?: 'webgpu' | 'wasm' | Device
}

interface Rung {
  /** Stages whose crash this rung is most likely to fix; tried first. */
  helps: MlStage[]
  apply: () => Partial<MlSettings>
  describe: string
}

/** The step-down ladder, lightest change first. */
const LADDER: Rung[] = [
  { helps: ['refine'], apply: () => ({ refineEdges: 'off' }), describe: '“Refine edges” is now off' },
  {
    helps: ['segment', 'pose'],
    apply: () => ({ model: LIGHT_SEGMENTATION_MODEL }),
    describe: 'it now uses a lighter background-removal model (results may be a little less precise)',
  },
  {
    helps: ['segment', 'pose'],
    apply: () => ({ device: 'wasm', dtype: 'auto' }),
    describe: 'it now uses the CPU instead of the GPU (slower but more stable)',
  },
]

function effective(ml: MlSettings, ios: boolean): string {
  return JSON.stringify({ ...resolveSegmentationConfig(ml), refine: shouldRefine(ml, ios) })
}

export interface CrashStepDown {
  changes: Partial<MlSettings>
  notice: string
  /** False when everything is already at the lightest setup. */
  steppedDown: boolean
}

/**
 * Decides what to change after iOS killed the page during an ML step: one rung down the ladder
 * (refine off → lighter model → CPU), skipping rungs that would change nothing. A rung that helps
 * the stage that crashed is preferred. Explicit choices are overridden too, so a crash can never repeat
 * with the same setup; Settings → Advanced → Reset to automatic undoes it.
 */
export function crashRecovery(ml: MlSettings, crashed: InFlightMl, ios: boolean): CrashStepDown {
  const prefix = 'FitCheck ran out of memory last time while processing a photo'
  const before = effective(ml, ios)
  const changesSomething = (r: Rung) => effective({ ...ml, ...r.apply() }, ios) !== before
  const rung = LADDER.find((r) => r.helps.includes(crashed.stage) && changesSomething(r)) ?? LADDER.find(changesSomething)
  if (!rung) {
    return {
      changes: {},
      steppedDown: false,
      notice: `${prefix}, and it is already using the lightest setup. Closing other apps or restarting the iPhone may help.`,
    }
  }
  return {
    changes: rung.apply(),
    steppedDown: true,
    notice: `${prefix}, so ${rung.describe}. You can change this in Settings → Advanced.`,
  }
}

import type { MlSettings, PoseLandmarks } from '../../domain/types'
import { getSettings, updateMlSettings } from '../../db/settings'
import { debugLog } from '../../lib/debugLog'
import { EDGE_WORK_SIDE, smoothMaskEdges, type Guide } from '../../lib/mask/edges'
import { blendBoundary, cleanupMask, iou, threshold } from '../../lib/mask/ops'
import { resizeMask } from '../../lib/mask/resample'
import { isIOS } from '../../lib/platform'
import { formatResources, releaseCanvas, trackBitmap } from '../../lib/resources'
import { TimeoutError, withTimeout } from '../../lib/timeout'
import { guardMl } from '../../ml/crashRecovery'
import {
  POSE_LOAD_TIMEOUT_MS,
  POSE_MAX_SIDE,
  POSE_TIMEOUT_MS,
  REFINE_AUTO_LIMIT_MS,
  REFINE_LOAD_TIMEOUT_MS,
  REFINE_MAX_SIDE,
  REFINE_TIMEOUT_MS,
  resolveSegmentationConfig,
  shouldRefine,
} from '../../ml/mlConfig'
import type { LoadInfo } from '../../ml/providers'
import type { PipelineSession } from '../../ml/session'

export type StageId = 'segment' | 'pose' | 'refine'

export interface StageUpdate {
  stage: StageId
  status: 'downloading' | 'running' | 'done' | 'skipped' | 'failed'
  loaded?: number
  total?: number
}

export interface ProcessedPhoto {
  mask: Uint8Array // 0/1 person mask at the photo's resolution
  width: number
  height: number
  landmarks: PoseLandmarks
  timings: Partial<Record<StageId, number>>
  notes: string[] // things the user should know (skipped steps, slow refinement, no pose found)
}

/** Browser-dependent helpers, replaceable in tests. */
export interface PipelineDeps {
  /** A copy of the photo (each worker consumes its own), optionally downscaled to maxSide. */
  copy(photo: ImageBitmap, maxSide?: number): Promise<ImageBitmap>
  /** The photo's luminance (0–1) at a long side of at most maxSide. */
  luminance(photo: ImageBitmap, maxSide: number): Guide
  ios: boolean
  poseTimeoutMs: number
  refineTimeoutMs: number
}

export const browserDeps: PipelineDeps = {
  copy: async (photo, maxSide) => {
    const scale = maxSide ? Math.min(1, maxSide / Math.max(photo.width, photo.height)) : 1
    if (scale === 1) return trackBitmap(await createImageBitmap(photo))
    return trackBitmap(
      await createImageBitmap(photo, {
        resizeWidth: Math.round(photo.width * scale),
        resizeHeight: Math.round(photo.height * scale),
        resizeQuality: 'medium',
      }),
    )
  },
  luminance: (photo, maxSide) => {
    const scale = Math.min(1, maxSide / Math.max(photo.width, photo.height))
    const width = Math.max(1, Math.round(photo.width * scale))
    const height = Math.max(1, Math.round(photo.height * scale))
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('Canvas unavailable')
    ctx.drawImage(photo, 0, 0, width, height)
    const rgba = ctx.getImageData(0, 0, width, height).data
    releaseCanvas(canvas)
    const data = new Float32Array(width * height)
    for (let i = 0; i < data.length; i++) {
      data[i] = (0.299 * (rgba[i * 4] ?? 0) + 0.587 * (rgba[i * 4 + 1] ?? 0) + 0.114 * (rgba[i * 4 + 2] ?? 0)) / 255
    }
    return { data, width, height }
  },
  ios: isIOS(),
  poseTimeoutMs: POSE_TIMEOUT_MS,
  refineTimeoutMs: REFINE_TIMEOUT_MS,
}

/** Below this overlap the refiner probably latched onto the wrong thing, so its result is ignored. */
const MIN_REFINE_IOU = 0.6

/**
 * Background removal → cheap edge cleanup → pose → optional SlimSAM refinement. Strictly sequential:
 * each model's worker is terminated before the next model loads, so only one is ever in memory.
 * Only segmentation is required: a failed or timed-out pose or refinement keeps the mask and adds
 * a note. `photo` is not consumed.
 */
export async function processPhoto(
  session: PipelineSession,
  photo: ImageBitmap,
  onStage: (update: StageUpdate) => void,
  deps: PipelineDeps = browserDeps,
): Promise<ProcessedPhoto> {
  const ml = session.settings
  const { width, height } = photo
  const timings: ProcessedPhoto['timings'] = {}
  const notes: string[] = []
  const refine = shouldRefine(ml, deps.ios)
  const resolved = resolveSegmentationConfig(ml, deps.ios)
  debugLog('pipeline start', {
    photo: `${width}×${height}`,
    model: resolved.modelId,
    device: resolved.device === 'auto' ? 'auto (WebGPU, else WASM)' : resolved.device,
    dtype: resolved.dtype === 'auto' ? 'auto (fp16 on WebGPU, q8 on WASM)' : resolved.dtype,
    refine,
    pose: !ml.skipPose,
    ios: deps.ios,
    verifiedRuns: ml.iosVerifiedRuns ?? 0,
    webgpuBroken: ml.webgpuBroken ?? false,
  })

  // 1. Person mask
  const seg = session.segmentation()
  const segInfo = await guardMl({ stage: 'segment', step: 'load', modelId: seg.modelId }, () =>
    seg.load((loaded, total) => {
      onStage({ stage: 'segment', status: 'downloading', loaded, total })
    }),
  )
  await rememberBackend(ml, segInfo)
  onStage({ stage: 'segment', status: 'running' })
  const segResult = await guardMl({ stage: 'segment', step: 'run', modelId: seg.modelId, device: segInfo.device }, async () =>
    seg.segmentGroups(await deps.copy(photo), [[...seg.personClasses]]),
  )
  timings.segment = segResult.ms
  const prob = segResult.masks[0]
  if (!prob) throw new Error('Segmentation returned no mask')
  let mask = cleanupMask(threshold(prob), width, height)

  // 1b. Cheap edge cleanup (no second model). Any failure keeps the plain SegFormer mask.
  try {
    const coarse = mask
    mask = await guardMl({ stage: 'segment', step: 'post' }, () =>
      Promise.resolve(smoothMaskEdges(coarse, width, height, deps.luminance(photo, EDGE_WORK_SIDE))),
    )
  } catch {
    /* logged by guardMl */
  }
  onStage({ stage: 'segment', status: 'done' })

  // Only one model in memory at a time: free SegFormer (sessions, GPU device, worker) before pose loads.
  await guardMl({ stage: 'segment', step: 'unload' }, () => session.unloadSegmentation()).catch(() => undefined)
  debugLog(`segment.unloaded ${formatResources()}`)

  // 2. Pose, before any refinement. Optional: without it the user aligns clothes by hand.
  let landmarks: PoseLandmarks = {}
  if (ml.skipPose) {
    notes.push('Pose detection is off on this device, so you’ll line clothes up by hand. You can turn it on in Settings → Advanced.')
    onStage({ stage: 'pose', status: 'skipped' })
  } else {
    const pose = await detectPose(session, photo, onStage, deps, notes)
    if (pose) {
      landmarks = pose.landmarks
      timings.pose = pose.ms
    }
  }

  // 3. Optional SlimSAM refinement
  if (refine) {
    const refined = await refineWithSam(session, photo, mask, onStage, deps, notes)
    if (refined) {
      mask = refined.mask
      timings.refine = refined.ms
    }
  } else {
    onStage({ stage: 'refine', status: 'skipped' })
  }

  if (deps.ios) {
    // A full photo finished on this device: iOS auto may now step up from the safe start (see resolveSegmentationConfig).
    const runs = ((await getSettings()).ml.iosVerifiedRuns ?? 0) + 1
    await updateMlSettings({ iosVerifiedRuns: runs })
  }
  debugLog(`pipeline done ${formatResources()}`, { notes: notes.length })
  return { mask, width, height, landmarks, timings, notes }
}

/**
 * Runs the Pose Landmarker (lite, CPU delegate, own worker) on a downscaled copy under timeouts, and
 * always unloads it afterwards. Returns null (and adds a note) on any failure.
 */
async function detectPose(
  session: PipelineSession,
  photo: ImageBitmap,
  onStage: (update: StageUpdate) => void,
  deps: PipelineDeps,
  notes: string[],
): Promise<{ landmarks: PoseLandmarks; ms: number } | null> {
  const ml = session.settings
  const abort = () => {
    void session.unloadPose()
  }
  try {
    const pose = session.poseDetector()
    await guardMl({ stage: 'pose', step: 'load' }, () =>
      withTimeout(
        pose.load((loaded, total) => {
          onStage({ stage: 'pose', status: 'downloading', loaded, total })
        }),
        POSE_LOAD_TIMEOUT_MS,
        'Loading pose detection',
        abort,
      ),
    )
    onStage({ stage: 'pose', status: 'running' })
    const small = await deps.copy(photo, POSE_MAX_SIDE)
    const res = await guardMl({ stage: 'pose', step: 'run' }, () =>
      withTimeout(pose.detect(small), deps.poseTimeoutMs, 'Detecting pose', abort),
    )
    if (!res.landmarks.leftShoulder || !res.landmarks.rightHip) {
      notes.push('Couldn’t detect your pose clearly. Clothes may need manual positioning later; a retake may help.')
    }
    if (ml.poseCrashes) await updateMlSettings({ poseCrashes: 0 })
    onStage({ stage: 'pose', status: 'done' })
    return res
  } catch (err) {
    notes.push(`Pose detection didn’t finish (${errorText(err)}). Your cut-out is fine; you’ll line clothes up by hand.`)
    onStage({ stage: 'pose', status: 'failed' })
    return null
  } finally {
    await guardMl({ stage: 'pose', step: 'unload' }, () => session.unloadPose()).catch(() => undefined)
    debugLog(`pose.unloaded ${formatResources()}`)
  }
}

/**
 * Frees the other models, runs SlimSAM on a downscaled copy under a hard timeout, and always frees
 * SlimSAM afterwards. Returns null (and adds a note) on any failure, so the caller keeps its mask.
 */
async function refineWithSam(
  session: PipelineSession,
  photo: ImageBitmap,
  mask: Uint8Array,
  onStage: (update: StageUpdate) => void,
  deps: PipelineDeps,
  notes: string[],
): Promise<{ mask: Uint8Array; ms: number } | null> {
  const ml = session.settings
  const { width, height } = photo
  try {
    const refiner = session.edgeRefiner()
    const abort = () => {
      session.releaseRefiner()
    }
    const info = await guardMl({ stage: 'refine', step: 'load' }, () =>
      withTimeout(
        refiner.load((loaded, total) => {
          onStage({ stage: 'refine', status: 'downloading', loaded, total })
        }),
        REFINE_LOAD_TIMEOUT_MS,
        'Loading the edge refiner',
        abort,
      ),
    )
    onStage({ stage: 'refine', status: 'running' })
    const small = await deps.copy(photo, REFINE_MAX_SIDE)
    const sw = small.width
    const sh = small.height
    const smallMask = resizeMask(mask, width, height, sw, sh)
    const result = await guardMl({ stage: 'refine', step: 'run', modelId: info.modelId, device: info.device }, () =>
      withTimeout(refiner.refine(small, smallMask, sw, sh), deps.refineTimeoutMs, 'Refining edges', abort),
    )
    const fine = resizeMask(result.mask, sw, sh, width, height)

    if (ml.refineEdges === 'auto') {
      await updateMlSettings({ refineBenchmarkMs: Math.round(result.ms) })
      if (result.ms > REFINE_AUTO_LIMIT_MS) {
        notes.push(
          `Refining edges took ${(result.ms / 1000).toFixed(1)} s on this device, so it will be skipped from now on. You can turn it back on in Settings → Advanced.`,
        )
      }
    }
    if (iou(fine, mask) < MIN_REFINE_IOU) {
      notes.push('Edge refinement didn’t match this photo well, so it was skipped.')
      onStage({ stage: 'refine', status: 'done' })
      return null
    }
    const band = Math.max(4, Math.round(0.012 * Math.max(width, height)))
    onStage({ stage: 'refine', status: 'done' })
    return { mask: cleanupMask(blendBoundary(mask, fine, width, height, band), width, height), ms: result.ms }
  } catch (err) {
    if (err instanceof TimeoutError && ml.refineEdges === 'auto') {
      await updateMlSettings({ refineBenchmarkMs: deps.refineTimeoutMs }).catch(() => undefined)
    }
    notes.push(`Edge refinement didn’t finish (${errorText(err)}), so the basic cut-out is used.`)
    onStage({ stage: 'refine', status: 'failed' })
    return null
  } finally {
    session.releaseRefiner()
  }
}

async function rememberBackend(ml: MlSettings, info: LoadInfo) {
  const changes: Partial<MlSettings> = { lastUsed: { modelId: info.modelId, device: info.device, dtype: info.dtype } }
  if (info.fallbackReason && ml.device === 'auto' && info.device === 'wasm') {
    changes.webgpuBroken = true
    debugLog('WebGPU failed, using WASM', { reason: info.fallbackReason })
  }
  await updateMlSettings(changes)
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

import type { MlSettings, PoseLandmarks } from '../../domain/types'
import { updateMlSettings } from '../../db/settings'
import { blendBoundary, cleanupMask, iou, threshold } from '../../lib/mask/ops'
import { guardMl } from '../../ml/crashRecovery'
import { REFINE_AUTO_LIMIT_MS, shouldRefine } from '../../ml/mlConfig'
import type { LoadInfo } from '../../ml/providers'
import type { MlSession } from '../../ml/session'

export type StageId = 'segment' | 'refine' | 'pose'

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

/** Below this overlap the refiner probably latched onto the wrong thing, so its result is ignored. */
const MIN_REFINE_IOU = 0.6

/**
 * Background removal + optional edge refinement + pose for one photo. Runs one model at a time.
 * `photo` is not consumed; each stage gets its own copy.
 */
export async function processPhoto(
  session: MlSession,
  photo: ImageBitmap,
  onStage: (update: StageUpdate) => void,
): Promise<ProcessedPhoto> {
  const ml = session.settings
  const { width, height } = photo
  const timings: ProcessedPhoto['timings'] = {}
  const notes: string[] = []

  // 1. Person mask
  const seg = session.segmentation()
  const segInfo = await seg.load((loaded, total) => {
    onStage({ stage: 'segment', status: 'downloading', loaded, total })
  })
  await rememberBackend(ml, segInfo)
  onStage({ stage: 'segment', status: 'running' })
  const segResult = await guardMl({ stage: 'segment', modelId: seg.modelId, device: segInfo.device }, async () =>
    seg.segmentGroups(await createImageBitmap(photo), [[...seg.personClasses]]),
  )
  timings.segment = segResult.ms
  const prob = segResult.masks[0]
  if (!prob) throw new Error('Segmentation returned no mask')
  let mask = cleanupMask(threshold(prob), width, height)
  onStage({ stage: 'segment', status: 'done' })

  // 2. Optional edge refinement
  if (shouldRefine(ml)) {
    try {
      const refiner = session.edgeRefiner()
      const info = await refiner.load((loaded, total) => {
        onStage({ stage: 'refine', status: 'downloading', loaded, total })
      })
      onStage({ stage: 'refine', status: 'running' })
      const refined = await guardMl({ stage: 'refine', modelId: info.modelId, device: info.device }, async () =>
        refiner.refine(await createImageBitmap(photo), mask, width, height),
      )
      timings.refine = refined.ms
      if (iou(refined.mask, mask) >= MIN_REFINE_IOU) {
        const band = Math.max(4, Math.round(0.012 * Math.max(width, height)))
        mask = cleanupMask(blendBoundary(mask, refined.mask, width, height, band), width, height)
      } else {
        notes.push('Edge refinement didn’t match this photo well, so it was skipped.')
      }
      if (ml.refineEdges === 'auto') {
        await updateMlSettings({ refineBenchmarkMs: Math.round(refined.ms) })
        if (refined.ms > REFINE_AUTO_LIMIT_MS) {
          notes.push(
            `Refining edges took ${(refined.ms / 1000).toFixed(1)} s on this device, so it will be skipped from now on. You can turn it back on in Settings → Advanced.`,
          )
        }
      }
      onStage({ stage: 'refine', status: 'done' })
    } catch (err) {
      notes.push(`Edge refinement failed (${err instanceof Error ? err.message : String(err)}). Using the basic cut-out.`)
      onStage({ stage: 'refine', status: 'failed' })
    }
  } else {
    onStage({ stage: 'refine', status: 'skipped' })
  }

  // 3. Pose
  let landmarks: PoseLandmarks = {}
  try {
    const pose = session.poseDetector()
    await pose.load((loaded, total) => {
      onStage({ stage: 'pose', status: 'downloading', loaded, total })
    })
    onStage({ stage: 'pose', status: 'running' })
    const res = await guardMl({ stage: 'pose' }, async () => pose.detect(await createImageBitmap(photo)))
    landmarks = res.landmarks
    timings.pose = res.ms
    if (!landmarks.leftShoulder || !landmarks.rightHip) {
      notes.push('Couldn’t detect your pose clearly. Clothes may need manual positioning later; a retake may help.')
    }
    onStage({ stage: 'pose', status: 'done' })
  } catch (err) {
    notes.push(`Pose detection failed (${err instanceof Error ? err.message : String(err)}).`)
    onStage({ stage: 'pose', status: 'failed' })
  }

  return { mask, width, height, landmarks, timings, notes }
}

async function rememberBackend(ml: MlSettings, info: LoadInfo) {
  const changes: Partial<MlSettings> = { lastUsed: { modelId: info.modelId, device: info.device, dtype: info.dtype } }
  if (info.fallbackReason && ml.device === 'auto' && info.device === 'wasm') changes.webgpuBroken = true
  await updateMlSettings(changes)
}

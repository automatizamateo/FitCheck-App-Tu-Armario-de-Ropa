import type { PoseLandmarks } from '../domain/types'
import type { SegmentationConfig } from './mlConfig'
import { CLOTHES_LABELS, PERSON_CLASSES, SLIMSAM, type Dtype } from './models'
import { withTimeout } from '../lib/timeout'
import type { DisposedMessage, PoseResponse, RefineResultMessage, SamResponse } from './protocol'
import { SegmentationClient } from './segmentationClient'
import { WorkerRpc } from './workerRpc'

export type ProgressFn = (loaded: number, total: number) => void

export interface LoadInfo {
  modelId: string
  device: 'webgpu' | 'wasm'
  dtype: Dtype
  ms: number
  fallbackReason?: string
}

/**
 * Anything that labels pixels by class. The UI and pipelines only talk to this interface, so the
 * model (and its license) can be swapped without touching them. Image arguments are transferred
 * to a worker, so pass a copy you no longer need.
 */
export interface SegmentationProvider {
  readonly modelId: string
  readonly labels: readonly string[]
  /** Class indices that together make up "the person" (everything but background). */
  readonly personClasses: readonly number[]
  load(onProgress?: ProgressFn): Promise<LoadInfo>
  /** One 0–255 probability map per group of class indices, at the image's resolution. */
  segmentGroups(image: ImageBitmap, groups: number[][]): Promise<{ masks: Uint8Array[]; width: number; height: number; ms: number }>
  /** Frees the model inside its worker, then terminates the worker. Resolves once it is gone. */
  unload(): Promise<void>
  dispose(): void
}

/** Improves the contour of a rough binary mask. */
export interface EdgeRefiner {
  load(onProgress?: ProgressFn): Promise<LoadInfo>
  refine(image: ImageBitmap, mask: Uint8Array, width: number, height: number): Promise<{ mask: Uint8Array; iou: number; ms: number }>
  dispose(): void
}

export interface PoseProvider {
  load(onProgress?: ProgressFn): Promise<void>
  detect(image: ImageBitmap): Promise<{ landmarks: PoseLandmarks; ms: number }>
  /** Closes the landmarker inside its worker, then terminates the worker. */
  unload(): Promise<void>
  dispose(): void
}

/** Memoizes a load so concurrent or repeated calls share one download. */
function once<T>(fn: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | null = null
  return () => {
    promise ??= fn().catch((err: unknown) => {
      promise = null
      throw err
    })
    return promise
  }
}

/** SegFormer clothes-parsing models (ATR labels) via Transformers.js. */
class SegformerProvider implements SegmentationProvider {
  readonly labels = CLOTHES_LABELS
  readonly personClasses = PERSON_CLASSES
  private readonly client = new SegmentationClient()
  private progress: ProgressFn | undefined
  readonly modelId: string
  private readonly loadOnce: () => Promise<LoadInfo>

  constructor(config: SegmentationConfig) {
    this.modelId = config.modelId
    this.client.onProgress = (l, t) => this.progress?.(l, t)
    this.loadOnce = once(async () => {
      const res = await this.client.load(config.modelId, config.device, config.dtype)
      return { modelId: config.modelId, device: res.device, dtype: res.dtype, ms: res.ms, fallbackReason: res.fallbackReason }
    })
  }

  load(onProgress?: ProgressFn) {
    this.progress = onProgress
    return this.loadOnce()
  }

  async segmentGroups(image: ImageBitmap, groups: number[][]) {
    const start = performance.now()
    const res = await this.client.segment(image, { groups })
    return { masks: res.groupMasks, width: res.imageWidth, height: res.imageHeight, ms: performance.now() - start }
  }

  unload() {
    return this.client.unload()
  }

  dispose() {
    this.client.terminate()
  }
}

const SEGMENTATION_PROVIDERS: { matches: (modelId: string) => boolean; create: (c: SegmentationConfig) => SegmentationProvider }[] = [
  { matches: (id) => /segformer/i.test(id), create: (c) => new SegformerProvider(c) },
]

export function createSegmentationProvider(config: SegmentationConfig): SegmentationProvider {
  const entry = SEGMENTATION_PROVIDERS.find((p) => p.matches(config.modelId))
  if (!entry) throw new Error(`No segmentation provider for ${config.modelId}`)
  return entry.create(config)
}

/**
 * SlimSAM, prompted with points sampled from the rough mask, in its own worker. Always WASM q8: it is
 * the smallest and most predictable on memory, and a WebGPU SAM is what got iPhones killed. dispose()
 * terminates the worker, which frees everything it allocated.
 */
export class SlimSamRefiner implements EdgeRefiner {
  private readonly rpc = new WorkerRpc<SamResponse>(
    () => new Worker(new URL('./sam.worker.ts', import.meta.url), { type: 'module' }),
  )
  private readonly loadOnce = once(async (): Promise<LoadInfo> => {
    const res = await this.rpc.request<Extract<SamResponse, { type: 'loaded' }>>({
      type: 'load',
      modelId: SLIMSAM.id,
      device: 'wasm',
      dtype: 'q8',
    })
    return { modelId: SLIMSAM.id, device: res.device, dtype: res.dtype, ms: res.ms, fallbackReason: res.fallbackReason }
  })

  load(onProgress?: ProgressFn) {
    this.rpc.onProgress = onProgress ?? null
    return this.loadOnce()
  }

  async refine(image: ImageBitmap, mask: Uint8Array, width: number, height: number) {
    const copy = mask.slice()
    const res = await this.rpc.request<RefineResultMessage>({ type: 'refine', image, mask: copy, width, height }, [image, copy.buffer])
    return { mask: res.mask, iou: res.iou, ms: res.ms }
  }

  dispose() {
    this.rpc.terminate()
  }
}

/** MediaPipe Pose Landmarker (lite), CPU delegate, in its own worker. */
export class MediaPipePoseProvider implements PoseProvider {
  private readonly rpc = new WorkerRpc<PoseResponse>(
    () => new Worker(new URL('./pose.worker.ts', import.meta.url), { type: 'module' }),
  )
  private readonly loadOnce = once(async () => {
    await this.rpc.request({ type: 'load' })
  })

  load(onProgress?: ProgressFn) {
    this.rpc.onProgress = onProgress ?? null
    return this.loadOnce()
  }

  async detect(image: ImageBitmap) {
    const res = await this.rpc.request<Extract<PoseResponse, { type: 'pose' }>>({ type: 'detect', image }, [image])
    return { landmarks: res.landmarks, ms: res.ms }
  }

  async unload() {
    if (!this.rpc.alive) return
    try {
      await withTimeout(this.rpc.request<DisposedMessage>({ type: 'dispose' }), 3000, 'Unloading pose')
    } finally {
      this.rpc.terminate()
    }
  }

  dispose() {
    this.rpc.terminate()
  }
}

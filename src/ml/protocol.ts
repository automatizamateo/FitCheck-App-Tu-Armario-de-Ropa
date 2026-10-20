import type { PoseLandmarks } from '../domain/types'
import type { Device, Dtype } from './models'

/** Every worker may also send progress (downloads) and errors. */
export type Outbound<R> = R | { type: 'progress'; loaded: number; total: number } | { type: 'error'; message: string }

export interface LoadedMessage {
  type: 'loaded'
  device: 'webgpu' | 'wasm'
  dtype: Dtype
  ms: number
  webgpuAvailable: boolean
  fallbackReason?: string
}

// Segmentation worker
export type WorkerRequest =
  | { type: 'load'; modelId: string; device: Device; dtype: Dtype | 'auto' }
  | {
      type: 'segment'
      image: ImageBitmap
      /** Also return an argmax label map with this long side (lab only). */
      labelMaxSide?: number
      /** Return, per group of class indices, a 0–255 probability map at image resolution. */
      groups?: number[][]
    }

export interface SegmentResultMessage {
  type: 'result'
  labels: Uint8Array | null
  width: number // label map size
  height: number
  groupMasks: Uint8Array[]
  imageWidth: number
  imageHeight: number
  timings: { preprocess: number; inference: number; postprocess: number }
}

export type WorkerResponse = LoadedMessage | SegmentResultMessage

// Edge refiner (SlimSAM) worker
export type SamRequest =
  | { type: 'load'; modelId: string; device: Device; dtype: Dtype | 'auto' }
  | { type: 'refine'; image: ImageBitmap; mask: Uint8Array; width: number; height: number }

export interface RefineResultMessage {
  type: 'refined'
  mask: Uint8Array // 0/1 at image resolution; the candidate that best matches the input mask
  iou: number
  ms: number
}

export type SamResponse = LoadedMessage | RefineResultMessage

// Pose worker
export type PoseRequest = { type: 'load' } | { type: 'detect'; image: ImageBitmap }

export type PoseResponse = { type: 'loaded'; ms: number } | { type: 'pose'; landmarks: PoseLandmarks; ms: number }

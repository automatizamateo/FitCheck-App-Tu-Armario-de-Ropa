import type { Device, Dtype } from './models'

export type WorkerRequest =
  | { type: 'load'; modelId: string; device: Device; dtype: Dtype }
  | { type: 'segment'; image: ImageBitmap; maxMaskSide: number }

export type WorkerResponse =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'loaded'; device: 'webgpu' | 'wasm'; dtype: Dtype; ms: number; webgpuAvailable: boolean; fallbackReason?: string }
  | {
      type: 'result'
      labels: Uint8Array
      width: number
      height: number
      timings: { preprocess: number; inference: number; postprocess: number }
    }
  | { type: 'error'; message: string }

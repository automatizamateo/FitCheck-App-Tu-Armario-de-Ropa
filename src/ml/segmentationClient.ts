import type { Device, Dtype } from './models'
import type { LoadedMessage, SegmentResultMessage, WorkerResponse } from './protocol'
import { WorkerRpc } from './workerRpc'

export type LoadResult = LoadedMessage
export type SegmentResult = SegmentResultMessage

/** Owns the segmentation Web Worker. One request at a time; terminate() frees all model memory. */
export class SegmentationClient {
  private readonly rpc = new WorkerRpc<WorkerResponse>(
    () => new Worker(new URL('./segmentation.worker.ts', import.meta.url), { type: 'module' }),
  )

  set onProgress(fn: ((loaded: number, total: number) => void) | null) {
    this.rpc.onProgress = fn
  }

  load(modelId: string, device: Device, dtype: Dtype | 'auto'): Promise<LoadResult> {
    return this.rpc.request<LoadResult>({ type: 'load', modelId, device, dtype })
  }

  /** Transfers (and so consumes) `image`. */
  segment(image: ImageBitmap, options: { labelMaxSide?: number; groups?: number[][] }): Promise<SegmentResult> {
    return this.rpc.request<SegmentResult>({ type: 'segment', image, ...options }, [image])
  }

  terminate() {
    this.rpc.terminate()
  }
}

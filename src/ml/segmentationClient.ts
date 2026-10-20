import type { Device, Dtype } from './models'
import type { WorkerResponse } from './protocol'

export type LoadResult = Extract<WorkerResponse, { type: 'loaded' }>
export type SegmentResult = Extract<WorkerResponse, { type: 'result' }>

/** Owns the segmentation Web Worker. One request at a time; terminate() frees all model memory. */
export class SegmentationClient {
  private worker: Worker | null = null
  private pending: { resolve: (r: WorkerResponse) => void; reject: (e: Error) => void } | null = null
  onProgress: ((loaded: number, total: number) => void) | null = null

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const worker = new Worker(new URL('./segmentation.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data
      if (msg.type === 'progress') {
        this.onProgress?.(msg.loaded, msg.total)
        return
      }
      const pending = this.pending
      this.pending = null
      if (msg.type === 'error') pending?.reject(new Error(msg.message))
      else pending?.resolve(msg)
    }
    worker.onerror = (event) => {
      this.pending?.reject(new Error(event.message || 'Worker crashed'))
      this.pending = null
      this.terminate()
    }
    this.worker = worker
    return worker
  }

  private request(message: unknown, transfer: Transferable[] = []): Promise<WorkerResponse> {
    if (this.pending) return Promise.reject(new Error('Another request is in progress'))
    const worker = this.ensureWorker()
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject }
      worker.postMessage(message, transfer)
    })
  }

  async load(modelId: string, device: Device, dtype: Dtype): Promise<LoadResult> {
    return (await this.request({ type: 'load', modelId, device, dtype })) as LoadResult
  }

  async segment(image: ImageBitmap, maxMaskSide: number): Promise<SegmentResult> {
    return (await this.request({ type: 'segment', image, maxMaskSide }, [image])) as SegmentResult
  }

  terminate() {
    this.worker?.terminate()
    this.worker = null
    this.pending?.reject(new Error('Worker terminated'))
    this.pending = null
  }
}

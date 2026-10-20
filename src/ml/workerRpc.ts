interface ProgressMessage {
  type: 'progress'
  loaded: number
  total: number
}
interface ErrorMessage {
  type: 'error'
  message: string
}

/** Main-thread side of a worker that answers one request at a time. terminate() frees all its memory. */
export class WorkerRpc<Res extends { type: string }> {
  private worker: Worker | null = null
  private pending: { resolve: (r: Res) => void; reject: (e: Error) => void } | null = null
  onProgress: ((loaded: number, total: number) => void) | null = null

  private readonly create: () => Worker

  constructor(create: () => Worker) {
    this.create = create
  }

  private ensure(): Worker {
    if (this.worker) return this.worker
    const worker = this.create()
    worker.onmessage = (event: MessageEvent<Res | ProgressMessage | ErrorMessage>) => {
      const msg = event.data
      if (msg.type === 'progress') {
        const p = msg as ProgressMessage
        this.onProgress?.(p.loaded, p.total)
        return
      }
      const pending = this.pending
      this.pending = null
      if (msg.type === 'error') pending?.reject(new Error((msg as ErrorMessage).message))
      else pending?.resolve(msg as Res)
    }
    worker.onerror = (event) => {
      event.preventDefault()
      this.pending?.reject(new Error(event.message || 'Worker crashed'))
      this.pending = null
      this.terminate()
    }
    this.worker = worker
    return worker
  }

  request<R extends Res>(message: unknown, transfer: Transferable[] = []): Promise<R> {
    if (this.pending) return Promise.reject(new Error('Another request is in progress'))
    const worker = this.ensure()
    return new Promise<R>((resolve, reject) => {
      this.pending = { resolve: resolve as (r: Res) => void, reject }
      worker.postMessage(message, transfer)
    })
  }

  terminate() {
    this.worker?.terminate()
    this.worker = null
    this.pending?.reject(new Error('Worker terminated'))
    this.pending = null
  }
}

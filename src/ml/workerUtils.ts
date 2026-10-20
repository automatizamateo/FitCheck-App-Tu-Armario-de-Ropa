/// <reference lib="webworker" />
import { env, RawImage, type ProgressInfo, type Tensor } from '@huggingface/transformers'
import { defaultDtype, type Device, type Dtype } from './models'

export const webgpuInNavigator = 'gpu' in navigator

/**
 * Serves the ONNX Runtime WASM from our own origin instead of jsDelivr. Transformers.js then stores it in
 * Cache Storage ('transformers-cache') next to the model files, so both work offline after the first load.
 * The asyncify build is required for the WebGPU execution provider; the plain build is smaller.
 */
export function configureOnnxRuntime() {
  const variant = webgpuInNavigator ? '.asyncify' : ''
  const base = new URL(`${import.meta.env.BASE_URL}ort/ort-wasm-simd-threaded${variant}`, self.location.origin).href
  if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = { mjs: `${base}.mjs`, wasm: `${base}.wasm` }
  env.allowLocalModels = false
}

export async function hasWebGPUAdapter(): Promise<boolean> {
  if (!webgpuInNavigator) return false
  try {
    return (await navigator.gpu.requestAdapter()) !== null
  } catch {
    return false
  }
}

export interface Backend {
  device: 'webgpu' | 'wasm'
  dtype: Dtype
}

/** Backends to try in order. 'auto' tries WebGPU (if an adapter exists in this worker) and then WASM. */
export async function backendCandidates(device: Device, dtype: Dtype | 'auto'): Promise<Backend[]> {
  const pick = (d: 'webgpu' | 'wasm'): Backend => ({ device: d, dtype: dtype === 'auto' ? defaultDtype(d) : dtype })
  if (device !== 'auto') return [pick(device)]
  return (await hasWebGPUAdapter()) ? [pick('webgpu'), pick('wasm')] : [pick('wasm')]
}

/**
 * Loads with the first backend that works. On WebGPU a warm-up run is part of "works": Safari can
 * accept a model and only fail on the first inference.
 */
export async function loadFirstWorking<T>(
  candidates: Backend[],
  load: (b: Backend) => Promise<T>,
  warmup: (model: T, b: Backend) => Promise<void>,
  dispose: (model: T) => Promise<unknown>,
): Promise<{ model: T; backend: Backend; fallbackReason?: string }> {
  let fallbackReason: string | undefined
  for (const [i, backend] of candidates.entries()) {
    const isLast = i === candidates.length - 1
    let model: T | undefined
    try {
      model = await load(backend)
      if (backend.device === 'webgpu' && !isLast) await warmup(model, backend)
      return { model, backend, fallbackReason }
    } catch (err) {
      if (model !== undefined) await dispose(model).catch(() => undefined)
      if (isLast) throw err
      fallbackReason = `${backend.device} failed: ${errorMessage(err)}`
    }
  }
  throw new Error('No backend available')
}

export function progressForwarder(post: (loaded: number, total: number) => void) {
  return (info: ProgressInfo) => {
    if (info.status === 'progress_total') post(info.loaded, info.total)
  }
}

/** Draws a bitmap into an OffscreenCanvas, closes the bitmap, and returns an RGB RawImage. */
export function rawImageFromBitmap(image: ImageBitmap): { raw: RawImage; width: number; height: number } {
  const canvas = new OffscreenCanvas(image.width, image.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable')
  ctx.drawImage(image, 0, 0)
  image.close()
  return { raw: RawImage.fromCanvas(canvas).rgb(), width: canvas.width, height: canvas.height }
}

/** Disposes every Tensor value in the given objects (frees WASM / GPU memory right away). */
export function disposeTensors(...objects: (Record<string, unknown> | null | undefined)[]) {
  for (const obj of objects) {
    if (!obj) continue
    for (const value of Object.values(obj)) {
      const t = value as Partial<Tensor> | null
      if (t && typeof t === 'object' && typeof t.dispose === 'function' && 'dims' in t) t.dispose()
    }
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

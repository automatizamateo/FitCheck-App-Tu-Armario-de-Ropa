/// <reference lib="webworker" />
import {
  AutoModel,
  AutoProcessor,
  RawImage,
  env,
  interpolate_4d,
  type PreTrainedModel,
  type Processor,
  type ProgressInfo,
  type Tensor,
} from '@huggingface/transformers'
import type { Dtype } from './models'
import type { WorkerRequest, WorkerResponse } from './protocol'

declare const self: DedicatedWorkerGlobalScope

const webgpuAvailable = 'gpu' in navigator

// Serve the ONNX Runtime WASM from our own origin instead of jsDelivr. Transformers.js then stores it in
// Cache Storage ('transformers-cache') next to the model files, so both work offline after the first load.
// The asyncify build is required for the WebGPU execution provider; the plain build is smaller.
const ortVariant = webgpuAvailable ? '.asyncify' : ''
const ortBase = new URL(`${import.meta.env.BASE_URL}ort/ort-wasm-simd-threaded${ortVariant}`, self.location.origin).href
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = { mjs: `${ortBase}.mjs`, wasm: `${ortBase}.wasm` }
}
env.allowLocalModels = false

let processor: Processor | null = null
let model: PreTrainedModel | null = null

function post(message: WorkerResponse, transfer: Transferable[] = []) {
  self.postMessage(message, transfer)
}

function onProgress(info: ProgressInfo) {
  if (info.status === 'progress_total') post({ type: 'progress', loaded: info.loaded, total: info.total })
}

async function hasWebGPUAdapter(): Promise<boolean> {
  if (!webgpuAvailable) return false
  try {
    return (await navigator.gpu.requestAdapter()) !== null
  } catch {
    return false
  }
}

async function load(modelId: string, device: 'webgpu' | 'wasm', dtype: Dtype) {
  await model?.dispose()
  model = null
  processor = await AutoProcessor.from_pretrained(modelId, { progress_callback: onProgress })
  model = await AutoModel.from_pretrained(modelId, { device, dtype, progress_callback: onProgress })
}

async function handleLoad({ modelId, device, dtype }: Extract<WorkerRequest, { type: 'load' }>) {
  const start = performance.now()
  const gpuOk = await hasWebGPUAdapter()
  let resolved: 'webgpu' | 'wasm' = device === 'auto' ? (gpuOk ? 'webgpu' : 'wasm') : device
  let fallbackReason: string | undefined
  try {
    await load(modelId, resolved, dtype)
  } catch (err) {
    if (device !== 'auto' || resolved === 'wasm') throw err
    fallbackReason = `WebGPU failed: ${errorMessage(err)}`
    resolved = 'wasm'
    await load(modelId, resolved, dtype)
  }
  post({ type: 'loaded', device: resolved, dtype, ms: performance.now() - start, webgpuAvailable: gpuOk, fallbackReason })
}

async function handleSegment({ image, maxMaskSide }: Extract<WorkerRequest, { type: 'segment' }>) {
  if (!model || !processor) throw new Error('Model not loaded')

  let t = performance.now()
  const canvas = new OffscreenCanvas(image.width, image.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable')
  ctx.drawImage(image, 0, 0)
  image.close()
  const raw = RawImage.fromCanvas(canvas).rgb()
  const inputs = (await processor(raw)) as { pixel_values: Tensor }
  const preprocess = performance.now() - t

  t = performance.now()
  const { logits } = (await model(inputs)) as { logits: Tensor }
  const inference = performance.now() - t

  t = performance.now()
  const scale = Math.min(1, maxMaskSide / Math.max(canvas.width, canvas.height))
  const width = Math.round(canvas.width * scale)
  const height = Math.round(canvas.height * scale)
  const upsampled = await interpolate_4d(logits, { size: [height, width], mode: 'bilinear' })
  const labels = argmaxChannels(upsampled.data as Float32Array, upsampled.dims[1] ?? 0, width * height)
  inputs.pixel_values.dispose()
  logits.dispose()
  upsampled.dispose()
  const postprocess = performance.now() - t

  post({ type: 'result', labels, width, height, timings: { preprocess, inference, postprocess } }, [labels.buffer])
}

/** data is [C, H*W] (batch 1); returns the winning channel per pixel. */
function argmaxChannels(data: Float32Array, channels: number, pixels: number): Uint8Array {
  const out = new Uint8Array(pixels)
  for (let p = 0; p < pixels; p++) {
    let best = 0
    let bestValue = data[p] ?? -Infinity
    for (let c = 1; c < channels; c++) {
      const v = data[c * pixels + p] ?? -Infinity
      if (v > bestValue) {
        bestValue = v
        best = c
      }
    }
    out[p] = best
  }
  return out
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data
  const task = message.type === 'load' ? handleLoad(message) : handleSegment(message)
  task.catch((err: unknown) => {
    post({ type: 'error', message: errorMessage(err) })
  })
}

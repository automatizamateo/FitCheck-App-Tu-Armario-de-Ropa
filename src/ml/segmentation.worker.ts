/// <reference lib="webworker" />
import {
  AutoModel,
  AutoProcessor,
  RawImage,
  interpolate_4d,
  type PreTrainedModel,
  type Processor,
  type Tensor,
} from '@huggingface/transformers'
import { groupProbability, resizeBilinearToUint8 } from '../lib/mask/resample'
import type { Outbound, WorkerRequest, WorkerResponse } from './protocol'
import {
  backendCandidates,
  configureOnnxRuntime,
  disposeTensors,
  errorMessage,
  hasWebGPUAdapter,
  loadFirstWorking,
  progressForwarder,
  rawImageFromBitmap,
} from './workerUtils'

declare const self: DedicatedWorkerGlobalScope

configureOnnxRuntime()

let processor: Processor | null = null
let model: PreTrainedModel | null = null

function post(message: Outbound<WorkerResponse>, transfer: Transferable[] = []) {
  self.postMessage(message, transfer)
}

const onProgress = progressForwarder((loaded, total) => {
  post({ type: 'progress', loaded, total })
})

async function runModel(m: PreTrainedModel, p: Processor, raw: RawImage): Promise<Tensor> {
  const inputs = (await p(raw)) as { pixel_values: Tensor }
  const { logits } = (await m(inputs)) as { logits: Tensor }
  disposeTensors(inputs)
  return logits
}

async function handleLoad({ modelId, device, dtype }: Extract<WorkerRequest, { type: 'load' }>) {
  const start = performance.now()
  await model?.dispose()
  model = null
  processor = await AutoProcessor.from_pretrained(modelId, { progress_callback: onProgress })
  const proc = processor
  const result = await loadFirstWorking<PreTrainedModel>(
    await backendCandidates(device, dtype),
    (b) => AutoModel.from_pretrained(modelId, { device: b.device, dtype: b.dtype, progress_callback: onProgress }),
    async (m) => {
      const logits = await runModel(m, proc, new RawImage(new Uint8ClampedArray(64 * 64 * 3).fill(128), 64, 64, 3))
      logits.dispose()
    },
    (m) => m.dispose(),
  )
  model = result.model
  post({
    type: 'loaded',
    device: result.backend.device,
    dtype: result.backend.dtype,
    ms: performance.now() - start,
    webgpuAvailable: await hasWebGPUAdapter(),
    fallbackReason: result.fallbackReason,
  })
}

async function handleSegment({ image, labelMaxSide, groups = [] }: Extract<WorkerRequest, { type: 'segment' }>) {
  if (!model || !processor) throw new Error('Model not loaded')

  let t = performance.now()
  const { raw, width: imageWidth, height: imageHeight } = rawImageFromBitmap(image)
  const preprocess = performance.now() - t

  t = performance.now()
  const logits = await runModel(model, processor, raw)
  const inference = performance.now() - t

  t = performance.now()
  const [, channels = 0, lh = 0, lw = 0] = logits.dims
  const data = logits.data as Float32Array
  // Per-group probability at the model's output size, then one bilinear upsample per group to full size.
  const groupMasks = groups.map((g) =>
    resizeBilinearToUint8(groupProbability(data, channels, lw, lh, g), lw, lh, imageWidth, imageHeight),
  )

  let labels: Uint8Array | null = null
  let width = 0
  let height = 0
  if (labelMaxSide) {
    const scale = Math.min(1, labelMaxSide / Math.max(imageWidth, imageHeight))
    width = Math.round(imageWidth * scale)
    height = Math.round(imageHeight * scale)
    const upsampled = await interpolate_4d(logits, { size: [height, width], mode: 'bilinear' })
    labels = argmaxChannels(upsampled.data as Float32Array, channels, width * height)
    upsampled.dispose()
  }
  logits.dispose()
  const postprocess = performance.now() - t

  const transfer: Transferable[] = groupMasks.map((m) => m.buffer)
  if (labels) transfer.push(labels.buffer)
  post(
    {
      type: 'result',
      labels,
      width,
      height,
      groupMasks,
      imageWidth,
      imageHeight,
      timings: { preprocess, inference, postprocess },
    },
    transfer,
  )
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

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data
  const task = message.type === 'load' ? handleLoad(message) : handleSegment(message)
  task.catch((err: unknown) => {
    post({ type: 'error', message: errorMessage(err) })
  })
}

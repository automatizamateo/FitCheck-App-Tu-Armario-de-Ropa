/// <reference lib="webworker" />
import { AutoProcessor, SamModel, RawImage, type Processor, type Tensor } from '@huggingface/transformers'
import { iou, samplePromptPoints } from '../lib/mask/ops'
import type { Outbound, SamRequest, SamResponse } from './protocol'
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
let model: SamModel | null = null

function post(message: Outbound<SamResponse>, transfer: Transferable[] = []) {
  self.postMessage(message, transfer)
}

const onProgress = progressForwarder((loaded, total) => {
  post({ type: 'progress', loaded, total })
})

interface SamOutputs {
  pred_masks: Tensor
  iou_scores: Tensor
}

async function predict(
  m: SamModel,
  p: Processor,
  raw: RawImage,
  points: [number, number][],
  labels: number[],
): Promise<{ masks: Tensor; outputs: SamOutputs }> {
  // The SlimSAM ONNX decoder takes points only (no boxes): 1 = object, 0 = background.
  const inputs = (await p(raw, { input_points: [points], input_labels: [labels] })) as Record<string, unknown> & {
    original_sizes: [number, number][]
    reshaped_input_sizes: [number, number][]
  }
  const outputs = (await m(inputs)) as unknown as SamOutputs
  const postProcess = (p as unknown as { post_process_masks: (...a: unknown[]) => Promise<Tensor[]> }).post_process_masks
  const [masks] = await postProcess.call(p, outputs.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes)
  disposeTensors(inputs)
  if (!masks) throw new Error('SAM returned no masks')
  return { masks, outputs }
}

async function handleLoad({ modelId, device, dtype }: Extract<SamRequest, { type: 'load' }>) {
  const start = performance.now()
  await model?.dispose()
  model = null
  processor = await AutoProcessor.from_pretrained(modelId, { progress_callback: onProgress })
  const proc = processor
  const result = await loadFirstWorking<SamModel>(
    await backendCandidates(device, dtype),
    (b) =>
      SamModel.from_pretrained(modelId, {
        device: b.device,
        dtype: b.dtype,
        progress_callback: onProgress,
      }) as Promise<SamModel>,
    async (m) => {
      const raw = new RawImage(new Uint8ClampedArray(64 * 64 * 3).fill(128), 64, 64, 3)
      const { masks, outputs } = await predict(m, proc, raw, [[32, 32]], [1])
      masks.dispose()
      disposeTensors(outputs as unknown as Record<string, unknown>)
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

async function handleRefine({ image, mask, width, height }: Extract<SamRequest, { type: 'refine' }>) {
  if (!model || !processor) throw new Error('Edge refiner not loaded')
  const start = performance.now()
  const { raw } = rawImageFromBitmap(image)
  const { positive, negative } = samplePromptPoints(mask, width, height)
  if (positive.length === 0) throw new Error('Nothing to refine')
  const { masks, outputs } = await predict(model, processor, raw, [...positive, ...negative], [
    ...positive.map(() => 1),
    ...negative.map(() => 0),
  ])

  // masks: [point_batch=1, candidates=3, H, W]. Keep the candidate closest to the coarse mask:
  // SAM's own score tends to prefer a single garment over the whole person.
  const [, candidates = 0, h = 0, w = 0] = masks.dims
  const data = masks.data as Uint8Array
  let best: Uint8Array | null = null
  let bestIou = -1
  for (let c = 0; c < candidates; c++) {
    const candidate = data.slice(c * h * w, (c + 1) * h * w)
    const score = iou(candidate, mask)
    if (score > bestIou) {
      bestIou = score
      best = candidate
    }
  }
  masks.dispose()
  disposeTensors(outputs as unknown as Record<string, unknown>)
  if (!best || w !== width || h !== height) throw new Error('Unexpected SAM mask size')
  post({ type: 'refined', mask: best, iou: bestIou, ms: performance.now() - start }, [best.buffer])
}

self.onmessage = (event: MessageEvent<SamRequest>) => {
  const message = event.data
  const task = message.type === 'load' ? handleLoad(message) : handleRefine(message)
  task.catch((err: unknown) => {
    post({ type: 'error', message: errorMessage(err) })
  })
}

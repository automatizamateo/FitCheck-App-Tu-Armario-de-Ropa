import { MODEL_CACHE } from './cachedFetch'
import type { SegmentationConfig } from './mlConfig'
import { defaultDtype, onnxFileName, POSE_MODEL, RUNTIME_SIZES_MB, SEGMENTATION_MODELS, SLIMSAM } from './models'

export const MEDIAPIPE_RUNTIME_CACHE = 'mediapipe-runtime'
const CACHES = ['transformers-cache', MODEL_CACHE, MEDIAPIPE_RUNTIME_CACHE]

async function cachedUrls(): Promise<string[]> {
  if (!('caches' in self)) return []
  const lists = await Promise.all(
    CACHES.map(async (name) => ((await caches.has(name)) ? (await (await caches.open(name)).keys()).map((r) => r.url) : [])),
  )
  return lists.flat()
}

/** Rough size of what the next photo will download (0 once everything is cached). */
export async function estimateDownloadMB(config: SegmentationConfig, refine: boolean, webgpuLikely: boolean): Promise<number> {
  const urls = await cachedUrls()
  const has = (...fragments: string[]) => urls.some((u) => fragments.every((f) => u.includes(f)))
  const device = config.device === 'auto' ? (webgpuLikely ? 'webgpu' : 'wasm') : config.device
  const dtype = config.dtype === 'auto' ? defaultDtype(device) : config.dtype
  let mb = 0
  if (!has('ort-wasm-simd-threaded')) mb += webgpuLikely ? RUNTIME_SIZES_MB.onnxWebgpu : RUNTIME_SIZES_MB.onnxWasm
  if (!has(config.modelId, onnxFileName(dtype))) {
    mb += SEGMENTATION_MODELS.find((m) => m.id === config.modelId)?.sizesMB[dtype] ?? 30
  }
  if (refine && !has(SLIMSAM.id)) mb += SLIMSAM.sizesMB.q8 // always WASM q8
  if (!has('pose_landmarker')) mb += POSE_MODEL.sizeMB
  if (!has('vision_wasm')) mb += RUNTIME_SIZES_MB.mediapipe
  return mb
}

export async function downloadedModelsMB(): Promise<number> {
  if (!('caches' in self)) return 0
  let bytes = 0
  for (const name of CACHES) {
    if (!(await caches.has(name))) continue
    const cache = await caches.open(name)
    for (const req of await cache.keys()) {
      const res = await cache.match(req)
      const len = Number(res?.headers.get('content-length') ?? NaN)
      bytes += Number.isFinite(len) ? len : ((await res?.blob())?.size ?? 0)
    }
  }
  return bytes / 1e6
}

export async function deleteDownloadedModels(): Promise<void> {
  if (!('caches' in self)) return
  await Promise.all(CACHES.map((name) => caches.delete(name)))
}

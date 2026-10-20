const CACHE_NAME = 'transformers-cache'

export interface CachedFile {
  url: string
  bytes: number
}

/** Lists what Transformers.js has stored (model files and the ONNX Runtime WASM). */
export async function listCachedModelFiles(): Promise<CachedFile[]> {
  if (!('caches' in self) || !(await caches.has(CACHE_NAME))) return []
  const cache = await caches.open(CACHE_NAME)
  const requests = await cache.keys()
  return Promise.all(
    requests.map(async (req) => {
      const res = await cache.match(req)
      const header = Number(res?.headers.get('content-length') ?? NaN)
      const bytes = Number.isFinite(header) ? header : ((await res?.blob())?.size ?? 0)
      return { url: req.url, bytes }
    }),
  )
}

export async function clearModelCache(): Promise<void> {
  if ('caches' in self) await caches.delete(CACHE_NAME)
}

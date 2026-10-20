export const MODEL_CACHE = 'fitcheck-models'

/**
 * Fetches a binary once and keeps it in Cache Storage for offline use, reporting download progress.
 * Works in windows and workers.
 */
export async function fetchCached(
  url: string,
  onProgress?: (loaded: number, total: number) => void,
  cacheName = MODEL_CACHE,
): Promise<ArrayBuffer> {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(url)
  if (hit) return hit.arrayBuffer()

  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}) for ${url}`)
  const total = Number(res.headers.get('content-length') ?? 0)
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.byteLength
    onProgress?.(loaded, total || loaded)
  }
  const buffer = new Uint8Array(loaded)
  let offset = 0
  for (const c of chunks) {
    buffer.set(c, offset)
    offset += c.byteLength
  }
  await cache.put(
    url,
    new Response(buffer, {
      headers: {
        'content-type': res.headers.get('content-type') ?? 'application/octet-stream',
        'content-length': String(loaded),
      },
    }),
  )
  return buffer.buffer
}

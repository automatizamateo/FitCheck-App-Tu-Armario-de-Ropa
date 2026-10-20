export interface StorageStatus {
  persisted: boolean | null // null = API unavailable
  usage: number | null
  quota: number | null
}

export async function requestPersistentStorage(): Promise<boolean | null> {
  if (!('storage' in navigator) || typeof navigator.storage.persist !== 'function') return null
  try {
    return await navigator.storage.persist()
  } catch {
    return null
  }
}

export async function getStorageStatus(): Promise<StorageStatus> {
  if (!('storage' in navigator)) return { persisted: null, usage: null, quota: null }
  const [persisted, estimate] = await Promise.all([
    navigator.storage.persisted().catch(() => null),
    navigator.storage.estimate().catch(() => null),
  ])
  return { persisted, usage: estimate?.usage ?? null, quota: estimate?.quota ?? null }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit] ?? 'GB'}`
}

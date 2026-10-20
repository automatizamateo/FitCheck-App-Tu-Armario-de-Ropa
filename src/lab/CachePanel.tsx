import { useCallback, useEffect, useState } from 'react'
import { clearModelCache, listCachedModelFiles, type CachedFile } from '../ml/modelCache'
import { formatBytes, getStorageStatus, type StorageStatus } from '../lib/storage'

export function CachePanel({ refreshKey }: { refreshKey: number }) {
  const [files, setFiles] = useState<CachedFile[]>([])
  const [storage, setStorage] = useState<StorageStatus | null>(null)
  const [confirming, setConfirming] = useState(false)

  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => {
    setTick((t) => t + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    void Promise.all([listCachedModelFiles(), getStorageStatus()]).then(([f, s]) => {
      if (cancelled) return
      setFiles(f)
      setStorage(s)
    })
    return () => {
      cancelled = true
    }
  }, [tick, refreshKey])

  const total = files.reduce((sum, f) => sum + f.bytes, 0)

  return (
    <div className="space-y-2 text-sm">
      {files.length === 0 ? (
        <p className="text-muted">Nothing cached yet.</p>
      ) : (
        <ul className="space-y-1">
          {files.map((f) => (
            <li key={f.url} className="flex justify-between gap-3">
              <span className="truncate">{shortName(f.url)}</span>
              <span className="text-muted shrink-0 tabular-nums">{formatBytes(f.bytes)}</span>
            </li>
          ))}
          <li className="border-line flex justify-between border-t pt-1 font-semibold">
            <span>Cached total</span>
            <span className="tabular-nums">{formatBytes(total)}</span>
          </li>
        </ul>
      )}
      <p className="text-muted">
        Storage used: {storage?.usage != null ? formatBytes(storage.usage) : '—'}
        {storage?.quota != null && ` of ${formatBytes(storage.quota)}`} · Persistent:{' '}
        {storage?.persisted == null ? 'n/a' : storage.persisted ? 'yes' : 'no'}
      </p>
      <div className="flex gap-4 pt-1">
        <button type="button" className="text-accent font-medium" onClick={refresh}>
          Refresh
        </button>
        {files.length > 0 && (
          <button
            type="button"
            className="font-medium text-red-600"
            onClick={() => {
              if (!confirming) {
                setConfirming(true)
                return
              }
              setConfirming(false)
              void clearModelCache().then(refresh)
            }}
          >
            {confirming ? 'Tap again to delete' : 'Delete cached models'}
          </button>
        )}
      </div>
    </div>
  )
}

function shortName(url: string): string {
  const u = new URL(url)
  const parts = u.pathname.split('/').filter(Boolean)
  // HF: /<org>/<repo>/resolve/<rev>/<file...>
  const resolveAt = parts.indexOf('resolve')
  if (resolveAt > 0) return `${parts[resolveAt - 1] ?? ''}/${parts.slice(resolveAt + 2).join('/')}`
  return parts.at(-1) ?? url
}

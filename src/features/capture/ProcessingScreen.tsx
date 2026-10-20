import { useEffect, useState } from 'react'
import type { StageId, StageUpdate } from '../baseModel/processPhoto'

const LABELS: Record<StageId, string> = {
  segment: 'Removing background',
  pose: 'Detecting pose',
  refine: 'Refining edges',
}

export type StageMap = Partial<Record<StageId, StageUpdate>>

interface ProcessingScreenProps {
  photo: ImageBitmap
  stages: StageMap
  error: string | null
  onRetry: () => void
  onRetake: () => void
}

export function ProcessingScreen({ photo, stages, error, onRetry, onRetake }: ProcessingScreenProps) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let revoked = false
    let objectUrl: string | null = null
    const canvas = document.createElement('canvas')
    canvas.width = photo.width
    canvas.height = photo.height
    canvas.getContext('2d')?.drawImage(photo, 0, 0)
    canvas.toBlob((b) => {
      if (!b || revoked) return
      objectUrl = URL.createObjectURL(b)
      setUrl(objectUrl)
    }, 'image/jpeg', 0.7)
    return () => {
      revoked = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [photo])

  const downloading = Object.values(stages).some((s) => s.status === 'downloading')

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      {url && <img src={url} alt="" className="absolute inset-0 h-full w-full object-contain opacity-30" />}
      <div className="pt-safe pb-safe px-safe relative mt-auto mb-auto space-y-4">
        <div className="mx-auto max-w-sm rounded-3xl bg-black/70 p-5 backdrop-blur">
          {error ? (
            <>
              <p className="text-lg font-semibold">Something went wrong</p>
              <p className="mt-2 text-sm break-words text-white/70">{error}</p>
              <div className="mt-5 flex gap-3">
                <button type="button" onClick={onRetake} className="h-12 flex-1 rounded-full bg-white/10 font-semibold">
                  Retake
                </button>
                <button type="button" onClick={onRetry} className="h-12 flex-1 rounded-full bg-white font-semibold text-black">
                  Try again
                </button>
              </div>
            </>
          ) : (
            <>
              <ul className="space-y-3">
                {(Object.keys(LABELS) as StageId[]).map((id) => (
                  <StageRow key={id} label={LABELS[id]} update={stages[id]} />
                ))}
              </ul>
              {downloading && (
                <p className="mt-4 text-xs leading-relaxed text-white/60">
                  One-time download. After this, FitCheck processes photos fully offline.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function StageRow({ label, update }: { label: string; update: StageUpdate | undefined }) {
  const status = update?.status
  const icon =
    status === 'done' ? '✓' : status === 'skipped' ? '–' : status === 'failed' ? '!' : status ? '' : '·'
  const mb = (n = 0) => (n / 1e6).toFixed(1)
  return (
    <li>
      <div className="flex items-center gap-3">
        <span className="flex size-6 items-center justify-center text-sm">
          {status === 'running' || status === 'downloading' ? (
            <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            icon
          )}
        </span>
        <span className={`flex-1 text-[15px] ${status ? '' : 'text-white/50'}`}>
          {label}
          {status === 'skipped' && <span className="text-white/50"> (off)</span>}
        </span>
      </div>
      {status === 'downloading' && update && (
        <div className="mt-2 ml-9">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full bg-white transition-[width]"
              style={{ width: `${update.total ? (100 * (update.loaded ?? 0)) / update.total : 0}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-white/60 tabular-nums">
            Downloading model {mb(update.loaded)} / {mb(update.total)} MB
          </p>
        </div>
      )}
    </li>
  )
}

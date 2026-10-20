import { Button } from '../../components/Button'
import { PhotoTipsList } from '../../components/InfoContent'

interface CaptureTipsProps {
  title: string
  intro: string
  downloadMB: number | null // null while estimating; 0 when everything is cached
  onStart: () => void
  onClose: () => void
  startLabel?: string
}

export function CaptureTips({ title, intro, downloadMB, onStart, onClose, startLabel = 'Start' }: CaptureTipsProps) {
  return (
    <div className="pt-safe pb-safe px-safe bg-canvas fixed inset-0 z-50 mx-auto flex max-w-lg flex-col">
      <div className="flex h-12 items-center">
        <button type="button" onClick={onClose} className="text-muted -ml-2 h-11 px-2 text-[15px]">
          Cancel
        </button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto pt-2 pb-6">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight">{title}</h1>
        <p className="text-muted text-[15px] leading-relaxed">{intro}</p>
        <PhotoTipsList />
        {downloadMB !== null && downloadMB > 0 && (
          <p className="bg-accent-soft rounded-2xl p-4 text-sm leading-relaxed">
            <strong>One-time download, about {Math.ceil(downloadMB)} MB</strong> of AI models when you take the first
            photo. Use Wi-Fi if you can. After that, everything works offline.
          </p>
        )}
      </div>
      <div className="pb-4">
        <Button className="w-full" onClick={onStart}>
          {startLabel}
        </Button>
      </div>
    </div>
  )
}

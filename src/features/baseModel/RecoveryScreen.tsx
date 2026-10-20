import type { PendingRecovery } from '../../ml/crashRecovery'
import type { MlStage } from '../../ml/mlConfig'

const STAGE_LABELS: Record<MlStage, string> = {
  segment: 'Removing background',
  pose: 'Detecting pose',
  refine: 'Refining edges',
}

interface RecoveryScreenProps {
  recovery: PendingRecovery
  canRetry: boolean
  onRetry: () => void
  onNewPhoto: () => void
  onClose: () => void
}

/** Shown instead of resuming after iOS killed the page mid-processing. Nothing runs until the user taps. */
export function RecoveryScreen({ recovery, canRetry, onRetry, onNewPhoto, onClose }: RecoveryScreenProps) {
  return (
    <div className="pt-safe pb-safe px-safe fixed inset-0 z-50 flex flex-col justify-center bg-black text-white">
      <div className="mx-auto w-full max-w-sm space-y-4 p-5">
        <p className="text-lg font-semibold">FitCheck closed while processing</p>
        <p className="text-sm leading-relaxed text-white/70">
          iOS stopped the app during “{STAGE_LABELS[recovery.crashed.stage]}”, most likely because it ran out of memory.
        </p>
        <p className="rounded-2xl bg-amber-300 p-4 text-sm leading-relaxed text-black">{recovery.notice}</p>
        <div className="flex flex-col gap-3 pt-2">
          {canRetry && (
            <button type="button" onClick={onRetry} className="h-12 rounded-full bg-white font-semibold text-black">
              Retry with the same photo
            </button>
          )}
          <button
            type="button"
            onClick={onNewPhoto}
            className={`h-12 rounded-full font-semibold ${canRetry ? 'bg-white/10' : 'bg-white text-black'}`}
          >
            Take a new photo
          </button>
          <button type="button" onClick={onClose} className="h-11 text-sm text-white/70">
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}

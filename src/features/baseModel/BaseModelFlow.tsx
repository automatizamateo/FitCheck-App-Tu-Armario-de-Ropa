import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { db } from '../../db/db'
import { getSettings, updateMlSettings, updateSettings } from '../../db/settings'
import { VIEWS, type BaseModelView, type View } from '../../domain/types'
import { encodeJpeg, exportCutout } from '../../lib/encode'
import { debugLog } from '../../lib/debugLog'
import { loadImageFile } from '../../lib/image'
import { isIOS } from '../../lib/platform'
import { requestPersistentStorage } from '../../lib/storage'
import { clearRecovery, readRecovery, type PendingRecovery } from '../../ml/crashRecovery'
import { estimateDownloadMB } from '../../ml/downloads'
import { resolveSegmentationConfig, shouldRefine } from '../../ml/mlConfig'
import { MlSession } from '../../ml/session'
import { MlNotice } from '../ml/MlNotice'
import { CaptureScreen } from '../capture/CaptureScreen'
import { CaptureTips } from '../capture/CaptureTips'
import { ProcessingScreen, type StageMap } from '../capture/ProcessingScreen'
import { ReviewScreen } from '../capture/ReviewScreen'
import { processPhoto, type ProcessedPhoto } from './processPhoto'
import { RecoveryScreen } from './RecoveryScreen'
import {
  clearPendingPhoto,
  finalizeDraft,
  getDraft,
  getPendingPhoto,
  replaceBaseModelView,
  saveDraftView,
  savePendingPhoto,
} from './store'

const MAX_SIDE = 1200 // SPEC §7

const TIPS: Record<View, string> = {
  front: 'Face the camera. Arms slightly away from your body.',
  side: 'Turn 90° to your right. Arms relaxed by your sides.',
  back: 'Turn your back to the camera. Same spot and distance.',
}

type Phase =
  | { name: 'loading' }
  | { name: 'recovery'; recovery: PendingRecovery; photo: Blob | null }
  | { name: 'tips'; then: 'capture' | 'resume' }
  | { name: 'capture' }
  | { name: 'processing'; photo: ImageBitmap; stages: StageMap; error: string | null }
  | { name: 'review'; photo: ImageBitmap; result: ProcessedPhoto; saving: boolean }

export function BaseModelFlow() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const retakeView = VIEWS.find((v) => v === params.get('view')) ?? null
  const fromOnboarding = params.get('onboarding') === '1'

  const [phase, setPhase] = useState<Phase>({ name: 'loading' })
  const [queue, setQueue] = useState<View[]>([])
  const [overlays, setOverlays] = useState<Partial<Record<View, Blob>>>({})
  const [downloadMB, setDownloadMB] = useState<number | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const session = useRef<MlSession | null>(null)

  const view = queue[0]
  const total = retakeView ? 1 : VIEWS.length
  const stepIndex = total - queue.length + 1

  // Work out which views are still needed, load silhouettes for the overlay, estimate downloads.
  useEffect(() => {
    let cancelled = false
    const isCancelled = () => cancelled
    void (async () => {
      const [settings, draft, base, pending] = await Promise.all([
        getSettings(),
        getDraft(),
        db.baseModel.get('base'),
        getPendingPhoto(),
      ])
      if (isCancelled()) return
      session.current = new MlSession(settings.ml)
      const remaining = retakeView ? [retakeView] : VIEWS.filter((v) => !draft?.views[v])
      const recovery = readRecovery()
      setQueue(remaining)
      const silhouettes: Partial<Record<View, Blob>> = {}
      for (const v of VIEWS) {
        const blob = base?.views[v].image ?? draft?.views[v]?.image
        if (blob) silhouettes[v] = blob
      }
      setOverlays(silhouettes)
      const resuming = !retakeView && remaining.length < VIEWS.length
      if (recovery) {
        // Never re-run automatically after a crash: that is how a crash loop starts.
        const photo = pending && pending.view === remaining[0] ? pending.image : null
        debugLog('recovery screen', { crashed: recovery.crashed.stage, hasPhoto: photo !== null })
        setPhase({ name: 'recovery', recovery, photo })
      } else {
        if (pending) void clearPendingPhoto()
        setPhase({ name: 'tips', then: resuming ? 'resume' : 'capture' })
      }
      const est = await estimateDownloadMB(
        resolveSegmentationConfig(settings.ml),
        shouldRefine(settings.ml, isIOS()),
        'gpu' in navigator && !settings.ml.webgpuBroken,
      )
      if (!isCancelled()) setDownloadMB(est)
    })()
    return () => {
      cancelled = true
      session.current?.dispose()
      session.current = null
    }
  }, [retakeView])

  const exit = useCallback(() => {
    if (fromOnboarding) void navigate('/welcome')
    else void navigate(-1)
  }, [navigate, fromOnboarding])

  const run = useCallback(
    async (photo: ImageBitmap) => {
      const s = session.current
      if (!s || !view) return
      setPhase({ name: 'processing', photo, stages: {}, error: null })
      try {
        await savePendingPhoto(view, await encodeJpeg(photo, photo.width, photo.height))
      } catch (err) {
        debugLog(`could not keep the photo for retry: ${err instanceof Error ? err.message : String(err)}`)
      }
      try {
        const result = await processPhoto(s, photo, (update) => {
          setPhase((p) => (p.name === 'processing' ? { ...p, stages: { ...p.stages, [update.stage]: update } } : p))
        })
        await clearPendingPhoto()
        setPhase({ name: 'review', photo, result, saving: false })
      } catch (err) {
        debugLog(`pipeline failed: ${err instanceof Error ? err.message : String(err)}`)
        setPhase({ name: 'processing', photo, stages: {}, error: err instanceof Error ? err.message : String(err) })
      }
    },
    [view],
  )

  const onCaptured = useCallback(
    async (blob: Blob) => {
      setPhotoError(null)
      let bitmap: ImageBitmap
      try {
        bitmap = (await loadImageFile(blob, MAX_SIDE)).bitmap
      } catch {
        setPhotoError('That photo could not be opened. Try another one.')
        return
      }
      await run(bitmap)
    },
    [run],
  )

  const retake = () => {
    if (phase.name === 'processing' || phase.name === 'review') phase.photo.close()
    void clearPendingPhoto()
    setPhase({ name: 'capture' })
  }

  const leaveRecovery = () => {
    clearRecovery()
    void updateMlSettings({ pendingNotice: undefined })
  }

  const retryAfterCrash = async (blob: Blob) => {
    leaveRecovery()
    try {
      await run((await loadImageFile(blob, MAX_SIDE)).bitmap)
    } catch {
      void clearPendingPhoto()
      setPhotoError('That photo could not be opened. Take a new one.')
      setPhase({ name: 'capture' })
    }
  }

  const confirm = async (mask: Uint8Array, feather: number) => {
    if (phase.name !== 'review' || !view) return
    const { photo, result } = phase
    setPhase({ ...phase, saving: true })
    const settings = await getSettings()
    const data: BaseModelView = {
      image: await exportCutout(photo, mask, photo.width, photo.height, feather),
      width: photo.width,
      height: photo.height,
      landmarks: result.landmarks,
      original: settings.keepOriginalPhotos ? await encodeJpeg(photo, photo.width, photo.height) : undefined,
    }
    photo.close()

    if (retakeView) {
      await replaceBaseModelView(view, data)
      void navigate('/settings', { replace: true })
      return
    }
    await saveDraftView(view, data)
    setOverlays((o) => ({ ...o, [view]: data.image }))
    const rest = queue.slice(1)
    if (rest.length > 0) {
      setQueue(rest)
      setPhase({ name: 'capture' })
      return
    }
    await finalizeDraft()
    if (fromOnboarding) {
      await updateSettings({ onboardingDone: true })
      await requestPersistentStorage()
    }
    void navigate(fromOnboarding ? '/wardrobe' : '/settings', { replace: true })
  }

  if (phase.name === 'loading' || !view) return null

  if (phase.name === 'recovery') {
    const { photo } = phase
    return (
      <RecoveryScreen
        recovery={phase.recovery}
        canRetry={photo !== null}
        onRetry={() => {
          if (photo) void retryAfterCrash(photo)
        }}
        onNewPhoto={() => {
          leaveRecovery()
          void clearPendingPhoto()
          setPhase({ name: 'capture' })
        }}
        onClose={() => {
          leaveRecovery()
          void clearPendingPhoto()
          exit()
        }}
      />
    )
  }

  if (phase.name === 'tips') {
    const resuming = phase.then === 'resume'
    return (
      <CaptureTips
        title={retakeView ? `Retake ${retakeView} view` : resuming ? 'Continue your base model' : 'Your base model'}
        intro={
          retakeView
            ? 'Wear the same tight thermals and stand in the same spot as before, so your clothes keep lining up.'
            : resuming
              ? `You've done ${VIEWS.length - queue.length} of ${VIEWS.length} views. Next: ${view}.`
              : 'Three photos of you in tight thermal clothing: front, side and back. FitCheck removes the background and uses them as the model your clothes are shown on.'
        }
        downloadMB={downloadMB}
        onClose={exit}
        onStart={() => {
          void updateSettings({ captureTipsSeen: true })
          setPhase({ name: 'capture' })
        }}
        startLabel={resuming ? 'Continue' : 'Start'}
      />
    )
  }

  return (
    <>
      {phase.name === 'capture' && photoError && (
        <p className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+11rem)] z-[60] rounded-2xl bg-red-600 p-3 text-center text-sm text-white">
          {photoError}
        </p>
      )}
      {phase.name === 'capture' && (
        <CaptureScreen
          key={view}
          view={view}
          step={`${stepIndex} of ${total}`}
          tip={TIPS[view]}
          overlay={overlays[view] ?? null}
          onCaptured={(b) => void onCaptured(b)}
          onClose={exit}
          onShowTips={() => {
            setPhase({ name: 'tips', then: 'capture' })
          }}
        />
      )}
      {phase.name === 'processing' && (
        <ProcessingScreen
          photo={phase.photo}
          stages={phase.stages}
          error={phase.error}
          onRetake={retake}
          onRetry={() => void run(phase.photo)}
        />
      )}
      {phase.name === 'review' && (
        <ReviewScreen
          view={view}
          photo={phase.photo}
          mask={phase.result.mask}
          landmarks={phase.result.landmarks}
          notes={phase.result.notes}
          busy={phase.saving}
          onRetake={retake}
          onConfirm={(m, f) => void confirm(m, f)}
        />
      )}
      <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+3.5rem)] z-[60] px-3">
        <div className="pointer-events-auto">
          <MlNotice dark />
        </div>
      </div>
    </>
  )
}

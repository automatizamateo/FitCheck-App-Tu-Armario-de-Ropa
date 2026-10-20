import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { LayeredView } from '../../components/LayeredView'
import { db } from '../../db/db'
import { getSettings, updateMlSettings } from '../../db/settings'
import { alignmentLandmarks, bodyRegion, garmentClasses, garmentKind, suggestName } from '../../domain/garments'
import { VIEWS, type BaseModel, type GarmentLayer, type Item, type ItemDraft, type View } from '../../domain/types'
import { alignByBox, alignByLandmarks, placementToLayer } from '../../lib/align'
import { debugLog } from '../../lib/debugLog'
import { encodeJpeg } from '../../lib/encode'
import type { Similarity } from '../../lib/gesture/similarity'
import { loadImageFile } from '../../lib/image'
import { trackBitmap } from '../../lib/resources'
import { clearRecovery, readRecovery, type PendingRecovery } from '../../ml/crashRecovery'
import { MlSession } from '../../ml/session'
import { RecoveryScreen } from '../baseModel/RecoveryScreen'
import { browserDeps, processPhoto, type PipelineTarget, type ProcessedPhoto } from '../baseModel/processPhoto'
import { clearPendingPhoto, getPendingPhoto, savePendingPhoto } from '../baseModel/store'
import { CaptureScreen } from '../capture/CaptureScreen'
import { CaptureTips } from '../capture/CaptureTips'
import { ProcessingScreen, type StageMap } from '../capture/ProcessingScreen'
import { ReviewScreen } from '../capture/ReviewScreen'
import { MlNotice } from '../ml/MlNotice'
import { refreshOutfitThumbnails } from '../outfits/store'
import { AlignScreen } from './AlignScreen'
import { CategoryPicker } from './CategoryPicker'
import { DetailsForm } from './DetailsForm'
import { cropCutout, makeThumbnail, personBox } from './garmentImage'
import {
  applyRetakeDraft,
  discardItemDraft,
  getItemDraft,
  saveItemDraftView,
  saveItemFromDraft,
  skipItemDraftView,
  startItemDraft,
  startRetakeDraft,
  thumbnailView,
  type ItemDetails,
} from './store'

const MAX_SIDE = 1200 // SPEC §7

const TIPS: Record<View, string> = {
  front: 'Wear it and face the camera, like your base model photo.',
  side: 'Turn 90° to your right, arms relaxed.',
  back: 'Turn your back to the camera. Same spot and distance.',
}

type Phase =
  | { name: 'loading' }
  | { name: 'noBase' }
  | { name: 'resume' }
  | { name: 'conflict'; item: Item; view: View }
  | { name: 'category' }
  | { name: 'capture' }
  | { name: 'tips' }
  | { name: 'processing'; photo: ImageBitmap; stages: StageMap; error: string | null }
  | { name: 'review'; photo: ImageBitmap; result: ProcessedPhoto; busy: boolean }
  | {
      name: 'align'
      cutout: { image: Blob; w: number; h: number }
      auto: Similarity
      method: 'pose' | 'box'
      original?: Blob
      busy: boolean
    }
  | { name: 'details'; busy: boolean; error: string | null }
  | { name: 'done'; item: Item }
  | { name: 'recovery'; recovery: PendingRecovery; photo: Blob | null }

/** The next view to capture: the first one neither confirmed nor skipped. */
function nextView(draft: ItemDraft): View | undefined {
  return VIEWS.find((v) => !draft.views[v] && !draft.skipped.includes(v))
}

export function AddItemFlow() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // ?retake=<itemId>&view=<view>: retake (or add a missing) view of an existing item.
  const retakeId = params.get('retake')
  const retakeView = params.get('view') as View | null
  const [phase, setPhase] = useState<Phase>({ name: 'loading' })
  const [base, setBase] = useState<BaseModel | null>(null)
  const [draft, setDraft] = useState<ItemDraft | null>(null)
  const [lastCategory, setLastCategory] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const session = useRef<MlSession | null>(null)

  const view = draft ? nextView(draft) : undefined
  const kind = draft ? garmentKind(draft.category, draft.accessoryType) : null
  const noun = draft ? suggestName(draft.category, draft.accessoryType, undefined) : ''
  const target = useMemo<PipelineTarget | null>(
    () => (kind ? { flow: 'item', classes: garmentClasses(kind), allowRefine: false } : null),
    [kind],
  )

  useEffect(() => {
    let cancelled = false
    const isCancelled = () => cancelled
    void (async () => {
      const [settings, baseModel, saved, kept] = await Promise.all([
        getSettings(),
        db.baseModel.get('base'),
        getItemDraft(),
        getPendingPhoto(),
      ])
      if (isCancelled()) return
      session.current = new MlSession(settings.ml)
      setBase(baseModel ?? null)
      setDraft(saved ?? null)
      if (!baseModel) {
        setPhase({ name: 'noBase' })
        return
      }
      const stored = readRecovery()
      if (stored?.crashed.flow === 'item') {
        // Never re-run automatically after a crash.
        const next = saved ? nextView(saved) : undefined
        const photo = kept?.flow === 'item' && kept.view === next ? kept.image : null
        debugLog('item recovery screen', { crashed: stored.crashed.stage, hasPhoto: photo !== null })
        setPhase({ name: 'recovery', recovery: stored, photo })
        return
      }
      if (kept?.flow === 'item') void clearPendingPhoto()
      if (retakeId && retakeView && VIEWS.includes(retakeView)) {
        const item = await db.items.get(retakeId)
        if (isCancelled()) return
        if (!item) {
          void navigate('/wardrobe', { replace: true })
          return
        }
        const same = saved !== undefined && saved.itemId === item.id && nextView(saved) === retakeView
        if (saved && !same) {
          setPhase({ name: 'conflict', item, view: retakeView })
          return
        }
        const d = saved ?? (await startRetakeDraft(item, retakeView))
        if (isCancelled()) return
        setDraft(d)
        setPhase({ name: 'capture' })
        return
      }
      setPhase(saved ? { name: 'resume' } : { name: 'category' })
    })()
    return () => {
      cancelled = true
      session.current?.dispose()
      session.current = null
    }
  }, [retakeId, retakeView, navigate])

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => {
      setToast(null)
    }, 3500)
  }

  /** Retake done: the new view goes into the item; thumbnails that showed the old one are redone. */
  const finishRetake = useCallback(
    async (d: ItemDraft) => {
      const item = d.itemId ? await db.items.get(d.itemId) : undefined
      const retaken = VIEWS.find((v) => d.views[v])
      const layer = retaken && d.views[retaken]
      try {
        if (!item || !retaken || !layer) throw new Error('This item was deleted')
        const shownView = thumbnailView({ ...item.views, [retaken]: layer })
        const thumbnail = shownView === retaken ? await makeThumbnail(layer.image) : undefined
        const { itemId } = await applyRetakeDraft(thumbnail)
        debugLog(`item ${retaken} view retaken`, { thumbnail: thumbnail !== undefined })
        const outfits = await db.outfits.where('itemIds').equals(itemId).primaryKeys()
        void refreshOutfitThumbnails(outfits)
        void navigate(`/wardrobe/${itemId}`, { replace: true })
      } catch (err) {
        await discardItemDraft()
        showToast(err instanceof Error ? err.message : String(err))
        void navigate('/wardrobe', { replace: true })
      }
    },
    [navigate],
  )

  /** After a view was confirmed or skipped: next view, the details form, or back to the retaken item. */
  const advance = useCallback(
    (d: ItemDraft) => {
      setDraft(d)
      if (nextView(d)) {
        setPhase({ name: 'capture' })
        return
      }
      if (d.itemId) {
        setPhase({ name: 'loading' })
        void finishRetake(d)
        return
      }
      if (Object.keys(d.views).length === 0) {
        // Everything was skipped: at least one view is needed to save.
        const reset = { ...d, skipped: [] }
        void db.itemDraft.put(reset)
        setDraft(reset)
        showToast('Add at least one view to save this item.')
        setPhase({ name: 'capture' })
        return
      }
      setPhase({ name: 'details', busy: false, error: null })
    },
    [finishRetake],
  )

  const run = useCallback(
    async (photo: ImageBitmap) => {
      const s = session.current
      if (!s || !view || !target) return
      setPhase({ name: 'processing', photo, stages: {}, error: null })
      try {
        await savePendingPhoto(view, await encodeJpeg(photo, photo.width, photo.height), 'item')
      } catch (err) {
        debugLog(`could not keep the photo for retry: ${err instanceof Error ? err.message : String(err)}`)
      }
      try {
        const result = await processPhoto(
          s,
          photo,
          (update) => {
            setPhase((p) => (p.name === 'processing' ? { ...p, stages: { ...p.stages, [update.stage]: update } } : p))
          },
          browserDeps,
          target,
        )
        await clearPendingPhoto()
        setPhase({ name: 'review', photo, result, busy: false })
      } catch (err) {
        debugLog(`item pipeline failed: ${err instanceof Error ? err.message : String(err)}`)
        setPhase({ name: 'processing', photo, stages: {}, error: err instanceof Error ? err.message : String(err) })
      }
    },
    [view, target],
  )

  const onCaptured = async (blob: Blob) => {
    try {
      await run(trackBitmap((await loadImageFile(blob, MAX_SIDE)).bitmap))
    } catch {
      showToast('That photo could not be opened. Try another one.')
      setPhase({ name: 'capture' })
    }
  }

  const retake = () => {
    if (phase.name === 'processing' || phase.name === 'review') phase.photo.close()
    void clearPendingPhoto()
    setPhase({ name: 'capture' })
  }

  /** Review confirmed: crop the cut-out, then place it on the base model (pose, or body area as fallback). */
  const confirmCutout = async (mask: Uint8Array, feather: number) => {
    if (phase.name !== 'review' || !view || !base || !kind) return
    const { photo, result } = phase
    setPhase({ ...phase, busy: true })
    const cut = await cropCutout(photo, mask, feather)
    if (!cut) {
      showToast(`Paint the ${noun.toLowerCase()} with Add first.`)
      setPhase({ ...phase, busy: false })
      return
    }
    const settings = await getSettings()
    const original = settings.keepOriginalPhotos ? await encodeJpeg(photo, photo.width, photo.height) : undefined
    photo.close()

    const baseView = base.views[view]
    const size = { w: cut.box.w, h: cut.box.h }
    const byPose = alignByLandmarks(
      {
        landmarks: result.landmarks,
        width: result.width,
        height: result.height,
        offset: { x: -cut.box.x, y: -cut.box.y },
      },
      { landmarks: baseView.landmarks, width: baseView.width, height: baseView.height },
      alignmentLandmarks(kind),
    )
    let auto = byPose
    if (!auto) {
      const person = (await personBox(baseView.image).catch(() => null)) ?? {
        x: 0,
        y: 0,
        w: baseView.width,
        h: baseView.height,
      }
      auto = alignByBox(size, person, bodyRegion(kind))
    }
    debugLog(`item ${view} aligned by ${byPose ? 'pose' : 'body area'}`, { cutout: `${size.w}×${size.h}` })
    setPhase({
      name: 'align',
      cutout: { image: cut.image, ...size },
      auto,
      method: byPose ? 'pose' : 'box',
      original,
      busy: false,
    })
  }

  const confirmPlacement = async (placement: Similarity) => {
    if (phase.name !== 'align' || !view) return
    setPhase({ ...phase, busy: true })
    const layer: GarmentLayer = {
      image: phase.cutout.image,
      ...placementToLayer(placement, phase.auto, phase.cutout),
      original: phase.original,
    }
    advance(await saveItemDraftView(view, layer))
  }

  const save = async (details: ItemDetails) => {
    if (!draft) return
    setPhase({ name: 'details', busy: true, error: null })
    try {
      const first = VIEWS.map((v) => draft.views[v]).find(Boolean)
      if (!first) throw new Error('Add at least one view first')
      const id = await saveItemFromDraft(details, await makeThumbnail(first.image))
      const item = await db.items.get(id)
      if (!item) throw new Error('The item was not saved')
      setLastCategory(item.category)
      setDraft(null)
      setPhase({ name: 'done', item })
    } catch (err) {
      setPhase({ name: 'details', busy: false, error: err instanceof Error ? err.message : String(err) })
    }
  }

  const leaveRecovery = () => {
    clearRecovery()
    void updateMlSettings({ pendingNotice: undefined })
  }

  const close = () => {
    if (draft?.itemId) {
      // Cancelling a retake keeps the item as it was.
      void discardItemDraft()
      void navigate(`/wardrobe/${draft.itemId}`, { replace: true })
      return
    }
    // The draft is kept: opening "Add item" again offers to continue it.
    void navigate('/wardrobe')
  }

  const toastEl = toast && (
    <p className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+11rem)] z-[60] rounded-2xl bg-red-600 p-3 text-center text-sm text-white">
      {toast}
    </p>
  )

  switch (phase.name) {
    case 'loading':
      return null

    case 'noBase':
      return (
        <Sheet
          title="Create your base model first"
          body="Items are fitted onto your base model, so FitCheck needs it before you add clothes."
          primary={{ label: 'Create base model', onClick: () => void navigate('/base-model') }}
          secondary={{ label: 'Not now', onClick: close }}
        />
      )

    case 'conflict':
      return (
        <Sheet
          title={`Finish your ${noun.toLowerCase()} first?`}
          body={`You have an unfinished ${noun.toLowerCase()}. Retaking the ${phase.view} view of “${phase.item.name}” discards it.`}
          primary={{
            label: 'Continue the unfinished one',
            onClick: () => {
              void navigate('/items/new', { replace: true })
            },
          }}
          secondary={{
            label: 'Discard it and retake',
            onClick: () => {
              const { item, view: v } = phase
              void discardItemDraft()
                .then(() => startRetakeDraft(item, v))
                .then((d) => {
                  setDraft(d)
                  setPhase({ name: 'capture' })
                })
            },
          }}
        />
      )

    case 'resume':
      return (
        <Sheet
          title={`Continue your ${noun.toLowerCase()}?`}
          body={
            draft?.itemId
              ? `You were retaking the ${view ?? ''} view of an item.`
              : `You have ${Object.keys(draft?.views ?? {}).length} of 3 views done.`
          }
          primary={{
            label: 'Continue',
            onClick: () => {
              if (draft) advance(draft)
            },
          }}
          secondary={{
            label: 'Start a new item',
            onClick: () => {
              void discardItemDraft()
              setDraft(null)
              setPhase({ name: 'category' })
            },
          }}
        />
      )

    case 'category':
      return (
        <CategoryPicker
          highlighted={lastCategory}
          onCancel={close}
          onPick={(category, accessoryType) => {
            void startItemDraft(category, accessoryType).then((d) => {
              setDraft(d)
              setPhase({ name: 'capture' })
            })
          }}
        />
      )

    case 'recovery': {
      const { photo } = phase
      return (
        <RecoveryScreen
          recovery={phase.recovery}
          canRetry={photo !== null && !!draft}
          onRetry={() => {
            leaveRecovery()
            if (!photo) return
            void loadImageFile(photo, MAX_SIDE)
              .then(({ bitmap }) => run(trackBitmap(bitmap)))
              .catch(() => {
                setPhase({ name: 'capture' })
              })
          }}
          onNewPhoto={() => {
            leaveRecovery()
            void clearPendingPhoto()
            setPhase(draft ? { name: 'capture' } : { name: 'category' })
          }}
          onClose={() => {
            leaveRecovery()
            void clearPendingPhoto()
            close()
          }}
        />
      )
    }

    case 'details':
      return draft ? (
        <DetailsForm
          category={draft.category}
          accessoryType={draft.accessoryType}
          image={VIEWS.map((v) => draft.views[v]?.image).find(Boolean)}
          missing={VIEWS.filter((v) => !draft.views[v])}
          busy={phase.busy}
          error={phase.error}
          onSave={(d) => void save(d)}
          onCancel={close}
        />
      ) : null

    case 'done':
      return (
        <DoneScreen
          base={base}
          item={phase.item}
          onAnother={() => {
            setPhase({ name: 'category' })
          }}
          onDone={close}
        />
      )

    case 'tips':
      return (
        <CaptureTips
          title="Photo tips"
          intro="Wear the item and stand where you took your base model photos, so it lines up with your body."
          downloadMB={0}
          onClose={() => {
            setPhase({ name: 'capture' })
          }}
          onStart={() => {
            setPhase({ name: 'capture' })
          }}
          startLabel="Back to camera"
        />
      )

    default:
      break
  }

  if (!draft || !view || !base) return null
  const stepIndex = VIEWS.indexOf(view) + 1
  const labels = target?.classes
    ? { segment: `Finding the ${noun.toLowerCase()}`, pose: 'Detecting pose' }
    : { pose: 'Detecting pose' }

  return (
    <>
      {phase.name === 'capture' && (
        <CaptureScreen
          key={view}
          view={view}
          step={draft.itemId ? `${noun} · retake ${view}` : `${noun} · ${stepIndex} of 3`}
          tip={TIPS[view]}
          overlay={base.views[view].image}
          onCaptured={(b) => void onCaptured(b)}
          onClose={close}
          onShowTips={() => {
            setPhase({ name: 'tips' })
          }}
          onSkip={
            draft.itemId
              ? undefined
              : () => {
                  void skipItemDraftView(view).then(advance)
                }
          }
        />
      )}
      {phase.name === 'processing' && (
        <ProcessingScreen
          photo={phase.photo}
          stages={phase.stages}
          error={phase.error}
          labels={labels}
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
          notes={
            target?.classes
              ? phase.result.notes
              : [
                  `Paint the ${noun.toLowerCase()} with your finger (Add). Pinch to zoom in for small details.`,
                  ...phase.result.notes,
                ]
          }
          busy={phase.busy}
          initialMode={phase.result.empty ? 'add' : 'erase'}
          title={`${noun} · ${view}`}
          confirmLabel="Next"
          onRetake={retake}
          onConfirm={(m, f) => void confirmCutout(m, f)}
        />
      )}
      {phase.name === 'align' && (
        <AlignScreen
          view={view}
          base={base.views[view]}
          cutout={phase.cutout}
          auto={phase.auto}
          method={phase.method}
          busy={phase.busy}
          onConfirm={(p) => void confirmPlacement(p)}
          onBack={() => {
            setPhase({ name: 'capture' })
          }}
        />
      )}
      {toastEl}
      <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+3.5rem)] z-[60] px-3">
        <div className="pointer-events-auto">
          <MlNotice dark />
        </div>
      </div>
    </>
  )
}

function DoneScreen({
  base,
  item,
  onAnother,
  onDone,
}: {
  base: BaseModel | null
  item: Item
  onAnother: () => void
  onDone: () => void
}) {
  const view = VIEWS.find((v) => item.views[v]) ?? 'front'
  const layer = item.views[view]
  const layers = useMemo(() => (layer ? [layer] : []), [layer])
  const missing = VIEWS.filter((v) => !item.views[v])
  return (
    <div className="pt-safe pb-safe px-safe bg-canvas text-ink fixed inset-0 z-50 flex flex-col">
      <div className="py-4 text-center">
        <p className="text-lg font-semibold">Saved “{item.name}”</p>
        {missing.length > 0 && (
          <p className="text-muted text-sm">Missing {missing.join(', ')} view — you can add it later.</p>
        )}
      </div>
      <div className="min-h-0 flex-1">{base && <LayeredView base={base.views[view]} layers={layers} />}</div>
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3 py-4">
        <button
          type="button"
          onClick={onAnother}
          className="bg-ink text-canvas h-12 rounded-full text-[15px] font-semibold"
        >
          Add another
        </button>
        <button type="button" onClick={onDone} className="h-12 text-[15px] font-medium">
          Done
        </button>
      </div>
    </div>
  )
}

function Sheet({
  title,
  body,
  primary,
  secondary,
}: {
  title: string
  body: string
  primary: { label: string; onClick: () => void }
  secondary: { label: string; onClick: () => void }
}) {
  return (
    <div className="pt-safe pb-safe px-safe bg-canvas text-ink fixed inset-0 z-50 flex flex-col justify-center">
      <div className="mx-auto w-full max-w-sm space-y-3 p-5 text-center">
        <p className="text-lg font-semibold">{title}</p>
        <p className="text-muted text-sm leading-relaxed">{body}</p>
        <div className="flex flex-col gap-3 pt-4">
          <button
            type="button"
            onClick={primary.onClick}
            className="bg-ink text-canvas h-12 rounded-full font-semibold"
          >
            {primary.label}
          </button>
          <button type="button" onClick={secondary.onClick} className="h-12 font-medium">
            {secondary.label}
          </button>
        </div>
      </div>
    </div>
  )
}

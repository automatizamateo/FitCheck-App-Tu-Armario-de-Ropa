import { useCallback, useRef, useState, type ReactNode } from 'react'
import type { PoseLandmarks, View } from '../../domain/types'
import { MaskEditor, type MaskEditorApi, type MaskEditorState } from './MaskEditor'

interface ReviewScreenProps {
  view: View
  photo: ImageBitmap
  mask: Uint8Array
  landmarks: PoseLandmarks
  notes: string[]
  busy: boolean
  onRetake: () => void
  onConfirm: (mask: Uint8Array, feather: number) => void
}

const FEATHERS = [
  { label: 'Sharp', px: 0 },
  { label: 'Soft', px: 1 },
  { label: 'Softer', px: 2 },
] as const

export function ReviewScreen({ view, photo, mask, landmarks, notes, busy, onRetake, onConfirm }: ReviewScreenProps) {
  const api = useRef<MaskEditorApi | null>(null)
  const [state, setState] = useState<MaskEditorState>({
    mode: 'erase',
    brushSize: 32,
    showPose: false,
    preview: false,
    feather: 1,
  })
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [notesOpen, setNotesOpen] = useState(notes.length > 0)
  const set = (changes: Partial<MaskEditorState>) => {
    setState((s) => ({ ...s, ...changes }))
  }
  const onHistoryChange = useCallback((u: boolean, r: boolean) => {
    setCanUndo(u)
    setCanRedo(r)
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0c0a09] text-white select-none [-webkit-touch-callout:none]">
      <div className="pt-safe px-safe flex h-[calc(env(safe-area-inset-top)+3.5rem)] items-center justify-between">
        <span className="w-16" />
        <div className="text-center">
          <p className="text-[15px] font-semibold">Review {view}</p>
          <p className="text-xs text-white/60">Pinch to zoom · double-tap to fit</p>
        </div>
        <button
          type="button"
          className={`flex h-11 w-16 items-center justify-end text-sm ${state.showPose ? 'text-sky-400' : 'text-white/70'}`}
          aria-pressed={state.showPose}
          onClick={() => {
            set({ showPose: !state.showPose })
          }}
        >
          Pose
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <MaskEditor
          photo={photo}
          initialMask={mask}
          landmarks={landmarks}
          state={state}
          onHistoryChange={onHistoryChange}
          apiRef={api}
        />
        {notesOpen && notes.length > 0 && (
          <div className="absolute inset-x-3 top-2 rounded-2xl bg-black/75 p-3 text-sm backdrop-blur">
            <ul className="space-y-1.5">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
            <button
              type="button"
              className="mt-2 h-9 text-sm font-semibold text-sky-300"
              onClick={() => {
                setNotesOpen(false)
              }}
            >
              OK
            </button>
          </div>
        )}
      </div>

      <div className="pb-safe px-safe space-y-3 bg-[#0c0a09] pt-3">
        {state.preview ? (
          <Segmented>
            {FEATHERS.map((f) => (
              <SegButton
                key={f.px}
                active={state.feather === f.px}
                onClick={() => {
                  set({ feather: f.px })
                }}
              >
                {f.label} edges
              </SegButton>
            ))}
          </Segmented>
        ) : (
          <div className="flex items-center gap-3">
            <Segmented>
              <SegButton
                active={state.mode === 'add'}
                onClick={() => {
                  set({ mode: 'add' })
                }}
              >
                Add
              </SegButton>
              <SegButton
                active={state.mode === 'erase'}
                onClick={() => {
                  set({ mode: 'erase' })
                }}
              >
                Erase
              </SegButton>
            </Segmented>
            <label className="flex flex-1 items-center gap-2 text-xs text-white/70">
              Size
              <input
                type="range"
                min={8}
                max={96}
                value={state.brushSize}
                onChange={(e) => {
                  set({ brushSize: Number(e.target.value) })
                }}
                className="h-11 flex-1 accent-white"
                aria-label="Brush size"
              />
            </label>
          </div>
        )}

        <div className="flex gap-2">
          <ToolButton disabled={!canUndo || state.preview} onClick={() => api.current?.undo()}>
            Undo
          </ToolButton>
          <ToolButton disabled={!canRedo || state.preview} onClick={() => api.current?.redo()}>
            Redo
          </ToolButton>
          <ToolButton
            active={state.preview}
            onClick={() => {
              set({ preview: !state.preview })
            }}
          >
            {state.preview ? 'Edit' : 'Preview'}
          </ToolButton>
        </div>

        <div className="flex gap-3 pb-3">
          <button
            type="button"
            disabled={busy}
            onClick={onRetake}
            className="h-12 flex-1 rounded-full bg-white/10 text-[15px] font-semibold disabled:opacity-40"
          >
            Retake
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const m = api.current?.getMask()
              if (m) onConfirm(m, state.feather)
            }}
            className="h-12 flex-[2] rounded-full bg-white text-[15px] font-semibold text-black disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Use this photo'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Segmented({ children }: { children: ReactNode }) {
  return <div className="flex rounded-full bg-white/10 p-1">{children}</div>
}

function SegButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`h-11 min-w-[72px] flex-1 rounded-full px-3 text-sm font-medium transition ${active ? 'bg-white text-black' : 'text-white/80'}`}
    >
      {children}
    </button>
  )
}

function ToolButton({
  onClick,
  disabled,
  active,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  active?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-11 flex-1 rounded-xl text-sm font-medium transition active:scale-95 disabled:opacity-30 ${active ? 'bg-white text-black' : 'bg-white/10'}`}
    >
      {children}
    </button>
  )
}

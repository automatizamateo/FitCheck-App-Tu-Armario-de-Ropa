import { useEffect, type ReactNode } from 'react'
import { COLOR_PALETTE } from '../domain/attributes'

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="mt-5">
      <p className="mb-2 text-sm font-semibold">
        {label}
        {hint && <span className="text-muted font-normal"> · {hint}</span>}
      </p>
      {children}
    </div>
  )
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>
}

export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`h-10 rounded-full px-4 text-sm font-medium transition active:scale-95 ${active ? 'bg-ink text-canvas' : 'bg-surface border-line border'}`}
    >
      {children}
    </button>
  )
}

/** The 16 named swatches as round toggles. */
export function ColorSwatches({
  selected,
  onToggle,
}: {
  selected: readonly string[]
  onToggle: (name: string) => void
}) {
  return (
    <div className="grid grid-cols-8 gap-2">
      {COLOR_PALETTE.map((c) => {
        const active = selected.includes(c.name)
        return (
          <button
            key={c.name}
            type="button"
            aria-label={c.name}
            aria-pressed={active}
            onClick={() => {
              onToggle(c.name)
            }}
            className={`aspect-square rounded-full border transition active:scale-90 ${active ? 'ring-accent ring-2 ring-offset-2 ring-offset-[var(--color-canvas)]' : 'border-line'}`}
            style={{ background: c.hex }}
          />
        )
      })}
    </div>
  )
}

/** Bottom sheet with a title row; scrolls when taller than the screen. */
export function BottomSheet({
  open,
  title,
  onClose,
  action,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  action?: ReactNode
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-canvas pb-safe mx-auto flex max-h-[88dvh] w-full max-w-lg animate-[fade-in_200ms_ease-out] flex-col rounded-t-3xl"
        onClick={(e) => {
          e.stopPropagation()
        }}
      >
        <div className="px-safe flex h-14 shrink-0 items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          {action ?? (
            <button type="button" onClick={onClose} className="text-accent h-11 px-2 font-semibold">
              Done
            </button>
          )}
        </div>
        <div className="px-safe min-h-0 overflow-y-auto pb-6">{children}</div>
      </div>
    </div>
  )
}

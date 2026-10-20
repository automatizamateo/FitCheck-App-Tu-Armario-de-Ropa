import { useEffect, type ReactNode } from 'react'
import { Button } from './Button'

interface ConfirmSheetProps {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Bottom sheet confirmation (never window.confirm, which blocks and looks foreign in a PWA). */
export function ConfirmSheet({ open, title, children, confirmLabel, destructive, onConfirm, onCancel }: ConfirmSheetProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onCancel])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-surface pb-safe px-safe mx-auto w-full max-w-lg animate-[fade-in_200ms_ease-out] rounded-t-3xl pt-5"
        onClick={(e) => {
          e.stopPropagation()
        }}
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="text-muted mt-2 text-[15px] leading-relaxed">{children}</div>
        <div className="flex gap-3 py-5">
          <Button variant="secondary" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button className={`flex-1 ${destructive ? '!bg-red-600 !text-white' : ''}`} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

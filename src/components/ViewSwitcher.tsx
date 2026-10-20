import { VIEWS, type View } from '../domain/types'

const LABELS: Record<View, string> = { front: 'Front', side: 'Side', back: 'Back' }

/** Front / Side / Back segmented control. Views in `missing` are shown dimmed with a dot. */
export function ViewSwitcher({
  value,
  onChange,
  missing = [],
  dark = false,
}: {
  value: View
  onChange: (view: View) => void
  missing?: readonly View[]
  dark?: boolean
}) {
  return (
    <div
      role="tablist"
      className={`grid grid-cols-3 gap-1 rounded-full p-1 ${dark ? 'bg-white/10' : 'bg-surface border-line border'}`}
    >
      {VIEWS.map((v) => {
        const active = v === value
        const absent = missing.includes(v)
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => {
              onChange(v)
            }}
            className={`h-9 rounded-full text-sm font-semibold transition active:scale-95 ${
              active ? (dark ? 'bg-white text-black' : 'bg-ink text-canvas') : absent ? 'opacity-45' : ''
            }`}
          >
            {LABELS[v]}
            {absent && <span className="ml-1 text-amber-500">•</span>}
          </button>
        )
      })}
    </div>
  )
}

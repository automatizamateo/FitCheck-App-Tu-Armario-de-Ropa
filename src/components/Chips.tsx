interface ChipsProps {
  options: readonly string[]
  selected: string | null
  onSelect: (value: string | null) => void
  allLabel?: string
}

/** Horizontally scrolling single-select filter chips. */
export function Chips({ options, selected, onSelect, allLabel = 'All' }: ChipsProps) {
  const chip = (label: string, value: string | null) => {
    const active = selected === value
    return (
      <button
        key={label}
        type="button"
        onClick={() => {
          onSelect(value)
        }}
        aria-pressed={active}
        className={`h-9 shrink-0 rounded-full px-4 text-sm font-medium whitespace-nowrap transition active:scale-95 ${
          active ? 'bg-ink text-canvas' : 'bg-surface text-ink border-line border'
        }`}
      >
        {label}
      </button>
    )
  }

  return (
    <div className="px-safe flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none]">
      {chip(allLabel, null)}
      {options.map((o) => chip(o, o))}
    </div>
  )
}

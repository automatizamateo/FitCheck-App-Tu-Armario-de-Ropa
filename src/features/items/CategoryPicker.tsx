import { useState } from 'react'
import { ACCESSORY_TYPES, CATEGORIES } from '../../domain/categories'
import type { Category } from '../../domain/types'

interface CategoryPickerProps {
  /** The category of the item just saved, so "Add another" of the same kind is one tap. */
  highlighted: string | null
  onPick: (category: Category, accessoryType?: string) => void
  onCancel: () => void
}

export function CategoryPicker({ highlighted, onPick, onCancel }: CategoryPickerProps) {
  const [accessories, setAccessories] = useState(false)
  const [custom, setCustom] = useState('')

  return (
    <div className="pt-safe pb-safe px-safe bg-canvas text-ink fixed inset-0 z-50 overflow-y-auto">
      <div className="mx-auto max-w-lg">
        <div className="flex h-12 items-center justify-between">
          <button
            type="button"
            onClick={
              accessories
                ? () => {
                    setAccessories(false)
                  }
                : onCancel
            }
            className="text-muted -ml-2 h-11 px-2 text-[15px]"
          >
            {accessories ? 'Back' : 'Cancel'}
          </button>
          <p className="font-semibold">{accessories ? 'Accessory type' : 'What are you adding?'}</p>
          <span className="w-14" />
        </div>

        {!accessories ? (
          <div className="grid grid-cols-2 gap-3 py-4">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  if (c === 'Accessories') setAccessories(true)
                  else onPick(c)
                }}
                className={`bg-surface h-20 rounded-2xl border px-4 text-left text-[15px] font-semibold transition active:scale-[0.97] ${
                  highlighted === c ? 'border-accent ring-accent ring-1' : 'border-line'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3 py-4">
            {ACCESSORY_TYPES.filter((t) => t !== 'Other').map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  onPick('Accessories', t)
                }}
                className="bg-surface border-line h-14 w-full rounded-2xl border px-4 text-left text-[15px] font-semibold active:scale-[0.98]"
              >
                {t}
              </button>
            ))}
            <div className="bg-surface border-line rounded-2xl border p-4">
              <p className="text-[15px] font-semibold">Other</p>
              <p className="text-muted mt-1 text-sm">Belt, sunglasses, bag… You’ll paint it with the brush.</p>
              <div className="mt-3 flex gap-2">
                <input
                  value={custom}
                  onChange={(e) => {
                    setCustom(e.target.value)
                  }}
                  placeholder="Label (optional)"
                  className="border-line bg-canvas h-11 min-w-0 flex-1 rounded-xl border px-3 text-[16px]"
                />
                <button
                  type="button"
                  onClick={() => {
                    onPick('Accessories', custom.trim() || 'Other')
                  }}
                  className="bg-ink text-canvas h-11 rounded-xl px-4 text-sm font-semibold"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { COLOR_PALETTE, SEASONS } from '../../domain/attributes'
import { suggestName } from '../../domain/garments'
import { VIEWS, type ItemDraft, type Season } from '../../domain/types'
import { useObjectUrl } from '../../lib/useObjectUrl'
import { suggestColors } from './garmentImage'
import type { ItemDetails } from './store'

interface DetailsFormProps {
  draft: ItemDraft
  busy: boolean
  error: string | null
  onSave: (details: ItemDetails) => void
  onCancel: () => void
}

export function DetailsForm({ draft, busy, error, onSave, onCancel }: DetailsFormProps) {
  const styles = useLiveQuery(() => db.styles.toArray(), [], [])
  const firstView = VIEWS.map((v) => draft.views[v]).find(Boolean)
  const preview = useObjectUrl(firstView?.image)
  const missing = VIEWS.filter((v) => !draft.views[v])

  const [name, setName] = useState(() => suggestName(draft.category, draft.accessoryType, undefined))
  const nameEdited = useRef(false)
  const [styleIds, setStyleIds] = useState<string[]>([])
  const [seasons, setSeasons] = useState<Season[]>([])
  const [colors, setColors] = useState<string[]>([])
  const [brand, setBrand] = useState('')
  const [notes, setNotes] = useState('')
  const [favorite, setFavorite] = useState(false)

  // Suggest colors (and a name like "Navy T-Shirt") from the cut-out; the user can change both.
  useEffect(() => {
    if (!firstView) return
    let cancelled = false
    void suggestColors(firstView.image)
      .then((found) => {
        if (cancelled) return
        setColors(found)
        if (!nameEdited.current) setName(suggestName(draft.category, draft.accessoryType, found[0]))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [firstView, draft.category, draft.accessoryType])

  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

  return (
    <div className="bg-canvas text-ink fixed inset-0 z-50 overflow-y-auto">
      <div className="pt-safe px-safe mx-auto max-w-lg pb-[calc(env(safe-area-inset-bottom)+6rem)]">
        <div className="flex h-12 items-center justify-between">
          <button type="button" onClick={onCancel} className="text-muted -ml-2 h-11 px-2 text-[15px]">
            Cancel
          </button>
          <p className="font-semibold">Details</p>
          <span className="w-14" />
        </div>

        <div className="flex items-center gap-4 py-3">
          <div className="bg-surface border-line flex size-24 shrink-0 items-center justify-center rounded-2xl border">
            {preview && <img src={preview} alt="" className="max-h-20 max-w-20 object-contain" />}
          </div>
          <div className="min-w-0">
            <p className="text-muted text-sm">
              {draft.category}
              {draft.accessoryType ? ` · ${draft.accessoryType}` : ''}
            </p>
            {missing.length > 0 && (
              <p className="mt-1 inline-block rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                Missing {missing.join(', ')} view{missing.length > 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>

        <Field label="Name">
          <input
            value={name}
            onChange={(e) => {
              nameEdited.current = true
              setName(e.target.value)
            }}
            className="bg-surface border-line h-12 w-full rounded-xl border px-3 text-[16px]"
            autoComplete="off"
          />
        </Field>

        <Field label="Styles">
          <ChipRow>
            {styles.map((s) => (
              <Chip
                key={s.id}
                active={styleIds.includes(s.id)}
                onClick={() => {
                  setStyleIds((l) => toggle(l, s.id))
                }}
              >
                {s.name}
              </Chip>
            ))}
          </ChipRow>
        </Field>

        <Field label="Seasons">
          <ChipRow>
            {SEASONS.map((s) => (
              <Chip
                key={s}
                active={seasons.includes(s)}
                onClick={() => {
                  setSeasons((l) => toggle(l, s))
                }}
              >
                {s}
              </Chip>
            ))}
          </ChipRow>
        </Field>

        <Field label="Colors" hint="Suggested from the photo">
          <div className="grid grid-cols-8 gap-2">
            {COLOR_PALETTE.map((c) => {
              const active = colors.includes(c.name)
              return (
                <button
                  key={c.name}
                  type="button"
                  aria-label={c.name}
                  aria-pressed={active}
                  onClick={() => {
                    setColors((l) => toggle(l, c.name))
                  }}
                  className={`aspect-square rounded-full border transition active:scale-90 ${active ? 'ring-accent ring-2 ring-offset-2 ring-offset-[var(--color-canvas)]' : 'border-line'}`}
                  style={{ background: c.hex }}
                />
              )
            })}
          </div>
          {colors.length > 0 && <p className="text-muted mt-2 text-xs">{colors.join(', ')}</p>}
        </Field>

        <Field label="Brand">
          <input
            value={brand}
            onChange={(e) => {
              setBrand(e.target.value)
            }}
            className="bg-surface border-line h-12 w-full rounded-xl border px-3 text-[16px]"
            autoComplete="off"
            placeholder="Optional"
          />
        </Field>

        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value)
            }}
            rows={2}
            className="bg-surface border-line w-full rounded-xl border p-3 text-[16px]"
            placeholder="Optional"
          />
        </Field>

        <label className="bg-surface border-line mt-4 flex h-13 items-center justify-between rounded-xl border px-4">
          <span>Favorite</span>
          <input
            type="checkbox"
            checked={favorite}
            onChange={(e) => {
              setFavorite(e.target.checked)
            }}
            className="accent-accent size-5"
          />
        </label>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </div>

      <div className="pb-safe px-safe bg-canvas/95 border-line fixed inset-x-0 bottom-0 border-t pt-3 backdrop-blur">
        <div className="mx-auto max-w-lg pb-3">
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => {
              onSave({ name, styleIds, seasons, colors, brand, notes, favorite })
            }}
            className="bg-ink text-canvas h-12 w-full rounded-full text-[15px] font-semibold disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Save item'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
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

function ChipRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
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

import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Chip, ChipRow, ColorSwatches, Field } from '../../components/FormBits'
import { toggleIn as toggle } from '../../lib/toggleIn'
import { db } from '../../db/db'
import { SEASONS } from '../../domain/attributes'
import { suggestName } from '../../domain/garments'
import type { Category, Season, View } from '../../domain/types'
import { useObjectUrl } from '../../lib/useObjectUrl'
import { suggestColors } from './garmentImage'
import type { ItemDetails } from './store'

interface DetailsFormProps {
  category: Category
  accessoryType?: string
  /** Cut-out shown at the top (and the source of suggested colors for a new item). */
  image: Blob | undefined
  missing: readonly View[]
  /** Editing an existing item: its current details, and nothing is auto-suggested. */
  initial?: ItemDetails
  title?: string
  saveLabel?: string
  busy: boolean
  error: string | null
  onSave: (details: ItemDetails) => void
  onCancel: () => void
}

export function DetailsForm({
  category,
  accessoryType,
  image,
  missing,
  initial,
  title = 'Details',
  saveLabel = 'Save item',
  busy,
  error,
  onSave,
  onCancel,
}: DetailsFormProps) {
  const styles = useLiveQuery(() => db.styles.toArray(), [], [])
  const preview = useObjectUrl(image)

  const [name, setName] = useState(() => initial?.name ?? suggestName(category, accessoryType, undefined))
  const nameEdited = useRef(false)
  const [styleIds, setStyleIds] = useState<string[]>(initial?.styleIds ?? [])
  const [seasons, setSeasons] = useState<Season[]>(initial?.seasons ?? [])
  const [colors, setColors] = useState<string[]>(initial?.colors ?? [])
  const [brand, setBrand] = useState(initial?.brand ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [favorite, setFavorite] = useState(initial?.favorite ?? false)
  const suggest = !initial

  // New item: suggest colors (and a name like "Navy T-Shirt") from the cut-out; the user can change both.
  useEffect(() => {
    if (!suggest || !image) return
    let cancelled = false
    void suggestColors(image)
      .then((found) => {
        if (cancelled) return
        setColors(found)
        if (!nameEdited.current) setName(suggestName(category, accessoryType, found[0]))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [suggest, image, category, accessoryType])

  return (
    <div className="bg-canvas text-ink fixed inset-0 z-50 overflow-y-auto">
      <div className="pt-safe px-safe mx-auto max-w-lg pb-[calc(env(safe-area-inset-bottom)+6rem)]">
        <div className="flex h-12 items-center justify-between">
          <button type="button" onClick={onCancel} className="text-muted -ml-2 h-11 px-2 text-[15px]">
            Cancel
          </button>
          <p className="font-semibold">{title}</p>
          <span className="w-14" />
        </div>

        <div className="flex items-center gap-4 py-3">
          <div className="bg-surface border-line flex size-24 shrink-0 items-center justify-center rounded-2xl border">
            {preview && <img src={preview} alt="" className="max-h-20 max-w-20 object-contain" />}
          </div>
          <div className="min-w-0">
            <p className="text-muted text-sm">
              {category}
              {accessoryType ? ` · ${accessoryType}` : ''}
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

        <Field label="Colors" hint={suggest ? 'Suggested from the photo' : undefined}>
          <ColorSwatches
            selected={colors}
            onToggle={(c) => {
              setColors((l) => toggle(l, c))
            }}
          />
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
            {busy ? 'Saving…' : saveLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

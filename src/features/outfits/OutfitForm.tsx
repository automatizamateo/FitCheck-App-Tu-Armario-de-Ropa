import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Chip, ChipRow, Field } from '../../components/FormBits'
import { toggleIn as toggle } from '../../lib/toggleIn'
import { db } from '../../db/db'
import { OCCASIONS, SEASONS } from '../../domain/attributes'
import type { Season } from '../../domain/types'
import { useObjectUrl } from '../../lib/useObjectUrl'
import type { OutfitDetails } from './store'

interface OutfitFormProps {
  initial: OutfitDetails
  /** The composed front view, rendered when the form opens (null while rendering; saving renders it if needed). */
  thumbnail: Blob | null
  itemNames: string[]
  busy: boolean
  error: string | null
  onSave: (details: OutfitDetails) => void
  onBack: () => void
}

export function OutfitForm({ initial, thumbnail, itemNames, busy, error, onSave, onBack }: OutfitFormProps) {
  const styles = useLiveQuery(() => db.styles.toArray(), [], [])
  const preview = useObjectUrl(thumbnail)
  const [name, setName] = useState(initial.name)
  const [styleIds, setStyleIds] = useState(initial.styleIds)
  const [seasons, setSeasons] = useState<Season[]>(initial.seasons)
  const [occasion, setOccasion] = useState(initial.occasion ?? '')
  const [favorite, setFavorite] = useState(initial.favorite)

  return (
    <div className="bg-canvas text-ink fixed inset-0 z-50 overflow-y-auto">
      <div className="pt-safe px-safe mx-auto max-w-lg pb-[calc(env(safe-area-inset-bottom)+6rem)]">
        <div className="flex h-12 items-center justify-between">
          <button type="button" onClick={onBack} className="text-muted -ml-2 h-11 px-2 text-[15px]">
            Back
          </button>
          <p className="font-semibold">Save outfit</p>
          <span className="w-14" />
        </div>

        <div className="flex items-center gap-4 py-3">
          <div className="bg-surface border-line flex h-32 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border">
            {preview && <img src={preview} alt="" className="max-h-full max-w-full object-contain" />}
          </div>
          <p className="text-muted min-w-0 text-sm leading-relaxed">{itemNames.join(' · ')}</p>
        </div>

        <Field label="Name">
          <input
            value={name}
            onChange={(e) => {
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

        <Field label="Occasion">
          <input
            value={occasion}
            onChange={(e) => {
              setOccasion(e.target.value)
            }}
            className="bg-surface border-line mb-2 h-12 w-full rounded-xl border px-3 text-[16px]"
            autoComplete="off"
            placeholder="Optional"
          />
          <ChipRow>
            {OCCASIONS.map((o) => (
              <Chip
                key={o}
                active={occasion === o}
                onClick={() => {
                  setOccasion((cur) => (cur === o ? '' : o))
                }}
              >
                {o}
              </Chip>
            ))}
          </ChipRow>
        </Field>

        <label className="bg-surface border-line mt-5 flex h-13 items-center justify-between rounded-xl border px-4">
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
              onSave({ name, styleIds, seasons, occasion, favorite })
            }}
            className="bg-ink text-canvas h-12 w-full rounded-full text-[15px] font-semibold disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Save outfit'}
          </button>
        </div>
      </div>
    </div>
  )
}

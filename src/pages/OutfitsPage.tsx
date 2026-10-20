import { memo, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button } from '../components/Button'
import { Chips } from '../components/Chips'
import { EmptyState } from '../components/EmptyState'
import { BottomSheet } from '../components/FormBits'
import { HangerIcon, PlusIcon, ShirtIcon } from '../components/Icons'
import { PageHeader } from '../components/PageHeader'
import { Thumb } from '../components/Thumb'
import { db } from '../db/db'
import { OCCASIONS, SEASONS } from '../domain/attributes'
import { filterOutfits, NO_OUTFIT_FILTERS } from '../domain/outfits'
import type { Outfit, Season } from '../domain/types'
import { useUI } from '../store/ui'

export function OutfitsPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const styles = useLiveQuery(() => db.styles.toArray(), [], [])
  const outfits = useLiveQuery(() => db.outfits.toArray(), [])
  const itemCount = useLiveQuery(() => db.items.count(), [])
  const { outfitFilters: f, setOutfitFilters } = useUI()
  const [itemSheet, setItemSheet] = useState(false)

  // /outfits?item=<id> (from an item's "In outfits"): filter by that item.
  const fromItem = params.get('item')
  useEffect(() => {
    if (!fromItem) return
    setOutfitFilters({ ...NO_OUTFIT_FILTERS, itemId: fromItem })
    setParams({}, { replace: true })
  }, [fromItem, setOutfitFilters, setParams])

  const withItem = useLiveQuery(async () => (f.itemId ? await db.items.get(f.itemId) : undefined), [f.itemId])
  const shown = useMemo(() => (outfits ? filterOutfits(outfits, f) : []), [outfits, f])
  const occasions = useMemo(() => {
    const used = (outfits ?? []).map((o) => o.occasion).filter((o): o is string => !!o)
    return [...new Set([...OCCASIONS, ...used])]
  }, [outfits])

  if (outfits === undefined || itemCount === undefined) return <PageHeader title="Outfits" />

  if (itemCount === 0 && outfits.length === 0) {
    return (
      <>
        <PageHeader title="Outfits" />
        <EmptyState
          icon={<HangerIcon />}
          title="Add items to your wardrobe first"
          body="Outfits combine clothes from your Wardrobe on your base model. Add a few items, then come back."
          action={
            <Button
              onClick={() => {
                void navigate('/wardrobe')
              }}
            >
              Go to Wardrobe
            </Button>
          }
        />
      </>
    )
  }

  const selectClass = (active: boolean) =>
    `h-9 shrink-0 appearance-none rounded-full px-3.5 text-sm font-medium ${active ? 'bg-ink text-canvas' : 'bg-surface border-line border'}`

  return (
    <>
      <PageHeader title="Outfits" />
      <Chips
        options={styles.map((s) => s.name)}
        selected={styles.find((s) => s.id === f.styleId)?.name ?? null}
        onSelect={(name) => {
          setOutfitFilters({ styleId: styles.find((s) => s.name === name)?.id ?? null })
        }}
        allLabel="All styles"
      />
      {outfits.length > 0 && (
        <div className="px-safe flex gap-2 overflow-x-auto pb-3 [scrollbar-width:none]">
          <select
            aria-label="Season"
            value={f.season ?? ''}
            onChange={(e) => {
              setOutfitFilters({ season: (e.target.value || null) as Season | null })
            }}
            className={selectClass(!!f.season)}
          >
            <option value="">Any season</option>
            {SEASONS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            aria-label="Occasion"
            value={f.occasion ?? ''}
            onChange={(e) => {
              setOutfitFilters({ occasion: e.target.value || null })
            }}
            className={selectClass(!!f.occasion)}
          >
            <option value="">Any occasion</option>
            {occasions.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
          <button
            type="button"
            aria-pressed={f.favorites}
            onClick={() => {
              setOutfitFilters({ favorites: !f.favorites })
            }}
            className={selectClass(f.favorites)}
          >
            ★ Favorites
          </button>
          <button
            type="button"
            onClick={() => {
              if (f.itemId) setOutfitFilters({ itemId: null })
              else setItemSheet(true)
            }}
            className={`${selectClass(!!f.itemId)} max-w-[14rem] truncate`}
          >
            {f.itemId ? `With: ${withItem?.name ?? 'deleted item'} ✕` : 'Contains item…'}
          </button>
        </div>
      )}

      {outfits.length === 0 && (
        <EmptyState
          icon={<ShirtIcon />}
          title="No outfits yet"
          body="Combine items from your wardrobe on your base model, and see them from the front, side and back."
          action={
            <Button
              onClick={() => {
                void navigate('/outfits/new')
              }}
            >
              <PlusIcon className="size-5" />
              Create your first outfit
            </Button>
          }
        />
      )}

      {outfits.length > 0 && shown.length === 0 && (
        <div className="px-8 py-14 text-center">
          <p className="font-semibold">No outfits match</p>
          <button
            type="button"
            onClick={() => {
              setOutfitFilters(NO_OUTFIT_FILTERS)
            }}
            className="text-accent mt-2 h-11 font-semibold"
          >
            Clear filters
          </button>
        </div>
      )}

      <ul className="px-safe grid grid-cols-2 gap-x-3 gap-y-4 pb-6">
        {shown.map((o, i) => (
          <OutfitCard key={o.id} outfit={o} eager={i < 8} />
        ))}
      </ul>

      <ItemPickerSheet
        open={itemSheet}
        onClose={() => {
          setItemSheet(false)
        }}
        onPick={(itemId) => {
          setOutfitFilters({ itemId })
          setItemSheet(false)
        }}
      />
    </>
  )
}

const OutfitCard = memo(function OutfitCard({ outfit, eager }: { outfit: Outfit; eager: boolean }) {
  return (
    <li className="[content-visibility:auto] [contain-intrinsic-size:auto_260px]">
      <Link to={`/outfits/${outfit.id}`} className="block transition active:scale-[0.97]">
        <div className="bg-surface border-line relative aspect-[3/4] overflow-hidden rounded-2xl border">
          <Thumb blob={outfit.thumbnail} className="h-full w-full" eager={eager} />
          {outfit.favorite && <span className="text-accent absolute top-1.5 right-2.5 text-lg">★</span>}
        </div>
        <p className="mt-1.5 truncate text-sm font-medium">{outfit.name}</p>
        <p className="text-muted truncate text-xs">
          {outfit.itemIds.length} item{outfit.itemIds.length === 1 ? '' : 's'}
          {outfit.occasion ? ` · ${outfit.occasion}` : ''}
        </p>
      </Link>
    </li>
  )
})

/** "Contains item": items that are in at least one outfit. Only mounted (and decoding) while open. */
function ItemPickerSheet({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (id: string) => void
}) {
  return (
    <BottomSheet open={open} title="Outfits with…" onClose={onClose}>
      {open && <ItemPickerGrid onPick={onPick} />}
    </BottomSheet>
  )
}

function ItemPickerGrid({ onPick }: { onPick: (id: string) => void }) {
  const items = useLiveQuery(async () => {
    const used = new Set(await db.outfits.orderBy('itemIds').uniqueKeys())
    return (await db.items.toArray()).filter((i) => used.has(i.id)).sort((a, b) => a.name.localeCompare(b.name))
  }, [])
  if (!items) return null
  if (items.length === 0) return <p className="text-muted py-6 text-center text-sm">No items are in an outfit yet.</p>
  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => {
            onPick(item.id)
          }}
          className="bg-surface border-line flex flex-col rounded-2xl border p-1.5 active:scale-95"
        >
          <Thumb blob={item.thumbnail} className="aspect-square w-full" />
          <span className="mt-1 truncate text-[11px]">{item.name}</span>
        </button>
      ))}
    </div>
  )
}

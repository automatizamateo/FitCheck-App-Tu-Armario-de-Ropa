import { memo, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button } from '../components/Button'
import { Chips } from '../components/Chips'
import { EmptyState } from '../components/EmptyState'
import { BottomSheet, Chip, ChipRow, ColorSwatches, Field } from '../components/FormBits'
import { HangerIcon, PersonIcon, PlusIcon } from '../components/Icons'
import { PageHeader } from '../components/PageHeader'
import { Thumb } from '../components/Thumb'
import { db } from '../db/db'
import { useSettings } from '../db/settings'
import { SEASONS } from '../domain/attributes'
import { CATEGORIES } from '../domain/categories'
import type { Category, Item } from '../domain/types'
import {
  activeFilterCount,
  filterItems,
  isUnused,
  ITEM_SORTS,
  missingViews,
  NO_ITEM_FILTERS,
  sortItems,
} from '../domain/wardrobe'
import { useBaseModel } from '../features/baseModel/store'
import { useUI } from '../store/ui'

export function WardrobePage() {
  const navigate = useNavigate()
  const items = useLiveQuery(() => db.items.toArray(), [])
  const styles = useLiveQuery(() => db.styles.toArray(), [], [])
  const settings = useSettings()
  const baseModel = useBaseModel()
  const { itemFilters: filters, itemSort: sort, setItemFilters, setItemSort } = useUI()
  const [sheet, setSheet] = useState(false)
  const unusedDays = settings?.unusedThresholdDays ?? 60

  // "now" only matters at day scale; fixed per visit so the list doesn't reshuffle while open.
  const [now] = useState(() => Date.now())
  const shown = useMemo(
    () => (items ? sortItems(filterItems(items, filters, now, unusedDays), sort) : []),
    [items, filters, sort, now, unusedDays],
  )
  const categories = useMemo(() => CATEGORIES.filter((c) => items?.some((i) => i.category === c)), [items])
  const extra = activeFilterCount(filters)

  return (
    <>
      <PageHeader
        title="Wardrobe"
        action={items?.length ? <span className="text-muted pb-1.5 text-sm">{items.length} items</span> : undefined}
      />
      {baseModel === null && (
        <div className="px-safe pb-3">
          <button
            type="button"
            onClick={() => {
              void navigate('/base-model')
            }}
            className="bg-surface border-line flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition active:scale-[0.98]"
          >
            <span className="bg-accent-soft text-accent flex size-12 shrink-0 items-center justify-center rounded-full">
              <PersonIcon />
            </span>
            <span>
              <span className="block font-semibold">Create your base model</span>
              <span className="text-muted block text-sm">
                Three photos of you, so clothes can be shown on your body.
              </span>
            </span>
          </button>
        </div>
      )}

      {items && items.length > 0 && (
        <>
          <div className="px-safe flex gap-2 pb-3">
            <input
              type="search"
              value={filters.query}
              onChange={(e) => {
                setItemFilters({ query: e.target.value })
              }}
              placeholder="Search name or brand"
              className="bg-surface border-line h-11 min-w-0 flex-1 rounded-full border px-4"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => {
                setSheet(true)
              }}
              className={`h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${extra || sort !== 'newest' ? 'bg-ink text-canvas' : 'bg-surface border-line border'}`}
            >
              Filters{extra ? ` (${extra})` : ''}
            </button>
          </div>
          <Chips
            options={categories}
            selected={filters.category}
            onSelect={(c) => {
              setItemFilters({ category: c as Category | null })
            }}
          />
        </>
      )}

      {items?.length === 0 && (
        <EmptyState
          icon={<HangerIcon />}
          title="Your wardrobe is empty"
          body="Photograph a piece of clothing while you wear it, and FitCheck cuts it out so you can build outfits on your own body."
          action={
            <Button
              onClick={() => {
                void navigate('/items/new')
              }}
            >
              <PlusIcon className="size-5" />
              Add your first item
            </Button>
          }
        />
      )}

      {items && items.length > 0 && shown.length === 0 && (
        <div className="px-8 py-14 text-center">
          <p className="font-semibold">No items match</p>
          <button
            type="button"
            onClick={() => {
              setItemFilters(NO_ITEM_FILTERS)
            }}
            className="text-accent mt-2 h-11 font-semibold"
          >
            Clear filters
          </button>
        </div>
      )}

      <ul className="px-safe grid grid-cols-3 gap-x-3 gap-y-4 pt-2 pb-6">
        {shown.map((item, i) => (
          <ItemCard key={item.id} item={item} unused={isUnused(item, now, unusedDays)} eager={i < 12} />
        ))}
      </ul>

      <BottomSheet
        open={sheet}
        title="Filter & sort"
        onClose={() => {
          setSheet(false)
        }}
      >
        <Field label="Sort">
          <ChipRow>
            {ITEM_SORTS.map((s) => (
              <Chip
                key={s.value}
                active={sort === s.value}
                onClick={() => {
                  setItemSort(s.value)
                }}
              >
                {s.label}
              </Chip>
            ))}
          </ChipRow>
        </Field>
        <Field label="Show">
          <ChipRow>
            <Chip
              active={filters.favorites}
              onClick={() => {
                setItemFilters({ favorites: !filters.favorites })
              }}
            >
              ★ Favorites
            </Chip>
            <Chip
              active={filters.unused}
              onClick={() => {
                setItemFilters({ unused: !filters.unused })
              }}
            >
              Unused {unusedDays}+ days
            </Chip>
          </ChipRow>
        </Field>
        <Field label="Style">
          <ChipRow>
            {styles.map((s) => (
              <Chip
                key={s.id}
                active={filters.styleId === s.id}
                onClick={() => {
                  setItemFilters({ styleId: filters.styleId === s.id ? null : s.id })
                }}
              >
                {s.name}
              </Chip>
            ))}
          </ChipRow>
        </Field>
        <Field label="Season">
          <ChipRow>
            {SEASONS.map((s) => (
              <Chip
                key={s}
                active={filters.season === s}
                onClick={() => {
                  setItemFilters({ season: filters.season === s ? null : s })
                }}
              >
                {s}
              </Chip>
            ))}
          </ChipRow>
        </Field>
        <Field label="Color" hint={filters.color ?? undefined}>
          <ColorSwatches
            selected={filters.color ? [filters.color] : []}
            onToggle={(c) => {
              setItemFilters({ color: filters.color === c ? null : c })
            }}
          />
        </Field>
        <button
          type="button"
          onClick={() => {
            setItemFilters({ ...NO_ITEM_FILTERS, category: filters.category, query: filters.query })
            setItemSort('newest')
          }}
          className="text-accent mt-6 h-11 font-semibold"
        >
          Reset filters and sort
        </button>
      </BottomSheet>
    </>
  )
}

const ItemCard = memo(function ItemCard({ item, unused, eager }: { item: Item; unused: boolean; eager: boolean }) {
  const missing = missingViews(item).length
  return (
    <li className="[content-visibility:auto] [contain-intrinsic-size:auto_200px]">
      <Link to={`/wardrobe/${item.id}`} className="block transition active:scale-[0.97]">
        <div className="bg-surface border-line relative aspect-[3/4] rounded-2xl border p-2">
          <Thumb blob={item.thumbnail} alt="" className="h-full w-full" eager={eager} />
          {item.favorite && (
            <span aria-label="Favorite" className="text-accent absolute top-1.5 right-2 text-base">
              ★
            </span>
          )}
          <span className="absolute inset-x-1.5 bottom-1.5 flex flex-wrap gap-1">
            {missing > 0 && (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                {3 - missing}/3 views
              </span>
            )}
            {unused && (
              <span className="bg-accent-soft text-accent rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
                Unused
              </span>
            )}
          </span>
        </div>
        <p className="mt-1.5 truncate text-[13px] leading-tight font-medium">{item.name}</p>
        {item.brand && <p className="text-muted truncate text-[11px]">{item.brand}</p>}
      </Link>
    </li>
  )
})

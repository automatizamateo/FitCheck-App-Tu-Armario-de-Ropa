import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ConfirmSheet } from '../components/ConfirmSheet'
import { ChevronLeftIcon } from '../components/Icons'
import { LayeredView } from '../components/LayeredView'
import { Thumb } from '../components/Thumb'
import { ViewSwitcher } from '../components/ViewSwitcher'
import { db } from '../db/db'
import { stepView, type Item, type View } from '../domain/types'
import { useBaseModel } from '../features/baseModel/store'
import { composeView, copyOutfit, deleteOutfit, setOutfitFavorite } from '../features/outfits/store'

export function OutfitDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const outfit = useLiveQuery(async () => (await db.outfits.get(id)) ?? null, [id])
  const items = useLiveQuery(
    async () => (outfit ? (await db.items.bulkGet(outfit.itemIds)).filter((i): i is Item => i !== undefined) : []),
    [outfit],
  )
  const styles = useLiveQuery(() => db.styles.toArray(), [], [])
  const base = useBaseModel()
  const [view, setView] = useState<View>('front')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [swipeStart, setSwipeStart] = useState<{ x: number; y: number } | null>(null)

  const layers = useMemo(() => (outfit && items ? composeView(outfit, items, view) : []), [outfit, items, view])

  if (outfit === null) {
    return (
      <div className="px-8 py-16 text-center">
        <p className="font-semibold">This outfit was deleted</p>
        <Link to="/outfits" className="text-accent mt-3 inline-block font-semibold">
          Back to Outfits
        </Link>
      </div>
    )
  }
  if (!outfit || !items) return null

  const styleNames = outfit.styleIds.map((s) => styles.find((x) => x.id === s)?.name).filter(Boolean)
  const missing = items.filter((i) => !i.views[view])

  return (
    <div className="pb-8">
      <div className="px-safe flex h-12 items-center justify-between">
        <button
          type="button"
          onClick={() => {
            void navigate('/outfits')
          }}
          className="-ml-2 flex h-11 items-center pr-2 text-[15px]"
        >
          <ChevronLeftIcon className="size-6" />
          Outfits
        </button>
        <button
          type="button"
          aria-pressed={outfit.favorite}
          aria-label={outfit.favorite ? 'Remove from favorites' : 'Add to favorites'}
          onClick={() => void setOutfitFavorite(outfit.id, !outfit.favorite)}
          className={`h-11 px-2 text-2xl ${outfit.favorite ? 'text-accent' : 'text-muted'}`}
        >
          {outfit.favorite ? '★' : '☆'}
        </button>
      </div>
      <div className="px-safe">
        <h1 className="text-[26px] leading-tight font-bold tracking-tight">{outfit.name}</h1>
        <p className="text-muted text-sm">
          {[...styleNames, ...outfit.seasons, outfit.occasion].filter(Boolean).join(' · ') || 'No style yet'}
        </p>
      </div>

      <div
        className="bg-surface border-line relative mx-4 mt-4 h-[58dvh] touch-pan-y overflow-hidden rounded-3xl border"
        onPointerDown={(e) => {
          setSwipeStart({ x: e.clientX, y: e.clientY })
        }}
        onPointerUp={(e) => {
          if (!swipeStart) return
          const dx = e.clientX - swipeStart.x
          const dy = e.clientY - swipeStart.y
          setSwipeStart(null)
          if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) setView((v) => stepView(v, dx < 0 ? 1 : -1))
        }}
      >
        {base && <LayeredView base={base.views[view]} layers={layers} />}
        {base === null && (
          <p className="text-muted absolute inset-0 flex items-center justify-center p-6 text-center text-sm">
            Create your base model to see outfits on your body.
          </p>
        )}
        {missing.length > 0 && (
          <p className="absolute inset-x-3 top-3 rounded-xl bg-black/60 px-3 py-2 text-center text-xs text-white">
            No {view} view: {missing.map((i) => i.name).join(', ')}
          </p>
        )}
      </div>
      <div className="px-safe mt-3">
        <ViewSwitcher value={view} onChange={setView} />
      </div>

      <h2 className="px-safe mt-6 mb-2 text-sm font-semibold">Items</h2>
      <ul className="px-safe space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              to={`/wardrobe/${item.id}`}
              className="bg-surface border-line flex items-center gap-3 rounded-2xl border p-2 active:scale-[0.98]"
            >
              <Thumb blob={item.thumbnail} className="size-12 shrink-0" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{item.name}</span>
                <span className="text-muted block truncate text-xs">{item.category}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="px-safe mt-6 flex flex-col gap-2">
        <Action
          onClick={() => {
            void navigate(`/outfits/${outfit.id}/edit`)
          }}
        >
          Edit outfit
        </Action>
        <Action
          onClick={() => {
            void copyOutfit(outfit.id).then((copy) => navigate(`/outfits/${copy}`))
          }}
        >
          Duplicate
        </Action>
        <Action
          danger
          onClick={() => {
            setConfirmDelete(true)
          }}
        >
          Delete outfit
        </Action>
      </div>

      <ConfirmSheet
        open={confirmDelete}
        title={`Delete “${outfit.name}”?`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          void deleteOutfit(outfit.id).then(() => navigate('/outfits', { replace: true }))
        }}
        onCancel={() => {
          setConfirmDelete(false)
        }}
      >
        Your items stay in the wardrobe. Days you wore it stay in the calendar as “Deleted outfit”.
      </ConfirmSheet>
    </div>
  )
}

function Action({ children, danger, onClick }: { children: ReactNode; danger?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`bg-surface border-line h-12 rounded-2xl border text-[15px] font-medium transition active:scale-[0.98] ${danger ? 'text-red-600' : ''}`}
    >
      {children}
    </button>
  )
}

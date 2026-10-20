import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ConfirmSheet } from '../components/ConfirmSheet'
import { ChevronLeftIcon } from '../components/Icons'
import { LayeredView } from '../components/LayeredView'
import { ViewSwitcher } from '../components/ViewSwitcher'
import { db } from '../db/db'
import { COLOR_PALETTE } from '../domain/attributes'
import type { ItemDeletePlan } from '../domain/outfits'
import { VIEWS, type View } from '../domain/types'
import { missingViews } from '../domain/wardrobe'
import { useBaseModel } from '../features/baseModel/store'
import { deleteItem, previewItemDelete, setItemFavorite } from '../features/items/store'
import { refreshOutfitThumbnails } from '../features/outfits/store'
import { debugLog } from '../lib/debugLog'

const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export function ItemDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const item = useLiveQuery(async () => (await db.items.get(id)) ?? null, [id])
  const outfitCount = useLiveQuery(() => db.outfits.where('itemIds').equals(id).count(), [id], 0)
  const styles = useLiveQuery(() => db.styles.toArray(), [], [])
  const base = useBaseModel()
  const [picked, setPicked] = useState<View | null>(null)
  const [plan, setPlan] = useState<ItemDeletePlan | null>(null)
  const [deleting, setDeleting] = useState(false)

  const view = picked ?? (item ? (VIEWS.find((v) => item.views[v]) ?? 'front') : 'front')
  const layer = item?.views[view]
  const layers = useMemo(() => (layer ? [layer] : []), [layer])

  if (item === null) {
    return (
      <div className="px-8 py-16 text-center">
        <p className="font-semibold">This item was deleted</p>
        <Link to="/wardrobe" className="text-accent mt-3 inline-block font-semibold">
          Back to Wardrobe
        </Link>
      </div>
    )
  }
  if (!item) return null

  const missing = missingViews(item)
  const styleNames = item.styleIds.map((sid) => styles.find((s) => s.id === sid)?.name).filter(Boolean)
  const retake = (v: View) => {
    void navigate(`/items/new?retake=${encodeURIComponent(item.id)}&view=${v}`)
  }

  const askDelete = async () => {
    setPlan(await previewItemDelete(item.id))
  }
  const confirmDelete = async () => {
    setDeleting(true)
    try {
      const done = await deleteItem(item.id)
      debugLog('item deleted', { outfitsUpdated: done.updated.length, outfitsDeleted: done.deleted.length })
      void refreshOutfitThumbnails(done.updated.map((o) => o.id))
      void navigate('/wardrobe', { replace: true })
    } finally {
      setDeleting(false)
      setPlan(null)
    }
  }

  return (
    <div className="pb-8">
      <div className="px-safe flex h-12 items-center justify-between">
        <button
          type="button"
          onClick={() => {
            void navigate(-1)
          }}
          className="-ml-2 flex h-11 items-center pr-2 text-[15px]"
          aria-label="Back"
        >
          <ChevronLeftIcon className="size-6" />
          Wardrobe
        </button>
        <button
          type="button"
          aria-pressed={item.favorite}
          aria-label={item.favorite ? 'Remove from favorites' : 'Add to favorites'}
          onClick={() => void setItemFavorite(item.id, !item.favorite)}
          className={`h-11 px-2 text-2xl ${item.favorite ? 'text-accent' : 'text-muted'}`}
        >
          {item.favorite ? '★' : '☆'}
        </button>
      </div>

      <div className="px-safe">
        <h1 className="text-[26px] leading-tight font-bold tracking-tight">{item.name}</h1>
        <p className="text-muted text-sm">
          {item.category}
          {item.accessoryType ? ` · ${item.accessoryType}` : ''}
          {item.brand ? ` · ${item.brand}` : ''}
        </p>
      </div>

      <div className="bg-surface border-line relative mx-4 mt-4 h-[52dvh] overflow-hidden rounded-3xl border">
        {base && layer && <LayeredView base={base.views[view]} layers={layers} />}
        {base === null && (
          <p className="text-muted absolute inset-0 flex items-center justify-center p-6 text-center text-sm">
            Create your base model to see items on your body.
          </p>
        )}
        {!layer && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="font-semibold">No {view} view yet</p>
            <button
              type="button"
              onClick={() => {
                retake(view)
              }}
              className="bg-ink text-canvas h-11 rounded-full px-5 text-sm font-semibold"
            >
              Add {view} view
            </button>
          </div>
        )}
      </div>
      <div className="px-safe mt-3">
        <ViewSwitcher value={view} onChange={setPicked} missing={missing} />
      </div>

      <div className="px-safe mt-5 grid grid-cols-3 gap-2 text-center">
        <Stat label="Worn" value={`${item.wearCount}×`} />
        <Stat label="Last worn" value={item.lastWornAt ? dateFormat.format(item.lastWornAt) : 'Never'} />
        <Link to={`/outfits?item=${encodeURIComponent(item.id)}`} className="block active:scale-[0.97]">
          <Stat label="In outfits" value={String(outfitCount)} link />
        </Link>
      </div>
      {outfitCount === 0 && (
        <Link
          to={`/outfits/new?item=${encodeURIComponent(item.id)}`}
          className="text-accent px-safe mt-2 block text-sm font-semibold"
        >
          Create an outfit with this →
        </Link>
      )}

      <dl className="px-safe mt-5 space-y-3 text-[15px]">
        <Row label="Styles">{styleNames.length ? styleNames.join(', ') : '—'}</Row>
        <Row label="Seasons">{item.seasons.length ? item.seasons.join(', ') : '—'}</Row>
        <Row label="Colors">
          {item.colors.length ? (
            <span className="flex flex-wrap items-center justify-end gap-1.5">
              {item.colors.map((c) => (
                <span key={c} className="flex items-center gap-1">
                  <span
                    className="border-line inline-block size-4 rounded-full border"
                    style={{ background: COLOR_PALETTE.find((p) => p.name === c)?.hex }}
                  />
                  {c}
                </span>
              ))}
            </span>
          ) : (
            '—'
          )}
        </Row>
        {item.notes && <Row label="Notes">{item.notes}</Row>}
        <Row label="Added">{dateFormat.format(item.createdAt)}</Row>
      </dl>

      <div className="px-safe mt-6 flex flex-col gap-2">
        <ActionButton
          onClick={() => {
            void navigate(`/wardrobe/${item.id}/edit`)
          }}
        >
          Edit details
        </ActionButton>
        <ActionButton
          onClick={() => {
            retake(view)
          }}
        >
          {layer ? `Retake ${view} view` : `Add ${view} view`}
        </ActionButton>
        <ActionButton danger onClick={() => void askDelete()}>
          Delete item
        </ActionButton>
      </div>

      <ConfirmSheet
        open={plan !== null}
        title={`Delete “${item.name}”?`}
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        destructive
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          setPlan(null)
        }}
      >
        {plan && <DeleteSummary plan={plan} />}
      </ConfirmSheet>
    </div>
  )
}

function DeleteSummary({ plan }: { plan: ItemDeletePlan }) {
  if (!plan.updated.length && !plan.deleted.length) return <p>It isn’t used in any outfit. This can’t be undone.</p>
  return (
    <div className="space-y-2">
      {plan.updated.length > 0 && (
        <p>
          It will be removed from {plan.updated.length === 1 ? 'this outfit' : `${plan.updated.length} outfits`}:{' '}
          <span className="text-ink">{plan.updated.map((o) => o.name).join(', ')}</span>.
        </p>
      )}
      {plan.deleted.length > 0 && (
        <p>
          {plan.deleted.length === 1 ? 'This outfit has' : 'These outfits have'} nothing else, so{' '}
          {plan.deleted.length === 1 ? 'it' : 'they'} will be deleted:{' '}
          <span className="text-ink">{plan.deleted.map((o) => o.name).join(', ')}</span>. Days you wore{' '}
          {plan.deleted.length === 1 ? 'it' : 'them'} stay in the calendar as “Deleted outfit”.
        </p>
      )}
      <p>This can’t be undone.</p>
    </div>
  )
}

function Stat({ label, value, link }: { label: string; value: string; link?: boolean }) {
  return (
    <div className="bg-surface border-line rounded-2xl border px-2 py-3">
      <p className={`text-lg font-semibold ${link ? 'text-accent' : ''}`}>{value}</p>
      <p className="text-muted text-xs">{label}</p>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-line flex justify-between gap-4 border-b pb-3">
      <dt className="text-muted shrink-0">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  )
}

function ActionButton({ children, danger, onClick }: { children: ReactNode; danger?: boolean; onClick: () => void }) {
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

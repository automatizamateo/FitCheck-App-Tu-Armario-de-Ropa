import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { CheckIcon } from '../../components/Icons'
import { Thumb } from '../../components/Thumb'
import { ViewSwitcher } from '../../components/ViewSwitcher'
import { db } from '../../db/db'
import { CATEGORIES } from '../../domain/categories'
import {
  canMoveLayer,
  moveLayer,
  removeItem,
  resetTransform,
  setTransform,
  toggleItem,
  type OutfitContent,
} from '../../domain/outfits'
import { stepView, type Category, type Item, type Transform, type View } from '../../domain/types'
import { debugLog } from '../../lib/debugLog'
import { useBaseModel } from '../baseModel/store'
import { BuilderCanvas } from './BuilderCanvas'
import { OutfitForm } from './OutfitForm'
import { composeView, renderOutfitThumbnail, saveOutfit, type OutfitDetails } from './store'

const EMPTY: OutfitContent = { itemIds: [], overrides: {} }

/**
 * New outfit (/outfits/new, ?item=<id> to start with one item) or edit (/outfits/:id/edit).
 * Outfits are only combinations of wardrobe items on the base model: no photos here.
 */
export function OutfitBuilder() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const startItem = params.get('item')
  const navigate = useNavigate()
  const base = useBaseModel()
  const items = useLiveQuery(() => db.items.toArray(), [])

  const [content, setContent] = useState<OutfitContent | null>(id ? null : EMPTY)
  const [details, setDetails] = useState<OutfitDetails>({ name: '', styleIds: [], seasons: [], favorite: false })
  const [dirty, setDirty] = useState(false)
  const [view, setView] = useState<View>('front')
  const [selected, setSelected] = useState<string | null>(null)
  const [tab, setTab] = useState<Category | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [form, setForm] = useState<{ thumbnail: Blob | null; busy: boolean; error: string | null } | null>(null)

  // Editing: load the outfit once.
  useEffect(() => {
    if (!id) return
    let cancelled = false
    void db.outfits.get(id).then((o) => {
      if (cancelled) return
      if (!o) {
        void navigate('/outfits', { replace: true })
        return
      }
      setContent({ itemIds: o.itemIds, overrides: o.overrides })
      setDetails({ name: o.name, styleIds: o.styleIds, seasons: o.seasons, occasion: o.occasion, favorite: o.favorite })
    })
    return () => {
      cancelled = true
    }
  }, [id, navigate])

  // "Create an outfit with this" from an item.
  useEffect(() => {
    if (id || !startItem) return
    let cancelled = false
    void db.items.get(startItem).then((item) => {
      if (cancelled || !item) return
      setContent((c) => (c && c.itemIds.length === 0 ? { itemIds: [item.id], overrides: {} } : c))
      setTab((t) => t ?? item.category)
    })
    return () => {
      cancelled = true
    }
  }, [id, startItem])

  const byId = useMemo(() => new Map((items ?? []).map((i) => [i.id, i])), [items])
  const entries = useMemo(() => (content && items ? composeView(content, items, view) : []), [content, items, view])
  const categories = useMemo(() => CATEGORIES.filter((c) => items?.some((i) => i.category === c)), [items])
  const activeTab = tab && categories.includes(tab) ? tab : (categories[0] ?? null)
  const missingHere = (content?.itemIds ?? []).filter((i) => !byId.get(i)?.views[view]).map((i) => byId.get(i)?.name)

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => {
      setToast(null)
    }, 2500)
  }

  const change = (next: OutfitContent) => {
    setContent(next)
    setDirty(true)
  }

  const onTransform = useCallback(
    (itemId: string, t: Transform) => {
      setContent((c) => (c ? setTransform(c, itemId, view, t) : c))
      setDirty(true)
    },
    [view],
  )
  const onSwipe = useCallback((direction: 1 | -1) => {
    setView((v) => stepView(v, direction))
  }, [])

  const pick = (item: Item) => {
    if (!content || !items) return
    const result = toggleItem(content, item, items)
    change(result.content)
    if (result.added) {
      setSelected(item.id)
      if (!item.views[view]) showToast(`“${item.name}” has no ${view} view.`)
      const names = result.replaced.map((r) => byId.get(r)?.name).filter(Boolean)
      if (names.length) showToast(`Swapped ${names.join(', ')} for “${item.name}”`)
    } else if (selected === item.id) {
      setSelected(null)
    }
  }

  const leave = () => {
    void navigate(id ? `/outfits/${id}` : '/outfits', { replace: true })
  }

  const openForm = () => {
    if (!content || !items || !base) return
    setSelected(null)
    if (!id && !details.name) {
      const names = content.itemIds.map((i) => byId.get(i)?.name).filter(Boolean)
      setDetails((d) => ({ ...d, name: names.slice(0, 2).join(' + ') + (names.length > 2 ? ' …' : '') }))
    }
    setForm({ thumbnail: null, busy: false, error: null })
  }

  // The form replaces the canvas (its bitmaps are freed); then the thumbnail is rendered one image at a time.
  const formOpen = form !== null
  useEffect(() => {
    if (!formOpen || !content || !items || !base) return
    let cancelled = false
    void renderOutfitThumbnail(base, content, items)
      .then((thumbnail) => {
        if (!cancelled) setForm((f) => (f ? { ...f, thumbnail } : f))
      })
      .catch((err: unknown) => {
        debugLog(`outfit preview failed: ${err instanceof Error ? err.message : String(err)}`)
      })
    return () => {
      cancelled = true
    }
  }, [formOpen, content, items, base])

  const save = async (d: OutfitDetails) => {
    if (!form || !content || !items || !base) return
    setForm({ ...form, busy: true, error: null })
    try {
      const thumbnail = form.thumbnail ?? (await renderOutfitThumbnail(base, content, items))
      const saved = await saveOutfit(content, d, thumbnail, id)
      debugLog('outfit saved', { items: content.itemIds.length, kb: Math.round(thumbnail.size / 1024) })
      void navigate(`/outfits/${saved}`, { replace: true })
    } catch (err) {
      setForm({ ...form, busy: false, error: err instanceof Error ? err.message : String(err) })
    }
  }

  if (base === undefined || items === undefined || content === null) return <div className="bg-canvas fixed inset-0" />

  if (base === null) {
    return (
      <Blocked
        title="Create your base model first"
        body="Outfits are put together on your base model."
        action="Create base model"
        onAction={() => void navigate('/base-model')}
        onClose={leave}
      />
    )
  }
  if (items.length === 0) {
    return (
      <Blocked
        title="Add items to your wardrobe first"
        body="An outfit combines clothes you have already added to your Wardrobe."
        action="Go to Wardrobe"
        onAction={() => void navigate('/wardrobe')}
        onClose={leave}
      />
    )
  }

  if (form) {
    return (
      <OutfitForm
        initial={details}
        thumbnail={form.thumbnail}
        itemNames={content.itemIds.map((i) => byId.get(i)?.name ?? '').filter(Boolean)}
        busy={form.busy}
        error={form.error}
        onSave={(d) => void save(d)}
        onBack={() => {
          setForm(null)
        }}
      />
    )
  }

  const sel = selected && content.itemIds.includes(selected) ? selected : null
  const selItem = sel ? byId.get(sel) : undefined
  const tabItems = items.filter((i) => i.category === activeTab).sort((a, b) => b.createdAt - a.createdAt)

  return (
    <div className="bg-canvas text-ink fixed inset-0 z-50 flex flex-col select-none">
      <div className="pt-safe px-safe flex h-[calc(env(safe-area-inset-top)+3rem)] shrink-0 items-center justify-between">
        <button
          type="button"
          onClick={() => {
            if (dirty) setConfirmLeave(true)
            else leave()
          }}
          className="text-muted -ml-2 h-11 px-2 text-[15px]"
        >
          Cancel
        </button>
        <p className="font-semibold">{id ? 'Edit outfit' : 'New outfit'}</p>
        <button
          type="button"
          disabled={content.itemIds.length === 0}
          onClick={openForm}
          className="text-accent -mr-2 h-11 px-2 text-[15px] font-semibold disabled:opacity-40"
        >
          Save
        </button>
      </div>

      <div className="px-safe shrink-0 pb-2">
        <ViewSwitcher value={view} onChange={setView} />
      </div>

      <div className="bg-surface border-line relative mx-3 min-h-0 flex-1 overflow-hidden rounded-3xl border">
        <BuilderCanvas
          base={base.views[view]}
          entries={entries}
          selected={sel}
          onSelect={setSelected}
          onTransform={onTransform}
          onSwipe={onSwipe}
        />
        {content.itemIds.length === 0 && (
          <p className="text-muted pointer-events-none absolute inset-x-6 top-4 text-center text-sm">
            Tap items below to put them on.
          </p>
        )}
        {missingHere.length > 0 && (
          <p className="pointer-events-none absolute inset-x-3 top-3 rounded-xl bg-black/60 px-3 py-2 text-center text-xs text-white">
            No {view} view: {missingHere.join(', ')}
          </p>
        )}
        {sel && selItem && (
          <div className="absolute inset-x-2 bottom-2 rounded-2xl bg-black/75 p-2 text-white backdrop-blur">
            <p className="truncate px-1 pb-1.5 text-xs text-white/70">
              {selItem.name} · drag, pinch, twist · {view} view
            </p>
            <div className="grid grid-cols-5 gap-1.5">
              <Tool
                disabled={!canMoveLayer(content, items, view, sel, 1)}
                onClick={() => {
                  change(moveLayer(content, items, view, sel, 1))
                }}
              >
                Forward
              </Tool>
              <Tool
                disabled={!canMoveLayer(content, items, view, sel, -1)}
                onClick={() => {
                  change(moveLayer(content, items, view, sel, -1))
                }}
              >
                Backward
              </Tool>
              <Tool
                onClick={() => {
                  change(resetTransform(content, sel, view))
                }}
              >
                Reset
              </Tool>
              <Tool
                onClick={() => {
                  change(removeItem(content, sel))
                  setSelected(null)
                }}
              >
                Remove
              </Tool>
              <Tool
                onClick={() => {
                  setSelected(null)
                }}
              >
                Done
              </Tool>
            </div>
          </div>
        )}
      </div>

      <div className="pb-safe shrink-0 pt-2">
        <div className="px-safe flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none]">
          {categories.map((c) => {
            const count = content.itemIds.filter((i) => byId.get(i)?.category === c).length
            return (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setTab(c)
                }}
                className={`h-9 shrink-0 rounded-full px-3.5 text-sm font-medium whitespace-nowrap transition active:scale-95 ${
                  c === activeTab ? 'bg-ink text-canvas' : 'bg-surface border-line border'
                }`}
              >
                {c}
                {count > 0 && <span className="text-accent ml-1">•</span>}
              </button>
            )
          })}
        </div>
        <div className="px-safe flex h-[7.5rem] gap-2 overflow-x-auto pb-2 [scrollbar-width:none]">
          {tabItems.map((item) => {
            const on = content.itemIds.includes(item.id)
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  pick(item)
                }}
                className={`bg-surface relative flex w-20 shrink-0 flex-col rounded-2xl border p-1.5 transition active:scale-95 ${
                  on ? 'border-accent ring-accent ring-2' : 'border-line'
                }`}
              >
                <Thumb blob={item.thumbnail} className="min-h-0 w-full flex-1" />
                <span className="mt-1 w-full truncate text-[11px] leading-tight">{item.name}</span>
                {on && (
                  <span className="bg-accent text-accent-ink absolute top-1 right-1 flex size-5 items-center justify-center rounded-full">
                    <CheckIcon className="size-3.5" />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {toast && (
        <p className="bg-ink text-canvas fixed inset-x-6 top-[calc(env(safe-area-inset-top)+6.5rem)] z-[60] rounded-2xl p-3 text-center text-sm">
          {toast}
        </p>
      )}

      <ConfirmSheet
        open={confirmLeave}
        title="Discard this outfit?"
        confirmLabel="Discard"
        destructive
        onConfirm={leave}
        onCancel={() => {
          setConfirmLeave(false)
        }}
      >
        Your changes won’t be saved.
      </ConfirmSheet>
    </div>
  )
}

function Tool({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-10 rounded-xl bg-white/12 text-xs font-semibold active:scale-95 disabled:opacity-35"
    >
      {children}
    </button>
  )
}

function Blocked({
  title,
  body,
  action,
  onAction,
  onClose,
}: {
  title: string
  body: string
  action: string
  onAction: () => void
  onClose: () => void
}) {
  return (
    <div className="pt-safe pb-safe px-safe bg-canvas text-ink fixed inset-0 z-50 flex flex-col justify-center">
      <div className="mx-auto w-full max-w-sm space-y-3 p-5 text-center">
        <p className="text-lg font-semibold">{title}</p>
        <p className="text-muted text-sm leading-relaxed">{body}</p>
        <div className="flex flex-col gap-3 pt-4">
          <button type="button" onClick={onAction} className="bg-ink text-canvas h-12 rounded-full font-semibold">
            {action}
          </button>
          <button type="button" onClick={onClose} className="h-12 font-medium">
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}

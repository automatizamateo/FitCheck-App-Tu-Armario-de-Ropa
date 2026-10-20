import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button } from '../components/Button'
import { Chips } from '../components/Chips'
import { EmptyState } from '../components/EmptyState'
import { HangerIcon, PersonIcon, PlusIcon } from '../components/Icons'
import { PageHeader } from '../components/PageHeader'
import { db } from '../db/db'
import { useBaseModel } from '../features/baseModel/store'
import { CATEGORIES } from '../domain/categories'

export function WardrobePage() {
  const navigate = useNavigate()
  const [category, setCategory] = useState<string | null>(null)
  const count = useLiveQuery(() => db.items.count(), [], 0)
  const baseModel = useBaseModel()

  return (
    <>
      <PageHeader title="Wardrobe" />
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
              <span className="text-muted block text-sm">Three photos of you, so clothes can be shown on your body.</span>
            </span>
          </button>
        </div>
      )}
      <Chips options={CATEGORIES} selected={category} onSelect={setCategory} />
      {count === 0 && (
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
    </>
  )
}

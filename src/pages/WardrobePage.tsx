import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button } from '../components/Button'
import { Chips } from '../components/Chips'
import { EmptyState } from '../components/EmptyState'
import { HangerIcon, PlusIcon } from '../components/Icons'
import { PageHeader } from '../components/PageHeader'
import { db } from '../db/db'
import { CATEGORIES } from '../domain/categories'

export function WardrobePage() {
  const navigate = useNavigate()
  const [category, setCategory] = useState<string | null>(null)
  const count = useLiveQuery(() => db.items.count(), [], 0)

  return (
    <>
      <PageHeader title="Wardrobe" />
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

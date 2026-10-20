import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Chips } from '../components/Chips'
import { EmptyState } from '../components/EmptyState'
import { ShirtIcon } from '../components/Icons'
import { PageHeader } from '../components/PageHeader'
import { db } from '../db/db'

export function OutfitsPage() {
  const [style, setStyle] = useState<string | null>(null)
  const styles = useLiveQuery(() => db.styles.toArray(), [], [])
  const count = useLiveQuery(() => db.outfits.count(), [], 0)

  return (
    <>
      <PageHeader title="Outfits" />
      <Chips options={styles.map((s) => s.name)} selected={style} onSelect={setStyle} allLabel="All styles" />
      {count === 0 && (
        <EmptyState
          icon={<ShirtIcon />}
          title="No outfits yet"
          body="Once you've added a few items, combine them into outfits and see them from the front, side and back."
        />
      )}
    </>
  )
}

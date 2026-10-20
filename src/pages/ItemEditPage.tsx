import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { missingViews } from '../domain/wardrobe'
import { DetailsForm } from '../features/items/DetailsForm'
import { thumbnailView, updateItemDetails, type ItemDetails } from '../features/items/store'

export function ItemEditPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const item = useLiveQuery(async () => (await db.items.get(id)) ?? null, [id])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (item === undefined) return null
  if (item === null) return <Navigate to="/wardrobe" replace />
  const shown = thumbnailView(item.views)
  const back = () => {
    void navigate(`/wardrobe/${item.id}`, { replace: true })
  }

  const save = async (details: ItemDetails) => {
    setBusy(true)
    try {
      await updateItemDetails(item.id, details)
      back()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    // The form copies `initial` once, so live updates of the item don't reset what is being typed.
    <DetailsForm
      key={item.id}
      category={item.category}
      accessoryType={item.accessoryType}
      image={shown && item.views[shown]?.image}
      missing={missingViews(item)}
      initial={item}
      title="Edit item"
      saveLabel="Save changes"
      busy={busy}
      error={error}
      onSave={(d) => void save(d)}
      onCancel={back}
    />
  )
}

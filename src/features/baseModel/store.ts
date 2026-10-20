import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { VIEWS, type BaseModel, type BaseModelDraft, type BaseModelView, type PendingPhoto, type View } from '../../domain/types'

export function useBaseModel(): BaseModel | null | undefined {
  return useLiveQuery(async () => (await db.baseModel.get('base')) ?? null)
}

export async function getDraft(): Promise<BaseModelDraft | undefined> {
  return db.baseModelDraft.get('draft')
}

/** Saves one confirmed view of a base model being created (so a crash or reload loses nothing). */
export async function saveDraftView(view: View, data: BaseModelView): Promise<BaseModelDraft> {
  return db.transaction('rw', db.baseModelDraft, async () => {
    const draft = (await db.baseModelDraft.get('draft')) ?? { id: 'draft' as const, views: {}, startedAt: Date.now() }
    draft.views[view] = data
    await db.baseModelDraft.put(draft)
    return draft
  })
}

/** Turns a complete draft into the base model. */
export async function finalizeDraft(): Promise<void> {
  await db.transaction('rw', db.baseModelDraft, db.baseModel, async () => {
    const draft = await db.baseModelDraft.get('draft')
    if (!draft) throw new Error('No draft to save')
    const missing = VIEWS.filter((v) => !draft.views[v])
    if (missing.length) throw new Error(`Missing views: ${missing.join(', ')}`)
    const now = Date.now()
    const existing = await db.baseModel.get('base')
    await db.baseModel.put({
      id: 'base',
      views: draft.views as Record<View, BaseModelView>,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
    await db.baseModelDraft.delete('draft')
  })
}

/** Replaces a single view of an existing base model. */
export async function replaceBaseModelView(view: View, data: BaseModelView): Promise<void> {
  await db.transaction('rw', db.baseModel, async () => {
    const model = await db.baseModel.get('base')
    if (!model) throw new Error('There is no base model to update')
    model.views[view] = data
    model.updatedAt = Date.now()
    await db.baseModel.put(model)
  })
}

export async function discardDraft(): Promise<void> {
  await db.baseModelDraft.delete('draft')
}

/** Keeps the photo about to be processed until processing finishes, for Retry after a crash. */
export async function savePendingPhoto(view: View, image: Blob): Promise<void> {
  await db.pendingPhoto.put({ id: 'pending', view, image, savedAt: Date.now() })
}

export async function getPendingPhoto(): Promise<PendingPhoto | undefined> {
  return db.pendingPhoto.get('pending')
}

export async function clearPendingPhoto(): Promise<void> {
  await db.pendingPhoto.delete('pending')
}

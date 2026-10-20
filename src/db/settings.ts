import { useLiveQuery } from 'dexie-react-hooks'
import type { Settings } from '../domain/types'
import { db, DEFAULT_SETTINGS } from './db'

/** Returns undefined while loading. */
export function useSettings(): Settings | undefined {
  return useLiveQuery(async () => (await db.settings.get('settings')) ?? DEFAULT_SETTINGS)
}

export async function updateSettings(changes: Partial<Omit<Settings, 'id'>>): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const current = (await db.settings.get('settings')) ?? DEFAULT_SETTINGS
    await db.settings.put({ ...current, ...changes })
  })
}

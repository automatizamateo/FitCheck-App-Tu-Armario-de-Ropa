import { useLiveQuery } from 'dexie-react-hooks'
import type { MlSettings, Settings } from '../domain/types'
import { db, withSettingsDefaults } from './db'

/** Returns undefined while loading. */
export function useSettings(): Settings | undefined {
  return useLiveQuery(async () => withSettingsDefaults(await db.settings.get('settings')))
}

export async function updateSettings(changes: Partial<Omit<Settings, 'id'>>): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const current = withSettingsDefaults(await db.settings.get('settings'))
    await db.settings.put({ ...current, ...changes })
  })
}

export async function getSettings(): Promise<Settings> {
  return withSettingsDefaults(await db.settings.get('settings'))
}

/** Merges into settings.ml; pass undefined for a key to clear it. */
export async function updateMlSettings(changes: Partial<MlSettings>): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const current = withSettingsDefaults(await db.settings.get('settings'))
    await db.settings.put({ ...current, ml: { ...current.ml, ...changes } })
  })
}

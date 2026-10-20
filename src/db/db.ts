import { Dexie, type EntityTable } from 'dexie'
import { DEFAULT_STYLES } from '../domain/attributes'
import type { BaseModel, BaseModelDraft, Item, MlSettings, Outfit, Settings, Style, WearLogEntry } from '../domain/types'

export const DEFAULT_ML_SETTINGS: MlSettings = {
  model: 'auto',
  device: 'auto',
  dtype: 'auto',
  refineEdges: 'auto',
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  unusedThresholdDays: 60,
  keepOriginalPhotos: false,
  onboardingDone: false,
  captureTipsSeen: false,
  ml: DEFAULT_ML_SETTINGS,
}

/** Fills fields added after a settings row was first written. */
export function withSettingsDefaults(stored: Partial<Settings> | undefined): Settings {
  return { ...DEFAULT_SETTINGS, ...stored, id: 'settings', ml: { ...DEFAULT_ML_SETTINGS, ...stored?.ml } }
}

export class FitCheckDB extends Dexie {
  baseModel!: EntityTable<BaseModel, 'id'>
  baseModelDraft!: EntityTable<BaseModelDraft, 'id'>
  items!: EntityTable<Item, 'id'>
  outfits!: EntityTable<Outfit, 'id'>
  wearLog!: EntityTable<WearLogEntry, 'id'>
  styles!: EntityTable<Style, 'id'>
  settings!: EntityTable<Settings, 'id'>

  constructor(name = 'fitcheck') {
    super(name)

    // Schema history: never edit a released version, add a new one with an upgrade() instead.
    // `favorite` is not indexed: IndexedDB cannot index booleans (see DECISIONS.md).
    this.version(1).stores({
      baseModel: 'id',
      items: 'id, category, *styleIds, lastWornAt, createdAt',
      outfits: 'id, *styleIds, *itemIds, createdAt, updatedAt',
      wearLog: 'id, date, outfitId',
      styles: 'id, name',
      settings: 'id',
    })

    // v2 (Phase 2): base model draft; settings gain capture tips + ML preferences.
    this.version(2)
      .stores({ baseModelDraft: 'id' })
      .upgrade((tx) =>
        tx
          .table<Settings, string>('settings')
          .toCollection()
          .modify((s) => {
            Object.assign(s, withSettingsDefaults(s))
          }),
      )

    this.on('populate', (tx) => {
      void tx.table('styles').bulkAdd([...DEFAULT_STYLES])
      void tx.table('settings').add(DEFAULT_SETTINGS)
    })
  }
}

export const db = new FitCheckDB()

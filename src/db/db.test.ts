import { Dexie } from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_STYLES } from '../domain/attributes'
import { LIGHT_SEGMENTATION_MODEL } from '../ml/models'
import { DEFAULT_SETTINGS, FitCheckDB } from './db'

let db: FitCheckDB | undefined

afterEach(async () => {
  await db?.delete()
})

describe('FitCheckDB', () => {
  it('seeds built-in styles and default settings on first open', async () => {
    db = new FitCheckDB('test-seed')
    await db.open()

    const styles = await db.styles.toArray()
    expect(styles.map((s) => s.name).sort()).toEqual(DEFAULT_STYLES.map((s) => s.name).sort())
    expect(styles.every((s) => s.builtIn)).toBe(true)

    const settings = await db.settings.get('settings')
    expect(settings).toMatchObject({ unusedThresholdDays: 60, keepOriginalPhotos: false, onboardingDone: false })
  })

  it('queries items by multi-entry style index', async () => {
    db = new FitCheckDB('test-index')
    await db.items.add({
      id: 'i1',
      name: 'White tee',
      category: 'T-Shirts',
      styleIds: ['builtin-casual', 'builtin-sporty'],
      seasons: ['Summer'],
      colors: ['White'],
      favorite: false,
      layer: 30,
      views: {},
      thumbnail: new Blob(),
      createdAt: Date.now(),
      wearCount: 0,
    })
    expect(await db.items.where('styleIds').equals('builtin-sporty').count()).toBe(1)
    expect(await db.items.where('category').equals('Pants').count()).toBe(0)
  })

  it('v3 turns the old crash flags into plain settings', async () => {
    const old = new Dexie('test-v3')
    old.version(2).stores({ baseModel: 'id', baseModelDraft: 'id', settings: 'id' })
    await old.table('settings').put({
      ...DEFAULT_SETTINGS,
      ml: { ...DEFAULT_SETTINGS.ml, crashFallback: true, refineCrashed: true },
    })
    old.close()

    db = new FitCheckDB('test-v3')
    const ml = (await db.settings.get('settings'))?.ml
    expect(ml).toMatchObject({ model: LIGHT_SEGMENTATION_MODEL, refineEdges: 'off' })
    expect(ml).not.toHaveProperty('crashFallback')
    expect(ml).not.toHaveProperty('refineCrashed')
  })
})

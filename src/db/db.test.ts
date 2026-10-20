import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_STYLES } from '../domain/attributes'
import { FitCheckDB } from './db'

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
})

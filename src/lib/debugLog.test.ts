import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryStorage } from '../test/memoryStorage'
import { clearDebugLog, debugLog, formatDebugLog, MAX_LOG_ENTRIES, readDebugLog } from './debugLog'
import { TimeoutError, withTimeout } from './timeout'

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
})

describe('debug log', () => {
  it('appends timestamped lines and keeps only the newest entries', () => {
    for (let i = 0; i < MAX_LOG_ENTRIES + 5; i++) debugLog(`line ${i}`)
    const entries = readDebugLog()
    expect(entries).toHaveLength(MAX_LOG_ENTRIES)
    expect(entries[0]?.m).toBe('line 5')
    expect(entries.at(-1)?.m).toBe(`line ${MAX_LOG_ENTRIES + 4}`)
    expect(typeof entries[0]?.t).toBe('number')
  })

  it('formats with millisecond timestamps and serializes data', () => {
    debugLog('step', { ms: 12 })
    expect(formatDebugLog(readDebugLog())).toMatch(/^\d\d-\d\d \d\d:\d\d:\d\d\.\d{3} step \{"ms":12\}$/)
    clearDebugLog()
    expect(readDebugLog()).toEqual([])
  })

  it('never throws when storage is unavailable or corrupt', () => {
    localStorage.setItem('fitcheck-debug-log', '{not json')
    expect(readDebugLog()).toEqual([])
    vi.stubGlobal('localStorage', undefined)
    expect(() => {
      debugLog('x')
    }).not.toThrow()
  })
})

describe('withTimeout', () => {
  it('resolves when the work finishes in time', async () => {
    await expect(withTimeout(Promise.resolve(3), 50, 'x')).resolves.toBe(3)
  })

  it('rejects with TimeoutError and calls onTimeout when it hangs', async () => {
    const onTimeout = vi.fn()
    await expect(withTimeout(new Promise(() => undefined), 10, 'Refining edges', onTimeout)).rejects.toBeInstanceOf(TimeoutError)
    expect(onTimeout).toHaveBeenCalledOnce()
  })

  it('passes errors through', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 50, 'x')).rejects.toThrow('boom')
  })
})

import { describe, expect, it } from 'vitest'
import { History } from './history'

describe('History', () => {
  it('undoes and redoes', () => {
    const h = new History('a')
    h.push('b')
    h.push('c')
    expect(h.undo()).toBe('b')
    expect(h.undo()).toBe('a')
    expect(h.undo()).toBeUndefined()
    expect(h.redo()).toBe('b')
    expect(h.current).toBe('b')
  })

  it('drops the redo branch after a new push', () => {
    const h = new History(0)
    h.push(1)
    h.push(2)
    h.undo()
    h.push(3)
    expect(h.canRedo).toBe(false)
    expect(h.undo()).toBe(1)
  })

  it('keeps at least `capacity` undo steps and forgets older ones', () => {
    const h = new History(0, 25)
    for (let i = 1; i <= 40; i++) h.push(i)
    let steps = 0
    while (h.undo() !== undefined) steps++
    expect(steps).toBe(25)
    expect(h.current).toBe(15)
  })
})

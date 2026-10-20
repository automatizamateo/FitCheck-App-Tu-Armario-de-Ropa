/** Linear undo/redo history. Pushing after an undo drops the redo branch. */
export class History<T> {
  private states: T[]
  private index = 0
  private readonly capacity: number

  constructor(initial: T, capacity = 30) {
    this.states = [initial]
    this.capacity = capacity
  }

  get current(): T {
    return this.states[this.index] as T
  }

  get canUndo(): boolean {
    return this.index > 0
  }

  get canRedo(): boolean {
    return this.index < this.states.length - 1
  }

  push(state: T): void {
    this.states = this.states.slice(0, this.index + 1)
    this.states.push(state)
    if (this.states.length > this.capacity + 1) this.states.shift()
    this.index = this.states.length - 1
  }

  undo(): T | undefined {
    if (!this.canUndo) return undefined
    this.index--
    return this.current
  }

  redo(): T | undefined {
    if (!this.canRedo) return undefined
    this.index++
    return this.current
  }
}

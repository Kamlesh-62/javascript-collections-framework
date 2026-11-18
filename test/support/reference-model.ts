// Seeded reference-model runner: applies the same random operations to a collection and to a
// native model and compares every observable result. In live mode it also interleaves open
// iterators and cursors with changes and compares them with native Set iterators.

import { expect } from 'vitest'
import {
  type Collection,
  ConcurrentModificationError,
  type Cursor,
  IllegalArgumentError,
  type MapEntry,
  NoSuchElementError,
} from '../../src/index'
import type { List } from '../../src/interfaces/list'
import type { Deque } from '../../src/interfaces/queue'
import type { SequencedMap } from '../../src/interfaces/sequenced-map'
import type { SequencedSet } from '../../src/interfaces/sequenced-set'
import type { SortedMap } from '../../src/interfaces/sorted-map'
import type { SortedSet } from '../../src/interfaces/sorted-set'
import { integer, pick, seeded } from './random'
import { expectSameSequence, sameElement } from './sequence'

// ── Tuning for long runs ──
//
// Every runner takes an optional `tuning`. Without it a runner draws exactly the random numbers it
// always drew, so the seeds in the existing tests keep their sequences.

/** Size marks a long run must cross: reach at least `high`, then fall to at most `low`, `cycles` times. */
export interface SizeMarks {
  readonly high: number
  readonly low: number
  readonly cycles: number
}

/** Optional settings for long runs. */
export interface RunTuning {
  /** How many distinct integers (from 0) values or keys are drawn from, where the runner draws them. */
  readonly values?: number
  /** Compare the full contents every `checkEvery` steps and after the last, instead of the default schedule. */
  readonly checkEvery?: number
  /** Hold up to this many iterators and cursors open at once, dropping the oldest unstepped. */
  readonly maxOpen?: number
  /** Bias the operations into grow and shrink phases between these marks. */
  readonly marks?: SizeMarks
}

/** Operation names by their effect on size, for the grow and shrink phases. */
interface OpEffects {
  /** Operations that add elements. */
  readonly grow: readonly string[]
  /** Operations that remove one element or a few. */
  readonly shrink: readonly string[]
  /** Operations that remove many elements at once (`clear`, a range clear, a bulk drain). */
  readonly wipe: readonly string[]
  /** Operations that add many elements at once. */
  readonly fill?: readonly string[]
}

/**
 * Chooses each step's operation. Without marks it is one `pick`. With marks, a grow phase always
 * redraws a wipe and redraws a removal up to three times, until the size reaches `high`; a shrink
 * phase then always redraws a bulk fill and redraws an addition or a wipe up to three times, and
 * aims removals by value at present members, until the size falls to `low`, which ends a cycle.
 * Opposite operations stay possible in every phase, only rarer.
 */
class Phases {
  private growing = true
  private cycles = 0

  constructor(
    private readonly marks: SizeMarks | undefined,
    private readonly effects: OpEffects,
  ) {}

  choose(random: () => number, ops: readonly string[]): string {
    let op = pick(random, ops)
    if (this.marks === undefined) return op
    const { grow, shrink, wipe } = this.effects
    const always = this.growing ? wipe : (this.effects.fill ?? [])
    const opposite = this.growing ? shrink : [...grow, ...wipe]
    let tries = 0
    while (always.includes(op) || (tries < 3 && opposite.includes(op))) {
      if (!always.includes(op)) tries++
      op = pick(random, ops)
    }
    return op
  }

  /**
   * In a shrink phase, returns a present member for a removal by value (`op` among the shrink
   * operations), drawn from `members`; otherwise `undefined`, drawing nothing.
   */
  aim<T>(random: () => number, op: string, members: () => readonly T[]): { value: T } | undefined {
    if (this.marks === undefined || this.growing || !this.effects.shrink.includes(op)) {
      return undefined
    }
    const present = members()
    return present.length === 0 ? undefined : { value: pick(random, present) }
  }

  /** Moves between phases after a step left the collection at `size`. */
  after(size: number): void {
    const marks = this.marks
    if (marks === undefined) return
    if (this.growing && size >= marks.high) this.growing = false
    else if (!this.growing && size <= marks.low) {
      this.growing = true
      this.cycles++
    }
  }

  /** Fails unless the run crossed the marks the configured number of times. */
  finish(at: string): void {
    if (this.marks === undefined) return
    expect(this.cycles, `${at}: size cycles between the marks`).toBeGreaterThanOrEqual(
      this.marks.cycles,
    )
  }
}

/**
 * `expect(actual, at).toBe(expected)`, with a plain `Object.is` check first so that long runs do
 * not pay for an assertion object per step; a mismatch still fails through `expect`.
 */
function is(actual: unknown, expected: unknown, at: string): void {
  if (!Object.is(actual, expected)) expect(actual, at).toBe(expected)
}

/**
 * `expect(actual, at).toEqual(expected)`, with a plain check first for arrays (element by element)
 * and iterator results; anything else, and any mismatch, goes through `expect`.
 */
function isEqual(actual: unknown, expected: unknown, at: string): void {
  if (Array.isArray(actual) && sameElement(actual, expected)) return
  if (isResult(actual) && isResult(expected)) {
    if (actual.done === expected.done && sameElement(actual.value, expected.value)) return
  }
  expect(actual, at).toEqual(expected)
}

function isResult(value: unknown): value is IteratorResult<unknown> {
  return typeof value === 'object' && value !== null && 'done' in value
}

/** The first index of the sorted `items` whose element is not below `v` (binary search). */
function lowerBound<T>(items: readonly T[], v: T, compare: (a: T, b: T) => number): number {
  let low = 0
  let high = items.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if (compare(items[mid] as T, v) < 0) low = mid + 1
    else high = mid
  }
  return low
}

/** The aimed member, or the value drawn when there is none. */
function aimed<T>(aim: { value: T } | undefined, drawn: T): T {
  return aim === undefined ? drawn : aim.value
}

/** Whether step `step` of `steps` compares the full contents under `checkEvery`. */
function fullCheck(tuning: RunTuning | undefined, step: number, steps: number): boolean {
  const every = tuning?.checkEvery
  return every !== undefined && ((step + 1) % every === 0 || step === steps - 1)
}

/** Drops the oldest held iterators until at most `max` remain (no cap without `max`). */
function cap<T>(open: T[], max: number | undefined): void {
  if (max === undefined) return
  while (open.length > max) open.shift()
}

/** One step's effect on fail-fast iterators: a structural change, possibly one, or none. */
type Effect = 'structural' | 'maybe' | 'none'

/** Operations that never change a collection, in every model. */
const READS = [
  'has',
  'get',
  'indexOf',
  'peek',
  'peekLast',
  'near',
  'ends',
  'check',
  'hold',
  'advance',
]

/**
 * A step's effect: structural when the reference gained or lost elements, none for reads, and
 * otherwise possibly structural (a change that added or removed nothing).
 */
function effectOf(op: string, changed: boolean, reads: readonly string[]): Effect {
  if (changed) return 'structural'
  return reads.includes(op) ? 'none' : 'maybe'
}

interface HeldIteration<T> {
  readonly ours: Iterator<T> | Cursor<T>
  readonly cursor: boolean
  /** A fixed order to expect (a priority queue's), or `undefined` to read the reference. */
  readonly order: readonly T[] | undefined
  consumed: number
  /** `stale` after a structural change; `maybe` after a change that may or may not be one. */
  state: 'fresh' | 'stale' | 'maybe'
  finished: boolean
}

/**
 * Iterators and cursors held open on a fail-fast collection. One opened before a structural change
 * must throw `ConcurrentModificationError` on its next step; one with no structural change since it
 * opened must return the reference's next element. After a change that adds or removes nothing (a
 * no-op `delete`, `clear` of an empty collection) either outcome is accepted, and a successful step
 * makes it exact again.
 */
class HeldIterations<T> {
  private readonly open: Array<HeldIteration<T>> = []

  constructor(private readonly max: number | undefined) {}

  get active(): boolean {
    return this.max !== undefined
  }

  hold(ours: Iterator<T> | Cursor<T>, cursor: boolean, order?: readonly T[]): void {
    this.open.push({ ours, cursor, order, consumed: 0, state: 'fresh', finished: false })
    cap(this.open, this.max)
  }

  /** Records the effect of the step just taken on every held iteration. */
  changed(effect: Effect): void {
    if (effect === 'none') return
    for (const held of this.open) {
      if (effect === 'structural') held.state = 'stale'
      else if (held.state === 'fresh') held.state = 'maybe'
    }
  }

  /** Steps one held iteration, chosen by `random`, and checks it against `reference`. */
  advance(random: () => number, reference: readonly T[], at: string): void {
    if (this.open.length === 0) return
    const held = pick(random, this.open)
    if (held.finished) {
      isEqual((held.ours as Iterator<T>).next(), { done: true, value: undefined }, at)
      return
    }
    const source = held.order ?? reference
    const more = held.consumed < source.length
    let value: unknown
    let thrown: unknown
    let finished = false
    try {
      if (held.cursor) value = (held.ours as Cursor<T>).next()
      else {
        const result = (held.ours as Iterator<T>).next()
        finished = result.done === true
        value = result.value
      }
    } catch (error) {
      thrown = error
    }
    if (held.state !== 'fresh' && thrown instanceof ConcurrentModificationError) {
      this.open.splice(this.open.indexOf(held), 1)
      return
    }
    if (held.state === 'stale') {
      expect(held.state, `${at}: a held iterator opened before a structural change`).not.toBe(
        'stale',
      )
    }
    held.state = 'fresh'
    if (!more) {
      if (held.cursor) expect(thrown, at).toBeInstanceOf(NoSuchElementError)
      else {
        if (thrown !== undefined) throw thrown
        is(finished, true, `${at}: a held iterator past the end`)
        held.finished = true
      }
      return
    }
    if (thrown !== undefined) throw thrown
    is(finished, false, `${at}: a held iterator ended early`)
    is(value, source[held.consumed], `${at}: a held iterator at index ${held.consumed}`)
    held.consumed++
  }
}

export interface ReferenceModelOptions {
  seed: number
  steps: number
  /** Builds an empty collection of small integers. */
  make: () => Collection<number>
  /** `set` compares with a native Set (live: with its iterators too); `array` with an array. */
  model: 'set' | 'array'
  /** How many distinct values elements are drawn from (the integers from 0); default 10. */
  values?: number
  /**
   * Adds operations that add 40 values, or delete about three quarters of the members, at once
   * (set model only), so the collection crosses its growth and shrink thresholds while iterators
   * and cursors are open.
   */
  bulk?: boolean
  tuning?: RunTuning
}

interface OpenCursor {
  ours: Cursor<number>
  theirs: Iterator<number>
  looked: IteratorResult<number> | undefined
  last: { value: number } | undefined
}

export function runReferenceModel(options: ReferenceModelOptions): void {
  const random = seeded(options.seed)
  const tuning = options.tuning
  const c = options.make()
  const set = new Set<number>()
  const array: number[] = []
  const live = options.model === 'set'
  const iterators: Array<{ ours: Iterator<number>; theirs: Iterator<number> }> = []
  const cursors: OpenCursor[] = []
  const held = new HeldIterations<number>(live ? undefined : tuning?.maxOpen)
  const ops = live
    ? [
        'add',
        'add',
        'delete',
        'has',
        'check',
        'clear',
        'iter',
        'step',
        'step',
        'cursor',
        'look',
        'next',
        'remove',
      ]
    : ['add', 'add', 'delete', 'has', 'check', 'clear']
  if (live && options.bulk === true) ops.push('fill', 'fill', 'drain')
  if (held.active) ops.push('hold', 'advance', 'advance')
  const phases = new Phases(tuning?.marks, {
    grow: ['add'],
    shrink: ['delete', 'remove'],
    wipe: ['clear', 'drain'],
    fill: ['fill'],
  })
  const top = (tuning?.values ?? options.values ?? 10) - 1
  const size = () => (live ? set.size : array.length)
  const label = `reference model seed ${options.seed}`

  for (let step = 0; step < options.steps; step++) {
    const op = phases.choose(random, ops)
    const at = `${label} step ${step} op ${op}`
    const drawn = integer(random, 0, top)
    const v = aimed(
      phases.aim(random, op, () => (live ? [...set] : array)),
      drawn,
    )
    const before = size()
    switch (op) {
      case 'add':
        c.add(v)
        if (live) set.add(v)
        else array.push(v)
        break
      case 'fill':
        for (let i = 0; i < 40; i++) {
          const x = integer(random, 0, top)
          c.add(x)
          set.add(x)
        }
        break
      case 'drain':
        for (const x of [...set]) {
          if (random() < 0.75) is(c.delete(x), set.delete(x), at)
        }
        break
      case 'delete': {
        let expected: boolean
        if (live) expected = set.delete(v)
        else {
          const index = array.indexOf(v)
          expected = index >= 0
          if (expected) array.splice(index, 1)
        }
        is(c.delete(v), expected, at)
        break
      }
      case 'has':
        is(c.has(v), live ? set.has(v) : array.includes(v), at)
        break
      case 'clear':
        c.clear()
        set.clear()
        array.length = 0
        break
      case 'check':
        if (tuning?.checkEvery !== undefined) break
        isEqual(c.toArray(), live ? [...set] : array, at)
        is(c.size, live ? set.size : array.length, at)
        break
      case 'iter':
        iterators.push({ ours: c[Symbol.iterator](), theirs: set.values() })
        cap(iterators, tuning?.maxOpen)
        break
      case 'step': {
        if (iterators.length === 0) break
        const it = pick(random, iterators)
        isEqual(it.ours.next(), it.theirs.next(), at)
        break
      }
      case 'cursor':
        cursors.push({ ours: c.cursor(), theirs: set.values(), looked: undefined, last: undefined })
        cap(cursors, tuning?.maxOpen)
        break
      case 'look': {
        if (cursors.length === 0) break
        const cur = pick(random, cursors)
        if (cur.looked === undefined) cur.looked = cur.theirs.next()
        is(cur.ours.hasNext(), cur.looked.done !== true, at)
        break
      }
      case 'next': {
        if (cursors.length === 0) break
        const cur = pick(random, cursors)
        if (cur.looked === undefined) cur.looked = cur.theirs.next()
        if (cur.looked.done === true) {
          expect(() => cur.ours.next(), at).toThrow(NoSuchElementError)
        } else {
          const value = cur.looked.value
          is(cur.ours.next(), value, at)
          cur.looked = undefined
          cur.last = { value }
        }
        break
      }
      case 'remove': {
        if (cursors.length === 0) break
        const cur = pick(random, cursors)
        if (cur.last === undefined) break
        cur.ours.remove()
        set.delete(cur.last.value)
        cur.last = undefined
        break
      }
      case 'hold': {
        const cursor = random() < 0.5
        held.hold(cursor ? c.cursor() : c[Symbol.iterator](), cursor)
        break
      }
      case 'advance':
        held.advance(random, array, at)
        break
    }
    if (held.active) held.changed(effectOf(op, size() !== before, READS))

    is(c.size, size(), at)
    if (fullCheck(tuning, step, options.steps)) {
      expectSameSequence(c.toArray(), live ? [...set] : array, at)
    }
    phases.after(size())
  }
  expect(c.toArray(), `${label} final`).toEqual(live ? [...set] : array)
  phases.finish(label)
}

/**
 * Seeded reference model for lists: applies the same random positional operations to a list and
 * to a native array and compares every result. `make` builds an empty list (an `ArrayList` or a
 * view over one).
 */
export function runListReferenceModel(options: {
  seed: number
  steps: number
  make: () => List<number>
  tuning?: RunTuning
}): void {
  const random = seeded(options.seed)
  const tuning = options.tuning
  const list = options.make()
  const array: number[] = []
  const held = new HeldIterations<number>(tuning?.maxOpen)
  const ops = [
    'add',
    'addFirst',
    'insert',
    'insertAll',
    'set',
    'removeAt',
    'delete',
    'removeLast',
    'get',
    'indexOf',
    'removeIf',
    'subClear',
    'sort',
    'check',
  ]
  if (held.active) ops.push('hold', 'advance', 'advance')
  const phases = new Phases(tuning?.marks, {
    grow: ['add', 'addFirst', 'insert', 'insertAll'],
    shrink: ['removeAt', 'delete', 'removeLast', 'removeIf'],
    wipe: ['subClear'],
  })
  const top = (tuning?.values ?? 10) - 1
  const label = `list reference model seed ${options.seed}`
  for (let step = 0; step < options.steps; step++) {
    const op = phases.choose(random, ops)
    const at = `${label} step ${step} op ${op}`
    const v = integer(random, 0, top)
    const n = array.length
    switch (op) {
      case 'add':
        list.add(v)
        array.push(v)
        break
      case 'addFirst':
        list.addFirst(v)
        array.unshift(v)
        break
      case 'insert': {
        const i = integer(random, 0, n)
        list.insert(i, v)
        array.splice(i, 0, v)
        break
      }
      case 'insertAll': {
        const i = integer(random, 0, n)
        const items = [v, v + 1]
        is(list.insertAll(i, items), true, at)
        array.splice(i, 0, ...items)
        break
      }
      case 'set':
        if (n === 0) break
        {
          const i = integer(random, 0, n - 1)
          is(list.set(i, v), array[i], at)
          array[i] = v
        }
        break
      case 'removeAt':
        if (n === 0) break
        {
          const i = integer(random, 0, n - 1)
          is(list.removeAt(i), array.splice(i, 1)[0], at)
        }
        break
      case 'delete': {
        const i = array.indexOf(v)
        is(list.delete(v), i >= 0, at)
        if (i >= 0) array.splice(i, 1)
        break
      }
      case 'removeLast':
        if (n === 0) expect(() => list.removeLast(), at).toThrow(NoSuchElementError)
        else is(list.removeLast(), array.pop(), at)
        break
      case 'get':
        if (n > 0) {
          const i = integer(random, 0, n - 1)
          is(list.get(i), array[i], at)
        }
        break
      case 'indexOf':
        is(list.indexOf(v), array.indexOf(v), at)
        is(list.lastIndexOf(v), array.lastIndexOf(v), at)
        break
      case 'removeIf': {
        const keep = array.filter((e) => e !== v)
        is(
          list.removeIf((e) => e === v),
          keep.length !== n,
          at,
        )
        array.length = 0
        for (let i = 0; i < keep.length; i++) array.push(keep[i] as number)
        break
      }
      case 'subClear': {
        const from = integer(random, 0, n)
        const to = integer(random, from, n)
        list.subList(from, to).clear()
        array.splice(from, to - from)
        break
      }
      case 'sort':
        list.sort()
        array.sort((a, b) => a - b)
        break
      case 'check':
        if (tuning?.checkEvery !== undefined) break
        isEqual(list.toArray(), array, at)
        is(list.size, array.length, at)
        break
      case 'hold': {
        const cursor = random() < 0.5
        held.hold(cursor ? list.cursor() : list[Symbol.iterator](), cursor)
        break
      }
      case 'advance':
        held.advance(random, array, at)
        break
    }
    // `set` replaces in place and `sort` always counts as structural.
    if (held.active) {
      held.changed(
        op === 'sort' ? 'structural' : effectOf(op, array.length !== n, [...READS, 'set']),
      )
    }
    is(list.size, array.length, at)
    if (fullCheck(tuning, step, options.steps)) expectSameSequence(list.toArray(), array, at)
    phases.after(array.length)
  }
  expect(list.toArray(), `${label} final`).toEqual(array)
  phases.finish(label)
}

/**
 * Seeded reference model for deques: applies the same random end operations to a deque and to a
 * native array (`push`/`unshift`/`shift`/`pop`) and compares every result, `size` included after
 * every step. `make` builds an empty deque (or a view over one); `values` is the pool elements are
 * drawn from (default the integers 0–9, or `tuning.values` of them).
 */
export function runDequeReferenceModel(options: {
  seed: number
  steps: number
  make: () => Deque<number | null | undefined>
  values?: ReadonlyArray<number | null | undefined>
  tuning?: RunTuning
}): void {
  const random = seeded(options.seed)
  const tuning = options.tuning
  const deque = options.make()
  const array: Array<number | null | undefined> = []
  const held = new HeldIterations<number | null | undefined>(tuning?.maxOpen)
  const ops = [
    'add',
    'add',
    'addFirst',
    'push',
    'poll',
    'pop',
    'peek',
    'peekLast',
    'delete',
    'has',
    'removeIf',
    'check',
  ]
  if (held.active) ops.push('hold', 'advance', 'advance')
  const phases = new Phases(tuning?.marks, {
    grow: ['add', 'addFirst', 'push'],
    shrink: ['poll', 'pop', 'delete', 'removeIf'],
    wipe: [],
  })
  const top = (tuning?.values ?? 10) - 1
  const label = `deque reference model seed ${options.seed}`
  for (let step = 0; step < options.steps; step++) {
    const op = phases.choose(random, ops)
    const at = `${label} step ${step} op ${op}`
    const v = options.values ? pick(random, options.values) : integer(random, 0, top)
    const n = array.length
    switch (op) {
      case 'add':
      case 'push':
        deque[op](v)
        array.push(v)
        break
      case 'addFirst':
        deque.addFirst(v)
        array.unshift(v)
        break
      case 'poll':
        is(deque.poll(), array.shift(), at)
        break
      case 'pop':
        is(deque.pop(), array.pop(), at)
        break
      case 'peek':
        is(deque.peek(), array[0], at)
        break
      case 'peekLast':
        is(deque.peekLast(), array[array.length - 1], at)
        break
      case 'delete': {
        const i = array.indexOf(v)
        is(deque.delete(v), i >= 0, at)
        if (i >= 0) array.splice(i, 1)
        break
      }
      case 'has':
        is(deque.has(v), array.includes(v), at)
        break
      case 'removeIf': {
        const keep = array.filter((e) => e !== v)
        is(
          deque.removeIf((e) => e === v),
          keep.length !== array.length,
          at,
        )
        array.length = 0
        for (let i = 0; i < keep.length; i++) array.push(keep[i])
        break
      }
      case 'check':
        if (tuning?.checkEvery !== undefined) break
        isEqual([...deque], array, at)
        break
      case 'hold': {
        const cursor = random() < 0.5
        held.hold(cursor ? deque.cursor() : deque[Symbol.iterator](), cursor)
        break
      }
      case 'advance':
        held.advance(random, array, at)
        break
    }
    if (held.active) held.changed(effectOf(op, array.length !== n, READS))
    is(deque.size, array.length, at)
    if (fullCheck(tuning, step, options.steps)) expectSameSequence([...deque], array, at)
    phases.after(array.length)
  }
  expect([...deque], `${label} final`).toEqual(array)
  phases.finish(label)
}

/** A queue of numbers ordered by a comparator, as the priority-queue model needs it. */
interface NumberQueue {
  readonly size: number
  add(element: number): unknown
  poll(): number | undefined
  peek(): number | undefined
  delete(element: number): boolean
  has(element: number): boolean
  clear(): void
  cursor(): Cursor<number>
  [Symbol.iterator](): Iterator<number>
}

/** Sorts a copy of `values` and returns it, to compare contents whatever the iteration order. */
function sortedCopy(values: Iterable<number>): number[] {
  return [...values].sort((a, b) => a - b)
}

/**
 * Seeded reference model for priority queues: applies the same random operations to a queue and
 * to a native array kept sorted by `compare`, and compares every result. `poll` and `peek` must
 * return the model's first element; `size` is compared after every step; iteration is compared as
 * a multiset, since its order is unspecified. `make` builds an empty queue ordered by `compare`.
 */
export function runPriorityQueueReferenceModel(options: {
  seed: number
  steps: number
  make: () => NumberQueue
  compare: (a: number, b: number) => number
  tuning?: RunTuning
}): void {
  const random = seeded(options.seed)
  const tuning = options.tuning
  const queue = options.make()
  const array: number[] = []
  const held = new HeldIterations<number>(tuning?.maxOpen)
  const insert = (v: number) => {
    let i = 0
    while (i < array.length && options.compare(array[i] as number, v) <= 0) i++
    array.splice(i, 0, v)
  }
  const removeOne = (v: number): boolean => {
    const i = array.indexOf(v)
    if (i >= 0) array.splice(i, 1)
    return i >= 0
  }
  const ops = ['add', 'add', 'add', 'poll', 'peek', 'delete', 'has', 'cursor', 'clear', 'check']
  if (held.active) ops.push('hold', 'advance', 'advance')
  const phases = new Phases(tuning?.marks, {
    grow: ['add'],
    shrink: ['poll', 'delete'],
    wipe: ['cursor', 'clear'],
  })
  const top = tuning?.values === undefined ? 20 : tuning.values - 1
  const label = `priority queue reference model seed ${options.seed}`
  for (let step = 0; step < options.steps; step++) {
    const op = phases.choose(random, ops)
    const at = `${label} step ${step} op ${op}`
    const v = integer(random, 0, top)
    const n = array.length
    switch (op) {
      case 'add':
        queue.add(v)
        insert(v)
        break
      case 'poll':
        is(queue.poll(), array.shift(), at)
        break
      case 'peek':
        is(queue.peek(), array[0], at)
        break
      case 'delete':
        is(queue.delete(v), removeOne(v), at)
        break
      case 'has':
        is(queue.has(v), array.includes(v), at)
        break
      case 'cursor': {
        const before = sortedCopy(array)
        const cursor = queue.cursor()
        const seen: number[] = []
        while (cursor.hasNext()) {
          const value = cursor.next()
          seen.push(value)
          if (value % 3 === v % 3 && integer(random, 0, 1) === 0) {
            cursor.remove()
            removeOne(value)
          }
        }
        isEqual(sortedCopy(seen), before, at)
        break
      }
      case 'clear':
        if (integer(random, 0, 3) === 0) {
          queue.clear()
          array.length = 0
        }
        break
      case 'check':
        if (tuning?.checkEvery !== undefined) break
        isEqual(sortedCopy(queue), sortedCopy(array), at)
        break
      case 'hold': {
        // Iteration order is unspecified: hold the order a fresh iteration gives, as a multiset of
        // the reference, and expect the held iteration to follow it until a structural change.
        const order = [...queue]
        expectSameSequence(sortedCopy(order), sortedCopy(array), at)
        const cursor = random() < 0.5
        held.hold(cursor ? queue.cursor() : queue[Symbol.iterator](), cursor, order)
        break
      }
      case 'advance':
        held.advance(random, array, at)
        break
    }
    if (held.active) held.changed(effectOf(op, array.length !== n, READS))
    is(queue.size, array.length, at)
    if (fullCheck(tuning, step, options.steps)) {
      expectSameSequence(sortedCopy(queue), sortedCopy(array), at)
    }
    phases.after(array.length)
  }
  const drained: number[] = []
  for (let n = queue.poll(); n !== undefined; n = queue.poll()) drained.push(n)
  expect(drained, `${label} final`).toEqual(array)
  phases.finish(label)
}

/** What the map reference model drives: the native `Map` methods plus the map helpers it checks. */
interface ModelledMap {
  readonly size: number
  get(key: number): unknown
  has(key: number): boolean
  set(key: number, value: number): unknown
  delete(key: number): boolean
  clear(): void
  put(key: number, value: number): unknown
  remove(key: number): unknown
  replace(key: number, value: number): unknown
  getOrInsert(key: number, value: number): unknown
  getOrInsertComputed(key: number, fn: (key: number) => number): unknown
  compute(key: number, fn: (value: number | undefined) => number | undefined): unknown
  merge(key: number, value: number, fn: (old: number, value: number) => number | undefined): unknown
  entries(): Iterator<[number, number]>
  keys(): Iterator<number>
  values(): Iterator<number>
  [Symbol.iterator](): Iterator<[number, number]>
}

type NativeUpsert = Map<number, number> & {
  getOrInsert?: (key: number, value: number) => number
  getOrInsertComputed?: (key: number, fn: (key: number) => number) => number
}

/** `Map.prototype.getOrInsert`, by hand where the runtime lacks it. */
function nativeGetOrInsert(map: NativeUpsert, key: number, value: number): number {
  if (typeof map.getOrInsert === 'function') return map.getOrInsert(key, value)
  if (map.has(key)) return map.get(key) as number
  map.set(key, value)
  return value
}

/** `Map.prototype.getOrInsertComputed`, by hand where the runtime lacks it. */
function nativeGetOrInsertComputed(
  map: NativeUpsert,
  key: number,
  fn: (key: number) => number,
): number {
  if (typeof map.getOrInsertComputed === 'function') return map.getOrInsertComputed(key, fn)
  if (map.has(key)) return map.get(key) as number
  const value = fn(key)
  map.set(key, value)
  return value
}

/**
 * Seeded reference model for maps with small integer keys: applies the same random operations to
 * a map and to a native `Map` and compares every result, the size, the order, and open iterators
 * of each kind interleaved with the changes. With `bulk`, it also fills 40 keys or deletes about
 * three quarters at once, so the map crosses its growth and shrink thresholds while iterators are
 * open.
 */
export function runMapReferenceModel(options: {
  seed: number
  steps: number
  make: () => ModelledMap
  keys?: number
  bulk?: boolean
  tuning?: RunTuning
}): void {
  const random = seeded(options.seed)
  const tuning = options.tuning
  const map = options.make()
  const model: NativeUpsert = new Map<number, number>()
  const iterators: Array<{ ours: Iterator<unknown>; theirs: Iterator<unknown> }> = []
  const ops = [
    'set',
    'set',
    'put',
    'delete',
    'remove',
    'get',
    'has',
    'replace',
    'getOrInsert',
    'getOrInsertComputed',
    'compute',
    'merge',
    'check',
    'clear',
    'iter',
    'step',
    'step',
  ]
  if (options.bulk === true) ops.push('fill', 'fill', 'drain')
  const phases = new Phases(tuning?.marks, {
    grow: ['set', 'put', 'getOrInsert', 'getOrInsertComputed'],
    shrink: ['delete', 'remove'],
    wipe: ['clear', 'drain'],
    fill: ['fill'],
  })
  const top = (tuning?.values ?? options.keys ?? 10) - 1
  const label = `map reference model seed ${options.seed}`
  for (let step = 0; step < options.steps; step++) {
    const op = phases.choose(random, ops)
    const at = `${label} step ${step} op ${op}`
    const drawn = integer(random, 0, top)
    const k = aimed(
      phases.aim(random, op, () => [...model.keys()]),
      drawn,
    )
    const v = integer(random, 0, 99)
    switch (op) {
      case 'set':
        map.set(k, v)
        model.set(k, v)
        break
      case 'put':
        is(map.put(k, v), model.get(k), at)
        model.set(k, v)
        break
      case 'delete':
        is(map.delete(k), model.delete(k), at)
        break
      case 'remove': {
        const old = model.get(k)
        model.delete(k)
        is(map.remove(k), old, at)
        break
      }
      case 'get':
        is(map.get(k), model.get(k), at)
        break
      case 'has':
        is(map.has(k), model.has(k), at)
        break
      case 'replace': {
        const old = model.get(k)
        if (model.has(k)) model.set(k, v)
        is(map.replace(k, v), old, at)
        break
      }
      case 'getOrInsert':
        is(map.getOrInsert(k, v), nativeGetOrInsert(model, k, v), at)
        break
      case 'getOrInsertComputed':
        is(
          map.getOrInsertComputed(k, (key) => key + v),
          nativeGetOrInsertComputed(model, k, (key) => key + v),
          at,
        )
        break
      case 'compute': {
        // Odd values are kept and incremented; even ones are removed.
        const fn = (value: number | undefined) =>
          value === undefined ? v : value % 2 === 0 ? undefined : value + 2
        const old = model.get(k)
        const result = fn(old)
        if (result === undefined) model.delete(k)
        else model.set(k, result)
        is(map.compute(k, fn), result, at)
        break
      }
      case 'merge': {
        const fn = (old: number, value: number) => (old > 50 ? undefined : old + value)
        let expected: number | undefined = v
        if (model.has(k)) {
          expected = fn(model.get(k) as number, v)
          if (expected === undefined) model.delete(k)
          else model.set(k, expected)
        } else {
          model.set(k, v)
        }
        is(map.merge(k, v, fn), expected, at)
        break
      }
      case 'fill':
        for (let i = 0; i < 40; i++) {
          const key = integer(random, 0, top)
          map.set(key, i)
          model.set(key, i)
        }
        break
      case 'drain':
        for (const key of [...model.keys()]) {
          if (random() < 0.75) is(map.delete(key), model.delete(key), at)
        }
        break
      case 'clear':
        map.clear()
        model.clear()
        break
      case 'check':
        if (tuning?.checkEvery !== undefined) break
        isEqual([...(map as Iterable<[number, number]>)], [...model], at)
        is(map.size, model.size, at)
        break
      case 'iter': {
        const kind = integer(random, 0, 2)
        iterators.push(
          kind === 0
            ? { ours: map.keys(), theirs: model.keys() }
            : kind === 1
              ? { ours: map.values(), theirs: model.values() }
              : { ours: map.entries(), theirs: model.entries() },
        )
        cap(iterators, tuning?.maxOpen)
        break
      }
      case 'step': {
        if (iterators.length === 0) break
        const it = pick(random, iterators)
        isEqual(it.ours.next(), it.theirs.next(), at)
        break
      }
    }
    is(map.size, model.size, at)
    if (fullCheck(tuning, step, options.steps)) {
      expectSameSequence([...(map as Iterable<[number, number]>)], [...model], at)
    }
    phases.after(model.size)
  }
  expect([...(map as Iterable<[number, number]>)], `${label} final`).toEqual([...model])
  phases.finish(label)
}

/**
 * Seeded reference model for sorted sets: applies the same random operations to a sorted set and
 * to a native array kept sorted by `compare` without duplicates, and compares every result —
 * membership, the ends, polls, the nearest-match queries, cursors and random range views (with
 * random inclusive flags, read and changed through the view). `make` builds an empty set ordered
 * by `compare`; `value` draws a value.
 */
export function runSortedSetReferenceModel<T>(options: {
  seed: number
  steps: number
  make: () => SortedSet<T>
  compare: (a: T, b: T) => number
  value: (random: () => number) => T
  tuning?: RunTuning
}): void {
  const random = seeded(options.seed)
  const tuning = options.tuning
  const { compare } = options
  const set = options.make()
  let array: T[] = []
  const held = new HeldIterations<T>(tuning?.maxOpen)
  /** Set when a step adds or removes a member of the reference. */
  let touched = false
  const indexOf = (v: T): number => {
    const i = lowerBound(array, v, compare)
    return i < array.length && compare(array[i] as T, v) === 0 ? i : -1
  }
  const insert = (v: T): boolean => {
    if (indexOf(v) >= 0) return false
    array.splice(lowerBound(array, v, compare), 0, v)
    touched = true
    return true
  }
  const remove = (v: T): boolean => {
    const i = indexOf(v)
    if (i >= 0) {
      array.splice(i, 1)
      touched = true
    }
    return i >= 0
  }
  const last = (items: T[]): T | undefined => items[items.length - 1]
  const ops = [
    'add',
    'add',
    'add',
    'delete',
    'has',
    'near',
    'ends',
    'poll',
    'cursor',
    'range',
    'range',
    'check',
    'clear',
  ]
  if (held.active) ops.push('hold', 'advance', 'advance')
  const phases = new Phases(tuning?.marks, {
    grow: ['add'],
    shrink: ['delete', 'poll'],
    wipe: ['cursor', 'clear'],
  })
  const label = `sorted set reference model seed ${options.seed}`
  for (let step = 0; step < options.steps; step++) {
    const op = phases.choose(random, ops)
    const at = `${label} step ${step} op ${op}`
    const drawn = options.value(random)
    const v = aimed(
      phases.aim(random, op, () => array),
      drawn,
    )
    touched = false
    switch (op) {
      case 'add':
        set.add(v)
        insert(v)
        break
      case 'delete':
        is(set.delete(v), remove(v), at)
        break
      case 'has':
        is(set.has(v), indexOf(v) >= 0, at)
        break
      case 'near':
        is(set.lower(v), last(array.filter((x) => compare(x, v) < 0)), at)
        is(set.floor(v), last(array.filter((x) => compare(x, v) <= 0)), at)
        is(
          set.ceiling(v),
          array.find((x) => compare(x, v) >= 0),
          at,
        )
        is(
          set.higher(v),
          array.find((x) => compare(x, v) > 0),
          at,
        )
        break
      case 'ends':
        if (array.length === 0) {
          expect(() => set.getFirst(), at).toThrow(NoSuchElementError)
        } else {
          is(set.getFirst(), array[0], at)
          is(set.getLast(), last(array), at)
        }
        break
      case 'poll':
        if (array.length > 0) touched = true
        if (random() < 0.5) is(set.pollFirst(), array.shift(), at)
        else is(set.pollLast(), array.pop(), at)
        break
      case 'cursor': {
        const descending = random() < 0.5
        const cursor = descending ? set.reversed().cursor() : set.cursor()
        const seen: T[] = []
        while (cursor.hasNext()) {
          const x = cursor.next()
          seen.push(x)
          if (random() < 0.2) {
            cursor.remove()
            remove(x)
          }
        }
        const expected = seen.slice()
        isEqual(
          seen,
          descending ? expected.sort((a, b) => compare(b, a)) : expected.sort(compare),
          at,
        )
        break
      }
      case 'range': {
        let from = v
        let to = options.value(random)
        if (compare(from, to) > 0) {
          const t = from
          from = to
          to = t
        }
        const fromInclusive = random() < 0.5
        const toInclusive = random() < 0.5
        const inRange = (x: T): boolean => {
          const a = compare(x, from)
          const b = compare(x, to)
          return (a > 0 || (a === 0 && fromInclusive)) && (b < 0 || (b === 0 && toInclusive))
        }
        const kind = integer(random, 0, 2)
        const view =
          kind === 0
            ? set.subSet(from, to, { fromInclusive, toInclusive })
            : kind === 1
              ? set.headSet(to, { inclusive: toInclusive })
              : set.tailSet(from, { inclusive: fromInclusive })
        const check =
          kind === 0
            ? inRange
            : kind === 1
              ? (x: T) => {
                  const b = compare(x, to)
                  return b < 0 || (b === 0 && toInclusive)
                }
              : (x: T) => {
                  const a = compare(x, from)
                  return a > 0 || (a === 0 && fromInclusive)
                }
        const expected = array.filter(check)
        isEqual(view.toArray(), expected, at)
        is(view.size, expected.length, at)
        isEqual(view.reversed().toArray(), expected.slice().reverse(), at)
        const probe = options.value(random)
        is(view.floor(probe), last(expected.filter((x) => compare(x, probe) <= 0)), at)
        is(
          view.higher(probe),
          expected.find((x) => compare(x, probe) > 0),
          at,
        )
        if (check(probe)) {
          view.add(probe)
          insert(probe)
        } else {
          is(view.has(probe), false, at)
        }
        if (random() < 0.3) {
          const polled = view.pollFirst()
          is(polled, array.filter(check)[0], at)
          if (polled !== undefined) remove(polled)
        }
        break
      }
      case 'clear':
        if (integer(random, 0, 5) === 0) {
          if (array.length > 0) touched = true
          set.clear()
          array = []
        }
        break
      case 'check':
        if (tuning?.checkEvery !== undefined) break
        isEqual(set.toArray(), array, at)
        break
      case 'hold': {
        const cursor = random() < 0.5
        held.hold(cursor ? set.cursor() : set[Symbol.iterator](), cursor)
        break
      }
      case 'advance':
        held.advance(random, array, at)
        break
    }
    if (held.active) held.changed(effectOf(op, touched, READS))
    is(set.size, array.length, at)
    if (fullCheck(tuning, step, options.steps)) expectSameSequence(set.toArray(), array, at)
    phases.after(array.length)
  }
  expect(set.toArray(), `${label} final`).toEqual(array)
  phases.finish(label)
}

/** A member of the sequenced-set model, with its order stamp. */
interface SequencedRecord {
  readonly value: unknown
  readonly seq: number
}

/** An open iteration of the sequenced-set model, written from the rules, not the links. */
interface ModelIteration {
  readonly fromBack: boolean
  boundary: number
  done: boolean
}

interface SequencedCursor {
  ours: Cursor<unknown>
  model: ModelIteration
  looked: { value: unknown } | 'done' | undefined
  last: { value: unknown } | undefined
}

/**
 * Seeded reference model for an insertion-ordered sequenced set with live iteration (a linked hash
 * set): applies the same random operations — inserts, moves, deletes, end removals, `clear`, and
 * `add`/`addAll`/ends through the reversed view — to the set and to an array of members stamped
 * with order numbers, and compares every result. Open iterators and cursors on the set and on its
 * reversed view are stepped and compared exactly: each returns the first member past the stamp of
 * the member it last returned, in its own direction; `clear` puts it back before the first member;
 * once done it stays done. Values are small integers, `-0` (stored as `0`) and `null`.
 */
export function runSequencedSetReferenceModel(options: {
  seed: number
  steps: number
  /** Builds an empty set. */
  make: () => SequencedSet<unknown>
  /** How many distinct integers values are drawn from (from 0), besides `-0` and `null`. */
  values?: number
  tuning?: RunTuning
}): void {
  const random = seeded(options.seed)
  const tuning = options.tuning
  const set = options.make()
  const view = set.reversed()
  const records: SequencedRecord[] = []
  let low = 0
  let high = 0
  const iterations: Array<{ ours: Iterator<unknown>; model: ModelIteration }> = []
  const cursors: SequencedCursor[] = []
  const top = (tuning?.values ?? options.values ?? 12) - 1
  const ops = [
    'add',
    'add',
    'addFirst',
    'addLast',
    'delete',
    'has',
    'removeFirst',
    'removeLast',
    'ends',
    'clear',
    'viewAdd',
    'viewAddAll',
    'viewEnds',
    'iter',
    'step',
    'step',
    'step',
    'cursor',
    'look',
    'next',
    'next',
    'remove',
  ]
  const draw = (): unknown => {
    const r = random()
    if (r < 0.06) return null
    if (r < 0.12) return -0
    return integer(random, 0, top)
  }
  const norm = (v: unknown): unknown => (v === 0 ? 0 : v)
  const indexOf = (v: unknown): number => records.findIndex((r) => Object.is(r.value, norm(v)))
  const insert = (v: unknown, front: boolean): void => {
    if (front) records.unshift({ value: norm(v), seq: --low })
    else records.push({ value: norm(v), seq: ++high })
  }
  const removeAt = (index: number): unknown =>
    (records.splice(index, 1)[0] as SequencedRecord).value
  /** Inserts an absent value at an end; with `move`, moves a present one there unless it is there. */
  const place = (v: unknown, front: boolean, move: boolean): void => {
    const index = indexOf(v)
    if (index < 0) insert(v, front)
    else if (move && index !== (front ? 0 : records.length - 1)) {
      removeAt(index)
      insert(v, front)
    }
  }
  const advance = (it: ModelIteration): { value: unknown } | 'done' => {
    if (it.done) return 'done'
    let found: SequencedRecord | undefined
    if (it.fromBack) {
      for (let i = records.length - 1; i >= 0 && found === undefined; i--) {
        if ((records[i] as SequencedRecord).seq < it.boundary) found = records[i]
      }
    } else {
      found = records.find((r) => r.seq > it.boundary)
    }
    if (found === undefined) {
      it.done = true
      return 'done'
    }
    it.boundary = found.seq
    return { value: found.value }
  }
  const open = (fromBack: boolean): ModelIteration => ({
    fromBack,
    boundary: fromBack ? high + 1 : low - 1,
    done: false,
  })
  const end = (fromBack: boolean, remove: boolean): unknown => {
    if (records.length === 0) return NoSuchElementError
    const index = fromBack ? records.length - 1 : 0
    return remove ? removeAt(index) : (records[index] as SequencedRecord).value
  }
  const expectEnd = (actual: () => unknown, expected: unknown, at: string): void => {
    if (expected === NoSuchElementError) expect(actual, at).toThrow(NoSuchElementError)
    else is(actual(), expected, at)
  }

  const phases = new Phases(tuning?.marks, {
    grow: ['add', 'addFirst', 'addLast', 'viewAdd', 'viewAddAll'],
    shrink: ['delete', 'removeFirst', 'removeLast', 'remove'],
    wipe: ['clear'],
  })
  const label = `sequenced set reference model seed ${options.seed}`
  for (let step = 0; step < options.steps; step++) {
    const op = phases.choose(random, ops)
    const at = `${label} step ${step} op ${op}`
    const drawn = draw()
    const v = aimed(
      phases.aim(random, op, () => records.map((r) => r.value)),
      drawn,
    )
    switch (op) {
      case 'add':
        set.add(v)
        place(v, false, false)
        break
      case 'addFirst':
        set.addFirst(v)
        place(v, true, true)
        break
      case 'addLast':
        set.addLast(v)
        place(v, false, true)
        break
      case 'delete': {
        const index = indexOf(v)
        if (index >= 0) removeAt(index)
        is(set.delete(v), index >= 0, at)
        break
      }
      case 'has':
        is(set.has(v), indexOf(v) >= 0, at)
        break
      case 'removeFirst':
      case 'removeLast': {
        const fromBack = op === 'removeLast'
        expectEnd(() => (fromBack ? set.removeLast() : set.removeFirst()), end(fromBack, true), at)
        break
      }
      case 'ends':
        expectEnd(() => set.getFirst(), end(false, false), at)
        expectEnd(() => set.getLast(), end(true, false), at)
        break
      case 'clear':
        set.clear()
        records.length = 0
        for (const it of iterations)
          if (!it.model.done) Object.assign(it.model, open(it.model.fromBack))
        for (const cur of cursors)
          if (!cur.model.done) Object.assign(cur.model, open(cur.model.fromBack))
        break
      case 'viewAdd':
        is(view.add(v), view, at)
        place(v, true, false)
        break
      case 'viewAddAll': {
        const w = draw()
        const changed = indexOf(v) < 0 || indexOf(w) < 0
        is(view.addAll([v, w]), changed, at)
        place(v, true, false)
        place(w, true, false)
        break
      }
      case 'viewEnds': {
        const which = integer(random, 0, 5)
        if (which === 0) expectEnd(() => view.getFirst(), end(true, false), at)
        else if (which === 1) expectEnd(() => view.getLast(), end(false, false), at)
        else if (which === 2) expectEnd(() => view.removeFirst(), end(true, true), at)
        else if (which === 3) expectEnd(() => view.removeLast(), end(false, true), at)
        else if (which === 4) {
          view.addFirst(v)
          place(v, false, true)
        } else {
          view.addLast(v)
          place(v, true, true)
        }
        break
      }
      case 'iter': {
        const fromBack = random() < 0.5
        iterations.push({
          ours: fromBack ? view[Symbol.iterator]() : set[Symbol.iterator](),
          model: open(fromBack),
        })
        cap(iterations, tuning?.maxOpen)
        break
      }
      case 'step': {
        if (iterations.length === 0) break
        const it = pick(random, iterations)
        const expected = advance(it.model)
        isEqual(
          it.ours.next(),
          expected === 'done' ? { done: true, value: undefined } : { done: false, ...expected },
          at,
        )
        break
      }
      case 'cursor': {
        const fromBack = random() < 0.5
        cursors.push({
          ours: fromBack ? view.cursor() : set.cursor(),
          model: open(fromBack),
          looked: undefined,
          last: undefined,
        })
        cap(cursors, tuning?.maxOpen)
        break
      }
      case 'look': {
        if (cursors.length === 0) break
        const cur = pick(random, cursors)
        if (cur.looked === undefined) cur.looked = advance(cur.model)
        is(cur.ours.hasNext(), cur.looked !== 'done', at)
        break
      }
      case 'next': {
        if (cursors.length === 0) break
        const cur = pick(random, cursors)
        if (cur.looked === undefined) cur.looked = advance(cur.model)
        if (cur.looked === 'done') {
          expect(() => cur.ours.next(), at).toThrow(NoSuchElementError)
        } else {
          is(cur.ours.next(), cur.looked.value, at)
          cur.last = cur.looked
          cur.looked = undefined
        }
        break
      }
      case 'remove': {
        if (cursors.length === 0) break
        const cur = pick(random, cursors)
        if (cur.last === undefined) break
        cur.ours.remove()
        const index = indexOf(cur.last.value)
        if (index >= 0) removeAt(index)
        cur.last = undefined
        break
      }
    }
    is(set.size, records.length, at)
    if (tuning?.checkEvery === undefined) {
      const members = records.map((r) => r.value)
      isEqual(set.toArray(), members, at)
      isEqual(view.toArray(), members.slice().reverse(), at)
    } else if (fullCheck(tuning, step, options.steps)) {
      const members = records.map((r) => r.value)
      expectSameSequence(set.toArray(), members, at)
      expectSameSequence(view.toArray(), members.reverse(), at)
    }
    phases.after(records.length)
  }
  phases.finish(label)
}

/**
 * Runs seeded operations on a sorted map and on a native `Map` plus a sorted key array, checking
 * that results, key order and size agree after every step: writes, lookups, the read-modify-write
 * helpers, nearest entries, the ends and polls, range views read and written through (writes
 * outside the range must throw), reversed views, and live entries read after later changes.
 */
export function runSortedMapReferenceModel<K>(options: {
  seed: number
  steps: number
  make: () => SortedMap<K, number>
  compare: (a: K, b: K) => number
  key: (random: () => number) => K
  tuning?: RunTuning
}): void {
  const random = seeded(options.seed)
  const tuning = options.tuning
  const { compare } = options
  const map = options.make()
  const values = new Map<K, number>()
  let keys: K[] = []
  const held = new HeldIterations<K>(tuning?.maxOpen)
  /** Set when a step adds or removes a key of the reference. */
  let touched = false
  /** The stored key equal to `k` under `compare`, or `undefined`. */
  const stored = (k: K): K | undefined => {
    const i = lowerBound(keys, k, compare)
    return i < keys.length && compare(keys[i] as K, k) === 0 ? keys[i] : undefined
  }
  const modelGet = (k: K): number | undefined => {
    const s = stored(k)
    return s === undefined ? undefined : values.get(s)
  }
  const modelSet = (k: K, v: number): number | undefined => {
    const s = stored(k)
    if (s !== undefined) {
      const old = values.get(s)
      values.set(s, v)
      return old
    }
    keys.splice(lowerBound(keys, k, compare), 0, k)
    values.set(k, v)
    touched = true
    return undefined
  }
  const modelDelete = (k: K): number | undefined => {
    const s = stored(k)
    if (s === undefined) return undefined
    const old = values.get(s)
    keys.splice(keys.indexOf(s), 1)
    values.delete(s)
    touched = true
    return old
  }
  const pairOf = (k: K | undefined): [K, number] | undefined =>
    k === undefined ? undefined : [k, values.get(k) as number]
  const pairOfEntry = (e: MapEntry<K, number> | undefined): [K, number] | undefined =>
    e === undefined ? undefined : [e.key, e.value]
  const last = (items: K[]): K | undefined => items[items.length - 1]
  const watched: Array<{ entry: MapEntry<K, number>; key: K; value: number }> = []
  const ops = [
    'set',
    'set',
    'put',
    'delete',
    'remove',
    'get',
    'replace',
    'getOrInsert',
    'getOrInsertComputed',
    'compute',
    'merge',
    'near',
    'ends',
    'poll',
    'range',
    'range',
    'reversed',
    'entries',
    'clear',
  ]
  if (held.active) ops.push('hold', 'advance', 'advance')
  const phases = new Phases(tuning?.marks, {
    grow: ['set', 'put', 'getOrInsert', 'getOrInsertComputed', 'merge'],
    shrink: ['delete', 'remove', 'poll'],
    wipe: ['clear'],
  })
  const label = `sorted map reference model seed ${options.seed}`
  let next = 0
  for (let step = 0; step < options.steps; step++) {
    const op = phases.choose(random, ops)
    const at = `${label} step ${step} op ${op}`
    const drawn = options.key(random)
    const k = aimed(
      phases.aim(random, op, () => keys),
      drawn,
    )
    const v = next++
    touched = false
    switch (op) {
      case 'set':
        is(map.set(k, v), map, at)
        modelSet(k, v)
        break
      case 'put':
        is(map.put(k, v), modelSet(k, v), at)
        break
      case 'delete':
        is(map.delete(k), modelDelete(k) !== undefined, at)
        break
      case 'remove':
        is(map.remove(k), modelDelete(k), at)
        break
      case 'get':
        is(map.get(k), modelGet(k), at)
        is(map.has(k), stored(k) !== undefined, at)
        break
      case 'replace': {
        const old = modelGet(k)
        is(map.replace(k, v), old, at)
        if (old !== undefined) modelSet(k, v)
        break
      }
      case 'getOrInsert': {
        const old = modelGet(k)
        is(map.getOrInsert(k, v), old === undefined ? v : old, at)
        if (old === undefined) modelSet(k, v)
        break
      }
      case 'getOrInsertComputed': {
        const old = modelGet(k)
        is(
          map.getOrInsertComputed(k, () => v),
          old === undefined ? v : old,
          at,
        )
        if (old === undefined) modelSet(k, v)
        break
      }
      case 'compute': {
        const old = modelGet(k)
        const remove = random() < 0.3
        const result = map.compute(k, (current) => {
          is(current, old, at)
          return remove ? undefined : v
        })
        is(result, remove ? undefined : v, at)
        if (remove) modelDelete(k)
        else modelSet(k, v)
        break
      }
      case 'merge': {
        const old = modelGet(k)
        const merged = map.merge(k, v, (a, b) => a + b)
        const expected = old === undefined ? v : old + v
        is(merged, expected, at)
        modelSet(k, expected)
        break
      }
      case 'near':
        isEqual(
          pairOfEntry(map.lowerEntry(k)),
          pairOf(last(keys.filter((x) => compare(x, k) < 0))),
          at,
        )
        isEqual(
          pairOfEntry(map.floorEntry(k)),
          pairOf(last(keys.filter((x) => compare(x, k) <= 0))),
          at,
        )
        isEqual(pairOfEntry(map.ceilingEntry(k)), pairOf(keys.find((x) => compare(x, k) >= 0)), at)
        isEqual(pairOfEntry(map.higherEntry(k)), pairOf(keys.find((x) => compare(x, k) > 0)), at)
        break
      case 'ends':
        isEqual(pairOfEntry(map.firstEntry()), pairOf(keys[0]), at)
        isEqual(pairOfEntry(map.lastEntry()), pairOf(last(keys)), at)
        break
      case 'poll': {
        const first = random() < 0.5
        const expected = pairOf(first ? keys[0] : last(keys))
        const polled = first ? map.pollFirstEntry() : map.pollLastEntry()
        isEqual(pairOfEntry(polled), expected, at)
        if (expected !== undefined) modelDelete(expected[0])
        break
      }
      case 'range': {
        let from = k
        let to = options.key(random)
        if (compare(from, to) > 0) {
          const t = from
          from = to
          to = t
        }
        const fromInclusive = random() < 0.5
        const toInclusive = random() < 0.5
        const kind = integer(random, 0, 2)
        const view =
          kind === 0
            ? map.subMap(from, to, { fromInclusive, toInclusive })
            : kind === 1
              ? map.headMap(to, { inclusive: toInclusive })
              : map.tailMap(from, { inclusive: fromInclusive })
        const aboveFrom = (x: K) => {
          const a = compare(x, from)
          return a > 0 || (a === 0 && fromInclusive)
        }
        const belowTo = (x: K) => {
          const b = compare(x, to)
          return b < 0 || (b === 0 && toInclusive)
        }
        const check =
          kind === 0 ? (x: K) => aboveFrom(x) && belowTo(x) : kind === 1 ? belowTo : aboveFrom
        const expected = keys.filter(check)
        isEqual([...view.keys()], expected, at)
        is(view.size, expected.length, at)
        isEqual([...view.reversed().keys()], expected.slice().reverse(), at)
        const probe = options.key(random)
        isEqual(
          pairOfEntry(view.floorEntry(probe)),
          pairOf(last(expected.filter((x) => compare(x, probe) <= 0))),
          at,
        )
        isEqual(
          pairOfEntry(view.higherEntry(probe)),
          pairOf(expected.find((x) => compare(x, probe) > 0)),
          at,
        )
        if (check(probe)) {
          view.set(probe, v)
          modelSet(probe, v)
        } else {
          expect(view.get(probe), at).toBeUndefined()
          is(view.has(probe), false, at)
          expect(() => view.set(probe, v), at).toThrow(IllegalArgumentError)
        }
        if (random() < 0.3) {
          const polled = view.pollFirstEntry()
          isEqual(pairOfEntry(polled), pairOf(keys.filter(check)[0]), at)
          if (polled !== undefined) modelDelete(polled.key)
        }
        break
      }
      case 'reversed': {
        const reversed = map.reversed()
        isEqual([...reversed.keys()], keys.slice().reverse(), at)
        isEqual(
          pairOfEntry(reversed.floorEntry(k)),
          pairOf(keys.find((x) => compare(x, k) >= 0)),
          at,
        )
        if (random() < 0.5) {
          reversed.set(k, v)
          modelSet(k, v)
        }
        break
      }
      case 'entries': {
        const entry = map.ceilingEntry(k)
        if (entry !== undefined) watched.push({ entry, key: entry.key, value: entry.value })
        for (const w of watched) {
          const s = stored(w.key)
          if (s !== undefined) w.value = values.get(s) as number
          is(w.entry.value, w.value, at)
        }
        break
      }
      case 'clear':
        if (integer(random, 0, 5) === 0) {
          if (keys.length > 0) touched = true
          map.clear()
          keys = []
          values.clear()
        }
        break
      case 'hold': {
        const cursor = random() < 0.5
        held.hold(cursor ? map.keySet().cursor() : map.keys(), cursor)
        break
      }
      case 'advance':
        held.advance(random, keys, at)
        break
    }
    // Writing the value of a present key replaces it in place: not a structural change.
    if (held.active) {
      held.changed(
        effectOf(op, touched, [
          ...READS,
          'set',
          'put',
          'replace',
          'getOrInsert',
          'getOrInsertComputed',
          'merge',
          'entries',
        ]),
      )
    }
    is(map.size, keys.length, at)
    if (tuning?.checkEvery === undefined) isEqual([...map.keys()], keys, at)
    else if (fullCheck(tuning, step, options.steps)) {
      expectSameSequence(
        map.toJSON(),
        keys.map((x) => [x, values.get(x)]),
        at,
      )
    }
    phases.after(keys.length)
  }
  expect(map.toJSON(), `${label} final`).toEqual(keys.map((k) => [k, values.get(k)]))
  phases.finish(label)
}

/** What the LRU reference model drives. */
interface LruMap {
  readonly size: number
  get(key: number): unknown
  getOrDefault(key: number, fallback: unknown): unknown
  set(key: number, value: number): unknown
  put(key: number, value: number): unknown
  getOrInsert(key: number, value: number): unknown
  merge(key: number, value: number, fn: (old: number, value: number) => number): unknown
  has(key: number): boolean
  delete(key: number): boolean
  keys(): Iterator<number>
  toJSON(): Array<[number, number]>
}

/**
 * Seeded reference model for a least-recently-used cache of `maxSize` mappings: applies the same
 * random operations to a map built by `make` (with the given `onEvict`) and to an array of
 * `[key, value]` pairs, most recent last. A read or write of a present key moves its pair to the
 * end; an insertion appends and, past `maxSize`, drops the front pair and records it as evicted.
 * After every step the pairs, the size and the evictions reported so far are compared. With
 * `tuning.maxOpen`, key iterators are held open and stepped: each returns the first key past the
 * order stamp of the one it last returned, skipping keys it already returned that were moved to
 * the end by an access.
 */
export function runLruReferenceModel(options: {
  seed: number
  steps: number
  maxSize: number
  make: (onEvict: (value: number, key: number) => void) => LruMap
  keys?: number
  tuning?: RunTuning
}): void {
  const random = seeded(options.seed)
  const tuning = options.tuning
  const reported: Array<[number, number]> = []
  const map = options.make((value, key) => {
    reported.push([key, value])
  })
  const model: Array<[number, number]> = []
  /** Order stamps parallel to `model`: `seq` changes on every move, `origin` only on insertion. */
  const stamps: Array<{ seq: number; origin: number }> = []
  let high = 0
  const evicted: Array<[number, number]> = []
  const iterations: Array<{
    ours: Iterator<number>
    boundary: number
    visited: Set<number>
    done: boolean
  }> = []
  const top = (tuning?.values ?? options.keys ?? 25) - 1
  const indexOf = (key: number): number => model.findIndex((pair) => pair[0] === key)
  /** Moves a present key to the end and returns its value, or returns `undefined`. */
  const touch = (key: number): number | undefined => {
    const index = indexOf(key)
    if (index < 0) return undefined
    const pair = model.splice(index, 1)[0] as [number, number]
    const stamp = stamps.splice(index, 1)[0] as { seq: number; origin: number }
    model.push(pair)
    stamps.push({ seq: ++high, origin: stamp.origin })
    return pair[1]
  }
  const write = (key: number, value: number): number | undefined => {
    const old = touch(key)
    if (old !== undefined) {
      ;(model[model.length - 1] as [number, number])[1] = value
      return old
    }
    model.push([key, value])
    high++
    stamps.push({ seq: high, origin: high })
    while (model.length > options.maxSize) {
      evicted.push(model.shift() as [number, number])
      stamps.shift()
    }
    return undefined
  }
  const ops = ['get', 'getOrDefault', 'set', 'set', 'put', 'getOrInsert', 'merge', 'has', 'delete']
  if (tuning?.maxOpen !== undefined) ops.push('iter', 'step', 'step')
  const phases = new Phases(tuning?.marks, {
    grow: ['set', 'put', 'getOrInsert', 'merge'],
    shrink: ['delete'],
    wipe: [],
  })
  const label = `LRU reference model seed ${options.seed}`
  for (let step = 0; step < options.steps; step++) {
    const op = phases.choose(random, ops)
    const at = `${label} step ${step} op ${op}`
    const drawn = integer(random, 0, top)
    const k = aimed(
      phases.aim(random, op, () => model.map((pair) => pair[0])),
      drawn,
    )
    const v = integer(random, 0, 99)
    switch (op) {
      case 'get':
        is(map.get(k), touch(k), at)
        break
      case 'getOrDefault': {
        const old = touch(k)
        is(map.getOrDefault(k, -1), old === undefined ? -1 : old, at)
        break
      }
      case 'set':
        map.set(k, v)
        write(k, v)
        break
      case 'put':
        is(map.put(k, v), write(k, v), at)
        break
      case 'getOrInsert': {
        const old = touch(k)
        if (old === undefined) write(k, v)
        is(map.getOrInsert(k, v), old === undefined ? v : old, at)
        break
      }
      case 'merge': {
        const index = indexOf(k)
        const value = index < 0 ? v : (model[index] as [number, number])[1] + v
        write(k, value)
        is(
          map.merge(k, v, (old, add) => old + add),
          value,
          at,
        )
        break
      }
      case 'has':
        is(map.has(k), indexOf(k) >= 0, at)
        break
      case 'delete': {
        const index = indexOf(k)
        if (index >= 0) {
          model.splice(index, 1)
          stamps.splice(index, 1)
        }
        is(map.delete(k), index >= 0, at)
        break
      }
      case 'iter':
        iterations.push({ ours: map.keys(), boundary: 0, visited: new Set(), done: false })
        cap(iterations, tuning?.maxOpen)
        break
      case 'step': {
        if (iterations.length === 0) break
        const it = pick(random, iterations)
        let found = -1
        if (!it.done) {
          found = stamps.findIndex((s) => s.seq > it.boundary && !it.visited.has(s.origin))
          if (found < 0) it.done = true
        }
        if (found < 0) {
          isEqual(it.ours.next(), { done: true, value: undefined }, at)
        } else {
          const stamp = stamps[found] as { seq: number; origin: number }
          it.boundary = stamp.seq
          it.visited.add(stamp.origin)
          isEqual(
            it.ours.next(),
            {
              done: false,
              value: (model[found] as [number, number])[0],
            },
            at,
          )
        }
        break
      }
    }
    is(map.size, model.length, at)
    if (tuning?.checkEvery === undefined) {
      isEqual(map.toJSON(), model, at)
      isEqual(reported, evicted, at)
    } else {
      is(reported.length, evicted.length, `${at}: evictions reported`)
      if (fullCheck(tuning, step, options.steps)) {
        expectSameSequence(map.toJSON(), model, at)
        expectSameSequence(reported, evicted, `${at}: evictions`)
        // Compared: start the next period's evictions afresh, so long runs compare each once.
        reported.length = 0
        evicted.length = 0
      }
    }
    phases.after(model.length)
  }
  phases.finish(label)
}

/** A mapping of the sequenced-map model, with its order stamp and its identity across accesses. */
interface MapRecord {
  readonly key: unknown
  value: number
  readonly seq: number
  readonly origin: number
}

/** An open iteration of the sequenced-map model, written from the rules, not the links. */
interface MapIteration {
  readonly fromBack: boolean
  boundary: number
  /** The origins returned so far, on a forward iteration of an access-ordered map. */
  readonly visited: Set<number>
  done: boolean
}

/**
 * Seeded reference model for a linked hash map with live iteration, in insertion or access order,
 * optionally bounded: applies the same random operations — the map API, the ends and polls,
 * `putFirst`/`putLast`, writes and ends through the reversed view, entry writes, `clear` — to the
 * map and to an array of mappings stamped with order numbers, and compares every result. Open
 * iterators of the map, its reversed view and each kind of view, and cursors with look-ahead, are
 * stepped and compared exactly: each returns the first mapping past the stamp of the one it last
 * returned in its own direction, skipping, on a forward walk of an access-ordered map, mappings it
 * already returned; `clear` puts it back before the first mapping; once done it stays done. An
 * access moves a mapping to the end keeping its identity; an explicit move gives it a new one. Past
 * `maxSize`, an insertion evicts from the front, never the mapping it made, and the evictions
 * reported to `onEvict` are compared after every step. Keys are small integers, `-0` (stored as
 * `0`) and `null`.
 */
export function runSequencedMapReferenceModel(options: {
  seed: number
  steps: number
  /** Builds an empty map with these options and the given `onEvict`. */
  make: (onEvict: (value: number, key: unknown) => void) => SequencedMap<unknown, number>
  accessOrder?: boolean | undefined
  maxSize?: number | undefined
  /** How many distinct integers keys are drawn from (from 0), besides `-0` and `null`. */
  values?: number
  tuning?: RunTuning
}): void {
  const random = seeded(options.seed)
  const tuning = options.tuning
  const reported: Array<[unknown, number]> = []
  const map = options.make((value, key) => {
    reported.push([key, value])
  })
  const view = map.reversed()
  const accessOrder = options.accessOrder === true
  const maxSize = options.maxSize
  const records: MapRecord[] = []
  const evicted: Array<[unknown, number]> = []
  let low = 0
  let high = 0
  const iterations: Array<{
    ours: Iterator<unknown>
    model: MapIteration
    read: (r: MapRecord) => unknown
  }> = []
  const cursors: Array<{
    ours: Cursor<unknown>
    model: MapIteration
    looked: { key: unknown } | 'done' | undefined
    last: { key: unknown } | undefined
  }> = []
  const top = (tuning?.values ?? options.values ?? 10) - 1
  const ops = [
    'set',
    'set',
    'put',
    'get',
    'get',
    'getOrDefault',
    'has',
    'delete',
    'remove',
    'replace',
    'getOrInsert',
    'getOrInsertComputed',
    'compute',
    'computeIfPresent',
    'merge',
    'putAll',
    'putFirst',
    'putLast',
    'ends',
    'poll',
    'clear',
    'setValue',
    'keySetHas',
    'iter',
    'step',
    'step',
    'step',
    'cursor',
    'look',
    'next',
    'next',
    'cursorRemove',
  ]
  const draw = (): unknown => {
    const r = random()
    if (r < 0.05) return null
    if (r < 0.1) return -0
    return integer(random, 0, top)
  }
  const norm = (k: unknown): unknown => (k === 0 ? 0 : k)
  const indexOf = (k: unknown): number => records.findIndex((r) => Object.is(r.key, norm(k)))
  const link = (key: unknown, value: number, front: boolean, origin?: number): MapRecord => {
    const seq = front ? --low : ++high
    const record: MapRecord = { key, value, seq, origin: origin === undefined ? seq : origin }
    if (front) records.unshift(record)
    else records.push(record)
    return record
  }
  const insert = (k: unknown, value: number, front: boolean): void => {
    const made = link(norm(k), value, front)
    if (maxSize === undefined) return
    while (records.length > maxSize) {
      const index = records[0] === made ? 1 : 0
      const victim = records.splice(index, 1)[0] as MapRecord
      evicted.push([victim.key, victim.value])
    }
  }
  const access = (index: number): void => {
    if (!accessOrder || index === records.length - 1) return
    const record = records.splice(index, 1)[0] as MapRecord
    link(record.key, record.value, false, record.origin)
  }
  /** Writes a present key's value as an access, or inserts at the target's own end. */
  const write = (k: unknown, value: number, viaView: boolean): number | undefined => {
    const index = indexOf(k)
    if (index < 0) {
      insert(k, value, viaView)
      return undefined
    }
    const old = (records[index] as MapRecord).value
    ;(records[index] as MapRecord).value = value
    access(index)
    return old
  }
  const read = (k: unknown): number | undefined => {
    const index = indexOf(k)
    if (index < 0) return undefined
    const value = (records[index] as MapRecord).value
    access(index)
    return value
  }
  const removeKey = (k: unknown): number | undefined => {
    const index = indexOf(k)
    return index < 0 ? undefined : (records.splice(index, 1)[0] as MapRecord).value
  }
  const place = (k: unknown, value: number, front: boolean): void => {
    const index = indexOf(k)
    if (index < 0) {
      insert(k, value, front)
      return
    }
    const record = records[index] as MapRecord
    if (index === (front ? 0 : records.length - 1)) {
      record.value = value
      return
    }
    records.splice(index, 1)
    link(record.key, value, front)
  }
  const open = (fromBack: boolean): MapIteration => ({
    fromBack,
    boundary: fromBack ? high + 1 : low - 1,
    visited: new Set<number>(),
    done: false,
  })
  const advance = (it: MapIteration): MapRecord | 'done' => {
    if (it.done) return 'done'
    let found: MapRecord | undefined
    if (it.fromBack) {
      for (let i = records.length - 1; i >= 0 && found === undefined; i--) {
        if ((records[i] as MapRecord).seq < it.boundary) found = records[i]
      }
    } else {
      found = records.find((r) => r.seq > it.boundary && !it.visited.has(r.origin))
    }
    if (found === undefined) {
      it.done = true
      return 'done'
    }
    it.boundary = found.seq
    if (!it.fromBack && accessOrder) it.visited.add(found.origin)
    return found
  }
  const endOf = (fromBack: boolean): MapRecord | undefined =>
    fromBack ? records[records.length - 1] : records[0]
  const pairOf = (entry: MapEntry<unknown, number> | undefined): unknown =>
    entry === undefined ? undefined : [entry.key, entry.value]

  const phases = new Phases(tuning?.marks, {
    grow: ['set', 'put', 'getOrInsert', 'getOrInsertComputed', 'putAll', 'putFirst', 'putLast'],
    shrink: ['delete', 'remove', 'poll', 'cursorRemove'],
    wipe: ['clear'],
  })
  const label = `sequenced map reference model seed ${options.seed}`
  for (let step = 0; step < options.steps; step++) {
    const op = phases.choose(random, ops)
    const at = `${label} step ${step} op ${op}`
    const drawn = draw()
    const k = aimed(
      phases.aim(random, op, () => records.map((r) => r.key)),
      drawn,
    )
    const v = integer(random, 0, 99)
    const viaView = random() < 0.3
    const target = viaView ? view : map
    switch (op) {
      case 'set':
        is(target.set(k, v), target, at)
        write(k, v, viaView)
        break
      case 'put':
        is(target.put(k, v), write(k, v, viaView), at)
        break
      case 'get':
        is(target.get(k), read(k), at)
        break
      case 'getOrDefault': {
        const value = read(k)
        is(target.getOrDefault(k, -1), value === undefined ? -1 : value, at)
        break
      }
      case 'has':
        is(target.has(k), indexOf(k) >= 0, at)
        break
      case 'keySetHas':
        is(target.keySet().has(k), indexOf(k) >= 0, at)
        break
      case 'delete':
        is(target.delete(k), removeKey(k) !== undefined, at)
        break
      case 'remove':
        is(target.remove(k), removeKey(k), at)
        break
      case 'replace': {
        const present = indexOf(k) >= 0
        is(target.replace(k, v), present ? write(k, v, viaView) : undefined, at)
        break
      }
      case 'getOrInsert': {
        const value = read(k)
        if (value === undefined) insert(k, v, viaView)
        is(target.getOrInsert(k, v), value === undefined ? v : value, at)
        break
      }
      case 'getOrInsertComputed': {
        const value = read(k)
        if (value === undefined) insert(k, v, viaView)
        is(
          target.getOrInsertComputed(k, () => v),
          value === undefined ? v : value,
          at,
        )
        break
      }
      case 'compute':
      case 'computeIfPresent': {
        const fn = (value: number | undefined) =>
          value === undefined ? v : value % 2 === 0 ? undefined : value + 2
        const index = indexOf(k)
        let expected: number | undefined
        if (index < 0) {
          expected = op === 'compute' ? v : undefined
          if (expected !== undefined) insert(k, expected, viaView)
        } else {
          expected = fn((records[index] as MapRecord).value)
          if (expected === undefined) records.splice(index, 1)
          else write(k, expected, viaView)
        }
        is(
          op === 'compute' ? target.compute(k, fn) : target.computeIfPresent(k, fn as never),
          expected,
          at,
        )
        break
      }
      case 'merge': {
        const fn = (old: number, value: number) => (old > 50 ? undefined : old + value)
        const index = indexOf(k)
        let expected: number | undefined = v
        if (index < 0) insert(k, v, viaView)
        else {
          expected = fn((records[index] as MapRecord).value, v)
          if (expected === undefined) records.splice(index, 1)
          else write(k, expected, viaView)
        }
        is(target.merge(k, v, fn), expected, at)
        break
      }
      case 'putAll': {
        const w = draw()
        target.putAll([
          [k, v],
          [w, v + 1],
        ])
        write(k, v, viaView)
        write(w, v + 1, viaView)
        break
      }
      case 'putFirst':
      case 'putLast': {
        const ownFront = op === 'putFirst'
        is(ownFront ? target.putFirst(k, v) : target.putLast(k, v), target, at)
        place(k, v, ownFront !== viaView)
        break
      }
      case 'ends': {
        const fromBack = random() < 0.5
        const record = endOf(fromBack !== viaView)
        const entry = fromBack ? target.lastEntry() : target.firstEntry()
        isEqual(pairOf(entry), record === undefined ? undefined : [record.key, record.value], at)
        break
      }
      case 'poll': {
        const fromBack = random() < 0.5
        const record = endOf(fromBack !== viaView)
        const entry = fromBack ? target.pollLastEntry() : target.pollFirstEntry()
        isEqual(pairOf(entry), record === undefined ? undefined : [record.key, record.value], at)
        if (record !== undefined) records.splice(records.indexOf(record), 1)
        break
      }
      case 'setValue': {
        const fromBack = random() < 0.5
        const entry = fromBack ? map.lastEntry() : map.firstEntry()
        const record = endOf(fromBack)
        if (entry === undefined || record === undefined) break
        is(entry.setValue(v), record.value, at)
        record.value = v
        break
      }
      case 'clear':
        if (random() < 0.7) break
        target.clear()
        records.length = 0
        for (const it of [...iterations.map((i) => i.model), ...cursors.map((c) => c.model)]) {
          if (it.done) continue
          it.boundary = it.fromBack ? high + 1 : low - 1
          it.visited.clear()
        }
        break
      case 'iter': {
        const fromBack = random() < 0.5
        const source = fromBack ? view : map
        const kind = integer(random, 0, 4)
        const iterator: Iterator<unknown> =
          kind === 0
            ? source.entries()
            : kind === 1
              ? source.keySet()[Symbol.iterator]()
              : kind === 2
                ? source.valueCollection()[Symbol.iterator]()
                : kind === 3
                  ? source.entrySet()[Symbol.iterator]()
                  : source.keys()
        const readOf =
          kind === 0
            ? (r: MapRecord) => [r.key, r.value]
            : kind === 2
              ? (r: MapRecord) => r.value
              : kind === 3
                ? (r: MapRecord) => [r.key, r.value]
                : (r: MapRecord) => r.key
        iterations.push({
          ours:
            kind === 3
              ? {
                  next: () => {
                    const result = iterator.next() as IteratorResult<MapEntry<unknown, number>>
                    return result.done === true
                      ? result
                      : { done: false, value: [result.value.key, result.value.value] }
                  },
                }
              : iterator,
          model: open(fromBack),
          read: readOf,
        })
        cap(iterations, tuning?.maxOpen)
        break
      }
      case 'step': {
        if (iterations.length === 0) break
        const it = pick(random, iterations)
        const expected = advance(it.model)
        isEqual(
          it.ours.next(),
          expected === 'done'
            ? { done: true, value: undefined }
            : { done: false, value: it.read(expected) },
          at,
        )
        break
      }
      case 'cursor': {
        const fromBack = random() < 0.5
        cursors.push({
          ours: (fromBack ? view : map).keySet().cursor(),
          model: open(fromBack),
          looked: undefined,
          last: undefined,
        })
        cap(cursors, tuning?.maxOpen)
        break
      }
      case 'look': {
        if (cursors.length === 0) break
        const cur = pick(random, cursors)
        if (cur.looked === undefined) {
          const found = advance(cur.model)
          cur.looked = found === 'done' ? 'done' : { key: found.key }
        }
        is(cur.ours.hasNext(), cur.looked !== 'done', at)
        break
      }
      case 'next': {
        if (cursors.length === 0) break
        const cur = pick(random, cursors)
        if (cur.looked === undefined) {
          const found = advance(cur.model)
          cur.looked = found === 'done' ? 'done' : { key: found.key }
        }
        if (cur.looked === 'done') {
          expect(() => cur.ours.next(), at).toThrow(NoSuchElementError)
        } else {
          is(cur.ours.next(), cur.looked.key, at)
          cur.last = cur.looked
          cur.looked = undefined
        }
        break
      }
      case 'cursorRemove': {
        if (cursors.length === 0) break
        const cur = pick(random, cursors)
        if (cur.last === undefined) break
        cur.ours.remove()
        removeKey(cur.last.key)
        cur.last = undefined
        break
      }
    }
    is(map.size, records.length, at)
    if (tuning?.checkEvery === undefined) {
      const expected = records.map((r) => [r.key, r.value])
      isEqual(map.toJSON(), expected, at)
      isEqual(view.toJSON(), expected.slice().reverse(), at)
      isEqual(reported, evicted, at)
    } else {
      is(reported.length, evicted.length, `${at}: evictions reported`)
      if (fullCheck(tuning, step, options.steps)) {
        const expected = records.map((r) => [r.key, r.value])
        expectSameSequence(map.toJSON(), expected, at)
        expectSameSequence(view.toJSON(), expected.reverse(), at)
        expectSameSequence(reported, evicted, `${at}: evictions`)
        reported.length = 0
        evicted.length = 0
      }
    }
    phases.after(records.length)
  }
  phases.finish(label)
}

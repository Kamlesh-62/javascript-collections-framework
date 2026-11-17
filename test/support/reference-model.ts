// Seeded reference-model runner: applies the same random operations to a collection and to a
// native model and compares every observable result. In live mode it also interleaves open
// iterators and cursors with changes and compares them with native Set iterators.

import { expect } from 'vitest'
import { type Collection, type Cursor, NoSuchElementError } from '../../src/index'
import type { List } from '../../src/interfaces/list'
import type { Deque } from '../../src/interfaces/queue'
import type { SortedSet } from '../../src/interfaces/sorted-set'
import { integer, pick, seeded } from './random'

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
}

interface OpenCursor {
  ours: Cursor<number>
  theirs: Iterator<number>
  looked: IteratorResult<number> | undefined
  last: { value: number } | undefined
}

export function runReferenceModel(options: ReferenceModelOptions): void {
  const random = seeded(options.seed)
  const c = options.make()
  const set = new Set<number>()
  const array: number[] = []
  const live = options.model === 'set'
  const iterators: Array<{ ours: Iterator<number>; theirs: Iterator<number> }> = []
  const cursors: OpenCursor[] = []
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
  const top = (options.values ?? 10) - 1

  for (let step = 0; step < options.steps; step++) {
    const at = `reference model seed ${options.seed} step ${step}`
    const op = pick(random, ops)
    const v = integer(random, 0, top)
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
          if (random() < 0.75) expect(c.delete(x), at).toBe(set.delete(x))
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
        expect(c.delete(v), at).toBe(expected)
        break
      }
      case 'has':
        expect(c.has(v), at).toBe(live ? set.has(v) : array.includes(v))
        break
      case 'clear':
        c.clear()
        set.clear()
        array.length = 0
        break
      case 'check':
        expect(c.toArray(), at).toEqual(live ? [...set] : array)
        expect(c.size, at).toBe(live ? set.size : array.length)
        break
      case 'iter':
        iterators.push({ ours: c[Symbol.iterator](), theirs: set.values() })
        break
      case 'step': {
        if (iterators.length === 0) break
        const it = pick(random, iterators)
        expect(it.ours.next(), at).toEqual(it.theirs.next())
        break
      }
      case 'cursor':
        cursors.push({ ours: c.cursor(), theirs: set.values(), looked: undefined, last: undefined })
        break
      case 'look': {
        if (cursors.length === 0) break
        const cur = pick(random, cursors)
        if (cur.looked === undefined) cur.looked = cur.theirs.next()
        expect(cur.ours.hasNext(), at).toBe(cur.looked.done !== true)
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
          expect(cur.ours.next(), at).toBe(value)
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
    }
  }
  expect(c.toArray(), `reference model seed ${options.seed} final`).toEqual(live ? [...set] : array)
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
}): void {
  const random = seeded(options.seed)
  const list = options.make()
  const array: number[] = []
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
  for (let step = 0; step < options.steps; step++) {
    const at = `list reference model seed ${options.seed} step ${step}`
    const op = pick(random, ops)
    const v = integer(random, 0, 9)
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
        expect(list.insertAll(i, items), at).toBe(true)
        array.splice(i, 0, ...items)
        break
      }
      case 'set':
        if (n === 0) break
        {
          const i = integer(random, 0, n - 1)
          expect(list.set(i, v), at).toBe(array[i])
          array[i] = v
        }
        break
      case 'removeAt':
        if (n === 0) break
        {
          const i = integer(random, 0, n - 1)
          expect(list.removeAt(i), at).toBe(array.splice(i, 1)[0])
        }
        break
      case 'delete': {
        const i = array.indexOf(v)
        expect(list.delete(v), at).toBe(i >= 0)
        if (i >= 0) array.splice(i, 1)
        break
      }
      case 'removeLast':
        if (n === 0) expect(() => list.removeLast(), at).toThrow(NoSuchElementError)
        else expect(list.removeLast(), at).toBe(array.pop())
        break
      case 'get':
        if (n > 0) {
          const i = integer(random, 0, n - 1)
          expect(list.get(i), at).toBe(array[i])
        }
        break
      case 'indexOf':
        expect(list.indexOf(v), at).toBe(array.indexOf(v))
        expect(list.lastIndexOf(v), at).toBe(array.lastIndexOf(v))
        break
      case 'removeIf': {
        const keep = array.filter((e) => e !== v)
        expect(
          list.removeIf((e) => e === v),
          at,
        ).toBe(keep.length !== n)
        array.length = 0
        array.push(...keep)
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
        expect(list.toArray(), at).toEqual(array)
        expect(list.size, at).toBe(array.length)
        break
    }
  }
  expect(list.toArray(), `list reference model seed ${options.seed} final`).toEqual(array)
}

/**
 * Seeded reference model for deques: applies the same random end operations to a deque and to a
 * native array (`push`/`unshift`/`shift`/`pop`) and compares every result, `size` included after
 * every `poll` and `pop`. `make` builds an empty deque (or a view over one); `values` is the pool
 * elements are drawn from (default the integers 0–9).
 */
export function runDequeReferenceModel(options: {
  seed: number
  steps: number
  make: () => Deque<number | null | undefined>
  values?: ReadonlyArray<number | null | undefined>
}): void {
  const random = seeded(options.seed)
  const deque = options.make()
  const array: Array<number | null | undefined> = []
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
  for (let step = 0; step < options.steps; step++) {
    const at = `deque reference model seed ${options.seed} step ${step}`
    const op = pick(random, ops)
    const v = options.values ? pick(random, options.values) : integer(random, 0, 9)
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
        expect(deque.poll(), at).toBe(array.shift())
        expect(deque.size, at).toBe(array.length)
        break
      case 'pop':
        expect(deque.pop(), at).toBe(array.pop())
        expect(deque.size, at).toBe(array.length)
        break
      case 'peek':
        expect(deque.peek(), at).toBe(array[0])
        break
      case 'peekLast':
        expect(deque.peekLast(), at).toBe(array[array.length - 1])
        break
      case 'delete': {
        const i = array.indexOf(v)
        expect(deque.delete(v), at).toBe(i >= 0)
        if (i >= 0) array.splice(i, 1)
        break
      }
      case 'has':
        expect(deque.has(v), at).toBe(array.includes(v))
        break
      case 'removeIf': {
        const keep = array.filter((e) => e !== v)
        expect(
          deque.removeIf((e) => e === v),
          at,
        ).toBe(keep.length !== array.length)
        array.length = 0
        array.push(...keep)
        break
      }
      case 'check':
        expect([...deque], at).toEqual(array)
        expect(deque.size, at).toBe(array.length)
        break
    }
  }
  expect([...deque], `deque reference model seed ${options.seed} final`).toEqual(array)
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
}): void {
  const random = seeded(options.seed)
  const queue = options.make()
  const array: number[] = []
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
  for (let step = 0; step < options.steps; step++) {
    const at = `priority queue reference model seed ${options.seed} step ${step}`
    const op = pick(random, ops)
    const v = integer(random, 0, 20)
    switch (op) {
      case 'add':
        queue.add(v)
        insert(v)
        break
      case 'poll':
        expect(queue.poll(), at).toBe(array.shift())
        break
      case 'peek':
        expect(queue.peek(), at).toBe(array[0])
        break
      case 'delete':
        expect(queue.delete(v), at).toBe(removeOne(v))
        break
      case 'has':
        expect(queue.has(v), at).toBe(array.includes(v))
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
        expect(sortedCopy(seen), at).toEqual(before)
        break
      }
      case 'clear':
        if (integer(random, 0, 3) === 0) {
          queue.clear()
          array.length = 0
        }
        break
      case 'check':
        expect(sortedCopy(queue), at).toEqual(sortedCopy(array))
        break
    }
    expect(queue.size, at).toBe(array.length)
  }
  const drained: number[] = []
  for (let n = queue.poll(); n !== undefined; n = queue.poll()) drained.push(n)
  expect(drained, `priority queue reference model seed ${options.seed} final`).toEqual(array)
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
}): void {
  const random = seeded(options.seed)
  const { compare } = options
  const set = options.make()
  let array: T[] = []
  const indexOf = (v: T): number => array.findIndex((x) => compare(x, v) === 0)
  const insert = (v: T): boolean => {
    if (indexOf(v) >= 0) return false
    let i = 0
    while (i < array.length && compare(array[i] as T, v) < 0) i++
    array.splice(i, 0, v)
    return true
  }
  const remove = (v: T): boolean => {
    const i = indexOf(v)
    if (i >= 0) array.splice(i, 1)
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
  for (let step = 0; step < options.steps; step++) {
    const at = `sorted set reference model seed ${options.seed} step ${step}`
    const op = pick(random, ops)
    const v = options.value(random)
    switch (op) {
      case 'add':
        set.add(v)
        insert(v)
        break
      case 'delete':
        expect(set.delete(v), at).toBe(remove(v))
        break
      case 'has':
        expect(set.has(v), at).toBe(indexOf(v) >= 0)
        break
      case 'near':
        expect(set.lower(v), at).toBe(last(array.filter((x) => compare(x, v) < 0)))
        expect(set.floor(v), at).toBe(last(array.filter((x) => compare(x, v) <= 0)))
        expect(set.ceiling(v), at).toBe(array.find((x) => compare(x, v) >= 0))
        expect(set.higher(v), at).toBe(array.find((x) => compare(x, v) > 0))
        break
      case 'ends':
        if (array.length === 0) {
          expect(() => set.getFirst(), at).toThrow(NoSuchElementError)
        } else {
          expect(set.getFirst(), at).toBe(array[0])
          expect(set.getLast(), at).toBe(last(array))
        }
        break
      case 'poll':
        if (random() < 0.5) expect(set.pollFirst(), at).toBe(array.shift())
        else expect(set.pollLast(), at).toBe(array.pop())
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
        expect(seen, at).toEqual(
          descending ? expected.sort((a, b) => compare(b, a)) : expected.sort(compare),
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
        expect(view.toArray(), at).toEqual(expected)
        expect(view.size, at).toBe(expected.length)
        expect(view.reversed().toArray(), at).toEqual(expected.slice().reverse())
        const probe = options.value(random)
        expect(view.floor(probe), at).toBe(last(expected.filter((x) => compare(x, probe) <= 0)))
        expect(view.higher(probe), at).toBe(expected.find((x) => compare(x, probe) > 0))
        if (check(probe)) {
          view.add(probe)
          insert(probe)
        } else {
          expect(view.has(probe), at).toBe(false)
        }
        if (random() < 0.3) {
          const polled = view.pollFirst()
          expect(polled, at).toBe(array.filter(check)[0])
          if (polled !== undefined) remove(polled)
        }
        break
      }
      case 'clear':
        if (integer(random, 0, 5) === 0) {
          set.clear()
          array = []
        }
        break
      case 'check':
        expect(set.toArray(), at).toEqual(array)
        break
    }
    expect(set.size, at).toBe(array.length)
  }
  expect(set.toArray(), `sorted set reference model seed ${options.seed} final`).toEqual(array)
}

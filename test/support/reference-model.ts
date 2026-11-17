// Seeded reference-model runner: applies the same random operations to a collection and to a
// native model and compares every observable result. In live mode it also interleaves open
// iterators and cursors with changes and compares them with native Set iterators.

import { expect } from 'vitest'
import {
  type Collection,
  type Cursor,
  IllegalArgumentError,
  type MapEntry,
  NoSuchElementError,
} from '../../src/index'
import type { List } from '../../src/interfaces/list'
import type { Deque } from '../../src/interfaces/queue'
import type { SortedMap } from '../../src/interfaces/sorted-map'
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
}): void {
  const random = seeded(options.seed)
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
  const top = (options.keys ?? 10) - 1
  for (let step = 0; step < options.steps; step++) {
    const at = `map reference model seed ${options.seed} step ${step}`
    const op = pick(random, ops)
    const k = integer(random, 0, top)
    const v = integer(random, 0, 99)
    switch (op) {
      case 'set':
        map.set(k, v)
        model.set(k, v)
        break
      case 'put':
        expect(map.put(k, v), at).toBe(model.get(k))
        model.set(k, v)
        break
      case 'delete':
        expect(map.delete(k), at).toBe(model.delete(k))
        break
      case 'remove': {
        const old = model.get(k)
        model.delete(k)
        expect(map.remove(k), at).toBe(old)
        break
      }
      case 'get':
        expect(map.get(k), at).toBe(model.get(k))
        break
      case 'has':
        expect(map.has(k), at).toBe(model.has(k))
        break
      case 'replace': {
        const old = model.get(k)
        if (model.has(k)) model.set(k, v)
        expect(map.replace(k, v), at).toBe(old)
        break
      }
      case 'getOrInsert':
        expect(map.getOrInsert(k, v), at).toBe(nativeGetOrInsert(model, k, v))
        break
      case 'getOrInsertComputed':
        expect(
          map.getOrInsertComputed(k, (key) => key + v),
          at,
        ).toBe(nativeGetOrInsertComputed(model, k, (key) => key + v))
        break
      case 'compute': {
        // Odd values are kept and incremented; even ones are removed.
        const fn = (value: number | undefined) =>
          value === undefined ? v : value % 2 === 0 ? undefined : value + 2
        const old = model.get(k)
        const result = fn(old)
        if (result === undefined) model.delete(k)
        else model.set(k, result)
        expect(map.compute(k, fn), at).toBe(result)
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
        expect(map.merge(k, v, fn), at).toBe(expected)
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
          if (random() < 0.75) expect(map.delete(key), at).toBe(model.delete(key))
        }
        break
      case 'clear':
        map.clear()
        model.clear()
        break
      case 'check':
        expect([...(map as Iterable<[number, number]>)], at).toEqual([...model])
        expect(map.size, at).toBe(model.size)
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
        break
      }
      case 'step': {
        if (iterators.length === 0) break
        const it = pick(random, iterators)
        expect(it.ours.next(), at).toEqual(it.theirs.next())
        break
      }
    }
  }
  expect(
    [...(map as Iterable<[number, number]>)],
    `map reference model seed ${options.seed} final`,
  ).toEqual([...model])
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
}): void {
  const random = seeded(options.seed)
  const { compare } = options
  const map = options.make()
  const values = new Map<K, number>()
  let keys: K[] = []
  /** The stored key equal to `k` under `compare`, or `undefined`. */
  const stored = (k: K): K | undefined => keys.find((x) => compare(x, k) === 0)
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
    let i = 0
    while (i < keys.length && compare(keys[i] as K, k) < 0) i++
    keys.splice(i, 0, k)
    values.set(k, v)
    return undefined
  }
  const modelDelete = (k: K): number | undefined => {
    const s = stored(k)
    if (s === undefined) return undefined
    const old = values.get(s)
    keys = keys.filter((x) => x !== s)
    values.delete(s)
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
  let next = 0
  for (let step = 0; step < options.steps; step++) {
    const at = `sorted map reference model seed ${options.seed} step ${step}`
    const op = pick(random, ops)
    const k = options.key(random)
    const v = next++
    switch (op) {
      case 'set':
        expect(map.set(k, v), at).toBe(map)
        modelSet(k, v)
        break
      case 'put':
        expect(map.put(k, v), at).toBe(modelSet(k, v))
        break
      case 'delete':
        expect(map.delete(k), at).toBe(modelDelete(k) !== undefined)
        break
      case 'remove':
        expect(map.remove(k), at).toBe(modelDelete(k))
        break
      case 'get':
        expect(map.get(k), at).toBe(modelGet(k))
        expect(map.has(k), at).toBe(stored(k) !== undefined)
        break
      case 'replace': {
        const old = modelGet(k)
        expect(map.replace(k, v), at).toBe(old)
        if (old !== undefined) modelSet(k, v)
        break
      }
      case 'getOrInsert': {
        const old = modelGet(k)
        expect(map.getOrInsert(k, v), at).toBe(old === undefined ? v : old)
        if (old === undefined) modelSet(k, v)
        break
      }
      case 'getOrInsertComputed': {
        const old = modelGet(k)
        expect(
          map.getOrInsertComputed(k, () => v),
          at,
        ).toBe(old === undefined ? v : old)
        if (old === undefined) modelSet(k, v)
        break
      }
      case 'compute': {
        const old = modelGet(k)
        const remove = random() < 0.3
        const result = map.compute(k, (current) => {
          expect(current, at).toBe(old)
          return remove ? undefined : v
        })
        expect(result, at).toBe(remove ? undefined : v)
        if (remove) modelDelete(k)
        else modelSet(k, v)
        break
      }
      case 'merge': {
        const old = modelGet(k)
        const merged = map.merge(k, v, (a, b) => a + b)
        const expected = old === undefined ? v : old + v
        expect(merged, at).toBe(expected)
        modelSet(k, expected)
        break
      }
      case 'near':
        expect(pairOfEntry(map.lowerEntry(k)), at).toEqual(
          pairOf(last(keys.filter((x) => compare(x, k) < 0))),
        )
        expect(pairOfEntry(map.floorEntry(k)), at).toEqual(
          pairOf(last(keys.filter((x) => compare(x, k) <= 0))),
        )
        expect(pairOfEntry(map.ceilingEntry(k)), at).toEqual(
          pairOf(keys.find((x) => compare(x, k) >= 0)),
        )
        expect(pairOfEntry(map.higherEntry(k)), at).toEqual(
          pairOf(keys.find((x) => compare(x, k) > 0)),
        )
        break
      case 'ends':
        expect(pairOfEntry(map.firstEntry()), at).toEqual(pairOf(keys[0]))
        expect(pairOfEntry(map.lastEntry()), at).toEqual(pairOf(last(keys)))
        break
      case 'poll': {
        const first = random() < 0.5
        const expected = pairOf(first ? keys[0] : last(keys))
        const polled = first ? map.pollFirstEntry() : map.pollLastEntry()
        expect(pairOfEntry(polled), at).toEqual(expected)
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
        expect([...view.keys()], at).toEqual(expected)
        expect(view.size, at).toBe(expected.length)
        expect([...view.reversed().keys()], at).toEqual(expected.slice().reverse())
        const probe = options.key(random)
        expect(pairOfEntry(view.floorEntry(probe)), at).toEqual(
          pairOf(last(expected.filter((x) => compare(x, probe) <= 0))),
        )
        expect(pairOfEntry(view.higherEntry(probe)), at).toEqual(
          pairOf(expected.find((x) => compare(x, probe) > 0)),
        )
        if (check(probe)) {
          view.set(probe, v)
          modelSet(probe, v)
        } else {
          expect(view.get(probe), at).toBeUndefined()
          expect(view.has(probe), at).toBe(false)
          expect(() => view.set(probe, v), at).toThrow(IllegalArgumentError)
        }
        if (random() < 0.3) {
          const polled = view.pollFirstEntry()
          expect(pairOfEntry(polled), at).toEqual(pairOf(keys.filter(check)[0]))
          if (polled !== undefined) modelDelete(polled.key)
        }
        break
      }
      case 'reversed': {
        const reversed = map.reversed()
        expect([...reversed.keys()], at).toEqual(keys.slice().reverse())
        expect(pairOfEntry(reversed.floorEntry(k)), at).toEqual(
          pairOf(keys.find((x) => compare(x, k) >= 0)),
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
          expect(w.entry.value, at).toBe(w.value)
        }
        break
      }
      case 'clear':
        if (integer(random, 0, 5) === 0) {
          map.clear()
          keys = []
          values.clear()
        }
        break
    }
    expect(map.size, at).toBe(keys.length)
    expect([...map.keys()], at).toEqual(keys)
  }
  expect(map.toJSON(), `sorted map reference model seed ${options.seed} final`).toEqual(
    keys.map((k) => [k, values.get(k)]),
  )
}

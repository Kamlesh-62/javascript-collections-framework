import { assert, describe, expect, it } from 'vitest'
import {
  ArrayList,
  type List,
  type ReadonlyList,
  type ReadonlySortedMap,
  type ReadonlySortedSet,
  TreeMap,
  TreeSet,
  UnsupportedOperationError,
  unmodifiableCollection,
  unmodifiableList,
  unmodifiableSequencedCollection,
  unmodifiableSequencedSet,
  unmodifiableSet,
  unmodifiableSortedMap,
  unmodifiableSortedSet,
} from '../../src/index'
import { integer, seeded } from '../support/random'
import { WORST } from './config'

const DEPTH = WORST.viewDepth

function same(actual: unknown, expected: unknown, at: string): void {
  if (!Object.is(actual, expected)) assert.fail(`${at}: got ${actual}, reference has ${expected}`)
}

function sameArray(actual: readonly unknown[], expected: readonly unknown[], at: string): void {
  same(actual.length, expected.length, `${at} length`)
  for (let i = 0; i < expected.length; i++) same(actual[i], expected[i], `${at}[${i}]`)
}

/** A level of a nested chain: a sub-list starting at `from` in its parent, or a reversed view. */
interface Level {
  readonly reversed: boolean
  readonly from: number
  size: number
}

/** The level that every tenth view of a chain is: a reversed view, otherwise a sub-list. */
const isReversed = (level: number) => level % 10 === 9

/**
 * The reference for a chain of views over an array: maps an index or an insertion position in the
 * innermost view to the array, walking the levels without recursion.
 */
class ChainReference {
  readonly levels: Level[] = []
  constructor(readonly base: number[]) {}

  /** The array index of the element at `index` of the innermost view. */
  indexOf(index: number): number {
    let i = index
    for (let l = this.levels.length - 1; l >= 0; l--) {
      const level = this.levels[l] as Level
      const parentSize = l === 0 ? this.base.length : (this.levels[l - 1] as Level).size
      i = level.reversed ? parentSize - 1 - i : level.from + i
    }
    return i
  }

  /** The array position an insertion at `position` of the innermost view lands at. */
  positionOf(position: number): number {
    let p = position
    for (let l = this.levels.length - 1; l >= 0; l--) {
      const level = this.levels[l] as Level
      const parentSize = l === 0 ? this.base.length : (this.levels[l - 1] as Level).size
      p = level.reversed ? parentSize - p : level.from + p
    }
    return p
  }

  /** Records a change of size by `delta` at every level. */
  resize(delta: number): void {
    for (const level of this.levels) level.size += delta
  }

  innermost(): number[] {
    const size = (this.levels[this.levels.length - 1] as Level).size
    const out: number[] = []
    for (let i = 0; i < size; i++) out.push(this.base[this.indexOf(i)] as number)
    return out
  }
}

describe('deep chains of list views', () => {
  it('reads, iterates and changes a list through sub-lists nested deep, alternating with reversed views [036 S1-AC9]', () => {
    const inner = 40
    const subLists = DEPTH - Math.floor(DEPTH / 10)
    const base: number[] = []
    for (let i = 0; i < 2 * subLists + inner; i++) base.push(i)
    const list = new ArrayList(base)
    const reference = new ChainReference(base)
    let view: List<number> = list
    for (let l = 0; l < DEPTH; l++) {
      const size = view.size
      if (isReversed(l)) {
        view = view.reversed()
        reference.levels.push({ reversed: true, from: 0, size })
      } else {
        view = view.subList(1, size - 1)
        reference.levels.push({ reversed: false, from: 1, size: size - 2 })
      }
    }
    sameArray(view.toArray(), reference.innermost(), 'innermost view')
    const random = seeded(DEPTH)
    let next = base.length
    for (let step = 0; step < 1_000; step++) {
      const op = integer(random, 0, 3)
      const size = view.size
      if (op === 0 && size > 0) {
        const i = integer(random, 0, size - 1)
        same(view.get(i), base[reference.indexOf(i)], `get(${i})`)
      } else if (op === 1 && size > 0) {
        const i = integer(random, 0, size - 1)
        const value = next++
        same(view.set(i, value), base[reference.indexOf(i)], `set(${i})`)
        base[reference.indexOf(i)] = value
      } else if (op === 2) {
        const value = next++
        base.splice(reference.positionOf(size), 0, value)
        reference.resize(1)
        view.add(value)
      } else if (size > 0) {
        const i = integer(random, 0, size - 1)
        const at = reference.indexOf(i)
        same(view.removeAt(i), base[at], `removeAt(${i})`)
        base.splice(at, 1)
        reference.resize(-1)
      }
      if (step % 100 === 0) {
        sameArray(list.toArray(), base, `the list after step ${step}`)
        sameArray([...view], reference.innermost(), `the innermost view after step ${step}`)
      }
    }
    sameArray(list.toArray(), base, 'the list')
    const seen: number[] = []
    view.forEach((v) => {
      seen.push(v)
    })
    sameArray(seen, reference.innermost(), 'forEach')
    const cursor = view.listCursor()
    const viaCursor: number[] = []
    while (cursor.hasNext()) viaCursor.push(cursor.next())
    sameArray(viaCursor, reference.innermost(), 'cursor')
  })
})

describe('deep chains of read-only views', () => {
  it('stays shallow under alternating unmodifiable wraps, then reads deep sub-list, range and reversed views of them [036 S1-AC10]', () => {
    // Alternating kinds: each wrap takes the latest result its family accepts.
    const tree = new TreeSet<number>()
    for (let i = 0; i < 3 * DEPTH; i++) tree.add(i)
    const wraps = [
      unmodifiableSortedSet,
      unmodifiableSequencedSet,
      unmodifiableSet,
      unmodifiableSequencedCollection,
      unmodifiableCollection,
    ] as Array<(value: never) => unknown>
    let sortedView = unmodifiableSortedSet(tree)
    let sequencedView: unknown = sortedView
    let latest: unknown = sortedView
    for (let i = 0; i < WORST.wraps; i++) {
      const wrap = wraps[i % wraps.length] as (value: never) => unknown
      const input =
        i % wraps.length < 2 ? sortedView : i % wraps.length < 4 ? sequencedView : latest
      latest = wrap(input as never)
      if (i % wraps.length === 0) sortedView = latest as ReadonlySortedSet<number>
      if (i % wraps.length === 1) sequencedView = latest
    }
    const sortedRange: number[] = []
    for (let i = 0; i < 3 * DEPTH; i++) sortedRange.push(i)
    for (const view of [sortedView, sequencedView, latest]) {
      readAll(view as never, sortedRange, 'the wrap results')
      refuses(view as never, COLLECTION_MUTATORS)
    }
    tree.add(3 * DEPTH)
    sortedRange.push(3 * DEPTH)
    readAll(latest as never, sortedRange, "the source's change through the wraps")
    tree.delete(3 * DEPTH)

    // Sub-lists of an unmodifiable list, alternating with reversed views.
    const base: number[] = []
    for (let i = 0; i < 2 * DEPTH + 40; i++) base.push(i)
    const list = new ArrayList(base)
    const reference = new ChainReference(base)
    let listView: ReadonlyList<number> = unmodifiableList(list)
    for (let l = 0; l < DEPTH; l++) {
      const size = listView.size
      if (isReversed(l)) {
        listView = listView.reversed()
        reference.levels.push({ reversed: true, from: 0, size })
      } else {
        listView = listView.subList(1, size - 1)
        reference.levels.push({ reversed: false, from: 1, size: size - 2 })
      }
    }
    readAll(listView, reference.innermost(), 'list views')
    const changed = reference.indexOf(0)
    list.set(changed, -1)
    base[changed] = -1
    same(listView.get(0), -1, "the list's change shows through")
    refuses(listView as never, [
      ...COLLECTION_MUTATORS,
      'addFirst',
      'addLast',
      'removeFirst',
      'removeLast',
      'insert',
      'insertAll',
      'set',
      'removeAt',
      'replaceAll',
      'sort',
    ])

    // Ranges and reversed views of an unmodifiable sorted set and sorted map.
    let setView: ReadonlySortedSet<number> = unmodifiableSortedSet(tree)
    const map = new TreeMap<number, number>()
    for (let i = 0; i < 3 * DEPTH; i++) map.set(i, i)
    let mapView: ReadonlySortedMap<number, number> = unmodifiableSortedMap(map)
    let lo = 0
    let hi = 3 * DEPTH
    let descending = false
    for (let l = 0; l < DEPTH; l++) {
      if (isReversed(l)) {
        setView = setView.reversed()
        mapView = mapView.reversed()
        descending = !descending
      } else if (descending) {
        setView = setView.subSet(hi - 2, lo)
        mapView = mapView.subMap(hi - 2, lo)
        hi--
        lo++
      } else {
        setView = setView.subSet(lo + 1, hi - 1)
        mapView = mapView.subMap(lo + 1, hi - 1)
        lo++
        hi--
      }
    }
    const range: number[] = []
    for (let v = lo; v < hi; v++) range.push(v)
    if (descending) range.reverse()
    readAll(setView, range, 'range views of a sorted set')
    sameArray([...mapView.keys()], range, 'range views of a sorted map')
    tree.delete(range[0] as number)
    map.delete(range[0] as number)
    same(setView.has(range[0] as number), false, "the set's change shows through")
    same(mapView.has(range[0] as number), false, "the map's change shows through")
    refuses(setView as never, [
      ...COLLECTION_MUTATORS,
      'addFirst',
      'addLast',
      'removeFirst',
      'removeLast',
      'pollFirst',
      'pollLast',
    ])
    refuses(mapView as never, [
      'set',
      'put',
      'putAll',
      'delete',
      'remove',
      'replace',
      'replaceAll',
      'getOrInsert',
      'getOrInsertComputed',
      'compute',
      'computeIfPresent',
      'merge',
      'clear',
      'pollFirstEntry',
      'pollLastEntry',
      'putFirst',
      'putLast',
    ])

    // Reversed views of an unmodifiable sequenced collection, taken again and again.
    let sequenced = unmodifiableSequencedCollection(new ArrayList([1, 2, 3]))
    for (let l = 0; l < DEPTH; l++) sequenced = sequenced.reversed()
    readAll(sequenced, DEPTH % 2 === 0 ? [1, 2, 3] : [3, 2, 1], 'reversed sequenced views')
    refuses(sequenced as never, [
      ...COLLECTION_MUTATORS,
      'addFirst',
      'addLast',
      'removeFirst',
      'removeLast',
    ])
  })
})

/** Reads `view` by iteration, `forEach`, `toArray` and a cursor, each against `expected`. */
function readAll(
  view: Iterable<number> & {
    readonly size: number
    toArray(): number[]
    forEach(action: (value: number) => void): void
    cursor(): { hasNext(): boolean; next(): number; remove(): void }
  },
  expected: readonly number[],
  at: string,
): void {
  same(view.size, expected.length, `${at} size`)
  sameArray([...view], expected, `${at} iteration`)
  sameArray(view.toArray(), expected, `${at} toArray`)
  const seen: number[] = []
  view.forEach((v) => {
    seen.push(v)
  })
  sameArray(seen, expected, `${at} forEach`)
  const cursor = view.cursor()
  const viaCursor: number[] = []
  while (cursor.hasNext()) viaCursor.push(cursor.next())
  sameArray(viaCursor, expected, `${at} cursor`)
  expect(() => cursor.remove()).toThrow(UnsupportedOperationError)
}

/** The mutators every collection has. */
const COLLECTION_MUTATORS = [
  'add',
  'addAll',
  'delete',
  'removeAll',
  'retainAll',
  'removeIf',
  'clear',
]

/** Every named mutator throws `UnsupportedOperationError`. */
function refuses(
  view: Record<string, (...args: unknown[]) => unknown>,
  mutators: readonly string[],
): void {
  for (const name of mutators) {
    expect(() => (view[name] as (...args: unknown[]) => unknown).call(view, 0, 0), name).toThrow(
      UnsupportedOperationError,
    )
  }
}

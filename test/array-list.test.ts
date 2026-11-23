import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import { ArrayList } from '../src/collections/array-list'
import * as lib from '../src/index'
import {
  ClassCastError,
  ConcurrentModificationError,
  equals,
  hashCode,
  IllegalArgumentError,
  IllegalStateError,
  IndexOutOfBoundsError,
  NoSuchElementError,
  NullElementError,
  naturalOrder,
  nullsLast,
  reverseOrder,
} from '../src/index'
import type { List } from '../src/interfaces/list'
import { describeCollection } from './contracts/collection'
import { runContractPair } from './contracts/pairs'
import { describeSequencedCollection } from './contracts/sequenced'
import { combine } from './fixtures/structural-list'
import { ALL_LISTS } from './support/list-factories'
import { runListReferenceModel, runReferenceModel } from './support/reference-model'

function caught(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  return undefined
}

const BAD_INDEXES: ReadonlyArray<unknown> = [
  -1,
  1.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  '0',
  null,
  undefined,
  2 ** 53,
  0n,
  new Number(0),
]

describe('ArrayList — read by index', () => {
  it('get returns the element at the index [006 S1-AC1]', () => {
    const list = new ArrayList(['a', 'b', 'c'])
    expect(list.get(0)).toBe('a')
    expect(list.get(2)).toBe('c')
    expect(list.get(-0)).toBe('a')
  })

  it('get throws IndexOutOfBoundsError outside [0, size) or for a non-integer [006 S1-AC2]', () => {
    const list = new ArrayList([1, 2, 3])
    for (const index of [...BAD_INDEXES, 3, 5]) {
      expect(() => list.get(index as number), String(index)).toThrow(IndexOutOfBoundsError)
    }
    expect((caught(() => list.get(5)) as Error).message).toBe(
      'ArrayList.get: index 5 is out of bounds for size 3',
    )
    expect(() => new ArrayList().get(0)).toThrow(IndexOutOfBoundsError)
  })

  it('indexOf returns the lowest SameValueZero match or -1 [006 S1-AC3]', () => {
    const list = new ArrayList<unknown>([1, Number.NaN, 0, 1, Number.NaN])
    expect(list.indexOf(1)).toBe(0)
    expect(list.indexOf(Number.NaN)).toBe(1)
    expect(list.indexOf(-0)).toBe(2)
    expect(list.indexOf(9)).toBe(-1)
    expect(list.indexOf({})).toBe(-1)
  })

  it('lastIndexOf returns the highest SameValueZero match or -1 [006 S1-AC4]', () => {
    const list = new ArrayList<unknown>([1, Number.NaN, 1, Number.NaN])
    expect(list.lastIndexOf(1)).toBe(2)
    expect(list.lastIndexOf(Number.NaN)).toBe(3)
    expect(list.lastIndexOf(2)).toBe(-1)
    expect(new ArrayList().lastIndexOf(undefined)).toBe(-1)
  })

  it('getFirst and getLast return the ends [006 S1-AC5]', () => {
    const list = new ArrayList([4, 5, 6])
    expect(list.getFirst()).toBe(4)
    expect(list.getLast()).toBe(6)
    expect(new ArrayList([7]).getLast()).toBe(7)
  })

  it('getFirst and getLast throw NoSuchElementError when empty [006 S1-AC6]', () => {
    const list = new ArrayList<number>()
    expect(() => list.getFirst()).toThrow(NoSuchElementError)
    expect(() => list.getLast()).toThrow(NoSuchElementError)
    expect((caught(() => list.getFirst()) as Error).message).toBe(
      'ArrayList.getFirst: the list is empty',
    )
  })

  it('checks every index, position and range without coercion before any change [006 S1-AC8]', () => {
    const list = new ArrayList([1, 2, 3])
    const revision = list.revision
    for (const bad of BAD_INDEXES) {
      const index = bad as number
      expect(() => list.set(index, 0), `set ${String(bad)}`).toThrow(IndexOutOfBoundsError)
      expect(() => list.removeAt(index), `removeAt ${String(bad)}`).toThrow(IndexOutOfBoundsError)
      if (bad !== undefined) {
        expect(() => list.insert(index, 0), `insert ${String(bad)}`).toThrow(IndexOutOfBoundsError)
        expect(() => list.insertAll(index, [0]), `insertAll ${String(bad)}`).toThrow(
          IndexOutOfBoundsError,
        )
        expect(() => list.listCursor(index), `listCursor ${String(bad)}`).toThrow(
          IndexOutOfBoundsError,
        )
        expect(() => list.subList(index, 3), `subList from ${String(bad)}`).toThrow(
          IndexOutOfBoundsError,
        )
        // A negative `to` is a valid integer below `from`, which is an IllegalArgumentError.
        expect(() => list.subList(0, index), `subList to ${String(bad)}`).toThrow(
          bad === -1 ? IllegalArgumentError : IndexOutOfBoundsError,
        )
      }
    }
    expect(() => list.insert(undefined as never, 0)).toThrow(IndexOutOfBoundsError)
    expect(list.revision).toBe(revision)
    expect(list.toArray()).toEqual([1, 2, 3])
    expect(list.listCursor().nextIndex()).toBe(0)
    expect(list.listCursor(undefined).nextIndex()).toBe(0)
    expect(list.listCursor(-0).nextIndex()).toBe(0)
    expect(list.insert(-0, 0).toArray()).toEqual([0, 1, 2, 3])
  })
})

describe('ArrayList — change by index and at the ends', () => {
  it('add appends and returns the list [006 S2-AC1]', () => {
    const list = new ArrayList<number>()
    expect(list.add(1)).toBe(list)
    list.add(2).add(3)
    expect(list.toArray()).toEqual([1, 2, 3])
  })

  it('insert puts the element at the position and returns the list [006 S2-AC2]', () => {
    const list = new ArrayList(['a', 'c'])
    expect(list.insert(1, 'b')).toBe(list)
    expect(list.toArray()).toEqual(['a', 'b', 'c'])
    list.insert(0, 'start').insert(4, 'end')
    expect(list.toArray()).toEqual(['start', 'a', 'b', 'c', 'end'])
  })

  it('insert, insertAll, set and removeAt reject invalid indexes and leave the list unchanged [006 S2-AC3]', () => {
    const list = new ArrayList([1, 2])
    const revision = list.revision
    expect(() => list.insert(3, 9)).toThrow(IndexOutOfBoundsError)
    expect(() => list.insert(-1, 9)).toThrow(IndexOutOfBoundsError)
    expect(() => list.insertAll(3, [9])).toThrow(IndexOutOfBoundsError)
    expect(() => list.set(2, 9)).toThrow(IndexOutOfBoundsError)
    expect(() => list.removeAt(2)).toThrow(IndexOutOfBoundsError)
    expect((caught(() => list.insert(7, 0)) as Error).message).toBe(
      'ArrayList.insert: position 7 is out of bounds for size 2',
    )
    const empty = new ArrayList<number>()
    expect(() => empty.set(0, 1)).toThrow(IndexOutOfBoundsError)
    expect(() => empty.removeAt(0)).toThrow(IndexOutOfBoundsError)
    expect(list.toArray()).toEqual([1, 2])
    expect(list.revision).toBe(revision)
  })

  it('set replaces, returns the old element and changes revision without invalidating iterators [006 S2-AC4]', () => {
    const list = new ArrayList(['a', 'b', 'c'])
    const iterator = list[Symbol.iterator]()
    const cursor = list.listCursor()
    expect(iterator.next().value).toBe('a')
    const revision = list.revision
    expect(list.set(1, 'B')).toBe('b')
    expect(list.revision).not.toBe(revision)
    expect(iterator.next().value).toBe('B')
    expect(cursor.next()).toBe('a')
    expect(list.toArray()).toEqual(['a', 'B', 'c'])
  })

  it('removeAt removes and returns the element, shifting later ones down [006 S2-AC5]', () => {
    const list = new ArrayList([10, 20, 30, 40])
    expect(list.removeAt(1)).toBe(20)
    expect(list.toArray()).toEqual([10, 30, 40])
    expect(list.removeAt(2)).toBe(40)
    expect(list.removeAt(0)).toBe(10)
    expect(list.toArray()).toEqual([30])
  })

  it('delete removes the first SameValueZero match and reports it [006 S2-AC6]', () => {
    const list = new ArrayList<unknown>([3, Number.NaN, 3, -0])
    expect(list.delete(3)).toBe(true)
    expect(list.toArray()).toEqual([Number.NaN, 3, -0])
    expect(list.delete(Number.NaN)).toBe(true)
    expect(list.delete(0)).toBe(true)
    expect(list.delete(42)).toBe(false)
    expect(list.toArray()).toEqual([3])
  })

  it('insertAll reads everything first, inserts in order and reports a change [006 S2-AC7]', () => {
    const list = new ArrayList([1, 5])
    expect(list.insertAll(1, new Set([2, 3, 4]))).toBe(true)
    expect(list.toArray()).toEqual([1, 2, 3, 4, 5])
    expect(list.insertAll(0, [])).toBe(false)
    expect(list.insertAll(0, list)).toBe(true)
    expect(list.toArray()).toEqual([1, 2, 3, 4, 5, 1, 2, 3, 4, 5])
    const failure = new Error('stop')
    const throwing = {
      *[Symbol.iterator]() {
        yield 9
        throw failure
      },
    }
    expect(() => list.insertAll(0, throwing)).toThrow(failure)
    expect(list.size).toBe(10)
  })

  it('addFirst and addLast insert at the ends and return the list [006 S2-AC8]', () => {
    const list = new ArrayList([2])
    expect(list.addFirst(1)).toBe(list)
    expect(list.addLast(3)).toBe(list)
    expect(list.toArray()).toEqual([1, 2, 3])
  })

  it('removeFirst and removeLast remove the ends, or throw when empty [006 S2-AC9]', () => {
    const list = new ArrayList([1, 2, 3])
    expect(list.removeFirst()).toBe(1)
    expect(list.removeLast()).toBe(3)
    expect(list.toArray()).toEqual([2])
    list.clear()
    expect(() => list.removeFirst()).toThrow(NoSuchElementError)
    expect(() => list.removeLast()).toThrow(NoSuchElementError)
  })

  it('stores null and undefined like any other element [006 S2-AC10]', () => {
    const list = new ArrayList<unknown>([1])
    list.add(null).add(undefined)
    expect(list.size).toBe(3)
    expect(list.has(null)).toBe(true)
    expect(list.has(undefined)).toBe(true)
    expect(list.indexOf(undefined)).toBe(2)
    expect(list.indexOf(null)).toBe(1)
    expect(list.toArray()).toEqual([1, null, undefined])
  })

  it('insertAll checks the position, then iterability, then refuses a list changed while reading [006 S2-AC13]', () => {
    const list = new ArrayList([1, 2])
    let read = false
    const tracking = {
      [Symbol.iterator]() {
        read = true
        return [9][Symbol.iterator]()
      },
    }
    expect(() => list.insertAll(5, tracking)).toThrow(IndexOutOfBoundsError)
    expect(read).toBe(false)
    expect(() => list.insertAll(5, 3 as never)).toThrow(IndexOutOfBoundsError)
    expect(() => list.insertAll(0, 3 as never)).toThrow(TypeError)
    expect((caught(() => list.insertAll(0, 3 as never)) as Error).message).toBe(
      'ArrayList.insertAll: elements is not iterable (3)',
    )
    const changing = {
      *[Symbol.iterator]() {
        list.add(7)
        yield 8
      },
    }
    expect(() => list.insertAll(0, changing)).toThrow(ConcurrentModificationError)
    expect(list.toArray()).toEqual([1, 2, 7])
  })

  it('removeIf calls predicate(element, index, list) with pre-removal indexes [006 S2-AC14]', () => {
    const list = new ArrayList(['a', 'b', 'c', 'd'])
    const calls: Array<[string, number, unknown]> = []
    expect(
      list.removeIf((element, index, self) => {
        calls.push([element, index, self])
        return index % 2 === 0
      }),
    ).toBe(true)
    expect(calls).toEqual([
      ['a', 0, list],
      ['b', 1, list],
      ['c', 2, list],
      ['d', 3, list],
    ])
    expect(list.toArray()).toEqual(['b', 'd'])
    expect(list.removeIf(() => false)).toBe(false)
  })

  it('removes in bulk in one pass and keeps the order [006 S2-AC12]', () => {
    const list = new ArrayList([1, 2, 3, 2, 1, 4])
    expect(list.removeAll([2, 9])).toBe(true)
    expect(list.toArray()).toEqual([1, 3, 1, 4])
    expect(list.retainAll([1, 4])).toBe(true)
    expect(list.toArray()).toEqual([1, 1, 4])
    expect(list.addAll([5, 6])).toBe(true)
    expect(list.addAll([])).toBe(false)
    list.clear()
    expect(list.isEmpty()).toBe(true)
    const revision = list.revision
    list.clear()
    expect(list.revision).toBe(revision)
  })
})

describe('ArrayList — bulk changes', () => {
  it('replaceAll replaces with op(element, index, list) and keeps iterators valid [006 S3-AC1]', () => {
    const list = new ArrayList([1, 2, 3])
    const iterator = list[Symbol.iterator]()
    iterator.next()
    const revision = list.revision
    const calls: unknown[][] = []
    list.replaceAll((element, index, self) => {
      calls.push([element, index, self])
      return element * 10
    })
    expect(list.toArray()).toEqual([10, 20, 30])
    expect(calls).toEqual([
      [1, 0, list],
      [2, 1, list],
      [3, 2, list],
    ])
    expect(list.revision).not.toBe(revision)
    expect(iterator.next().value).toBe(20)
  })

  it('replaceAll keeps the replacements made before op throws [006 S3-AC2]', () => {
    const list = new ArrayList([1, 2, 3])
    const failure = new Error('stop')
    expect(() =>
      list.replaceAll((n) => {
        if (n === 2) throw failure
        return -n
      }),
    ).toThrow(failure)
    expect(list.toArray()).toEqual([-1, 2, 3])
  })

  it('sort orders by the comparator and is stable [006 S3-AC3]', () => {
    const list = new ArrayList([
      { k: 2, v: 'a' },
      { k: 1, v: 'b' },
      { k: 2, v: 'c' },
      { k: 1, v: 'd' },
    ])
    list.sort((x, y) => x.k - y.k)
    expect(list.toArray().map((e) => e.v)).toEqual(['b', 'd', 'a', 'c'])
    expect(new ArrayList([1, 3, 2]).sort(reverseOrder()).toArray()).toEqual([3, 2, 1])
  })

  it('sort uses natural order without a comparator, passes nulls to a comparator, and returns the list [006 S3-AC4]', () => {
    const words = new ArrayList(['b', 'a', 'B', 'aa'])
    expect(words.sort()).toBe(words)
    expect(words.toArray()).toEqual(['B', 'a', 'aa', 'b'])
    expect(new ArrayList([10, 9, 1]).sort(undefined).toArray()).toEqual([1, 9, 10])
    const seen: unknown[] = []
    const withNulls = new ArrayList<number | null | undefined>([2, undefined, null, 1])
    withNulls.sort((a, b) => {
      seen.push(a, b)
      return nullsLast(naturalOrder<number>())(a, b)
    })
    expect(withNulls.toArray()).toEqual([1, 2, undefined, null])
    expect(seen).toContain(undefined)
    expect(seen).toContain(null)
  })

  it('sort leaves the list unchanged and keeps iterators valid when it throws [006 S3-AC5]', () => {
    const failure = new Error('stop')
    const cases: Array<[unknown[], (list: List<unknown>) => void, unknown]> = [
      [
        [3, 1, 2],
        (l) =>
          l.sort(() => {
            throw failure
          }),
        failure,
      ],
      [[3, 1, 2], (l) => l.sort(() => Number.NaN), TypeError],
      [[3, 1, 2], (l) => l.sort((() => 'x') as never), TypeError],
      [[1, 'a'], (l) => l.sort(), ClassCastError],
      [[1, null, 2], (l) => l.sort(), NullElementError],
      [[1, undefined], (l) => l.sort(), NullElementError],
    ]
    for (const [initial, call, expected] of cases) {
      const list = new ArrayList<unknown>(initial)
      const iterator = list[Symbol.iterator]()
      const revision = list.revision
      const error = caught(() => call(list))
      if (expected instanceof Error) expect(error).toBe(expected)
      else expect(error).toBeInstanceOf(expected as typeof Error)
      expect(list.toArray()).toEqual(initial)
      expect(list.revision).toBe(revision)
      expect(iterator.next().value).toBe(initial[0])
    }
    expect((caught(() => new ArrayList([2, 1]).sort(() => Number.NaN)) as Error).message).toBe(
      'ArrayList.sort: comparator returned NaN',
    )
  })

  it('sort makes at most n·⌈log₂ n⌉ comparator calls and none below two elements [006 S3-AC6]', () => {
    for (const n of [0, 1, 2, 7, 64, 500]) {
      for (const initial of [
        Array.from({ length: n }, (_, i) => (i * 7919) % (n + 1)),
        Array.from({ length: n }, (_, i) => n - i),
        Array.from({ length: n }, () => 3),
      ]) {
        let calls = 0
        new ArrayList(initial).sort((a, b) => {
          calls++
          return a - b
        })
        expect(calls).toBeLessThanOrEqual(n < 2 ? 0 : n * Math.ceil(Math.log2(n)))
      }
    }
  })

  it('a completed sort changes revision and invalidates open iterators, even when nothing moved [006 S3-AC7]', () => {
    for (const initial of [[], [1], [1, 2, 3], [3, 2, 1]]) {
      const list = new ArrayList(initial)
      const iterator = list[Symbol.iterator]()
      const cursor = list.listCursor()
      const revision = list.revision
      list.sort()
      expect(list.revision).not.toBe(revision)
      expect(() => iterator.next()).toThrow(ConcurrentModificationError)
      expect(() => cursor.next()).toThrow(ConcurrentModificationError)
    }
    expect(new ArrayList([null]).sort().toArray()).toEqual([null])
  })

  it('replaceAll and sort reject a non-function before any change [006 S3-AC8]', () => {
    const list = new ArrayList([2, 1])
    const revision = list.revision
    expect(() => list.replaceAll(1 as never)).toThrow(TypeError)
    expect(() => list.sort(null as never)).toThrow(TypeError)
    expect(() => list.sort('x' as never)).toThrow(TypeError)
    expect((caught(() => list.sort(null as never)) as Error).message).toBe(
      'ArrayList.sort: comparator is not a function',
    )
    expect(list.revision).toBe(revision)
    expect(list.toArray()).toEqual([2, 1])
  })

  it('a comparator or op that changes the structure throws ConcurrentModificationError [006 S3-AC9]', () => {
    const list = new ArrayList([3, 2, 1])
    expect(() =>
      list.sort((a, b) => {
        if (list.size === 3) list.add(0)
        return a - b
      }),
    ).toThrow(ConcurrentModificationError)
    expect(list.toArray()).toEqual([3, 2, 1, 0])
    const other = new ArrayList([1, 2, 3])
    expect(() =>
      other.replaceAll((n) => {
        if (n === 2) other.add(9)
        return n * 10
      }),
    ).toThrow(ConcurrentModificationError)
    expect(other.toArray()).toEqual([10, 2, 3, 9])
  })

  it('an inconsistent comparator finishes with a permutation [006 S3-AC10]', () => {
    let state = 1
    const initial = Array.from({ length: 50 }, (_, i) => i)
    const list = new ArrayList(initial)
    let calls = 0
    list.sort(() => {
      calls++
      state = (state * 48271) % 2147483647
      return state % 2 === 0 ? -1 : 1
    })
    expect(list.toArray().sort((a, b) => a - b)).toEqual(initial)
    expect(calls).toBeLessThanOrEqual(50 * Math.ceil(Math.log2(50)))
  })
})

describe('ArrayList — list cursors', () => {
  it('listCursor starts before the given index [006 S4-AC1]', () => {
    const list = new ArrayList([1, 2, 3])
    expect(list.listCursor().next()).toBe(1)
    expect(list.listCursor(2).next()).toBe(3)
    const end = list.listCursor(3)
    expect(end.hasNext()).toBe(false)
    expect(end.previous()).toBe(3)
  })

  it('listCursor rejects a position outside [0, size] [006 S4-AC2]', () => {
    const list = new ArrayList([1, 2])
    expect(() => list.listCursor(3)).toThrow(IndexOutOfBoundsError)
    expect(() => list.listCursor(-1)).toThrow(IndexOutOfBoundsError)
    expect(() => list.listCursor(0.5)).toThrow(IndexOutOfBoundsError)
  })

  it('next and previous move both ways and the index methods report the next positions [006 S4-AC3]', () => {
    const list = new ArrayList(['a', 'b'])
    const cursor = list.listCursor()
    expect([cursor.nextIndex(), cursor.previousIndex()]).toEqual([0, -1])
    expect(cursor.hasPrevious()).toBe(false)
    expect(cursor.next()).toBe('a')
    expect(cursor.next()).toBe('b')
    expect([cursor.nextIndex(), cursor.previousIndex()]).toEqual([2, 1])
    expect(cursor.hasNext()).toBe(false)
    expect(cursor.previous()).toBe('b')
    expect(cursor.previous()).toBe('a')
    expect(cursor.nextIndex()).toBe(0)
    expect(() => cursor.previous()).toThrow(NoSuchElementError)
  })

  it('previous at the start throws NoSuchElementError [006 S4-AC4]', () => {
    const cursor = new ArrayList([1]).listCursor()
    expect(() => cursor.previous()).toThrow(NoSuchElementError)
    expect(() => new ArrayList().listCursor().next()).toThrow(NoSuchElementError)
  })

  it('set replaces the element last returned and keeps other cursors valid [006 S4-AC5]', () => {
    const list = new ArrayList([1, 2, 3])
    const other = list[Symbol.iterator]()
    const cursor = list.listCursor()
    cursor.next()
    cursor.next()
    const revision = list.revision
    cursor.set(20)
    expect(list.revision).not.toBe(revision)
    cursor.previous()
    cursor.set(200)
    expect(list.toArray()).toEqual([1, 200, 3])
    expect(other.next().value).toBe(1)
  })

  it('insert goes before the cursor: next is unaffected and previous returns it [006 S4-AC6]', () => {
    const list = new ArrayList(['a', 'c'])
    const cursor = list.listCursor(1)
    cursor.insert('b')
    expect(cursor.next()).toBe('c')
    cursor.previous()
    expect(cursor.previous()).toBe('b')
    expect(list.toArray()).toEqual(['a', 'b', 'c'])
    const fresh = new ArrayList([1]).listCursor()
    fresh.insert(0)
    expect(fresh.previous()).toBe(0)
  })

  it('set and remove need a move since the last insert or remove [006 S4-AC7]', () => {
    const list = new ArrayList([1, 2, 3])
    const cursor = list.listCursor()
    expect(() => cursor.set(0)).toThrow(IllegalStateError)
    expect(() => cursor.remove()).toThrow(IllegalStateError)
    expect((caught(() => cursor.remove()) as Error).message).toBe(
      'ArrayList.listCursor: remove() called before next()',
    )
    cursor.next()
    cursor.insert(9)
    expect(() => cursor.set(0)).toThrow(IllegalStateError)
    expect(() => cursor.remove()).toThrow(IllegalStateError)
    cursor.next()
    cursor.remove()
    expect(() => cursor.remove()).toThrow(IllegalStateError)
    const back = list.listCursor(list.size)
    back.previous()
    back.set(30)
    expect(list.getLast()).toBe(30)
  })

  it('changes through the cursor keep it valid and invalidate others [006 S4-AC8]', () => {
    const list = new ArrayList([1, 2, 3])
    const cursor = list.listCursor()
    const other = list.listCursor()
    const iterator = list[Symbol.iterator]()
    cursor.next()
    cursor.insert(5)
    cursor.next()
    cursor.remove()
    expect(cursor.next()).toBe(3)
    expect(() => other.next()).toThrow(ConcurrentModificationError)
    expect(() => iterator.next()).toThrow(ConcurrentModificationError)
    expect(list.toArray()).toEqual([1, 5, 3])
  })

  it('remove after previous removes that element and nextIndex becomes its former index [006 S4-AC9]', () => {
    const list = new ArrayList(['a', 'b', 'c'])
    const cursor = list.listCursor(3)
    expect(cursor.previous()).toBe('c')
    expect(cursor.previous()).toBe('b')
    cursor.remove()
    expect(cursor.nextIndex()).toBe(1)
    expect(cursor.next()).toBe('c')
    expect(list.toArray()).toEqual(['a', 'c'])
  })

  it('every moving or changing call checks for outside changes; the index queries never throw [006 S4-AC10]', () => {
    const calls: Array<(c: ReturnType<ArrayList<number>['listCursor']>) => unknown> = [
      (c) => c.next(),
      (c) => c.previous(),
      (c) => c.set(0),
      (c) => c.insert(0),
      (c) => c.remove(),
    ]
    for (const call of calls) {
      const list = new ArrayList([1, 2, 3])
      const cursor = list.listCursor(1)
      cursor.next()
      list.add(4)
      expect(() => call(cursor)).toThrow(ConcurrentModificationError)
      expect(() => [
        cursor.hasNext(),
        cursor.hasPrevious(),
        cursor.nextIndex(),
        cursor.previousIndex(),
      ]).not.toThrow()
    }
  })
})

describe('ArrayList — equality, hashing and output', () => {
  it('equals any list with pairwise-equal elements, using equals(a, b) [006 S7-AC1]', () => {
    const a = new ArrayList<unknown>([1, new ArrayList([2]), Number.NaN])
    const b = new ArrayList<unknown>([1, new ArrayList([2]), Number.NaN])
    expect(a.equals(b)).toBe(true)
    expect(b.equals(a)).toBe(true)
    expect(a.equals(a)).toBe(true)
    expect(a.equals(new ArrayList([1, new ArrayList([3]), Number.NaN]))).toBe(false)
    expect(a.equals(new ArrayList([1]))).toBe(false)
    const view = new ArrayList([0, 1, 2, 3]).subList(1, 3)
    expect(new ArrayList([1, 2]).equals(view)).toBe(true)
    expect(view.equals(new ArrayList([1, 2]))).toBe(true)
    expect(new ArrayList([2, 1]).reversed().equals(new ArrayList([1, 2]))).toBe(true)
    expect(equals(a, b)).toBe(true)
  })

  it('does not equal a non-list [006 S7-AC2]', () => {
    const list = new ArrayList([1, 2])
    for (const other of [[1, 2], new Set([1, 2]), new Map(), { size: 2 }, null, undefined, '1,2']) {
      expect(list.equals(other)).toBe(false)
    }
  })

  it('equal lists hash the same; there is no hashCode method [006 S7-AC3]', () => {
    const a = new ArrayList<unknown>([1, 'x', null, new ArrayList([2])])
    const b = new ArrayList<unknown>([1, 'x', null, new ArrayList([2])])
    expect(hashCode(a)).toBe(hashCode(b))
    expect(hashCode(new ArrayList([1, 2, 3]).subList(0, 2))).toBe(hashCode(new ArrayList([1, 2])))
    expect('hashCode' in a).toBe(false)
    const self = new ArrayList<unknown>()
    self.add(self)
    expect(() => hashCode(self)).not.toThrow()
    expect(self.equals(self)).toBe(true)
  })

  it('forEach calls action(element, index, list) in order with thisArg [006 S7-AC4]', () => {
    const list = new ArrayList(['a', 'b'])
    const seen: unknown[][] = []
    const receiver = {}
    list.forEach(function (this: unknown, element, index, self) {
      seen.push([element, index, self, this])
    }, receiver)
    expect(seen).toEqual([
      ['a', 0, list, receiver],
      ['b', 1, list, receiver],
    ])
    expect(() =>
      list.forEach(() => {
        list.add('c')
      }),
    ).toThrow(ConcurrentModificationError)
  })

  it('prints in Node style', () => {
    const list = new ArrayList<unknown>([1, 'a', null])
    expect(String(list)).toBe("ArrayList(3) [1, 'a', null]")
    expect(inspect(list)).toBe("ArrayList(3) [ 1, 'a', null ]")
    expect(Object.prototype.toString.call(list)).toBe('[object ArrayList]')
    expect(JSON.stringify(list)).toBe('[1,"a",null]')
    const self = new ArrayList<unknown>()
    self.add(self)
    expect(String(self)).toBe('ArrayList(1) [[Circular]]')
  })
})

describe('ArrayList — construct and copy', () => {
  it('holds the elements of an iterable in order [006 S8-AC1]', () => {
    expect(new ArrayList('abc').toArray()).toEqual(['a', 'b', 'c'])
    expect(new ArrayList(new Set([3, 1])).toArray()).toEqual([3, 1])
    expect(ArrayList.from(new Map([[1, 'a']])).toArray()).toEqual([[1, 'a']])
    expect(ArrayList.from([1, 2]).toArray()).toEqual([1, 2])
  })

  it('is empty when given nothing, undefined or null [006 S8-AC2]', () => {
    expect(new ArrayList().size).toBe(0)
    expect(new ArrayList(undefined).size).toBe(0)
    expect(new ArrayList(null).size).toBe(0)
  })

  it('copy is independent and keeps the same element references [006 S8-AC3]', () => {
    const element = { x: 1 }
    const list = new ArrayList([element])
    const copy = list.copy()
    expect(copy).toBeInstanceOf(ArrayList)
    expect(copy).not.toBe(list)
    expect(copy.get(0)).toBe(element)
    copy.add({ x: 2 })
    list.removeAt(0)
    expect(list.size).toBe(0)
    expect(copy.size).toBe(2)
  })

  it('rejects a non-iterable in the constructor and in from [006 S8-AC4]', () => {
    for (const bad of [1, {}, { length: 2, 0: 'a', 1: 'b' }, true, Symbol('s')]) {
      expect(() => new ArrayList(bad as never)).toThrow(TypeError)
      expect(() => ArrayList.from(bad as never)).toThrow(TypeError)
    }
    expect(() => ArrayList.from(null as never)).toThrow(TypeError)
    expect(() => ArrayList.from(undefined as never)).toThrow(TypeError)
    expect((caught(() => ArrayList.from(null as never)) as Error).message).toBe(
      'ArrayList.from: elements is not iterable (null)',
    )
    expect((caught(() => new ArrayList(5 as never)) as Error).message).toBe(
      'ArrayList: elements is not iterable (5)',
    )
  })

  it('from maps with mapFn(element, index) and thisArg, checking mapFn first [006 S8-AC6]', () => {
    const receiver = { factor: 10 }
    const list = ArrayList.from(
      new Set([1, 2]),
      function (this: typeof receiver, n, i) {
        return n * this.factor + i
      },
      receiver,
    )
    expect(list.toArray()).toEqual([10, 21])
    let read = false
    const tracking = {
      [Symbol.iterator]() {
        read = true
        return [1][Symbol.iterator]()
      },
    }
    expect(() => ArrayList.from(tracking, 5 as never)).toThrow(TypeError)
    expect(read).toBe(false)
    expect(ArrayList.from([1], undefined as never).toArray()).toEqual([1])
  })
})

// Contract suites for ArrayList itself.
for (const [name, make] of ALL_LISTS.filter(([kind]) => kind === 'ArrayList')) {
  const peers = ALL_LISTS.map(([, peer]) => peer).filter((peer) => peer !== make)
  describeCollection(name, make as never, {
    iteration: 'fail-fast',
    brackets: 'list',
    replace: (c, index, value) => (c as List<unknown>).set(index, value),
    peers: peers as never,
    structural: { expectedHash: combine },
  })
  describeSequencedCollection(name, make)
}
runContractPair('ArrayList', lib)

describe('ArrayList — reference model', () => {
  it('matches a native array under seeded random operations [006 S8-AC5]', () => {
    for (const seed of [1, 2, 3]) {
      runReferenceModel({ seed, steps: 400, make: () => new ArrayList<number>(), model: 'array' })
      runListReferenceModel({ seed, steps: 400, make: () => new ArrayList<number>() })
    }
  })
})

import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import {
  ArrayList,
  asList,
  ConcurrentModificationError,
  equalsSymbol,
  hashCode,
  type List,
  NullElementError,
  UnsupportedOperationError,
} from '../src/index'
import { describeCollection } from './contracts/collection'
import { describeList } from './contracts/list'
import { describeSequencedCollection } from './contracts/sequenced'
import { combine } from './fixtures/structural-list'

const make = (initial?: Iterable<unknown>): List<unknown> => asList([...(initial ?? [])])
const subLists = (initial?: Iterable<unknown>): List<unknown> => {
  const items = [...(initial ?? [])]
  return asList<unknown>(['<', ...items, '>']).subList(1, 1 + items.length)
}
const reversedLists = (initial?: Iterable<unknown>): List<unknown> =>
  asList<unknown>([...(initial ?? [])].reverse()).reversed()

describe('asList passes the list, sequenced and collection contracts [019 S5-AC5]', () => {
  for (const factory of [make, subLists, reversedLists]) {
    describeCollection('ArrayListView', factory as never, {
      iteration: 'fail-fast',
      brackets: 'list',
      minusZero: 'kept',
      replace: (c, index, value) => (c as List<unknown>).set(index, value),
      structural: { expectedHash: combine },
      peers: [(initial) => new ArrayList<unknown>(initial)],
    })
    describeSequencedCollection('ArrayListView', factory)
    describeList('ArrayListView', factory, [(initial) => new ArrayList<unknown>(initial)])
  }
})

describe('S5 — lists over arrays', () => {
  it('reads the array at each call, with holes as undefined; each call gives an independent list [019 S5-AC1]', () => {
    const array = [1, 2]
    const list = asList(array)
    expect(list.size).toBe(2)
    array[0] = 10
    expect(list.get(0)).toBe(10)
    // biome-ignore lint/suspicious/noSparseArray: holes are the point of this test
    const holes = asList([1, , 3])
    expect(holes.get(1)).toBeUndefined()
    expect(holes.toArray()).toEqual([1, undefined, 3])
    expect(asList(array)).not.toBe(list)
  })

  it('writes every change through to the array and changes revision [019 S5-AC2]', () => {
    const array = [3, 1, 2]
    const list = asList(array)
    let revision = list.revision
    const changed = () => {
      expect(list.revision).not.toBe(revision)
      revision = list.revision
    }
    list.add(4)
    expect(array).toEqual([3, 1, 2, 4])
    changed()
    list.insert(0, 0)
    expect(array).toEqual([0, 3, 1, 2, 4])
    changed()
    expect(list.removeAt(1)).toBe(3)
    expect(array).toEqual([0, 1, 2, 4])
    changed()
    list.set(0, 9)
    expect(array).toEqual([9, 1, 2, 4])
    changed()
    list.sort()
    expect(array).toEqual([1, 2, 4, 9])
    changed()
    list.replaceAll((e) => e * 10)
    expect(array).toEqual([10, 20, 40, 90])
    changed()
    list.subList(1, 3).clear()
    expect(array).toEqual([10, 90])
    changed()
    list.reversed().addFirst(100)
    expect(array).toEqual([10, 90, 100])
    const cursor = list.listCursor()
    cursor.next()
    cursor.remove()
    expect(array).toEqual([90, 100])
    list.clear()
    expect(array).toEqual([])
    // biome-ignore lint/suspicious/noSparseArray: holes are the point of this test
    const holes = [3, , 1]
    asList(holes).sort((a, b) => (a ?? 0) - (b ?? 0))
    expect(holes.length).toBe(3)
  })

  it('treats a direct change of length as structural: revision changes and open iterators, cursors and sub-lists fail fast [019 S5-AC3]', () => {
    const array = [1, 2, 3]
    const list = asList(array)
    const iterator = list[Symbol.iterator]()
    const cursor = list.listCursor()
    const sub = list.subList(0, 2)
    const reversed = list.reversed()
    iterator.next()
    cursor.next()
    const revision = list.revision
    array.push(4)
    expect(list.revision).not.toBe(revision)
    expect(() => iterator.next()).toThrow(ConcurrentModificationError)
    expect(cursor.hasNext()).toBe(true)
    expect(() => cursor.next()).toThrow(ConcurrentModificationError)
    expect(() => sub.size).toThrow(ConcurrentModificationError)
    expect(reversed.getFirst()).toBe(4)

    const growing = [1, 2]
    expect(() =>
      asList(growing).forEach((x) => {
        growing.push(x)
      }),
    ).toThrow(ConcurrentModificationError)
    const replacing = [1, 2]
    expect(() =>
      asList(replacing).replaceAll((x) => {
        replacing.push(x)
        return x
      }),
    ).toThrow(ConcurrentModificationError)
    const removing = [1, 2]
    expect(() =>
      asList(removing).removeIf(() => {
        removing.push(0)
        return false
      }),
    ).toThrow(ConcurrentModificationError)
    const sorting = [2, 1]
    expect(() =>
      asList(sorting).sort((a, b) => {
        sorting.push(0)
        return a - b
      }),
    ).toThrow(ConcurrentModificationError)
    const comparing: unknown[] = []
    const pushing = {
      [equalsSymbol](): boolean {
        comparing.push(0)
        return true
      },
    }
    const twin = {
      [equalsSymbol](): boolean {
        comparing.push(0)
        return true
      },
    }
    comparing.push(pushing)
    expect(() => asList(comparing).equals(new ArrayList<unknown>([twin]))).toThrow(
      ConcurrentModificationError,
    )

    const same = [1, 2]
    const sameList = asList(same)
    const sameRevision = sameList.revision
    const open = sameList[Symbol.iterator]()
    same[0] = 5
    same.reverse()
    expect(sameList.toArray()).toEqual([2, 5])
    expect(sameList.revision).toBe(sameRevision)
    expect(open.next().value).toBe(2)
  })

  it('throws TypeError naming asList for anything that is not an array [019 S5-AC4]', () => {
    for (const value of [
      { length: 1, 0: 'a' },
      new Uint8Array(2),
      'ab',
      null,
      undefined,
      new Set([1]),
    ]) {
      expect(() => asList(value as never)).toThrow(TypeError)
      expect(() => asList(value as never)).toThrow(/^asList: array is not an array/)
    }
    const args = (function (..._rest: unknown[]) {
      // biome-ignore lint/complexity/noArguments: an arguments object is the point of this test
      return arguments
    })(1, 2)
    expect(() => asList(args as never)).toThrow(TypeError)
  })

  it('compares and hashes by the list rules, never equal to the array itself [019 S5-AC5]', () => {
    const array = [1, 'x', null]
    const list = asList(array)
    const peer = new ArrayList<unknown>([1, 'x', null])
    expect(list.equals(peer)).toBe(true)
    expect(peer.equals(list)).toBe(true)
    expect(hashCode(list)).toBe(hashCode(peer))
    expect(list.equals(array)).toBe(false)
    expect(asList([Number.NaN]).indexOf(Number.NaN)).toBe(0)
  })

  it('refuses writes to frozen, sealed and non-extensible arrays before writing anything [019 S5-AC6]', () => {
    const cases: Array<[string, number[], Array<[string, (list: List<number>) => unknown]>]> = [
      [
        'frozen',
        Object.freeze([2, 1]) as number[],
        [
          ['set', (l) => l.set(0, 9)],
          ['add', (l) => l.add(3)],
          ['insert', (l) => l.insert(0, 3)],
          ['insertAll', (l) => l.insertAll(0, [3])],
          ['removeAt', (l) => l.removeAt(0)],
          ['removeIf', (l) => l.removeIf(() => true)],
          ['sort', (l) => l.sort()],
          ['clear', (l) => l.clear()],
          ['replaceAll', (l) => l.replaceAll((x) => x)],
        ],
      ],
      [
        'sealed',
        Object.seal([2, 1]),
        [
          ['add', (l) => l.add(3)],
          ['insert', (l) => l.insert(0, 3)],
          ['insertAll', (l) => l.insertAll(0, [3])],
          ['removeAt', (l) => l.removeAt(0)],
          ['removeIf', (l) => l.removeIf(() => true)],
          ['clear', (l) => l.clear()],
        ],
      ],
      [
        'non-extensible',
        Object.preventExtensions([2, 1]),
        [
          ['add', (l) => l.add(3)],
          ['removeAt', (l) => l.removeAt(1)],
        ],
      ],
    ]
    for (const [kind, array, calls] of cases) {
      const list = asList(array)
      for (const [method, call] of calls) {
        const revision = list.revision
        expect(() => call(list), `${kind} ${method}`).toThrow(
          new RegExp(`^ArrayListView\\.${method}: `),
        )
        expect(list.revision, `${kind} ${method}`).toBe(revision)
        expect([...array], `${kind} ${method}`).toEqual([2, 1])
      }
    }
    const sealed = Object.seal([2, 1])
    const sealedList = asList(sealed)
    sealedList.set(0, 10)
    sealedList.sort()
    expect(sealed).toEqual([1, 10])
  })

  it('refuses a length change made by a sort or replaceAll callback on a locked array [019 S5-AC6]', () => {
    for (const lock of [Object.seal, Object.preventExtensions] as Array<
      (a: number[]) => number[]
    >) {
      const array = lock([3, 1, 2])
      const list = asList(array)
      expect(() =>
        list.replaceAll((e, i) => {
          if (i === 0) list.removeAt(0)
          return e
        }),
      ).toThrow(/^ArrayListView\.removeAt: /)
      expect(() =>
        list.sort((a, b) => {
          list.add(9)
          return a - b
        }),
      ).toThrow(/^ArrayListView\.add: /)
      expect([...array]).toEqual([3, 1, 2])
    }
  })

  it("never calls the array's own methods", () => {
    class Tracking<T> extends Array<T> {
      calls = 0
      override push(...items: T[]): number {
        this.calls++
        return super.push(...items)
      }
      override splice(start: number, deleteCount?: number, ...items: T[]): T[] {
        this.calls++
        return super.splice(start, deleteCount as number, ...items)
      }
    }
    const array = new Tracking<number>()
    array[0] = 1
    const list = asList(array)
    list.add(2)
    list.insert(0, 0)
    list.removeAt(1)
    expect([...array]).toEqual([0, 2])
    expect(array.calls).toBe(0)
  })

  it('prints as ArrayListView, names it in errors, copies on toJSON, and costs O(1) for get and set [019 S5-AC7]', () => {
    const array = [1, 2, 3]
    const list = asList(array)
    expect(String(list)).toBe('ArrayListView(3) [1, 2, 3]')
    expect(String(list.subList(0, 1))).toBe('ArrayListView(1) [1]')
    expect(String(list.reversed())).toBe('ArrayListView(3) [3, 2, 1]')
    expect(inspect(list)).toBe('ArrayListView(3) [ 1, 2, 3 ]')
    expect(() => list.get(5)).toThrow(/^ArrayListView\.get: /)
    const sub = list.subList(0, 1)
    array.push(4)
    expect(() => sub.size).toThrow(/^ArrayListView: /)
    expect(list.toJSON()).not.toBe(array)
    expect(list.toJSON()).toEqual([1, 2, 3, 4])
    const touched: string[] = []
    const counted = new Proxy(
      Array.from({ length: 1000 }, (_, i) => i),
      {
        get(target, property, receiver) {
          if (typeof property === 'string' && /^\d+$/.test(property)) touched.push(property)
          return Reflect.get(target, property, receiver)
        },
        set(target, property, value, receiver) {
          if (typeof property === 'string' && /^\d+$/.test(property)) touched.push(`=${property}`)
          return Reflect.set(target, property, value, receiver)
        },
      },
    )
    const big = asList(counted)
    expect(big.get(500)).toBe(500)
    expect(touched).toEqual(['500'])
    touched.length = 0
    big.set(500, -1)
    expect(touched).toEqual(['500', '=500'])
  })

  it('sorts by the list rules: stable, natural order refuses undefined and holes, a comparator gets them as undefined [019 S5-AC8]', () => {
    expect(() => asList([2, undefined, 1]).sort()).toThrow(NullElementError)
    // biome-ignore lint/suspicious/noSparseArray: holes are the point of this test
    expect(() => asList([2, , 1]).sort()).toThrow(NullElementError)
    const seen: unknown[] = []
    // biome-ignore lint/suspicious/noSparseArray: holes are the point of this test
    asList([2, , 1]).sort((a, b) => {
      seen.push(a, b)
      return (a ?? 0) - (b ?? 0)
    })
    expect(seen).toContain(undefined)
    const pairs = [
      { k: 1, n: 'a' },
      { k: 0, n: 'b' },
      { k: 1, n: 'c' },
    ]
    asList(pairs).sort((x, y) => x.k - y.k)
    expect(pairs.map((p) => p.n)).toEqual(['b', 'a', 'c'])
    expect(caughtClass(() => asList([1]).sort('x' as never))).toBe(TypeError)
  })
})

function caughtClass(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return (error as Error).constructor
  }
  return undefined
}

describe('asList is a plain list, not a read-only one', () => {
  it('has no refusals', () => {
    const list = asList<number>([])
    expect(() => list.add(1)).not.toThrow(UnsupportedOperationError)
  })
})

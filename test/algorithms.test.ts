import { describe, expect, it } from 'vitest'
import {
  ArrayDeque,
  ArrayList,
  asList,
  binarySearch,
  ClassCastError,
  ConcurrentModificationError,
  compareSymbol,
  disjoint,
  fill,
  frequency,
  HashMap,
  HashSet,
  IllegalArgumentError,
  IndexOutOfBoundsError,
  indexOfSubList,
  LinkedList,
  type List,
  lastIndexOfSubList,
  listOf,
  max,
  min,
  NullElementError,
  nullsFirst,
  type ReadonlyList,
  reverse,
  rotate,
  shuffle,
  sortedIndex,
  swap,
  TreeSet,
  UnsupportedOperationError,
  unmodifiableList,
} from '../src/index'
import { caught } from './contracts/readonly-collection'
import { seeded } from './support/random'

/** A reference lower bound over a sorted array. */
function lowerBound(sorted: number[], key: number): number {
  let i = 0
  while (i < sorted.length && (sorted[i] as number) < key) i++
  return i
}

/** Wraps `list` so every `get` is counted. */
function countingGets<E>(list: List<E>): [List<E>, () => number] {
  let gets = 0
  const proxy = new Proxy(list, {
    get(target, property, receiver) {
      if (property === 'get') gets++
      return Reflect.get(target, property, receiver)
    },
  })
  return [proxy, () => gets]
}

describe('S1 — search', () => {
  it('sortedIndex returns the lower bound on a sorted list [020 S1-AC1]', () => {
    const sorted = [1, 3, 3, 3, 7, 9]
    const list = asList(sorted.slice())
    for (let key = 0; key <= 10; key++) {
      expect(sortedIndex(list, key), `key ${key}`).toBe(lowerBound(sorted, key))
    }
    expect(sortedIndex(new ArrayList<number>(), 5)).toBe(0)
    const descending = new ArrayList([9, 7, 3, 1])
    expect(sortedIndex(descending, 4, (a, b) => b - a)).toBe(2)
  })

  it('binarySearch returns the first matching index, or -1 [020 S1-AC2]', () => {
    const list = asList([1, 3, 3, 3, 7, 9])
    expect(binarySearch(list, 3)).toBe(1)
    expect(binarySearch(list, 9)).toBe(5)
    expect(binarySearch(list, 1)).toBe(0)
    expect(binarySearch(list, 4)).toBe(-1)
    expect(binarySearch(list, 10)).toBe(-1)
    expect(binarySearch(new ArrayList<number>(), 1)).toBe(-1)
    const words = new ArrayList(['b', 'C', 'd'])
    const caseless = (a: string, b: string) =>
      a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0
    expect(binarySearch(words, 'c', caseless)).toBe(1)
  })

  it('searches with at most ceil(log2(n + 1)) comparisons and gets, one more for binarySearch [020 S1-AC3]', () => {
    for (const n of [1, 2, 3, 7, 8, 100, 1000]) {
      const bound = Math.ceil(Math.log2(n + 1))
      const [list, gets] = countingGets(new ArrayList(Array.from({ length: n }, (_, i) => i * 2)))
      for (const key of [-1, 0, n, n * 2, n * 3]) {
        let calls = 0
        const before = gets()
        sortedIndex(list, key, (a, b) => {
          calls++
          return a - b
        })
        expect(calls, `sortedIndex n=${n} key=${key}`).toBeLessThanOrEqual(bound)
        expect(gets() - before).toBeLessThanOrEqual(bound)
        calls = 0
        const beforeSearch = gets()
        binarySearch(list, key, (a, b) => {
          calls++
          return a - b
        })
        expect(calls, `binarySearch n=${n} key=${key}`).toBeLessThanOrEqual(bound + 1)
        expect(gets() - beforeSearch).toBeLessThanOrEqual(bound + 1)
      }
    }
  })

  it('finds runs of elements with SameValueZero, on any list and view [020 S1-AC4]', () => {
    const source = asList<unknown>([1, Number.NaN, 2, 1, Number.NaN, 2])
    expect(indexOfSubList(source, listOf(Number.NaN, 2))).toBe(1)
    expect(lastIndexOfSubList(source, listOf(Number.NaN, 2))).toBe(4)
    expect(indexOfSubList(source, listOf(3))).toBe(-1)
    expect(lastIndexOfSubList(source, listOf(2, 3))).toBe(-1)
    expect(indexOfSubList(source, listOf())).toBe(0)
    expect(lastIndexOfSubList(source, listOf())).toBe(6)
    expect(indexOfSubList(listOf(1), listOf(1, 2))).toBe(-1)
    const view = new ArrayList([0, 0, 5, 6, 0]).subList(1, 5)
    expect(indexOfSubList(view, unmodifiableList(new ArrayList([5, 6])))).toBe(1)
    expect(indexOfSubList(asList([-0]), listOf(0))).toBe(0)
  })

  it('reports comparator and natural-order errors from comparisons made [020 S1-AC5]', () => {
    const list = new ArrayList([1, 2, 3])
    const failure = new Error('compare failed')
    expect(
      caught(() =>
        binarySearch(list, 2, () => {
          throw failure
        }),
      ),
    ).toBe(failure)
    expect(() => sortedIndex(list, 2, () => Number.NaN)).toThrow(TypeError)
    expect(() => binarySearch(list, 2, (() => 'x') as never)).toThrow(
      /^binarySearch: comparator returned/,
    )
    expect(() => binarySearch(list, null as never)).toThrow(NullElementError)
    expect(() => sortedIndex(new ArrayList<unknown>([1, undefined]), 2)).toThrow(NullElementError)
    expect(() => binarySearch(list, 'a' as never)).toThrow(ClassCastError)
    expect(sortedIndex(new ArrayList<unknown>(), null)).toBe(0)
    expect(sortedIndex(new ArrayList<unknown>([null, 1, 2]), 1, nullsFirst())).toBe(1)
    expect(() => min([1, 2], () => Number.NaN)).toThrow(TypeError)
    expect(() => max([1, null])).toThrow(NullElementError)
    expect(() => min([1, 'a'] as unknown[])).toThrow(ClassCastError)
    expect(min([null])).toBeNull()
    expect(list.toArray()).toEqual([1, 2, 3])
  })

  it('throws ConcurrentModificationError when a comparison changes the list, before checking its result [020 S1-AC6]', () => {
    const list = new ArrayList([1, 2, 3, 4])
    expect(() =>
      binarySearch(list, 3, (a, b) => {
        list.set(0, 1)
        return a - b
      }),
    ).toThrow('binarySearch: the list was changed by the comparator')
    expect(() =>
      sortedIndex(list, 3, () => {
        list.add(5)
        return Number.NaN
      }),
    ).toThrow(ConcurrentModificationError)
    class Box {
      constructor(readonly n: number) {}
      [compareSymbol](other: Box): number {
        boxes.add(new Box(0))
        return this.n - other.n
      }
    }
    const boxes = new ArrayList([new Box(1), new Box(2)])
    expect(() => binarySearch(boxes, new Box(2))).toThrow(ConcurrentModificationError)
    class BadBox {
      [compareSymbol](): number {
        badBoxes.add(new BadBox())
        return Number.NaN
      }
    }
    const badBoxes = new ArrayList([new BadBox(), new BadBox()])
    expect(() => sortedIndex(badBoxes, new BadBox())).toThrow(ConcurrentModificationError)
    const source = new ArrayList([1, 2, 3])
    const view = unmodifiableList(source)
    expect(() =>
      binarySearch(view, 2, (a, b) => {
        source.add(4)
        return a - b
      }),
    ).toThrow(ConcurrentModificationError)
  })
})

describe('S2 — rearrange', () => {
  it('reverses in place in O(n) [020 S2-AC1]', () => {
    for (const items of [[], [1], [1, 2], [1, 2, 3], [1, 2, 3, 4]]) {
      const list = new ArrayList(items)
      reverse(list)
      expect(list.toArray()).toEqual(items.slice().reverse())
    }
    const array = [1, 2, 3]
    reverse(asList(array))
    expect(array).toEqual([3, 2, 1])
    const sub = new ArrayList([0, 1, 2, 3, 9])
    reverse(sub.subList(1, 4))
    expect(sub.toArray()).toEqual([0, 3, 2, 1, 9])
  })

  it('swaps two elements, checks both indexes first, and writes nothing for the same index [020 S2-AC2]', () => {
    const list = new ArrayList(['a', 'b', 'c'])
    swap(list, 0, 2)
    expect(list.toArray()).toEqual(['c', 'b', 'a'])
    const revision = list.revision
    swap(list, 1, 1)
    expect(list.revision).toBe(revision)
    expect(() => swap(list, 0, 3)).toThrow(IndexOutOfBoundsError)
    expect(() => swap(list, -1, 0)).toThrow(/^swap: /)
    expect(() => swap(list, 0, 1.5)).toThrow(IndexOutOfBoundsError)
    expect(list.toArray()).toEqual(['c', 'b', 'a'])
  })

  it('rotates by any safe integer with a mathematical mod, and rejects bad distances [020 S2-AC3]', () => {
    for (const n of [0, 1, 2, 5]) {
      const items = Array.from({ length: n }, (_, i) => i)
      for (let d = -3 * n - 1; d <= 3 * n + 1; d++) {
        const list = new ArrayList(items)
        rotate(list, d)
        const expected = items.map((_, i) => items[(((i - d) % n) + n) % n])
        expect(list.toArray(), `n=${n} d=${d}`).toEqual(n === 0 ? [] : expected)
      }
    }
    const list = new ArrayList([1, 2, 3])
    rotate(list, Number.MAX_SAFE_INTEGER) // MAX_SAFE_INTEGER mod 3 is 1
    expect(list.toArray()).toEqual([3, 1, 2])
    rotate(list, -Number.MAX_SAFE_INTEGER)
    expect(list.toArray()).toEqual([1, 2, 3])
    const revision = list.revision
    rotate(list, -0)
    expect(list.revision).toBe(revision)
    expect(() => rotate(list, '1' as never)).toThrow(TypeError)
    expect(() => rotate(list, 1n as never)).toThrow(TypeError)
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 1.5, 2 ** 53]) {
      expect(() => rotate(list, bad)).toThrow(IllegalArgumentError)
    }
    expect(() => rotate(new ArrayList(), Number.NaN)).toThrow(IllegalArgumentError)
  })

  it('shuffles the same way for the same seed, calling random size − 1 times [020 S2-AC4]', () => {
    const run = (seed: number) => {
      const list = new ArrayList(Array.from({ length: 20 }, (_, i) => i))
      let calls = 0
      const random = seeded(seed)
      shuffle(list, () => {
        calls++
        return random()
      })
      return [list.toArray(), calls] as const
    }
    const [first, calls] = run(42)
    const [second] = run(42)
    expect(first).toEqual(second)
    expect(calls).toBe(19)
    expect([...first].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i))
    let none = 0
    shuffle(new ArrayList([1]), () => {
      none++
      return 0
    })
    shuffle(new ArrayList(), () => {
      none++
      return 0
    })
    expect(none).toBe(0)
    const writes: number[] = []
    const list = new ArrayList([1, 2])
    const watched = new Proxy(list, {
      get(target, property, receiver) {
        if (property === 'set')
          return (i: number, e: number) => {
            writes.push(i)
            return target.set(i, e)
          }
        return Reflect.get(target, property, receiver)
      },
    })
    shuffle(watched, () => 0.99)
    expect(writes).toEqual([1, 1])
  })

  it('produces every permutation uniformly (chi-squared below 20.515 over 60,000 runs) [020 S2-AC5]', () => {
    const random = seeded(1)
    const counts = new Map<string, number>()
    for (let run = 0; run < 60_000; run++) {
      const list = new ArrayList(['a', 'b', 'c'])
      shuffle(list, random)
      const key = list.toArray().join('')
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    expect(counts.size).toBe(6)
    const expected = 10_000
    let chi = 0
    for (const count of counts.values()) chi += (count - expected) ** 2 / expected
    expect(chi).toBeLessThan(20.515)
  })

  it('rejects bad random values before the swap they drive, keeping earlier swaps [020 S2-AC6]', () => {
    for (const [bad, error] of [
      ['0.5', TypeError],
      [Number.NaN, IllegalArgumentError],
      [1, IllegalArgumentError],
      [-0.1, IllegalArgumentError],
    ] as const) {
      const list = new ArrayList([1, 2, 3, 4])
      let calls = 0
      expect(() =>
        shuffle(list, () => {
          calls++
          return (calls === 1 ? 0 : bad) as number
        }),
      ).toThrow(error)
      expect(list.toArray()).toEqual([4, 2, 3, 1]) // the first swap stays
    }
    const zero = new ArrayList([1, 2])
    shuffle(zero, () => -0)
    expect(zero.toArray()).toEqual([2, 1])
  })

  it('fills every position without changing the size [020 S2-AC7]', () => {
    const list = new ArrayList([1, 2, 3])
    fill(list, 0)
    expect(list.toArray()).toEqual([0, 0, 0])
    const array = [1, 2]
    fill(asList(array), 9)
    expect(array).toEqual([9, 9])
    const empty = new ArrayList<number>()
    fill(empty, 1)
    expect(empty.size).toBe(0)
  })

  it('writes only through set: open iterators stay valid; revision changes only when something is written [020 S2-AC8]', () => {
    const list = new ArrayList([1, 2, 3, 4])
    const iterator = list[Symbol.iterator]()
    iterator.next()
    reverse(list)
    rotate(list, 1)
    shuffle(list, seeded(3))
    fill(list, 0)
    expect(iterator.next()).toEqual({ done: false, value: 0 })
    const changes: Array<[string, (l: ArrayList<number>) => void, number[], boolean]> = [
      ['reverse', (l) => reverse(l), [1, 2], true],
      ['reverse one', (l) => reverse(l), [1], false],
      ['rotate', (l) => rotate(l, 1), [1, 2], true],
      ['rotate by size', (l) => rotate(l, 4), [1, 2, 3, 4], false],
      ['rotate one', (l) => rotate(l, 3), [1], false],
      ['shuffle', (l) => shuffle(l, () => 0.99), [1, 2], true],
      ['shuffle one', (l) => shuffle(l), [1], false],
      ['fill', (l) => fill(l, 1), [1], true],
      ['fill empty', (l) => fill(l, 1), [], false],
      ['swap', (l) => swap(l, 0, 1), [1, 2], true],
      ['swap same', (l) => swap(l, 0, 0), [1, 2], false],
    ]
    for (const [label, change, items, writes] of changes) {
      const target = new ArrayList(items)
      const revision = target.revision
      change(target)
      expect(target.revision !== revision, label).toBe(writes)
    }
  })

  it('throws ConcurrentModificationError when random changes the list [020 S2-AC9]', () => {
    const list = new ArrayList([1, 2, 3])
    expect(() =>
      shuffle(list, () => {
        list.set(0, 1)
        return 0.5
      }),
    ).toThrow('shuffle: the list was changed by random')
    expect(() =>
      shuffle(list, () => {
        list.add(9)
        return 2
      }),
    ).toThrow(ConcurrentModificationError)
  })
})

describe('S3 — inspect', () => {
  it('returns the first least or greatest element, undefined when empty, one element without comparing [020 S3-AC1]', () => {
    const a = { k: 1, n: 'a' }
    const b = { k: 1, n: 'b' }
    const c = { k: 0, n: 'c' }
    const byK = (x: { k: number }, y: { k: number }) => x.k - y.k
    expect(min([a, b, c], byK)).toBe(c)
    expect(max([a, b, c], byK)).toBe(a)
    expect(min([a, b], byK)).toBe(a)
    expect(max([c, a, b], byK)).toBe(a)
    expect(min([])).toBeUndefined()
    expect(max(new HashSet())).toBeUndefined()
    expect(min([{}])).toEqual({})
    expect(min([undefined])).toBeUndefined()
    expect(max(new TreeSet([5, 1, 3]))).toBe(5)
    expect(min('cab')).toBe('a')
  })

  it('handles 1,000,000 elements without a stack overflow, in n − 1 comparisons [020 S3-AC2]', () => {
    const many = Array.from({ length: 1_000_000 }, (_, i) => (i * 7919) % 1_000_003)
    let calls = 0
    const smallest = min(many, (x, y) => {
      calls++
      return x - y
    })
    expect(smallest).toBe(0)
    expect(calls).toBe(999_999)
    let greatest = -1
    for (const value of many) if (value > greatest) greatest = value
    expect(max(many)).toBe(greatest)
    let one = 0
    min([1], () => {
      one++
      return 0
    })
    expect(one).toBe(0)
  })

  it('counts SameValueZero-equal elements, whatever the collection compares by [020 S3-AC3]', () => {
    expect(frequency([1, Number.NaN, Number.NaN, -0, 0], Number.NaN)).toBe(2)
    expect(frequency([1, -0, 0], 0)).toBe(2)
    expect(frequency(new ArrayList(['a', 'b', 'a']), 'a')).toBe(2)
    const caseless = new HashSet(['Ann'], { key: (s: string) => s.toLowerCase() })
    expect(caseless.has('ann')).toBe(true)
    expect(frequency(caseless, 'ann')).toBe(0)
  })

  it('decides disjointness with b.has, then a.has, then SameValueZero [020 S3-AC4]', () => {
    expect(disjoint([1, 2], [3, 4])).toBe(true)
    expect(disjoint([1, Number.NaN], [Number.NaN])).toBe(false)
    expect(disjoint(new HashSet([1]), [2])).toBe(true)
    const keyed = new HashSet(['A'], { key: (s: string) => s.toLowerCase() })
    expect(disjoint(['a'], keyed)).toBe(false) // keyed decides
    expect(disjoint(keyed, ['a'])).toBe(false) // a is a collection, b is not: keyed decides
    const plain = new HashSet(['a'])
    expect(disjoint(keyed, plain)).toBe(true) // plain decides: 'A' is not in plain
    expect(disjoint(plain, keyed)).toBe(false) // keyed decides
    const map = new HashMap([['a', 1]])
    expect(disjoint(map, ['a'])).toBe(true) // entries, not keys
    expect(disjoint(map.keys(), ['a'])).toBe(false)
    const failure = new Error('compare failed')
    const throwing = new TreeSet<number>([1], {
      comparator: () => {
        throw failure
      },
    })
    expect(caught(() => disjoint([2], throwing))).toBe(failure)
    let lookups = 0
    const counted = new HashSet(Array.from({ length: 1000 }, (_, i) => i))
    const spy = new Proxy(counted, {
      get(target, property, receiver) {
        if (property === 'has') lookups++
        return Reflect.get(target, property, receiver)
      },
    })
    disjoint(
      Array.from({ length: 1000 }, (_, i) => i + 5000),
      spy,
    )
    expect(lookups).toBeLessThanOrEqual(1001)
  })

  it("lets a fail-fast collection's own error propagate when user code changes it [020 S3-AC5]", () => {
    const list = new ArrayList([3, 1, 2])
    expect(() =>
      min(list, (a, b) => {
        list.add(0)
        return a - b
      }),
    ).toThrow(ConcurrentModificationError)
    const set = new TreeSet([1, 2, 3])
    const others = new HashSet<number>()
    const changer = new Proxy(others, {
      get(target, property, receiver) {
        if (property === 'has') {
          return (value: number) => {
            if (value === 1) set.add(10)
            return target.has(value)
          }
        }
        return Reflect.get(target, property, receiver)
      },
    })
    expect(() => disjoint(set, changer)).toThrow(ConcurrentModificationError)
  })
})

describe('S4 — arguments and read-only lists', () => {
  it('rejects wrong arguments with TypeError naming the function, before reading or calling anything [020 S4-AC1]', () => {
    let used = false
    const spyComparator = () => {
      used = true
      return 0
    }
    const spyIterable = {
      [Symbol.iterator]() {
        used = true
        return [1][Symbol.iterator]()
      },
    }
    const list = new ArrayList([1, 2])
    const cases: Array<[string, () => unknown]> = [
      ['binarySearch', () => binarySearch([1] as never, 1, spyComparator)],
      ['sortedIndex', () => sortedIndex(null as never, 1, 'bad' as never)],
      ['sortedIndex', () => sortedIndex(new ArrayDeque([1]) as never, 1)],
      ['reverse', () => reverse(new LinkedList([1]) as never)],
      ['rotate', () => rotate(new HashSet([1]) as never, 1)],
      ['shuffle', () => shuffle(list, null as never)],
      ['shuffle', () => shuffle(list, 5 as never)],
      ['swap', () => swap({} as never, 0, 1)],
      ['fill', () => fill(null as never, 1)],
      ['min', () => min(5 as never)],
      ['max', () => max(spyIterable, 'x' as never)],
      ['frequency', () => frequency(null as never, 1)],
      ['disjoint', () => disjoint(spyIterable, 5 as never)],
      ['indexOfSubList', () => indexOfSubList(list, [1] as never)],
      ['lastIndexOfSubList', () => lastIndexOfSubList([1] as never, list)],
      ['binarySearch', () => binarySearch(list, 1, null as never)],
      ['sortedIndex', () => sortedIndex(list, 1, 'x' as never)],
    ]
    for (const [name, call] of cases) {
      const error = caught(call)
      expect(error, name).toBeInstanceOf(TypeError)
      expect((error as Error).message.startsWith(`${name}: `), (error as Error).message).toBe(true)
    }
    expect(used).toBe(false)
    expect(() => sortedIndex(null as never, 1, 'bad' as never)).toThrow(/is not a list/)
    expect(() => rotate(5 as never, Number.NaN)).toThrow(TypeError) // list checked before distance
    expect(() => swap(null as never, 9, 9)).toThrow(TypeError)
    shuffle(new ArrayList([1, 2]), undefined)
  })

  it('reads immutable lists, views and other read-only collections like mutable ones [020 S4-AC2]', () => {
    const lists: ReadonlyList<number>[] = [
      listOf(1, 3, 5, 7),
      unmodifiableList(new ArrayList([1, 3, 5, 7])),
      asList(Object.freeze([1, 3, 5, 7]) as number[]),
    ]
    for (const list of lists) {
      expect(binarySearch(list, 5)).toBe(2)
      expect(sortedIndex(list, 4)).toBe(2)
      expect(indexOfSubList(list, listOf(3, 5))).toBe(1)
      expect(lastIndexOfSubList(list, listOf(7))).toBe(3)
      expect(min(list)).toBe(1)
      expect(max(list)).toBe(7)
      expect(frequency(list, 3)).toBe(1)
      expect(disjoint(list, [2, 4])).toBe(true)
    }
  })

  it("lets a read-only list's own refusal propagate, only when a write would happen [020 S4-AC3]", () => {
    const immutable = listOf(1, 2, 3) as never as List<number>
    for (const change of [
      () => reverse(immutable),
      () => rotate(immutable, 1),
      () => swap(immutable, 0, 1),
      () => fill(immutable, 0),
    ]) {
      expect(change).toThrow(UnsupportedOperationError)
    }
    expect(immutable.toArray()).toEqual([1, 2, 3])
    let calls = 0
    expect(() =>
      shuffle(immutable, () => {
        calls++
        return 0
      }),
    ).toThrow(UnsupportedOperationError)
    expect(calls).toBe(1)
    const frozen = asList(Object.freeze([1, 2]) as number[])
    expect(() => reverse(frozen)).toThrow(TypeError)
    const single = listOf(1) as never as List<number>
    expect(() => reverse(single)).not.toThrow()
    expect(() => rotate(single, 5)).not.toThrow()
    expect(() => shuffle(single)).not.toThrow()
    expect(() => swap(single, 0, 0)).not.toThrow()
    expect(() => fill(listOf() as never as List<number>, 1)).not.toThrow()
  })
})

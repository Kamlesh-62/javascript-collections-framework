import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import { ArrayList } from '../src/collections/array-list'
import { HashMap } from '../src/collections/hash-map'
import { HashSet } from '../src/collections/hash-set'
import { TreeSet } from '../src/collections/tree-set'
import {
  ClassCastError,
  type Comparator,
  ConcurrentModificationError,
  compareSymbol,
  equals,
  hashCode,
  hashCodeSymbol,
  IllegalArgumentError,
  NoSuchElementError,
  NullElementError,
  naturalOrder,
  nullsFirst,
  UnsupportedOperationError,
} from '../src/index'
import { type CollectionFactory, describeCollection } from './contracts/collection'
import { describeSequencedCollection } from './contracts/sequenced'
import { describeSequencedSet } from './contracts/sequenced-set'
import { describeSetCollection } from './contracts/set'
import { describeSortedSet } from './contracts/sorted-set'
import { integer, seeded } from './support/random'
import { runSortedSetReferenceModel } from './support/reference-model'

function caught(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  return undefined
}

const ascending = (a: number, b: number): number => a - b
const descending = (a: number, b: number): number => b - a

/** A comparator that counts its calls. */
function counting<T>(compare: Comparator<T>): { comparator: Comparator<T>; calls: () => number } {
  let calls = 0
  return {
    comparator: (a, b) => {
      calls++
      return compare(a, b)
    },
    calls: () => calls,
  }
}

/** A value ordered by `[compareSymbol]`, counting every call made through the protocol. */
class Ranked {
  static calls = 0
  constructor(readonly rank: number) {}
  [compareSymbol](other: Ranked): number {
    Ranked.calls++
    return this.rank - other.rank
  }
}

/** The comparison bound for one search in a set of `n` members: 2⌈log2(n + 1)⌉ + 2. */
function bound(n: number): number {
  return 2 * Math.ceil(Math.log2(n + 1)) + 2
}

/** Sorted, reverse-sorted, alternating and seeded random sequences of `n` distinct numbers. */
function sequences(n: number, seed: number): Array<[string, number[]]> {
  const sorted = Array.from({ length: n }, (_, i) => i)
  const random = seeded(seed)
  const shuffled = sorted.slice()
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = integer(random, 0, i)
    const t = shuffled[i] as number
    shuffled[i] = shuffled[j] as number
    shuffled[j] = t
  }
  const alternating: number[] = []
  for (let lo = 0, hi = n - 1; lo <= hi; lo++, hi--) {
    alternating.push(lo)
    if (lo !== hi) alternating.push(hi)
  }
  return [
    ['sorted', sorted],
    ['reverse', sorted.slice().reverse()],
    ['alternating', alternating],
    ['random', shuffled],
  ]
}

/** A snapshot of what a failed call must leave untouched. */
function state<E>(set: TreeSet<E>): { members: E[]; size: number; revision: number } {
  return { members: set.toArray(), size: set.size, revision: set.revision }
}

describe('TreeSet — sorted membership', () => {
  it('iterates members added in any order in ascending order of the comparator [015 S1-AC1]', () => {
    const random = seeded(11)
    const values = Array.from({ length: 300 }, () => integer(random, -200, 200))
    const unique = [...new Set(values)]
    const natural = new TreeSet<number>()
    const reversed = new TreeSet<number>({ comparator: descending })
    for (const v of values) {
      natural.add(v)
      reversed.add(v)
    }
    expect([...natural]).toEqual(unique.slice().sort(ascending))
    expect([...reversed]).toEqual(unique.slice().sort(descending))
    expect([...new TreeSet(['pear', 'apple', 'fig'])]).toEqual(['apple', 'fig', 'pear'])
    const dates = new TreeSet([new Date(3), new Date(1), new Date(2)])
    expect([...dates].map((d) => d.getTime())).toEqual([1, 2, 3])
    expect([...new TreeSet([new Ranked(2), new Ranked(1)])].map((r) => r.rank)).toEqual([1, 2])
  })

  it('adds unless a member compares equal, keeps the existing member and returns the set [015 S1-AC2]', () => {
    const byLength = new TreeSet<string>({ comparator: (a, b) => a.length - b.length })
    expect(byLength.add('bb')).toBe(byLength)
    const revision = byLength.revision
    expect(byLength.add('cc')).toBe(byLength)
    expect(byLength.revision).toBe(revision)
    expect(byLength.toArray()).toEqual(['bb'])
    byLength.add('a').add('dddd')
    expect(byLength.toArray()).toEqual(['a', 'bb', 'dddd'])
  })

  it('decides has, delete, removeAll and retainAll by the comparator, not identity [015 S1-AC3]', () => {
    type Item = { id: number; label: string }
    const byId = (a: Item, b: Item) => a.id - b.id
    const item = (id: number, label = 'x'): Item => ({ id, label })
    const set = new TreeSet([item(1), item(2), item(3), item(4)], { comparator: byId })
    expect(set.has(item(2, 'other'))).toBe(true)
    expect(set.has(item(9))).toBe(false)
    expect(set.delete(item(1, 'other'))).toBe(true)
    expect(set.size).toBe(3)
    expect(set.removeAll([item(2, 'y'), item(9)])).toBe(true)
    expect(set.toArray().map((i) => i.id)).toEqual([3, 4])
    expect(set.retainAll([item(4, 'z')])).toBe(true)
    expect(set.toArray().map((i) => i.id)).toEqual([4])
    expect(set.retainAll([item(4)])).toBe(false)
    // A user comparator's error propagates from the lookups, and nothing is removed.
    const failure = new Error('cannot compare')
    let armed = false
    const fragile = new TreeSet([1, 2, 3], {
      comparator: (a: number, b: number) => {
        if (armed && (a === 9 || b === 9)) throw failure
        return a - b
      },
    })
    armed = true
    expect(caught(() => fragile.removeAll([1, 9]))).toBe(failure)
    expect(caught(() => fragile.retainAll([1, 9]))).toBe(failure)
    expect(fragile.toArray()).toEqual([1, 2, 3])
  })

  it('refuses null and undefined in natural order by every way in, and stores them where the comparator accepts them [015 S1-AC4]', () => {
    const set = new TreeSet([1, 2])
    const before = state(set)
    for (const missing of [null, undefined]) {
      expect(() => set.add(missing as never)).toThrow(NullElementError)
      expect(() => set.addAll([3, missing as never])).toThrow(NullElementError)
      expect(() => new TreeSet([1, missing as never])).toThrow(NullElementError)
      expect(() => TreeSet.from([missing as never])).toThrow(NullElementError)
      expect(() => new TreeSet<number>().add(missing as never)).toThrow(NullElementError)
    }
    expect(state(set)).toEqual(before)
    const nullable = new TreeSet<number | null | undefined>([3, null, 1], {
      comparator: nullsFirst<number>(),
    })
    expect(nullable.toArray()).toEqual([null, 1, 3])
    expect(nullable.has(null)).toBe(true)
    expect(nullable.has(undefined)).toBe(true) // nullsFirst treats undefined as null
    expect(nullable.delete(null)).toBe(true)
    expect(nullable.toArray()).toEqual([1, 3])
  })

  it('throws ClassCastError for an element that cannot be compared with the members, changing nothing [015 S1-AC5]', () => {
    const set = new TreeSet([1, 2, 3])
    const before = state(set)
    expect(() => set.add('a' as never)).toThrow(ClassCastError)
    expect(() => set.add({} as never)).toThrow(ClassCastError)
    expect(() => set.addAll(['b' as never])).toThrow(ClassCastError)
    expect(state(set)).toEqual(before)
    expect(() => new TreeSet<unknown>([1, 'a'])).toThrow(ClassCastError)
  })

  it('checks a lone element entering an empty set in natural order [015 S1-AC6]', () => {
    const cannot = [{}, Symbol('s'), () => 1]
    for (const value of cannot) {
      expect(() => new TreeSet<unknown>().add(value)).toThrow(ClassCastError)
      expect(() => new TreeSet<unknown>().addAll([value])).toThrow(ClassCastError)
      expect(() => new TreeSet<unknown>([value])).toThrow(ClassCastError)
      expect(() => TreeSet.from<unknown>([value])).toThrow(ClassCastError)
    }
    const empty = new TreeSet<unknown>()
    const revision = empty.revision
    expect(() => empty.add({})).toThrow(ClassCastError)
    expect(empty.size).toBe(0)
    expect(empty.revision).toBe(revision)
    expect(new TreeSet<unknown>([5]).toArray()).toEqual([5])
  })

  it('leaves members, size, revision and open iterators as they were when the comparator fails at any point [015 S1-AC7]', () => {
    const failure = new Error('comparator failed')
    let failAt = 0
    let calls = 0
    const comparator = (a: number, b: number): number => {
      calls++
      if (calls === failAt) throw failure
      return a - b
    }
    const nanAt = (a: number, b: number): number => {
      calls++
      return calls === failAt ? Number.NaN : a - b
    }
    for (const order of [comparator, nanAt]) {
      const operations: Array<[string, (set: TreeSet<number>) => unknown]> = [
        ['add', (s) => s.add(17)],
        ['has', (s) => s.has(17)],
        ['delete', (s) => s.delete(20)],
        ['lower', (s) => s.lower(17)],
        ['floor', (s) => s.floor(17)],
        ['ceiling', (s) => s.ceiling(17)],
        ['higher', (s) => s.higher(17)],
        ['removeAll', (s) => s.removeAll([4, 20, 33])],
        ['retainAll', (s) => s.retainAll([4, 20, 33])],
        ['subSet', (s) => s.subSet(4, 30)],
      ]
      for (const [name, operation] of operations) {
        // Find how many calls the operation makes, then fail at each of them in turn.
        failAt = 0
        const probe = new TreeSet(
          Array.from({ length: 40 }, (_, i) => i * 2),
          { comparator: order },
        )
        calls = 0
        operation(probe)
        const total = calls
        expect(total, name).toBeGreaterThan(0)
        for (let k = 1; k <= total; k++) {
          failAt = 0
          const set = new TreeSet(
            Array.from({ length: 40 }, (_, i) => i * 2),
            { comparator: order },
          )
          const iterator = set[Symbol.iterator]()
          expect(iterator.next().value).toBe(0)
          const before = state(set)
          calls = 0
          failAt = k
          const error = caught(() => operation(set))
          failAt = 0
          if (order === comparator) expect(error, `${name} failing at call ${k}`).toBe(failure)
          else expect(error, `${name} failing at call ${k}`).toBeInstanceOf(TypeError)
          expect(state(set), `${name} failing at call ${k}`).toEqual(before)
          expect(iterator.next().value, `${name} failing at call ${k}`).toBe(2)
        }
      }
    }
  })
})

describe('TreeSet — failing and re-entrant comparisons', () => {
  it('propagates a [compareSymbol] failure with the set unchanged, and addAll keeps what it added before [015 S1-AC7]', () => {
    const failure = new Error('protocol failed')
    class Fragile {
      constructor(readonly rank: number) {}
      [compareSymbol](other: Fragile): number {
        if (this.rank === 99 || other.rank === 99) throw failure
        return this.rank - other.rank
      }
    }
    const set = new TreeSet([new Fragile(1), new Fragile(2), new Fragile(3)])
    const before = state(set)
    expect(caught(() => set.add(new Fragile(99)))).toBe(failure)
    expect(caught(() => set.has(new Fragile(99)))).toBe(failure)
    expect(caught(() => set.delete(new Fragile(99)))).toBe(failure)
    expect(state(set)).toEqual(before)
    const revision = set.revision
    expect(caught(() => set.addAll([new Fragile(4), new Fragile(99), new Fragile(5)]))).toBe(
      failure,
    )
    expect(set.toArray().map((f) => f.rank)).toEqual([1, 2, 3, 4])
    expect(set.revision).not.toBe(revision)
  })

  it('throws ConcurrentModificationError when the comparator changes the set, keeping its change and making none itself [015 S1-AC8]', () => {
    let target: TreeSet<number> | undefined
    let armed = false
    const comparator = (a: number, b: number): number => {
      if (armed && target !== undefined) {
        armed = false
        target.add(1000)
      }
      return a - b
    }
    const operations: Array<[string, (set: TreeSet<number>) => unknown]> = [
      ['add', (s) => s.add(5)],
      ['has', (s) => s.has(4)],
      ['delete', (s) => s.delete(4)],
      ['floor', (s) => s.floor(5)],
      ['removeAll', (s) => s.removeAll([2, 4])],
      ['retainAll', (s) => s.retainAll([2])],
      ['subSet', (s) => s.subSet(2, 4)],
    ]
    for (const [name, operation] of operations) {
      target = new TreeSet([0, 2, 4, 6], { comparator })
      armed = true
      expect(() => operation(target as TreeSet<number>), name).toThrow(ConcurrentModificationError)
      expect(target.toArray(), name).toEqual([0, 2, 4, 6, 1000])
    }
    const message = (
      caught(() => {
        target = new TreeSet([0, 2], { comparator })
        armed = true
        target.add(1)
      }) as Error
    ).message
    expect(message).toBe('TreeSet.add: the set was changed by the comparator')
  })

  it('treats null, undefined and incomparable values as absent for has, delete, removeAll and retainAll in natural order [015 S1-AC9]', () => {
    const set = new TreeSet([1, 2, 3])
    const before = state(set)
    for (const value of [null, undefined, 'a', {}, Symbol('s'), 1n, new Date(1)]) {
      expect(set.has(value as never)).toBe(false)
      expect(set.delete(value as never)).toBe(false)
      expect(set.removeAll([value as never])).toBe(false)
    }
    expect(state(set)).toEqual(before)
    expect(set.retainAll([null as never, 'a' as never, 2])).toBe(true)
    expect(set.toArray()).toEqual([2])
    expect(new TreeSet<number>().has(null as never)).toBe(false)
    const dates = new TreeSet([new Date(1), new Date(2)])
    expect(dates.has(new Date(2))).toBe(true)
    expect(dates.has(2 as never)).toBe(false)
    const flags = new TreeSet([false])
    expect(flags.has(false)).toBe(true)
    expect(flags.has(true)).toBe(false)
    expect(new TreeSet([true]).has(false)).toBe(false)
    expect(new TreeSet(['a']).has('a')).toBe(true)
    expect(new TreeSet([new Ranked(1)]).has(new Ranked(1))).toBe(true)
    // Errors from user code still propagate.
    const failure = new Error('user comparator')
    const strict = new TreeSet<unknown>([1], {
      comparator: (a, b) => {
        if (a === null || b === null) throw failure
        return (a as number) - (b as number)
      },
    })
    expect(caught(() => strict.has(null))).toBe(failure)
    expect(caught(() => strict.delete(null))).toBe(failure)
    class Picky {
      constructor(readonly refuses: boolean) {}
      [compareSymbol](other: Picky): number {
        if (this.refuses || other.refuses) throw new ClassCastError('Picky: refuses to compare')
        return 0
      }
    }
    const picky = new TreeSet<Picky>([new Picky(false)])
    expect(() => picky.has(new Picky(true))).toThrow('Picky: refuses to compare')
    expect(() => picky.delete(new Picky(true))).toThrow('Picky: refuses to compare')
  })

  it('stores -0 as 0 in natural order, while a comparator sees values as given [015 S1-AC10]', () => {
    const set = new TreeSet([-0])
    expect(Object.is(set.getFirst(), 0)).toBe(true)
    set.clear()
    set.add(-0)
    expect(Object.is(set.toArray()[0], 0)).toBe(true)
    expect(set.has(-0)).toBe(true)
    set.addAll([-0, 1])
    expect(set.size).toBe(2)
    const seen: number[] = []
    const custom = new TreeSet<number>({
      comparator: (a, b) => {
        seen.push(a, b)
        return a - b
      },
    })
    custom.add(1).add(-0)
    expect(seen.some((v) => Object.is(v, -0))).toBe(true)
    expect(Object.is(custom.getFirst(), -0)).toBe(true)
  })
})

describe('TreeSet — cost and robustness', () => {
  it('uses at most 2⌈log2(n + 1)⌉ + 2 comparisons per search and none for the ends [015 S5-AC1]', () => {
    for (const [label, values] of sequences(300, 5)) {
      const { comparator, calls } = counting(ascending)
      const set = new TreeSet<number>({ comparator })
      const check = (what: string, n: number, run: () => unknown) => {
        const before = calls()
        run()
        expect(calls() - before, `${label} ${what} at size ${n}`).toBeLessThanOrEqual(bound(n))
      }
      for (const v of values) {
        const n = set.size
        check('add', n, () => set.add(v * 2))
        check('add of a member', n + 1, () => set.add(v * 2))
      }
      const n = set.size
      for (const v of values) {
        for (const probe of [v * 2, v * 2 + 1, -1, 1000]) {
          check('has', n, () => set.has(probe))
          check('lower', n, () => set.lower(probe))
          check('floor', n, () => set.floor(probe))
          check('ceiling', n, () => set.ceiling(probe))
          check('higher', n, () => set.higher(probe))
        }
      }
      const before = calls()
      set.getFirst()
      set.getLast()
      set.pollFirst()
      set.pollLast()
      set.removeFirst()
      set.removeLast()
      expect(calls(), `${label} ends`).toBe(before)
      for (const v of values) {
        const size = set.size
        check('delete', size, () => set.delete(v * 2))
      }
      expect(set.size).toBe(0)
    }
    // Calls to [compareSymbol] methods count too, and an empty set gets one self-check.
    const ranked = new TreeSet<Ranked>()
    Ranked.calls = 0
    ranked.add(new Ranked(0))
    expect(Ranked.calls).toBeLessThanOrEqual(bound(0))
    for (let i = 1; i < 200; i++) {
      const n = ranked.size
      Ranked.calls = 0
      ranked.add(new Ranked((i * 7919) % 200))
      expect(Ranked.calls).toBeLessThanOrEqual(bound(n))
      Ranked.calls = 0
      ranked.has(new Ranked(i))
      expect(Ranked.calls).toBeLessThanOrEqual(bound(n + 1))
    }
  })

  it('keeps size, iteration and call counts sound under an inconsistent comparator [015 S5-AC3]', () => {
    for (const seed of [1, 2, 3]) {
      const random = seeded(seed)
      let calls = 0
      const set = new TreeSet<{ id: number }>({
        comparator: () => {
          calls++
          return integer(random, -1, 1)
        },
      })
      const stored = new Set<{ id: number }>()
      for (let step = 0; step < 2000; step++) {
        const n = set.size
        calls = 0
        const roll = random()
        if (roll < 0.6) {
          const value = { id: step }
          set.add(value)
          if (set.size === n + 1) stored.add(value)
          else expect(set.size).toBe(n)
        } else if (roll < 0.8) {
          const victim = [...stored][integer(random, 0, Math.max(0, stored.size - 1))]
          if (victim !== undefined && set.delete(victim)) {
            // Which entry a lookup finds is unspecified: find the one that went.
            const left = new Set(set)
            for (const value of stored) if (!left.has(value)) stored.delete(value)
          }
          expect(set.size).toBe(stored.size)
        } else if (roll < 0.9) {
          for (const search of [
            () => set.has({ id: -1 }),
            () => set.ceiling({ id: -1 }),
            () => set.lower({ id: -1 }),
          ]) {
            calls = 0
            search()
            expect(calls).toBeLessThanOrEqual(bound(n))
          }
        } else {
          const first = set.pollFirst()
          if (first !== undefined) stored.delete(first)
        }
        expect(calls).toBeLessThanOrEqual(bound(n))
        expect(set.size).toBe(stored.size)
      }
      const seen = set.toArray()
      expect(seen.length).toBe(set.size)
      expect(new Set(seen).size).toBe(seen.length)
      for (const value of seen) expect(stored.has(value)).toBe(true)
    }
  })
})

describe('TreeSet — iteration and revision', () => {
  it('fails fast when the set changes during for…of, forEach or a cursor, on the set and its views [015 S6-AC1]', () => {
    const make = () => new TreeSet([1, 2, 3, 4, 5])
    const views = (set: TreeSet<number>) => [
      set,
      set.subSet(1, 5),
      set.reversed(),
      set.headSet(4).reversed(),
    ]
    for (const index of [0, 1, 2, 3]) {
      const set = make()
      const target = views(set)[index] as Iterable<number>
      expect(() => {
        for (const v of target) if (v === 2 || v === 3) set.add(10)
      }).toThrow(ConcurrentModificationError)
      const other = make()
      const viewed = views(other)[index] as TreeSet<number>
      expect(() =>
        viewed.forEach(() => {
          other.delete(other.getLast())
        }),
      ).toThrow(ConcurrentModificationError)
      const third = make()
      const cursor = (views(third)[index] as TreeSet<number>).cursor()
      cursor.next()
      third.add(20)
      expect(() => cursor.next()).toThrow(ConcurrentModificationError)
    }
    // A change through the cursor itself keeps it valid, in both directions.
    const set = make()
    const forward = set.cursor()
    const kept: number[] = []
    while (forward.hasNext()) {
      const v = forward.next()
      if (v % 2 === 0) forward.remove()
      else kept.push(v)
    }
    expect(kept).toEqual([1, 3, 5])
    expect(set.toArray()).toEqual([1, 3, 5])
  })

  it('leaves revision and open iterators alone when a call changes nothing [015 S6-AC6]', () => {
    const set = new TreeSet([1, 2, 3])
    const iterator = set[Symbol.iterator]()
    expect(iterator.next().value).toBe(1)
    const revision = set.revision
    set.add(2)
    set.delete(9)
    caught(() => set.add('x' as never))
    caught(() => set.headSet(2).add(5))
    set.removeIf(() => false)
    set.removeAll([7])
    set.retainAll([1, 2, 3])
    set.addAll([1, 3])
    set.subSet(5, 9).clear()
    expect(set.pollFirst.call(new TreeSet())).toBeUndefined()
    expect(set.revision).toBe(revision)
    expect(iterator.next().value).toBe(2)
    set.add(4)
    expect(set.revision).not.toBe(revision)
    const after = set.revision
    set.delete(4)
    expect(set.revision).not.toBe(after)
    const empty = new TreeSet<number>()
    const emptyRevision = empty.revision
    empty.clear()
    expect(empty.revision).toBe(emptyRevision)
  })
})

describe('TreeSet — ends and nearest', () => {
  it('getFirst and getLast return the least and greatest members, or throw when empty [015 S2-AC1]', () => {
    const set = new TreeSet([5, 1, 9, 3])
    expect(set.getFirst()).toBe(1)
    expect(set.getLast()).toBe(9)
    const empty = new TreeSet<number>()
    expect(() => empty.getFirst()).toThrow(NoSuchElementError)
    expect(() => empty.getLast()).toThrow(NoSuchElementError)
    expect((caught(() => empty.getFirst()) as Error).message).toBe(
      'TreeSet.getFirst: the set is empty',
    )
  })

  it('lower, floor, ceiling and higher return the nearest member on each side, or undefined [015 S2-AC2]', () => {
    const set = new TreeSet([10, 20, 30])
    const cases: Array<
      [number, number | undefined, number | undefined, number | undefined, number | undefined]
    > = [
      // value, lower, floor, ceiling, higher
      [5, undefined, undefined, 10, 10],
      [10, undefined, 10, 10, 20],
      [15, 10, 10, 20, 20],
      [20, 10, 20, 20, 30],
      [30, 20, 30, 30, undefined],
      [35, 30, 30, undefined, undefined],
    ]
    for (const [value, lower, floor, ceiling, higher] of cases) {
      expect(set.lower(value), `lower(${value})`).toBe(lower)
      expect(set.floor(value), `floor(${value})`).toBe(floor)
      expect(set.ceiling(value), `ceiling(${value})`).toBe(ceiling)
      expect(set.higher(value), `higher(${value})`).toBe(higher)
    }
    const empty = new TreeSet<number>()
    expect([empty.lower(1), empty.floor(1), empty.ceiling(1), empty.higher(1)]).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ])
    // Against a sorted array, over seeded values and probes.
    const random = seeded(3)
    const values = [...new Set(Array.from({ length: 200 }, () => integer(random, 0, 500)))]
    const sorted = values.slice().sort(ascending)
    const big = new TreeSet(values)
    for (let probe = -2; probe <= 502; probe++) {
      expect(big.lower(probe)).toBe(sorted.filter((v) => v < probe).pop())
      expect(big.floor(probe)).toBe(sorted.filter((v) => v <= probe).pop())
      expect(big.ceiling(probe)).toBe(sorted.find((v) => v >= probe))
      expect(big.higher(probe)).toBe(sorted.find((v) => v > probe))
    }
    expect(() => set.lower(null as never)).toThrow(NullElementError)
    expect(() => set.ceiling('a' as never)).toThrow(ClassCastError)
  })

  it('pollFirst and pollLast remove the ends or return undefined; removeFirst and removeLast throw when empty [015 S2-AC3]', () => {
    const set = new TreeSet([3, 1, 2, 4])
    expect(set.pollFirst()).toBe(1)
    expect(set.pollLast()).toBe(4)
    expect(set.removeFirst()).toBe(2)
    expect(set.removeLast()).toBe(3)
    expect(set.size).toBe(0)
    const revision = set.revision
    expect(set.pollFirst()).toBeUndefined()
    expect(set.pollLast()).toBeUndefined()
    expect(() => set.removeFirst()).toThrow(NoSuchElementError)
    expect(() => set.removeLast()).toThrow(NoSuchElementError)
    expect(set.revision).toBe(revision)
  })

  it('addFirst and addLast throw UnsupportedOperationError and change nothing [015 S2-AC4]', () => {
    const set = new TreeSet([2])
    const before = state(set)
    expect(() => set.addFirst(1)).toThrow(UnsupportedOperationError)
    expect(() => set.addLast(3)).toThrow(UnsupportedOperationError)
    expect(() => set.reversed().addFirst(1)).toThrow(UnsupportedOperationError)
    expect(() => set.subSet(0, 5).addLast(1)).toThrow(UnsupportedOperationError)
    expect((caught(() => set.addFirst(1)) as Error).message).toBe(
      'TreeSet.addFirst: a sorted set places each member by its order; use add',
    )
    expect(state(set)).toEqual(before)
  })

  it('comparator() returns the comparator given or undefined, and a stable reversing function on a reversed view [015 S2-AC5]', () => {
    const byLength = (a: string, b: string) => a.length - b.length
    const set = new TreeSet(['ccc', 'a'], { comparator: byLength })
    expect(set.comparator()).toBe(byLength)
    expect(set.subSet('a', 'cc').comparator()).toBe(byLength)
    expect(set.headSet('cc').comparator()).toBe(byLength)
    expect(new TreeSet().comparator()).toBeUndefined()
    expect(new TreeSet([1, 2]).tailSet(1).comparator()).toBeUndefined()
    const reversed = set.reversed()
    const reversing = reversed.comparator() as Comparator<string>
    expect(typeof reversing).toBe('function')
    expect(reversed.comparator()).toBe(reversing)
    expect(reversing('a', 'bb')).toBeGreaterThan(0)
    expect(reversing('bb', 'a')).toBeLessThan(0)
    const natural = new TreeSet([1, 2]).reversed()
    const naturalReversing = natural.comparator() as Comparator<number>
    expect(natural.comparator()).toBe(naturalReversing)
    expect(naturalReversing(1, 2)).toBeGreaterThan(0)
    expect(naturalReversing(2, 2)).toBe(0)
    expect(naturalReversing).not.toBe(naturalOrder())
    // A sorted copy by the reversing comparator matches the view's order.
    const words = new TreeSet(['bb', 'a', 'dddd', 'ccc'], { comparator: byLength })
    const view = words.reversed()
    expect(words.toArray().sort(view.comparator() as Comparator<string>)).toEqual(view.toArray())
  })
})

/** 0, 10, 20, …, 90. */
function tens(): TreeSet<number> {
  return new TreeSet(Array.from({ length: 10 }, (_, i) => i * 10))
}

describe('TreeSet — range views', () => {
  it('subSet, headSet and tailSet show [from, to), before to and from from on, in the receiver order [015 S3-AC1]', () => {
    const set = tens()
    expect(set.subSet(20, 50).toArray()).toEqual([20, 30, 40])
    expect(set.subSet(25, 55).toArray()).toEqual([30, 40, 50])
    expect(set.headSet(30).toArray()).toEqual([0, 10, 20])
    expect(set.tailSet(70).toArray()).toEqual([70, 80, 90])
    const reversed = set.reversed()
    expect(reversed.subSet(50, 20).toArray()).toEqual([50, 40, 30])
    expect(reversed.headSet(70).toArray()).toEqual([90, 80])
    expect(reversed.tailSet(20).toArray()).toEqual([20, 10, 0])
  })

  it('honours the inclusive flags, defaults for omitted flags and null or undefined options, and reads each once [015 S3-AC2]', () => {
    const set = tens()
    expect(set.subSet(20, 50, { fromInclusive: false }).toArray()).toEqual([30, 40])
    expect(set.subSet(20, 50, { toInclusive: true }).toArray()).toEqual([20, 30, 40, 50])
    expect(set.subSet(20, 50, { fromInclusive: false, toInclusive: true }).toArray()).toEqual([
      30, 40, 50,
    ])
    expect(set.subSet(20, 50, {}).toArray()).toEqual([20, 30, 40])
    expect(set.subSet(20, 50, null).toArray()).toEqual([20, 30, 40])
    expect(set.subSet(20, 50, undefined).toArray()).toEqual([20, 30, 40])
    expect(set.headSet(30, { inclusive: true }).toArray()).toEqual([0, 10, 20, 30])
    expect(set.headSet(30, null).toArray()).toEqual([0, 10, 20])
    expect(set.tailSet(70, { inclusive: false }).toArray()).toEqual([80, 90])
    expect(set.tailSet(70, { inclusive: undefined }).toArray()).toEqual([70, 80, 90])
    const reads: string[] = []
    const options = {
      get fromInclusive() {
        reads.push('fromInclusive')
        return false
      },
      get toInclusive() {
        reads.push('toInclusive')
        return true
      },
      other: 'ignored',
    }
    expect(set.subSet(20, 50, options).toArray()).toEqual([30, 40, 50])
    expect(reads).toEqual(['fromInclusive', 'toInclusive'])
    const view = set.subSet(20, 50, options)
    reads.length = 0
    view.toArray()
    view.has(30)
    expect(reads).toEqual([])
    const bound = {
      get inclusive() {
        reads.push('inclusive')
        return true
      },
    }
    set.headSet(30, bound)
    set.tailSet(30, bound)
    expect(reads).toEqual(['inclusive', 'inclusive'])
  })

  it('throws TypeError naming the method for options that are not an object or flags that are not booleans [015 S3-AC3]', () => {
    const set = tens()
    const calls: Array<[string, () => unknown]> = [
      ['TreeSet.subSet', () => set.subSet(1, 5, 1 as never)],
      ['TreeSet.subSet', () => set.subSet(1, 5, 'x' as never)],
      ['TreeSet.subSet', () => set.subSet(1, 5, { fromInclusive: 1 } as never)],
      ['TreeSet.subSet', () => set.subSet(1, 5, { toInclusive: null } as never)],
      ['TreeSet.headSet', () => set.headSet(5, true as never)],
      ['TreeSet.headSet', () => set.headSet(5, { inclusive: 'yes' } as never)],
      ['TreeSet.tailSet', () => set.tailSet(5, { inclusive: 0 } as never)],
      ['TreeSubSet.headSet', () => set.subSet(0, 50).headSet(5, 7 as never)],
      ['ReversedTreeSet.tailSet', () => set.reversed().tailSet(5, { inclusive: 1 } as never)],
    ]
    for (const [where, call] of calls) {
      const error = caught(call) as Error
      expect(error, where).toBeInstanceOf(TypeError)
      expect(error.message.startsWith(`${where}: `), error.message).toBe(true)
    }
  })

  it('throws IllegalArgumentError when from comes after to, and accepts subSet(x, x) with any flags [015 S3-AC4]', () => {
    const set = tens()
    expect(() => set.subSet(50, 20)).toThrow(IllegalArgumentError)
    expect((caught(() => set.subSet(50, 20)) as Error).message).toBe(
      'TreeSet.subSet: from 50 is after to 20',
    )
    expect(() => set.reversed().subSet(20, 50)).toThrow(IllegalArgumentError)
    expect(set.subSet(30, 30).toArray()).toEqual([])
    expect(set.subSet(30, 30, { toInclusive: true }).toArray()).toEqual([30])
    expect(set.subSet(30, 30, { fromInclusive: false, toInclusive: true }).toArray()).toEqual([])
    expect(set.subSet(30, 30, { fromInclusive: false }).toArray()).toEqual([])
    expect(set.reversed().subSet(30, 30, { toInclusive: true }).toArray()).toEqual([30])
  })

  it('checks bounds like elements in natural order, with a self-check on an empty set [015 S3-AC5]', () => {
    const set = tens()
    expect(() => set.subSet(null as never, 5)).toThrow(NullElementError)
    expect(() => set.headSet(undefined as never)).toThrow(NullElementError)
    expect(() => set.tailSet('a' as never)).toThrow(ClassCastError)
    expect(() => set.subSet(1, 'a' as never)).toThrow(ClassCastError)
    const empty = new TreeSet<unknown>()
    expect(() => empty.headSet({})).toThrow(ClassCastError)
    expect(() => empty.tailSet(null)).toThrow(NullElementError)
    expect(empty.headSet(5).size).toBe(0)
    // With a comparator, bounds go to the comparator.
    const custom = new TreeSet<number | null>([1, 2], { comparator: nullsFirst<number>() })
    expect(custom.tailSet(null).toArray()).toEqual([1, 2])
  })

  it('shows changes made through the set or the view in both, and shares revision and fail-fast state [015 S3-AC6]', () => {
    const set = tens()
    const view = set.subSet(20, 60)
    set.add(25)
    expect(view.toArray()).toEqual([20, 25, 30, 40, 50])
    view.add(35)
    expect(set.has(35)).toBe(true)
    view.delete(20)
    expect(set.has(20)).toBe(false)
    expect(view.revision).toBe(set.revision)
    set.delete(25)
    expect(view.revision).toBe(set.revision)
    const onSet = set[Symbol.iterator]()
    onSet.next()
    view.add(45)
    expect(() => onSet.next()).toThrow(ConcurrentModificationError)
    const onView = view[Symbol.iterator]()
    onView.next()
    set.add(1000)
    expect(() => onView.next()).toThrow(ConcurrentModificationError)
    const onReversed = set.reversed().cursor()
    onReversed.next()
    view.pollFirst()
    expect(() => onReversed.next()).toThrow(ConcurrentModificationError)
  })

  it('refuses to add outside the range and answers has and delete with false there [015 S3-AC7]', () => {
    const set = tens()
    const view = set.subSet(20, 50)
    const before = state(set)
    for (const outside of [10, 50, 55, -5]) {
      expect(() => view.add(outside)).toThrow(IllegalArgumentError)
      expect(view.has(outside)).toBe(false)
      expect(view.delete(outside)).toBe(false)
    }
    expect(() => view.addAll([30, 90])).toThrow(IllegalArgumentError)
    expect((caught(() => view.add(10)) as Error).message).toBe(
      'TreeSubSet.add: 10 is outside the range of the view',
    )
    expect(view.has(null as never)).toBe(false)
    expect(view.has('a' as never)).toBe(false)
    expect(view.delete(null as never)).toBe(false)
    expect(view.removeAll([10, 90])).toBe(false)
    expect(state(set)).toEqual(before)
    expect(() => set.reversed().headSet(40).add(10)).toThrow(IllegalArgumentError)
  })

  it('returns sub-range views of a view and refuses ranges reaching outside it [015 S3-AC8]', () => {
    const set = tens()
    const view = set.subSet(20, 70) // [20, 70)
    expect(view.subSet(30, 50).toArray()).toEqual([30, 40])
    expect(view.headSet(40).toArray()).toEqual([20, 30])
    expect(view.tailSet(50).toArray()).toEqual([50, 60])
    expect(view.headSet(70).toArray()).toEqual([20, 30, 40, 50, 60]) // exclusive edge on an exclusive edge
    expect(view.tailSet(20).toArray()).toEqual([20, 30, 40, 50, 60])
    expect(() => view.subSet(10, 50)).toThrow(IllegalArgumentError)
    expect(() => view.subSet(30, 80)).toThrow(IllegalArgumentError)
    expect(() => view.tailSet(10)).toThrow(IllegalArgumentError)
    expect(() => view.headSet(80)).toThrow(IllegalArgumentError)
    expect(() => view.headSet(70, { inclusive: true })).toThrow(IllegalArgumentError)
    expect(() => view.subSet(30, 70, { toInclusive: true })).toThrow(IllegalArgumentError)
    const open = set.subSet(20, 70, { fromInclusive: false })
    expect(() => open.tailSet(20)).toThrow(IllegalArgumentError)
    expect(open.tailSet(20, { inclusive: false }).toArray()).toEqual([30, 40, 50, 60])
    expect((caught(() => view.tailSet(10)) as Error).message).toBe(
      'TreeSubSet.tailSet: 10 is outside the range of the view',
    )
    const inner = view.subSet(30, 60)
    expect(() => inner.add(20)).toThrow(IllegalArgumentError)
    inner.add(35)
    expect(set.has(35)).toBe(true)
  })

  it('counts, navigates, polls and iterates only the members currently in range [015 S3-AC9]', () => {
    const set = tens()
    const view = set.subSet(20, 60, { toInclusive: true })
    expect(view.size).toBe(5)
    expect(view.isEmpty()).toBe(false)
    set.add(25).add(65).add(5)
    expect(view.size).toBe(6)
    expect(view.getFirst()).toBe(20)
    expect(view.getLast()).toBe(60)
    expect(view.lower(20)).toBeUndefined()
    expect(view.lower(100)).toBe(60)
    expect(view.floor(10)).toBeUndefined()
    expect(view.floor(62)).toBe(60)
    expect(view.ceiling(0)).toBe(20)
    expect(view.ceiling(61)).toBeUndefined()
    expect(view.higher(60)).toBeUndefined()
    expect(view.higher(-10)).toBe(20)
    expect(view.pollFirst()).toBe(20)
    expect(view.pollLast()).toBe(60)
    expect(view.removeFirst()).toBe(25)
    expect(view.removeLast()).toBe(50)
    expect([...view]).toEqual([30, 40])
    expect(set.toArray()).toEqual([0, 5, 10, 30, 40, 65, 70, 80, 90])
    view.clear()
    expect(view.isEmpty()).toBe(true)
    expect(view.size).toBe(0)
    expect(view.pollFirst()).toBeUndefined()
    expect(() => view.getFirst()).toThrow(NoSuchElementError)
    expect((caught(() => view.removeLast()) as Error).message).toBe(
      'TreeSubSet.removeLast: the set is empty',
    )
    expect(set.toArray()).toEqual([0, 5, 10, 65, 70, 80, 90])
    expect(set.tailSet(1000).isEmpty()).toBe(true)
  })

  it('keeps range-view searches within two comparisons of the set bound', () => {
    for (const [label, values] of sequences(256, 9)) {
      const { comparator, calls } = counting(ascending)
      const set = new TreeSet(values, { comparator })
      const n = set.size
      const views = [set.subSet(40, 200), set.headSet(100), set.tailSet(30).reversed()]
      for (const view of views) {
        for (const probe of [0, 39, 40, 41, 100, 199, 200, 300]) {
          for (const [what, run] of [
            ['has', () => view.has(probe)],
            ['lower', () => view.lower(probe)],
            ['floor', () => view.floor(probe)],
            ['ceiling', () => view.ceiling(probe)],
            ['higher', () => view.higher(probe)],
            ['getFirst', () => view.getFirst()],
            ['getLast', () => view.getLast()],
          ] as Array<[string, () => unknown]>) {
            const before = calls()
            run()
            expect(calls() - before, `${label} ${what}(${probe})`).toBeLessThanOrEqual(bound(n) + 2)
          }
        }
      }
    }
  })
})

describe('TreeSet — reversed views', () => {
  it('mirrors navigation, ends, polls and ranges, and ranges of a reversed view are reversed range views [015 S4-AC1]', () => {
    const set = tens()
    const r = set.reversed()
    expect(r.toArray()).toEqual([90, 80, 70, 60, 50, 40, 30, 20, 10, 0])
    expect(r.getFirst()).toBe(90)
    expect(r.getLast()).toBe(0)
    expect(r.lower(50)).toBe(60)
    expect(r.higher(50)).toBe(40)
    expect(r.floor(55)).toBe(60)
    expect(r.ceiling(55)).toBe(50)
    expect(r.pollFirst()).toBe(90)
    expect(r.pollLast()).toBe(0)
    expect(set.toArray()).toEqual([10, 20, 30, 40, 50, 60, 70, 80])
    r.add(95)
    expect(set.getLast()).toBe(95)
    const range = r.subSet(70, 30)
    expect(range.toArray()).toEqual([70, 60, 50, 40])
    expect(Object.prototype.toString.call(range)).toBe('[object ReversedTreeSet]')
    expect((range.comparator() as Comparator<number>)(1, 2)).toBeGreaterThan(0)
    const ascendingRange = range.reversed()
    expect(Object.prototype.toString.call(ascendingRange)).toBe('[object TreeSubSet]')
    expect(ascendingRange.toArray()).toEqual([40, 50, 60, 70])
    expect(ascendingRange.comparator()).toBeUndefined()
    const viewOfView = set.subSet(20, 80).reversed()
    expect(viewOfView.toArray()).toEqual([70, 60, 50, 40, 30, 20])
    expect(viewOfView.lower(50)).toBe(60)
    expect(viewOfView.lower(100)).toBeUndefined()
    expect(viewOfView.higher(100)).toBe(70)
    expect(viewOfView.headSet(50).toArray()).toEqual([70, 60])
    expect(viewOfView.tailSet(50, { inclusive: false }).toArray()).toEqual([40, 30, 20])
    expect(viewOfView.pollLast()).toBe(20)
    expect(set.has(20)).toBe(false)
  })

  it('reversed().cursor() walks from greatest to least and removes the member last returned [015 S4-AC2]', () => {
    const set = tens()
    const cursor = set.reversed().cursor()
    const seen: number[] = []
    while (cursor.hasNext()) {
      const v = cursor.next()
      seen.push(v)
      if (v % 20 === 0) cursor.remove()
    }
    expect(seen).toEqual([90, 80, 70, 60, 50, 40, 30, 20, 10, 0])
    expect(set.toArray()).toEqual([10, 30, 50, 70, 90])
    const ranged = set.subSet(30, 70, { toInclusive: true }).reversed().cursor()
    expect(ranged.next()).toBe(70)
    ranged.remove()
    expect(ranged.next()).toBe(50)
    expect(ranged.next()).toBe(30)
    expect(ranged.hasNext()).toBe(false)
    expect(set.toArray()).toEqual([10, 30, 50, 90])
  })

  it('reversing a reversed view returns the set or range view it reverses [015 S4-AC3]', () => {
    const set = tens()
    expect(set.reversed().reversed()).toBe(set)
    const view = set.subSet(10, 50)
    expect(view.reversed().reversed()).toBe(view)
    const r = set.reversed()
    expect(r.reversed().reversed()).not.toBe(r) // a new reversed view each time
    expect(r.reversed().reversed().toArray()).toEqual(r.toArray())
  })

  it('tags and prints views as TreeSubSet and ReversedTreeSet, and names them in errors [015 S4-AC4]', () => {
    const set = new TreeSet([1, 3])
    expect(String(set.reversed())).toBe('ReversedTreeSet(2) {3, 1}')
    expect(String(set.subSet(1, 3))).toBe('TreeSubSet(1) {1}')
    expect(String(set.headSet(3).reversed())).toBe('ReversedTreeSet(1) {1}')
    expect(Object.prototype.toString.call(set.tailSet(1))).toBe('[object TreeSubSet]')
    expect(JSON.stringify(set.reversed())).toBe('[3,1]')
    expect((caught(() => new TreeSet<number>().reversed().getFirst()) as Error).message).toBe(
      'ReversedTreeSet.getFirst: the set is empty',
    )
    expect((caught(() => set.subSet(1, 3).addLast(2)) as Error).message).toBe(
      'TreeSubSet.addLast: a sorted set places each member by its order; use add',
    )
    expect((caught(() => set.reversed().subSet(1, 3)) as Error).message).toBe(
      'ReversedTreeSet.subSet: from 1 is after to 3',
    )
  })
})

describe('TreeSet — construction', () => {
  it('reads an iterable first argument as elements and any other object as options, and refuses the rest [015 S7-AC1]', () => {
    expect(new TreeSet([2, 1]).toArray()).toEqual([1, 2])
    expect(new TreeSet('ba').toArray()).toEqual(['a', 'b'])
    expect(new TreeSet(new Set([3, 1])).toArray()).toEqual([1, 3])
    expect(new TreeSet(undefined).size).toBe(0)
    expect(new TreeSet(null).size).toBe(0)
    expect(new TreeSet().size).toBe(0)
    const options = new TreeSet<number>({ comparator: descending })
    options.add(1).add(2)
    expect(options.toArray()).toEqual([2, 1])
    expect(new TreeSet<number>({}).comparator()).toBeUndefined()
    for (const bad of [5, true, Symbol('s'), 1n]) {
      expect(() => new TreeSet(bad as never)).toThrow(TypeError)
    }
    expect((caught(() => new TreeSet(5 as never)) as Error).message).toBe(
      'TreeSet: elements is not iterable (5)',
    )
    expect((caught(() => new TreeSet(descending as never)) as Error).message).toBe(
      'TreeSet: elements is not iterable (function); pass the comparator as { comparator }',
    )
  })

  it('requires iterable elements and an options object when a second argument is given, and the same in from [015 S7-AC2]', () => {
    expect(new TreeSet([1, 2], { comparator: descending }).toArray()).toEqual([2, 1])
    expect(new TreeSet(null, { comparator: descending }).size).toBe(0)
    expect(new TreeSet(undefined, {}).size).toBe(0)
    const refused: Array<[string, () => unknown]> = [
      ['TreeSet', () => new TreeSet({} as never, {})],
      ['TreeSet', () => new TreeSet(5 as never, {})],
      ['TreeSet', () => new TreeSet([1], null as never)],
      ['TreeSet', () => new TreeSet([1], descending as never)],
      ['TreeSet', () => new TreeSet([1], 5 as never)],
      ['TreeSet.from', () => TreeSet.from(null as never)],
      ['TreeSet.from', () => TreeSet.from(undefined as never)],
      ['TreeSet.from', () => TreeSet.from({} as never)],
      ['TreeSet.from', () => TreeSet.from([1], null as never)],
      ['TreeSet.from', () => TreeSet.from([1], descending as never)],
    ]
    for (const [where, call] of refused) {
      const error = caught(call) as Error
      expect(error, where).toBeInstanceOf(TypeError)
      expect(error.message.startsWith(`${where}: `), error.message).toBe(true)
    }
    expect(TreeSet.from([3, 1, 2]).toArray()).toEqual([1, 2, 3])
    expect(TreeSet.from([3, 1, 2], { comparator: descending }).toArray()).toEqual([3, 2, 1])
    expect(TreeSet.from([1]) instanceof TreeSet).toBe(true)
  })

  it('reads comparator once, refuses a non-function and never inherits it from a source set [015 S7-AC3]', () => {
    let reads = 0
    const options = {
      get comparator() {
        reads++
        return descending
      },
      unrelated: true,
    }
    const set = new TreeSet([1, 2, 3], options)
    expect(reads).toBe(1)
    expect(set.toArray()).toEqual([3, 2, 1])
    reads = 0
    TreeSet.from([1], options)
    expect(reads).toBe(1)
    expect(() => new TreeSet({ comparator: 5 } as never)).toThrow(TypeError)
    expect((caught(() => new TreeSet({ comparator: 'x' } as never)) as Error).message).toBe(
      'TreeSet: comparator is not a function ("x")',
    )
    expect(() => TreeSet.from([], { comparator: null } as never)).toThrow(TypeError)
    expect(new TreeSet([1], { comparator: undefined }).comparator()).toBeUndefined()
    const source = new TreeSet([1, 2, 3], { comparator: descending })
    expect(new TreeSet(source).comparator()).toBeUndefined()
    expect(new TreeSet(source).toArray()).toEqual([1, 2, 3])
    expect(TreeSet.from(source).comparator()).toBeUndefined()
    expect(source.copy().comparator()).toBe(descending)
  })

  it('builds from strictly ascending input with at most n − 1 comparisons, keeps the first of equal values, and copies with none [015 S5-AC5]', () => {
    for (const n of [0, 1, 2, 3, 10, 1000]) {
      const { comparator, calls } = counting(ascending)
      const values = Array.from({ length: n }, (_, i) => i)
      const set = new TreeSet(values, { comparator })
      expect(calls(), `size ${n}`).toBeLessThanOrEqual(Math.max(0, n - 1))
      expect(set.toArray()).toEqual(values)
      const fromCalls = calls()
      TreeSet.from(values, { comparator })
      expect(calls() - fromCalls).toBeLessThanOrEqual(Math.max(0, n - 1))
      const copyCalls = calls()
      const copy = set.copy()
      expect(calls()).toBe(copyCalls)
      expect(copy.toArray()).toEqual(values)
    }
    Ranked.calls = 0
    new TreeSet([new Ranked(1)])
    expect(Ranked.calls).toBe(1) // the self-check
    Ranked.calls = 0
    new TreeSet([new Ranked(1), new Ranked(2), new Ranked(3)])
    expect(Ranked.calls).toBe(2)
    // Other input costs O(n log n) and keeps the first of equal values.
    const { comparator, calls } = counting((a: { k: number }, b: { k: number }) => a.k - b.k)
    const random = seeded(4)
    const input = Array.from({ length: 1000 }, (_, i) => ({ k: integer(random, 0, 300), i }))
    const set = new TreeSet(input, { comparator })
    expect(calls()).toBeLessThanOrEqual(1000 * bound(1000))
    const firsts = new Map<number, number>()
    for (const item of input) if (!firsts.has(item.k)) firsts.set(item.k, item.i)
    expect(set.size).toBe(firsts.size)
    for (const item of set) expect(item.i).toBe(firsts.get(item.k))
    const tail = new TreeSet([1, 2, 3, 2, 0, 5])
    expect(tail.toArray()).toEqual([0, 1, 2, 3, 5])
  })

  it('copy() returns an independent TreeSet with the same members and comparator [015 S6-AC5]', () => {
    const set = new TreeSet([3, 1, 2], { comparator: descending })
    const copy = set.copy()
    expect(copy).not.toBe(set)
    expect(copy instanceof TreeSet).toBe(true)
    expect(copy.toArray()).toEqual([3, 2, 1])
    expect(copy.comparator()).toBe(descending)
    copy.add(9)
    copy.delete(1)
    expect(set.toArray()).toEqual([3, 2, 1])
    set.clear()
    expect(copy.toArray()).toEqual([9, 3, 2])
    expect(new TreeSet<number>().copy().size).toBe(0)
  })
})

describe('TreeSet — equality and output', () => {
  it('equals a set of the same size with the same members both ways, including a HashSet, without a public hashCode [015 S6-AC2]', () => {
    const tree = new TreeSet([1, 2, 3])
    const hash = new HashSet([3, 1, 2])
    expect(tree.equals(hash)).toBe(true)
    expect(hash.equals(tree)).toBe(true)
    expect(tree.equals(new TreeSet([3, 2, 1], { comparator: descending }))).toBe(true)
    expect(tree.equals(new HashSet([1, 2, 4]))).toBe(false)
    expect(new HashSet([1, 2, 4]).equals(tree)).toBe(false)
    const mixed = new HashSet<unknown>([1, 'a', null])
    const three = new TreeSet([1, 2, 3])
    expect(three.equals(mixed)).toBe(false)
    expect(mixed.equals(three)).toBe(false)
    expect(tree.equals([1, 2, 3])).toBe(false)
    expect(tree.equals(new Set([1, 2, 3]))).toBe(false)
    expect(equals(tree, hash)).toBe(true)
    expect(tree.reversed().equals(tree)).toBe(true)
    expect(tree.subSet(1, 3).equals(new HashSet([1, 2]))).toBe(true)
    expect('hashCode' in tree).toBe(false)
  })

  it('equals the key view of a map with the same keys both ways and hashes alike, but never the map [015 S6-AC2]', () => {
    const tree = new TreeSet([1, 2, 3])
    const map = new HashMap([
      [3, 'c'],
      [1, 'a'],
      [2, 'b'],
    ])
    expect(tree.equals(map.keySet())).toBe(true)
    expect(map.keySet().equals(tree)).toBe(true)
    expect(tree.reversed().equals(map.keySet())).toBe(true)
    expect(hashCode(tree)).toBe(hashCode(map.keySet()))
    expect(tree.equals(map)).toBe(false)
    expect(map.equals(tree)).toBe(false)
    map.delete(2)
    expect(tree.equals(map.keySet())).toBe(false)
  })

  it('gives equal sets the same hash through the given function, as a HashSet with the same members [015 S6-AC3]', () => {
    const a = new TreeSet([1, 2, 3])
    const b = new TreeSet([3, 2, 1], { comparator: descending })
    expect(hashCode(a)).toBe(hashCode(b))
    expect(hashCode(a)).toBe(hashCode(new HashSet([2, 3, 1])))
    const standIn = (v: unknown) => (v as number) * 31
    expect(a.reversed()[hashCodeSymbol](standIn)).toBe(a[hashCodeSymbol](standIn))
    expect(new HashSet([3, 1, 2])[hashCodeSymbol](standIn)).toBe(a[hashCodeSymbol](standIn))
    expect(a.headSet(3)[hashCodeSymbol](standIn)).toBe(new TreeSet([1, 2])[hashCodeSymbol](standIn))
  })

  it('prints TreeSet(n) {...} in ascending order, writes JSON as an ascending array and supports inspect [015 S6-AC4]', () => {
    const set = new TreeSet(['b', 'c', 'a'])
    expect(String(set)).toBe("TreeSet(3) {'a', 'b', 'c'}")
    expect(String(new TreeSet())).toBe('TreeSet(0) {}')
    expect(set.toJSON()).toEqual(['a', 'b', 'c'])
    expect(JSON.stringify(new TreeSet([2, 1]))).toBe('[1,2]')
    expect(inspect(new TreeSet([2, 1]))).toBe('TreeSet(2) { 1, 2 }')
    expect(Object.prototype.toString.call(set)).toBe('[object TreeSet]')
  })

  it('adds 200,000 members in ascending order, then iterates, prints, compares, copies and clears without overflowing the stack [015 S5-AC4]', () => {
    const n = 200000
    const set = new TreeSet<number>()
    for (let i = 0; i < n; i++) set.add(i)
    expect(set.size).toBe(n)
    let expected = 0
    let wrong = 0
    for (const v of set) if (v !== expected++) wrong++
    expect(wrong).toBe(0)
    expect(expected).toBe(n)
    const text = String(set)
    expect(text.startsWith(`TreeSet(${n}) {0, 1, 2`)).toBe(true)
    const copy = set.copy()
    expect(set.equals(copy)).toBe(true)
    expect(copy.equals(set)).toBe(true)
    expect(set.reversed().getFirst()).toBe(n - 1)
    expect(set.subSet(1000, 2000).size).toBe(1000)
    set.clear()
    expect(set.size).toBe(0)
    expect(copy.size).toBe(n)
    expect(copy.removeIf((v) => v % 2 === 0)).toBe(true)
    expect(copy.size).toBe(n / 2)
    // Generous: instrumented coverage runs are many times slower than plain ones.
  }, 60000)
})

/** Kinds in the order the contract comparator puts them. */
const KINDS = ['number', 'bigint', 'string', 'boolean', 'symbol', 'function', 'object', 'undefined']

/** A member below every other value, and one above, so a range view can hold any value. */
const LOW = { edge: 'low' }
const HIGH = { edge: 'high' }

/**
 * A total order over any values, for the contract suites, which add strings, objects and the set
 * itself next to numbers: `LOW` first and `HIGH` last, then by kind, then by value; symbols,
 * functions and objects in the order first seen.
 */
function mixedComparator(): Comparator<unknown> {
  const ids = new Map<unknown, number>()
  const idOf = (value: unknown): number => {
    let id = ids.get(value)
    if (id === undefined) {
      id = ids.size
      ids.set(value, id)
    }
    return id
  }
  return (a, b) => {
    if (a === b) return 0
    if (a === LOW || b === HIGH) return -1
    if (a === HIGH || b === LOW) return 1
    const kinds = KINDS.indexOf(typeof a) - KINDS.indexOf(typeof b)
    if (kinds !== 0) return kinds
    switch (typeof a) {
      case 'number': {
        const x = a as number
        const y = b as number
        if (Number.isNaN(x) || Number.isNaN(y))
          return Number(Number.isNaN(x)) - Number(Number.isNaN(y))
        return x < y ? -1 : x > y ? 1 : 0
      }
      case 'bigint':
      case 'string':
      case 'boolean': {
        const x = a as string
        const y = b as string
        return x < y ? -1 : x > y ? 1 : 0
      }
      default:
        return idOf(a) - idOf(b)
    }
  }
}

/** The values of `initial`, for a factory. */
function listOf(initial?: Iterable<unknown>): unknown[] {
  return initial === undefined ? [] : [...initial]
}

/** The set itself, in the contract order. */
function makeSet(initial?: Iterable<unknown>): TreeSet<unknown> {
  return new TreeSet<unknown>(listOf(initial), { comparator: mixedComparator() })
}

/** A range view holding everything between `LOW` and `HIGH`, both members of the set. */
function makeRange(initial?: Iterable<unknown>): SortedSetOf {
  const order = mixedComparator()
  const set = new TreeSet<unknown>([LOW, HIGH], { comparator: order })
  const view = set.subSet(LOW, HIGH, { fromInclusive: false })
  view.addAll(listOf(initial))
  return view
}

/** A reversed view of a set kept in descending order, so the view runs in the contract order. */
function makeReversed(initial?: Iterable<unknown>): SortedSetOf {
  const order = mixedComparator()
  const set = new TreeSet<unknown>({ comparator: (a, b) => order(b, a) })
  const view = set.reversed()
  view.addAll(listOf(initial))
  return view
}

type SortedSetOf = ReturnType<TreeSet<unknown>['reversed']>

const sumOf = (elements: unknown[], hash: (value: unknown) => number) =>
  elements.reduce<number>((h, e) => (h + hash(e)) | 0, 0)

describe('TreeSet — shared contracts', () => {
  it('runs the collection, set, sequenced and sorted-set suites on the set, a range view and a reversed view [015 S8-AC1]', () => {
    // The suites below are registered at module level; this test pins the factories they use.
    const order = mixedComparator()
    const sortedByMixed = (values: unknown[]) => values.slice().sort(order)
    for (const make of [makeSet, makeRange, makeReversed]) {
      const c = make([2, 'b', 1, 'a', null])
      expect(c.toArray()).toEqual(sortedByMixed([2, 'b', 1, 'a', null]))
      expect(c.has(LOW)).toBe(false)
      expect(c.has(HIGH)).toBe(false)
    }
  })
})

const contractOrder = mixedComparator()
const shared: Array<[string, CollectionFactory]> = [
  ['TreeSet', makeSet as CollectionFactory],
  ['TreeSubSet', makeRange as CollectionFactory],
  ['ReversedTreeSet', makeReversed as CollectionFactory],
]
for (const [name, make] of shared) {
  describeCollection(name, make, {
    iteration: 'fail-fast',
    brackets: 'set',
    nullElements: 'store',
    order: 'unspecified',
    minusZero: 'kept',
    peers: [
      (initial?: Iterable<unknown>) => new HashSet<unknown>(initial),
      (initial?: Iterable<unknown>) => new ArrayList<unknown>(initial),
    ],
    structural: { expectedHash: sumOf },
    // No `withEquality`: membership is decided by the comparator, and the comparator-failure and
    // re-entrancy rules for removeAll and retainAll are tested above at every comparison point.
    withFailingAdd: (rejects, failure) => {
      const order = mixedComparator()
      return new TreeSet<unknown>({
        comparator: (a, b) => {
          if (rejects(a) || rejects(b)) throw failure
          return order(a, b)
        },
      })
    },
  })
  describeSetCollection(name, make as never, {
    order: (members) => members.slice().sort(contractOrder),
  })
  describeSequencedCollection(name, make as never, { addAtEnds: 'unsupported' })
}
describeSortedSet('TreeSet', (initial) => new TreeSet<number>(initial))
describeSortedSet('TreeSubSet', (initial) => {
  const view = new TreeSet<number>([-1e9, 1e9]).subSet(-1e6, 1e6)
  view.addAll(initial ?? [])
  return view
})
describeSortedSet('ReversedTreeSet', (initial) => {
  const view = new TreeSet<number>({ comparator: descending }).reversed()
  view.addAll(initial ?? [])
  return view
})

describeSequencedSet(
  'TreeSet',
  (initial) => new TreeSet<number>(initial as Iterable<number>) as never,
  {
    addAtEnds: 'unsupported',
  },
)
describeSequencedSet(
  'TreeSubSet',
  (initial) => {
    const view = new TreeSet<number>([-1e9, 1e9]).subSet(-1e6, 1e6)
    view.addAll((initial ?? []) as Iterable<number>)
    return view as never
  },
  { addAtEnds: 'unsupported' },
)
describeSequencedSet(
  'ReversedTreeSet',
  (initial) => {
    const view = new TreeSet<number>({ comparator: descending }).reversed()
    view.addAll((initial ?? []) as Iterable<number>)
    return view as never
  },
  { addAtEnds: 'unsupported' },
)

describe('TreeSet — reference model', () => {
  it('matches a sorted native array under seeded operations, with numbers and with strings, including navigation and range views [015 S8-AC2]', () => {
    const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
    const letters = 'abcdefghij'
    for (const seed of [1, 2, 3, 4]) {
      runSortedSetReferenceModel({
        seed,
        steps: 800,
        make: () => new TreeSet<number>(),
        compare: ascending,
        value: (random) => integer(random, 0, 60),
      })
      runSortedSetReferenceModel({
        seed,
        steps: 800,
        make: () => new TreeSet<number>({ comparator: descending }),
        compare: descending,
        value: (random) => integer(random, 0, 60),
      })
      runSortedSetReferenceModel({
        seed,
        steps: 800,
        make: () => new TreeSet<string>(),
        compare: byCodeUnit,
        value: (random) =>
          `${letters[integer(random, 0, 9)] as string}${letters[integer(random, 0, 9)] as string}`,
      })
    }
  })
})

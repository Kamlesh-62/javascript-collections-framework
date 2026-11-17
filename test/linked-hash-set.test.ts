import { inspect } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ArrayDeque } from '../src/collections/array-deque'
import { ArrayList } from '../src/collections/array-list'
import { HashSet } from '../src/collections/hash-set'
import { LinkedHashSet, type LinkedHashSetOptions } from '../src/collections/linked-hash-set'
import { TreeSet } from '../src/collections/tree-set'
import {
  ConcurrentModificationError,
  type Equivalence,
  hashCode,
  hashCodeSymbol,
  isSequencedCollection,
  isSetCollection,
  type KeyOf,
  NoSuchElementError,
  sameValueZeroEquivalence,
  valueEquivalence,
} from '../src/index'
import { setBucketSeedSourceForTesting } from '../src/internal/engines/hash-table'
import { describeCollection } from './contracts/collection'
import { describeSequencedCollection } from './contracts/sequenced'
import { describeSequencedSet } from './contracts/sequenced-set'
import { describeSetCollection } from './contracts/set'
import { fixHashSeed } from './support/hash-seed'
import { runReferenceModel, runSequencedSetReferenceModel } from './support/reference-model'

fixHashSeed()
// Bucket seeds come from a counter, so layouts are the same on every run; tests that count seeds
// install their own source.
let nextBucketSeed = 0
beforeEach(() => {
  nextBucketSeed = 0x5eed
  setBucketSeedSourceForTesting(() => nextBucketSeed++)
})
afterEach(() => setBucketSeedSourceForTesting(undefined))

function caught(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  return undefined
}

function messageOf(fn: () => unknown): string {
  return (caught(fn) as Error).message
}

/** A key that returns primitives unchanged and a distinct symbol per object or function. */
function identityKey(): (value: unknown) => unknown {
  const ids = new WeakMap<object, symbol>()
  return (value) => {
    if ((typeof value !== 'object' || value === null) && typeof value !== 'function') return value
    let id = ids.get(value as object)
    if (id === undefined) {
      id = Symbol('id')
      ids.set(value as object, id)
    }
    return id
  }
}

/** A user-written SameValueZero equivalence: a new object, so the set uses its buckets. */
function sameValueZeroUser(): Equivalence<unknown> {
  return {
    equals: (a, b) => sameValueZeroEquivalence.equals(a, b),
    hash: (value) => sameValueZeroEquivalence.hash(value),
  }
}

type Path = readonly [string, () => LinkedHashSetOptions<unknown> | undefined]

/** The three ways a set can compare members: native, by derived key, by an equivalence. */
const PATHS: readonly Path[] = [
  ['default', () => undefined],
  ['key', () => ({ key: identityKey() as KeyOf<unknown> })],
  ['equivalence', () => ({ equivalence: sameValueZeroUser() })],
]

function makeOn(path: Path, initial?: Iterable<unknown>): LinkedHashSet<unknown> {
  return new LinkedHashSet<unknown>(initial, path[1]())
}

/** Runs the same scripted changes inside a loop over `ours` and over a native Set. */
function liveRun(
  ours: {
    forEachValue(visit: (value: number) => void): void
    add(v: number): void
    delete(v: number): void
    clear(): void
  },
  theirs: Set<number>,
  script: (
    value: number,
    apply: { add(v: number): void; delete(v: number): void; clear(): void },
  ) => void,
): [number[], number[]] {
  const seenOurs: number[] = []
  ours.forEachValue((value) => {
    seenOurs.push(value)
    script(value, ours)
  })
  const seenTheirs: number[] = []
  for (const value of theirs) {
    seenTheirs.push(value)
    script(value, theirs)
  }
  return [seenOurs, seenTheirs]
}

describe('LinkedHashSet as a hash set — membership like a native Set', () => {
  for (const path of PATHS) {
    describe(`on the ${path[0]} path`, () => {
      it('add adds a new member, keeps an equal one and its place, and returns the set [013 S1-AC1]', () => {
        const set = makeOn(path, ['a', 'b'])
        expect(set.add('c')).toBe(set)
        const revision = set.revision
        expect(set.add('a')).toBe(set)
        expect(set.revision).toBe(revision)
        expect(set.toArray()).toEqual(['a', 'b', 'c'])
      })

      it('has reports whether a member equals the value [013 S1-AC1]', () => {
        const set = makeOn(path, [1, 'x'])
        expect(set.has(1)).toBe(true)
        expect(set.has('x')).toBe(true)
        expect(set.has('1')).toBe(false)
        expect(set.has(2)).toBe(false)
      })

      it('delete removes the equal member and reports whether it did [013 S1-AC1]', () => {
        const set = makeOn(path, [1, 2, 3])
        expect(set.delete(2)).toBe(true)
        expect(set.toArray()).toEqual([1, 3])
        expect(set.delete(2)).toBe(false)
        expect(set.size).toBe(2)
      })

      it('turns -0 into 0 on add, has, delete, the constructor and bulk lookups [013 S1-AC1]', () => {
        const set = makeOn(path, [-0])
        expect(Object.is(set.toArray()[0], 0)).toBe(true)
        expect(set.has(-0)).toBe(true)
        expect(set.has(0)).toBe(true)
        expect(set.delete(-0)).toBe(true)
        set.add(-0)
        expect(Object.is(set.toArray()[0], 0)).toBe(true)
        expect(set.removeAll([-0])).toBe(true)
        set.add(0).add(1)
        expect(set.retainAll([-0])).toBe(true)
        expect(set.toArray()).toEqual([0])
        const from = LinkedHashSet.from([-0], path[1]())
        expect(Object.is(from.toArray()[0], 0)).toBe(true)
      })
    })
  }

  it('compares with SameValueZero by default, exactly as a native Set [013 S1-AC1]', () => {
    const a = {}
    const b = {}
    const values = [a, b, Number.NaN, Number.NaN, 0, -0, 1, '1']
    const set = new LinkedHashSet<unknown>(values)
    const native = new Set<unknown>(values)
    expect(set.size).toBe(native.size)
    expect(set.toArray()).toEqual([...native])
    expect(set.has({})).toBe(false)
    expect(set.has(Number.NaN)).toBe(true)
  })

  it('holds null and undefined as two distinct members by default [013 S1-AC1]', () => {
    const set = new LinkedHashSet<unknown>([null, undefined, null, undefined])
    expect(set.size).toBe(2)
    expect(set.has(null)).toBe(true)
    expect(set.has(undefined)).toBe(true)
    expect(set.delete(null)).toBe(true)
    expect(set.toArray()).toEqual([undefined])
  })

  it('never passes -0 to key, equals or hash [013 S1-AC1]', () => {
    const seen: unknown[] = []
    const keyed = new LinkedHashSet<number>({
      key: (v) => {
        seen.push(v)
        return v
      },
    })
    const bucketed = new LinkedHashSet<number>({
      equivalence: {
        equals: (x, y) => {
          seen.push(x, y)
          return x === y
        },
        hash: (v) => {
          seen.push(v)
          return 0
        },
      },
    })
    for (const set of [keyed, bucketed]) {
      set.add(-0)
      set.add(-0)
      set.has(-0)
      set.removeAll([-0])
      set.add(-0)
      set.retainAll([-0])
      set.delete(-0)
    }
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.some((v) => Object.is(v, -0))).toBe(false)
  })
})

describe('LinkedHashSet as a hash set — value equality on request', () => {
  it('treats values with SameValueZero-equal keys as one member and stores the values [013 S1-AC1]', () => {
    const first = { id: 1, name: 'first' }
    const second = { id: 1, name: 'second' }
    const set = new LinkedHashSet<{ id: number; name: string }>({ key: (user) => user.id })
    set.add(first).add(second).add({ id: Number.NaN, name: 'n' }).add({ id: Number.NaN, name: 'm' })
    expect(set.size).toBe(2)
    expect(set.toArray()[0]).toBe(first)
    expect(set.has({ id: 1, name: 'other' })).toBe(true)
    expect([...set].map((u) => u.name)).toEqual(['first', 'n'])
  })

  it('uses the native engine for sameValueZeroEquivalence, never calling protocol methods [013 S1-AC1]', () => {
    let calls = 0
    class Loud {
      [Symbol.for('javascript-collections-framework.equals')](): boolean {
        calls++
        return true
      }
      [Symbol.for('javascript-collections-framework.hashCode')](): number {
        calls++
        return 1
      }
    }
    let draws = 0
    setBucketSeedSourceForTesting(() => draws++)
    const set = new LinkedHashSet<unknown>([new Loud(), new Loud()], {
      equivalence: sameValueZeroEquivalence,
    })
    expect(set.size).toBe(2)
    expect(set.has(new Loud())).toBe(false)
    expect(calls).toBe(0)
    expect(draws).toBe(0) // no bucket table was created
    const plain = new LinkedHashSet<unknown>([new Loud()], { equivalence: valueEquivalence })
    expect(draws).toBe(1) // valueEquivalence uses the seeded buckets
    expect(plain.has(new Loud())).toBe(true)
    expect(calls).toBeGreaterThan(0)
  })
})

describe('LinkedHashSet as a hash set — native Set compatibility', () => {
  for (const path of PATHS) {
    it(`keys and values iterate in insertion order; entries yields pairs (${path[0]}) [013 S1-AC1]`, () => {
      const set = makeOn(path, ['b', 'a', 'c'])
      expect([...set.keys()]).toEqual(['b', 'a', 'c'])
      expect([...set.values()]).toEqual(['b', 'a', 'c'])
      expect([...set.entries()]).toEqual([
        ['b', 'b'],
        ['a', 'a'],
        ['c', 'c'],
      ])
      const native = new Set(['b', 'a', 'c'])
      expect([...set.entries()]).toEqual([...native.entries()])
    })

    it(`forEach calls action(e, e, set) with thisArg (${path[0]}) [013 S1-AC1]`, () => {
      const set = makeOn(path, [1, 2])
      const calls: unknown[][] = []
      const self = { tag: 'this' }
      set.forEach(function (this: unknown, a, b, owner) {
        calls.push([a, b, owner, this])
      }, self)
      expect(calls).toEqual([
        [1, 1, set, self],
        [2, 2, set, self],
      ])
      expect(() => set.forEach('x' as never)).toThrow(TypeError)
    })

    it(`works with new Set, spread and native set methods (${path[0]}) [013 S1-AC1]`, () => {
      const set = makeOn(path, [3, 1, 2])
      expect(typeof set.size).toBe('number')
      expect([...new Set(set)]).toEqual([3, 1, 2])
      expect([...set]).toEqual([3, 1, 2])
      const union = (Set.prototype as { union?: (other: unknown) => Set<unknown> }).union
      if (typeof union === 'function') {
        expect([...union.call(new Set([9]), set)]).toEqual([9, 3, 1, 2])
        const isSubsetOf = (Set.prototype as unknown as { isSubsetOf: (o: unknown) => boolean })
          .isSubsetOf
        expect(isSubsetOf.call(new Set([1, 2]), set)).toBe(true)
      }
    })
  }
})

describe('LinkedHashSet as a hash set — live iteration like a native Set', () => {
  for (const path of PATHS) {
    describe(`on the ${path[0]} path`, () => {
      it('yields each member once in insertion order; a re-added member moves to the end [013 S1-AC1]', () => {
        const set = makeOn(path, [1, 2, 3, 2])
        expect(set.toArray()).toEqual([1, 2, 3])
        set.delete(1)
        set.add(1)
        expect(set.toArray()).toEqual([2, 3, 1])
      })

      it('for…of and forEach match a native Set step for step across growth and shrinking [013 S1-AC1]', () => {
        const script = (
          value: number,
          target: { add(v: number): void; delete(v: number): void },
        ): void => {
          if (value < 150) {
            target.add(value + 3)
            target.add(value + 1000)
            target.delete(value + 1)
          }
          if (value === 60) for (let i = 0; i < 1200; i++) target.delete(i + 1000)
          if (value === 90) target.delete(0)
          if (value === 91) target.add(0)
        }
        for (const style of ['for-of', 'forEach'] as const) {
          const set = makeOn(path, [0, 1, 2, 3, 4]) as unknown as LinkedHashSet<number>
          const ours = {
            forEachValue(visit: (value: number) => void) {
              if (style === 'forEach')
                set.forEach((v) => {
                  visit(v)
                })
              else for (const v of set) visit(v)
            },
            add: (v: number) => set.add(v),
            delete: (v: number) => set.delete(v),
            clear: () => set.clear(),
          }
          const [mine, native] = liveRun(ours, new Set([0, 1, 2, 3, 4]), script)
          expect(mine.length).toBeGreaterThan(100)
          expect(mine).toEqual(native)
        }
      })

      it('ends an iteration on clear and visits members added after it [013 S1-AC1]', () => {
        const set = makeOn(path, [1, 2, 3])
        const seen: unknown[] = []
        for (const value of set) {
          seen.push(value)
          if (value === 1) {
            set.clear()
            set.add(7)
            set.add(8)
          }
        }
        expect(seen).toEqual([1, 7, 8])
        const it = set[Symbol.iterator]()
        set.clear()
        expect(it.next().done).toBe(true)
        set.add(1)
        expect(it.next().done).toBe(true)
      })

      it('continues with the remaining members after a cursor removal [013 S1-AC1]', () => {
        const set = makeOn(path, [1, 2, 3, 4, 5])
        const cursor = set.cursor()
        const seen: unknown[] = []
        while (cursor.hasNext()) {
          const value = cursor.next() as number
          seen.push(value)
          if (value % 2 === 0) cursor.remove()
          if (value === 3) {
            set.delete(1)
            set.add(1)
          }
        }
        expect(seen).toEqual([1, 2, 3, 4, 5, 1])
        expect(set.toArray()).toEqual([3, 5, 1])
      })
    })
  }

  it('matches a native Set across bucket re-seeding on the equivalence path [013 S1-AC1]', () => {
    let draws = 0
    setBucketSeedSourceForTesting(() => 0x1000 + draws++)
    // Few distinct hashes make long chains of different hashes, so the buckets are re-seeded.
    const set = new LinkedHashSet<number>([0, 1, 2], {
      equivalence: { equals: (a, b) => a === b, hash: (v) => v % 5 },
    })
    const native = new Set([0, 1, 2])
    const script = (value: number, target: { add(v: number): void; delete(v: number): void }) => {
      if (value < 300) target.add(value + 3)
      if (value % 7 === 0) target.delete(value + 1)
    }
    const ours = {
      forEachValue: (visit: (value: number) => void) => {
        for (const v of set) visit(v)
      },
      add: (v: number) => set.add(v),
      delete: (v: number) => set.delete(v),
      clear: () => set.clear(),
    }
    const [mine, theirs] = liveRun(ours, native, script)
    expect(mine).toEqual(theirs)
    expect(draws).toBeGreaterThan(1) // one seed for the table, more for re-seeds
  })
})

describe('LinkedHashSet as a hash set — the equivalence path and user functions', () => {
  const caseless: Equivalence<string> = {
    equals: (a, b) => a.toLowerCase() === b.toLowerCase(),
    hash: (s) => hashCode(s.toLowerCase()),
  }

  it('decides membership only by the equivalence [013 S1-AC1]', () => {
    const set = new LinkedHashSet(['Apple', 'apple', 'APPLE', 'pear'], { equivalence: caseless })
    expect(set.toArray()).toEqual(['Apple', 'pear'])
    expect(set.has('aPPle')).toBe(true)
    expect(set.delete('PEAR')).toBe(true)
    expect(set.toArray()).toEqual(['Apple'])
  })

  it('treats distinct objects equal under the protocol as one member with valueEquivalence [013 S1-AC1]', () => {
    const equalsKey = Symbol.for('javascript-collections-framework.equals')
    const hashKey = Symbol.for('javascript-collections-framework.hashCode')
    class Point {
      constructor(
        readonly x: number,
        readonly y: number,
      ) {}
      [equalsKey](other: unknown): boolean {
        return other instanceof Point && other.x === this.x && other.y === this.y
      }
      [hashKey](hash: (v: unknown) => number): number {
        return hash(this.x) * 31 + hash(this.y)
      }
    }
    const first = new Point(1, 2)
    const set = new LinkedHashSet<Point>([first, new Point(1, 2), new Point(2, 1)], {
      equivalence: valueEquivalence as Equivalence<Point>,
    })
    expect(set.size).toBe(2)
    expect(set.toArray()[0]).toBe(first)
    expect(set.has(new Point(2, 1))).toBe(true)
    expect(new LinkedHashSet([new Point(1, 2), new Point(1, 2)]).size).toBe(2) // default: identity
  })

  it('calls key and equivalence functions for null and undefined and lets their errors propagate [013 S1-AC1]', () => {
    const keys: unknown[] = []
    const keyed = new LinkedHashSet<unknown>([null, undefined], {
      key: (v) => {
        keys.push(v)
        return 'same'
      },
    })
    expect(keys).toEqual([null, undefined])
    expect(keyed.size).toBe(1)
    expect(keyed.toArray()).toEqual([null])
    const hashed: unknown[] = []
    const bucketed = new LinkedHashSet<unknown>([null, undefined], {
      equivalence: {
        equals: (a, b) => a === b,
        hash: (v) => {
          hashed.push(v)
          return 0
        },
      },
    })
    expect(hashed).toEqual([null, undefined])
    expect(bucketed.size).toBe(2)
    const failure = new Error('no nulls')
    const strict = new LinkedHashSet<{ id: number } | null>({
      key: (v) => {
        if (v === null) throw failure
        return v.id
      },
    })
    expect(caught(() => strict.add(null))).toBe(failure)
    expect(strict.size).toBe(0)
  })

  it('keeps equals calls per operation constant over a seeded workload [013 S1-AC1]', () => {
    let equalsCalls = 0
    let operations = 0
    const set = new LinkedHashSet<number>({
      equivalence: {
        equals: (a, b) => {
          equalsCalls++
          return a === b
        },
        hash: (v) => hashCode(v),
      },
    })
    let state = 0x2026
    const next = () => {
      state = (Math.imul(state, 1103515245) + 12345) >>> 0
      return state % 5000
    }
    for (let i = 0; i < 20000; i++) {
      const v = next()
      const op = i % 3
      if (op === 0) set.add(v)
      else if (op === 1) set.has(v)
      else set.delete(next())
      operations++
    }
    expect(equalsCalls / operations).toBeLessThanOrEqual(2)
  })

  it('calls key or hash once per argument value per operation and never for stored members [013 S1-AC1]', () => {
    for (const kind of ['key', 'equivalence'] as const) {
      const calls: number[] = []
      const record = (v: number): number => {
        calls.push(v)
        return v
      }
      const options: LinkedHashSetOptions<number> =
        kind === 'key'
          ? { key: record }
          : { equivalence: { equals: (a, b) => a === b, hash: (v) => record(v) % 7 } }
      const set = new LinkedHashSet<number>(options)
      const expectCalls = (expected: number[], what: string) => {
        expect(calls, `${kind} ${what}`).toEqual(expected)
        calls.length = 0
      }
      // Grow past several thresholds (and, with only 7 hashes, through re-seeding).
      for (let i = 0; i < 300; i++) set.add(i)
      expectCalls(
        Array.from({ length: 300 }, (_, i) => i),
        'add',
      )
      set.add(5)
      expectCalls([5], 'add of a present member')
      set.has(7)
      expectCalls([7], 'has')
      set.delete(8)
      expectCalls([8], 'delete')
      set.removeIf((v) => v >= 20)
      expectCalls([], 'removeIf (shrinks)')
      set.removeAll([1, 2, 99])
      expectCalls([1, 2, 99], 'removeAll')
      set.retainAll([3, 4, 5, 6, 7])
      expectCalls([3, 4, 5, 6, 7], 'retainAll')
      const cursor = set.cursor()
      cursor.next()
      cursor.remove()
      expectCalls([], 'cursor remove')
      set.addAll([40, 41])
      expectCalls([40, 41], 'addAll')
      const copy = set.copy()
      expectCalls([], 'copy')
      expect(copy.equals(set)).toBe(true)
      expect(calls.length).toBe(2 * set.size)
      calls.length = 0
      String(set)
      set.toArray()
      set.clear()
      expectCalls([], 'clear')
    }
  })

  it('throws ConcurrentModificationError naming the method when a callback changes the set [013 S1-AC1]', () => {
    let target: LinkedHashSet<number> | undefined
    let action: ((set: LinkedHashSet<number>) => void) | undefined
    const run = (v: number): number => {
      const act = action
      action = undefined
      if (act !== undefined && target !== undefined) act(target)
      return v
    }
    for (const kind of ['key', 'equivalence'] as const) {
      const options: LinkedHashSetOptions<number> =
        kind === 'key'
          ? { key: run }
          : { equivalence: { equals: (a, b) => a === b, hash: (v) => run(v) } }
      const set = new LinkedHashSet<number>([1, 2, 3], options)
      target = set
      action = (s) => s.add(10)
      expect(messageOf(() => set.add(4))).toBe(
        'LinkedHashSet.add: the set was changed by a key, equals or hash function',
      )
      expect(set.has(4)).toBe(false) // the outer add made no change
      expect(set.has(10)).toBe(true) // the callback's change stays
      action = (s) => s.delete(10)
      expect(() => set.delete(1)).toThrow(ConcurrentModificationError)
      expect(set.has(1)).toBe(true)
      expect(set.has(10)).toBe(false)
      action = (s) => s.clear()
      expect(messageOf(() => set.has(1))).toContain('LinkedHashSet.has: ')
      expect(set.size).toBe(0)
      set.addAll([1, 2, 3])
      action = (s) => {
        s.has(1) // reads are allowed
        s.toArray()
      }
      expect(set.add(5)).toBe(set)
      expect(set.has(5)).toBe(true)
      const failure = new Error('callback failed')
      action = () => {
        throw failure
      }
      expect(caught(() => set.add(6))).toBe(failure)
      expect(set.has(6)).toBe(false)
      // addAll keeps what it added before the failing element.
      let count = 0
      action = undefined
      const before = set.size
      const failing = new LinkedHashSet<number>(
        kind === 'key'
          ? {
              key: (v) => {
                if (++count === 3) throw failure
                return v
              },
            }
          : {
              equivalence: {
                equals: (a, b) => a === b,
                hash: (v) => {
                  if (++count === 3) throw failure
                  return v
                },
              },
            },
      )
      expect(caught(() => failing.addAll([7, 8, 9, 10]))).toBe(failure)
      expect(failing.toArray()).toEqual([7, 8])
      expect(set.size).toBe(before)
      // removeAll and retainAll change nothing when a callback changes the set while deciding.
      action = (s) => s.add(77)
      expect(() => set.removeAll([1, 2])).toThrow(ConcurrentModificationError)
      expect(set.has(1)).toBe(true)
      expect(set.has(77)).toBe(true)
      action = (s) => s.add(78)
      expect(messageOf(() => set.retainAll([1]))).toContain('LinkedHashSet.retainAll: ')
      expect(set.has(2)).toBe(true)
    }
  })

  it('throws when an equals function changes the set while comparing [013 S1-AC1]', () => {
    let target: LinkedHashSet<number> | undefined
    let armed = false
    const set = new LinkedHashSet<number>([1, 2], {
      equivalence: {
        equals: (a, b) => {
          if (armed && target !== undefined) {
            armed = false
            target.delete(2)
          }
          return a === b
        },
        hash: () => 0,
      },
    })
    target = set
    armed = true
    expect(messageOf(() => set.add(3))).toBe(
      'LinkedHashSet.add: the set was changed by a key, equals or hash function',
    )
    expect(set.toArray()).toEqual([1])
  })

  it('does not crash when a member changes its key or hash while stored [013 S1-AC1]', () => {
    const item = { id: 1 }
    const keyed = new LinkedHashSet<{ id: number }>([item, { id: 2 }], { key: (v) => v.id })
    item.id = 5
    expect(() => keyed.has(item)).not.toThrow()
    expect(() => keyed.add(item)).not.toThrow()
    expect(keyed.size).toBeGreaterThanOrEqual(2)
    const bucketed = new LinkedHashSet<{ id: number }>([item], {
      equivalence: { equals: (a, b) => a.id === b.id, hash: (v) => v.id },
    })
    item.id = 6
    expect(() => bucketed.delete(item)).not.toThrow()
    expect(() => [...bucketed, bucketed.toArray(), String(bucketed)]).not.toThrow()
  })

  it('removes a member whose key or hash changed by its stored entry, without calling user functions [013 S1-AC1]', () => {
    for (const kind of ['key', 'equivalence'] as const) {
      let calls = 0
      const idOf = (v: { id: number }): number => {
        calls++
        return v.id
      }
      const options: LinkedHashSetOptions<{ id: number }> =
        kind === 'key'
          ? { key: idOf }
          : { equivalence: { equals: (a, b) => a.id === b.id, hash: idOf } }
      const make = () => {
        const items = [{ id: 1 }, { id: 2 }, { id: 3 }]
        const set = new LinkedHashSet(items, options)
        for (const item of items) item.id += 100
        calls = 0
        return { set, items }
      }
      let { set, items } = make()
      const cursor = set.cursor()
      cursor.next()
      cursor.remove()
      expect(set.toArray()).toEqual([items[1], items[2]])
      ;({ set, items } = make())
      set.removeIf((v) => v === items[0])
      expect(set.toArray()).toEqual([items[1], items[2]])
      ;({ set, items } = make())
      set.clear()
      expect(set.size).toBe(0)
      expect(calls, kind).toBe(0)
      ;({ set, items } = make())
      set.retainAll([])
      expect(set.size).toBe(0)
      expect(calls, kind).toBe(0)
      if (kind === 'key') {
        ;({ set, items } = make())
        set.removeAll([{ id: 2 }]) // matched against the stored key, not a recomputed one
        expect(set.toArray()).toEqual([items[0], items[2]])
        expect(calls).toBe(1) // only the argument
        ;({ set, items } = make())
        set.retainAll([{ id: 3 }])
        expect(set.toArray()).toEqual([items[2]])
      }
    }
  })

  it('a cursor whose last member is already gone deletes it by value, removing an equal member added again [013 S1-AC1]', () => {
    for (const path of PATHS) {
      const set = makeOn(path, ['a', 'b'])
      const cursor = set.cursor()
      expect(cursor.next()).toBe('a')
      set.delete('a')
      set.add('a')
      expect(set.toArray()).toEqual(['b', 'a'])
      cursor.remove()
      expect(set.toArray(), path[0]).toEqual(['b'])
      const other = makeOn(path, ['x'])
      const c2 = other.cursor()
      c2.next()
      other.delete('x')
      expect(() => c2.remove()).not.toThrow()
      expect(other.size).toBe(0)
    }
    const first = { id: 1 }
    const second = { id: 1 }
    const keyed = new LinkedHashSet<{ id: number }>([first], { key: (v) => v.id })
    const cursor = keyed.cursor()
    cursor.next()
    keyed.delete(first)
    keyed.add(second)
    cursor.remove()
    expect(keyed.size).toBe(0)
  })
})

describe('LinkedHashSet as a hash set — option checks', () => {
  it('reads equivalence functions once and calls them with this set to the equivalence [013 S1-AC1]', () => {
    let reads = 0
    const receivers: unknown[] = []
    const equivalence = {
      get equals() {
        reads++
        return function (this: unknown, a: unknown, b: unknown) {
          receivers.push(this)
          return a === b
        }
      },
      get hash() {
        reads++
        return function (this: unknown) {
          receivers.push(this)
          return 0
        }
      },
    }
    const set = new LinkedHashSet<unknown>([1, 2], { equivalence })
    set.has(2)
    set.delete(1)
    expect(reads).toBe(2)
    expect(receivers.length).toBeGreaterThan(0)
    expect(receivers.every((r) => r === equivalence)).toBe(true)
  })

  it('rejects an invalid equivalence naming the constructor before storing anything [013 S1-AC1]', () => {
    const message = 'LinkedHashSet: equivalence must be an object with equals and hash functions'
    for (const bad of [null, 5, 'x', {}, { equals: () => true }, { hash: () => 0 }]) {
      expect(messageOf(() => new LinkedHashSet([1], { equivalence: bad as never }))).toBe(message)
    }
    expect(messageOf(() => LinkedHashSet.from([1], { equivalence: null as never }))).toBe(
      'LinkedHashSet.from: equivalence must be an object with equals and hash functions',
    )
  })

  it('rejects invalid equals and hash results naming the method and leaves the set unchanged [013 S1-AC1]', () => {
    const set = new LinkedHashSet<number>([1], {
      equivalence: { equals: () => 1 as never, hash: () => 0 },
    })
    expect(messageOf(() => set.add(2))).toBe('LinkedHashSet.add: equivalence.equals returned 1')
    expect(set.toArray()).toEqual([1])
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, '1', undefined]) {
      const hashing = new LinkedHashSet<number>({
        equivalence: { equals: (a, b) => a === b, hash: () => bad as never },
      })
      expect(() => hashing.add(1)).toThrow(TypeError)
      expect(messageOf(() => hashing.has(1))).toMatch(
        /^LinkedHashSet\.has: equivalence\.hash returned /,
      )
      expect(hashing.size).toBe(0)
    }
    const big = new LinkedHashSet<number>({
      equivalence: { equals: (a, b) => a === b, hash: (v) => v * 2 ** 40 + 0.5 },
    })
    big.add(1).add(2)
    expect(big.has(2)).toBe(true)
  })

  it('recognises the built-in equivalences so protocol errors name the LinkedHashSet method [013 S1-AC1]', () => {
    const halfEquals = { [Symbol.for('javascript-collections-framework.equals')]: () => true }
    const set = new LinkedHashSet<unknown>({ equivalence: valueEquivalence })
    expect(messageOf(() => set.add(halfEquals))).toBe(
      'LinkedHashSet.add: object implements [equalsSymbol] without [hashCodeSymbol]',
    )
    const nested = {
      [Symbol.for('javascript-collections-framework.equals')]: () => true,
      [Symbol.for('javascript-collections-framework.hashCode')]: (hash: (v: unknown) => number) =>
        hash(halfEquals),
    }
    expect(messageOf(() => set.has(nested))).toBe(
      'LinkedHashSet.has: object implements [equalsSymbol] without [hashCodeSymbol]',
    )
    const badEquals = {
      [Symbol.for('javascript-collections-framework.equals')]: () => 'yes',
      [Symbol.for('javascript-collections-framework.hashCode')]: () => 1,
    }
    set.add(badEquals)
    const twin = { ...badEquals }
    expect(messageOf(() => set.delete(twin))).toBe(
      'LinkedHashSet.delete: [equalsSymbol] returned "yes"',
    )
  })

  it('reads key once, calls it with only the value, and rejects object results and bad options [013 S1-AC1]', () => {
    let reads = 0
    const argumentCounts: number[] = []
    const options = {
      get key() {
        reads++
        return function (this: unknown, ...args: unknown[]) {
          argumentCounts.push(args.length)
          expect(this).toBeUndefined()
          return args[0] as number
        }
      },
    }
    const set = new LinkedHashSet<number>([1, 2], options)
    set.has(1)
    set.delete(2)
    expect(reads).toBe(1)
    expect(argumentCounts).toEqual([1, 1, 1, 1])
    const boxed = new LinkedHashSet<string>({ key: (s) => new String(s) as never })
    expect(messageOf(() => boxed.add('a'))).toBe('LinkedHashSet.add: key function returned object')
    expect(messageOf(() => boxed.removeAll(['a']))).toBe(
      'LinkedHashSet.removeAll: key function returned object',
    )
    const fn = new LinkedHashSet<string>({ key: () => (() => 1) as never })
    expect(messageOf(() => fn.has('a'))).toBe('LinkedHashSet.has: key function returned function')
    for (const bad of [null, 1, 'k', {}]) {
      expect(messageOf(() => new LinkedHashSet([1], { key: bad as never }))).toBe(
        'LinkedHashSet: key is not a function',
      )
    }
    expect(messageOf(() => LinkedHashSet.from([1], { key: null as never }))).toBe(
      'LinkedHashSet.from: key is not a function',
    )
  })
})

describe('LinkedHashSet as a hash set — construction', () => {
  it('rejects key and equivalence together, naming the constructor, before calling either [013 S1-AC1]', () => {
    let calls = 0
    const key = (v: number) => {
      calls++
      return v
    }
    const options = { key, equivalence: valueEquivalence as Equivalence<number> }
    expect(messageOf(() => new LinkedHashSet([1, 2], options))).toBe(
      'LinkedHashSet: key and equivalence cannot both be given',
    )
    expect(caught(() => LinkedHashSet.from([1], options))).toBeInstanceOf(TypeError)
    expect(messageOf(() => LinkedHashSet.from([1], options))).toMatch(/^LinkedHashSet\.from: /)
    expect(calls).toBe(0)
  })

  it('copy and from keep the same key or equivalence [013 S1-AC1]', () => {
    const byId = { key: (v: { id: number }) => v.id }
    const set = new LinkedHashSet([{ id: 1 }], byId)
    const copy = set.copy()
    copy.add({ id: 1 })
    expect(copy.size).toBe(1)
    const from = LinkedHashSet.from([{ id: 1 }, { id: 1 }, { id: 2 }], byId)
    expect(from.size).toBe(2)
    const caseless: Equivalence<string> = {
      equals: (a, b) => a.toLowerCase() === b.toLowerCase(),
      hash: (s) => hashCode(s.toLowerCase()),
    }
    const words = new LinkedHashSet(['A'], { equivalence: caseless }).copy()
    expect(words.add('a').size).toBe(1)
    expect(words.has('a')).toBe(true)
    expect(new LinkedHashSet([1, 2]).copy().toArray()).toEqual([1, 2])
  })

  it('reads its arguments by the native Set rules: elements first, then options [013 S1-AC1]', () => {
    expect(new LinkedHashSet('aba').toArray()).toEqual(['a', 'b'])
    expect(new LinkedHashSet().size).toBe(0)
    expect(new LinkedHashSet(undefined).size).toBe(0)
    expect(new LinkedHashSet(null).size).toBe(0)
    expect(new LinkedHashSet(null, { key: (s: string) => s.length }).add('a').add('b').size).toBe(1)
    expect(new LinkedHashSet(undefined, null).size).toBe(0)
    expect(new LinkedHashSet<string>({ key: (s) => s.length }).add('a').add('b').size).toBe(1)
    expect(
      new LinkedHashSet<string>({ key: (s: string) => s.length } as never, null).add('a').add('b')
        .size,
    ).toBe(1)
    expect(new LinkedHashSet([1], null).toArray()).toEqual([1])
    expect(new LinkedHashSet({} as never).size).toBe(0)
    expect(messageOf(() => new LinkedHashSet(5 as never))).toBe(
      'LinkedHashSet: elements is not iterable (5)',
    )
    expect(messageOf(() => new LinkedHashSet((() => 1) as never))).toBe(
      'LinkedHashSet: elements is not iterable (function)',
    )
    expect(messageOf(() => new LinkedHashSet({} as never, {}))).toBe(
      'LinkedHashSet: elements is not iterable (object)',
    )
    expect(messageOf(() => new LinkedHashSet(true as never, null))).toBe(
      'LinkedHashSet: elements is not iterable (true)',
    )
    expect(messageOf(() => new LinkedHashSet([1], 5 as never))).toBe(
      'LinkedHashSet: options is not an object (5)',
    )
    expect(messageOf(() => new LinkedHashSet(undefined, 'x' as never))).toBe(
      'LinkedHashSet: options is not an object ("x")',
    )
    expect(messageOf(() => new LinkedHashSet([1], (() => 1) as never))).toBe(
      'LinkedHashSet: options is not an object (function)',
    )
    expect(messageOf(() => LinkedHashSet.from([1], 5 as never))).toBe(
      'LinkedHashSet.from: options is not an object (5)',
    )
    expect(LinkedHashSet.from([1], null).toArray()).toEqual([1])
  })

  it('holds each distinct element once in first-seen order and rejects a non-iterable [013 S1-AC1]', () => {
    expect(new LinkedHashSet([3, 1, 3, 2, 1]).toArray()).toEqual([3, 1, 2])
    expect(LinkedHashSet.from(new Set([3, 1]).values()).toArray()).toEqual([3, 1])
    expect(LinkedHashSet.from('hello').toArray()).toEqual(['h', 'e', 'l', 'o'])
    for (const bad of [null, undefined, 5, {}]) {
      expect(() => LinkedHashSet.from(bad as never)).toThrow(TypeError)
    }
    expect(messageOf(() => LinkedHashSet.from(null as never))).toBe(
      'LinkedHashSet.from: elements is not iterable (null)',
    )
    expect(messageOf(() => new LinkedHashSet({ length: 1, 0: 'a' } as never, {}))).toBe(
      'LinkedHashSet: elements is not iterable (object)',
    )
  })

  it('changes revision only when the members change [013 S1-AC1]', () => {
    for (const path of PATHS) {
      const set = makeOn(path, [1, 2])
      let revision = set.revision
      const unchanged = (what: string) => expect(set.revision, `${path[0]} ${what}`).toBe(revision)
      const changed = (what: string) => {
        expect(set.revision, `${path[0]} ${what}`).not.toBe(revision)
        revision = set.revision
      }
      set.add(1)
      unchanged('add present')
      set.delete(9)
      unchanged('delete absent')
      set.addAll([1, 2])
      unchanged('addAll present')
      set.removeAll([9])
      unchanged('removeAll absent')
      set.retainAll([1, 2])
      unchanged('retainAll all')
      set.removeIf(() => false)
      unchanged('removeIf none')
      set.add(3)
      changed('add')
      set.delete(3)
      changed('delete')
      set.removeAll([2])
      changed('removeAll')
      set.addAll([4])
      changed('addAll')
      set.retainAll([4])
      changed('retainAll')
      set.removeIf(() => true)
      changed('removeIf')
      set.clear()
      unchanged('clear empty')
      set.add(5)
      changed('add')
      set.clear()
      changed('clear')
    }
  })
})

describe('LinkedHashSet as a hash set — equality, hashing and output', () => {
  it('equals compares members both ways, whatever the order or element equality [013 S1-AC1]', () => {
    const a = new LinkedHashSet([1, 2, 3])
    const b = new LinkedHashSet([3, 1, 2])
    expect(a.equals(b)).toBe(true)
    expect(b.equals(a)).toBe(true)
    expect(a.equals(new LinkedHashSet([1, 2]))).toBe(false)
    expect(a.equals(new LinkedHashSet([1, 2, 4]))).toBe(false)
    // A caseless set has 'a' for 'A', but the default set does not have 'A' for 'a'.
    const caseless = new LinkedHashSet(['A', 'b'], {
      equivalence: {
        equals: (x: string, y: string) => x.toLowerCase() === y.toLowerCase(),
        hash: (s: string) => hashCode(s.toLowerCase()),
      },
    })
    const plain = new LinkedHashSet(['a', 'b'])
    expect(caseless.equals(plain)).toBe(false)
    expect(plain.equals(caseless)).toBe(false)
    const keyed = new LinkedHashSet(['b', 'A'], { key: (s: string) => s })
    expect(keyed.equals(caseless)).toBe(caseless.equals(keyed))
    expect(keyed.equals(caseless)).toBe(true)
  })

  it('is never equal to a list, a queue, a native Set, an array or a map [013 S1-AC1]', () => {
    const set = new LinkedHashSet([1, 2])
    for (const other of [
      new ArrayList([1, 2]),
      new ArrayDeque([1, 2]),
      new Set([1, 2]),
      [1, 2],
      new Map([
        [1, 1],
        [2, 2],
      ]),
    ]) {
      expect(set.equals(other)).toBe(false)
    }
    expect(new ArrayList([1, 2]).equals(set)).toBe(false)
  })

  it('gives equal sets with the same equality the same order-independent hash [013 S1-AC1]', () => {
    const standIn = (v: unknown) => (typeof v === 'number' ? v * 7 : 1000)
    const plainA = new LinkedHashSet([1, 2, 3])
    const plainB = new LinkedHashSet([3, 2, 1])
    expect(plainA[hashCodeSymbol](standIn)).toBe(plainB[hashCodeSymbol](standIn))
    const svz = new LinkedHashSet([2, 3, 1], { equivalence: sameValueZeroEquivalence })
    expect(svz[hashCodeSymbol](standIn)).toBe(plainA[hashCodeSymbol](standIn))
    const value = new LinkedHashSet([1, 3, 2], {
      equivalence: valueEquivalence as Equivalence<number>,
    })
    expect(value[hashCodeSymbol](standIn)).toBe(plainA[hashCodeSymbol](standIn))
    const key = (v: number) => v * 10
    const keyedA = new LinkedHashSet([1, 2], { key })
    const keyedB = new LinkedHashSet([2, 1], { key })
    expect(keyedA[hashCodeSymbol](standIn)).toBe(keyedB[hashCodeSymbol](standIn))
    const user: Equivalence<number> = { equals: (a, b) => a === b, hash: (v) => v + 100 }
    const userA = new LinkedHashSet([1, 2], { equivalence: user })
    const userB = new LinkedHashSet([2, 1], { equivalence: user })
    expect(userA[hashCodeSymbol](standIn)).toBe(userB[hashCodeSymbol](standIn))
    expect(hashCode(plainA)).toBe(hashCode(plainB))
    expect('hashCode' in plainA).toBe(false)
  })

  it('hashes equal valueEquivalence sets from two loaded copies alike [013 S1-AC1]', async () => {
    const { vi } = await import('vitest')
    const equalsKey = Symbol.for('javascript-collections-framework.equals')
    const hashKey = Symbol.for('javascript-collections-framework.hashCode')
    const point = (x: number) => ({
      x,
      [equalsKey]: (other: { x?: number }) => other.x === x,
      [hashKey]: (hash: (v: unknown) => number) => hash(x),
    })
    const first = await import('../src/collections/linked-hash-set')
    const firstEquality = await import('../src/internal/equality')
    vi.resetModules()
    const second = await import('../src/collections/linked-hash-set')
    const secondEquality = await import('../src/internal/equality')
    expect(second.LinkedHashSet).not.toBe(first.LinkedHashSet)
    const a = new first.LinkedHashSet([point(1), point(2)], {
      equivalence: firstEquality.valueEquivalence,
    })
    const b = new second.LinkedHashSet([point(2), point(1)], {
      equivalence: secondEquality.valueEquivalence,
    })
    const standIn = (v: unknown) => (typeof v === 'number' ? v * 3 : 7)
    expect(a.equals(b)).toBe(true)
    expect(a[hashCodeSymbol](standIn)).toBe(b[hashCodeSymbol](standIn))
  })

  it('prints [Circular] for a set that contains itself and terminates equals and hashing [013 S1-AC1]', () => {
    for (const path of PATHS) {
      const a = makeOn(path, [1])
      a.add(a)
      expect(String(a)).toBe('LinkedHashSet(2) {1, [Circular]}')
      expect(a.equals(a)).toBe(true)
      expect(typeof hashCode(a)).toBe('number')
      const b = makeOn(path, [1])
      b.add(b)
      expect(a.equals(b)).toBe(b.equals(a))
    }
    const value = new LinkedHashSet<unknown>([1], { equivalence: valueEquivalence })
    value.add(value)
    const other = new LinkedHashSet<unknown>([1], { equivalence: valueEquivalence })
    other.add(other)
    expect(() => value.equals(other)).not.toThrow()
    expect(value.equals(other)).toBe(other.equals(value))
    expect(typeof hashCode(value)).toBe('number')
  })

  it('prints LinkedHashSet(n) {...} in insertion order and writes JSON as an array [013 S1-AC1]', () => {
    const set = new LinkedHashSet<unknown>(['b', 1, null, -0])
    expect(String(set)).toBe("LinkedHashSet(4) {'b', 1, null, 0}")
    expect(set.toString()).toBe("LinkedHashSet(4) {'b', 1, null, 0}")
    expect(String(new LinkedHashSet())).toBe('LinkedHashSet(0) {}')
    expect(set.toJSON()).toEqual(['b', 1, null, 0])
    expect(JSON.stringify(new LinkedHashSet([2, 1]))).toBe('[2,1]')
    expect(Object.prototype.toString.call(set)).toBe('[object LinkedHashSet]')
  })
})

// ── Order and both ends ──

/** Records every `key`, `hash` and `equals` call a set makes, on the path it was built for. */
function counting(path: Path): {
  options: LinkedHashSetOptions<unknown> | undefined
  calls: unknown[]
} {
  const calls: unknown[] = []
  if (path[0] === 'key') {
    const key = identityKey()
    return {
      calls,
      options: {
        key: (v) => {
          calls.push(['key', v])
          return key(v) as never
        },
      },
    }
  }
  if (path[0] === 'equivalence') {
    return {
      calls,
      options: {
        equivalence: {
          equals: (a, b) => {
            calls.push(['equals', a, b])
            return sameValueZeroEquivalence.equals(a, b)
          },
          hash: (v) => {
            calls.push(['hash', v])
            return sameValueZeroEquivalence.hash(v)
          },
        },
      },
    }
  }
  return { calls, options: undefined }
}

describe('LinkedHashSet — insertion order', () => {
  for (const path of PATHS) {
    it(`iterates in insertion order through every output, add keeping a present member's place (${path[0]}) [013 S1-AC2]`, () => {
      const set = makeOn(path, ['c', 'a', 'b'])
      const revision = set.revision
      set.add('c')
      expect(set.revision).toBe(revision)
      set.delete('a')
      set.add('a')
      const expected = ['c', 'b', 'a']
      expect([...set]).toEqual(expected)
      expect([...set.keys()]).toEqual(expected)
      expect([...set.values()]).toEqual(expected)
      expect([...set.entries()]).toEqual(expected.map((v) => [v, v]))
      const seen: unknown[] = []
      set.forEach((v) => {
        seen.push(v)
      })
      expect(seen).toEqual(expected)
      expect(set.toArray()).toEqual(expected)
      expect(set.toJSON()).toEqual(expected)
      expect(String(set)).toBe("LinkedHashSet(3) {'c', 'b', 'a'}")
      expect(inspect(set)).toBe("LinkedHashSet(3) { 'c', 'b', 'a' }")
      expect(Object.prototype.toString.call(set)).toBe('[object LinkedHashSet]')
    })
  }
})

describe('LinkedHashSet — both ends', () => {
  for (const path of PATHS) {
    describe(`on the ${path[0]} path`, () => {
      it('getFirst and getLast return the ends, or throw NoSuchElementError naming the method [013 S2-AC1]', () => {
        const set = makeOn(path, [1, 2, 3])
        expect(set.getFirst()).toBe(1)
        expect(set.getLast()).toBe(3)
        set.addFirst(0)
        expect(set.getFirst()).toBe(0)
        const empty = makeOn(path)
        expect(() => empty.getFirst()).toThrow(NoSuchElementError)
        expect(messageOf(() => empty.getFirst())).toBe('LinkedHashSet.getFirst: the set is empty')
        expect(messageOf(() => empty.getLast())).toBe('LinkedHashSet.getLast: the set is empty')
      })

      it('removeFirst and removeLast remove and return the ends, or throw and change nothing [013 S2-AC2]', () => {
        const set = makeOn(path, [1, 2, 3])
        expect(set.removeFirst()).toBe(1)
        expect(set.removeLast()).toBe(3)
        expect(set.toArray()).toEqual([2])
        expect(set.has(1)).toBe(false)
        expect(set.removeLast()).toBe(2)
        const revision = set.revision
        expect(() => set.removeFirst()).toThrow(NoSuchElementError)
        expect(messageOf(() => set.removeFirst())).toBe(
          'LinkedHashSet.removeFirst: the set is empty',
        )
        expect(messageOf(() => set.removeLast())).toBe('LinkedHashSet.removeLast: the set is empty')
        expect(set.revision).toBe(revision)
        expect(set.size).toBe(0)
      })

      it('addFirst and addLast insert an absent element at that end or move the present member, returning the set [013 S2-AC3]', () => {
        const set = makeOn(path, [2, 3])
        expect(set.addFirst(1)).toBe(set)
        expect(set.addLast(4)).toBe(set)
        expect(set.toArray()).toEqual([1, 2, 3, 4])
        expect(set.addFirst(3)).toBe(set)
        expect(set.toArray()).toEqual([3, 1, 2, 4])
        expect(set.addLast(1)).toBe(set)
        expect(set.toArray()).toEqual([3, 2, 4, 1])
        expect(set.size).toBe(4)
      })

      it('addFirst and addLast store -0 as 0 and accept null and undefined [013 S2-AC4]', () => {
        const set = makeOn(path, [1])
        set.addFirst(-0)
        expect(Object.is(set.getFirst(), 0)).toBe(true)
        set.addLast(-0)
        expect(Object.is(set.getLast(), 0)).toBe(true)
        expect(set.size).toBe(2)
        set.addFirst(null).addLast(undefined)
        expect(set.toArray()).toEqual([null, 1, 0, undefined])
        set.addLast(null)
        expect(set.toArray()).toEqual([1, 0, undefined, null])
      })

      it('addFirst and addLast call key or hash exactly once for the argument [013 S2-AC4]', () => {
        const { options, calls } = counting(path)
        const set = new LinkedHashSet<unknown>([1, 2, 3], options)
        calls.length = 0
        set.addFirst(3)
        set.addLast(1)
        set.addFirst(9)
        set.addLast(8)
        const derivations = calls.filter((c) => (c as unknown[])[0] !== 'equals')
        expect(derivations).toEqual(
          path[0] === 'default'
            ? []
            : [3, 1, 9, 8].map((v) => [path[0] === 'key' ? 'key' : 'hash', v]),
        )
      })

      it('changes revision on every insertion, removal and move, and never on a call that changes nothing [013 S2-AC5]', () => {
        const set = makeOn(path, [1, 2, 3])
        let revision = set.revision
        const changed = (expectChange: boolean, what: string) => {
          if (expectChange) expect(set.revision, what).not.toBe(revision)
          else expect(set.revision, what).toBe(revision)
          revision = set.revision
        }
        set.addFirst(1)
        changed(false, 'addFirst of the first member')
        set.addLast(3)
        changed(false, 'addLast of the last member')
        set.add(2)
        changed(false, 'add of a present member')
        const it = set[Symbol.iterator]()
        expect(it.next().value).toBe(1)
        set.addFirst(1)
        set.addLast(3)
        expect([...it]).toEqual([2, 3])
        set.addFirst(3)
        changed(true, 'move to the front')
        set.addLast(3)
        changed(true, 'move to the back')
        set.addFirst(0)
        changed(true, 'insert at the front')
        set.removeLast()
        changed(true, 'removeLast')
        set.delete(9)
        changed(false, 'delete of an absent value')
        expect(() => set.getFirst()).not.toThrow()
        changed(false, 'getFirst')
      })

      it('getFirst, getLast, removeFirst and removeLast call no key, equals or hash function [013 S2-AC6]', () => {
        const { options, calls } = counting(path)
        const set = new LinkedHashSet<unknown>([1, 2, 3, 4], options)
        calls.length = 0
        set.getFirst()
        set.getLast()
        set.removeFirst()
        set.removeLast()
        expect(calls).toEqual([])
        expect(set.toArray()).toEqual([2, 3])
      })

      it('the reversed view’s ends and its cursor’s remove of a moved member call no key, equals or hash function [013 S2-AC6]', () => {
        const { options, calls } = counting(path)
        const set = new LinkedHashSet<unknown>([1, 2, 3, 4, 5], options)
        const view = set.reversed()
        calls.length = 0
        view.getFirst()
        view.getLast()
        view.removeFirst()
        view.removeLast()
        expect(calls).toEqual([])
        expect(set.toArray()).toEqual([2, 3, 4])
        const cursor = view.cursor()
        expect(cursor.next()).toBe(4)
        set.addFirst(4)
        calls.length = 0
        cursor.remove()
        expect(calls).toEqual([])
        expect(set.toArray()).toEqual([2, 3])
      })
    })
  }

  it('calls key or hash once per argument value and never for stored members across moves, growth, shrinking and re-seeding [013 S2-AC4]', () => {
    for (const kind of ['key', 'equivalence'] as const) {
      const calls: number[] = []
      const record = (v: number): number => {
        calls.push(v)
        return v
      }
      const options: LinkedHashSetOptions<number> =
        kind === 'key'
          ? { key: record }
          : { equivalence: { equals: (a, b) => a === b, hash: (v) => record(v) % 7 } }
      const set = new LinkedHashSet<number>(options)
      let state = 0x13
      const next = () => {
        state = (Math.imul(state, 1103515245) + 12345) >>> 0
        return state % 400
      }
      for (let i = 0; i < 6000; i++) {
        const v = next()
        const op = i % 6
        calls.length = 0
        if (op === 0 || op === 1) set.add(v)
        else if (op === 2) set.addFirst(v)
        else if (op === 3) set.addLast(v)
        else if (op === 4) set.delete(v)
        else if (!set.isEmpty()) {
          if (v % 2 === 0) set.removeFirst()
          else set.removeLast()
          expect(calls, `${kind} end removal`).toEqual([])
          continue
        }
        expect(calls, `${kind} step ${i}`).toEqual([v])
      }
      calls.length = 0
      set.removeIf((v) => v % 3 !== 0)
      expect(calls, `${kind} removeIf (shrinks)`).toEqual([])
    }
  }, 60000)

  it('removes the ends of members whose key or hash changed, calling nothing [013 S2-AC6]', () => {
    for (const kind of ['key', 'equivalence'] as const) {
      let calls = 0
      const options: LinkedHashSetOptions<{ id: number }> =
        kind === 'key'
          ? {
              key: (v) => {
                calls++
                return v.id
              },
            }
          : {
              equivalence: {
                equals: (a, b) => {
                  calls++
                  return a.id === b.id
                },
                hash: (v) => {
                  calls++
                  return v.id
                },
              },
            }
      const first = { id: 1 }
      const last = { id: 3 }
      const set = new LinkedHashSet([first, { id: 2 }, last], options)
      first.id = 100
      last.id = 300
      calls = 0
      expect(set.removeFirst()).toBe(first)
      expect(set.removeLast()).toBe(last)
      expect(calls).toBe(0)
      expect(set.size).toBe(1)
    }
  })

  it('moves the stored member, not the argument, on the key path [013 S2-AC3]', () => {
    const first = { id: 1, name: 'first' }
    const second = { id: 2, name: 'second' }
    const set = new LinkedHashSet<{ id: number; name: string }>([first, second], {
      key: (u) => u.id,
    })
    set.addLast({ id: 1, name: 'other' })
    expect(set.getLast()).toBe(first)
    set.addFirst({ id: 2, name: 'other' })
    expect(set.getFirst()).toBe(second)
    expect(set.size).toBe(2)
  })

  it('moves the stored member, not the argument, on the equivalence path [013 S2-AC3]', () => {
    const caseless: Equivalence<string> = {
      equals: (a, b) => a.toLowerCase() === b.toLowerCase(),
      hash: (s) => hashCode(s.toLowerCase()),
    }
    const set = new LinkedHashSet(['Apple', 'Pear'], { equivalence: caseless })
    set.addLast('APPLE')
    expect(set.toArray()).toEqual(['Pear', 'Apple'])
    set.addFirst('apple')
    expect(set.toArray()).toEqual(['Apple', 'Pear'])
  })

  it('throws ConcurrentModificationError and inserts or moves nothing when a callback changes the set [013 S2-AC4]', () => {
    for (const method of ['addFirst', 'addLast'] as const) {
      // A key function that moves the last member to the front during the call.
      let armed = false
      const set: LinkedHashSet<number> = new LinkedHashSet<number>([1, 2, 3], {
        key: (v) => {
          if (armed) {
            armed = false
            set.addFirst(set.getLast())
          }
          return v
        },
      })
      armed = true
      expect(() => set[method](9)).toThrow(ConcurrentModificationError)
      expect(
        messageOf(() => {
          armed = true
          set[method](2)
        }),
      ).toBe(`LinkedHashSet.${method}: the set was changed by a key, equals or hash function`)
      // The callback's own moves stay; the call itself inserted and moved nothing.
      expect(set.toArray()).toEqual([2, 3, 1])
    }
    // An equals function that moves a member.
    let armed = false
    const bucketed: LinkedHashSet<number> = new LinkedHashSet<number>([1, 2], {
      equivalence: {
        equals: (a, b) => {
          if (armed) {
            armed = false
            bucketed.addFirst(2)
          }
          return a === b
        },
        hash: () => 0,
      },
    })
    armed = true
    expect(() => bucketed.addLast(1)).toThrow(ConcurrentModificationError)
    expect(bucketed.toArray()).toEqual([2, 1])
    // A hash function that inserts.
    let armedHash = false
    const hashed: LinkedHashSet<number> = new LinkedHashSet<number>([1], {
      equivalence: {
        equals: (a, b) => a === b,
        hash: (v) => {
          if (armedHash) {
            armedHash = false
            hashed.add(5)
          }
          return v
        },
      },
    })
    armedHash = true
    expect(() => hashed.addFirst(7)).toThrow(ConcurrentModificationError)
    expect(hashed.toArray()).toEqual([1, 5])
  })

  it('throws from removeIf when the predicate moves a member, and removes nothing [013 S2-AC4]', () => {
    const set = new LinkedHashSet([1, 2, 3])
    expect(() =>
      set.removeIf((v) => {
        if (v === 2) set.addLast(1)
        return true
      }),
    ).toThrow(ConcurrentModificationError)
    expect(set.toArray()).toEqual([2, 3, 1])
  })

  it('keeps the changes a callback made, and the elements addAll added before an error, as changes [013 S2-AC5]', () => {
    const failure = new Error('rejected')
    const set = new LinkedHashSet<number>({
      key: (v) => {
        if (v === 3) throw failure
        return v
      },
    })
    const revision = set.revision
    expect(() => set.addAll([1, 2, 3, 4])).toThrow(failure)
    expect(set.toArray()).toEqual([1, 2])
    expect(set.revision).not.toBe(revision)
    const after = set.revision
    const it = set[Symbol.iterator]()
    expect(() => set.addFirst(3)).toThrow(failure)
    expect(() => set.addLast(3)).toThrow(failure)
    expect(set.revision).toBe(after)
    expect([...it]).toEqual([1, 2])
  })

  it('tells a moved member from the argument on the native path by SameValueZero [013 S2-AC3]', () => {
    const set = new LinkedHashSet<unknown>([Number.NaN, 0, 'x'])
    set.addLast(Number.NaN).addFirst('x').addLast(-0)
    expect(set.toArray()).toEqual(['x', Number.NaN, 0])
  })
})

// ── Reversed view ──

describe('LinkedHashSet — reversed view', () => {
  for (const path of PATHS) {
    describe(`on the ${path[0]} path`, () => {
      it('is a live set in the opposite order whose changes show in both, and reverses back to the set [013 S3-AC1]', () => {
        const set = makeOn(path, [1, 2, 3])
        const view = set.reversed()
        expect([...view]).toEqual([3, 2, 1])
        expect(isSetCollection(view)).toBe(true)
        expect(isSequencedCollection(view)).toBe(true)
        expect(view.reversed()).toBe(set)
        set.add(4)
        expect([...view]).toEqual([4, 3, 2, 1])
        view.delete(2)
        expect(set.toArray()).toEqual([1, 3, 4])
        view.addFirst(5)
        expect(set.toArray()).toEqual([1, 3, 4, 5])
      })

      it('mirrors the ends: its first is the set’s last and its last the set’s first [013 S3-AC2]', () => {
        const set = makeOn(path, [1, 2, 3])
        const view = set.reversed()
        expect(view.getFirst()).toBe(3)
        expect(view.getLast()).toBe(1)
        expect(view.removeFirst()).toBe(3)
        expect(view.removeLast()).toBe(1)
        expect(set.toArray()).toEqual([2])
        view.addFirst(9)
        view.addLast(0)
        expect(set.toArray()).toEqual([0, 2, 9])
        view.addFirst(0)
        expect(set.toArray()).toEqual([2, 9, 0])
        view.addLast(0)
        expect(set.toArray()).toEqual([0, 2, 9])
        set.clear()
        expect(messageOf(() => view.getFirst())).toBe(
          'ReversedLinkedHashSet.getFirst: the set is empty',
        )
        expect(messageOf(() => view.removeLast())).toBe(
          'ReversedLinkedHashSet.removeLast: the set is empty',
        )
      })

      it('add inserts at the view’s end, keeps a present member, and addAll adds in turn [013 S3-AC3]', () => {
        const set = makeOn(path, [1, 2])
        const view = set.reversed()
        expect(view.add(0)).toBe(view)
        expect(set.toArray()).toEqual([0, 1, 2])
        view.add(2)
        expect(set.toArray()).toEqual([0, 1, 2])
        expect(view.addAll(['a', 'b', 1])).toBe(true)
        expect([...view]).toEqual([2, 1, 0, 'a', 'b'])
        expect(set.toArray()).toEqual(['b', 'a', 0, 1, 2])
      })

      it('removes in its own order, passes itself to forEach, and shares has, delete, clear, size, revision, equality and hash [013 S3-AC3]', () => {
        const set = makeOn(path, [1, 2, 3, 4])
        const view = set.reversed()
        const decided: unknown[] = []
        view.removeIf((v) => {
          decided.push(v)
          return v === 3
        })
        expect(decided).toEqual([4, 3, 2, 1])
        expect(view.removeAll([4])).toBe(true)
        expect(view.retainAll([1, 2, 9])).toBe(false)
        expect(set.toArray()).toEqual([1, 2])
        const owners: unknown[] = []
        view.forEach((a, b, owner) => {
          owners.push([a, b, owner === view])
        })
        expect(owners).toEqual([
          [2, 2, true],
          [1, 1, true],
        ])
        expect(view.has(1)).toBe(true)
        expect(view.size).toBe(2)
        expect(view.revision).toBe(set.revision)
        expect(view.equals(set)).toBe(true)
        expect(set.equals(view)).toBe(true)
        expect(hashCode(view)).toBe(hashCode(set))
        view.add(5)
        expect(view.revision).toBe(set.revision)
        expect(view.delete(5)).toBe(true)
        expect(set.has(5)).toBe(false)
        view.clear()
        expect(set.size).toBe(0)
        expect(view.isEmpty()).toBe(true)
      })

      it('prints and tags itself in its own order and names itself in errors [013 S3-AC4]', () => {
        const set = makeOn(path, [1, 3])
        const view = set.reversed()
        expect(String(view)).toBe('ReversedLinkedHashSet(2) {3, 1}')
        expect(Object.prototype.toString.call(view)).toBe('[object ReversedLinkedHashSet]')
        expect(view.toJSON()).toEqual([3, 1])
        expect(view.toArray()).toEqual([3, 1])
        expect(JSON.stringify(view)).toBe('[3,1]')
        expect(inspect(view)).toBe('ReversedLinkedHashSet(2) { 3, 1 }')
        expect(messageOf(() => view.addAll(5 as never))).toBe(
          'ReversedLinkedHashSet.addAll: elements is not iterable (5)',
        )
        expect(messageOf(() => view.forEach(5 as never))).toMatch(
          /^ReversedLinkedHashSet\.forEach: /,
        )
      })
    })
  }

  it('removeAll and retainAll compare members in the view’s order [013 S3-AC3]', () => {
    const compared: number[] = []
    const set = new LinkedHashSet<number>([1, 2, 3], {
      equivalence: {
        equals: (member, item) => {
          compared.push(member)
          return member === item
        },
        hash: () => 0,
      },
    })
    compared.length = 0
    set.reversed().removeAll([9])
    expect(compared).toEqual([3, 2, 1])
    compared.length = 0
    set.reversed().retainAll([9])
    expect(compared).toEqual([3, 2, 1])
    expect(set.size).toBe(0)
  })

  it('names the view in errors from user functions [013 S3-AC4]', () => {
    let armed = false
    const set: LinkedHashSet<number> = new LinkedHashSet<number>([1, 2], {
      key: (v) => {
        if (armed) {
          armed = false
          set.add(9)
        }
        return v
      },
    })
    const view = set.reversed()
    armed = true
    expect(messageOf(() => view.addFirst(3))).toBe(
      'ReversedLinkedHashSet.addFirst: the set was changed by a key, equals or hash function',
    )
  })
})

// ── Live iteration with moves ──

/** Walks `source` with `for…of`, running `script` after each member, and returns what it saw. */
function loop<T>(source: Iterable<T>, script: (value: T) => void, limit = 100): T[] {
  const seen: T[] = []
  for (const value of source) {
    seen.push(value)
    if (seen.length > limit) throw new Error('loop did not end')
    script(value)
  }
  return seen
}

describe('LinkedHashSet — live iteration with moves', () => {
  for (const path of PATHS) {
    describe(`on the ${path[0]} path`, () => {
      it('skips deleted members ahead, visits members inserted ahead and not those behind, on the set and the view [013 S4-AC1]', () => {
        const set = makeOn(path, [1, 2, 3, 4])
        const seen = loop(set, (v) => {
          if (v === 1) {
            set.delete(3)
            set.addFirst(0)
            set.addLast(5)
            set.reversed().add(-1)
          }
        })
        expect(seen).toEqual([1, 2, 4, 5])
        expect(set.toArray()).toEqual([-1, 0, 1, 2, 4, 5])
        const view = set.reversed()
        const back = loop(view, (v) => {
          if (v === 5) {
            set.delete(2)
            set.addFirst(-2) // the view's end: ahead of the view's loop
            set.addLast(6) // the view's front: behind it
            view.add(-3)
          }
        })
        expect(back).toEqual([5, 4, 1, 0, -1, -2, -3])
      })

      it('never throws from forEach, keys, values, entries or a cursor while members change [013 S4-AC1]', () => {
        const set = makeOn(path, [1, 2, 3])
        const seen: unknown[] = []
        set.forEach((v) => {
          seen.push(v)
          if (v === 1) {
            set.delete(2)
            set.addLast(4)
          }
        })
        expect(seen).toEqual([1, 3, 4])
        const keys = set.keys()
        const values = set.values()
        const entries = set.entries()
        const cursor = set.cursor()
        expect(keys.next().value).toBe(1)
        expect(values.next().value).toBe(1)
        expect(entries.next().value).toEqual([1, 1])
        expect(cursor.next()).toBe(1)
        set.delete(3)
        set.addFirst(0)
        set.add(7)
        expect([...keys]).toEqual([4, 7])
        expect([...values]).toEqual([4, 7])
        expect([...entries]).toEqual([
          [4, 4],
          [7, 7],
        ])
        const rest: unknown[] = []
        while (cursor.hasNext()) rest.push(cursor.next())
        expect(rest).toEqual([4, 7])
      })

      it('treats a move as delete plus insert: addLast of a visited member visits it again, a move to the front is not visited [013 S4-AC2]', () => {
        const set = makeOn(path, [1, 2, 3])
        let moved = false
        const seen = loop(set, (v) => {
          if (v === 2 && !moved) {
            moved = true
            set.addLast(1) // visited member, moved ahead: visited again
            set.addFirst(3) // unvisited member, moved behind: not visited
          }
        })
        expect(seen).toEqual([1, 2, 1])
        expect(set.toArray()).toEqual([3, 2, 1])
        const native = new Set([1, 2, 3])
        let nativeMoved = false
        const nativeSeen = loop(native, (v) => {
          if (v === 2 && !nativeMoved) {
            nativeMoved = true
            native.delete(1)
            native.add(1)
          }
        })
        expect(nativeSeen).toEqual([1, 2, 3, 1])
      })

      it('continues from the old successor when the member just returned is moved [013 S4-AC2]', () => {
        const set = makeOn(path, [1, 2, 3, 4])
        const seen = loop(set, (v) => {
          if (v === 2) set.addFirst(2)
        })
        expect(seen).toEqual([1, 2, 3, 4])
        const again = makeOn(path, [1, 2, 3])
        let first = true
        const seenAgain = loop(again, (v) => {
          if (v === 2 && first) {
            first = false
            again.addLast(2)
          }
        })
        expect(seenAgain).toEqual([1, 2, 3, 2])
      })

      it('does nothing for a move to the end the member is already at, during a loop [013 S4-AC2]', () => {
        const set = makeOn(path, [1, 2, 3])
        const seen = loop(set, (v) => {
          if (v === 3) set.addLast(3)
          if (v === 1) set.addFirst(1)
        })
        expect(seen).toEqual([1, 2, 3])
      })

      it('mirrors moves on the reversed view [013 S4-AC2]', () => {
        const set = makeOn(path, [1, 2, 3])
        const view = set.reversed()
        let moved = false
        const seen = loop(view, (v) => {
          if (v === 2 && !moved) {
            moved = true
            view.addLast(3) // visited, moved to the view's end: visited again
            view.addFirst(1) // unvisited, moved behind: not visited
          }
        })
        expect(seen).toEqual([3, 2, 3])
        expect(set.toArray()).toEqual([3, 2, 1])
      })

      it('places a new or cleared iteration before the first member and keeps a finished one done [013 S4-AC3]', () => {
        const set = makeOn(path, [1, 2])
        const fresh = set[Symbol.iterator]()
        set.addFirst(0)
        set.addLast(3)
        expect([...fresh]).toEqual([1, 2, 3])
        const seen = loop(set, (v) => {
          if (v === 1) {
            set.clear()
            set.addFirst(8)
            set.add(9)
            set.addLast(10)
          }
        })
        expect(seen).toEqual([0, 1, 9, 10])
        const view = set.reversed()
        const backSeen = loop(view, (v) => {
          if (v === 10) {
            set.clear()
            view.add(1) // the set's front: the view's end, ahead
            set.addLast(2) // the view's front: behind
          }
        })
        expect(backSeen).toEqual([10, 1])
        const done = set[Symbol.iterator]()
        expect([...done]).toEqual([2, 1].reverse())
        set.add(5)
        expect(done.next().done).toBe(true)
        set.clear()
        set.add(6)
        expect(done.next().done).toBe(true)
      })

      it('cursor remove removes the last returned member from wherever it stands and continues [013 S4-AC4]', () => {
        const { options, calls } = counting(path)
        const set = new LinkedHashSet<unknown>([1, 2, 3, 4], options)
        const cursor = set.cursor()
        expect(cursor.next()).toBe(1)
        expect(cursor.next()).toBe(2)
        set.addLast(2)
        set.addFirst(4)
        calls.length = 0
        cursor.remove()
        expect(calls).toEqual([])
        expect(set.toArray()).toEqual([4, 1, 3])
        const rest: unknown[] = []
        while (cursor.hasNext()) rest.push(cursor.next())
        expect(rest).toEqual([3])
        // A member hasNext() reached is returned even if then moved, and removed from its new place.
        const second = new LinkedHashSet<unknown>([1, 2, 3], options)
        const look = second.cursor()
        expect(look.next()).toBe(1)
        expect(look.hasNext()).toBe(true)
        second.addFirst(2)
        calls.length = 0
        expect(look.next()).toBe(2)
        look.remove()
        expect(calls).toEqual([])
        expect(second.toArray()).toEqual([1, 3])
        expect(look.next()).toBe(3)
        expect(look.hasNext()).toBe(false)
      })

      it('the reversed view’s cursor removes and continues in the view’s order [013 S4-AC4]', () => {
        const set = makeOn(path, [1, 2, 3, 4])
        const cursor = set.reversed().cursor()
        const seen: unknown[] = []
        while (cursor.hasNext()) {
          const v = cursor.next()
          seen.push(v)
          if (v === 3) {
            set.addFirst(3)
            cursor.remove()
          }
        }
        expect(seen).toEqual([4, 3, 2, 1])
        expect(set.toArray()).toEqual([1, 2, 4])
        expect(() => cursor.remove()).not.toThrow()
        expect(set.toArray()).toEqual([2, 4])
      })

      it('a cursor whose member was deleted and added again removes the equal member by value [013 S4-AC4]', () => {
        const set = makeOn(path, [1, 2, 3])
        const cursor = set.cursor()
        cursor.next()
        set.delete(1)
        set.addLast(1)
        cursor.remove()
        expect(set.toArray()).toEqual([2, 3])
      })
    })
  }

  it('lets every addLast of the current member make it reappear ahead [013 S4-AC2]', () => {
    const set = new LinkedHashSet([1, 2, 3])
    const seen: number[] = []
    for (const v of set) {
      seen.push(v)
      if (seen.length >= 9) break
      set.addLast(v)
    }
    expect(seen).toEqual([1, 2, 3, 1, 2, 3, 1, 2, 3])
  })
})

// ── Construction, copy, equality ──

describe('LinkedHashSet — construction, copy and equality', () => {
  it('holds the source’s iteration order, first occurrence winning, and never inherits options [013 S1-AC3]', () => {
    const source = new LinkedHashSet([1, 2, 3])
    expect(new LinkedHashSet(source.reversed()).toArray()).toEqual([3, 2, 1])
    expect(LinkedHashSet.from(source.reversed()).toArray()).toEqual([3, 2, 1])
    expect(new LinkedHashSet([2, 1, 2, 3, 1]).toArray()).toEqual([2, 1, 3])
    expect(LinkedHashSet.from('banana').toArray()).toEqual(['b', 'a', 'n'])
    const keyed = new HashSet<string>(['a', 'b'], { key: (s) => s.toLowerCase() })
    const copy = new LinkedHashSet(keyed)
    copy.add('A')
    expect(copy.toArray()).toEqual(['a', 'b', 'A'])
    const fromCopy = LinkedHashSet.from(new LinkedHashSet(['x'], { key: (s) => s.length }))
    fromCopy.add('y')
    expect(fromCopy.size).toBe(2)
    const caseless = LinkedHashSet.from(['a', 'A', 'b'], { key: (s) => s.toLowerCase() })
    expect(caseless.toArray()).toEqual(['a', 'b'])
    expect(() => LinkedHashSet.from(null as never)).toThrow(TypeError)
    expect(messageOf(() => LinkedHashSet.from(5 as never))).toBe(
      'LinkedHashSet.from: elements is not iterable (5)',
    )
    expect(messageOf(() => new LinkedHashSet(5 as never))).toBe(
      'LinkedHashSet: elements is not iterable (5)',
    )
  })

  it('copy keeps members, order and options, calls no user function, and is independent [013 S5-AC5]', () => {
    for (const path of PATHS) {
      const { options, calls } = counting(path)
      const set = new LinkedHashSet<unknown>([3, 1, 2], options)
      set.addLast(3)
      set.addFirst(0)
      calls.length = 0
      const copy = set.copy()
      expect(calls, path[0]).toEqual([])
      expect(copy).toBeInstanceOf(LinkedHashSet)
      expect(copy.toArray()).toEqual([0, 1, 2, 3])
      expect(copy.getLast()).toBe(3)
      copy.addFirst(3)
      copy.delete(1)
      copy.add(9)
      expect(set.toArray()).toEqual([0, 1, 2, 3])
      expect(copy.toArray()).toEqual([3, 0, 2, 9])
    }
    const byLength = new LinkedHashSet<string>(['ab', 'c'], { key: (s) => s.length })
    const copied = byLength.copy()
    copied.add('zz')
    expect(copied.toArray()).toEqual(['ab', 'c'])
  })

  it('equals a HashSet or TreeSet with the same members in any order, both ways, and hashes as an equal HashSet [013 S5-AC2]', () => {
    const linked = new LinkedHashSet([3, 1, 2])
    const hash = new HashSet([1, 2, 3])
    const tree = new TreeSet([2, 3, 1])
    expect(linked.equals(hash)).toBe(true)
    expect(hash.equals(linked)).toBe(true)
    expect(linked.equals(tree)).toBe(true)
    expect(tree.equals(linked)).toBe(true)
    expect(linked.reversed().equals(hash)).toBe(true)
    expect(linked.equals(new HashSet([1, 2]))).toBe(false)
    expect(linked.equals(new ArrayList([3, 1, 2]))).toBe(false)
    const standIn = (v: unknown) => (typeof v === 'number' ? v * 7 : 1000)
    expect(linked[hashCodeSymbol](standIn)).toBe(hash[hashCodeSymbol](standIn))
    expect(hashCode(linked)).toBe(hashCode(hash))
    expect(hashCode(linked.reversed())).toBe(hashCode(hash))
    const key = (v: number) => v * 10
    expect(new LinkedHashSet([2, 1], { key })[hashCodeSymbol](standIn)).toBe(
      new HashSet([1, 2], { key })[hashCodeSymbol](standIn),
    )
    const user: Equivalence<number> = { equals: (a, b) => a === b, hash: (v) => v + 100 }
    expect(new LinkedHashSet([2, 1], { equivalence: user })[hashCodeSymbol](standIn)).toBe(
      new HashSet([1, 2], { equivalence: user })[hashCodeSymbol](standIn),
    )
    const value = valueEquivalence as Equivalence<number>
    expect(new LinkedHashSet([2, 1], { equivalence: value })[hashCodeSymbol](standIn)).toBe(
      new HashSet([1, 2], { equivalence: value })[hashCodeSymbol](standIn),
    )
    const moved = new LinkedHashSet([1, 2, 3])
    const before = hashCode(moved)
    moved.addFirst(3)
    expect(hashCode(moved)).toBe(before)
  })
})

// ── Shared contracts and reference models ──

/** A wrapper that the twin paths below treat as equal to the value inside it. */
class Twin {
  readonly value: unknown
  constructor(value: unknown) {
    this.value = value
  }
}
const unwrap = (v: unknown): unknown => (v instanceof Twin ? v.value : v)

/** The three paths again, with an equality that treats `new Twin(v)` as equal to `v`. */
const TWIN_PATHS: ReadonlyArray<
  readonly [string, () => LinkedHashSetOptions<unknown> | undefined]
> = [
  ['default', () => undefined],
  [
    'key',
    () => {
      const key = identityKey()
      return { key: ((v: unknown) => key(unwrap(v))) as KeyOf<unknown> }
    },
  ],
  [
    'equivalence',
    () => ({
      equivalence: {
        equals: (a, b) => sameValueZeroEquivalence.equals(unwrap(a), unwrap(b)),
        hash: (v) => sameValueZeroEquivalence.hash(unwrap(v)),
      },
    }),
  ],
]

describe('LinkedHashSet — shared contracts', () => {
  const sumOf = (elements: unknown[], hash: (value: unknown) => number) =>
    elements.reduce<number>((h, e) => (h + hash(e)) | 0, 0)
  for (const path of PATHS) {
    const storedHashes = path[0] === 'equivalence'
    const makeSet = (initial?: Iterable<unknown>) => makeOn(path, initial)
    const makeView = (initial?: Iterable<unknown>) => {
      const view = makeOn(path).reversed()
      view.addAll(initial ?? [])
      return view
    }
    for (const [name, make, reversed] of [
      ['LinkedHashSet', makeSet, false],
      ['ReversedLinkedHashSet', makeView, true],
    ] as const) {
      const wrap = (set: LinkedHashSet<unknown>) => (reversed ? set.reversed() : set)
      describe(`${name} on the ${path[0]} path`, () => {
        describeCollection(name, make, {
          iteration: 'live',
          brackets: 'set',
          nullElements: 'store',
          peers: [
            (initial?: Iterable<unknown>) => new ArrayList<unknown>(initial),
            (initial?: Iterable<unknown>) => new ArrayDeque<unknown>(initial),
            (initial?: Iterable<unknown>) => new HashSet<unknown>(initial),
          ],
          structural: {
            expectedHash: (elements, hash) =>
              storedHashes ? sumOf(elements, sameValueZeroEquivalence.hash) : sumOf(elements, hash),
          },
          withEquality: (initial, equality) => {
            const view = wrap(
              new LinkedHashSet<unknown>(undefined, {
                equivalence: { equals: equality, hash: () => 0 },
              }),
            )
            view.addAll(initial)
            return view
          },
          withFailingAdd: (rejects, failure) =>
            wrap(
              new LinkedHashSet<unknown>({
                key: (e) => {
                  if (rejects(e)) throw failure
                  return e as number
                },
              }),
            ),
        })
        describeSetCollection(name, make)
        describeSequencedCollection(name, make)
      })
    }
  }
  for (const path of TWIN_PATHS) {
    const twin = path[0] === 'default' ? undefined : (v: unknown) => new Twin(v)
    describeSequencedSet(
      `LinkedHashSet (${path[0]})`,
      (initial) => new LinkedHashSet(initial, path[1]()),
      {
        twin,
      },
    )
    describeSequencedSet(
      `ReversedLinkedHashSet (${path[0]})`,
      (initial) => {
        const view = new LinkedHashSet<unknown>(undefined, path[1]()).reversed()
        view.addAll(initial ?? [])
        return view
      },
      { twin },
    )
  }
})

describe('LinkedHashSet — reference models', () => {
  const runs: Array<[string, () => LinkedHashSetOptions<unknown> | undefined]> = [
    ['default', () => undefined],
    ['key', () => ({ key: (v: unknown) => v as number })],
    [
      'equivalence',
      () => ({
        equivalence: {
          equals: (a, b) => sameValueZeroEquivalence.equals(a, b),
          hash: (v) => sameValueZeroEquivalence.hash(v),
        },
      }),
    ],
    [
      'equivalence with few hashes',
      () => ({
        equivalence: {
          equals: (a, b) => a === b,
          hash: (v) => (v === null ? 0 : (v as number) % 6),
        },
      }),
    ],
  ]
  for (const [label, options] of runs) {
    it(`matches an array model of the order with moves, view changes, iterators and cursors on the set and the view (${label}) [013 S5-AC4]`, () => {
      for (const seed of [1, 2, 3]) {
        runSequencedSetReferenceModel({
          seed,
          steps: 1500,
          make: () => new LinkedHashSet<unknown>(undefined, options()),
        })
      }
    }, 60000)

    it(`matches a native Set in results, order, iterators and cursors across growth and shrinking (${label}) [013 S1-AC1]`, () => {
      for (const seed of [1, 2, 3]) {
        runReferenceModel({
          seed,
          steps: 1500,
          values: 300,
          bulk: true,
          model: 'set',
          make: () =>
            new LinkedHashSet<number>(undefined, options() as LinkedHashSetOptions<number>),
        })
      }
    }, 60000)
  }
})

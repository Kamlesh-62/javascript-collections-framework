import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import {
  ClassCastError,
  type Comparable,
  type Comparator,
  compareSymbol,
  comparing,
  NullElementError,
  naturalOrder,
  nullsFirst,
  nullsLast,
  reverseOrder,
  thenComparing,
} from '../src/index'
import { integer, pick, seeded } from './support/random'

const compare = naturalOrder<unknown>()
const sign = (a: unknown, b: unknown) => Math.sign(compare(a, b))

const message = (fn: () => unknown): string => {
  try {
    fn()
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('expected a throw')
}

describe('natural order of numbers', () => {
  it('orders numerically, -0 equals 0, NaN equals itself and comes after Infinity [002 S1-AC1]', () => {
    expect(sign(1, 2)).toBe(-1)
    expect(sign(2, 1)).toBe(1)
    expect(sign(-1.5, -1)).toBe(-1)
    expect(sign(-0, 0)).toBe(0)
    expect(sign(0, -0)).toBe(0)
    expect(sign(Number.NaN, Number.NaN)).toBe(0)
    expect(sign(Number.NaN, Number.POSITIVE_INFINITY)).toBe(1)
    expect(sign(Number.POSITIVE_INFINITY, Number.NaN)).toBe(-1)
    expect(sign(Number.NEGATIVE_INFINITY, -Number.MAX_VALUE)).toBe(-1)
    expect([10, Number.NaN, 9, 1, -0].sort(compare)).toEqual([-0, 1, 9, 10, Number.NaN])
  })
})

describe('natural order of strings', () => {
  it('orders by UTF-16 code units with a proper prefix first [002 S1-AC2]', () => {
    expect(sign('a', 'b')).toBe(-1)
    expect(sign('B', 'a')).toBe(-1) // code units, not dictionary order
    expect(sign('ab', 'abc')).toBe(-1)
    expect(sign('', 'a')).toBe(-1)
    expect(sign('é', 'z')).toBe(1)
    expect(sign('￿', '😀')).toBe(1) // 0xFFFF > 0xD83D: code units, not code points
    expect(sign('same', 'same')).toBe(0)
    expect(['10', '9', '1'].sort(compare)).toEqual(['1', '10', '9'])
  })
})

describe('natural order of bigints and booleans', () => {
  it('orders bigints numerically [002 S1-AC3]', () => {
    expect(sign(1n, 2n)).toBe(-1)
    expect(sign(-(10n ** 30n), 1n)).toBe(-1)
    expect(sign(5n, 5n)).toBe(0)
  })

  it('orders false before true [002 S1-AC4]', () => {
    expect(sign(false, true)).toBe(-1)
    expect(sign(true, false)).toBe(1)
    expect(sign(true, true)).toBe(0)
  })
})

describe('incomparable values', () => {
  it('throws ClassCastError for two values of different kinds [002 S1-AC7]', () => {
    const pairs: Array<[unknown, unknown]> = [
      [1, '1'],
      [1, 1n],
      [true, 1],
      ['a', false],
      [1n, '1'],
      [new Date(1), 1],
      [new Date(1), '1970'],
    ]
    for (const [a, b] of pairs) {
      expect(() => compare(a, b)).toThrow(ClassCastError)
      expect(() => compare(b, a)).toThrow(ClassCastError)
    }
    expect(message(() => compare(1, 'x'))).toBe(
      'naturalOrder: number and string cannot be compared',
    )
  })

  it('throws NullElementError for null or undefined, before checking kinds [002 S1-AC9]', () => {
    for (const [a, b] of [
      [null, 1],
      [1, undefined],
      [null, null],
      [undefined, {}],
      [Symbol('s'), null],
    ] as Array<[unknown, unknown]>) {
      expect(() => compare(a, b)).toThrow(NullElementError)
    }
    expect(message(() => compare(null, 1))).toBe('naturalOrder: null cannot be compared')
    // checked before the protocol: the protocol method is never called
    const protocol = new Money(1)
    expect(() => compare(protocol, null)).toThrow(NullElementError)
    expect(() => compare(undefined, protocol)).toThrow(NullElementError)
    expect(protocol.calls).toBe(0)
  })

  it('never orders by < coercion or string conversion [002 S1-AC10]', () => {
    // `'10' < '9'` and default sort put 10 before 9; natural order does not.
    expect(sign(9, 10)).toBe(-1)
    // `<` would coerce: `2 < '10'` is true. Natural order refuses the pair instead.
    expect(() => compare(2, '10')).toThrow(ClassCastError)
    let converted = false
    const sneaky = {
      valueOf() {
        converted = true
        return 1
      },
      toString() {
        converted = true
        return '1'
      },
    }
    expect(() => compare(sneaky, sneaky)).toThrow(ClassCastError)
    expect(converted).toBe(false)
  })

  it('never looks the protocol up on primitives, so a polluted prototype has no effect [002 S1-AC11]', () => {
    const prototypes = [Number.prototype, String.prototype, BigInt.prototype, Boolean.prototype]
    let called = false
    const hijack = () => {
      called = true
      return 1
    }
    try {
      for (const proto of prototypes) {
        Object.defineProperty(proto, compareSymbol, { value: hijack, configurable: true })
      }
      expect(sign(1, 2)).toBe(-1)
      expect(sign('b', 'a')).toBe(1)
      expect(sign(1n, 2n)).toBe(-1)
      expect(sign(false, true)).toBe(-1)
      expect(called).toBe(false)
    } finally {
      for (const proto of prototypes)
        delete (proto as unknown as Record<symbol, unknown>)[compareSymbol]
    }
  })
})

describe('naturalOrder', () => {
  it('returns a comparator that applies natural order [002 S2-AC1]', () => {
    expect(typeof naturalOrder()).toBe('function')
    expect([3, 1, 2].sort(naturalOrder())).toEqual([1, 2, 3])
    expect(['b', 'a'].sort(naturalOrder())).toEqual(['a', 'b'])
  })
})

class Money implements Comparable<Money> {
  calls = 0
  constructor(readonly cents: number) {}
  [compareSymbol](other: Money): number {
    this.calls++
    return (this.cents - other.cents) * 1000 // magnitude is ignored; only the sign counts
  }
}

describe('natural order of dates', () => {
  it('orders dates from any realm and Date subclasses by time, invalid dates last [002 S1-AC5]', () => {
    class Moment extends Date {}
    const foreign = runInNewContext('new Date(5)') as Date
    expect(foreign instanceof Date).toBe(false) // another realm
    expect(sign(new Date(1), new Date(2))).toBe(-1)
    expect(sign(foreign, new Date(4))).toBe(1)
    expect(sign(new Moment(3), foreign)).toBe(-1)
    expect(sign(new Date(Number.NaN), new Date(8.64e15))).toBe(1)
    expect(sign(new Date(Number.NaN), new Date(Number.NaN))).toBe(0)
    const later = new Date(10)
    const earlier = new Date(20)
    expect(sign(later, earlier)).toBe(-1)
    earlier.setTime(5) // dates are mutable; the current time value is used
    expect(sign(later, earlier)).toBe(1)
  })

  it('compares a date by time even when it implements the protocol [002 S1-AC12]', () => {
    let called = false
    class Stamped extends Date {
      [compareSymbol]() {
        called = true
        return 0
      }
    }
    expect(sign(new Stamped(1), new Stamped(2))).toBe(-1)
    expect(called).toBe(false)
  })

  it('returns 0 for distinct dates with the same time, which stay distinct objects [002 S3-AC4]', () => {
    const a = new Date(42)
    const b = new Date(42)
    expect(a).not.toBe(b)
    expect(sign(a, b)).toBe(0)
    expect(Object.is(a, b)).toBe(false) // identity, as hashed collections compare by default
  })
})

describe('the compareSymbol protocol', () => {
  it('uses the sign of a[compareSymbol](b) when both values implement it [002 S1-AC6]', () => {
    const one = new Money(100)
    const two = new Money(250)
    expect(sign(one, two)).toBe(-1)
    expect(compare(two, one)).toBe(1)
    expect(compare(one, new Money(100))).toBe(0)
    expect([two, one].sort(compare)).toEqual([one, two])
    expect(one.calls).toBeGreaterThan(0)
  })

  it('rejects objects without the protocol, fakes, Proxies, boxed values and one-sided pairs [002 S1-AC8]', () => {
    const rejected: unknown[] = [
      Symbol('s'),
      () => 1,
      {},
      { compareTo: () => 0 },
      Object.create(Date.prototype),
      new Proxy(new Date(1), {}),
      Object(1),
      Object('a'),
      [1],
    ]
    for (const value of rejected) {
      expect(() => compare(value, value)).toThrow(ClassCastError)
    }
    expect(() => compare(new Money(1), {})).toThrow(ClassCastError)
    expect(() => compare({}, new Money(1))).toThrow(ClassCastError)
    expect(() => compare(new Money(1), 1)).toThrow(ClassCastError)
    expect(() => compare(new Date(1), new Money(1))).toThrow(ClassCastError)
    expect(message(() => compare(new Date(1), 1))).toBe(
      'naturalOrder: date and number cannot be compared',
    )
    expect(message(() => compare({}, {}))).toBe('naturalOrder: object cannot be compared')
  })

  it('throws TypeError when the protocol returns a non-number or NaN, naming the caller [002 S4-AC1]', () => {
    const returning = (result: unknown) => ({ [compareSymbol]: () => result })
    for (const bad of [Number.NaN, '1', undefined, null, 1n, {}]) {
      expect(() => compare(returning(bad), returning(bad))).toThrow(TypeError)
    }
    expect(message(() => compare(returning('x'), returning('x')))).toBe(
      'naturalOrder: [compareSymbol] returned "x"',
    )
    // Validated even under native sort, unlike a user comparator's result.
    expect(() => [returning(Number.NaN), returning(Number.NaN)].sort(compare)).toThrow(TypeError)
  })

  it('reads the protocol method once per value and calls exactly the method it checked [002 S1-AC6]', () => {
    let reads = 0
    const flaky = {
      get [compareSymbol]() {
        reads++
        return reads === 1 ? () => -1 : 'not a function'
      },
    }
    const plain = { [compareSymbol]: () => 1 }
    expect(compare(flaky, plain)).toBe(-1)
    expect(reads).toBe(1)
  })

  it('lets an error thrown by the protocol propagate unchanged [002 S4-AC2]', () => {
    const failure = new Error('compare failed')
    const throwing = {
      [compareSymbol]() {
        throw failure
      },
    }
    let caught: unknown
    try {
      compare(throwing, throwing)
    } catch (error) {
      caught = error
    }
    expect(caught).toBe(failure)
  })

  it('uses only the sign of the protocol result [002 S4-AC3]', () => {
    const returning = (result: number) => ({ [compareSymbol]: () => result })
    expect(compare(returning(-1e9), returning(0))).toBe(-1)
    expect(compare(returning(0.0001), returning(0))).toBe(1)
    expect(Object.is(compare(returning(-0), returning(0)), 0)).toBe(true)
    expect(compare(returning(Number.POSITIVE_INFINITY), returning(0))).toBe(1)
  })
})

type Person = { name: string; age: number; nick?: string | null }
const ann: Person = { name: 'Ann', age: 40, nick: 'a' }
const bob: Person = { name: 'Bob', age: 30 }
const cid: Person = { name: 'Cid', age: 40, nick: null }

describe('reverseOrder', () => {
  it('reverses natural order when called without a comparator [002 S2-AC2]', () => {
    expect([1, 3, 2].sort(reverseOrder())).toEqual([3, 2, 1])
    expect(reverseOrder()('a', 'b')).toBeGreaterThan(0)
    expect(() => reverseOrder()(1, 'x')).toThrow(ClassCastError)
  })

  it('returns comparator(b, a) unchanged [002 S2-AC3]', () => {
    const seen: unknown[] = []
    const c: Comparator<number> = (a, b) => {
      seen.push([a, b])
      return (a - b) * 7
    }
    expect(reverseOrder(c)(1, 4)).toBe(21)
    expect(seen).toEqual([[4, 1]])
  })
})

describe('comparing', () => {
  it('orders by a key, calling it once per value, with natural or given order [002 S2-AC4]', () => {
    let calls = 0
    const byAge = comparing((p: Person) => {
      calls++
      return p.age
    })
    expect(Math.sign(byAge(bob, ann))).toBe(-1)
    expect(calls).toBe(2)
    expect([ann, bob].sort(byAge)).toEqual([bob, ann])
    expect(comparing((p: Person) => p.name, reverseOrder())(ann, bob)).toBeGreaterThan(0)
    let keyCalls = 0
    const withComparator = comparing((p: Person) => {
      keyCalls++
      return p.age
    }, reverseOrder())
    withComparator(ann, bob)
    expect(keyCalls).toBe(2)

    const failure = new Error('key failed')
    let caught: unknown
    try {
      comparing(() => {
        throw failure
      })(1, 2)
    } catch (error) {
      caught = error
    }
    expect(caught).toBe(failure)

    const mixed = comparing((v: { k: unknown }) => v.k)
    expect(() => mixed({ k: 1 }, { k: '1' })).toThrow(ClassCastError)
    expect(message(() => mixed({ k: 1 }, { k: '1' }))).toBe(
      'naturalOrder: number and string cannot be compared',
    )
  })
})

describe('thenComparing', () => {
  it('returns the first result that is not 0, unchanged, without calling later comparators [002 S2-AC5]', () => {
    const byAge = comparing((p: Person) => p.age)
    const byName = comparing((p: Person) => p.name)
    expect([ann, cid, bob].sort(thenComparing(byAge, byName))).toEqual([bob, ann, cid])

    let later = 0
    const counting: Comparator<Person> = () => {
      later++
      return 1
    }
    expect(Math.sign(thenComparing(byAge, counting)(bob, ann))).toBe(-1)
    expect(later).toBe(0)
    expect(
      thenComparing<number>(
        () => 0,
        () => 0,
      )(1, 2),
    ).toBe(0)
    expect(
      thenComparing<number>(
        () => 0,
        () => 42,
      )(1, 2),
    ).toBe(42)
  })
})

describe('nullsFirst and nullsLast', () => {
  it('puts null and undefined first, equal to each other, never passing them on [002 S2-AC6]', () => {
    const seen: unknown[] = []
    const c = nullsFirst<number>((a, b) => {
      seen.push(a, b)
      return a - b
    })
    expect(c(null, 1)).toBeLessThan(0)
    expect(c(1, undefined)).toBeGreaterThan(0)
    expect(c(null, undefined)).toBe(0)
    expect(c(2, 1)).toBeGreaterThan(0)
    expect(seen).toEqual([2, 1])
    expect(nullsFirst()(null, 'a')).toBeLessThan(0)
    expect([2, null, 1].sort(nullsFirst())).toEqual([null, 1, 2]) // natural order for the rest
    const byNick = comparing((p: Person) => p.nick, nullsFirst())
    expect([ann, bob, cid].sort(byNick).map((p) => p.name)).toEqual(['Bob', 'Cid', 'Ann'])
  })

  it('puts null and undefined last, equal to each other, never passing them on [002 S2-AC7]', () => {
    const seen: unknown[] = []
    const c = nullsLast<number>((a, b) => {
      seen.push(a, b)
      return a - b
    })
    expect(c(null, 1)).toBeGreaterThan(0)
    expect(c(1, undefined)).toBeLessThan(0)
    expect(c(undefined, null)).toBe(0)
    expect(c(1, 2)).toBeLessThan(0)
    expect(seen).toEqual([1, 2])
    expect([null, 3, 1].sort(nullsLast())).toEqual([1, 3, null])
  })
})

describe('helper arguments', () => {
  it('throws TypeError at creation for null or non-function arguments; undefined means natural order [002 S2-AC8]', () => {
    const bad = [null, 1, 'x', {}] as unknown as Comparator<unknown>[]
    for (const value of bad) {
      expect(() => reverseOrder(value)).toThrow(TypeError)
      expect(() => comparing(value as never)).toThrow(TypeError)
      expect(() => comparing((x) => x, value)).toThrow(TypeError)
      expect(() => thenComparing(naturalOrder(), value)).toThrow(TypeError)
      expect(() => nullsFirst(value)).toThrow(TypeError)
      expect(() => nullsLast(value)).toThrow(TypeError)
    }
    expect(message(() => comparing(null as never))).toBe('comparing: key is not a function')
    expect(message(() => thenComparing(naturalOrder(), null as never))).toBe(
      'thenComparing: comparator 2 is not a function',
    )
    expect([2, 1].sort(reverseOrder(undefined))).toEqual([2, 1])
    expect([2, null, 1].sort(nullsFirst(undefined))).toEqual([null, 1, 2])
  })
})

describe('native sort', () => {
  it("sorts arrays in each comparator's order; undefined stays last under native sort [002 S2-AC9]", () => {
    expect([3, 1, 2].sort(naturalOrder())).toEqual([1, 2, 3])
    expect([3, 1, 2].sort(reverseOrder())).toEqual([3, 2, 1])
    expect([bob, ann].sort(comparing((p: Person) => p.name)).map((p) => p.name)).toEqual([
      'Ann',
      'Bob',
    ])
    expect([2, null, 1].sort(nullsFirst())).toEqual([null, 1, 2])
    // Native sort places undefined last itself and never passes it to the comparator.
    expect([2, undefined, null, 1].sort(nullsFirst())).toEqual([null, 1, 2, undefined])
  })
})

describe('pass-through results', () => {
  it('returns user comparator results without validating them [002 S2-AC10]', () => {
    const nan: Comparator<number> = () => Number.NaN
    expect(reverseOrder(nan)(1, 2)).toBeNaN()
    expect(comparing((x: number) => x, nan)(1, 2)).toBeNaN()
    expect(thenComparing(nan)(1, 2)).toBeNaN()
    expect(nullsFirst(nan)(1, 2)).toBeNaN()
    expect(nullsLast(nan)(1, 2)).toBeNaN()
    const loose = (() => 'later') as unknown as Comparator<number>
    expect(reverseOrder(loose)(1, 2)).toBe('later')

    // ...but [compareSymbol] results reached through natural order are still validated.
    const broken = { [compareSymbol]: () => Number.NaN }
    expect(() => reverseOrder()(broken, broken)).toThrow(TypeError)
    expect(() => comparing((x: unknown) => x)(broken, broken)).toThrow(TypeError)
    expect(() => nullsFirst()(broken, broken)).toThrow(TypeError)
    expect(() => nullsLast()(broken, broken)).toThrow(TypeError)
    expect(message(() => reverseOrder()(broken, broken))).toBe(
      'naturalOrder: [compareSymbol] returned NaN',
    )
  })
})

const SEED = 20261112

/** Samples per built-in kind: fixed edge values plus seeded random ones. */
function samples(seed: number): Record<string, unknown[]> {
  const random = seeded(seed)
  const many = <T>(count: number, make: () => T): T[] => Array.from({ length: count }, make)
  const alphabet = ['a', 'b', 'B', 'é', '\ud800', '\udc00', '😀', '\uffff', '\u0000']
  return {
    number: [
      Number.NaN,
      -0,
      0,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.MAX_SAFE_INTEGER,
      -Number.MAX_SAFE_INTEGER,
      Number.MIN_VALUE,
      ...many(25, () => (random() - 0.5) * 1e6),
      ...many(10, () => integer(random, -5, 5)),
    ],
    string: [
      '',
      '\ud800',
      '\udc00',
      'abc',
      'abd',
      'ab',
      ...many(30, () => many(integer(random, 0, 4), () => pick(random, alphabet)).join('')),
    ],
    bigint: [
      0n,
      -1n,
      10n ** 30n,
      -(10n ** 30n),
      BigInt(Number.MAX_SAFE_INTEGER) + 1n,
      ...many(25, () => BigInt(integer(random, -1000, 1000))),
    ],
    boolean: [true, false, true],
    date: [
      new Date(Number.NaN),
      new Date(Number.NaN),
      new Date(0),
      new Date(-8.64e15),
      new Date(8.64e15),
      ...many(25, () => new Date(integer(random, -1e12, 1e12))),
    ],
  }
}

describe('natural order is a total order', () => {
  const byKind = samples(SEED)

  it('is antisymmetric within each built-in kind [002 S3-AC1]', () => {
    for (const [kind, values] of Object.entries(byKind)) {
      for (const a of values) {
        for (const b of values) {
          expect(sign(a, b), `${kind} seed ${SEED}`).toBe(-sign(b, a) || 0)
        }
      }
    }
  })

  it('is transitive within each built-in kind, edge values included [002 S3-AC2]', () => {
    for (const [kind, values] of Object.entries(byKind)) {
      for (const a of values) {
        for (const b of values) {
          if (compare(a, b) > 0) continue
          for (const c of values) {
            if (compare(b, c) <= 0) {
              expect(compare(a, c) <= 0, `${kind} seed ${SEED}`).toBe(true)
            }
          }
        }
      }
    }
  })

  it('returns 0 for primitives exactly when they are equal by SameValueZero [002 S3-AC3]', () => {
    // On primitives the library's equality is SameValueZero (NaN equals NaN; -0 equals 0).
    const sameValueZero = (a: unknown, b: unknown) =>
      a === b || (Number.isNaN(a) && Number.isNaN(b))
    for (const kind of ['number', 'string', 'bigint', 'boolean']) {
      const values = byKind[kind] as unknown[]
      for (const a of values) {
        for (const b of values) {
          expect(compare(a, b) === 0, `${kind} seed ${SEED}`).toBe(sameValueZero(a, b))
        }
      }
    }
  })
})

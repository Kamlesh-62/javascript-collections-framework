import { describe, expect, it, vi } from 'vitest'
import {
  type Equatable,
  equals,
  equalsSymbol,
  hashCode,
  hashCodeSymbol,
  sameValueZeroEquivalence,
  valueEquivalence,
} from '../src/index'
import { setHashSeedForTesting } from '../src/internal/hashing'
import { fixHashSeed } from './support/hash-seed'
import { integer, pick, seeded } from './support/random'

fixHashSeed()

const message = (fn: () => unknown): string => {
  try {
    fn()
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('expected a throw')
}

/** A value class implementing the full protocol, counting how often its methods are read. */
class Point {
  static reads = 0
  constructor(
    readonly x: number,
    readonly y: number,
  ) {}
  get [equalsSymbol]() {
    Point.reads++
    return (other: unknown) => other instanceof Point && other.x === this.x && other.y === this.y
  }
  [hashCodeSymbol](hash: (value: unknown) => number) {
    return hash(this.x) * 31 + hash(this.y)
  }
}

describe('equals on primitives', () => {
  it('uses SameValueZero without calling user code [003 S1-AC1]', () => {
    expect(equals(Number.NaN, Number.NaN)).toBe(true)
    expect(equals(-0, 0)).toBe(true)
    expect(equals(1, 1)).toBe(true)
    expect(equals(1, '1')).toBe(false)
    expect(equals(1, 1n)).toBe(false)
    expect(equals('a', 'a')).toBe(true)
    expect(equals(null, undefined)).toBe(false)
    expect(equals(null, null)).toBe(true)
    expect(equals(undefined, undefined)).toBe(true)
    const s = Symbol('s')
    expect(equals(s, s)).toBe(true)
    expect(equals(Symbol('s'), Symbol('s'))).toBe(false)
    Point.reads = 0
    expect(equals(1, new Point(1, 1))).toBe(false)
    expect(equals(new Point(1, 1), 1)).toBe(false)
    expect(Point.reads).toBe(0)
  })

  it('decides primitives without calling any user code [003 S4-AC1]', () => {
    let calls = 0
    const counting = () => {
      calls++
      return () => true
    }
    const prototypes = [
      Number.prototype,
      String.prototype,
      Boolean.prototype,
      BigInt.prototype,
      Symbol.prototype,
    ]
    const keys: PropertyKey[] = [
      'valueOf',
      'toString',
      Symbol.toPrimitive,
      equalsSymbol,
      hashCodeSymbol,
    ]
    const saved = prototypes.map((proto) =>
      keys.map((key) => Object.getOwnPropertyDescriptor(proto, key)),
    )
    const originalIsNaN = Number.isNaN
    let results: boolean[]
    try {
      for (const proto of prototypes) {
        for (const key of keys)
          Object.defineProperty(proto, key, { get: counting, configurable: true })
      }
      Number.isNaN = () => {
        calls++
        return false
      }
      const values: unknown[] = [
        Number.NaN,
        0,
        -0,
        1,
        'a',
        '',
        1n,
        true,
        false,
        Symbol('s'),
        null,
        undefined,
      ]
      results = []
      for (const a of values) for (const b of values) results.push(equals(a, b))
    } finally {
      Number.isNaN = originalIsNaN
      prototypes.forEach((proto, i) => {
        keys.forEach((key, j) => {
          const descriptor = saved[i]?.[j]
          if (descriptor) Object.defineProperty(proto, key, descriptor)
          else delete (proto as unknown as Record<PropertyKey, unknown>)[key]
        })
      })
    }
    expect(calls).toBe(0)
    expect(results.filter(Boolean).length).toBe(12 + 2) // each with itself, plus 0/-0 both ways
  })
})

describe('equals on objects', () => {
  it('returns true for the same reference without calling the protocol [003 S1-AC2]', () => {
    const p = new Point(1, 2)
    Point.reads = 0
    expect(equals(p, p)).toBe(true)
    expect(Point.reads).toBe(0)
    const plain = {}
    expect(equals(plain, plain)).toBe(true)
  })

  it('uses a[equalsSymbol](b) when both implement it, reading it once per side [003 S1-AC3]', () => {
    Point.reads = 0
    expect(equals(new Point(1, 2), new Point(1, 2))).toBe(true)
    expect(Point.reads).toBe(2)
    expect(equals(new Point(1, 2), new Point(2, 1))).toBe(false)

    // Asymmetric methods show which side decides: always a's, called with this = a and b.
    const calls: Array<[string, unknown, unknown]> = []
    const make = (name: string, answer: boolean) => {
      const self: Record<symbol, unknown> = {
        [equalsSymbol](this: unknown, other: unknown) {
          calls.push([name, this, other])
          return answer
        },
        [hashCodeSymbol]: () => 0,
      }
      return self
    }
    const a = make('a', true)
    const b = make('b', false)
    expect(equals(a, b)).toBe(true)
    expect(calls).toEqual([['a', a, b]])
    calls.length = 0
    expect(equals(b, a)).toBe(false)
    expect(calls).toEqual([['b', b, a]])
  })

  it('compares by identity when only one side, or neither, implements it, or a side is a function [003 S1-AC4]', () => {
    let called = 0
    const one = {
      [equalsSymbol]: () => {
        called++
        return true
      },
      [hashCodeSymbol]: () => 0,
    }
    expect(equals(one, {})).toBe(false)
    expect(equals({}, one)).toBe(false)
    expect(equals({ a: 1 }, { a: 1 })).toBe(false)
    const fnWithProtocol = Object.assign(() => 1, { [equalsSymbol]: () => true })
    expect(equals(fnWithProtocol, () => 1)).toBe(false)
    expect(equals(one, fnWithProtocol)).toBe(false)
    expect(called).toBe(0)
  })

  it('never looks up the protocol on primitives, functions or classes, in equals or hashCode [003 S1-AC5]', () => {
    let reads = 0
    const counting = {
      get() {
        reads++
        return () => true
      },
      configurable: true,
    }
    const prototypes = [
      Number.prototype,
      String.prototype,
      Boolean.prototype,
      BigInt.prototype,
      Symbol.prototype,
      Function.prototype,
    ]
    const fn = () => 1
    class Klass {}
    let fnHashes: number[] = []
    try {
      for (const proto of prototypes) {
        Object.defineProperty(proto, equalsSymbol, counting)
        Object.defineProperty(proto, hashCodeSymbol, counting)
      }
      for (const target of [fn, Klass]) {
        Object.defineProperty(target, equalsSymbol, counting)
        Object.defineProperty(target, hashCodeSymbol, counting)
      }
      equals(1, 2)
      equals('a', 'b')
      equals(true, false)
      equals(1n, 2n)
      equals(Symbol('a'), Symbol('b'))
      equals(fn, () => 1)
      equals(Klass, class {})
      for (const value of [1, 1.5, 'a', true, 1n, Symbol('s')]) hashCode(value)
      fnHashes = [hashCode(fn), hashCode(fn), hashCode(Klass)]
    } finally {
      for (const target of [...prototypes, fn, Klass]) {
        delete (target as unknown as Record<symbol, unknown>)[equalsSymbol]
        delete (target as unknown as Record<symbol, unknown>)[hashCodeSymbol]
      }
    }
    expect(reads).toBe(0)
    // Functions and classes hash by identity, ignoring the protocol they carry.
    expect(fnHashes[0]).toBe(fnHashes[1])
    expect(fnHashes[0]).toBe(sameValueZeroEquivalence.hash(fn))
    expect(fnHashes[2]).toBe(sameValueZeroEquivalence.hash(Klass))
  })

  it('ignores methods named equals and hashCode [003 S1-AC6]', () => {
    let called = false
    const make = () => ({
      equals() {
        called = true
        return true
      },
      hashCode() {
        called = true
        return 1
      },
    })
    expect(equals(make(), make())).toBe(false)
    expect(called).toBe(false)
  })

  it('throws TypeError when [equalsSymbol] returns a non-boolean, naming equals [003 S1-AC7]', () => {
    const returning = (result: unknown) => ({ [equalsSymbol]: () => result })
    for (const bad of [1, 0, 'true', undefined, null, {}]) {
      expect(() => equals(returning(bad), returning(bad))).toThrow(TypeError)
    }
    expect(message(() => equals(returning(1), returning(1)))).toBe(
      'equals: [equalsSymbol] returned 1',
    )
  })

  it('answers equals for a half protocol without throwing [003 S1-AC8]', () => {
    const equalsOnly = (id: number) => ({
      id,
      [equalsSymbol](other: unknown) {
        return (other as { id: number }).id === id
      },
    })
    expect(equals(equalsOnly(1), equalsOnly(1))).toBe(true)
    expect(equals(equalsOnly(1), equalsOnly(2))).toBe(false)
    const hashOnly = { [hashCodeSymbol]: () => 1 }
    expect(equals(hashOnly, { [hashCodeSymbol]: () => 1 })).toBe(false)
  })

  it('lets errors from the protocol or a Proxy propagate unchanged [003 S1-AC9]', () => {
    const failure = new Error('equals failed')
    const throwing = {
      [equalsSymbol]() {
        throw failure
      },
    }
    const caught = (fn: () => unknown) => {
      try {
        fn()
      } catch (error) {
        return error
      }
      return undefined
    }
    expect(caught(() => equals(throwing, { ...throwing }))).toBe(failure)

    const trapFailure = new Error('trap failed')
    const trapping = new Proxy(
      {},
      {
        get() {
          throw trapFailure
        },
      },
    )
    expect(caught(() => equals(trapping, {}))).toBe(trapFailure)

    const { proxy, revoke } = Proxy.revocable({}, {})
    revoke()
    expect(caught(() => equals(proxy, {}))).toBeInstanceOf(TypeError)
  })
})

/** A NaN with a chosen payload: same value to JavaScript, different bits in memory. */
function nanWithPayload(low: number): number {
  const view = new DataView(new ArrayBuffer(8))
  view.setUint32(0, 0x7ff80000)
  view.setUint32(4, low)
  return view.getFloat64(0)
}

/** Pairs of values that are equal under `equals`, of every kind. */
function equalPairs(seed: number): Array<[unknown, unknown]> {
  const random = seeded(seed)
  const symbol = Symbol('shared')
  const object = {}
  const pairs: Array<[unknown, unknown]> = [
    [Number.NaN, nanWithPayload(1)],
    [nanWithPayload(7), nanWithPayload(99)],
    [-0, 0],
    [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
    ['', ''],
    ['\ud800', '\ud800'],
    ['😀', '\ud83d\ude00'],
    [2n ** 70n, 2n ** 70n],
    [-(2n ** 53n) - 1n, -(2n ** 53n) - 1n],
    [symbol, symbol],
    [object, object],
    [null, null],
    [undefined, undefined],
    [true, true],
    [false, false],
    [new Point(1, 2), new Point(1, 2)],
  ]
  for (let i = 0; i < 40; i++) {
    const n = (random() - 0.5) * 1e9
    const k = integer(random, -1e6, 1e6)
    pairs.push([n, n], [k, k])
    const text = Array.from({ length: integer(random, 0, 6) }, () =>
      pick(random, ['a', 'B', 'é', '\udc00']),
    ).join('')
    pairs.push([text, `${text}`])
    const x = integer(random, -50, 50)
    pairs.push([new Point(x, x * 2.5), new Point(x, x * 2.5)])
  }
  return pairs
}

describe('hashCode', () => {
  it('returns a 32-bit signed integer for every input [003 S2-AC1]', () => {
    for (const [a] of equalPairs(1)) {
      const h = hashCode(a)
      expect((h | 0) === h, String(a)).toBe(true)
    }
    for (const value of [
      1.5,
      1e300,
      -1e-300,
      'x'.repeat(1000),
      () => 1,
      class {},
      new Date(),
      [1],
    ]) {
      const h = hashCode(value)
      expect((h | 0) === h).toBe(true)
    }
  })

  it('gives equal values the same hash, for every kind and edge value [003 S2-AC2]', () => {
    for (const seed of [1, 2, 3]) {
      for (const [a, b] of equalPairs(seed)) {
        expect(equals(a, b), `equals seed ${seed}`).toBe(true)
        expect(hashCode(a), `hash seed ${seed}: ${String(a)}`).toBe(hashCode(b))
      }
    }
  })

  it('hashes objects, functions and classes by a stable identity, without touching them [003 S2-AC6]', () => {
    const object = { a: 1 }
    const fn = () => 1
    class Klass {}
    const keysBefore = Reflect.ownKeys(object)
    for (const value of [object, fn, Klass, [1, 2], new Date(5)]) {
      expect(hashCode(value)).toBe(hashCode(value))
    }
    expect(Reflect.ownKeys(object)).toEqual(keysBefore)
    expect(Object.isExtensible(object)).toBe(true)
    expect(Object.isFrozen(object)).toBe(false)
    expect(Object.getOwnPropertySymbols(fn)).toEqual([])
  })

  it('hashes frozen, sealed and proxied objects; revoked or throwing proxies propagate [003 S2-AC7]', () => {
    const frozen = Object.freeze({})
    const sealed = Object.seal({})
    const proxied = new Proxy({}, {})
    for (const value of [frozen, sealed, proxied]) {
      expect(hashCode(value)).toBe(hashCode(value))
    }
    const { proxy, revoke } = Proxy.revocable({}, {})
    revoke()
    expect(() => hashCode(proxy)).toThrow(TypeError)
    const failure = new Error('trap')
    const trapping = new Proxy(
      {},
      {
        get() {
          throw failure
        },
      },
    )
    let caught: unknown
    try {
      hashCode(trapping)
    } catch (error) {
      caught = error
    }
    expect(caught).toBe(failure)
  })
})

describe('hashing cost', () => {
  it('reads every code unit of a string, hex digits of a bigint, and looks objects up by identity [003 S4-AC2]', () => {
    // Huge bigints hash (hexadecimal conversion is linear) and agree with themselves.
    const huge = 7n ** 20_000n
    expect(hashCode(huge)).toBe(hashCode(7n ** 20_000n))
    // Identity hashes are a lookup: same object, same hash, no matter how often.
    const object = {}
    const h = hashCode(object)
    for (let i = 0; i < 1000; i++) expect(hashCode(object)).toBe(h)
  })
})

describe('module load', () => {
  it('calls no Math.random and builds no buffer until the first hash that needs one [003 S4-AC3]', async () => {
    const spy = vi.spyOn(Math, 'random')
    const OriginalDataView = globalThis.DataView
    let views = 0
    const Base = OriginalDataView as unknown as new (buffer: ArrayBuffer) => DataView
    class CountingDataView extends Base {
      constructor(buffer: ArrayBuffer) {
        super(buffer)
        views++
      }
    }
    try {
      globalThis.DataView = CountingDataView as unknown as typeof DataView
      vi.resetModules()
      const fresh = (await import('../src/index')) as typeof import('../src/index')
      expect(spy).not.toHaveBeenCalled()
      expect(views).toBe(0)
      fresh.hashCode('first')
      expect(spy).toHaveBeenCalledTimes(1)
      expect(views).toBe(0) // strings need no buffer
      fresh.hashCode(1.5)
      fresh.hashCode(2.5)
      expect(views).toBe(1) // created once, on the first non-int32 number
      expect(spy).toHaveBeenCalledTimes(1)
    } finally {
      globalThis.DataView = OriginalDataView
      spy.mockRestore()
    }
  })
})

describe('replaced built-ins', () => {
  it('hashes primitives without running replaced built-ins [003 S4-AC4]', () => {
    const values: unknown[] = ['text', 'Aa', 1.5, 42, -0, Number.NaN, 2n ** 70n, Symbol('s'), true]
    const before = values.map((v) => hashCode(v))
    let ran = 0
    const hit =
      <T>(result: T) =>
      () => {
        ran++
        return result
      }
    const saved = {
      charCodeAt: String.prototype.charCodeAt,
      bigintToString: BigInt.prototype.toString,
      symbolToString: Symbol.prototype.toString,
      setFloat64: DataView.prototype.setFloat64,
      getInt32: DataView.prototype.getInt32,
      imul: Math.imul,
      random: Math.random,
      call: Function.prototype.call,
      String: globalThis.String,
    }
    let after: number[]
    try {
      String.prototype.charCodeAt = hit(0)
      BigInt.prototype.toString = hit('0')
      Symbol.prototype.toString = hit('Symbol()')
      DataView.prototype.setFloat64 = hit(undefined)
      DataView.prototype.getInt32 = hit(0)
      Math.imul = hit(0)
      Math.random = hit(0)
      // biome-ignore lint/suspicious/noExplicitAny: replacing a built-in is the case under test
      ;(Function.prototype as any).call = hit(0)
      globalThis.String = hit('x') as unknown as StringConstructor
      after = values.map((v) => hashCode(v))
      // Draw a fresh seed while Math.random is replaced: the captured random must be used.
      setHashSeedForTesting(undefined)
      hashCode('fresh seed')
    } finally {
      globalThis.String = saved.String
      String.prototype.charCodeAt = saved.charCodeAt
      BigInt.prototype.toString = saved.bigintToString
      Symbol.prototype.toString = saved.symbolToString
      DataView.prototype.setFloat64 = saved.setFloat64
      DataView.prototype.getInt32 = saved.getInt32
      Math.imul = saved.imul
      Math.random = saved.random
      Function.prototype.call = saved.call
      globalThis.String = saved.String
    }
    expect(ran).toBe(0)
    expect(after).toEqual(before)
  })
})

describe('protocol hashing', () => {
  it('calls [hashCodeSymbol](hash) once with hashCode and reduces the result with ToInt32 [003 S2-AC3]', () => {
    const seen: unknown[] = []
    const value: Equatable = {
      [equalsSymbol]: () => true,
      [hashCodeSymbol](hash) {
        seen.push(hash)
        return 2 ** 32 + 5.75 // ToInt32 → 5
      },
    }
    expect(hashCode(value)).toBe(5)
    expect(seen).toEqual([hashCode])

    class Pair implements Equatable {
      constructor(
        readonly left: unknown,
        readonly right: unknown,
      ) {}
      [equalsSymbol](other: unknown) {
        return (
          other instanceof Pair && equals(other.left, this.left) && equals(other.right, this.right)
        )
      }
      [hashCodeSymbol](hash: (v: unknown) => number) {
        return hash(this.left) * 31 + hash(this.right)
      }
    }
    // Nested protocol values hash through the passed function and stay consistent with equals.
    const a = new Pair(new Point(1, 2), 'x')
    const b = new Pair(new Point(1, 2), 'x')
    expect(equals(a, b)).toBe(true)
    expect(hashCode(a)).toBe(hashCode(b))
    expect(hashCode(a)).toBe((hashCode(new Point(1, 2)) * 31 + hashCode('x')) | 0)
  })

  it('throws TypeError when [hashCodeSymbol] returns a non-finite or non-number [003 S2-AC4]', () => {
    const returning = (result: unknown) => ({
      [equalsSymbol]: () => true,
      [hashCodeSymbol]: () => result,
    })
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      '1',
      1n,
      null,
      undefined,
      {},
    ]) {
      expect(() => hashCode(returning(bad))).toThrow(TypeError)
    }
    expect(message(() => hashCode(returning(Number.NaN)))).toBe(
      'hashCode: [hashCodeSymbol] returned NaN',
    )
    expect(hashCode(returning(-0))).toBe(0)
  })

  it('rejects an object implementing only half of the protocol when hashing it [003 S2-AC5]', () => {
    const equalsOnly = { [equalsSymbol]: () => true }
    const hashOnly = { [hashCodeSymbol]: () => 1 }
    expect(() => hashCode(equalsOnly)).toThrow(TypeError)
    expect(() => hashCode(hashOnly)).toThrow(TypeError)
    expect(message(() => hashCode(equalsOnly))).toBe(
      'hashCode: object implements [equalsSymbol] without [hashCodeSymbol]',
    )
    expect(message(() => hashCode(hashOnly))).toBe(
      'hashCode: object implements [hashCodeSymbol] without [equalsSymbol]',
    )
  })
})

describe('the exported equivalences', () => {
  it('sameValueZeroEquivalence uses SameValueZero, ignores the protocol, and its hash agrees [003 S3-AC1]', () => {
    const { equals: same, hash } = sameValueZeroEquivalence
    expect(same(Number.NaN, Number.NaN)).toBe(true)
    expect(same(-0, 0)).toBe(true)
    expect(same(new Point(1, 2), new Point(1, 2))).toBe(false) // protocol ignored
    const half = { [equalsSymbol]: () => true }
    expect(() => hash(half)).not.toThrow() // protocol ignored, so no half-protocol error
    const p = new Point(1, 2)
    expect(hash(p)).toBe(hash(p))
    for (const [a, b] of [
      [Number.NaN, nanWithPayload(3)],
      [-0, 0],
      ['x', 'x'],
      [2n ** 64n, 2n ** 64n],
    ] as Array<[unknown, unknown]>) {
      expect(same(a, b)).toBe(true)
      expect(hash(a)).toBe(hash(b))
    }
    expect(Object.isFrozen(sameValueZeroEquivalence)).toBe(true)
  })

  it('valueEquivalence is equals and hashCode [003 S3-AC2]', () => {
    expect(valueEquivalence.equals).toBe(equals)
    expect(valueEquivalence.hash).toBe(hashCode)
    expect(valueEquivalence.equals(new Point(3, 4), new Point(3, 4))).toBe(true)
    expect(Object.isFrozen(valueEquivalence)).toBe(true)
  })
})

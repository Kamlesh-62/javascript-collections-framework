// Value equality and the equality protocol. The exported `equals`/`hashCode` call these with their
// own names as `where`; collections call them with their method names, their own hash function,
// and protocol methods they have already read, so each user method is read once per operation.

import { describeValue } from './checks'
import { hashPrimitiveOrIdentity } from './hashing'
import { apply } from './intrinsics'

/**
 * The key of the method by which an object compares itself with another for value equality.
 *
 * `a[equalsSymbol](b)` returns `true` or `false`. It is used only when both values implement it,
 * and only together with {@link hashCodeSymbol}: equal objects must return the same hash. The key
 * is `Symbol.for('javascript-collections-framework.equals')` and does not change between major
 * versions.
 *
 * @example
 * ```ts
 * class Point implements Equatable {
 *   constructor(readonly x: number, readonly y: number) {}
 *   [equalsSymbol](other: unknown): boolean {
 *     return other instanceof Point && other.x === this.x && other.y === this.y
 *   }
 *   [hashCodeSymbol](hash: HashFunction): number {
 *     return hash(this.x) * 31 + hash(this.y)
 *   }
 * }
 * ```
 */
export const equalsSymbol: unique symbol = /*#__PURE__*/ Symbol.for(
  'javascript-collections-framework.equals',
)

/**
 * The key of the method by which an object returns its hash for value equality.
 *
 * `a[hashCodeSymbol](hash)` returns a finite number; `hash` is the caller's hash function, to use
 * for nested values. Equal objects (by {@link equalsSymbol}) must return the same number. The key
 * is `Symbol.for('javascript-collections-framework.hashCode')` and does not change between major
 * versions.
 *
 * @example
 * ```ts
 * class Point {
 *   constructor(readonly x: number, readonly y: number) {}
 *   [equalsSymbol](other: unknown): boolean {
 *     return other instanceof Point && other.x === this.x && other.y === this.y
 *   }
 *   [hashCodeSymbol](hash: HashFunction): number {
 *     return hash(this.x) * 31 + hash(this.y)
 *   }
 * }
 * ```
 */
export const hashCodeSymbol: unique symbol = /*#__PURE__*/ Symbol.for(
  'javascript-collections-framework.hashCode',
)

/**
 * A hash function: returns a 32-bit integer for any value, the same one for equal values.
 *
 * `[hashCodeSymbol]` receives one, to hash nested values the way the caller does.
 *
 * @example
 * ```ts
 * const hash: HashFunction = hashCode
 * hash('a') === hash('a') // true
 * ```
 */
export type HashFunction = (value: unknown) => number

type EqualsMethod = (this: object, other: unknown) => unknown
type HashMethod = (this: object, hash: HashFunction) => unknown

/** The protocol methods of a value, each read once. @internal */
export interface ProtocolMethods {
  equals: EqualsMethod | undefined
  hash: HashMethod | undefined
}

/**
 * SameValueZero, as native `Map` and `Set` use: `NaN` equals `NaN`, `-0` equals `0`, objects by
 * identity. Calls no user code and no built-in that could have been replaced.
 *
 * @internal
 */
export function sameValueZero(a: unknown, b: unknown): boolean {
  // biome-ignore lint/suspicious/noSelfCompare: x !== x is true only for NaN, without calling Number.isNaN
  return a === b || (a !== a && b !== b)
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

function equalsMethodOf(value: object): EqualsMethod | undefined {
  const method: unknown = (value as Record<symbol, unknown>)[equalsSymbol]
  return typeof method === 'function' ? (method as EqualsMethod) : undefined
}

/**
 * Reads both protocol methods of `value` once, or returns `undefined` for anything that is not an
 * object (`typeof` `'object'`): primitives, functions and classes never take part in the protocol.
 *
 * @internal
 */
export function protocolOf(value: unknown): ProtocolMethods | undefined {
  if (!isObject(value)) return undefined
  const record = value as Record<symbol, unknown>
  const equals = record[equalsSymbol]
  const hash = record[hashCodeSymbol]
  return {
    equals: typeof equals === 'function' ? (equals as EqualsMethod) : undefined,
    hash: typeof hash === 'function' ? (hash as HashMethod) : undefined,
  }
}

/**
 * Value equality: SameValueZero, unless both values are objects that implement `[equalsSymbol]`,
 * in which case `a`'s method decides. A half protocol never throws here.
 *
 * Time: O(1) plus the protocol method.
 *
 * @param a - The first value.
 * @param b - The second value.
 * @param where - The API to name in errors (`equals`, `HashSet.add`, …).
 * @param methodsOfA - `a`'s protocol methods, when the caller has already read them.
 * @throws TypeError when `[equalsSymbol]` returns a value that is not a boolean.
 * @internal
 */
export function equalsAt(
  a: unknown,
  b: unknown,
  where: string,
  methodsOfA?: ProtocolMethods,
): boolean {
  if (sameValueZero(a, b)) return true
  if (!isObject(a) || !isObject(b)) return false
  const methodA = methodsOfA === undefined ? equalsMethodOf(a) : methodsOfA.equals
  if (methodA === undefined) return false
  if (equalsMethodOf(b) === undefined) return false
  const result = apply(methodA, a, [b])
  if (typeof result !== 'boolean') {
    throw new TypeError(`${where}: [equalsSymbol] returned ${describeValue(result)}`)
  }
  return result
}

/**
 * Value hashing that agrees with {@link equalsAt}. An object implementing both protocol methods is
 * hashed by `[hashCodeSymbol](hash)`, whose result must be a finite number and is reduced with
 * ToInt32; an object implementing exactly one of them is rejected; everything else is hashed
 * without the protocol.
 *
 * Time: O(1) plus the protocol method, or the cost of {@link hashPrimitiveOrIdentity}.
 *
 * @param value - The value to hash.
 * @param where - The API to name in errors (`hashCode`, `HashSet.add`, …).
 * @param hash - The hash function passed to `[hashCodeSymbol]` for nested values.
 * @param methods - `value`'s protocol methods, when the caller has already read them.
 * @throws TypeError when `[hashCodeSymbol]` returns a value that is not a finite number, or the
 *   object implements only half of the protocol.
 * @internal
 */
export function hashAt(
  value: unknown,
  where: string,
  hash: HashFunction,
  methods?: ProtocolMethods,
): number {
  if (isObject(value)) {
    const own = methods === undefined ? (protocolOf(value) as ProtocolMethods) : methods
    if (own.equals !== undefined && own.hash !== undefined) {
      const result = apply(own.hash, value, [hash])
      // A finite number minus itself is 0; NaN and ±Infinity give NaN. No built-in is called.
      if (typeof result !== 'number' || result - result !== 0) {
        throw new TypeError(`${where}: [hashCodeSymbol] returned ${describeValue(result)}`)
      }
      return result | 0
    }
    if (own.equals !== undefined) {
      throw new TypeError(`${where}: object implements [equalsSymbol] without [hashCodeSymbol]`)
    }
    if (own.hash !== undefined) {
      throw new TypeError(`${where}: object implements [hashCodeSymbol] without [equalsSymbol]`)
    }
  }
  return hashPrimitiveOrIdentity(value)
}

// ── Public API (re-exported by src/functions/equality.ts) ──

/**
 * An object that defines its own value equality.
 *
 * Implement both methods, consistently: `a[equalsSymbol](b)` must be symmetric and transitive, and
 * equal objects must return the same `[hashCodeSymbol](hash)`. Use `hash` for nested values so
 * they hash the same way the caller does. Value equality applies only when both values implement
 * the protocol; an object implementing only one of the two methods is rejected when it is hashed.
 *
 * @example
 * ```ts
 * class Point implements Equatable {
 *   constructor(readonly x: number, readonly y: number) {}
 *   [equalsSymbol](other: unknown): boolean {
 *     return other instanceof Point && other.x === this.x && other.y === this.y
 *   }
 *   [hashCodeSymbol](hash: HashFunction): number {
 *     return hash(this.x) * 31 + hash(this.y)
 *   }
 * }
 * ```
 */
export interface Equatable {
  /** Returns whether `other` equals this object; called only when `other` also implements the protocol. */
  [equalsSymbol](other: unknown): boolean
  /** Returns this object's hash; use `hash` for nested values. Equal objects return equal numbers. */
  [hashCodeSymbol](hash: HashFunction): number
}

/**
 * Returns whether two values are equal by value.
 *
 * Primitives compare with SameValueZero, as native `Map` does: `NaN` equals `NaN`, `-0` equals
 * `0`, `null` does not equal `undefined`. Two objects that both implement `[equalsSymbol]` are
 * compared by `a[equalsSymbol](b)`; any other objects, and all functions and classes, by identity.
 * Methods named `equals` are not used.
 *
 * Time: O(1) plus the `[equalsSymbol]` method when one is called.
 *
 * @param a - The first value.
 * @param b - The second value.
 * @returns `true` when the values are equal.
 * @throws TypeError when `[equalsSymbol]` returns a value that is not a boolean.
 *
 * @example
 * ```ts
 * equals(Number.NaN, Number.NaN) // true
 * equals({ x: 1 }, { x: 1 })     // false: plain objects compare by identity
 * equals(new Point(1, 2), new Point(1, 2)) // true when Point implements the protocol
 * ```
 */
export function equals(a: unknown, b: unknown): boolean {
  return equalsAt(a, b, 'equals')
}

/**
 * Returns a hash of `value` that agrees with {@link equals}: equal values have equal hashes.
 *
 * An object implementing both `[equalsSymbol]` and `[hashCodeSymbol]` is hashed by
 * `value[hashCodeSymbol](hashCode)`, reduced to a 32-bit integer. Primitives are hashed by value
 * (with `NaN` alike and `-0` as `0`) without calling any user code; other objects, functions and
 * classes by identity (for an object, only its two protocol keys are read, which can run a getter
 * or a `Proxy` trap). Hash values are seeded: they differ between runs and between
 * loaded copies of the library, so never store or send them.
 *
 * Time: O(1) for numbers, booleans, `null` and `undefined`; O(1) amortised for objects; O(length)
 * for strings and symbol descriptions; O(digits) for bigints; plus the `[hashCodeSymbol]` method
 * when one is called.
 *
 * @param value - Any value.
 * @returns A 32-bit integer.
 * @throws TypeError when `[hashCodeSymbol]` returns a value that is not a finite number, or the
 *   object implements only one of `[equalsSymbol]` and `[hashCodeSymbol]`.
 *
 * @example
 * ```ts
 * hashCode(Number.NaN) === hashCode(0 / 0) // true
 * hashCode(-0) === hashCode(0)             // true
 * ```
 */
export function hashCode(value: unknown): number {
  return hashAt(value, 'hashCode', hashCode)
}

/**
 * A function that gives each value the primitive key it should be found by, for a hashed
 * collection's `key` option. Keys compare with SameValueZero, like native `Map` keys.
 *
 * The key is derived once when a value is stored; it is not derived again if the value changes
 * later. Returning an object or a function is an error, because a new object on each call could
 * never match a stored one.
 *
 * @example
 * ```ts
 * const byId: KeyOf<{ id: number }> = (user) => user.id
 * const byPoint: KeyOf<{ x: number; y: number }> = (p) => `${p.x},${p.y}`
 * ```
 */
export type KeyOf<T> = (value: T) => string | number | bigint | boolean | symbol | null | undefined

/**
 * A notion of equality for a collection: an `equals` that is reflexive, symmetric and transitive,
 * and a `hash` that returns the same finite number for equal values.
 *
 * Collections read both functions once, when they are created, and call them with `this` set to
 * the equivalence. `equals` must return a boolean.
 *
 * @example
 * ```ts
 * const caseInsensitive: Equivalence<string> = {
 *   equals: (a, b) => a.toLowerCase() === b.toLowerCase(),
 *   hash: (s) => hashCode(s.toLowerCase()),
 * }
 * ```
 */
export interface Equivalence<T> {
  /** Returns whether `a` and `b` are equal; must return a boolean. */
  equals(a: T, b: T): boolean
  /** Returns a finite number, the same for equal values. */
  hash(value: T): number
}

/**
 * SameValueZero equality, as native `Map` and `Set` use: primitives by value (`NaN` equals `NaN`,
 * `-0` equals `0`), objects, functions and classes by identity. Ignores the equality protocol.
 * It is what hashed collections use when no `key` or `equivalence` is given. Frozen.
 *
 * Time: O(1) for `equals`; `hash` as {@link hashCode} without the protocol.
 *
 * @example
 * ```ts
 * sameValueZeroEquivalence.equals(Number.NaN, Number.NaN) // true
 * sameValueZeroEquivalence.equals({}, {})                 // false
 * ```
 */
export const sameValueZeroEquivalence: Equivalence<unknown> = /*#__PURE__*/ Object.freeze({
  equals: sameValueZero,
  hash: hashPrimitiveOrIdentity,
})

/**
 * Value equality: {@link equals} and {@link hashCode}, which honour the `equalsSymbol` /
 * `hashCodeSymbol` protocol and otherwise use SameValueZero. Frozen.
 *
 * Time: as {@link equals} and {@link hashCode}.
 *
 * @example
 * ```ts
 * valueEquivalence.equals(new Point(1, 2), new Point(1, 2)) // true when Point implements Equatable
 * ```
 */
export const valueEquivalence: Equivalence<unknown> = /*#__PURE__*/ Object.freeze({
  equals,
  hash: hashCode,
})

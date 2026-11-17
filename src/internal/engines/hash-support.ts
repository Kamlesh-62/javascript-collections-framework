// Helpers shared by the hash engines: the guard around user callbacks, and `-0` normalisation.

import { ConcurrentModificationError } from '../../errors/errors'
import { describeValue, isIterable } from '../checks'
import { type KeyOf, sameValueZeroEquivalence, valueEquivalence } from '../equality'
import { type CheckedEquivalence, checkEquivalence } from '../equivalence'
import { checkKey } from '../key'
import type { ChangeCounter } from '../revision'

/**
 * How a hash collection decides that two values are equal, fixed at construction: SameValueZero on
 * the values (`native`), SameValueZero on derived keys (`keyed`), or an equivalence over seeded
 * buckets (`buckets`; `builtIn` for this copy's `valueEquivalence`).
 *
 * @internal
 */
export type HashEquality<E> =
  | { readonly kind: 'native' }
  | { readonly kind: 'keyed'; readonly key: KeyOf<E> }
  | {
      readonly kind: 'buckets'
      readonly equivalence: CheckedEquivalence
      readonly builtIn: boolean
    }

const SAME_VALUE_ZERO = { kind: 'native' } as const

/**
 * Reads a hash collection's options once: `key` and `equivalence` are each read a single time and
 * checked; `undefined` and `null` mean neither.
 *
 * Time: O(1).
 *
 * @param options - The options argument as given.
 * @param where - The constructor or factory to name in errors.
 * @throws TypeError when `options` is not an object, both are given, or either is invalid.
 * @internal
 */
export function readEquality<E>(options: unknown, where: string): HashEquality<E> {
  if (options === undefined || options === null) return SAME_VALUE_ZERO
  if (typeof options !== 'object') {
    throw new TypeError(`${where}: options is not an object (${describeValue(options)})`)
  }
  const record = options as { key?: unknown; equivalence?: unknown }
  const key = record.key
  const equivalence = record.equivalence
  if (key !== undefined && equivalence !== undefined) {
    throw new TypeError(`${where}: key and equivalence cannot both be given`)
  }
  if (key !== undefined) return { kind: 'keyed', key: checkKey<E>(key, where) as KeyOf<E> }
  if (equivalence === undefined || equivalence === sameValueZeroEquivalence) return SAME_VALUE_ZERO
  return {
    kind: 'buckets',
    equivalence: checkEquivalence(equivalence, where),
    builtIn: equivalence === valueEquivalence,
  }
}

/**
 * The arguments of a hash set's constructor, read by the native `Set` rules: an iterable first
 * argument is the elements; `undefined` or `null` means none; any other object, when no second
 * argument is given, is the options.
 *
 * @internal
 */
export interface SetArguments<E> {
  readonly elements: Iterable<E> | undefined
  readonly equality: HashEquality<E>
}

/**
 * Reads a hash set's constructor arguments: elements first, then options, as `readEquality` checks
 * them.
 *
 * Time: O(1).
 *
 * @param first - The first argument as given: elements, options, `undefined` or `null`.
 * @param second - The second argument as given: options, `undefined` or `null`.
 * @param where - The constructor to name in errors.
 * @throws TypeError when `first` is neither iterable, an options object nor `null`/`undefined`, or
 *   the options are invalid.
 * @internal
 */
export function readSetArguments<E>(
  first: unknown,
  second: unknown,
  where: string,
): SetArguments<E> {
  let elements: Iterable<E> | undefined
  let given: unknown = second
  if (first === undefined || first === null) {
    // empty
  } else if (isIterable(first)) {
    elements = first as Iterable<E>
  } else if (typeof first === 'object' && (second === undefined || second === null)) {
    given = first
  } else {
    throw new TypeError(`${where}: elements is not iterable (${describeValue(first)})`)
  }
  return { elements, equality: readEquality<E>(given, where) }
}

/**
 * One operation on a hash collection: the API to name in errors, and the structure count when it
 * started. A `key`, `equals` or `hash` call is passed through `after`, which throws when the call
 * added or removed members or mappings, so the operation itself changes nothing.
 *
 * @internal
 */
export class Operation {
  private readonly start: number
  private readonly noun: string
  readonly changes: ChangeCounter
  readonly where: string

  /**
   * @param changes - The collection's change counter.
   * @param where - `<Class>.<method>`, for messages.
   * @param noun - What the collection is called in messages: `set` or `map`.
   */
  constructor(changes: ChangeCounter, where: string, noun = 'set') {
    this.changes = changes
    this.where = where
    this.noun = noun
    this.start = changes.structure
  }

  after<T>(result: T): T {
    if (this.changes.structure !== this.start) {
      throw new ConcurrentModificationError(
        `${this.where}: the ${this.noun} was changed by a key, equals or hash function`,
      )
    }
    return result
  }
}

/**
 * Turns `-0` into `0`, as native `Set` and `Map` do, before any user function sees the value.
 *
 * @internal
 */
export function normalise<E>(value: E): E {
  return ((value as unknown) === 0 ? 0 : value) as E
}

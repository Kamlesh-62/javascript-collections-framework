// Reading the arguments of a sorted collection's constructor and `from`: the source that is not
// iterable, the options object, and the `comparator` option.

import type { Comparator } from '../functions/comparators'
import { describeValue } from './checks'

/**
 * The error for a first argument that is not iterable; a function gets a hint, since it is most
 * likely a comparator passed where the options belong.
 *
 * @param where - The API to name in the message.
 * @param value - The argument as given.
 * @param noun - What the argument holds: `elements` or `entries`.
 * @internal
 */
export function notIterable(where: string, value: unknown, noun: string): TypeError {
  const hint = typeof value === 'function' ? '; pass the comparator as { comparator }' : ''
  return new TypeError(`${where}: ${noun} is not iterable (${describeValue(value)})${hint}`)
}

/**
 * Throws `TypeError` unless `options` is an object (not `null`, not a function).
 *
 * @internal
 */
export function requireOptions(options: unknown, where: string): void {
  if (options === null || typeof options !== 'object') {
    throw new TypeError(`${where}: options is not an object (${describeValue(options)})`)
  }
}

/**
 * Reads `comparator` once from checked options; it must be `undefined` or a function.
 *
 * @internal
 */
export function readComparator<E>(
  options: object | undefined,
  where: string,
): Comparator<E> | undefined {
  if (options === undefined) return undefined
  const comparator: unknown = (options as { comparator?: unknown }).comparator
  if (comparator !== undefined && typeof comparator !== 'function') {
    throw new TypeError(`${where}: comparator is not a function (${describeValue(comparator)})`)
  }
  return comparator as Comparator<E> | undefined
}

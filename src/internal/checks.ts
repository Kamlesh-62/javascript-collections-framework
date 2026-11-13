/**
 * Argument checks shared by every collection: element indexes, insertion positions and ranges,
 * with uniform error classes and messages.
 *
 * Each check keeps the passing path to one inline test; building a message happens only on
 * failure, in separate functions. Values are rendered into messages without running user code.
 *
 * @internal
 * @packageDocumentation
 */

import { IllegalArgumentError, IndexOutOfBoundsError } from '../errors/errors'

/** The longest rendering of a string, symbol or bigint in a message, in UTF-16 code units. */
const MAX_RENDERED = 40

/** Cuts `text` to `MAX_RENDERED` code units without splitting a surrogate pair. */
function cut(text: string): string {
  if (text.length <= MAX_RENDERED) return text
  let end = MAX_RENDERED
  const last = text.charCodeAt(end - 1)
  if (last >= 0xd800 && last <= 0xdbff) end -= 1
  return text.slice(0, end)
}

/**
 * Renders a value for an error message without running user code.
 *
 * Objects and functions are described by `typeof` only (no `toString`, getter, `Symbol.toStringTag`
 * or `Proxy` trap runs). Strings are cut to 40 code units without splitting a surrogate pair and
 * JSON-escaped, so quotes and control characters cannot forge log lines. Symbols and bigints are
 * cut the same way but not escaped; numbers, booleans, `null` and `undefined` are written as they
 * are.
 *
 * Time: O(1), except for a bigint or a symbol, which is converted to a string in full before it is
 * cut: linear in a symbol's description length, and more than linear in a bigint's digit count.
 *
 * @param value - Any value.
 * @returns A short, safe description.
 * @internal
 */
export function describeValue(value: unknown): string {
  switch (typeof value) {
    case 'string':
      return JSON.stringify(cut(value))
    case 'number':
    case 'boolean':
      return String(value)
    case 'bigint':
      return `${cut(String(value))}n`
    case 'symbol':
      return cut(String(value))
    case 'undefined':
      return 'undefined'
    case 'object':
      return value === null ? 'null' : 'object'
    default:
      return typeof value
  }
}

/** True for a primitive number accepted by `Number.isSafeInteger` (including `-0`). */
function isSafeIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

function outOfBounds(where: string, label: string, value: unknown, size: number): Error {
  return new IndexOutOfBoundsError(
    `${where}: ${label} ${describeValue(value)} is out of bounds for size ${size}`,
  )
}

/**
 * Checks an element index: a safe integer with `0 <= index < size`.
 *
 * Time: O(1).
 *
 * @param index - The index given by the caller; any value.
 * @param size - The collection's current size.
 * @param where - `<Class>.<method>`, for the message.
 * @returns The index, with `-0` turned into `0`.
 * @throws IndexOutOfBoundsError when the index is not a safe integer or is out of range.
 * @internal
 */
export function checkIndex(index: unknown, size: number, where: string): number {
  if (!isSafeIndex(index) || index < 0 || index >= size) {
    throw outOfBounds(where, 'index', index, size)
  }
  return index + 0
}

/**
 * Checks an insertion position: a safe integer with `0 <= position <= size`.
 *
 * Time: O(1).
 *
 * @param position - The position given by the caller; any value.
 * @param size - The collection's current size.
 * @param where - `<Class>.<method>`, for the message.
 * @returns The position, with `-0` turned into `0`.
 * @throws IndexOutOfBoundsError when the position is not a safe integer or is out of range.
 * @internal
 */
export function checkPosition(position: unknown, size: number, where: string): number {
  if (!isSafeIndex(position) || position < 0 || position > size) {
    throw outOfBounds(where, 'position', position, size)
  }
  return position + 0
}

/**
 * Checks a half-open range `[from, to)` against a collection of `size` elements.
 *
 * Checked in order: `from` is a safe integer, `from >= 0`, `to` is a safe integer, `to <= size`
 * (each failure is an `IndexOutOfBoundsError` naming that bound), then `from <= to` (an
 * `IllegalArgumentError` naming both). `from === to` is a valid empty range.
 *
 * Time: O(1).
 *
 * @param from - Start of the range, inclusive; any value.
 * @param to - End of the range, exclusive; any value.
 * @param size - The collection's current size.
 * @param where - `<Class>.<method>`, for the message.
 * @throws IndexOutOfBoundsError when a bound is not a safe integer, `from < 0` or `to > size`.
 * @throws IllegalArgumentError when `from > to`.
 * @internal
 */
export function checkRange(from: unknown, to: unknown, size: number, where: string): void {
  if (!isSafeIndex(from) || from < 0) throw outOfBounds(where, 'from', from, size)
  if (!isSafeIndex(to) || to > size) throw outOfBounds(where, 'to', to, size)
  if (from > to) {
    throw new IllegalArgumentError(
      `${where}: from ${describeValue(from)} is greater than to ${describeValue(to)} for size ${size}`,
    )
  }
}

/**
 * Returns whether `value` can be iterated with `for…of`: not `null` or `undefined`, and with a
 * callable `Symbol.iterator`. Reading `Symbol.iterator` may run a getter or `Proxy` trap.
 *
 * Time: O(1) plus that read.
 *
 * @param value - Any value.
 * @returns `true` when `value` is iterable.
 * @internal
 */
export function isIterable(value: unknown): value is Iterable<unknown> {
  return (
    value !== null &&
    value !== undefined &&
    typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] === 'function'
  )
}

/**
 * Throws `TypeError` unless `value` is a function.
 *
 * Time: O(1).
 *
 * @param value - The argument given by the caller.
 * @param where - `<Class>.<method>`, for the message.
 * @param what - The parameter's name, for the message.
 * @throws TypeError when `value` is not a function.
 * @internal
 */
export function requireFunction(value: unknown, where: string, what: string): void {
  if (typeof value !== 'function') {
    throw new TypeError(`${where}: ${what} is not a function`)
  }
}

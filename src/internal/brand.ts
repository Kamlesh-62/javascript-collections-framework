// Brands: runtime identity for the library's public types.
//
// Interfaces vanish at runtime and `instanceof` fails across two copies of a package, so each
// public class carries a brand — a getter on its prototype keyed by
// `Symbol.for('javascript-collections-framework/<major>/<Name>')` that returns `true`. Two copies
// of the same major version share the key and recognise each other's instances. A brand only
// means "usable through the public API"; it is not a security boundary, and code that reads
// another object's internal state must use a module-local check instead.

// The brand of every queue, deque and their views.
export const QUEUE_BRAND: unique symbol = /*#__PURE__*/ Symbol.for(
  'javascript-collections-framework/1/Queue',
)

// The brand of every deque and its views.
export const DEQUE_BRAND: unique symbol = /*#__PURE__*/ Symbol.for(
  'javascript-collections-framework/1/Deque',
)

// The brand of every sequenced collection, view and read-only wrapper.
export const SEQUENCED_COLLECTION_BRAND: unique symbol = /*#__PURE__*/ Symbol.for(
  'javascript-collections-framework/1/SequencedCollection',
)

// The brand of every set and set view.
export const SET_COLLECTION_BRAND: unique symbol = /*#__PURE__*/ Symbol.for(
  'javascript-collections-framework/1/SetCollection',
)

// The brand of every map.
export const MAP_COLLECTION_BRAND: unique symbol = /*#__PURE__*/ Symbol.for(
  'javascript-collections-framework/1/MapCollection',
)

// The brand of every map entry.
export const MAP_ENTRY_BRAND: unique symbol = /*#__PURE__*/ Symbol.for(
  'javascript-collections-framework/1/MapEntry',
)

// The brand of every sorted set and its range and reversed views.
export const SORTED_SET_BRAND: unique symbol = /*#__PURE__*/ Symbol.for(
  'javascript-collections-framework/1/SortedSet',
)

// The brand of every list, list view and read-only list.
export const LIST_BRAND: unique symbol = /*#__PURE__*/ Symbol.for(
  'javascript-collections-framework/1/List',
)

/**
 * Returns whether `value` carries `brand` with the value `true`.
 *
 * Primitives, `null` and `undefined` return `false` without any property read. For objects and
 * functions the brand is read once; an error thrown by a getter or a `Proxy` trap propagates.
 *
 * Time: O(1) plus any user getter the read triggers.
 *
 * @internal
 */
export function isBranded(value: unknown, brand: symbol): boolean {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false
  return (value as Record<symbol, unknown>)[brand] === true
}

/**
 * Implements `static [Symbol.hasInstance]` for a branded class.
 *
 * When `instanceof` is evaluated against the branded class itself (`receiver === owner`), the
 * brand decides. A subclass that inherits this method without its own brand (a user subclass)
 * gets the ordinary prototype-chain check, so only its own instances match.
 *
 * Time: O(1) for the branded class; O(prototype-chain depth) for a subclass.
 *
 * @param receiver - `this` inside `[Symbol.hasInstance]`: the class on the right of `instanceof`.
 * @param owner - The branded library class that defines the method.
 * @param brand - The owner's brand symbol.
 * @param value - The value on the left of `instanceof`.
 * @internal
 */
export function brandedHasInstance(
  receiver: { prototype: object },
  owner: object,
  brand: symbol,
  value: unknown,
): boolean {
  if (receiver === owner) return isBranded(value, brand)
  // isPrototypeOf returns false for primitives, as ordinary `instanceof` does.
  return Object.prototype.isPrototypeOf.call(receiver.prototype, value as object)
}

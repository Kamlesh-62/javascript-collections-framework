// The key under which a read-only view, cursor, entry or iterator keeps what it reads. It is not a
// registered symbol and it is not exported from the package, and the property is non-enumerable,
// so `Object.keys`, `JSON.stringify`, `for…in`, spread and `Object.assign` never show or copy the
// source. Reflection (`Object.getOwnPropertySymbols`) still sees it; the source is hidden, not
// protected. The property stays writable and configurable so that framework proxies, whose `get`
// trap may return a wrapped value, keep working.

import { defineProperty } from '../../intrinsics'
import { done, IteratorBase } from '../../iteration'

/** The key of a read-only wrapper's source. @internal */
export const SOURCE: unique symbol = /*#__PURE__*/ Symbol('source')

/** Stores `source` on `target` under {@link SOURCE}, non-enumerable. @internal */
export function hideSource(target: object, source: object): void {
  defineProperty(target, SOURCE, { value: source, writable: true, configurable: true })
}

/**
 * The iterator a read-only view returns: it walks the source's iterator, which it keeps under
 * {@link SOURCE}, so the source's iterator and the storage it walks stay out of reach. Each item
 * is passed through `reveal` when one is given. The live or fail-fast behaviour is the source
 * iterator's.
 *
 * @internal
 */
export class ReadOnlyIterator<E> extends IteratorBase implements IterableIterator<E> {
  declare readonly [SOURCE]: Iterator<E>
  private readonly reveal: ((item: E) => E) | undefined

  constructor(inner: Iterator<E>, reveal?: (item: E) => E) {
    super()
    hideSource(this, inner)
    this.reveal = reveal
  }

  next(): IteratorResult<E> {
    const result = this[SOURCE].next()
    if (result.done) return done()
    return this.reveal === undefined ? result : { done: false, value: this.reveal(result.value) }
  }

  [Symbol.iterator](): this {
    return this
  }
}

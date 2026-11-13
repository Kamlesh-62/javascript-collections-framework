/**
 * The error classes thrown by the library. Each extends a native error class, so code that tests
 * for `RangeError`, `TypeError` or `Error` keeps working, and each can be caught precisely with
 * `instanceof`.
 *
 * @packageDocumentation
 */

import { brandedHasInstance } from '../internal/brand'
import { initError } from '../internal/errors'

const INDEX_OUT_OF_BOUNDS_ERROR_BRAND: unique symbol = /*#__PURE__*/ Symbol.for(
  'javascript-collections-framework/1/IndexOutOfBoundsError',
)

/**
 * Thrown when an index, position or range bound is outside a collection's bounds, or is not a safe integer.
 *
 * Extends `RangeError`. Match it with `instanceof`, not by `name` or message text: the message names
 * the method and the problem, but its wording may change in any release.
 *
 * Time: O(1) to construct, plus the runtime's stack capture.
 *
 * @example
 * ```ts
 * try {
 *   throw new IndexOutOfBoundsError('Grid.cell: index 9 is out of bounds for size 4')
 * } catch (error) {
 *   if (error instanceof IndexOutOfBoundsError) {
 *     // handle it
 *   }
 * }
 * ```
 */
export class IndexOutOfBoundsError extends RangeError {
  /**
   * Creates the error.
   *
   * @param message - What went wrong, in the form `Class.method: problem`.
   */
  constructor(message?: string) {
    super(message)
    initError(this, 'IndexOutOfBoundsError', new.target)
  }

  /**
   * Marks instances of this class so `instanceof` recognises them across copies of the package.
   * Its key is not exported, so the getter is not called directly. Time: O(1).
   */
  get [INDEX_OUT_OF_BOUNDS_ERROR_BRAND](): true {
    return true
  }

  /**
   * Returns whether `value` is an instance of this class, including instances created by another
   * copy of the library with the same major version.
   *
   * Time: O(1); O(prototype-chain depth) when evaluated against a subclass.
   *
   * @param value - The value on the left of `instanceof`.
   * @returns `true` when `value` carries this class's brand; when evaluated against a subclass,
   *   `true` when the subclass's prototype is in `value`'s prototype chain.
   *
   * @example
   * ```ts
   * value instanceof IndexOutOfBoundsError // also true for an instance made by another copy of the package
   * ```
   */
  static override [Symbol.hasInstance](value: unknown): boolean {
    // biome-ignore lint/complexity/noThisInStatic: `this` is the class on the right of `instanceof`; user subclasses rely on it
    return brandedHasInstance(this, IndexOutOfBoundsError, INDEX_OUT_OF_BOUNDS_ERROR_BRAND, value)
  }
}

const ILLEGAL_ARGUMENT_ERROR_BRAND: unique symbol = /*#__PURE__*/ Symbol.for(
  'javascript-collections-framework/1/IllegalArgumentError',
)

/**
 * Thrown when an argument has a value the operation cannot accept, such as a range whose start is after its end.
 *
 * Extends `RangeError`. Match it with `instanceof`, not by `name` or message text: the message names
 * the method and the problem, but its wording may change in any release.
 *
 * Time: O(1) to construct, plus the runtime's stack capture.
 *
 * @example
 * ```ts
 * try {
 *   throw new IllegalArgumentError('Grid.rows: from 3 is greater than to 1 for size 4')
 * } catch (error) {
 *   if (error instanceof IllegalArgumentError) {
 *     // handle it
 *   }
 * }
 * ```
 */
export class IllegalArgumentError extends RangeError {
  /**
   * Creates the error.
   *
   * @param message - What went wrong, in the form `Class.method: problem`.
   */
  constructor(message?: string) {
    super(message)
    initError(this, 'IllegalArgumentError', new.target)
  }

  /**
   * Marks instances of this class so `instanceof` recognises them across copies of the package.
   * Its key is not exported, so the getter is not called directly. Time: O(1).
   */
  get [ILLEGAL_ARGUMENT_ERROR_BRAND](): true {
    return true
  }

  /**
   * Returns whether `value` is an instance of this class, including instances created by another
   * copy of the library with the same major version.
   *
   * Time: O(1); O(prototype-chain depth) when evaluated against a subclass.
   *
   * @param value - The value on the left of `instanceof`.
   * @returns `true` when `value` carries this class's brand; when evaluated against a subclass,
   *   `true` when the subclass's prototype is in `value`'s prototype chain.
   *
   * @example
   * ```ts
   * value instanceof IllegalArgumentError // also true for an instance made by another copy of the package
   * ```
   */
  static override [Symbol.hasInstance](value: unknown): boolean {
    // biome-ignore lint/complexity/noThisInStatic: `this` is the class on the right of `instanceof`; user subclasses rely on it
    return brandedHasInstance(this, IllegalArgumentError, ILLEGAL_ARGUMENT_ERROR_BRAND, value)
  }
}

const UNSUPPORTED_OPERATION_ERROR_BRAND: unique symbol = /*#__PURE__*/ Symbol.for(
  'javascript-collections-framework/1/UnsupportedOperationError',
)

/**
 * Thrown when a collection does not support the requested operation, such as a change to a read-only collection.
 *
 * Extends `TypeError`. Match it with `instanceof`, not by `name` or message text: the message names
 * the method and the problem, but its wording may change in any release.
 *
 * Time: O(1) to construct, plus the runtime's stack capture.
 *
 * @example
 * ```ts
 * try {
 *   throw new UnsupportedOperationError('Snapshot.add: the collection cannot be changed')
 * } catch (error) {
 *   if (error instanceof UnsupportedOperationError) {
 *     // handle it
 *   }
 * }
 * ```
 */
export class UnsupportedOperationError extends TypeError {
  /**
   * Creates the error.
   *
   * @param message - What went wrong, in the form `Class.method: problem`.
   */
  constructor(message?: string) {
    super(message)
    initError(this, 'UnsupportedOperationError', new.target)
  }

  /**
   * Marks instances of this class so `instanceof` recognises them across copies of the package.
   * Its key is not exported, so the getter is not called directly. Time: O(1).
   */
  get [UNSUPPORTED_OPERATION_ERROR_BRAND](): true {
    return true
  }

  /**
   * Returns whether `value` is an instance of this class, including instances created by another
   * copy of the library with the same major version.
   *
   * Time: O(1); O(prototype-chain depth) when evaluated against a subclass.
   *
   * @param value - The value on the left of `instanceof`.
   * @returns `true` when `value` carries this class's brand; when evaluated against a subclass,
   *   `true` when the subclass's prototype is in `value`'s prototype chain.
   *
   * @example
   * ```ts
   * value instanceof UnsupportedOperationError // also true for an instance made by another copy of the package
   * ```
   */
  static override [Symbol.hasInstance](value: unknown): boolean {
    return brandedHasInstance(
      // biome-ignore lint/complexity/noThisInStatic: `this` is the class on the right of `instanceof`; user subclasses rely on it
      this,
      UnsupportedOperationError,
      UNSUPPORTED_OPERATION_ERROR_BRAND,
      value,
    )
  }
}

const NULL_ELEMENT_ERROR_BRAND: unique symbol = /*#__PURE__*/ Symbol.for(
  'javascript-collections-framework/1/NullElementError',
)

/**
 * Thrown when `null` or `undefined` is given where a collection does not accept it.
 *
 * Extends `TypeError`. Match it with `instanceof`, not by `name` or message text: the message names
 * the method and the problem, but its wording may change in any release.
 *
 * Time: O(1) to construct, plus the runtime's stack capture.
 *
 * @example
 * ```ts
 * try {
 *   throw new NullElementError('Queue.offer: undefined is not allowed as an element')
 * } catch (error) {
 *   if (error instanceof NullElementError) {
 *     // handle it
 *   }
 * }
 * ```
 */
export class NullElementError extends TypeError {
  /**
   * Creates the error.
   *
   * @param message - What went wrong, in the form `Class.method: problem`.
   */
  constructor(message?: string) {
    super(message)
    initError(this, 'NullElementError', new.target)
  }

  /**
   * Marks instances of this class so `instanceof` recognises them across copies of the package.
   * Its key is not exported, so the getter is not called directly. Time: O(1).
   */
  get [NULL_ELEMENT_ERROR_BRAND](): true {
    return true
  }

  /**
   * Returns whether `value` is an instance of this class, including instances created by another
   * copy of the library with the same major version.
   *
   * Time: O(1); O(prototype-chain depth) when evaluated against a subclass.
   *
   * @param value - The value on the left of `instanceof`.
   * @returns `true` when `value` carries this class's brand; when evaluated against a subclass,
   *   `true` when the subclass's prototype is in `value`'s prototype chain.
   *
   * @example
   * ```ts
   * value instanceof NullElementError // also true for an instance made by another copy of the package
   * ```
   */
  static override [Symbol.hasInstance](value: unknown): boolean {
    // biome-ignore lint/complexity/noThisInStatic: `this` is the class on the right of `instanceof`; user subclasses rely on it
    return brandedHasInstance(this, NullElementError, NULL_ELEMENT_ERROR_BRAND, value)
  }
}

const CLASS_CAST_ERROR_BRAND: unique symbol = /*#__PURE__*/ Symbol.for(
  'javascript-collections-framework/1/ClassCastError',
)

/**
 * Thrown when values cannot be compared under natural ordering, such as a number and a string.
 *
 * Extends `TypeError`. Match it with `instanceof`, not by `name` or message text: the message names
 * the method and the problem, but its wording may change in any release.
 *
 * Time: O(1) to construct, plus the runtime's stack capture.
 *
 * @example
 * ```ts
 * try {
 *   throw new ClassCastError('Sorted.add: number and string cannot be compared')
 * } catch (error) {
 *   if (error instanceof ClassCastError) {
 *     // handle it
 *   }
 * }
 * ```
 */
export class ClassCastError extends TypeError {
  /**
   * Creates the error.
   *
   * @param message - What went wrong, in the form `Class.method: problem`.
   */
  constructor(message?: string) {
    super(message)
    initError(this, 'ClassCastError', new.target)
  }

  /**
   * Marks instances of this class so `instanceof` recognises them across copies of the package.
   * Its key is not exported, so the getter is not called directly. Time: O(1).
   */
  get [CLASS_CAST_ERROR_BRAND](): true {
    return true
  }

  /**
   * Returns whether `value` is an instance of this class, including instances created by another
   * copy of the library with the same major version.
   *
   * Time: O(1); O(prototype-chain depth) when evaluated against a subclass.
   *
   * @param value - The value on the left of `instanceof`.
   * @returns `true` when `value` carries this class's brand; when evaluated against a subclass,
   *   `true` when the subclass's prototype is in `value`'s prototype chain.
   *
   * @example
   * ```ts
   * value instanceof ClassCastError // also true for an instance made by another copy of the package
   * ```
   */
  static override [Symbol.hasInstance](value: unknown): boolean {
    // biome-ignore lint/complexity/noThisInStatic: `this` is the class on the right of `instanceof`; user subclasses rely on it
    return brandedHasInstance(this, ClassCastError, CLASS_CAST_ERROR_BRAND, value)
  }
}

const NO_SUCH_ELEMENT_ERROR_BRAND: unique symbol = /*#__PURE__*/ Symbol.for(
  'javascript-collections-framework/1/NoSuchElementError',
)

/**
 * Thrown when an element is requested from an empty collection or from a cursor that has no more elements.
 *
 * Extends `Error`. Match it with `instanceof`, not by `name` or message text: the message names
 * the method and the problem, but its wording may change in any release.
 *
 * Time: O(1) to construct, plus the runtime's stack capture.
 *
 * @example
 * ```ts
 * try {
 *   throw new NoSuchElementError('Queue.element: the queue is empty')
 * } catch (error) {
 *   if (error instanceof NoSuchElementError) {
 *     // handle it
 *   }
 * }
 * ```
 */
export class NoSuchElementError extends Error {
  /**
   * Creates the error.
   *
   * @param message - What went wrong, in the form `Class.method: problem`.
   */
  constructor(message?: string) {
    super(message)
    initError(this, 'NoSuchElementError', new.target)
  }

  /**
   * Marks instances of this class so `instanceof` recognises them across copies of the package.
   * Its key is not exported, so the getter is not called directly. Time: O(1).
   */
  get [NO_SUCH_ELEMENT_ERROR_BRAND](): true {
    return true
  }

  /**
   * Returns whether `value` is an instance of this class, including instances created by another
   * copy of the library with the same major version.
   *
   * Time: O(1); O(prototype-chain depth) when evaluated against a subclass.
   *
   * @param value - The value on the left of `instanceof`.
   * @returns `true` when `value` carries this class's brand; when evaluated against a subclass,
   *   `true` when the subclass's prototype is in `value`'s prototype chain.
   *
   * @example
   * ```ts
   * value instanceof NoSuchElementError // also true for an instance made by another copy of the package
   * ```
   */
  static override [Symbol.hasInstance](value: unknown): boolean {
    // biome-ignore lint/complexity/noThisInStatic: `this` is the class on the right of `instanceof`; user subclasses rely on it
    return brandedHasInstance(this, NoSuchElementError, NO_SUCH_ELEMENT_ERROR_BRAND, value)
  }
}

const ILLEGAL_STATE_ERROR_BRAND: unique symbol = /*#__PURE__*/ Symbol.for(
  'javascript-collections-framework/1/IllegalStateError',
)

/**
 * Thrown when an operation is called at the wrong time, such as a cursor's `remove()` before its `next()`.
 *
 * Extends `Error`. Match it with `instanceof`, not by `name` or message text: the message names
 * the method and the problem, but its wording may change in any release.
 *
 * Time: O(1) to construct, plus the runtime's stack capture.
 *
 * @example
 * ```ts
 * try {
 *   throw new IllegalStateError('Cursor.remove: next() has not been called')
 * } catch (error) {
 *   if (error instanceof IllegalStateError) {
 *     // handle it
 *   }
 * }
 * ```
 */
export class IllegalStateError extends Error {
  /**
   * Creates the error.
   *
   * @param message - What went wrong, in the form `Class.method: problem`.
   */
  constructor(message?: string) {
    super(message)
    initError(this, 'IllegalStateError', new.target)
  }

  /**
   * Marks instances of this class so `instanceof` recognises them across copies of the package.
   * Its key is not exported, so the getter is not called directly. Time: O(1).
   */
  get [ILLEGAL_STATE_ERROR_BRAND](): true {
    return true
  }

  /**
   * Returns whether `value` is an instance of this class, including instances created by another
   * copy of the library with the same major version.
   *
   * Time: O(1); O(prototype-chain depth) when evaluated against a subclass.
   *
   * @param value - The value on the left of `instanceof`.
   * @returns `true` when `value` carries this class's brand; when evaluated against a subclass,
   *   `true` when the subclass's prototype is in `value`'s prototype chain.
   *
   * @example
   * ```ts
   * value instanceof IllegalStateError // also true for an instance made by another copy of the package
   * ```
   */
  static override [Symbol.hasInstance](value: unknown): boolean {
    // biome-ignore lint/complexity/noThisInStatic: `this` is the class on the right of `instanceof`; user subclasses rely on it
    return brandedHasInstance(this, IllegalStateError, ILLEGAL_STATE_ERROR_BRAND, value)
  }
}

const CONCURRENT_MODIFICATION_ERROR_BRAND: unique symbol = /*#__PURE__*/ Symbol.for(
  'javascript-collections-framework/1/ConcurrentModificationError',
)

/**
 * Thrown when a collection that checks for it is changed while it is being iterated, or when a
 * map is changed inside a callback that must not change it.
 *
 * Extends `Error`. Match it with `instanceof`, not by `name` or message text: the message names
 * the method and the problem, but its wording may change in any release.
 *
 * Time: O(1) to construct, plus the runtime's stack capture.
 *
 * @example
 * ```ts
 * try {
 *   throw new ConcurrentModificationError('Cursor.next: the collection changed during iteration')
 * } catch (error) {
 *   if (error instanceof ConcurrentModificationError) {
 *     // handle it
 *   }
 * }
 * ```
 */
export class ConcurrentModificationError extends Error {
  /**
   * Creates the error.
   *
   * @param message - What went wrong, in the form `Class.method: problem`.
   */
  constructor(message?: string) {
    super(message)
    initError(this, 'ConcurrentModificationError', new.target)
  }

  /**
   * Marks instances of this class so `instanceof` recognises them across copies of the package.
   * Its key is not exported, so the getter is not called directly. Time: O(1).
   */
  get [CONCURRENT_MODIFICATION_ERROR_BRAND](): true {
    return true
  }

  /**
   * Returns whether `value` is an instance of this class, including instances created by another
   * copy of the library with the same major version.
   *
   * Time: O(1); O(prototype-chain depth) when evaluated against a subclass.
   *
   * @param value - The value on the left of `instanceof`.
   * @returns `true` when `value` carries this class's brand; when evaluated against a subclass,
   *   `true` when the subclass's prototype is in `value`'s prototype chain.
   *
   * @example
   * ```ts
   * value instanceof ConcurrentModificationError // also true for an instance made by another copy of the package
   * ```
   */
  static override [Symbol.hasInstance](value: unknown): boolean {
    return brandedHasInstance(
      // biome-ignore lint/complexity/noThisInStatic: `this` is the class on the right of `instanceof`; user subclasses rely on it
      this,
      ConcurrentModificationError,
      CONCURRENT_MODIFICATION_ERROR_BRAND,
      value,
    )
  }
}

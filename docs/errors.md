# Errors

The library reports its own failures with eight error classes. Each extends a native JavaScript
error, so existing `catch` code that tests for `RangeError`, `TypeError` or `Error` keeps working,
and each can be caught precisely with `instanceof`.

```ts
import { IndexOutOfBoundsError, NoSuchElementError } from 'javascript-collections-framework'
```

## The classes

| Class                         | Extends      | Thrown when                                                                                                                          |
| ----------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `IndexOutOfBoundsError`       | `RangeError` | an index, position or range bound is outside a collection's bounds, or is not a safe integer                                         |
| `IllegalArgumentError`        | `RangeError` | an argument has a value the operation cannot accept, such as a range whose start is after its end                                    |
| `UnsupportedOperationError`   | `TypeError`  | a collection does not support the requested operation, such as a change to a read-only collection                                    |
| `NullElementError`            | `TypeError`  | `null` or `undefined` is given where a collection does not accept it                                                                 |
| `ClassCastError`              | `TypeError`  | values cannot be compared under natural ordering, such as a number and a string                                                      |
| `NoSuchElementError`          | `Error`      | an element is requested from an empty collection or from a cursor with no more elements                                              |
| `IllegalStateError`           | `Error`      | an operation is called at the wrong time, such as a cursor's `remove()` before its `next()`                                          |
| `ConcurrentModificationError` | `Error`      | a collection that checks for it is changed while it is being iterated, or a map is changed inside a callback that must not change it |

## Catching errors

Match errors with `instanceof`:

```ts
try {
  // …
} catch (error) {
  if (error instanceof IndexOutOfBoundsError) {
    // a bad index
  } else if (error instanceof RangeError) {
    // any range problem, including IndexOutOfBoundsError and IllegalArgumentError
  } else {
    throw error
  }
}
```

Do not match on `message`. Messages start with the class and method that failed and name the
problem — `ArrayList.get: index 5 is out of bounds for size 3` — but their wording is not part of
the API and may change in any release. Values in messages are shortened and never converted by
calling your code: objects appear as `object`, long strings are cut to 40 characters.

Errors thrown by your own callbacks and comparators are not wrapped: they reach you unchanged.

## Indexes are never coerced

Methods that take an index, position or range accept only safe integers. Unlike
`Array.prototype.at`, they do not convert `'1'` or `1.5`, and they do not count negative indexes
from the end: `get(-1)` throws `IndexOutOfBoundsError`. A range whose start is after its end
throws `IllegalArgumentError`; an empty range (`from === to`) is allowed.

## Subclassing

The error classes may be extended, and a subclass may set its own `name`:

```ts
class CacheMissError extends NoSuchElementError {
  override name = 'CacheMissError'
}

const error = new CacheMissError('Cache.get: no entry for "user:42"')
error instanceof CacheMissError // true
error instanceof NoSuchElementError // true
String(error) // 'CacheMissError: Cache.get: no entry for "user:42"'
```

`name` is non-enumerable, as on native errors, so it does not appear in `Object.keys`, object
spread or `JSON.stringify`.

## Two copies of the package

An application can end up loading this package twice — an ES module and a CommonJS build, or two
nested installs. Errors created by one copy are still recognised by `instanceof` in the other, as
long as both copies have the same major version:

```ts
// error thrown by copy A, checked against the class from copy B
error instanceof IndexOutOfBoundsError // true
```

This works through a hidden marker on each class. The marker is a recognition mechanism, not a
security boundary: an object can claim to be an instance by carrying the marker, so never use
`instanceof` on these classes to decide whether untrusted data can be trusted.

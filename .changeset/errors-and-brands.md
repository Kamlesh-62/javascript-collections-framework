---
"javascript-collections-framework": minor
---

Add the error classes the collections throw: `IndexOutOfBoundsError`, `IllegalArgumentError`, `UnsupportedOperationError`, `NullElementError`, `ClassCastError`, `NoSuchElementError`, `IllegalStateError` and `ConcurrentModificationError`. Each extends `RangeError`, `TypeError` or `Error`, can be subclassed, and is recognised by `instanceof` across two copies of the package with the same major version.

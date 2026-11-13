---
"javascript-collections-framework": minor
---

Add the collection contract: the `ReadonlyCollection`, `Collection` and `Cursor` types and the `isCollection` guard. Collections use the native `Set` names (`has`, `add` returning the collection, `delete`), iterate live like native `Set` where they have a native counterpart and fail fast otherwise, expose a `revision` that changes on every change to contents, and print as `ArrayList(3) [1, 2, 3]`.

---
"javascript-collections-framework": minor
---

Add `ArrayDeque`, a double-ended queue stored in a circular array, with the `Queue`, `ReadonlyQueue`, `Deque` and `ReadonlyDeque` types and the `isQueue` and `isDeque` guards. Adding at either end is amortised O(1) and removing is O(1). Use it as a queue (`add` + `poll`), or as a stack with `push` and `pop` working at the end as on an array (`pop()` returns `undefined` when empty). `peek`/`poll`/`pop` return `undefined` when empty and `getFirst`/`removeFirst`/`getLast`/`removeLast` throw; `null` and `undefined` elements are rejected so `undefined` always means empty. `reversed()` is a live back-to-front view.

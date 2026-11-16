---
"javascript-collections-framework": minor
---

Add `PriorityQueue`, a queue that hands out its least element first, stored as a binary heap, and the `PriorityQueueOptions` type. `add` and `poll` are O(log n) and `peek` is O(1); building from n elements takes O(n). It orders by natural order or by the `comparator` option (`new PriorityQueue(elements, { comparator })`, `PriorityQueue.from(elements, options)`), and implements `Queue`, so `isQueue` recognises it. Iteration, `toArray` and `toString` use heap order, which is not sorted: drain with `poll` for sorted output. `null` and `undefined` are rejected, so `undefined` from `poll`/`peek` always means empty. A comparator that throws or returns `NaN` leaves the queue unchanged. Equality is identity.

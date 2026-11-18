---
"javascript-collections-framework": minor
---

Add collection algorithms: `binarySearch` (first matching index, or `-1`) and `sortedIndex` (insertion point) for sorted lists; `reverse`, `rotate`, `shuffle` (Fisher–Yates, seedable with any `() => number`), `swap` and `fill` that rearrange a list in place through `set`, so open iterators stay valid; `min` and `max` over any iterable, returning `undefined` when it is empty; `frequency`, `disjoint`, `indexOfSubList` and `lastIndexOfSubList`. They work on every list, including views, immutable lists and lists over arrays from `asList`, and a comparator or `random` that changes the list makes `binarySearch`, `sortedIndex` and `shuffle` throw `ConcurrentModificationError`.

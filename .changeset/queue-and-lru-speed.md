---
"javascript-collections-framework": minor
---

Faster `PriorityQueue`, access-ordered `LinkedHashMap`, `ArrayDeque`, `LinkedList`, `TreeMap` and `TreeSet`, with the same results, errors, iteration and comparison counts as before.

- `PriorityQueue` without a comparator builds, adds and polls faster while its elements are all numbers or all strings, with the same number of comparisons.
- `LinkedHashMap` with `accessOrder: true` made empty (and without `key` or `equivalence`) reads, writes and evicts faster through `get`, `has`, `set` and `delete`, also with `maxSize` and `onEvict`.
- `ArrayDeque.addFirst`, `pop` and `poll`, and `LinkedList.add`, `addLast`, `push`, `addFirst`, `poll` and `pop`, are faster.
- `TreeMap.get`, `getOrDefault`, `has`, `set`, `put`, `putAll` and `delete`, and `TreeSet.add`, `has` and `delete`, are faster while every key is a number, or every key a string, in natural order, with the same number of comparisons.

The documented bounds of some `LinkedHashMap` operations change, which is why this is a minor release: a map with `accessOrder: true` and neither `key` nor `equivalence`, made empty (not from entries or by `copy`), keeps its mappings in a compact form until the first call on it other than `get`, `has`, `set`, `put` (unless both `maxSize` and `onEvict` are given), `delete`, `size`, `isEmpty` and `clear`. That call costs O(n), once, so for such a map `getOrDefault`, `put` with `maxSize` and `onEvict`, `remove`, `replace`, `getOrInsert`, `getOrInsertComputed`, `compute`, `computeIfPresent`, `merge`, `putAll`, creating an iterator and the calls through views and `reversed()` are now documented as amortised. `get`, `has`, `set` and `delete` keep their bounds.

Bundle size (min + gzip) grows: `LinkedHashMap` by 1,019 B, `PriorityQueue` by 408 B, `TreeMap` by 310 B, `TreeSet` by 260 B, `LinkedHashSet` by 163 B, `ArrayDeque` by 80 B, `LinkedList` by 36 B, and the whole package by 2,025 B. The size budgets of `PriorityQueue` and `LinkedHashMap` are raised to match.

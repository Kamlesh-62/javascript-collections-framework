# Documentation

User documentation for `javascript-collections-framework`.

> Pre-release: pages are added here as each collection ships.

## Using the package

- [Compatibility](compatibility.md) — supported runtimes, frameworks, TypeScript versions and ways to load the package
- [Errors](errors.md) — the error classes, when each is thrown, catching, subclassing, and two copies of the package
- [Versioning](versioning.md) — what is public, what may change in which release, deprecation, and the policy before 1.0

## Concepts

- [Ordering](ordering.md) — natural order, comparators and their helpers, `compareSymbol` for your own types
- [Collections: the shared contract](collections.md) — the `Collection` interface, live and fail-fast iteration, cursors, `revision`, printing
- [Equality and hashing](equality.md) — SameValueZero by default, the `key` option, equivalences, the `equalsSymbol`/`hashCodeSymbol` protocol
- [Sets and maps together](sets-and-maps.md) — equality and hashes across implementations, map views as sets, `putAll` from any map, native `Set`/`Map` interop, `newSetFromMap` for an LRU set or a set in a custom order

## Collections

- [Lists and `ArrayList`](lists.md) — indexed lists, `insert` vs `add`, sorting, list cursors, `subList` and `reversed` views, differences from `Array`

- [Sets and `HashSet`](sets.md) — a drop-in for `Set` with value equality on request (`key`, `equivalence`), structural `equals`, live iteration, cost and collision resistance, differences from `Set`

- [Linked hash sets and `LinkedHashSet`](linked-hash-sets.md) — a set in insertion order with both ends: `getFirst`/`getLast`, `removeFirst`/`removeLast`, `addFirst`/`addLast` that insert or move, a live reversed view, live iteration with moves, differences from `Set`

- [Maps and `HashMap`](maps.md) — a drop-in for `Map` with keys compared by value on request, `getOrInsert`, `compute` and `merge`, live key, entry and value views, structural `equals`, cost, differences from `Map`

- [Linked hash maps and `LinkedHashMap`](linked-hash-maps.md) — a map in insertion or access order with both ends: `firstEntry`/`lastEntry`, polls, `putFirst`/`putLast` that insert or move, a live reversed view, an LRU cache from `accessOrder`, `maxSize` and `onEvict`, live iteration with moves and accesses, differences from `Map`

- [Queues, deques and `ArrayDeque`](deques.md) — first in first out, stacks with `push`/`pop`, both ends, the reversed view, `null` rejection, differences from `Array`

- [`LinkedList` and node handles](linked-lists.md) — a deque with O(1) insert and remove next to a known element, handles, stored `null`/`undefined`, differences from `Array`

- [Sorted maps and `TreeMap`](sorted-maps.md) — mappings kept in key order, nearest-entry queries (`floorEntry`, `ceilingEntry`, …), key-only queries through `keySet()`, live range and reversed views, entries as live handles, failures that change nothing, differences from `Map`

- [Sorted sets and `TreeSet`](sorted-sets.md) — members kept in order, nearest-match queries (`floor`, `ceiling`, …), live range and reversed views, comparator sameness, failures that change nothing, differences from a sorted array

- [Priority queues and `PriorityQueue`](priority-queues.md) — least element first in O(log n), comparators, iteration is not sorted, ties, failures that change nothing, differences from a sorted array

Still to come: see the planned list in the [README](../README.md#planned-collections).

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

## Collections

- [Lists and `ArrayList`](lists.md) — indexed lists, `insert` vs `add`, sorting, list cursors, `subList` and `reversed` views, differences from `Array`

- [Sets and `HashSet`](sets.md) — a drop-in for `Set` with value equality on request (`key`, `equivalence`), structural `equals`, live iteration, cost and collision resistance, differences from `Set`

- [Queues, deques and `ArrayDeque`](deques.md) — first in first out, stacks with `push`/`pop`, both ends, the reversed view, `null` rejection, differences from `Array`

- [`LinkedList` and node handles](linked-lists.md) — a deque with O(1) insert and remove next to a known element, handles, stored `null`/`undefined`, differences from `Array`

- [Sorted sets and `TreeSet`](sorted-sets.md) — members kept in order, nearest-match queries (`floor`, `ceiling`, …), live range and reversed views, comparator sameness, failures that change nothing, differences from a sorted array

- [Priority queues and `PriorityQueue`](priority-queues.md) — least element first in O(log n), comparators, iteration is not sorted, ties, failures that change nothing, differences from a sorted array

Still to come: see the planned list in the [README](../README.md#planned-collections).

---
"javascript-collections-framework": minor
---

Add `LinkedHashSet`, a set in insertion order that can be read and changed at both ends, with the `SequencedSet` and `ReadonlySequencedSet` types and the `LinkedHashSetOptions` type. It behaves as `HashSet` does — native `Set` names and results, SameValueZero by default, the `key` and `equivalence` options, live iteration — and adds `getFirst`, `getLast`, `removeFirst` and `removeLast`, `addFirst` and `addLast`, which insert an absent member at that end or move the present one there, and a live `reversed()` view whose `add` inserts at the view's end; all are O(1). A move during a loop acts as a delete followed by an insertion at the new end, as `delete` then `add` does on a native `Set`. A `LinkedHashSet` equals a `HashSet` or `TreeSet` with the same members and hashes as an equal `HashSet`. `SortedSet` and `ReadonlySortedSet` now extend `SequencedSet` and `ReadonlySequencedSet` (type-only; their members are unchanged).

---
"javascript-collections-framework": minor
---

Faster `LinkedHashMap` and `LinkedHashSet` without the `key`, `equivalence` or `accessOrder` option: such a collection keeps its contents in a native `Map` or `Set` while it is only added to, read, deleted from and iterated from the front, so those operations cost about what the native ones cost. The first call that needs linked order (`putFirst`, `putLast` of a present key, `lastEntry`, `pollLastEntry`, `addFirst`, `addLast` of a member, `getLast`, `removeLast`, any call through `reversed()`, and map view calls other than `size`, `isEmpty` and `has`) moves the collection to linked records once, in O(n). Results, errors and live iteration are unchanged, including for iterators, cursors and entries open across that call.

The documented bounds change accordingly, a breaking change that ships as a minor release before 1.0: the ends, `putFirst`, `putLast`, `addFirst`, `addLast`, the view and reversed-view operations, and each eviction of a map with `maxSize` (and so its inserting methods) are now O(1) amortised, or O(1) amortised average where they were O(1) average. The size budgets of `LinkedHashMap` (12,736 bytes gzipped) and `LinkedHashSet` (9,408) and of the whole package (38,144) are raised for the native layout, which adds about 1.5 kB and 0.8 kB gzipped to the two classes.

---
"javascript-collections-framework": patch
---

Document behaviour that was already in place: `shuffle` calls `random` max(size − 1, 0) times, and a throwing `random` keeps the swaps made before; `compute`, `computeIfPresent`, `merge` and `getOrInsertComputed` insert nothing when their callback throws and keep the callback's own changes; `from` with a map function reads its source while mapping and returns nothing when the function throws; when `ArrayList.sort` throws `ConcurrentModificationError`, the comparator's changes stay and the sort writes nothing; `asList` callbacks that change the array's length are detected; fail-fast `forEach` throws right after the call that changed the collection; an error thrown while a value is inspected, such as by a revoked `Proxy`, propagates. Keys named after built-in properties such as `'__proto__'` are ordinary keys, and options inherited from a prototype are read, as native option objects are.

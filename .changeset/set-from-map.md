---
"javascript-collections-framework": minor
---

Add `newSetFromMap(map)`, which returns a set whose members are the keys of an empty library map, with that map's order, key equality and eviction: an access-ordered `LinkedHashMap` with `maxSize` gives a set that keeps the most recently added members, and a `TreeMap` with a comparator gives a set in that order. Adding calls `map.getOrInsert(member, true)`; iteration and removals go through the map's `keySet()`, so the set iterates live or fails fast as that key set does. A non-empty map throws `IllegalArgumentError`; anything that is not a library map throws `TypeError`. A new documentation page describes how sets and maps of every implementation compare, copy and work with native `Set` and `Map`.

---
"javascript-collections-framework": minor
---

Add immutable lists, sets and maps: `listOf`, `setOf` and `mapOf` build one from their arguments, and `copyOfList`, `copyOfSet` and `copyOfMap` from any iterable (a map also from a library map, a native `Map`, or map entries). Sets and maps follow the `new Set`/`new Map` rules for duplicates, `-0`, `NaN`, `null` and `undefined`; `copyOfSet` and `copyOfMap` take the same `key`/`equivalence` options as `HashSet`/`HashMap`. The results are typed `ReadonlyList`, `ReadonlySetCollection` and `ReadonlyMapCollection`; every method that would change them, their views, cursors or entries throws `UnsupportedOperationError` before looking at its arguments. They equal, and hash like, any list, set or map with the same contents, and print as `ImmutableList`, `ImmutableSet` and `ImmutableMap`.

# javascript-collections-framework

## 0.2.0

### Minor Changes

- 341c5de: Faster `LinkedHashMap` and `LinkedHashSet` without the `key`, `equivalence` or `accessOrder` option: such a collection keeps its contents in a native `Map` or `Set` while it is only added to, read, deleted from and iterated from the front, so those operations cost about what the native ones cost. The first call that needs linked order (`putFirst`, `putLast` of a present key, `lastEntry`, `pollLastEntry`, `addFirst`, `addLast` of a member, `getLast`, `removeLast`, any call through `reversed()`, and map view calls other than `size`, `isEmpty` and `has`) moves the collection to linked records once, in O(n). Results, errors and live iteration are unchanged, including for iterators, cursors and entries open across that call.

  The documented bounds change accordingly, a breaking change that ships as a minor release before 1.0: the ends, `putFirst`, `putLast`, `addFirst`, `addLast`, the view and reversed-view operations, and each eviction of a map with `maxSize` (and so its inserting methods) are now O(1) amortised, or O(1) amortised average where they were O(1) average. The size budgets of `LinkedHashMap` (12,736 bytes gzipped) and `LinkedHashSet` (9,408) and of the whole package (38,144) are raised for the native layout, which adds about 1.5 kB and 0.8 kB gzipped to the two classes.
- e987b3c: Faster `PriorityQueue`, access-ordered `LinkedHashMap`, `ArrayDeque`, `LinkedList`, `TreeMap` and `TreeSet`, with the same results, errors, iteration and comparison counts as before.
  - `PriorityQueue` without a comparator builds, adds and polls faster while its elements are all numbers or all strings, with the same number of comparisons.
  - `LinkedHashMap` with `accessOrder: true` made empty (and without `key` or `equivalence`) reads, writes and evicts faster through `get`, `has`, `set` and `delete`, also with `maxSize` and `onEvict`.
  - `ArrayDeque.addFirst`, `pop` and `poll`, and `LinkedList.add`, `addLast`, `push`, `addFirst`, `poll` and `pop`, are faster.
  - `TreeMap.get`, `getOrDefault`, `has`, `set`, `put`, `putAll` and `delete`, and `TreeSet.add`, `has` and `delete`, are faster while every key is a number, or every key a string, in natural order, with the same number of comparisons.

  The documented bounds of some `LinkedHashMap` operations change, which is why this is a minor release: a map with `accessOrder: true` and neither `key` nor `equivalence`, made empty (not from entries or by `copy`), keeps its mappings in a compact form until the first call on it other than `get`, `has`, `set`, `put` (unless both `maxSize` and `onEvict` are given), `delete`, `size`, `isEmpty` and `clear`. That call costs O(n), once, so for such a map `getOrDefault`, `put` with `maxSize` and `onEvict`, `remove`, `replace`, `getOrInsert`, `getOrInsertComputed`, `compute`, `computeIfPresent`, `merge`, `putAll`, creating an iterator and the calls through views and `reversed()` are now documented as amortised. `get`, `has`, `set` and `delete` keep their bounds.

  Bundle size (min + gzip) grows: `LinkedHashMap` by 1,019 B, `PriorityQueue` by 408 B, `TreeMap` by 310 B, `TreeSet` by 260 B, `LinkedHashSet` by 163 B, `ArrayDeque` by 80 B, `LinkedList` by 36 B, and the whole package by 2,025 B. The size budgets of `PriorityQueue` and `LinkedHashMap` are raised to match.

### Patch Changes

- ede4cfa: The README's `<script>` snippet now names the published version with its SHA-384 integrity hash, so it can be copied as it is. Each release also gets a GitHub release with its changelog, the install command and that snippet.
- 54cdefd: Faster reads, writes and iteration for hash maps and sets, and faster natural-order comparisons in sorted collections and priority queues, with no change in behaviour. A `HashMap` without the `key` or `equivalence` option now reads, writes and deletes with one call to its native `Map` where one suffices and iterates the native `Map` directly; `LinkedHashMap` and `LinkedHashSet` look a key up once; two numbers or two strings are compared without classifying them. Lists and deques build their error messages only when an error is thrown, and default hash collections skip the guard they need only around user callbacks.
- 034956a: The README now opens with what JavaScript lacks — a sorted map, a priority queue and object keys compared by value — and shows each in one short example, followed by links to try it in the browser, the recipes and the benchmarks. The package description and keywords on npm name the structures it provides.
- 54166a3: The README links runnable recipes for common tasks: the k largest values of a stream, merging sorted arrays, the maximum of each sliding window, an LRU cache, a booking calendar that rejects overlaps, the shortest path on a grid, a running median, the most recent distinct items, and the events inside a time range. Each recipe states its collection and time complexity, prints its results with the exact output in a comment, and opens in StackBlitz. No change to the package's code.
- 35ceed7: Faster linked lists, linked hash maps and sets, construction from input, array deque growth, indexed list reads and value-keyed hash map lookups; no behaviour changes.

## 0.1.1

### Patch Changes

- 53b7af1: The ES module build is published as one file per module. Bundlers that keep every class of a file they import, such as esbuild, now leave out the files of collections that are not imported, instead of bundling the whole package. The CommonJS, script-tag and type declaration files are unchanged. Only the package root is public; the files under `dist/` are internal and may change in any release.
- b6a0e0b: Add an `@example` to the TSDoc of `TreeSetOptions` and `PriorityQueueOptions`. The documentation gains a page of behaviour notes, an API reference site and README badges for the CI result and the line coverage; every code example in `README.md` and `docs/` now runs as a test, and the examples that did not run as written were fixed.
- 69a37d6: The package no longer ships source maps, so it installs at about 2.1 MB instead of 5.2 MB; the ES module and CommonJS builds remain readable as published. The README opens with a quick start and a comparison with native collections and other libraries, and shows the npm version, bundle size and dependency count. A new page, "Coming from native JavaScript", puts each native pattern next to its collection, and a playground runs the package in the browser without installing it.

## 0.1.0

First release. Until `1.0.0`, a minor version may contain breaking changes; each is listed here
with what to change (see [versioning](docs/versioning.md)).

### Collections

- `ArrayList`: a growable list stored in an array, with checked indexes, a stable `sort`, list
  cursors that move both ways, and live `subList` and `reversed` views.
- `LinkedList`: a double-ended queue stored as a doubly linked list, with node handles for O(1)
  insertion and removal next to a known element.
- `ArrayDeque`: a double-ended queue stored in a circular array; amortised O(1) at both ends.
- `PriorityQueue`: a binary heap that hands out its least element first, by natural order or a
  comparator.
- `HashSet` and `HashMap`: behave like native `Set` and `Map` (names, insertion order,
  SameValueZero, live iteration), with `key` and `equivalence` options for value equality, live
  key, entry and value views, and `compute`, `merge`, `getOrInsert` and friends.
- `LinkedHashSet` and `LinkedHashMap`: insertion order that can be read and changed at both ends,
  live reversed views, and for maps `accessOrder` and `maxSize` with `onEvict`, together an LRU
  cache.
- `TreeSet` and `TreeMap`: sorted sets and maps stored as balanced binary search trees, with
  O(log n) lookups and nearest-match queries, and live range and reversed views.
- `newSetFromMap`: a set over the keys of any library map, with that map's order and eviction.

### Immutable collections and views

- `listOf`, `setOf`, `mapOf`, `copyOfList`, `copyOfSet` and `copyOfMap`: immutable lists, sets
  and maps; every change throws `UnsupportedOperationError`.
- `unmodifiableCollection`, `unmodifiableList`, `unmodifiableSet`, `unmodifiableMap` and their
  sequenced and sorted forms: read-only windows that show the owner's changes and never nest.
- `asList(array)`: a list over an array that writes through to it.

### Functions and protocols

- Algorithms: `binarySearch`, `sortedIndex`, `reverse`, `rotate`, `shuffle`, `swap`, `fill`,
  `min`, `max`, `frequency`, `disjoint`, `indexOfSubList` and `lastIndexOfSubList`.
- Ordering: `naturalOrder`, `reverseOrder`, `comparing`, `thenComparing`, `nullsFirst`,
  `nullsLast`, and the `compareSymbol` protocol.
- Equality and hashing: `equals`, `hashCode`, `sameValueZeroEquivalence`, `valueEquivalence`,
  and the `equalsSymbol` and `hashCodeSymbol` protocols. Hashes are seeded.
- Guards: `isCollection`, `isList`, `isSetCollection`, `isMapCollection`, `isQueue`, `isDeque`,
  `isSequencedCollection`, `isSortedSet` and `isSortedMap`, which work across two loaded copies of
  the package.
- Errors: `IndexOutOfBoundsError`, `IllegalArgumentError`, `UnsupportedOperationError`,
  `NullElementError`, `ClassCastError`, `NoSuchElementError`, `IllegalStateError` and
  `ConcurrentModificationError`, each extending `RangeError`, `TypeError` or `Error`.

### Packaging

- Zero runtime dependencies. ES2015 output as ESM, CommonJS and a `<script>` build, with types
  checked against TypeScript 5.0 and later.
- Every public member documents its time complexity; [how this library is
  tested](docs/testing.md) describes the contract suites, stress tests, worst cases, realistic
  workloads and hostile values behind it.

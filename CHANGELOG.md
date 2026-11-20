# javascript-collections-framework

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

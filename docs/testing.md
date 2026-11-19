# How this library is tested

This page describes what is tested, how to run each kind of test, how to replay a failure, and
what is not tested. Every count is in the [table below](#counts); the counts are constants in
`test/stress/config.ts`, never derived from elapsed time, and a test checks that the table matches
them.

## Kinds of test

**Shared contract suites.** Each interface (`Collection`, `List`, `SetCollection`,
`MapCollection`, `Queue`, `Deque`, the sequenced and sorted interfaces) has one suite of rules in
`test/contracts/`. Every class and every view that implements the interface runs the same suite,
so a rule holds for all of them or the run fails.

**Reference comparisons.** Seeded random sequences of operations run on a collection and, side by
side, on a plain reference: a native `Array`, `Map` or `Set`, a sorted array for the sorted
collections, an array of stamped entries for the linked collections. Every result, the size and
the contents are compared. Live iterators are compared with native iterators while the
collection changes; fail-fast iterators must throw `ConcurrentModificationError` after a change.

**Scale.** Every collection, `asList` and `newSetFromMap` is filled to a large size, queried,
iterated, partly removed (by `removeIf`, through a cursor and at the ends) and drained, against
the same references. Tree maps and sets are filled in ascending, descending and alternating order,
and every insertion, lookup and removal is checked to stay within 2·⌈log₂(n + 1)⌉ comparisons
(plus one in natural order). Views over large collections (sub-lists, range views, reversed
views, key, entry and value views, unmodifiable views) are created with as many comparisons,
equality calls and element reads as views over small ones. Printing, `JSON.stringify`, `equals`
and `hashCode` run on large collections and on nested ones. Nesting far deeper than the call stack
allows throws the engine's `RangeError`, and afterwards no collection is left marked as in
progress.

**Deep random runs.** The reference comparisons run again for many more seeds and steps, over
every model, collection and option path (default equality, `key`, `equivalence`, an equivalence
with few hashes, views, access order, `maxSize`). Each run grows its collection past a high mark
and shrinks it below a low mark again and again, so tables resize and trees rebalance while
iterators and cursors are held open.

**The built package.** The scale suites, the deep random runs, the worst-case suites and the
realistic workloads run a second and third time against the built files, `dist/index.js` (ESM)
and `dist/index.cjs` (CommonJS), loaded without a transform: the code that is published.

**Two loaded copies.** The ESM and CommonJS builds are loaded together in one process, as two
copies of the package, and their collections are mixed: `equals` both ways, `addAll`, the
`copyOf…` factories, collections as map keys and the `is…` guards, at scale. The results must be
those of a single copy.

**Frameworks.** Recipes for React, Vue, Svelte and plain change signals run in `test/frameworks/`
on every change, and against the real framework packages every night.

**Browsers and bundlers.** On every change, the built package runs in Chromium, Firefox and WebKit
through Playwright: a smoke check builds, reads, iterates and writes as JSON every collection
class and constructs every error class, once from an ES module bundle and once from the
script-tag build through `window.JCF`; and eight contract suites (list on `ArrayList`, set on
`HashSet`, map on `HashMap`, sequenced map on `LinkedHashMap`, sorted set on `TreeSet`, sorted map
on `TreeMap`, deque on `ArrayDeque` and queue on `PriorityQueue`) run against the built package. A
production build with webpack 5, Rspack, Vite (client and server rendering), esbuild, Rollup and
Next.js runs its output in Node.js or in a browser, and a bundle of a single import must contain
only the internal structures that import needs.

**Runtimes.** The full suite runs on several Node.js versions and operating systems on every
change, and the built package is loaded on older Node.js, Bun and Deno. See
[compatibility](compatibility.md) for the exact matrix.

**Documentation examples.** Every `ts` and `js` code block in the README and these pages
type-checks and runs on every change, and each result a comment states is checked; see
[contributing](../CONTRIBUTING.md#code-examples-in-the-docs).

## Worst-case inputs

**Colliding hashes.** Hash sets and maps with an `equivalence` whose `hash` is the same for every
value, and with `valueEquivalence` over values whose `[hashCodeSymbol]` is the same, must still give
the reference results, with no lookup calling `equals` more often than the collection's size. Hash
values crafted to fall into one bucket under a known bucket seed must make the table re-seed, at
most once per growth, and leave no long chain; with a seed that never changes, the table must
still finish and give the reference results. The crafted cases run against the source only.

**Input shapes.** Sorting, building a priority queue or a tree, and every exported algorithm run
on sorted, reversed, all-equal, organ-pipe, sawtooth and many-duplicates input. Each result is
compared with the reference (a stable order for the stable sort; a priority queue by the order it
polls, with equal elements compared as a multiset), and each call is counted against the bound its
documentation states: comparator calls, `equals`, `hash` and `has` calls, `random` calls, or the
element reads and writes of an `asList` over a counting `Proxy`.

**Broken comparators.** Comparators that answer at random, that are not transitive, or that change
their answer between calls must never hang a sort, tree, heap or search, or overflow the stack. A
tree's size changes by at most one per call, by exactly one for a `delete` that returns `true`,
and always equals the number of elements it iterates; a sort and a heap keep a permutation of
their input. Comparators that throw, or return `NaN` or a value that is not a number, make the
operation throw (the comparator's own error, or a `TypeError` naming the method) and leave the
collection as it was; `addAll` keeps the elements added before the failing one, and a constructor
returns nothing.

**Deep views.** Sub-lists nested deep, alternating with reversed views, are read, iterated and
changed through the innermost view against an array. Unmodifiable-view functions applied in turn
never nest, and sub-list, range and reversed views taken deep through them read, iterate and refuse
every change without a `RangeError`.

**Every documented bound.** A table in `test/support/complexity.ts` lists every member the package
exports, with its whole `Time:` paragraph, the input that is worst for it, and the counter that
checks it. A test reads the documentation with the TypeScript compiler and fails when the table
and the documentation differ in either direction. Counts that the documentation states exactly
(`min`, `max`, `sortedIndex`, `binarySearch`, `sort`, priority queue and tree construction, tree
and heap operations, `swap`) are checked on every change. Every other counted bound is measured
per call at two sizes, the larger ten times the smaller, and the ratio must stay within 1.5 for
O(1), 2 for O(log n), 12 for O(n) and 15 for O(n log n). A bound over several sizes is measured by
varying the main size with the others fixed: a sub-list search, for example, keeps its target at
the size in the counts table. The members whose bound no counter checks are listed below, with the
reason; among them are the members that call no user code, whose work no counter can see.

<!-- unchecked:start -->
- **No user code is called, so there is nothing to count.**
  - `ArrayDeque`: `[ARRAY_DEQUE_BRAND]`, `[COLLECTION_BRAND]`, `[DEQUE_BRAND]`, `[QUEUE_BRAND]`, `[SEQUENCED_COLLECTION_BRAND]`, `[Symbol.toStringTag]`, `[hashCodeSymbol]`, `clear`, `constructor`, `delete`, `getFirst`, `getLast`, `has`, `isEmpty`, `peek`, `peekLast`, `poll`, `pop`, `removeAll`, `removeFirst`, `removeLast`, `retainAll`, `revision`, `size`, `static from`
  - `ArrayList`: `[ARRAY_LIST_BRAND]`, `[COLLECTION_BRAND]`, `[LIST_BRAND]`, `[SEQUENCED_COLLECTION_BRAND]`, `[Symbol.toStringTag]`, `addFirst`, `clear`, `constructor`, `delete`, `get`, `getFirst`, `getLast`, `has`, `indexOf`, `insert`, `insertAll`, `isEmpty`, `lastIndexOf`, `removeAll`, `removeAt`, `removeFirst`, `removeLast`, `retainAll`, `revision`, `set`, `size`, `static from`
  - `ClassCastError`: `[CLASS_CAST_ERROR_BRAND]`, `constructor`
  - `ConcurrentModificationError`: `[CONCURRENT_MODIFICATION_ERROR_BRAND]`, `constructor`
  - `HashMap`: `[HASH_MAP_BRAND]`, `[MAP_COLLECTION_BRAND]`, `[Symbol.toStringTag]`, `containsValue`, `isEmpty`, `revision`, `size`
  - `HashSet`: `[COLLECTION_BRAND]`, `[HASH_SET_BRAND]`, `[SET_COLLECTION_BRAND]`, `[Symbol.toStringTag]`, `isEmpty`, `revision`, `size`
  - `IllegalArgumentError`: `[ILLEGAL_ARGUMENT_ERROR_BRAND]`, `constructor`
  - `IllegalStateError`: `[ILLEGAL_STATE_ERROR_BRAND]`, `constructor`
  - `IndexOutOfBoundsError`: `[INDEX_OUT_OF_BOUNDS_ERROR_BRAND]`, `constructor`
  - `LinkedHashMap`: `[LINKED_HASH_MAP_BRAND]`, `[MAP_COLLECTION_BRAND]`, `[SEQUENCED_MAP_BRAND]`, `[Symbol.toStringTag]`, `containsValue`, `firstEntry`, `isEmpty`, `lastEntry`, `pollFirstEntry`, `pollLastEntry`, `revision`, `size`
  - `LinkedHashSet`: `[COLLECTION_BRAND]`, `[LINKED_HASH_SET_BRAND]`, `[SEQUENCED_COLLECTION_BRAND]`, `[SET_COLLECTION_BRAND]`, `[Symbol.toStringTag]`, `getFirst`, `getLast`, `isEmpty`, `removeFirst`, `removeLast`, `revision`, `size`
  - `LinkedList`: `[COLLECTION_BRAND]`, `[DEQUE_BRAND]`, `[LINKED_LIST_BRAND]`, `[QUEUE_BRAND]`, `[SEQUENCED_COLLECTION_BRAND]`, `[Symbol.toStringTag]`, `[hashCodeSymbol]`, `add`, `addAll`, `addFirst`, `addFirstNode`, `addLast`, `addLastNode`, `clear`, `constructor`, `delete`, `firstNode`, `getFirst`, `getLast`, `has`, `insertAfter`, `insertBefore`, `isEmpty`, `lastNode`, `peek`, `peekLast`, `poll`, `pop`, `push`, `removeAll`, `removeFirst`, `removeLast`, `removeNode`, `retainAll`, `revision`, `size`, `static from`
  - `NoSuchElementError`: `[NO_SUCH_ELEMENT_ERROR_BRAND]`, `constructor`
  - `NullElementError`: `[NULL_ELEMENT_ERROR_BRAND]`, `constructor`
  - `PriorityQueue`: `[COLLECTION_BRAND]`, `[PRIORITY_QUEUE_BRAND]`, `[QUEUE_BRAND]`, `[Symbol.toStringTag]`, `[hashCodeSymbol]`, `clear`, `comparator`, `has`, `isEmpty`, `peek`, `revision`, `size`
  - `TreeMap`: `[MAP_COLLECTION_BRAND]`, `[SEQUENCED_MAP_BRAND]`, `[SORTED_MAP_BRAND]`, `[Symbol.toStringTag]`, `[TREE_MAP_BRAND]`, `clear`, `comparator`, `containsValue`, `firstEntry`, `isEmpty`, `lastEntry`, `pollFirstEntry`, `pollLastEntry`, `putFirst`, `putLast`, `revision`, `size`
  - `TreeSet`: `[COLLECTION_BRAND]`, `[SEQUENCED_COLLECTION_BRAND]`, `[SET_COLLECTION_BRAND]`, `[SORTED_SET_BRAND]`, `[Symbol.toStringTag]`, `[TREE_SET_BRAND]`, `addFirst`, `addLast`, `clear`, `comparator`, `getFirst`, `getLast`, `isEmpty`, `pollFirst`, `pollLast`, `removeFirst`, `removeLast`, `revision`, `size`
  - `UnsupportedOperationError`: `[UNSUPPORTED_OPERATION_ERROR_BRAND]`, `constructor`
  - Functions and constants: `compareSymbol`, `equalsSymbol`, `hashCodeSymbol`
- **Native storage (the engine's `Map` or `Set`) holds the elements.**
  - `HashMap`: `clear`
  - `HashSet`: `clear`
  - `LinkedHashMap`: `clear`
  - `LinkedHashSet`: `clear`
  - Functions and constants: `mapOf`, `setOf`
- **Amortised growth with no counter.**
  - `ArrayDeque`: `add`, `addAll`, `addFirst`, `addLast`, `push`
  - `ArrayList`: `add`, `addAll`, `addLast`
- **Views, iteration and output.**
  - `ArrayDeque`: `[Symbol.iterator]`, `copy`, `cursor`, `reversed`, `toArray`, `toJSON`, `toString`
  - `ArrayList`: `[Symbol.iterator]`, `copy`, `cursor`, `listCursor`, `reversed`, `subList`, `toArray`, `toJSON`, `toString`
  - `HashMap`: `[Symbol.iterator]`, `copy`, `entries`, `entrySet`, `keySet`, `keys`, `toJSON`, `toString`, `valueCollection`, `values`
  - `HashSet`: `[Symbol.iterator]`, `copy`, `cursor`, `entries`, `keys`, `toArray`, `toJSON`, `toString`, `values`
  - `LinkedHashMap`: `[Symbol.iterator]`, `copy`, `entries`, `entrySet`, `keySet`, `keys`, `reversed`, `toJSON`, `toString`, `valueCollection`, `values`
  - `LinkedHashSet`: `[Symbol.iterator]`, `copy`, `cursor`, `entries`, `keys`, `reversed`, `toArray`, `toJSON`, `toString`, `values`
  - `LinkedList`: `[Symbol.iterator]`, `copy`, `cursor`, `reversed`, `toArray`, `toJSON`, `toString`
  - `PriorityQueue`: `[Symbol.iterator]`, `copy`, `cursor`, `toArray`, `toJSON`, `toString`
  - `TreeMap`: `[Symbol.iterator]`, `copy`, `entries`, `entrySet`, `headMap`, `keySet`, `keys`, `reversed`, `subMap`, `tailMap`, `toJSON`, `toString`, `valueCollection`, `values`
  - `TreeSet`: `[Symbol.iterator]`, `copy`, `cursor`, `entries`, `headSet`, `keys`, `reversed`, `subSet`, `tailSet`, `toArray`, `toJSON`, `toString`, `values`
  - Functions and constants: `asList`, `copyOfList`, `listOf`, `newSetFromMap`, `unmodifiableCollection`, `unmodifiableList`, `unmodifiableMap`, `unmodifiableSequencedCollection`, `unmodifiableSequencedMap`, `unmodifiableSequencedSet`, `unmodifiableSet`, `unmodifiableSortedMap`, `unmodifiableSortedSet`
- **The bound is another member's.**
  - `ArrayDeque`: `[INSPECT]`
  - `ArrayList`: `[INSPECT]`, `[equalsSymbol]`
  - `HashMap`: `[INSPECT]`, `[equalsSymbol]`, `compute`, `computeIfPresent`, `delete`, `getOrDefault`, `getOrInsert`, `getOrInsertComputed`, `has`, `merge`, `put`, `remove`, `replace`
  - `HashSet`: `[INSPECT]`, `[equalsSymbol]`
  - `LinkedHashMap`: `[INSPECT]`, `[equalsSymbol]`, `compute`, `computeIfPresent`, `delete`, `getOrDefault`, `getOrInsert`, `getOrInsertComputed`, `has`, `merge`, `put`, `putFirst`, `putLast`, `remove`, `replace`
  - `LinkedHashSet`: `[INSPECT]`, `[equalsSymbol]`
  - `LinkedList`: `[INSPECT]`
  - `PriorityQueue`: `[INSPECT]`
  - `TreeMap`: `[INSPECT]`, `[equalsSymbol]`, `compute`, `computeIfPresent`, `delete`, `getOrDefault`, `getOrInsert`, `getOrInsertComputed`, `has`, `merge`, `put`, `remove`, `replace`
  - `TreeSet`: `[INSPECT]`, `[equalsSymbol]`
  - Functions and constants: `valueEquivalence`
- **A walk whose only user code is the function given to it.**
  - `ArrayDeque`: `forEach`, `removeIf`
  - `ArrayList`: `[hashCodeSymbol]`, `forEach`, `removeIf`, `replaceAll`
  - `HashMap`: `[hashCodeSymbol]`, `forEach`, `replaceAll`
  - `HashSet`: `[hashCodeSymbol]`, `forEach`, `removeIf`
  - `LinkedHashMap`: `[hashCodeSymbol]`, `forEach`, `replaceAll`
  - `LinkedHashSet`: `[hashCodeSymbol]`, `forEach`, `removeIf`
  - `LinkedList`: `forEach`, `removeIf`
  - `PriorityQueue`: `forEach`
  - `TreeMap`: `[hashCodeSymbol]`, `forEach`, `replaceAll`
  - `TreeSet`: `[hashCodeSymbol]`, `forEach`, `removeIf`
- **Equality with another collection, whose lookups are its own bound.**
  - `ArrayDeque`: `[equalsSymbol]`, `equals`
  - `ArrayList`: `equals`
  - `HashMap`: `equals`
  - `HashSet`: `equals`
  - `LinkedHashMap`: `equals`
  - `LinkedHashSet`: `equals`
  - `LinkedList`: `[equalsSymbol]`, `equals`
  - `PriorityQueue`: `[equalsSymbol]`, `equals`
  - `TreeMap`: `equals`
  - `TreeSet`: `equals`
- **A cost per value or per comparison, independent of any collection size.**
  - `ArrayDeque`: `static [Symbol.hasInstance]`
  - `ArrayList`: `static [Symbol.hasInstance]`
  - `ClassCastError`: `static [Symbol.hasInstance]`
  - `ConcurrentModificationError`: `static [Symbol.hasInstance]`
  - `HashMap`: `static [Symbol.hasInstance]`
  - `HashSet`: `static [Symbol.hasInstance]`
  - `IllegalArgumentError`: `static [Symbol.hasInstance]`
  - `IllegalStateError`: `static [Symbol.hasInstance]`
  - `IndexOutOfBoundsError`: `static [Symbol.hasInstance]`
  - `LinkedHashMap`: `static [Symbol.hasInstance]`
  - `LinkedHashSet`: `static [Symbol.hasInstance]`
  - `LinkedList`: `static [Symbol.hasInstance]`
  - `NoSuchElementError`: `static [Symbol.hasInstance]`
  - `NullElementError`: `static [Symbol.hasInstance]`
  - `PriorityQueue`: `static [Symbol.hasInstance]`
  - `TreeMap`: `static [Symbol.hasInstance]`
  - `TreeSet`: `static [Symbol.hasInstance]`
  - `UnsupportedOperationError`: `static [Symbol.hasInstance]`
  - Functions and constants: `comparing`, `equals`, `hashCode`, `isCollection`, `isDeque`, `isList`, `isMapCollection`, `isQueue`, `isSequencedCollection`, `isSetCollection`, `isSortedMap`, `isSortedSet`, `naturalOrder`, `nullsFirst`, `nullsLast`, `reverseOrder`, `sameValueZeroEquivalence`, `thenComparing`
<!-- unchecked:end -->

## Realistic workloads

Each workload in `test/scenarios/` runs on seeded data shaped like real use and is compared with a
plain reference. `pnpm test` runs every workload at small sizes; the stress suites run them at full
size against the source and both builds.

**Word counting.** A multilingual text (Latin, Cyrillic and CJK letters, emoji outside the Basic
Multilingual Plane, combining marks) is split on spaces and counted with a `HashMap` and a
`TreeMap`. The counts, the insertion order, the sorted order (by code unit, as
`Array.prototype.sort` without a comparator), `min`, `max`, `frequency` and `sortedIndex` must match
a native `Map`. No case folding or normalisation is applied, so a precomposed and a decomposed form
are different words.

**A least-recently-used cache.** A `LinkedHashMap` with `accessOrder` and `maxSize` replays an
access trace in which a few keys are far more frequent than the rest. The hits, the misses and the
keys `onEvict` reports must match a reference cache after every call, and `has` must never change
which key goes next.

**An event log.** Events with shared timestamps are grouped through `getOrInsertComputed` in two
`TreeMap`s, one keyed by milliseconds and one by `Date`. Range views with every combination of
bounds, and the nearest-match queries, must match a sorted array; equal dates are one key, the
first `Date` object kept.

**A scheduler.** A `PriorityQueue` ordered by time and then by sequence number dispatches events
with ties while events are re-scheduled, in the order of a sorted reference.

**Records with their own equality.** Records implementing `equalsSymbol` and `hashCodeSymbol`, with
nested lists and maps, are de-duplicated in a `HashSet` with `valueEquivalence`, grouped in a
`HashMap`, written with `JSON.stringify`, revived and rebuilt with `from`. The result must equal the
original and a reference keyed by each record's canonical JSON.

**Windows, searching and shuffling.** A sliding window over a stream is kept in an `ArrayDeque` and
in a `LinkedList` through node handles. A large sorted array with duplicates is searched through
`asList` with `binarySearch` and `sortedIndex`, then rotated and reversed. `shuffle` must give a
permutation, call `random` once per element after the first, and repeat its order for the same
seed, through `asList` and on an `ArrayList`.

All data comes from seeded generators in `test/support/data/`. The access trace is drawn with
integer weights and no locale data is used, so every engine sees the same data.

## Unusual and hostile values

One table in `test/support/hostile-values.ts` lists unusual values and the result every collection
must give for each: `NaN`, `-0`, `null`, `undefined`, symbols, bigints, functions, a very long
string, lone surrogates, frozen and sealed objects, an object without a prototype, a `Proxy` and a
revoked `Proxy`, strings named after built-in properties (`'__proto__'`, `'constructor'`,
`'prototype'`, `'hasOwnProperty'`), objects whose protocol keys, `toString`, `Symbol.toPrimitive` or
`toJSON` are getters that throw, and objects whose `equalsSymbol` or `hashCodeSymbol` throws or
returns a bad value.

**Families.** Every exported class and factory, and every collection a member returns, belongs to
one family by how it treats values: lists, linked lists, array deques, priority queues in natural
order or with a comparator, hash sets and maps by default, with `key` or with an equivalence, and
sorted sets and maps in natural order or with a comparator. Immutable collections and unmodifiable
views follow their source and refuse every change. A test reads the package's exports with the
TypeScript compiler and fails when one has no family.

**The table.** Each value goes into every member of its family as an element or key and as a map
value, alone and next to numbers and next to strings. Whether it is accepted or which error is
thrown, what `has` answers for it and for every other value, its printed and JSON forms, `equals`
and `hashCode` must all match the table, and `valueOf` is never called.

**Bad input and callbacks.** Map constructors, `from`, `putAll`, `mapOf` and `copyOfMap` must
reject items that are not pairs, and all but `mapOf` input that is not iterable, with a `TypeError`
naming the call, and `putAll` must leave the map and its `revision` unchanged. Keys named after
built-in properties are read from `JSON.parse` and written back. Options inherited from a
prototype are read. Every kind of user callback is made to throw, and to change the collection
while it runs; the error, what stays and the contents afterwards are checked against a reference.

## Long-running use

These checks read the collections' internal storage, so they run against the source only.

**Growing and draining.** Every class is filled to a large size and drained to empty many times
over, each time by another route: `delete`, `removeAt`, `poll`, `pop`, `clear`, cursor removal,
`removeIf`, the first-element removals, and eviction from a `LinkedHashMap` with `maxSize`. The
contents are compared with the reference after each growth, and after each drain a walk of
everything the collection object can reach (arrays, nodes, records, bucket chains and the queue of
pending evictions) must find none of the removed elements.

**Many small collections.** Many collections of every class are created, filled to a small size,
partly drained and dropped, and the storage each keeps is checked to stay in proportion to its
size.

**Deque storage.** An `ArrayDeque` is checked to keep storage in proportion to the largest size it
held since it was last cleared, and to release it on `clear()`, also when it is already empty.

## Per collection

Every class runs the reference comparisons, the scale suites, the deep random runs, the
built-package runs, the hostile-value table and the grow-and-drain cycles, and every class that is
not a map runs the collection suite. The table lists the further contract suites and checks for
each class.

| Class           | Further contract suites                   | Also checked by                                                        | Realistic workload              |
| --------------- | ----------------------------------------- | ---------------------------------------------------------------------- | ------------------------------- |
| `ArrayList`     | list, sequenced                           | deep sub-list and reversed views; sorting worst cases                  | shuffling; nested record values |
| `LinkedList`    | deque, queue, sequenced                   | —                                                                      | sliding window (node handles)   |
| `ArrayDeque`    | deque, queue, sequenced                   | deque storage                                                          | sliding window                  |
| `PriorityQueue` | queue                                     | construction and removal worst cases                                   | scheduler                       |
| `HashSet`       | set                                       | hash flooding; colliding hashes                                        | records                         |
| `HashMap`       | map                                       | hash flooding; colliding hashes                                        | records; word counting          |
| `LinkedHashSet` | set, sequenced set, sequenced             | hash flooding; colliding hashes                                        | none yet                        |
| `LinkedHashMap` | map, sequenced map                        | hash flooding; colliding hashes; eviction in the deep runs             | least-recently-used cache       |
| `TreeSet`       | set, sequenced set, sorted set, sequenced | comparison bounds at scale; construction worst cases; deep range views | none yet                        |
| `TreeMap`       | map, sequenced map, sorted map            | comparison bounds at scale; construction worst cases; deep range views | word counting; event log        |

| Area                                                  | Checked by                                                                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Algorithms (`binarySearch`, `sortedIndex`, `min`, …)  | exact call counts at small sizes; every input shape in the worst-case suites; searching and shuffling workloads                                  |
| `asList`, `newSetFromMap`                             | the list and set contract suites; the scale suites; the deep random runs; searching, shuffling and word-counting workloads                       |
| Unmodifiable views                                    | the read-only contract suites; repeated wraps that stay one level deep; deep sub-list, range and reversed views of them; the hostile-value table |
| Immutable collections                                 | the read-only contract suites; the hostile-value table (every change refused)                                                                    |
| Exported comparators (`naturalOrder`, `comparing`, …) | their own suite                                                                                                                                  |
| Comparators given by the user                         | inconsistent, throwing and non-number comparators in the worst-case suites                                                                       |
| `equals` and `hashCode`                               | nested collections, cycles and nesting deeper than the call stack                                                                                |

## Counts

<!-- counts:start -->
| What                                                                     |             Count |
| ------------------------------------------------------------------------ | ----------------: |
| Elements in each scale, view and output test                             |         1,000,000 |
| Lookups, end removals and near-end cursor removals per class (scale)     |            10,000 |
| Lookups per class where one lookup walks the collection (scale)          |               100 |
| Nesting depth that prints, writes JSON, compares and hashes              |               400 |
| Nesting depth that throws `RangeError`                                   |           100,000 |
| Deep random runs (model, collection and options)                         |                44 |
| Seeds × steps per deep random run                                        |      20 × 100,000 |
| Steps between full-contents comparisons (deep runs)                      |             1,000 |
| Iterators and cursors held open at once (deep runs)                      |                 8 |
| Seeds × steps per run in the fast subset                                 |         2 × 2,000 |
| Elements per collection with both builds loaded                          |           100,000 |
| Elements in each worst-case input shape                                  |           100,000 |
| Distinct values whose hashes all collide                                 |             2,000 |
| Elements in the target of a sub-list search (worst case)                 |               100 |
| Sizes at which the growth of each bound is counted                       |  1,000 and 10,000 |
| Operations per inconsistent comparator                                   |             2,000 |
| Depth of each chain of nested views                                      |            10,000 |
| Unmodifiable-view functions applied in turn                              |            10,000 |
| Grow-and-drain cycles per class (long-running)                           |                20 |
| Size each cycle grows to (long-running)                                  |           100,000 |
| Small collections created per class (long-running)                       |           100,000 |
| Largest size of a small collection                                       |                10 |
| Storage limit checked for each small collection (array slots)            |                16 |
| Values in the hash-flooding check                                        |           100,000 |
| Of those, values crafted to share one bucket                             |             2,000 |
| Buckets the crafted values are aimed at                                  |             4,096 |
| Longest bucket chain allowed after flooding                              |                16 |
| Seeds per realistic workload (unit tests / stress)                       |             3 / 3 |
| Words in the multilingual text (unit tests / stress)                     | 2,000 / 1,000,000 |
| Calls in the cache access trace (unit tests / stress)                    |   2,000 / 100,000 |
| Cache size (unit tests / stress)                                         |          32 / 100 |
| Events in the event log and the scheduler (unit tests / stress)          |     500 / 100,000 |
| Records with their own equality (unit tests / stress)                    |      300 / 20,000 |
| Values in the sliding-window stream (unit tests / stress)                |   1,000 / 100,000 |
| Values in each sliding window (unit tests / stress)                      |           24 / 64 |
| Elements in the sorted array searched and shuffled (unit tests / stress) |   1,000 / 100,000 |
| Code units in the very long string (hostile values)                      |         1,048,576 |
| Companions of each kind next to a hostile value                          |                 2 |
| Bytes allowed in checked-in test data                                    |            65,536 |
| Nightly stress job timeout                                               |        60 minutes |
<!-- counts:end -->

## Running the tests

```sh
pnpm test             # every suite on the source, including a fast subset of every deep random run
pnpm test:coverage    # the same, with coverage thresholds
pnpm build            # the stress suites need the built package
pnpm test:stress      # scale, deep random runs, worst cases, workloads and two copies, on the source and both builds
```

The stress suites run as four projects: `src`, `esm`, `cjs` and `copies`. To run one project, one
run, or one seed of one run:

```sh
pnpm test:stress --project src
pnpm test:stress --project esm -t "deep random runs set/hash-set/equivalence "
pnpm test:stress --project src -t "deep random runs set/hash-set/equivalence seed 3:"
```

The run names are listed in `RUNS` in `test/stress/config.ts`.

## Replaying a failure

A failing seeded run names its seed, its step, the operation that diverged and both results. A
failing deep random run also prints the command that replays that seed against the source, with
the hash and bucket seeds fixed from the run's seed, for example:

```text
Replay this seed against the source: pnpm test:stress --project src -t "deep random runs set/hash-set seed 3:"
```

Runs against the built package use the package's own random seeds; their results do not depend on
them. Every seed that has ever found a bug is kept in `test/stress/regressions.ts`, and `pnpm test`
replays each one.

## What is not tested

- **Leaks that only garbage collection would show.** Such checks depend on when the engine
  collects, so they cannot be deterministic.
- **Speed.** No test measures time, and the documentation makes no speed claims; the stated time
  complexities are bounds on work, not timings.
- **Engines and runtimes outside CI.** Safari itself, browsers older than the current ones, React
  Native, edge runtimes and the other targeted environments in [compatibility](compatibility.md)
  are checked for syntax and platform APIs, not run.

## Nightly runs

The stress suites and the framework apps run every night in the
[nightly workflow](../.github/workflows/nightly.yml).

# Performance

This page lists what each export adds to a bundle and the size budget it is held to.

## Bundle size

Each runtime export is bundled alone
(`export { ArrayList } from 'javascript-collections-framework'`), and the whole package once
(`export * from`), as ES2015 ES modules, tree-shaken and minified. The table gives the minified
bytes and the gzipped bytes (gzip level 9). Importing several exports costs less than the sum of
their rows, because they share internal code: the hash table under `HashMap` and `HashSet`, the
tree under `TreeMap` and `TreeSet`, and the core every collection uses.

The sizes come from the size report committed with the source, and every change is checked
against it, so a change that makes a bundle larger shows the difference in its own pull request.

### Budgets

Every row has a budget: the largest gzipped size it may reach. A budget is set to the gzipped size
when it was set, plus 10 %, rounded up to the next multiple of 64 bytes. A change that takes a row
over its budget fails the checks until the budget is raised on purpose; a raised budget, and the
reason for it, is named in the release notes of the change.

<!-- sizes:start -->
| Export                            | Minified (bytes) | Gzipped (bytes) | Budget, gzipped (bytes) |
| --------------------------------- | ---------------: | --------------: | ----------------------: |
| Whole package                     |           155037 |           33698 |                   37120 |
| `ArrayDeque`                      |            16895 |            5038 |                    5568 |
| `ArrayList`                       |            23281 |            6744 |                    7424 |
| `ClassCastError`                  |              663 |             400 |                     448 |
| `ConcurrentModificationError`     |              698 |             408 |                     512 |
| `HashMap`                         |            30312 |            8453 |                    9344 |
| `HashSet`                         |            20791 |            6446 |                    7104 |
| `IllegalArgumentError`            |              682 |             408 |                     512 |
| `IllegalStateError`               |              668 |             399 |                     448 |
| `IndexOutOfBoundsError`           |              685 |             410 |                     512 |
| `LinkedHashMap`                   |            40371 |           10810 |                   11904 |
| `LinkedHashSet`                   |            24904 |            7619 |                    8384 |
| `LinkedList`                      |            17929 |            5273 |                    5824 |
| `NoSuchElementError`              |              671 |             402 |                     448 |
| `NullElementError`                |              669 |             401 |                     448 |
| `PriorityQueue`                   |            17408 |            5397 |                    5952 |
| `TreeMap`                         |            47335 |           12031 |                   13248 |
| `TreeSet`                         |            30921 |            8609 |                    9472 |
| `UnsupportedOperationError`       |              696 |             409 |                     512 |
| `asList`                          |            22365 |            6631 |                    7296 |
| `binarySearch`                    |             3917 |            1482 |                    1664 |
| `compareSymbol`                   |               90 |             101 |                     128 |
| `comparing`                       |             2985 |            1206 |                    1344 |
| `copyOfList`                      |            27351 |            7619 |                    8384 |
| `copyOfMap`                       |            37031 |            9696 |                   10688 |
| `copyOfSet`                       |            23441 |            7077 |                    7808 |
| `disjoint`                        |              984 |             541 |                     640 |
| `equals`                          |             1020 |             547 |                     640 |
| `equalsSymbol`                    |               88 |             100 |                     128 |
| `fill`                            |              841 |             500 |                     576 |
| `frequency`                       |              799 |             458 |                     512 |
| `hashCode`                        |             2566 |            1194 |                    1344 |
| `hashCodeSymbol`                  |               92 |             102 |                     128 |
| `indexOfSubList`                  |             1067 |             590 |                     704 |
| `isCollection`                    |              209 |             169 |                     192 |
| `isDeque`                         |              199 |             169 |                     192 |
| `isList`                          |              197 |             168 |                     192 |
| `isMapCollection`                 |              215 |             172 |                     192 |
| `isQueue`                         |              199 |             168 |                     192 |
| `isSequencedCollection`           |              227 |             176 |                     256 |
| `isSetCollection`                 |              215 |             171 |                     192 |
| `isSortedMap`                     |              207 |             171 |                     192 |
| `isSortedSet`                     |              207 |             169 |                     192 |
| `lastIndexOfSubList`              |             1071 |             591 |                     704 |
| `listOf`                          |            27201 |            7571 |                    8384 |
| `mapOf`                           |            36757 |            9612 |                   10624 |
| `max`                             |             3326 |            1294 |                    1472 |
| `min`                             |             3327 |            1294 |                    1472 |
| `naturalOrder`                    |             2813 |            1145 |                    1280 |
| `newSetFromMap`                   |             9986 |            3588 |                    3968 |
| `nullsFirst`                      |             3037 |            1221 |                    1344 |
| `nullsLast`                       |             3034 |            1220 |                    1344 |
| `reverse`                         |              909 |             531 |                     640 |
| `reverseOrder`                    |             2964 |            1198 |                    1344 |
| `rotate`                          |             1710 |             869 |                     960 |
| `sameValueZeroEquivalence`        |             1471 |             809 |                     896 |
| `setOf`                           |            23127 |            6986 |                    7744 |
| `shuffle`                         |             2152 |             982 |                    1088 |
| `sortedIndex`                     |             3870 |            1462 |                    1664 |
| `swap`                            |             1686 |             862 |                     960 |
| `thenComparing`                   |              293 |             212 |                     256 |
| `unmodifiableCollection`          |            10097 |            3624 |                    4032 |
| `unmodifiableList`                |            21621 |            6307 |                    6976 |
| `unmodifiableMap`                 |            16736 |            5008 |                    5568 |
| `unmodifiableSequencedCollection` |            11128 |            3803 |                    4224 |
| `unmodifiableSequencedMap`        |            19238 |            5363 |                    5952 |
| `unmodifiableSequencedSet`        |            12488 |            4190 |                    4672 |
| `unmodifiableSet`                 |            11462 |            4011 |                    4416 |
| `unmodifiableSortedMap`           |            20715 |            5618 |                    6208 |
| `unmodifiableSortedSet`           |            13214 |            4336 |                    4800 |
| `valueEquivalence`                |             2998 |            1335 |                    1472 |
<!-- sizes:end -->

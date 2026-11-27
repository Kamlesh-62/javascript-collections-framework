# Performance

This page lists what each export adds to a bundle and the size budget it is held to, and how
fast each collection runs next to the native structure closest to it.

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
| Whole package                     |           177507 |           39448 |                   39616 |
| `ArrayDeque`                      |            17896 |            5259 |                    5568 |
| `ArrayList`                       |            23582 |            6833 |                    7424 |
| `ClassCastError`                  |              663 |             400 |                     448 |
| `ConcurrentModificationError`     |              698 |             408 |                     512 |
| `HashMap`                         |            32485 |            8986 |                    9344 |
| `HashSet`                         |            21314 |            6592 |                    7104 |
| `IllegalArgumentError`            |              682 |             408 |                     512 |
| `IllegalStateError`               |              668 |             399 |                     448 |
| `IndexOutOfBoundsError`           |              685 |             410 |                     512 |
| `LinkedHashMap`                   |            51914 |           13686 |                   13696 |
| `LinkedHashSet`                   |            29870 |            8918 |                    9408 |
| `LinkedList`                      |            18607 |            5427 |                    5824 |
| `NoSuchElementError`              |              671 |             402 |                     448 |
| `NullElementError`                |              669 |             401 |                     448 |
| `PriorityQueue`                   |            19480 |            5964 |                    6528 |
| `TreeMap`                         |            49111 |           12500 |                   13248 |
| `TreeSet`                         |            32371 |            8971 |                    9472 |
| `UnsupportedOperationError`       |              696 |             409 |                     512 |
| `asList`                          |            22576 |            6696 |                    7296 |
| `binarySearch`                    |             4029 |            1507 |                    1664 |
| `compareSymbol`                   |               90 |             101 |                     128 |
| `comparing`                       |             3097 |            1230 |                    1344 |
| `copyOfList`                      |            27652 |            7711 |                    8384 |
| `copyOfMap`                       |            39205 |           10203 |                   10688 |
| `copyOfSet`                       |            23964 |            7218 |                    7808 |
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
| `listOf`                          |            27502 |            7664 |                    8384 |
| `mapOf`                           |            38931 |           10122 |                   10624 |
| `max`                             |             3438 |            1319 |                    1472 |
| `min`                             |             3439 |            1319 |                    1472 |
| `naturalOrder`                    |             2925 |            1169 |                    1280 |
| `newSetFromMap`                   |            10047 |            3610 |                    3968 |
| `nullsFirst`                      |             3149 |            1246 |                    1344 |
| `nullsLast`                       |             3146 |            1244 |                    1344 |
| `reverse`                         |              909 |             531 |                     640 |
| `reverseOrder`                    |             3076 |            1223 |                    1344 |
| `rotate`                          |             1710 |             869 |                     960 |
| `sameValueZeroEquivalence`        |             1471 |             809 |                     896 |
| `setOf`                           |            23649 |            7127 |                    7744 |
| `shuffle`                         |             2152 |             982 |                    1088 |
| `sortedIndex`                     |             3982 |            1487 |                    1664 |
| `swap`                            |             1760 |             889 |                     960 |
| `thenComparing`                   |              293 |             212 |                     256 |
| `unmodifiableCollection`          |            10158 |            3645 |                    4032 |
| `unmodifiableList`                |            21832 |            6381 |                    6976 |
| `unmodifiableMap`                 |            16797 |            5030 |                    5568 |
| `unmodifiableSequencedCollection` |            11189 |            3824 |                    4224 |
| `unmodifiableSequencedMap`        |            19299 |            5386 |                    5952 |
| `unmodifiableSequencedSet`        |            12549 |            4209 |                    4672 |
| `unmodifiableSet`                 |            11523 |            4031 |                    4416 |
| `unmodifiableSortedMap`           |            20776 |            5641 |                    6208 |
| `unmodifiableSortedSet`           |            13275 |            4358 |                    4800 |
| `valueEquivalence`                |             2998 |            1335 |                    1472 |
<!-- sizes:end -->

## Package size

The published package holds the ES module build (one file per module), the CommonJS build, the
script-tag build and the type declarations with their full documentation. It holds no source maps:
the ES module and CommonJS builds are readable as published. Its unpacked size, as
`npm pack --dry-run` reports it, has a budget set the same way as the bundle budgets, and every
change is checked against it.

## Benchmarks

Each collection is measured against the closest native structure on its main operations: `Array`
for lists and queues, `Map` and `Set` for hash maps and sets, and a sorted `Array` searched by
bisection for the navigation of `TreeMap` and `TreeSet`. Every case runs on the built package at
1,000, 100,000 and 1,000,000 elements, with input from a fixed seed, so a run can be repeated.
Native baselines that take time proportional to the size for each operation (`shift`, `unshift`,
`splice`) run up to 100,000 elements only.

Each figure is the median of five timed batches after a warm-up, in elements (building,
iterating) or operations (lookups, updates) per second; the ± figure is half the range of the five batches, as
a percentage of the median. A row whose spread is over 100 % shows "unstable" instead of a ratio:
its batches disagree too much to compare. The last
column divides the library's figure by the native one: below 1× the library is slower. Most rows
against `Map` and `Set` are below 1×, since each operation also checks its arguments and keeps
the collection's change count; the rows that use a sorted `Array` show what a balanced tree saves
on updates.

An exact lookup in `TreeMap` or `TreeSet` takes O(log n) comparisons, where `Map` and `Set` take
O(1) on average: the tree pays for keeping its keys sorted. Where only exact keys are looked up,
with no navigation (`floor`, `ceiling`, ranges) and no sorted order, `HashMap` or `HashSet` is
the better choice.

The figures are indicative: they vary with the machine, the runtime and its version. Compare the
rows of one run with each other, not with a run elsewhere. Run them with `pnpm build && pnpm bench`;
`pnpm bench:docs` writes the newest run below.

<!-- bench:start -->
Run on 2026-11-26 with Node.js v24.11.1 on darwin, Intel(R) Core(TM) i5-8600 CPU @ 3.10GHz (6 cores, 64 GB), version 0.1.1 of the package.

### ArrayDeque

| Operation                           |      Size | Native baseline       | Native per second | Library per second | Library ÷ native |
| ----------------------------------- | --------: | --------------------- | ----------------: | -----------------: | ---------------: |
| add at the end                      |     1,000 | Array push            |        280 M ±3 % |        99.4 M ±6 % |            0.35× |
| add at the end                      |   100,000 | Array push            |       62.8 M ±3 % |        53.7 M ±2 % |            0.86× |
| add at the end                      | 1,000,000 | Array push            |       46.8 M ±3 % |        37.5 M ±2 % |            0.80× |
| add at the front, take from the end |     1,000 | Array unshift and pop |       9.60 M ±5 % |        136 M ±18 % |              14× |
| add at the front, take from the end |   100,000 | Array unshift and pop |       53.9 k ±1 % |         125 M ±3 % |           2,327× |
| iterate                             |     1,000 | Array for…of          |       984 M ±23 % |        118 M ±33 % |            0.12× |
| iterate                             |   100,000 | Array for…of          |      88.5 M ±16 % |         146 M ±3 % |             1.7× |
| iterate                             | 1,000,000 | Array for…of          |       90.5 M ±1 % |        87.1 M ±4 % |            0.96× |
| take from the front, add at the end |     1,000 | Array shift and push  |       12.7 M ±1 % |       93.6 M ±22 % |             7.4× |
| take from the front, add at the end |   100,000 | Array shift and push  |       53.8 k ±1 % |        95.7 M ±0 % |           1,780× |

### ArrayList

| Operation              |      Size | Native baseline      | Native per second | Library per second | Library ÷ native |
| ---------------------- | --------: | -------------------- | ----------------: | -----------------: | ---------------: |
| add at the end         |     1,000 | Array push           |        269 M ±4 % |         223 M ±3 % |            0.83× |
| add at the end         |   100,000 | Array push           |       62.4 M ±2 % |        60.1 M ±1 % |            0.96× |
| add at the end         | 1,000,000 | Array push           |      48.1 M ±10 % |        31.7 M ±1 % |            0.66× |
| build from an array    |     1,000 | Array.from           |       2.31 G ±3 % |       2.14 G ±11 % |            0.93× |
| build from an array    |   100,000 | Array.from           |        232 M ±0 % |         235 M ±2 % |             1.0× |
| build from an array    | 1,000,000 | Array.from           |        221 M ±1 % |         215 M ±3 % |            0.98× |
| get by index           |     1,000 | Array index          |        756 M ±2 % |        369 M ±24 % |            0.49× |
| get by index           |   100,000 | Array index          |        522 M ±0 % |         264 M ±6 % |            0.51× |
| get by index           | 1,000,000 | Array index          |        395 M ±1 % |         235 M ±4 % |            0.59× |
| iterate                |     1,000 | Array for…of         |        986 M ±1 % |         172 M ±5 % |            0.17× |
| iterate                |   100,000 | Array for…of         |       90.9 M ±1 % |         204 M ±0 % |             2.2× |
| iterate                | 1,000,000 | Array for…of         |       90.9 M ±2 % |         132 M ±3 % |             1.5× |
| remove first, add last |     1,000 | Array shift and push |       12.9 M ±2 % |        1.94 M ±8 % |            0.15× |
| remove first, add last |   100,000 | Array shift and push |       53.8 k ±0 % |        22.3 k ±0 % |            0.41× |

### HashMap

| Operation                        |      Size | Native baseline    | Native per second | Library per second | Library ÷ native |
| -------------------------------- | --------: | ------------------ | ----------------: | -----------------: | ---------------: |
| build from entries               |     1,000 | new Map            |      24.9 M ±28 % |       18.6 M ±27 % |            0.75× |
| build from entries               |   100,000 | new Map            |      7.77 M ±10 % |        7.11 M ±9 % |            0.91× |
| build from entries               | 1,000,000 | new Map            |      6.79 M ±25 % |       3.38 M ±22 % |            0.50× |
| delete and set again             |     1,000 | Map delete and set |       22.6 M ±2 % |        19.5 M ±2 % |            0.86× |
| delete and set again             |   100,000 | Map delete and set |       972 k ±35 % |       921 k ±154 % |         unstable |
| delete and set again             | 1,000,000 | Map delete and set |      84.9 k ±82 % |       93.9 k ±89 % |             1.1× |
| get                              |     1,000 | Map get            |       85.8 M ±2 % |       75.2 M ±11 % |            0.88× |
| get                              |   100,000 | Map get            |      38.6 M ±14 % |        33.0 M ±1 % |            0.86× |
| get                              | 1,000,000 | Map get            |      28.1 M ±11 % |        22.7 M ±2 % |            0.81× |
| get by value with the key option |     1,000 | Map get by id      |       129 M ±15 % |       26.8 M ±31 % |            0.21× |
| get by value with the key option |   100,000 | Map get by id      |       41.3 M ±3 % |       13.1 M ±34 % |            0.32× |
| get by value with the key option | 1,000,000 | Map get by id      |       30.4 M ±2 % |        12.4 M ±9 % |            0.41× |
| has                              |     1,000 | Map has            |       99.6 M ±1 % |       70.0 M ±16 % |            0.70× |
| has                              |   100,000 | Map has            |       44.0 M ±0 % |        36.4 M ±1 % |            0.83× |
| has                              | 1,000,000 | Map has            |       31.8 M ±1 % |       25.2 M ±22 % |            0.79× |
| iterate                          |     1,000 | Map for…of         |        142 M ±1 % |         142 M ±3 % |             1.0× |
| iterate                          |   100,000 | Map for…of         |       109 M ±20 % |        103 M ±32 % |            0.94× |
| iterate                          | 1,000,000 | Map for…of         |        136 M ±4 % |        91.3 M ±9 % |            0.67× |
| set an existing key              |     1,000 | Map set            |       68.8 M ±1 % |        52.3 M ±1 % |            0.76× |
| set an existing key              |   100,000 | Map set            |       45.6 M ±1 % |        30.3 M ±5 % |            0.67× |
| set an existing key              | 1,000,000 | Map set            |       24.8 M ±1 % |        21.5 M ±1 % |            0.87× |
| set new keys one by one          |     1,000 | Map set            |       37.4 M ±2 % |        31.0 M ±3 % |            0.83× |
| set new keys one by one          |   100,000 | Map set            |       12.2 M ±2 % |        10.1 M ±4 % |            0.83× |
| set new keys one by one          | 1,000,000 | Map set            |       8.05 M ±7 % |       4.08 M ±35 % |            0.51× |

### HashSet

| Operation            |      Size | Native baseline    | Native per second | Library per second | Library ÷ native |
| -------------------- | --------: | ------------------ | ----------------: | -----------------: | ---------------: |
| add one by one       |     1,000 | Set add            |       40.0 M ±2 % |        32.3 M ±0 % |            0.81× |
| add one by one       |   100,000 | Set add            |      14.4 M ±16 % |        13.6 M ±4 % |            0.94× |
| add one by one       | 1,000,000 | Set add            |       9.73 M ±7 % |        6.50 M ±5 % |            0.67× |
| build from an array  |     1,000 | new Set            |       37.3 M ±1 % |        33.2 M ±1 % |            0.89× |
| build from an array  |   100,000 | new Set            |      10.1 M ±38 % |        11.4 M ±8 % |             1.1× |
| build from an array  | 1,000,000 | new Set            |      9.70 M ±32 % |        6.76 M ±5 % |            0.70× |
| delete and add again |     1,000 | Set delete and add |       24.4 M ±0 % |        20.1 M ±1 % |            0.83× |
| delete and add again |   100,000 | Set delete and add |       883 k ±68 % |       1.24 M ±24 % |             1.4× |
| delete and add again | 1,000,000 | Set delete and add |       121 k ±96 % |        106 k ±92 % |            0.87× |
| has                  |     1,000 | Set has            |        116 M ±1 % |        70.8 M ±0 % |            0.61× |
| has                  |   100,000 | Set has            |       45.6 M ±3 % |        37.2 M ±2 % |            0.82× |
| has                  | 1,000,000 | Set has            |       33.7 M ±1 % |        28.7 M ±4 % |            0.85× |
| iterate              |     1,000 | Set for…of         |        337 M ±5 % |        351 M ±10 % |             1.0× |
| iterate              |   100,000 | Set for…of         |      95.2 M ±38 % |        314 M ±21 % |             3.3× |
| iterate              | 1,000,000 | Set for…of         |        117 M ±3 % |        171 M ±18 % |             1.5× |

### LinkedHashMap

| Operation                                             |      Size | Native baseline                  | Native per second | Library per second | Library ÷ native |
| ----------------------------------------------------- | --------: | -------------------------------- | ----------------: | -----------------: | ---------------: |
| build from entries                                    |     1,000 | new Map                          |       28.9 M ±1 % |        22.0 M ±4 % |            0.76× |
| build from entries                                    |   100,000 | new Map                          |       10.8 M ±2 % |        8.49 M ±9 % |            0.79× |
| build from entries                                    | 1,000,000 | new Map                          |      6.70 M ±15 % |       4.20 M ±20 % |            0.63× |
| delete and set again                                  |     1,000 | Map delete and set               |       22.2 M ±0 % |        17.3 M ±2 % |            0.78× |
| delete and set again                                  |   100,000 | Map delete and set               |      1.44 M ±19 % |       1.44 M ±21 % |             1.0× |
| delete and set again                                  | 1,000,000 | Map delete and set               |      82.7 k ±92 % |       83.7 k ±58 % |             1.0× |
| get                                                   |     1,000 | Map get                          |       90.1 M ±1 % |        82.1 M ±1 % |            0.91× |
| get                                                   |   100,000 | Map get                          |       43.3 M ±1 % |        28.1 M ±0 % |            0.65× |
| get                                                   | 1,000,000 | Map get                          |       29.2 M ±3 % |        26.5 M ±3 % |            0.91× |
| get in access order (LRU)                             |     1,000 | Map get, delete and set          |       20.2 M ±4 % |       36.9 M ±14 % |             1.8× |
| get in access order (LRU)                             |   100,000 | Map get, delete and set          |      7.69 M ±15 % |        14.8 M ±5 % |             1.9× |
| get in access order (LRU)                             | 1,000,000 | Map get, delete and set          |       868 k ±91 % |       5.68 M ±21 % |             6.5× |
| get in access order with an equivalence               |     1,000 | Map get, delete and set by id    |      18.9 M ±18 % |        7.63 M ±2 % |            0.40× |
| get in access order with an equivalence               |   100,000 | Map get, delete and set by id    |      8.08 M ±12 % |        3.17 M ±4 % |            0.39× |
| get in access order with an equivalence               | 1,000,000 | Map get, delete and set by id    |      876 k ±110 % |        1.87 M ±9 % |         unstable |
| get in access order with the key option               |     1,000 | Map get, delete and set by id    |       19.6 M ±1 % |        16.5 M ±2 % |            0.85× |
| get in access order with the key option               |   100,000 | Map get, delete and set by id    |      7.63 M ±16 % |        9.10 M ±3 % |             1.2× |
| get in access order with the key option               | 1,000,000 | Map get, delete and set by id    |       869 k ±94 % |        3.93 M ±9 % |             4.5× |
| iterate                                               |     1,000 | Map for…of                       |        138 M ±3 % |         136 M ±1 % |            0.99× |
| iterate                                               |   100,000 | Map for…of                       |        137 M ±3 % |        99.1 M ±3 % |            0.73× |
| iterate                                               | 1,000,000 | Map for…of                       |        136 M ±3 % |        86.3 M ±8 % |            0.63× |
| set an existing key                                   |     1,000 | Map set                          |      68.6 M ±15 % |        51.0 M ±1 % |            0.74× |
| set an existing key                                   |   100,000 | Map set                          |       46.8 M ±2 % |        34.5 M ±1 % |            0.74× |
| set an existing key                                   | 1,000,000 | Map set                          |       24.1 M ±0 % |        22.0 M ±1 % |            0.91× |
| set new keys in access order with maxSize and onEvict |     1,000 | Map set and delete the first key |       28.2 M ±1 % |        8.78 M ±1 % |            0.31× |
| set new keys in access order with maxSize and onEvict |   100,000 | Map set and delete the first key |       10.2 M ±6 % |        5.21 M ±5 % |            0.51× |
| set new keys in access order with maxSize and onEvict | 1,000,000 | Map set and delete the first key |       5.87 M ±6 % |        2.75 M ±3 % |            0.47× |
| set new keys one by one                               |     1,000 | Map set                          |       37.8 M ±2 % |        31.3 M ±1 % |            0.83× |
| set new keys one by one                               |   100,000 | Map set                          |       12.4 M ±4 % |        11.5 M ±3 % |            0.92× |
| set new keys one by one                               | 1,000,000 | Map set                          |      6.88 M ±23 % |       5.18 M ±25 % |            0.75× |
| set new keys with maxSize                             |     1,000 | Map set and delete the first key |       27.8 M ±3 % |        20.3 M ±2 % |            0.73× |
| set new keys with maxSize                             |   100,000 | Map set and delete the first key |       9.84 M ±1 % |       8.25 M ±23 % |            0.84× |
| set new keys with maxSize                             | 1,000,000 | Map set and delete the first key |      5.75 M ±26 % |        3.94 M ±7 % |            0.69× |
| take the first entry                                  |     1,000 | Map keys().next() and delete     |       17.1 M ±1 % |        11.1 M ±1 % |            0.65× |
| take the first entry                                  |   100,000 | Map keys().next() and delete     |      8.29 M ±11 % |        5.18 M ±5 % |            0.62× |
| take the first entry                                  | 1,000,000 | Map keys().next() and delete     |      2.88 M ±37 % |       2.42 M ±19 % |            0.84× |

### LinkedHashSet

| Operation            |      Size | Native baseline                | Native per second | Library per second | Library ÷ native |
| -------------------- | --------: | ------------------------------ | ----------------: | -----------------: | ---------------: |
| add one by one       |     1,000 | Set add                        |       40.1 M ±2 % |        35.3 M ±1 % |            0.88× |
| add one by one       |   100,000 | Set add                        |       15.2 M ±3 % |        11.5 M ±7 % |            0.76× |
| add one by one       | 1,000,000 | Set add                        |      9.88 M ±21 % |        6.38 M ±7 % |            0.65× |
| build from an array  |     1,000 | new Set                        |       37.3 M ±1 % |       35.7 M ±20 % |            0.96× |
| build from an array  |   100,000 | new Set                        |      14.3 M ±16 % |        14.6 M ±3 % |             1.0× |
| build from an array  | 1,000,000 | new Set                        |       8.67 M ±8 % |       9.26 M ±31 % |             1.1× |
| delete and add again |     1,000 | Set delete and add             |      23.6 M ±11 % |       18.7 M ±14 % |            0.79× |
| delete and add again |   100,000 | Set delete and add             |      1.72 M ±13 % |       1.69 M ±20 % |            0.98× |
| delete and add again | 1,000,000 | Set delete and add             |       101 k ±98 % |       9.78 M ±18 % |              97× |
| has                  |     1,000 | Set has                        |        110 M ±1 % |        87.1 M ±2 % |            0.79× |
| has                  |   100,000 | Set has                        |       45.3 M ±4 % |        40.1 M ±2 % |            0.88× |
| has                  | 1,000,000 | Set has                        |       32.1 M ±3 % |        29.0 M ±5 % |            0.91× |
| iterate              |     1,000 | Set for…of                     |       333 M ±12 % |         287 M ±1 % |            0.86× |
| iterate              |   100,000 | Set for…of                     |        340 M ±5 % |         309 M ±1 % |            0.91× |
| iterate              | 1,000,000 | Set for…of                     |        322 M ±1 % |         161 M ±0 % |            0.50× |
| take the first       |     1,000 | Set values().next() and delete |       18.0 M ±0 % |       12.0 M ±14 % |            0.67× |
| take the first       |   100,000 | Set values().next() and delete |      9.03 M ±15 % |        6.78 M ±3 % |            0.75× |
| take the first       | 1,000,000 | Set values().next() and delete |      3.22 M ±16 % |       2.26 M ±22 % |            0.70× |

### LinkedList

| Operation                           |      Size | Native baseline       | Native per second | Library per second | Library ÷ native |
| ----------------------------------- | --------: | --------------------- | ----------------: | -----------------: | ---------------: |
| add at the end                      |     1,000 | Array push            |       169 M ±41 % |        115 M ±10 % |            0.68× |
| add at the end                      |   100,000 | Array push            |       62.3 M ±3 % |         102 M ±0 % |             1.6× |
| add at the end                      | 1,000,000 | Array push            |       49.2 M ±1 % |       10.8 M ±36 % |            0.22× |
| add at the front, take from the end |     1,000 | Array unshift and pop |       9.90 M ±3 % |        56.1 M ±1 % |             5.7× |
| add at the front, take from the end |   100,000 | Array unshift and pop |       53.9 k ±0 % |        43.5 M ±1 % |             808× |
| iterate                             |     1,000 | Array for…of          |       1.01 G ±0 % |         165 M ±3 % |            0.16× |
| iterate                             |   100,000 | Array for…of          |       90.0 M ±0 % |       86.2 M ±13 % |            0.96× |
| iterate                             | 1,000,000 | Array for…of          |       86.7 M ±2 % |        70.7 M ±4 % |            0.82× |
| take from the front, add at the end |     1,000 | Array shift and push  |       13.5 M ±1 % |        55.6 M ±3 % |             4.1× |
| take from the front, add at the end |   100,000 | Array shift and push  |       53.9 k ±2 % |       45.0 M ±17 % |             835× |

### PriorityQueue

| Operation               |      Size | Native baseline               | Native per second | Library per second | Library ÷ native |
| ----------------------- | --------: | ----------------------------- | ----------------: | -----------------: | ---------------: |
| add one by one          |     1,000 | Array push, then sort         |      6.19 M ±13 % |       77.9 M ±18 % |              13× |
| add one by one          |   100,000 | Array push, then sort         |       3.68 M ±3 % |        33.0 M ±1 % |             9.0× |
| add one by one          | 1,000,000 | Array push, then sort         |      2.99 M ±14 % |        21.9 M ±1 % |             7.3× |
| build from an array     |     1,000 | Array copy and sort           |      5.92 M ±24 % |         273 M ±5 % |              46× |
| build from an array     |   100,000 | Array copy and sort           |       3.79 M ±0 % |       69.9 M ±11 % |              18× |
| build from an array     | 1,000,000 | Array copy and sort           |       3.19 M ±2 % |       73.6 M ±29 % |              23× |
| take the least, add one |     1,000 | sorted Array shift and insert |       8.07 M ±2 % |        16.2 M ±8 % |             2.0× |
| take the least, add one |   100,000 | sorted Array shift and insert |      43.8 k ±17 % |       7.03 M ±22 % |             160× |

### TreeMap

| Operation                    |      Size | Native baseline        | Native per second | Library per second | Library ÷ native |
| ---------------------------- | --------: | ---------------------- | ----------------: | -----------------: | ---------------: |
| build from entries           |     1,000 | Array copy and sort    |       5.52 M ±1 % |       8.65 M ±17 % |             1.6× |
| build from entries           |   100,000 | Array copy and sort    |       2.54 M ±2 % |       2.25 M ±25 % |            0.89× |
| build from entries           | 1,000,000 | Array copy and sort    |      1.71 M ±14 % |        1.14 M ±6 % |            0.66× |
| ceiling entry                |     1,000 | sorted Array bisection |       39.3 M ±2 % |        8.74 M ±1 % |            0.22× |
| ceiling entry                |   100,000 | sorted Array bisection |       10.8 M ±1 % |       3.36 M ±10 % |            0.31× |
| ceiling entry                | 1,000,000 | sorted Array bisection |       6.45 M ±5 % |       1.45 M ±17 % |            0.22× |
| delete and set again         |     1,000 | sorted Array splice    |       1.45 M ±0 % |       5.30 M ±12 % |             3.7× |
| delete and set again         |   100,000 | sorted Array splice    |      54.8 k ±20 % |        2.87 M ±5 % |              52× |
| floor entry                  |     1,000 | sorted Array bisection |       43.8 M ±2 % |        10.6 M ±7 % |            0.24× |
| floor entry                  |   100,000 | sorted Array bisection |       11.0 M ±1 % |        3.37 M ±7 % |            0.31× |
| floor entry                  | 1,000,000 | sorted Array bisection |       6.85 M ±2 % |       1.46 M ±10 % |            0.21× |
| get                          |     1,000 | Map get                |        146 M ±1 % |        21.6 M ±1 % |            0.15× |
| get                          |   100,000 | Map get                |       40.9 M ±4 % |       4.07 M ±12 % |            0.10× |
| get                          | 1,000,000 | Map get                |       31.1 M ±1 % |        2.04 M ±5 % |           0.066× |
| iterate                      |     1,000 | sorted Array for…of    |       1.00 G ±0 % |        47.9 M ±1 % |           0.048× |
| iterate                      |   100,000 | sorted Array for…of    |      88.0 M ±23 % |       24.0 M ±15 % |            0.27× |
| iterate                      | 1,000,000 | sorted Array for…of    |       89.9 M ±0 % |        18.2 M ±1 % |            0.20× |
| set new keys in seeded order |     1,000 | sorted Array insert    |       10.5 M ±0 % |        10.3 M ±1 % |            0.98× |
| set new keys in seeded order |   100,000 | sorted Array insert    |        255 k ±1 % |        4.10 M ±8 % |              16× |

### TreeSet

| Operation            |      Size | Native baseline        | Native per second | Library per second | Library ÷ native |
| -------------------- | --------: | ---------------------- | ----------------: | -----------------: | ---------------: |
| add one by one       |     1,000 | sorted Array insert    |       10.5 M ±5 % |        9.39 M ±3 % |            0.90× |
| add one by one       |   100,000 | sorted Array insert    |       253 k ±27 % |        3.99 M ±2 % |              16× |
| build from an array  |     1,000 | Array copy and sort    |       6.34 M ±1 % |        8.31 M ±0 % |             1.3× |
| build from an array  |   100,000 | Array copy and sort    |       3.87 M ±1 % |       2.95 M ±12 % |            0.76× |
| build from an array  | 1,000,000 | Array copy and sort    |       3.19 M ±2 % |        1.45 M ±7 % |            0.45× |
| ceiling              |     1,000 | sorted Array bisection |       39.3 M ±1 % |        9.19 M ±1 % |            0.23× |
| ceiling              |   100,000 | sorted Array bisection |       10.7 M ±1 % |       3.82 M ±24 % |            0.36× |
| ceiling              | 1,000,000 | sorted Array bisection |       6.83 M ±9 % |        1.51 M ±9 % |            0.22× |
| delete and add again |     1,000 | sorted Array splice    |      1.46 M ±26 % |       4.46 M ±18 % |             3.1× |
| delete and add again |   100,000 | sorted Array splice    |       56.7 k ±4 % |        2.80 M ±1 % |              49× |
| floor                |     1,000 | sorted Array bisection |      42.5 M ±13 % |        8.84 M ±1 % |            0.21× |
| floor                |   100,000 | sorted Array bisection |       11.0 M ±1 % |        3.35 M ±8 % |            0.31× |
| floor                | 1,000,000 | sorted Array bisection |       6.45 M ±9 % |       1.43 M ±11 % |            0.22× |
| has                  |     1,000 | Set has                |       91.0 M ±1 % |        16.3 M ±1 % |            0.18× |
| has                  |   100,000 | Set has                |      40.6 M ±15 % |        3.88 M ±1 % |           0.096× |
| has                  | 1,000,000 | Set has                |      32.5 M ±14 % |       1.79 M ±12 % |           0.055× |
| iterate              |     1,000 | sorted Array for…of    |       1.00 G ±1 % |        80.5 M ±4 % |           0.080× |
| iterate              |   100,000 | sorted Array for…of    |       90.2 M ±1 % |       40.4 M ±13 % |            0.45× |
| iterate              | 1,000,000 | sorted Array for…of    |       87.5 M ±1 % |        28.4 M ±3 % |            0.32× |
<!-- bench:end -->

### Compared with other libraries

The same harness measures five structures against their counterparts in other collection
libraries, on the built package, at 1,000, 100,000 and 1,000,000 elements, with input from a
fixed seed:

| Case           | This library                                              | Other libraries                                                                  | Operations                                                                                                                                                                                           |
| -------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sorted map     | `TreeMap`                                                 | js-sdsl `OrderedMap`                                                             | insert n keys into an empty map; get present keys; the nearest key at or below a key that is not present (`floorEntry`, `reverseLowerBound`); iterate in key order; delete a key and insert it again |
| Priority queue | `PriorityQueue`                                           | js-sdsl `PriorityQueue`, mnemonist `Heap`, @datastructures-js `MinPriorityQueue` | build from an array; push n elements onto an empty queue; build, then poll every element                                                                                                             |
| Deque          | `ArrayDeque`                                              | js-sdsl `Deque`, @datastructures-js `Deque`                                      | add at the end, then take from the front; add at the front, then take from the end                                                                                                                   |
| LRU map        | `LinkedHashMap` with `accessOrder: true` and `maxSize: n` | mnemonist `LRUMap` with capacity n                                               | set 2n keys into an empty map, evicting n; get present keys of a full map                                                                                                                            |
| Linked list    | `LinkedList`                                              | js-sdsl `LinkList`, @datastructures-js `DoublyLinkedList`                        | add n elements at the end; add at the end, then take from the front                                                                                                                                  |

Every library is used through its documented API. This library runs with its default options,
except those the LRU case names. Every queue takes the least element first: js-sdsl
`PriorityQueue`, whose default order puts the greatest first, is given the comparator
`(a, b) => a - b`; the others are ascending by default. Every build copies its input once inside
the timed work: this library, js-sdsl and mnemonist copy the array themselves, and
@datastructures-js, which orders the array it is given in place, is given a copy.

Each side of a case returns a checksum of the values it polled, read or iterated, in order, and
its final size. Before anything is timed, the runner checks that every installed package is at
its pinned version and that every library returns this library's checksum at every size; either
difference stops the run with no results file.

Each figure is the median of the timed batches, as in the native comparison above. The last
column divides the other library's figure by this library's: above 1× the other library is
faster. Every measured row is shown, and the list after the tables names every row in which
another library has the higher median, marked "(within spread)" where the two ranges
median ± spread overlap. A library with no counterpart in a case is named under its table. The
chart shows the ratios at 100,000 elements.

The compared packages install on their own, in `fixtures/competitors/`, with their own lockfile;
they are never part of this package or its development install. To repeat the run:

```sh
pnpm -C fixtures/competitors install --frozen-lockfile
pnpm build && pnpm bench:compare
pnpm bench:docs && pnpm bench:chart
```

`pnpm bench:compare --reverse` times this library's side of each case last instead of first.

<!-- compare:start -->
Run on 2026-11-26 with Node.js v24.11.1 on darwin, Intel(R) Core(TM) i5-8600 CPU @ 3.10GHz (6 cores, 64 GB), version 0.1.1 of the package, each case timed this library last. Compared packages: @datastructures-js/deque 1.0.8, @datastructures-js/linked-list 6.1.4, @datastructures-js/priority-queue 6.4.0, js-sdsl 4.4.2, mnemonist 0.40.8.

![Bar chart of each other library's median operations per second divided by javascript-collections-framework's, at 100,000 elements, on a log scale centred on 1×. Rows where another library's median is higher, 6 of 24: Sorted map insert (js-sdsl 1.1×), Priority queue push (js-sdsl 1.0×), Priority queue push (mnemonist 1.1×), LRU map set 2n keys, evicting n (mnemonist 1.1×), LRU map get present keys (mnemonist 1.0×), Linked list add at the end (js-sdsl 1.2×).](images/benchmarks.svg)

#### Sorted map

| Operation               |      Size | Library                                    |   Per second | Other ÷ this library |
| ----------------------- | --------: | ------------------------------------------ | -----------: | -------------------: |
| insert                  |     1,000 | javascript-collections-framework `TreeMap` |  11.3 M ±0 % |                   1× |
| insert                  |     1,000 | js-sdsl `OrderedMap`                       |  12.3 M ±2 % |                 1.1× |
| get                     |     1,000 | javascript-collections-framework `TreeMap` |  21.6 M ±0 % |                   1× |
| get                     |     1,000 | js-sdsl `OrderedMap`                       |  15.2 M ±0 % |                0.70× |
| nearest key at or below |     1,000 | javascript-collections-framework `TreeMap` | 10.3 M ±23 % |                   1× |
| nearest key at or below |     1,000 | js-sdsl `OrderedMap`                       |  3.45 M ±2 % |                0.33× |
| iterate in order        |     1,000 | javascript-collections-framework `TreeMap` |  52.0 M ±2 % |                   1× |
| iterate in order        |     1,000 | js-sdsl `OrderedMap`                       |  22.0 M ±1 % |                0.42× |
| delete and insert again |     1,000 | javascript-collections-framework `TreeMap` |  5.62 M ±2 % |                   1× |
| delete and insert again |     1,000 | js-sdsl `OrderedMap`                       |  5.08 M ±2 % |                0.90× |
| insert                  |   100,000 | javascript-collections-framework `TreeMap` |  4.12 M ±8 % |                   1× |
| insert                  |   100,000 | js-sdsl `OrderedMap`                       |  4.69 M ±2 % |                 1.1× |
| get                     |   100,000 | javascript-collections-framework `TreeMap` | 4.82 M ±13 % |                   1× |
| get                     |   100,000 | js-sdsl `OrderedMap`                       |  4.26 M ±6 % |                0.88× |
| nearest key at or below |   100,000 | javascript-collections-framework `TreeMap` | 3.64 M ±15 % |                   1× |
| nearest key at or below |   100,000 | js-sdsl `OrderedMap`                       |  1.95 M ±7 % |                0.54× |
| iterate in order        |   100,000 | javascript-collections-framework `TreeMap` |  30.0 M ±5 % |                   1× |
| iterate in order        |   100,000 | js-sdsl `OrderedMap`                       |  14.3 M ±2 % |                0.48× |
| delete and insert again |   100,000 | javascript-collections-framework `TreeMap` |  3.18 M ±1 % |                   1× |
| delete and insert again |   100,000 | js-sdsl `OrderedMap`                       |  2.89 M ±3 % |                0.91× |
| insert                  | 1,000,000 | javascript-collections-framework `TreeMap` |  1.53 M ±3 % |                   1× |
| insert                  | 1,000,000 | js-sdsl `OrderedMap`                       |  1.61 M ±4 % |                 1.1× |
| get                     | 1,000,000 | javascript-collections-framework `TreeMap` | 1.97 M ±16 % |                   1× |
| get                     | 1,000,000 | js-sdsl `OrderedMap`                       |  1.89 M ±7 % |                0.96× |
| nearest key at or below | 1,000,000 | javascript-collections-framework `TreeMap` |  1.63 M ±5 % |                   1× |
| nearest key at or below | 1,000,000 | js-sdsl `OrderedMap`                       |  1.14 M ±4 % |                0.70× |
| iterate in order        | 1,000,000 | javascript-collections-framework `TreeMap` |  20.3 M ±1 % |                   1× |
| iterate in order        | 1,000,000 | js-sdsl `OrderedMap`                       |  10.6 M ±0 % |                0.52× |
| delete and insert again | 1,000,000 | javascript-collections-framework `TreeMap` |  2.08 M ±2 % |                   1× |
| delete and insert again | 1,000,000 | js-sdsl `OrderedMap`                       |  1.86 M ±3 % |                0.90× |

No counterpart: mnemonist, @datastructures-js.

#### Priority queue

| Operation           |      Size | Library                                          |   Per second | Other ÷ this library |
| ------------------- | --------: | ------------------------------------------------ | -----------: | -------------------: |
| build from an array |     1,000 | javascript-collections-framework `PriorityQueue` |  282 M ±16 % |                   1× |
| build from an array |     1,000 | js-sdsl `PriorityQueue`                          |  61.8 M ±1 % |                0.22× |
| build from an array |     1,000 | mnemonist `Heap`                                 |   186 M ±1 % |                0.66× |
| build from an array |     1,000 | @datastructures-js `MinPriorityQueue`            |  86.3 M ±1 % |                0.31× |
| push                |     1,000 | javascript-collections-framework `PriorityQueue` |  85.7 M ±2 % |                   1× |
| push                |     1,000 | js-sdsl `PriorityQueue`                          |  95.9 M ±1 % |                 1.1× |
| push                |     1,000 | mnemonist `Heap`                                 |  88.7 M ±1 % |                 1.0× |
| push                |     1,000 | @datastructures-js `MinPriorityQueue`            |  36.5 M ±1 % |                0.43× |
| poll all            |     1,000 | javascript-collections-framework `PriorityQueue` |  20.8 M ±0 % |                   1× |
| poll all            |     1,000 | js-sdsl `PriorityQueue`                          |  6.40 M ±1 % |                0.31× |
| poll all            |     1,000 | mnemonist `Heap`                                 |  16.6 M ±0 % |                0.80× |
| poll all            |     1,000 | @datastructures-js `MinPriorityQueue`            |  9.17 M ±1 % |                0.44× |
| build from an array |   100,000 | javascript-collections-framework `PriorityQueue` |  78.9 M ±1 % |                   1× |
| build from an array |   100,000 | js-sdsl `PriorityQueue`                          |  41.5 M ±1 % |                0.53× |
| build from an array |   100,000 | mnemonist `Heap`                                 |  67.4 M ±1 % |                0.85× |
| build from an array |   100,000 | @datastructures-js `MinPriorityQueue`            |  45.8 M ±5 % |                0.58× |
| push                |   100,000 | javascript-collections-framework `PriorityQueue` |  32.2 M ±1 % |                   1× |
| push                |   100,000 | js-sdsl `PriorityQueue`                          |  33.2 M ±2 % |                 1.0× |
| push                |   100,000 | mnemonist `Heap`                                 |  34.9 M ±2 % |                 1.1× |
| push                |   100,000 | @datastructures-js `MinPriorityQueue`            |  22.3 M ±2 % |                0.69× |
| poll all            |   100,000 | javascript-collections-framework `PriorityQueue` |  10.2 M ±0 % |                   1× |
| poll all            |   100,000 | js-sdsl `PriorityQueue`                          |  3.48 M ±1 % |                0.34× |
| poll all            |   100,000 | mnemonist `Heap`                                 |  8.76 M ±4 % |                0.86× |
| poll all            |   100,000 | @datastructures-js `MinPriorityQueue`            |  5.22 M ±1 % |                0.51× |
| build from an array | 1,000,000 | javascript-collections-framework `PriorityQueue` | 72.1 M ±25 % |                   1× |
| build from an array | 1,000,000 | js-sdsl `PriorityQueue`                          |  38.9 M ±3 % |                0.54× |
| build from an array | 1,000,000 | mnemonist `Heap`                                 | 61.5 M ±22 % |                0.85× |
| build from an array | 1,000,000 | @datastructures-js `MinPriorityQueue`            |  42.1 M ±3 % |                0.58× |
| push                | 1,000,000 | javascript-collections-framework `PriorityQueue` |  29.0 M ±1 % |                   1× |
| push                | 1,000,000 | js-sdsl `PriorityQueue`                          |  29.2 M ±2 % |                 1.0× |
| push                | 1,000,000 | mnemonist `Heap`                                 |  30.4 M ±3 % |                 1.0× |
| push                | 1,000,000 | @datastructures-js `MinPriorityQueue`            | 19.5 M ±14 % |                0.67× |
| poll all            | 1,000,000 | javascript-collections-framework `PriorityQueue` |  7.56 M ±5 % |                   1× |
| poll all            | 1,000,000 | js-sdsl `PriorityQueue`                          |  2.44 M ±4 % |                0.32× |
| poll all            | 1,000,000 | mnemonist `Heap`                                 |  5.92 M ±6 % |                0.78× |
| poll all            | 1,000,000 | @datastructures-js `MinPriorityQueue`            |  3.70 M ±7 % |                0.49× |

#### Deque

| Operation                           |      Size | Library                                       |  Per second | Other ÷ this library |
| ----------------------------------- | --------: | --------------------------------------------- | ----------: | -------------------: |
| add at the end, take from the front |     1,000 | javascript-collections-framework `ArrayDeque` |  157 M ±1 % |                   1× |
| add at the end, take from the front |     1,000 | js-sdsl `Deque`                               |  127 M ±1 % |                0.81× |
| add at the end, take from the front |     1,000 | @datastructures-js `Deque`                    |  121 M ±0 % |                0.77× |
| add at the front, take from the end |     1,000 | javascript-collections-framework `ArrayDeque` |  159 M ±1 % |                   1× |
| add at the front, take from the end |     1,000 | js-sdsl `Deque`                               |  140 M ±0 % |                0.88× |
| add at the front, take from the end |     1,000 | @datastructures-js `Deque`                    |  125 M ±1 % |                0.79× |
| add at the end, take from the front |   100,000 | javascript-collections-framework `ArrayDeque` |  157 M ±0 % |                   1× |
| add at the end, take from the front |   100,000 | js-sdsl `Deque`                               |  130 M ±0 % |                0.83× |
| add at the end, take from the front |   100,000 | @datastructures-js `Deque`                    | 36.9 M ±1 % |                0.23× |
| add at the front, take from the end |   100,000 | javascript-collections-framework `ArrayDeque` |  155 M ±1 % |                   1× |
| add at the front, take from the end |   100,000 | js-sdsl `Deque`                               |  128 M ±1 % |                0.83× |
| add at the front, take from the end |   100,000 | @datastructures-js `Deque`                    | 37.5 M ±7 % |                0.24× |
| add at the end, take from the front | 1,000,000 | javascript-collections-framework `ArrayDeque` |  154 M ±0 % |                   1× |
| add at the end, take from the front | 1,000,000 | js-sdsl `Deque`                               |  130 M ±2 % |                0.85× |
| add at the end, take from the front | 1,000,000 | @datastructures-js `Deque`                    | 35.4 M ±5 % |                0.23× |
| add at the front, take from the end | 1,000,000 | javascript-collections-framework `ArrayDeque` |  153 M ±1 % |                   1× |
| add at the front, take from the end | 1,000,000 | js-sdsl `Deque`                               |  124 M ±2 % |                0.81× |
| add at the front, take from the end | 1,000,000 | @datastructures-js `Deque`                    | 35.9 M ±6 % |                0.23× |

No counterpart: mnemonist.

#### LRU map

| Operation               |      Size | Library                                          |   Per second | Other ÷ this library |
| ----------------------- | --------: | ------------------------------------------------ | -----------: | -------------------: |
| set 2n keys, evicting n |     1,000 | javascript-collections-framework `LinkedHashMap` |  14.3 M ±2 % |                   1× |
| set 2n keys, evicting n |     1,000 | mnemonist `LRUMap`                               |  18.3 M ±2 % |                 1.3× |
| get present keys        |     1,000 | javascript-collections-framework `LinkedHashMap` |  55.2 M ±1 % |                   1× |
| get present keys        |     1,000 | mnemonist `LRUMap`                               |  55.2 M ±1 % |                 1.0× |
| set 2n keys, evicting n |   100,000 | javascript-collections-framework `LinkedHashMap` |  6.37 M ±2 % |                   1× |
| set 2n keys, evicting n |   100,000 | mnemonist `LRUMap`                               |  7.08 M ±7 % |                 1.1× |
| get present keys        |   100,000 | javascript-collections-framework `LinkedHashMap` |  26.1 M ±3 % |                   1× |
| get present keys        |   100,000 | mnemonist `LRUMap`                               |  26.6 M ±0 % |                 1.0× |
| set 2n keys, evicting n | 1,000,000 | javascript-collections-framework `LinkedHashMap` |  3.52 M ±6 % |                   1× |
| set 2n keys, evicting n | 1,000,000 | mnemonist `LRUMap`                               |  3.61 M ±9 % |                 1.0× |
| get present keys        | 1,000,000 | javascript-collections-framework `LinkedHashMap` | 4.88 M ±49 % |                   1× |
| get present keys        | 1,000,000 | mnemonist `LRUMap`                               | 8.84 M ±22 % |                 1.8× |

No counterpart: js-sdsl, @datastructures-js.

#### Linked list

| Operation                           |      Size | Library                                       |   Per second | Other ÷ this library |
| ----------------------------------- | --------: | --------------------------------------------- | -----------: | -------------------: |
| add at the end                      |     1,000 | javascript-collections-framework `LinkedList` |  120 M ±33 % |                   1× |
| add at the end                      |     1,000 | js-sdsl `LinkList`                            |   157 M ±3 % |                 1.3× |
| add at the end                      |     1,000 | @datastructures-js `DoublyLinkedList`         |  83.0 M ±3 % |                0.69× |
| add at the end, take from the front |     1,000 | javascript-collections-framework `LinkedList` |  52.1 M ±1 % |                   1× |
| add at the end, take from the front |     1,000 | js-sdsl `LinkList`                            |  39.7 M ±1 % |                0.76× |
| add at the end, take from the front |     1,000 | @datastructures-js `DoublyLinkedList`         |  37.3 M ±1 % |                0.72× |
| add at the end                      |   100,000 | javascript-collections-framework `LinkedList` |   103 M ±2 % |                   1× |
| add at the end                      |   100,000 | js-sdsl `LinkList`                            |   121 M ±1 % |                 1.2× |
| add at the end                      |   100,000 | @datastructures-js `DoublyLinkedList`         |  72.4 M ±3 % |                0.70× |
| add at the end, take from the front |   100,000 | javascript-collections-framework `LinkedList` |  45.8 M ±1 % |                   1× |
| add at the end, take from the front |   100,000 | js-sdsl `LinkList`                            |  37.7 M ±1 % |                0.82× |
| add at the end, take from the front |   100,000 | @datastructures-js `DoublyLinkedList`         |  34.4 M ±1 % |                0.75× |
| add at the end                      | 1,000,000 | javascript-collections-framework `LinkedList` |   102 M ±1 % |                   1× |
| add at the end                      | 1,000,000 | js-sdsl `LinkList`                            |  58.8 M ±1 % |                0.58× |
| add at the end                      | 1,000,000 | @datastructures-js `DoublyLinkedList`         |  44.5 M ±0 % |                0.44× |
| add at the end, take from the front | 1,000,000 | javascript-collections-framework `LinkedList` | 14.1 M ±10 % |                   1× |
| add at the end, take from the front | 1,000,000 | js-sdsl `LinkList`                            | 18.8 M ±12 % |                 1.3× |
| add at the end, take from the front | 1,000,000 | @datastructures-js `DoublyLinkedList`         | 14.5 M ±21 % |                 1.0× |

No counterpart: mnemonist.

Another library has a higher median in:

- Sorted map, insert, 1,000 (js-sdsl `OrderedMap` 1.1×)
- Priority queue, push, 1,000 (js-sdsl `PriorityQueue` 1.1×)
- Priority queue, push, 1,000 (mnemonist `Heap` 1.0×)
- LRU map, set 2n keys, evicting n, 1,000 (mnemonist `LRUMap` 1.3×)
- Linked list, add at the end, 1,000 (js-sdsl `LinkList` 1.3×) (within spread)
- Sorted map, insert, 100,000 (js-sdsl `OrderedMap` 1.1×)
- Priority queue, push, 100,000 (js-sdsl `PriorityQueue` 1.0×)
- Priority queue, push, 100,000 (mnemonist `Heap` 1.1×)
- LRU map, set 2n keys, evicting n, 100,000 (mnemonist `LRUMap` 1.1×)
- LRU map, get present keys, 100,000 (mnemonist `LRUMap` 1.0×) (within spread)
- Linked list, add at the end, 100,000 (js-sdsl `LinkList` 1.2×)
- Sorted map, insert, 1,000,000 (js-sdsl `OrderedMap` 1.1×) (within spread)
- Priority queue, push, 1,000,000 (js-sdsl `PriorityQueue` 1.0×) (within spread)
- Priority queue, push, 1,000,000 (mnemonist `Heap` 1.0×)
- LRU map, set 2n keys, evicting n, 1,000,000 (mnemonist `LRUMap` 1.0×) (within spread)
- LRU map, get present keys, 1,000,000 (mnemonist `LRUMap` 1.8×) (within spread)
- Linked list, add at the end, take from the front, 1,000,000 (js-sdsl `LinkList` 1.3×)
- Linked list, add at the end, take from the front, 1,000,000 (@datastructures-js `DoublyLinkedList` 1.0×) (within spread)
<!-- compare:end -->

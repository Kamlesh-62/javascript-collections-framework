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
| Whole package                     |           169741 |           37423 |                   38144 |
| `ArrayDeque`                      |            17430 |            5179 |                    5568 |
| `ArrayList`                       |            23582 |            6833 |                    7424 |
| `ClassCastError`                  |              663 |             400 |                     448 |
| `ConcurrentModificationError`     |              698 |             408 |                     512 |
| `HashMap`                         |            32485 |            8986 |                    9344 |
| `HashSet`                         |            21314 |            6592 |                    7104 |
| `IllegalArgumentError`            |              682 |             408 |                     512 |
| `IllegalStateError`               |              668 |             399 |                     448 |
| `IndexOutOfBoundsError`           |              685 |             410 |                     512 |
| `LinkedHashMap`                   |            48091 |           12667 |                   12736 |
| `LinkedHashSet`                   |            29359 |            8755 |                    9408 |
| `LinkedList`                      |            18295 |            5391 |                    5824 |
| `NoSuchElementError`              |              671 |             402 |                     448 |
| `NullElementError`                |              669 |             401 |                     448 |
| `PriorityQueue`                   |            17912 |            5556 |                    5952 |
| `TreeMap`                         |            47840 |           12190 |                   13248 |
| `TreeSet`                         |            31421 |            8711 |                    9472 |
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
Run on 2026-11-23 with Node.js v24.11.1 on darwin, Intel(R) Core(TM) i5-8600 CPU @ 3.10GHz (6 cores, 64 GB), version 0.1.1 of the package.

### ArrayDeque

| Operation                           |      Size | Native baseline       | Native per second | Library per second | Library ÷ native |
| ----------------------------------- | --------: | --------------------- | ----------------: | -----------------: | ---------------: |
| add at the end                      |     1,000 | Array push            |        274 M ±1 % |         101 M ±1 % |            0.37× |
| add at the end                      |   100,000 | Array push            |       58.8 M ±5 % |        51.1 M ±2 % |            0.87× |
| add at the end                      | 1,000,000 | Array push            |       47.5 M ±1 % |       37.8 M ±30 % |            0.79× |
| add at the front, take from the end |     1,000 | Array unshift and pop |       10.0 M ±1 % |        69.4 M ±0 % |             6.9× |
| add at the front, take from the end |   100,000 | Array unshift and pop |       53.5 k ±1 % |        54.0 M ±0 % |           1,009× |
| iterate                             |     1,000 | Array for…of          |       1.00 G ±0 % |         151 M ±1 % |            0.15× |
| iterate                             |   100,000 | Array for…of          |       87.8 M ±5 % |        130 M ±22 % |             1.5× |
| iterate                             | 1,000,000 | Array for…of          |       89.4 M ±1 % |        74.5 M ±2 % |            0.83× |
| take from the front, add at the end |     1,000 | Array shift and push  |       13.9 M ±1 % |         105 M ±0 % |             7.6× |
| take from the front, add at the end |   100,000 | Array shift and push  |       53.3 k ±1 % |        94.3 M ±3 % |           1,771× |

### ArrayList

| Operation              |      Size | Native baseline      | Native per second | Library per second | Library ÷ native |
| ---------------------- | --------: | -------------------- | ----------------: | -----------------: | ---------------: |
| add at the end         |     1,000 | Array push           |        274 M ±4 % |         227 M ±1 % |            0.83× |
| add at the end         |   100,000 | Array push           |       61.1 M ±4 % |        58.4 M ±3 % |            0.95× |
| add at the end         | 1,000,000 | Array push           |       50.0 M ±1 % |       30.9 M ±20 % |            0.62× |
| build from an array    |     1,000 | Array.from           |       2.11 G ±6 % |       1.77 G ±10 % |            0.84× |
| build from an array    |   100,000 | Array.from           |        221 M ±2 % |        164 M ±40 % |            0.74× |
| build from an array    | 1,000,000 | Array.from           |        222 M ±1 % |         241 M ±2 % |             1.1× |
| get by index           |     1,000 | Array index          |        764 M ±1 % |         384 M ±0 % |            0.50× |
| get by index           |   100,000 | Array index          |        516 M ±1 % |         262 M ±1 % |            0.51× |
| get by index           | 1,000,000 | Array index          |        395 M ±1 % |         236 M ±1 % |            0.60× |
| iterate                |     1,000 | Array for…of         |    1.00e+3 M ±1 % |         190 M ±2 % |            0.19× |
| iterate                |   100,000 | Array for…of         |       90.5 M ±0 % |         198 M ±1 % |             2.2× |
| iterate                | 1,000,000 | Array for…of         |       86.7 M ±0 % |         131 M ±1 % |             1.5× |
| remove first, add last |     1,000 | Array shift and push |       14.0 M ±0 % |        2.03 M ±0 % |            0.14× |
| remove first, add last |   100,000 | Array shift and push |       54.0 k ±1 % |        22.4 k ±1 % |            0.41× |

### HashMap

| Operation                        |      Size | Native baseline    | Native per second | Library per second | Library ÷ native |
| -------------------------------- | --------: | ------------------ | ----------------: | -----------------: | ---------------: |
| build from entries               |     1,000 | new Map            |       28.8 M ±1 % |        23.2 M ±1 % |            0.81× |
| build from entries               |   100,000 | new Map            |       10.2 M ±2 % |        7.11 M ±4 % |            0.70× |
| build from entries               | 1,000,000 | new Map            |      6.23 M ±27 % |       3.14 M ±22 % |            0.50× |
| delete and set again             |     1,000 | Map delete and set |       22.3 M ±1 % |        19.3 M ±2 % |            0.87× |
| delete and set again             |   100,000 | Map delete and set |      1.37 M ±22 % |       1.27 M ±31 % |            0.93× |
| delete and set again             | 1,000,000 | Map delete and set |      83.9 k ±63 % |       80.0 k ±63 % |            0.95× |
| get                              |     1,000 | Map get            |       98.1 M ±1 % |        76.3 M ±1 % |            0.78× |
| get                              |   100,000 | Map get            |       41.8 M ±7 % |        30.9 M ±6 % |            0.74× |
| get                              | 1,000,000 | Map get            |      21.8 M ±27 % |       22.5 M ±16 % |             1.0× |
| get by value with the key option |     1,000 | Map get by id      |        130 M ±0 % |        48.0 M ±1 % |            0.37× |
| get by value with the key option |   100,000 | Map get by id      |       41.3 M ±3 % |        20.8 M ±3 % |            0.50× |
| get by value with the key option | 1,000,000 | Map get by id      |       28.5 M ±1 % |        11.1 M ±9 % |            0.39× |
| has                              |     1,000 | Map has            |        101 M ±2 % |       69.1 M ±12 % |            0.69× |
| has                              |   100,000 | Map has            |       43.8 M ±1 % |        36.1 M ±1 % |            0.82× |
| has                              | 1,000,000 | Map has            |       29.7 M ±5 % |       15.8 M ±39 % |            0.53× |
| iterate                          |     1,000 | Map for…of         |        137 M ±0 % |        142 M ±12 % |             1.0× |
| iterate                          |   100,000 | Map for…of         |        136 M ±2 % |         137 M ±2 % |             1.0× |
| iterate                          | 1,000,000 | Map for…of         |       121 M ±23 % |        93.6 M ±1 % |            0.77× |
| set an existing key              |     1,000 | Map set            |       70.3 M ±1 % |        54.3 M ±1 % |            0.77× |
| set an existing key              |   100,000 | Map set            |       45.8 M ±9 % |        34.1 M ±1 % |            0.75× |
| set an existing key              | 1,000,000 | Map set            |       24.3 M ±0 % |        21.0 M ±0 % |            0.86× |
| set new keys one by one          |     1,000 | Map set            |       37.8 M ±1 % |       31.2 M ±19 % |            0.83× |
| set new keys one by one          |   100,000 | Map set            |       12.3 M ±4 % |        9.57 M ±5 % |            0.78× |
| set new keys one by one          | 1,000,000 | Map set            |       7.25 M ±4 % |        4.93 M ±1 % |            0.68× |

### HashSet

| Operation            |      Size | Native baseline    | Native per second | Library per second | Library ÷ native |
| -------------------- | --------: | ------------------ | ----------------: | -----------------: | ---------------: |
| add one by one       |     1,000 | Set add            |       40.3 M ±1 % |        33.1 M ±0 % |            0.82× |
| add one by one       |   100,000 | Set add            |       15.1 M ±2 % |        13.0 M ±4 % |            0.86× |
| add one by one       | 1,000,000 | Set add            |       9.08 M ±5 % |        5.84 M ±3 % |            0.64× |
| build from an array  |     1,000 | new Set            |       37.2 M ±1 % |       32.8 M ±16 % |            0.88× |
| build from an array  |   100,000 | new Set            |       14.3 M ±9 % |        13.4 M ±2 % |            0.93× |
| build from an array  | 1,000,000 | new Set            |       8.91 M ±7 % |        5.65 M ±4 % |            0.63× |
| delete and add again |     1,000 | Set delete and add |       24.2 M ±0 % |        19.7 M ±1 % |            0.81× |
| delete and add again |   100,000 | Set delete and add |      1.54 M ±22 % |       1.66 M ±21 % |             1.1× |
| delete and add again | 1,000,000 | Set delete and add |       106 k ±64 % |        106 k ±64 % |             1.0× |
| has                  |     1,000 | Set has            |        111 M ±1 % |        71.8 M ±0 % |            0.65× |
| has                  |   100,000 | Set has            |       45.7 M ±2 % |        37.3 M ±1 % |            0.82× |
| has                  | 1,000,000 | Set has            |       33.1 M ±1 % |        26.0 M ±4 % |            0.79× |
| iterate              |     1,000 | Set for…of         |        336 M ±0 % |         351 M ±0 % |             1.0× |
| iterate              |   100,000 | Set for…of         |        122 M ±1 % |         357 M ±1 % |             2.9× |
| iterate              | 1,000,000 | Set for…of         |       113 M ±24 % |        169 M ±19 % |             1.5× |

### LinkedHashMap

| Operation                 |      Size | Native baseline                  | Native per second | Library per second | Library ÷ native |
| ------------------------- | --------: | -------------------------------- | ----------------: | -----------------: | ---------------: |
| build from entries        |     1,000 | new Map                          |       29.0 M ±0 % |        22.5 M ±1 % |            0.77× |
| build from entries        |   100,000 | new Map                          |      7.57 M ±34 % |        7.81 M ±7 % |             1.0× |
| build from entries        | 1,000,000 | new Map                          |      6.19 M ±21 % |        3.96 M ±9 % |            0.64× |
| delete and set again      |     1,000 | Map delete and set               |       22.1 M ±1 % |        17.8 M ±2 % |            0.81× |
| delete and set again      |   100,000 | Map delete and set               |      1.37 M ±30 % |       1.36 M ±29 % |            0.99× |
| delete and set again      | 1,000,000 | Map delete and set               |       169 k ±56 % |       88.7 k ±73 % |            0.52× |
| get                       |     1,000 | Map get                          |       98.7 M ±0 % |        73.1 M ±1 % |            0.74× |
| get                       |   100,000 | Map get                          |       43.0 M ±1 % |        34.1 M ±1 % |            0.79× |
| get                       | 1,000,000 | Map get                          |       28.3 M ±7 % |        24.9 M ±4 % |            0.88× |
| get in access order (LRU) |     1,000 | Map get, delete and set          |       20.2 M ±1 % |       19.2 M ±20 % |            0.95× |
| get in access order (LRU) |   100,000 | Map get, delete and set          |       8.43 M ±6 % |        11.8 M ±3 % |             1.4× |
| get in access order (LRU) | 1,000,000 | Map get, delete and set          |       812 k ±85 % |       5.40 M ±22 % |             6.7× |
| iterate                   |     1,000 | Map for…of                       |       138 M ±17 % |         133 M ±1 % |            0.96× |
| iterate                   |   100,000 | Map for…of                       |        138 M ±5 % |        99.7 M ±1 % |            0.72× |
| iterate                   | 1,000,000 | Map for…of                       |       122 M ±20 % |        89.2 M ±3 % |            0.73× |
| set an existing key       |     1,000 | Map set                          |       67.2 M ±9 % |        54.7 M ±1 % |            0.81× |
| set an existing key       |   100,000 | Map set                          |       46.3 M ±1 % |       34.8 M ±12 % |            0.75× |
| set an existing key       | 1,000,000 | Map set                          |       24.0 M ±3 % |        20.3 M ±1 % |            0.85× |
| set new keys one by one   |     1,000 | Map set                          |       37.2 M ±3 % |        32.3 M ±1 % |            0.87× |
| set new keys one by one   |   100,000 | Map set                          |       11.5 M ±4 % |       8.96 M ±22 % |            0.78× |
| set new keys one by one   | 1,000,000 | Map set                          |       7.68 M ±2 % |        5.00 M ±2 % |            0.65× |
| set new keys with maxSize |     1,000 | Map set and delete the first key |      26.3 M ±13 % |        20.5 M ±1 % |            0.78× |
| set new keys with maxSize |   100,000 | Map set and delete the first key |       10.0 M ±2 % |        8.73 M ±1 % |            0.87× |
| set new keys with maxSize | 1,000,000 | Map set and delete the first key |       5.38 M ±3 % |       3.45 M ±21 % |            0.64× |
| take the first entry      |     1,000 | Map keys().next() and delete     |       17.2 M ±1 % |       11.2 M ±17 % |            0.65× |
| take the first entry      |   100,000 | Map keys().next() and delete     |      6.85 M ±21 % |       3.89 M ±15 % |            0.57× |
| take the first entry      | 1,000,000 | Map keys().next() and delete     |      2.69 M ±22 % |       2.39 M ±20 % |            0.89× |

### LinkedHashSet

| Operation            |      Size | Native baseline                | Native per second | Library per second | Library ÷ native |
| -------------------- | --------: | ------------------------------ | ----------------: | -----------------: | ---------------: |
| add one by one       |     1,000 | Set add                        |       39.9 M ±1 % |        33.6 M ±2 % |            0.84× |
| add one by one       |   100,000 | Set add                        |      13.8 M ±11 % |        11.0 M ±3 % |            0.79× |
| add one by one       | 1,000,000 | Set add                        |       9.05 M ±6 % |       4.70 M ±27 % |            0.52× |
| build from an array  |     1,000 | new Set                        |       37.8 M ±0 % |        37.5 M ±0 % |            0.99× |
| build from an array  |   100,000 | new Set                        |       14.4 M ±3 % |        14.0 M ±5 % |            0.97× |
| build from an array  | 1,000,000 | new Set                        |       8.72 M ±6 % |       9.00 M ±31 % |             1.0× |
| delete and add again |     1,000 | Set delete and add             |       23.8 M ±1 % |        19.3 M ±1 % |            0.81× |
| delete and add again |   100,000 | Set delete and add             |      1.31 M ±30 % |       1.30 M ±16 % |            0.99× |
| delete and add again | 1,000,000 | Set delete and add             |       104 k ±58 % |       88.1 k ±86 % |            0.85× |
| has                  |     1,000 | Set has                        |        112 M ±1 % |        86.5 M ±0 % |            0.77× |
| has                  |   100,000 | Set has                        |       45.5 M ±2 % |        40.0 M ±1 % |            0.88× |
| has                  | 1,000,000 | Set has                        |       32.8 M ±1 % |        28.7 M ±2 % |            0.88× |
| iterate              |     1,000 | Set for…of                     |        336 M ±0 % |         285 M ±0 % |            0.85× |
| iterate              |   100,000 | Set for…of                     |        345 M ±1 % |         299 M ±1 % |            0.87× |
| iterate              | 1,000,000 | Set for…of                     |        317 M ±1 % |         158 M ±1 % |            0.50× |
| take the first       |     1,000 | Set values().next() and delete |       17.7 M ±3 % |        12.1 M ±0 % |            0.68× |
| take the first       |   100,000 | Set values().next() and delete |      7.58 M ±12 % |        6.01 M ±8 % |            0.79× |
| take the first       | 1,000,000 | Set values().next() and delete |      3.05 M ±16 % |       2.34 M ±11 % |            0.77× |

### LinkedList

| Operation                           |      Size | Native baseline       | Native per second | Library per second | Library ÷ native |
| ----------------------------------- | --------: | --------------------- | ----------------: | -----------------: | ---------------: |
| add at the end                      |     1,000 | Array push            |        263 M ±2 % |         115 M ±1 % |            0.44× |
| add at the end                      |   100,000 | Array push            |       61.4 M ±2 % |       38.9 M ±51 % |            0.63× |
| add at the end                      | 1,000,000 | Array push            |       49.8 M ±2 % |       9.52 M ±33 % |            0.19× |
| add at the front, take from the end |     1,000 | Array unshift and pop |       10.0 M ±0 % |        54.8 M ±0 % |             5.5× |
| add at the front, take from the end |   100,000 | Array unshift and pop |       54.0 k ±1 % |        37.6 M ±1 % |             695× |
| iterate                             |     1,000 | Array for…of          |       1.00 G ±0 % |         153 M ±1 % |            0.15× |
| iterate                             |   100,000 | Array for…of          |       87.2 M ±2 % |         107 M ±4 % |             1.2× |
| iterate                             | 1,000,000 | Array for…of          |       88.3 M ±3 % |        78.8 M ±1 % |            0.89× |
| take from the front, add at the end |     1,000 | Array shift and push  |       14.3 M ±0 % |        55.3 M ±0 % |             3.9× |
| take from the front, add at the end |   100,000 | Array shift and push  |       53.7 k ±2 % |        39.1 M ±1 % |             728× |

### PriorityQueue

| Operation               |      Size | Native baseline               | Native per second | Library per second | Library ÷ native |
| ----------------------- | --------: | ----------------------------- | ----------------: | -----------------: | ---------------: |
| add one by one          |     1,000 | Array push, then sort         |       6.22 M ±0 % |        28.6 M ±0 % |             4.6× |
| add one by one          |   100,000 | Array push, then sort         |       3.69 M ±2 % |        21.0 M ±1 % |             5.7× |
| add one by one          | 1,000,000 | Array push, then sort         |      2.99 M ±15 % |        16.5 M ±3 % |             5.5× |
| build from an array     |     1,000 | Array copy and sort           |       6.37 M ±1 % |        45.4 M ±1 % |             7.1× |
| build from an array     |   100,000 | Array copy and sort           |       3.81 M ±1 % |        26.8 M ±2 % |             7.0× |
| build from an array     | 1,000,000 | Array copy and sort           |      3.08 M ±13 % |        19.6 M ±8 % |             6.4× |
| take the least, add one |     1,000 | sorted Array shift and insert |       8.55 M ±0 % |        4.96 M ±6 % |            0.58× |
| take the least, add one |   100,000 | sorted Array shift and insert |       52.8 k ±5 % |        2.83 M ±3 % |              54× |

### TreeMap

| Operation                    |      Size | Native baseline        | Native per second | Library per second | Library ÷ native |
| ---------------------------- | --------: | ---------------------- | ----------------: | -----------------: | ---------------: |
| build from entries           |     1,000 | Array copy and sort    |       5.51 M ±0 % |        8.69 M ±4 % |             1.6× |
| build from entries           |   100,000 | Array copy and sort    |       2.57 M ±2 % |       2.39 M ±10 % |            0.93× |
| build from entries           | 1,000,000 | Array copy and sort    |      1.67 M ±20 % |         981 k ±6 % |            0.59× |
| ceiling entry                |     1,000 | sorted Array bisection |       36.4 M ±1 % |        9.13 M ±5 % |            0.25× |
| ceiling entry                |   100,000 | sorted Array bisection |       10.9 M ±1 % |       3.29 M ±10 % |            0.30× |
| ceiling entry                | 1,000,000 | sorted Array bisection |       6.54 M ±3 % |       1.27 M ±10 % |            0.19× |
| delete and set again         |     1,000 | sorted Array splice    |      1.46 M ±16 % |        4.04 M ±0 % |             2.8× |
| delete and set again         |   100,000 | sorted Array splice    |       57.7 k ±7 % |        2.21 M ±3 % |              38× |
| floor entry                  |     1,000 | sorted Array bisection |       43.4 M ±2 % |        10.8 M ±0 % |            0.25× |
| floor entry                  |   100,000 | sorted Array bisection |       10.9 M ±1 % |        2.66 M ±4 % |            0.24× |
| floor entry                  | 1,000,000 | sorted Array bisection |      5.12 M ±11 % |        1.30 M ±4 % |            0.25× |
| get                          |     1,000 | Map get                |        143 M ±0 % |        10.7 M ±0 % |           0.075× |
| get                          |   100,000 | Map get                |       41.0 M ±2 % |        3.15 M ±9 % |           0.077× |
| get                          | 1,000,000 | Map get                |      26.5 M ±14 % |        1.38 M ±7 % |           0.052× |
| iterate                      |     1,000 | sorted Array for…of    |       1.00 G ±0 % |        46.9 M ±2 % |           0.047× |
| iterate                      |   100,000 | sorted Array for…of    |       91.1 M ±1 % |        23.1 M ±3 % |            0.25× |
| iterate                      | 1,000,000 | sorted Array for…of    |       89.0 M ±0 % |       15.6 M ±28 % |            0.17× |
| set new keys in seeded order |     1,000 | sorted Array insert    |       10.4 M ±3 % |        7.98 M ±2 % |            0.77× |
| set new keys in seeded order |   100,000 | sorted Array insert    |        257 k ±0 % |        3.03 M ±4 % |              12× |

### TreeSet

| Operation            |      Size | Native baseline        | Native per second | Library per second | Library ÷ native |
| -------------------- | --------: | ---------------------- | ----------------: | -----------------: | ---------------: |
| add one by one       |     1,000 | sorted Array insert    |      10.2 M ±16 % |        8.11 M ±1 % |            0.80× |
| add one by one       |   100,000 | sorted Array insert    |        256 k ±1 % |       2.50 M ±10 % |             9.7× |
| build from an array  |     1,000 | Array copy and sort    |       6.29 M ±1 % |        9.25 M ±1 % |             1.5× |
| build from an array  |   100,000 | Array copy and sort    |       3.83 M ±1 % |        3.21 M ±2 % |            0.84× |
| build from an array  | 1,000,000 | Array copy and sort    |       3.19 M ±1 % |        1.24 M ±8 % |            0.39× |
| ceiling              |     1,000 | sorted Array bisection |       37.0 M ±4 % |        9.79 M ±1 % |            0.26× |
| ceiling              |   100,000 | sorted Array bisection |       10.8 M ±0 % |       3.75 M ±20 % |            0.35× |
| ceiling              | 1,000,000 | sorted Array bisection |       6.04 M ±2 % |       1.37 M ±10 % |            0.23× |
| delete and add again |     1,000 | sorted Array splice    |       1.43 M ±8 % |        3.73 M ±1 % |             2.6× |
| delete and add again |   100,000 | sorted Array splice    |       58.8 k ±4 % |        2.28 M ±2 % |              39× |
| floor                |     1,000 | sorted Array bisection |      41.1 M ±25 % |        9.09 M ±1 % |            0.22× |
| floor                |   100,000 | sorted Array bisection |       10.9 M ±0 % |       3.03 M ±22 % |            0.28× |
| floor                | 1,000,000 | sorted Array bisection |       6.69 M ±2 % |        1.42 M ±4 % |            0.21× |
| has                  |     1,000 | Set has                |      98.4 M ±24 % |        10.2 M ±2 % |            0.10× |
| has                  |   100,000 | Set has                |       42.3 M ±1 % |        3.38 M ±4 % |           0.080× |
| has                  | 1,000,000 | Set has                |       24.7 M ±4 % |        1.55 M ±3 % |           0.063× |
| iterate              |     1,000 | sorted Array for…of    |        999 M ±1 % |         109 M ±1 % |            0.11× |
| iterate              |   100,000 | sorted Array for…of    |       91.3 M ±1 % |        62.7 M ±5 % |            0.69× |
| iterate              | 1,000,000 | sorted Array for…of    |       85.1 M ±2 % |        25.4 M ±3 % |            0.30× |
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
Run on 2026-11-24 with Node.js v24.11.1 on darwin, Intel(R) Core(TM) i5-8600 CPU @ 3.10GHz (6 cores, 64 GB), version 0.1.1 of the package, each case timed this library first. Compared packages: @datastructures-js/deque 1.0.8, @datastructures-js/linked-list 6.1.4, @datastructures-js/priority-queue 6.4.0, js-sdsl 4.4.2, mnemonist 0.40.8.

![Bar chart of each other library's median operations per second divided by javascript-collections-framework's, at 100,000 elements, on a log scale centred on 1×. Rows where another library's median is higher, 16 of 24: Sorted map insert (js-sdsl 1.3×), Sorted map get (js-sdsl 1.0×), Sorted map delete and insert again (js-sdsl 1.2×), Priority queue build from an array (js-sdsl 1.7×), Priority queue build from an array (mnemonist 2.7×), Priority queue build from an array (@datastructures-js 1.9×), Priority queue push (js-sdsl 1.6×), Priority queue push (mnemonist 1.6×), Priority queue push (@datastructures-js 1.1×), Priority queue poll all (js-sdsl 1.2×), Priority queue poll all (mnemonist 2.9×), Priority queue poll all (@datastructures-js 1.7×), Deque add at the front, take from the end (js-sdsl 2.1×), LRU map set 2n keys, evicting n (mnemonist 1.3×), LRU map get present keys (mnemonist 2.0×), Linked list add at the end (js-sdsl 1.2×).](images/benchmarks.svg)

#### Sorted map

| Operation               |      Size | Library                                    |   Per second | Other ÷ this library |
| ----------------------- | --------: | ------------------------------------------ | -----------: | -------------------: |
| insert                  |     1,000 | javascript-collections-framework `TreeMap` |  8.55 M ±7 % |                   1× |
| insert                  |     1,000 | js-sdsl `OrderedMap`                       |  10.9 M ±6 % |                 1.3× |
| get                     |     1,000 | javascript-collections-framework `TreeMap` |  9.89 M ±4 % |                   1× |
| get                     |     1,000 | js-sdsl `OrderedMap`                       |  14.1 M ±4 % |                 1.4× |
| nearest key at or below |     1,000 | javascript-collections-framework `TreeMap` |  9.73 M ±4 % |                   1× |
| nearest key at or below |     1,000 | js-sdsl `OrderedMap`                       |  3.11 M ±6 % |                0.32× |
| iterate in order        |     1,000 | javascript-collections-framework `TreeMap` |  45.7 M ±3 % |                   1× |
| iterate in order        |     1,000 | js-sdsl `OrderedMap`                       |  20.3 M ±4 % |                0.44× |
| delete and insert again |     1,000 | javascript-collections-framework `TreeMap` |  3.57 M ±3 % |                   1× |
| delete and insert again |     1,000 | js-sdsl `OrderedMap`                       |  4.26 M ±6 % |                 1.2× |
| insert                  |   100,000 | javascript-collections-framework `TreeMap` |  2.69 M ±1 % |                   1× |
| insert                  |   100,000 | js-sdsl `OrderedMap`                       |  3.51 M ±8 % |                 1.3× |
| get                     |   100,000 | javascript-collections-framework `TreeMap` |  2.35 M ±5 % |                   1× |
| get                     |   100,000 | js-sdsl `OrderedMap`                       | 2.36 M ±17 % |                 1.0× |
| nearest key at or below |   100,000 | javascript-collections-framework `TreeMap` |  2.86 M ±4 % |                   1× |
| nearest key at or below |   100,000 | js-sdsl `OrderedMap`                       |  1.49 M ±3 % |                0.52× |
| iterate in order        |   100,000 | javascript-collections-framework `TreeMap` |  26.7 M ±4 % |                   1× |
| iterate in order        |   100,000 | js-sdsl `OrderedMap`                       |  11.7 M ±1 % |                0.44× |
| delete and insert again |   100,000 | javascript-collections-framework `TreeMap` | 1.99 M ±13 % |                   1× |
| delete and insert again |   100,000 | js-sdsl `OrderedMap`                       |  2.39 M ±3 % |                 1.2× |
| insert                  | 1,000,000 | javascript-collections-framework `TreeMap` |  1.11 M ±6 % |                   1× |
| insert                  | 1,000,000 | js-sdsl `OrderedMap`                       |  1.21 M ±2 % |                 1.1× |
| get                     | 1,000,000 | javascript-collections-framework `TreeMap` |  1.24 M ±7 % |                   1× |
| get                     | 1,000,000 | js-sdsl `OrderedMap`                       |  1.36 M ±4 % |                 1.1× |
| nearest key at or below | 1,000,000 | javascript-collections-framework `TreeMap` |  1.08 M ±6 % |                   1× |
| nearest key at or below | 1,000,000 | js-sdsl `OrderedMap`                       |  882 k ±11 % |                0.82× |
| iterate in order        | 1,000,000 | javascript-collections-framework `TreeMap` |  15.5 M ±5 % |                   1× |
| iterate in order        | 1,000,000 | js-sdsl `OrderedMap`                       |  7.89 M ±6 % |                0.51× |
| delete and insert again | 1,000,000 | javascript-collections-framework `TreeMap` | 1.21 M ±10 % |                   1× |
| delete and insert again | 1,000,000 | js-sdsl `OrderedMap`                       | 1.48 M ±15 % |                 1.2× |

No counterpart: mnemonist, @datastructures-js.

#### Priority queue

| Operation           |      Size | Library                                          |  Per second | Other ÷ this library |
| ------------------- | --------: | ------------------------------------------------ | ----------: | -------------------: |
| build from an array |     1,000 | javascript-collections-framework `PriorityQueue` | 31.9 M ±4 % |                   1× |
| build from an array |     1,000 | js-sdsl `PriorityQueue`                          | 53.4 M ±6 % |                 1.7× |
| build from an array |     1,000 | mnemonist `Heap`                                 |  173 M ±3 % |                 5.4× |
| build from an array |     1,000 | @datastructures-js `MinPriorityQueue`            | 76.8 M ±5 % |                 2.4× |
| push                |     1,000 | javascript-collections-framework `PriorityQueue` | 24.7 M ±4 % |                   1× |
| push                |     1,000 | js-sdsl `PriorityQueue`                          | 84.8 M ±3 % |                 3.4× |
| push                |     1,000 | mnemonist `Heap`                                 | 79.1 M ±3 % |                 3.2× |
| push                |     1,000 | @datastructures-js `MinPriorityQueue`            | 32.2 M ±4 % |                 1.3× |
| poll all            |     1,000 | javascript-collections-framework `PriorityQueue` | 4.40 M ±5 % |                   1× |
| poll all            |     1,000 | js-sdsl `PriorityQueue`                          | 5.51 M ±1 % |                 1.3× |
| poll all            |     1,000 | mnemonist `Heap`                                 | 14.1 M ±1 % |                 3.2× |
| poll all            |     1,000 | @datastructures-js `MinPriorityQueue`            | 7.72 M ±5 % |                 1.8× |
| build from an array |   100,000 | javascript-collections-framework `PriorityQueue` | 20.3 M ±3 % |                   1× |
| build from an array |   100,000 | js-sdsl `PriorityQueue`                          | 35.4 M ±3 % |                 1.7× |
| build from an array |   100,000 | mnemonist `Heap`                                 | 55.7 M ±2 % |                 2.7× |
| build from an array |   100,000 | @datastructures-js `MinPriorityQueue`            | 38.1 M ±6 % |                 1.9× |
| push                |   100,000 | javascript-collections-framework `PriorityQueue` | 17.3 M ±1 % |                   1× |
| push                |   100,000 | js-sdsl `PriorityQueue`                          | 27.2 M ±4 % |                 1.6× |
| push                |   100,000 | mnemonist `Heap`                                 | 27.7 M ±2 % |                 1.6× |
| push                |   100,000 | @datastructures-js `MinPriorityQueue`            | 18.7 M ±4 % |                 1.1× |
| poll all            |   100,000 | javascript-collections-framework `PriorityQueue` | 2.59 M ±1 % |                   1× |
| poll all            |   100,000 | js-sdsl `PriorityQueue`                          | 3.03 M ±2 % |                 1.2× |
| poll all            |   100,000 | mnemonist `Heap`                                 | 7.53 M ±4 % |                 2.9× |
| poll all            |   100,000 | @datastructures-js `MinPriorityQueue`            | 4.40 M ±5 % |                 1.7× |
| build from an array | 1,000,000 | javascript-collections-framework `PriorityQueue` | 17.5 M ±6 % |                   1× |
| build from an array | 1,000,000 | js-sdsl `PriorityQueue`                          | 33.9 M ±8 % |                 1.9× |
| build from an array | 1,000,000 | mnemonist `Heap`                                 | 50.6 M ±5 % |                 2.9× |
| build from an array | 1,000,000 | @datastructures-js `MinPriorityQueue`            | 37.7 M ±4 % |                 2.2× |
| push                | 1,000,000 | javascript-collections-framework `PriorityQueue` | 16.3 M ±5 % |                   1× |
| push                | 1,000,000 | js-sdsl `PriorityQueue`                          | 24.6 M ±4 % |                 1.5× |
| push                | 1,000,000 | mnemonist `Heap`                                 | 25.8 M ±4 % |                 1.6× |
| push                | 1,000,000 | @datastructures-js `MinPriorityQueue`            | 17.0 M ±3 % |                 1.0× |
| poll all            | 1,000,000 | javascript-collections-framework `PriorityQueue` | 1.74 M ±6 % |                   1× |
| poll all            | 1,000,000 | js-sdsl `PriorityQueue`                          | 2.06 M ±4 % |                 1.2× |
| poll all            | 1,000,000 | mnemonist `Heap`                                 | 5.54 M ±5 % |                 3.2× |
| poll all            | 1,000,000 | @datastructures-js `MinPriorityQueue`            | 2.85 M ±8 % |                 1.6× |

#### Deque

| Operation                           |      Size | Library                                       |   Per second | Other ÷ this library |
| ----------------------------------- | --------: | --------------------------------------------- | -----------: | -------------------: |
| add at the end, take from the front |     1,000 | javascript-collections-framework `ArrayDeque` |   135 M ±2 % |                   1× |
| add at the end, take from the front |     1,000 | js-sdsl `Deque`                               |   109 M ±1 % |                0.81× |
| add at the end, take from the front |     1,000 | @datastructures-js `Deque`                    |   104 M ±2 % |                0.76× |
| add at the front, take from the end |     1,000 | javascript-collections-framework `ArrayDeque` |  53.2 M ±1 % |                   1× |
| add at the front, take from the end |     1,000 | js-sdsl `Deque`                               |   122 M ±2 % |                 2.3× |
| add at the front, take from the end |     1,000 | @datastructures-js `Deque`                    |   106 M ±2 % |                 2.0× |
| add at the end, take from the front |   100,000 | javascript-collections-framework `ArrayDeque` |   135 M ±1 % |                   1× |
| add at the end, take from the front |   100,000 | js-sdsl `Deque`                               |   112 M ±4 % |                0.83× |
| add at the end, take from the front |   100,000 | @datastructures-js `Deque`                    |  30.4 M ±4 % |                0.23× |
| add at the front, take from the end |   100,000 | javascript-collections-framework `ArrayDeque` |  53.1 M ±2 % |                   1× |
| add at the front, take from the end |   100,000 | js-sdsl `Deque`                               |   111 M ±4 % |                 2.1× |
| add at the front, take from the end |   100,000 | @datastructures-js `Deque`                    |  31.0 M ±5 % |                0.58× |
| add at the end, take from the front | 1,000,000 | javascript-collections-framework `ArrayDeque` |   131 M ±7 % |                   1× |
| add at the end, take from the front | 1,000,000 | js-sdsl `Deque`                               |   113 M ±4 % |                0.87× |
| add at the end, take from the front | 1,000,000 | @datastructures-js `Deque`                    |  29.5 M ±8 % |                0.23× |
| add at the front, take from the end | 1,000,000 | javascript-collections-framework `ArrayDeque` |  54.8 M ±2 % |                   1× |
| add at the front, take from the end | 1,000,000 | js-sdsl `Deque`                               |   111 M ±2 % |                 2.0× |
| add at the front, take from the end | 1,000,000 | @datastructures-js `Deque`                    | 30.9 M ±16 % |                0.56× |

No counterpart: mnemonist.

#### LRU map

| Operation               |      Size | Library                                          |   Per second | Other ÷ this library |
| ----------------------- | --------: | ------------------------------------------------ | -----------: | -------------------: |
| set 2n keys, evicting n |     1,000 | javascript-collections-framework `LinkedHashMap` |  12.0 M ±1 % |                   1× |
| set 2n keys, evicting n |     1,000 | mnemonist `LRUMap`                               |  15.8 M ±2 % |                 1.3× |
| get present keys        |     1,000 | javascript-collections-framework `LinkedHashMap` |  18.7 M ±1 % |                   1× |
| get present keys        |     1,000 | mnemonist `LRUMap`                               |  47.5 M ±1 % |                 2.5× |
| set 2n keys, evicting n |   100,000 | javascript-collections-framework `LinkedHashMap` |  4.36 M ±2 % |                   1× |
| set 2n keys, evicting n |   100,000 | mnemonist `LRUMap`                               |  5.66 M ±7 % |                 1.3× |
| get present keys        |   100,000 | javascript-collections-framework `LinkedHashMap` |  10.6 M ±5 % |                   1× |
| get present keys        |   100,000 | mnemonist `LRUMap`                               |  20.6 M ±3 % |                 2.0× |
| set 2n keys, evicting n | 1,000,000 | javascript-collections-framework `LinkedHashMap` |  2.06 M ±6 % |                   1× |
| set 2n keys, evicting n | 1,000,000 | mnemonist `LRUMap`                               |  2.84 M ±9 % |                 1.4× |
| get present keys        | 1,000,000 | javascript-collections-framework `LinkedHashMap` | 4.80 M ±23 % |                   1× |
| get present keys        | 1,000,000 | mnemonist `LRUMap`                               | 2.67 M ±32 % |                0.56× |

No counterpart: js-sdsl, @datastructures-js.

#### Linked list

| Operation                           |      Size | Library                                       |    Per second | Other ÷ this library |
| ----------------------------------- | --------: | --------------------------------------------- | ------------: | -------------------: |
| add at the end                      |     1,000 | javascript-collections-framework `LinkedList` |   99.7 M ±1 % |                   1× |
| add at the end                      |     1,000 | js-sdsl `LinkList`                            |    136 M ±3 % |                 1.4× |
| add at the end                      |     1,000 | @datastructures-js `DoublyLinkedList`         |   64.6 M ±2 % |                0.65× |
| add at the end, take from the front |     1,000 | javascript-collections-framework `LinkedList` |   39.8 M ±1 % |                   1× |
| add at the end, take from the front |     1,000 | js-sdsl `LinkList`                            |   34.8 M ±2 % |                0.87× |
| add at the end, take from the front |     1,000 | @datastructures-js `DoublyLinkedList`         |   31.9 M ±3 % |                0.80× |
| add at the end                      |   100,000 | javascript-collections-framework `LinkedList` |   88.2 M ±1 % |                   1× |
| add at the end                      |   100,000 | js-sdsl `LinkList`                            |    102 M ±7 % |                 1.2× |
| add at the end                      |   100,000 | @datastructures-js `DoublyLinkedList`         |   55.5 M ±2 % |                0.63× |
| add at the end, take from the front |   100,000 | javascript-collections-framework `LinkedList` |   36.6 M ±8 % |                   1× |
| add at the end, take from the front |   100,000 | js-sdsl `LinkList`                            |   32.3 M ±3 % |                0.88× |
| add at the end, take from the front |   100,000 | @datastructures-js `DoublyLinkedList`         |   29.2 M ±2 % |                0.80× |
| add at the end                      | 1,000,000 | javascript-collections-framework `LinkedList` |   84.8 M ±3 % |                   1× |
| add at the end                      | 1,000,000 | js-sdsl `LinkList`                            |   48.2 M ±5 % |                0.57× |
| add at the end                      | 1,000,000 | @datastructures-js `DoublyLinkedList`         |   35.9 M ±3 % |                0.42× |
| add at the end, take from the front | 1,000,000 | javascript-collections-framework `LinkedList` |  10.8 M ±23 % |                   1× |
| add at the end, take from the front | 1,000,000 | js-sdsl `LinkList`                            | 10.4 M ±120 % |             unstable |
| add at the end, take from the front | 1,000,000 | @datastructures-js `DoublyLinkedList`         |  14.5 M ±21 % |                 1.3× |

No counterpart: mnemonist.

Another library has a higher median in:

- Sorted map, insert, 1,000 (js-sdsl `OrderedMap` 1.3×)
- Sorted map, get, 1,000 (js-sdsl `OrderedMap` 1.4×)
- Sorted map, delete and insert again, 1,000 (js-sdsl `OrderedMap` 1.2×)
- Priority queue, build from an array, 1,000 (js-sdsl `PriorityQueue` 1.7×)
- Priority queue, build from an array, 1,000 (mnemonist `Heap` 5.4×)
- Priority queue, build from an array, 1,000 (@datastructures-js `MinPriorityQueue` 2.4×)
- Priority queue, push, 1,000 (js-sdsl `PriorityQueue` 3.4×)
- Priority queue, push, 1,000 (mnemonist `Heap` 3.2×)
- Priority queue, push, 1,000 (@datastructures-js `MinPriorityQueue` 1.3×)
- Priority queue, poll all, 1,000 (js-sdsl `PriorityQueue` 1.3×)
- Priority queue, poll all, 1,000 (mnemonist `Heap` 3.2×)
- Priority queue, poll all, 1,000 (@datastructures-js `MinPriorityQueue` 1.8×)
- Deque, add at the front, take from the end, 1,000 (js-sdsl `Deque` 2.3×)
- Deque, add at the front, take from the end, 1,000 (@datastructures-js `Deque` 2.0×)
- LRU map, set 2n keys, evicting n, 1,000 (mnemonist `LRUMap` 1.3×)
- LRU map, get present keys, 1,000 (mnemonist `LRUMap` 2.5×)
- Linked list, add at the end, 1,000 (js-sdsl `LinkList` 1.4×)
- Sorted map, insert, 100,000 (js-sdsl `OrderedMap` 1.3×)
- Sorted map, get, 100,000 (js-sdsl `OrderedMap` 1.0×) (within spread)
- Sorted map, delete and insert again, 100,000 (js-sdsl `OrderedMap` 1.2×)
- Priority queue, build from an array, 100,000 (js-sdsl `PriorityQueue` 1.7×)
- Priority queue, build from an array, 100,000 (mnemonist `Heap` 2.7×)
- Priority queue, build from an array, 100,000 (@datastructures-js `MinPriorityQueue` 1.9×)
- Priority queue, push, 100,000 (js-sdsl `PriorityQueue` 1.6×)
- Priority queue, push, 100,000 (mnemonist `Heap` 1.6×)
- Priority queue, push, 100,000 (@datastructures-js `MinPriorityQueue` 1.1×)
- Priority queue, poll all, 100,000 (js-sdsl `PriorityQueue` 1.2×)
- Priority queue, poll all, 100,000 (mnemonist `Heap` 2.9×)
- Priority queue, poll all, 100,000 (@datastructures-js `MinPriorityQueue` 1.7×)
- Deque, add at the front, take from the end, 100,000 (js-sdsl `Deque` 2.1×)
- LRU map, set 2n keys, evicting n, 100,000 (mnemonist `LRUMap` 1.3×)
- LRU map, get present keys, 100,000 (mnemonist `LRUMap` 2.0×)
- Linked list, add at the end, 100,000 (js-sdsl `LinkList` 1.2×)
- Sorted map, insert, 1,000,000 (js-sdsl `OrderedMap` 1.1×)
- Sorted map, get, 1,000,000 (js-sdsl `OrderedMap` 1.1×) (within spread)
- Sorted map, delete and insert again, 1,000,000 (js-sdsl `OrderedMap` 1.2×) (within spread)
- Priority queue, build from an array, 1,000,000 (js-sdsl `PriorityQueue` 1.9×)
- Priority queue, build from an array, 1,000,000 (mnemonist `Heap` 2.9×)
- Priority queue, build from an array, 1,000,000 (@datastructures-js `MinPriorityQueue` 2.2×)
- Priority queue, push, 1,000,000 (js-sdsl `PriorityQueue` 1.5×)
- Priority queue, push, 1,000,000 (mnemonist `Heap` 1.6×)
- Priority queue, push, 1,000,000 (@datastructures-js `MinPriorityQueue` 1.0×) (within spread)
- Priority queue, poll all, 1,000,000 (js-sdsl `PriorityQueue` 1.2×)
- Priority queue, poll all, 1,000,000 (mnemonist `Heap` 3.2×)
- Priority queue, poll all, 1,000,000 (@datastructures-js `MinPriorityQueue` 1.6×)
- Deque, add at the front, take from the end, 1,000,000 (js-sdsl `Deque` 2.0×)
- LRU map, set 2n keys, evicting n, 1,000,000 (mnemonist `LRUMap` 1.4×)
- Linked list, add at the end, take from the front, 1,000,000 (@datastructures-js `DoublyLinkedList` 1.3×) (within spread)
<!-- compare:end -->

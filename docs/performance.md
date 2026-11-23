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
| Whole package                     |           161112 |           35095 |                   37120 |
| `ArrayDeque`                      |            17430 |            5179 |                    5568 |
| `ArrayList`                       |            23582 |            6833 |                    7424 |
| `ClassCastError`                  |              663 |             400 |                     448 |
| `ConcurrentModificationError`     |              698 |             408 |                     512 |
| `HashMap`                         |            32481 |            8980 |                    9344 |
| `HashSet`                         |            21314 |            6592 |                    7104 |
| `IllegalArgumentError`            |              682 |             408 |                     512 |
| `IllegalStateError`               |              668 |             399 |                     448 |
| `IndexOutOfBoundsError`           |              685 |             410 |                     512 |
| `LinkedHashMap`                   |            42347 |           11202 |                   11904 |
| `LinkedHashSet`                   |            26113 |            7909 |                    8384 |
| `LinkedList`                      |            18295 |            5391 |                    5824 |
| `NoSuchElementError`              |              671 |             402 |                     448 |
| `NullElementError`                |              669 |             401 |                     448 |
| `PriorityQueue`                   |            17912 |            5556 |                    5952 |
| `TreeMap`                         |            47836 |           12186 |                   13248 |
| `TreeSet`                         |            31421 |            8711 |                    9472 |
| `UnsupportedOperationError`       |              696 |             409 |                     512 |
| `asList`                          |            22576 |            6696 |                    7296 |
| `binarySearch`                    |             4029 |            1507 |                    1664 |
| `compareSymbol`                   |               90 |             101 |                     128 |
| `comparing`                       |             3097 |            1230 |                    1344 |
| `copyOfList`                      |            27652 |            7711 |                    8384 |
| `copyOfMap`                       |            39201 |           10198 |                   10688 |
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
| `mapOf`                           |            38927 |           10116 |                   10624 |
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
| add at the end                      |     1,000 | Array push            |        275 M ±1 % |         101 M ±1 % |            0.37× |
| add at the end                      |   100,000 | Array push            |       64.0 M ±3 % |        54.2 M ±1 % |            0.85× |
| add at the end                      | 1,000,000 | Array push            |       49.7 M ±1 % |       60.5 M ±11 % |             1.2× |
| add at the front, take from the end |     1,000 | Array unshift and pop |       9.91 M ±1 % |        69.2 M ±1 % |             7.0× |
| add at the front, take from the end |   100,000 | Array unshift and pop |       54.4 k ±2 % |        66.8 M ±1 % |           1,229× |
| iterate                             |     1,000 | Array for…of          |       1.00 G ±0 % |         156 M ±1 % |            0.16× |
| iterate                             |   100,000 | Array for…of          |       92.3 M ±1 % |         147 M ±1 % |             1.6× |
| iterate                             | 1,000,000 | Array for…of          |       90.4 M ±0 % |         141 M ±1 % |             1.6× |
| take from the front, add at the end |     1,000 | Array shift and push  |       14.3 M ±1 % |         104 M ±7 % |             7.3× |
| take from the front, add at the end |   100,000 | Array shift and push  |       54.2 k ±1 % |        96.3 M ±1 % |           1,776× |

### ArrayList

| Operation              |      Size | Native baseline      | Native per second | Library per second | Library ÷ native |
| ---------------------- | --------: | -------------------- | ----------------: | -----------------: | ---------------: |
| add at the end         |     1,000 | Array push           |        285 M ±5 % |         237 M ±3 % |            0.83× |
| add at the end         |   100,000 | Array push           |       64.1 M ±3 % |        60.1 M ±3 % |            0.94× |
| add at the end         | 1,000,000 | Array push           |      50.9 M ±22 % |        50.1 M ±2 % |            0.98× |
| build from an array    |     1,000 | Array.from           |       2.45 G ±5 % |        2.18 G ±6 % |            0.89× |
| build from an array    |   100,000 | Array.from           |        231 M ±1 % |         213 M ±3 % |            0.92× |
| build from an array    | 1,000,000 | Array.from           |        228 M ±0 % |         240 M ±7 % |             1.1× |
| get by index           |     1,000 | Array index          |        770 M ±0 % |         386 M ±2 % |            0.50× |
| get by index           |   100,000 | Array index          |        525 M ±2 % |         263 M ±1 % |            0.50× |
| get by index           | 1,000,000 | Array index          |        391 M ±1 % |         233 M ±1 % |            0.60× |
| iterate                |     1,000 | Array for…of         |       1.01 G ±1 % |         200 M ±2 % |            0.20× |
| iterate                |   100,000 | Array for…of         |       92.2 M ±0 % |         208 M ±1 % |             2.3× |
| iterate                | 1,000,000 | Array for…of         |       91.3 M ±0 % |         200 M ±1 % |             2.2× |
| remove first, add last |     1,000 | Array shift and push |       14.2 M ±0 % |        2.05 M ±0 % |            0.14× |
| remove first, add last |   100,000 | Array shift and push |       54.3 k ±1 % |        22.4 k ±1 % |            0.41× |

### HashMap

| Operation                        |      Size | Native baseline    | Native per second | Library per second | Library ÷ native |
| -------------------------------- | --------: | ------------------ | ----------------: | -----------------: | ---------------: |
| build from entries               |     1,000 | new Map            |       29.0 M ±8 % |        23.5 M ±1 % |            0.81× |
| build from entries               |   100,000 | new Map            |       11.1 M ±2 % |        7.81 M ±3 % |            0.70× |
| build from entries               | 1,000,000 | new Map            |       7.28 M ±6 % |       3.33 M ±14 % |            0.46× |
| delete and set again             |     1,000 | Map delete and set |       22.4 M ±1 % |        19.5 M ±1 % |            0.87× |
| delete and set again             |   100,000 | Map delete and set |      1.27 M ±18 % |       1.54 M ±15 % |             1.2× |
| delete and set again             | 1,000,000 | Map delete and set |      86.0 k ±77 % |       88.0 k ±74 % |             1.0× |
| get                              |     1,000 | Map get            |       99.9 M ±0 % |        75.8 M ±1 % |            0.76× |
| get                              |   100,000 | Map get            |       43.8 M ±1 % |        33.0 M ±1 % |            0.75× |
| get                              | 1,000,000 | Map get            |       30.1 M ±2 % |        22.2 M ±6 % |            0.74× |
| get by value with the key option |     1,000 | Map get by id      |        131 M ±0 % |        44.3 M ±0 % |            0.34× |
| get by value with the key option |   100,000 | Map get by id      |       42.9 M ±1 % |        23.1 M ±3 % |            0.54× |
| get by value with the key option | 1,000,000 | Map get by id      |       29.8 M ±1 % |        11.9 M ±5 % |            0.40× |
| has                              |     1,000 | Map has            |       94.7 M ±3 % |        66.9 M ±1 % |            0.71× |
| has                              |   100,000 | Map has            |       44.2 M ±1 % |        36.7 M ±1 % |            0.83× |
| has                              | 1,000,000 | Map has            |      29.7 M ±14 % |        26.5 M ±6 % |            0.89× |
| iterate                          |     1,000 | Map for…of         |        138 M ±1 % |         142 M ±1 % |             1.0× |
| iterate                          |   100,000 | Map for…of         |        146 M ±7 % |         146 M ±2 % |             1.0× |
| iterate                          | 1,000,000 | Map for…of         |        135 M ±3 % |         135 M ±2 % |             1.0× |
| set an existing key              |     1,000 | Map set            |       69.9 M ±3 % |        54.0 M ±0 % |            0.77× |
| set an existing key              |   100,000 | Map set            |       47.8 M ±1 % |        34.9 M ±2 % |            0.73× |
| set an existing key              | 1,000,000 | Map set            |       24.6 M ±1 % |        21.0 M ±1 % |            0.86× |
| set new keys one by one          |     1,000 | Map set            |       38.6 M ±1 % |       31.7 M ±16 % |            0.82× |
| set new keys one by one          |   100,000 | Map set            |       12.5 M ±3 % |        9.87 M ±6 % |            0.79× |
| set new keys one by one          | 1,000,000 | Map set            |       7.87 M ±7 % |       5.00 M ±25 % |            0.64× |

### HashSet

| Operation            |      Size | Native baseline    | Native per second | Library per second | Library ÷ native |
| -------------------- | --------: | ------------------ | ----------------: | -----------------: | ---------------: |
| add one by one       |     1,000 | Set add            |       40.6 M ±0 % |        33.2 M ±1 % |            0.82× |
| add one by one       |   100,000 | Set add            |       15.2 M ±2 % |        13.7 M ±2 % |            0.90× |
| add one by one       | 1,000,000 | Set add            |      9.92 M ±26 % |        9.06 M ±2 % |            0.91× |
| build from an array  |     1,000 | new Set            |       37.5 M ±0 % |        33.1 M ±0 % |            0.88× |
| build from an array  |   100,000 | new Set            |       15.1 M ±4 % |        13.9 M ±3 % |            0.92× |
| build from an array  | 1,000,000 | new Set            |       9.40 M ±6 % |        8.74 M ±4 % |            0.93× |
| delete and add again |     1,000 | Set delete and add |       24.1 M ±1 % |        20.0 M ±1 % |            0.83× |
| delete and add again |   100,000 | Set delete and add |      1.82 M ±17 % |       1.78 M ±18 % |            0.98× |
| delete and add again | 1,000,000 | Set delete and add |       108 k ±74 % |        103 k ±73 % |            0.96× |
| has                  |     1,000 | Set has            |        110 M ±1 % |        73.0 M ±1 % |            0.66× |
| has                  |   100,000 | Set has            |       46.4 M ±1 % |        38.2 M ±1 % |            0.82× |
| has                  | 1,000,000 | Set has            |       33.1 M ±2 % |        27.7 M ±2 % |            0.84× |
| iterate              |     1,000 | Set for…of         |        336 M ±0 % |         351 M ±0 % |             1.0× |
| iterate              |   100,000 | Set for…of         |        351 M ±1 % |         368 M ±1 % |             1.0× |
| iterate              | 1,000,000 | Set for…of         |        318 M ±7 % |         332 M ±0 % |             1.0× |

### LinkedHashMap

| Operation                 |      Size | Native baseline         | Native per second | Library per second | Library ÷ native |
| ------------------------- | --------: | ----------------------- | ----------------: | -----------------: | ---------------: |
| build from entries        |     1,000 | new Map                 |       28.7 M ±1 % |        17.1 M ±3 % |            0.60× |
| build from entries        |   100,000 | new Map                 |      10.9 M ±14 % |       6.64 M ±12 % |            0.61× |
| build from entries        | 1,000,000 | new Map                 |       7.32 M ±1 % |       2.81 M ±18 % |            0.38× |
| delete and set again      |     1,000 | Map delete and set      |       22.3 M ±1 % |        9.84 M ±1 % |            0.44× |
| delete and set again      |   100,000 | Map delete and set      |      1.55 M ±16 % |        850 k ±20 % |            0.55× |
| delete and set again      | 1,000,000 | Map delete and set      |      89.2 k ±95 % |        141 k ±73 % |             1.6× |
| get                       |     1,000 | Map get                 |       95.6 M ±0 % |        54.7 M ±1 % |            0.57× |
| get                       |   100,000 | Map get                 |       43.7 M ±1 % |        25.2 M ±2 % |            0.58× |
| get                       | 1,000,000 | Map get                 |       30.3 M ±4 % |       16.1 M ±22 % |            0.53× |
| get in access order (LRU) |     1,000 | Map get, delete and set |       20.3 M ±1 % |        19.4 M ±0 % |            0.96× |
| get in access order (LRU) |   100,000 | Map get, delete and set |       8.53 M ±6 % |       12.0 M ±10 % |             1.4× |
| get in access order (LRU) | 1,000,000 | Map get, delete and set |       869 k ±84 % |       7.09 M ±17 % |             8.2× |
| iterate                   |     1,000 | Map for…of              |        136 M ±3 % |        73.5 M ±3 % |            0.54× |
| iterate                   |   100,000 | Map for…of              |        146 M ±3 % |        64.7 M ±2 % |            0.44× |
| iterate                   | 1,000,000 | Map for…of              |        130 M ±2 % |        62.9 M ±4 % |            0.48× |
| set an existing key       |     1,000 | Map set                 |       69.8 M ±0 % |        40.1 M ±1 % |            0.58× |
| set an existing key       |   100,000 | Map set                 |       47.0 M ±3 % |        24.2 M ±1 % |            0.51× |
| set an existing key       | 1,000,000 | Map set                 |       24.5 M ±1 % |        12.8 M ±1 % |            0.52× |
| set new keys one by one   |     1,000 | Map set                 |       38.4 M ±1 % |        22.5 M ±1 % |            0.59× |
| set new keys one by one   |   100,000 | Map set                 |       12.5 M ±2 % |       7.64 M ±14 % |            0.61× |
| set new keys one by one   | 1,000,000 | Map set                 |       8.33 M ±5 % |        3.55 M ±7 % |            0.43× |

### LinkedHashSet

| Operation            |      Size | Native baseline    | Native per second | Library per second | Library ÷ native |
| -------------------- | --------: | ------------------ | ----------------: | -----------------: | ---------------: |
| add one by one       |     1,000 | Set add            |       39.7 M ±1 % |        23.1 M ±0 % |            0.58× |
| add one by one       |   100,000 | Set add            |       15.1 M ±2 % |        8.85 M ±7 % |            0.58× |
| add one by one       | 1,000,000 | Set add            |       9.26 M ±8 % |        3.79 M ±9 % |            0.41× |
| build from an array  |     1,000 | new Set            |       37.5 M ±0 % |        23.2 M ±1 % |            0.62× |
| build from an array  |   100,000 | new Set            |       14.9 M ±2 % |        8.55 M ±7 % |            0.57× |
| build from an array  | 1,000,000 | new Set            |      9.42 M ±24 % |       3.44 M ±19 % |            0.37× |
| delete and add again |     1,000 | Set delete and add |       24.1 M ±0 % |        12.0 M ±1 % |            0.50× |
| delete and add again |   100,000 | Set delete and add |      1.69 M ±12 % |        846 k ±19 % |            0.50× |
| delete and add again | 1,000,000 | Set delete and add |       108 k ±68 % |        154 k ±71 % |             1.4× |
| has                  |     1,000 | Set has            |        107 M ±1 % |        59.3 M ±1 % |            0.55× |
| has                  |   100,000 | Set has            |       46.3 M ±1 % |        35.4 M ±2 % |            0.77× |
| has                  | 1,000,000 | Set has            |       33.0 M ±2 % |        25.1 M ±2 % |            0.76× |
| iterate              |     1,000 | Set for…of         |        336 M ±0 % |         124 M ±0 % |            0.37× |
| iterate              |   100,000 | Set for…of         |        350 M ±1 % |        77.7 M ±1 % |            0.22× |
| iterate              | 1,000,000 | Set for…of         |        323 M ±0 % |        75.0 M ±1 % |            0.23× |

### LinkedList

| Operation                           |      Size | Native baseline       | Native per second | Library per second | Library ÷ native |
| ----------------------------------- | --------: | --------------------- | ----------------: | -----------------: | ---------------: |
| add at the end                      |     1,000 | Array push            |        281 M ±3 % |        102 M ±10 % |            0.36× |
| add at the end                      |   100,000 | Array push            |       63.6 M ±3 % |        79.7 M ±2 % |             1.3× |
| add at the end                      | 1,000,000 | Array push            |       50.6 M ±2 % |        77.4 M ±1 % |             1.5× |
| add at the front, take from the end |     1,000 | Array unshift and pop |      9.99 M ±18 % |        53.8 M ±1 % |             5.4× |
| add at the front, take from the end |   100,000 | Array unshift and pop |       54.0 k ±1 % |        37.6 M ±1 % |             696× |
| iterate                             |     1,000 | Array for…of          |        996 M ±4 % |         161 M ±2 % |            0.16× |
| iterate                             |   100,000 | Array for…of          |       92.4 M ±0 % |         122 M ±2 % |             1.3× |
| iterate                             | 1,000,000 | Array for…of          |       86.8 M ±3 % |        80.8 M ±1 % |            0.93× |
| take from the front, add at the end |     1,000 | Array shift and push  |       13.9 M ±9 % |        55.3 M ±1 % |             4.0× |
| take from the front, add at the end |   100,000 | Array shift and push  |       54.8 k ±1 % |        39.2 M ±1 % |             716× |

### PriorityQueue

| Operation               |      Size | Native baseline               | Native per second | Library per second | Library ÷ native |
| ----------------------- | --------: | ----------------------------- | ----------------: | -----------------: | ---------------: |
| add one by one          |     1,000 | Array push, then sort         |       6.27 M ±0 % |        28.7 M ±0 % |             4.6× |
| add one by one          |   100,000 | Array push, then sort         |       3.72 M ±2 % |        21.1 M ±1 % |             5.7× |
| add one by one          | 1,000,000 | Array push, then sort         |      2.99 M ±15 % |        17.4 M ±8 % |             5.8× |
| build from an array     |     1,000 | Array copy and sort           |       6.32 M ±0 % |        45.8 M ±1 % |             7.3× |
| build from an array     |   100,000 | Array copy and sort           |       3.96 M ±1 % |        27.9 M ±2 % |             7.0× |
| build from an array     | 1,000,000 | Array copy and sort           |       3.24 M ±1 % |        23.2 M ±1 % |             7.2× |
| take the least, add one |     1,000 | sorted Array shift and insert |       8.38 M ±0 % |        4.80 M ±8 % |            0.57× |
| take the least, add one |   100,000 | sorted Array shift and insert |       54.4 k ±1 % |        2.94 M ±0 % |              54× |

### TreeMap

| Operation                    |      Size | Native baseline        | Native per second | Library per second | Library ÷ native |
| ---------------------------- | --------: | ---------------------- | ----------------: | -----------------: | ---------------: |
| build from entries           |     1,000 | Array copy and sort    |       5.37 M ±3 % |        8.72 M ±0 % |             1.6× |
| build from entries           |   100,000 | Array copy and sort    |       2.69 M ±4 % |        2.76 M ±7 % |             1.0× |
| build from entries           | 1,000,000 | Array copy and sort    |       1.75 M ±4 % |        1.18 M ±3 % |            0.67× |
| ceiling entry                |     1,000 | sorted Array bisection |       39.6 M ±1 % |        9.38 M ±1 % |            0.24× |
| ceiling entry                |   100,000 | sorted Array bisection |       10.9 M ±0 % |        3.95 M ±6 % |            0.36× |
| ceiling entry                | 1,000,000 | sorted Array bisection |       6.87 M ±2 % |       1.34 M ±35 % |            0.19× |
| delete and set again         |     1,000 | sorted Array splice    |       1.46 M ±5 % |        4.02 M ±1 % |             2.8× |
| delete and set again         |   100,000 | sorted Array splice    |       55.8 k ±5 % |        2.30 M ±1 % |              41× |
| floor entry                  |     1,000 | sorted Array bisection |       42.5 M ±1 % |        10.8 M ±0 % |            0.26× |
| floor entry                  |   100,000 | sorted Array bisection |       11.1 M ±1 % |        3.87 M ±5 % |            0.35× |
| floor entry                  | 1,000,000 | sorted Array bisection |       7.02 M ±1 % |        1.55 M ±3 % |            0.22× |
| get                          |     1,000 | Map get                |        132 M ±2 % |        10.5 M ±0 % |           0.080× |
| get                          |   100,000 | Map get                |       41.8 M ±2 % |       3.80 M ±10 % |           0.091× |
| get                          | 1,000,000 | Map get                |       30.4 M ±2 % |       1.75 M ±10 % |           0.058× |
| iterate                      |     1,000 | sorted Array for…of    |       1.01 G ±1 % |        53.7 M ±1 % |           0.053× |
| iterate                      |   100,000 | sorted Array for…of    |       92.2 M ±0 % |        32.5 M ±2 % |            0.35× |
| iterate                      | 1,000,000 | sorted Array for…of    |       90.5 M ±0 % |        17.2 M ±3 % |            0.19× |
| set new keys in seeded order |     1,000 | sorted Array insert    |       10.6 M ±0 % |        8.05 M ±1 % |            0.76× |
| set new keys in seeded order |   100,000 | sorted Array insert    |        256 k ±1 % |       3.39 M ±13 % |              13× |

### TreeSet

| Operation            |      Size | Native baseline        | Native per second | Library per second | Library ÷ native |
| -------------------- | --------: | ---------------------- | ----------------: | -----------------: | ---------------: |
| add one by one       |     1,000 | sorted Array insert    |       10.6 M ±0 % |        8.15 M ±1 % |            0.77× |
| add one by one       |   100,000 | sorted Array insert    |        255 k ±1 % |       3.03 M ±10 % |              12× |
| build from an array  |     1,000 | Array copy and sort    |       6.32 M ±1 % |        9.36 M ±0 % |             1.5× |
| build from an array  |   100,000 | Array copy and sort    |       3.95 M ±1 % |        3.57 M ±4 % |            0.90× |
| build from an array  | 1,000,000 | Array copy and sort    |       3.18 M ±2 % |        1.44 M ±1 % |            0.45× |
| ceiling              |     1,000 | sorted Array bisection |       38.1 M ±1 % |        9.97 M ±1 % |            0.26× |
| ceiling              |   100,000 | sorted Array bisection |       10.9 M ±1 % |       3.58 M ±14 % |            0.33× |
| ceiling              | 1,000,000 | sorted Array bisection |       6.84 M ±2 % |       1.20 M ±19 % |            0.18× |
| delete and add again |     1,000 | sorted Array splice    |       1.46 M ±1 % |        3.77 M ±1 % |             2.6× |
| delete and add again |   100,000 | sorted Array splice    |       19.4 k ±1 % |        2.37 M ±4 % |             123× |
| floor                |     1,000 | sorted Array bisection |       42.2 M ±3 % |       9.16 M ±16 % |            0.22× |
| floor                |   100,000 | sorted Array bisection |       11.0 M ±0 % |        4.03 M ±5 % |            0.37× |
| floor                | 1,000,000 | sorted Array bisection |       6.89 M ±2 % |        1.50 M ±6 % |            0.22× |
| has                  |     1,000 | Set has                |        101 M ±1 % |        10.7 M ±1 % |            0.11× |
| has                  |   100,000 | Set has                |       42.8 M ±1 % |       3.47 M ±13 % |           0.081× |
| has                  | 1,000,000 | Set has                |       31.5 M ±5 % |        1.99 M ±6 % |           0.063× |
| iterate              |     1,000 | sorted Array for…of    |       1.01 G ±0 % |         108 M ±2 % |            0.11× |
| iterate              |   100,000 | sorted Array for…of    |       92.2 M ±0 % |        46.4 M ±3 % |            0.50× |
| iterate              | 1,000,000 | sorted Array for…of    |       89.2 M ±1 % |        27.0 M ±1 % |            0.30× |
<!-- bench:end -->

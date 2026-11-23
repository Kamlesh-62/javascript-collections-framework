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
| Whole package                     |           158238 |           34535 |                   37120 |
| `ArrayDeque`                      |            17051 |            5087 |                    5568 |
| `ArrayList`                       |            23492 |            6811 |                    7424 |
| `ClassCastError`                  |              663 |             400 |                     448 |
| `ConcurrentModificationError`     |              698 |             408 |                     512 |
| `HashMap`                         |            31838 |            8833 |                    9344 |
| `HashSet`                         |            21137 |            6534 |                    7104 |
| `IllegalArgumentError`            |              682 |             408 |                     512 |
| `IllegalStateError`               |              668 |             399 |                     448 |
| `IndexOutOfBoundsError`           |              685 |             410 |                     512 |
| `LinkedHashMap`                   |            41210 |           11018 |                   11904 |
| `LinkedHashSet`                   |            25529 |            7778 |                    8384 |
| `LinkedList`                      |            18060 |            5325 |                    5824 |
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
| `copyOfList`                      |            27562 |            7689 |                    8384 |
| `copyOfMap`                       |            38558 |           10055 |                   10688 |
| `copyOfSet`                       |            23787 |            7167 |                    7808 |
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
| `listOf`                          |            27412 |            7643 |                    8384 |
| `mapOf`                           |            38284 |            9973 |                   10624 |
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
| `setOf`                           |            23473 |            7077 |                    7744 |
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

The figures are indicative: they vary with the machine, the runtime and its version. Compare the
rows of one run with each other, not with a run elsewhere. Run them with `pnpm build && pnpm bench`;
`pnpm bench:docs` writes the newest run below.

<!-- bench:start -->
Run on 2026-11-21 with Node.js v24.11.1 on darwin, Intel(R) Core(TM) i5-8600 CPU @ 3.10GHz (6 cores, 64 GB), version 0.1.1 of the package.

### ArrayDeque

| Operation                           |      Size | Native baseline       | Native per second | Library per second | Library ÷ native |
| ----------------------------------- | --------: | --------------------- | ----------------: | -----------------: | ---------------: |
| add at the end                      |     1,000 | Array push            |        261 M ±4 % |        48.2 M ±1 % |            0.18× |
| add at the end                      |   100,000 | Array push            |       63.5 M ±5 % |        18.1 M ±5 % |            0.28× |
| add at the end                      | 1,000,000 | Array push            |       48.1 M ±1 % |        18.3 M ±2 % |            0.38× |
| add at the front, take from the end |     1,000 | Array unshift and pop |       9.44 M ±1 % |        56.2 M ±1 % |             6.0× |
| add at the front, take from the end |   100,000 | Array unshift and pop |       49.4 k ±4 % |        55.9 M ±4 % |           1,132× |
| iterate                             |     1,000 | Array for…of          |       86.0 M ±2 % |        83.7 M ±2 % |            0.97× |
| iterate                             |   100,000 | Array for…of          |       70.4 M ±3 % |        64.1 M ±2 % |            0.91× |
| iterate                             | 1,000,000 | Array for…of          |       67.7 M ±4 % |        61.2 M ±4 % |            0.91× |
| take from the front, add at the end |     1,000 | Array shift and push  |       13.6 M ±1 % |        69.5 M ±3 % |             5.1× |
| take from the front, add at the end |   100,000 | Array shift and push  |       49.9 k ±3 % |        62.0 M ±8 % |           1,242× |

### ArrayList

| Operation              |      Size | Native baseline      | Native per second | Library per second | Library ÷ native |
| ---------------------- | --------: | -------------------- | ----------------: | -----------------: | ---------------: |
| add at the end         |     1,000 | Array push           |        244 M ±2 % |         200 M ±2 % |            0.82× |
| add at the end         |   100,000 | Array push           |       62.8 M ±5 % |        59.6 M ±2 % |            0.95× |
| add at the end         | 1,000,000 | Array push           |       47.3 M ±2 % |        45.2 M ±1 % |            0.96× |
| build from an array    |     1,000 | Array.from           |       1.81 G ±5 % |         243 M ±3 % |            0.13× |
| build from an array    |   100,000 | Array.from           |        229 M ±5 % |        61.1 M ±7 % |            0.27× |
| build from an array    | 1,000,000 | Array.from           |        209 M ±2 % |        46.7 M ±1 % |            0.22× |
| get by index           |     1,000 | Array index          |        688 M ±6 % |         246 M ±3 % |            0.36× |
| get by index           |   100,000 | Array index          |        616 M ±2 % |         216 M ±2 % |            0.35× |
| get by index           | 1,000,000 | Array index          |        577 M ±2 % |         202 M ±2 % |            0.35× |
| iterate                |     1,000 | Array for…of         |        924 M ±3 % |         135 M ±6 % |            0.15× |
| iterate                |   100,000 | Array for…of         |       60.7 M ±2 % |        63.3 M ±1 % |             1.0× |
| iterate                | 1,000,000 | Array for…of         |       66.1 M ±2 % |        66.7 M ±3 % |             1.0× |
| remove first, add last |     1,000 | Array shift and push |       13.4 M ±2 % |        1.96 M ±3 % |            0.15× |
| remove first, add last |   100,000 | Array shift and push |       49.2 k ±2 % |        21.0 k ±3 % |            0.43× |

### HashMap

| Operation                        |      Size | Native baseline    | Native per second | Library per second | Library ÷ native |
| -------------------------------- | --------: | ------------------ | ----------------: | -----------------: | ---------------: |
| build from entries               |     1,000 | new Map            |       27.1 M ±3 % |        19.6 M ±7 % |            0.72× |
| build from entries               |   100,000 | new Map            |       10.1 M ±7 % |        6.60 M ±8 % |            0.65× |
| build from entries               | 1,000,000 | new Map            |      6.21 M ±19 % |        3.02 M ±9 % |            0.49× |
| delete and set again             |     1,000 | Map delete and set |       20.9 M ±1 % |        18.1 M ±2 % |            0.87× |
| delete and set again             |   100,000 | Map delete and set |      1.12 M ±37 % |       1.05 M ±30 % |            0.94× |
| delete and set again             | 1,000,000 | Map delete and set |      71.5 k ±69 % |       73.2 k ±57 % |             1.0× |
| get                              |     1,000 | Map get            |       93.1 M ±5 % |        73.7 M ±1 % |            0.79× |
| get                              |   100,000 | Map get            |       56.7 M ±3 % |        39.6 M ±3 % |            0.70× |
| get                              | 1,000,000 | Map get            |       34.4 M ±2 % |        24.0 M ±3 % |            0.70× |
| get by value with the key option |     1,000 | Map get by id      |        128 M ±1 % |        25.3 M ±2 % |            0.20× |
| get by value with the key option |   100,000 | Map get by id      |       67.0 M ±3 % |        14.3 M ±5 % |            0.21× |
| get by value with the key option | 1,000,000 | Map get by id      |       41.7 M ±5 % |        8.76 M ±2 % |            0.21× |
| has                              |     1,000 | Map has            |       83.5 M ±3 % |        62.1 M ±7 % |            0.74× |
| has                              |   100,000 | Map has            |       56.2 M ±1 % |        42.2 M ±2 % |            0.75× |
| has                              | 1,000,000 | Map has            |       37.0 M ±1 % |        27.7 M ±5 % |            0.75× |
| iterate                          |     1,000 | Map for…of         |        131 M ±4 % |         135 M ±2 % |             1.0× |
| iterate                          |   100,000 | Map for…of         |        125 M ±3 % |        117 M ±10 % |            0.94× |
| iterate                          | 1,000,000 | Map for…of         |        114 M ±2 % |         115 M ±2 % |             1.0× |
| set an existing key              |     1,000 | Map set            |       68.0 M ±1 % |        52.3 M ±7 % |            0.77× |
| set an existing key              |   100,000 | Map set            |       44.5 M ±3 % |        31.2 M ±3 % |            0.70× |
| set an existing key              | 1,000,000 | Map set            |       21.4 M ±1 % |        18.8 M ±1 % |            0.88× |
| set new keys one by one          |     1,000 | Map set            |       35.1 M ±5 % |        27.3 M ±3 % |            0.78× |
| set new keys one by one          |   100,000 | Map set            |       11.1 M ±4 % |        10.2 M ±5 % |            0.92× |
| set new keys one by one          | 1,000,000 | Map set            |       6.87 M ±1 % |        6.38 M ±3 % |            0.93× |

### HashSet

| Operation            |      Size | Native baseline    | Native per second | Library per second | Library ÷ native |
| -------------------- | --------: | ------------------ | ----------------: | -----------------: | ---------------: |
| add one by one       |     1,000 | Set add            |       36.1 M ±2 % |        30.5 M ±1 % |            0.85× |
| add one by one       |   100,000 | Set add            |       13.2 M ±2 % |        10.6 M ±8 % |            0.80× |
| add one by one       | 1,000,000 | Set add            |       7.98 M ±4 % |        5.59 M ±3 % |            0.70× |
| build from an array  |     1,000 | new Set            |       35.1 M ±2 % |        29.6 M ±5 % |            0.84× |
| build from an array  |   100,000 | new Set            |       13.7 M ±6 % |        12.1 M ±2 % |            0.89× |
| build from an array  | 1,000,000 | new Set            |       7.82 M ±4 % |        6.69 M ±5 % |            0.86× |
| delete and add again |     1,000 | Set delete and add |       22.0 M ±2 % |        18.3 M ±4 % |            0.83× |
| delete and add again |   100,000 | Set delete and add |      1.41 M ±22 % |       1.45 M ±17 % |             1.0× |
| delete and add again | 1,000,000 | Set delete and add |      92.1 k ±75 % |       92.5 k ±64 % |             1.0× |
| has                  |     1,000 | Set has            |        103 M ±2 % |        66.5 M ±2 % |            0.64× |
| has                  |   100,000 | Set has            |       62.2 M ±3 % |        45.9 M ±3 % |            0.74× |
| has                  | 1,000,000 | Set has            |       40.6 M ±5 % |        30.0 M ±2 % |            0.74× |
| iterate              |     1,000 | Set for…of         |        106 M ±3 % |        89.3 M ±3 % |            0.84× |
| iterate              |   100,000 | Set for…of         |       85.3 M ±3 % |        84.5 M ±2 % |            0.99× |
| iterate              | 1,000,000 | Set for…of         |       82.2 M ±2 % |       70.2 M ±18 % |            0.85× |

### LinkedHashMap

| Operation                 |      Size | Native baseline         | Native per second | Library per second | Library ÷ native |
| ------------------------- | --------: | ----------------------- | ----------------: | -----------------: | ---------------: |
| build from entries        |     1,000 | new Map                 |       26.6 M ±5 % |       14.8 M ±10 % |            0.56× |
| build from entries        |   100,000 | new Map                 |       9.32 M ±7 % |       5.04 M ±16 % |            0.54× |
| build from entries        | 1,000,000 | new Map                 |       6.01 M ±3 % |        1.90 M ±9 % |            0.32× |
| delete and set again      |     1,000 | Map delete and set      |       20.7 M ±2 % |        8.23 M ±2 % |            0.40× |
| delete and set again      |   100,000 | Map delete and set      |     1.01 M ±184 % |       492 k ±166 % |         unstable |
| delete and set again      | 1,000,000 | Map delete and set      |      68.9 k ±57 % |        113 k ±82 % |             1.6× |
| get                       |     1,000 | Map get                 |       93.7 M ±3 % |        51.0 M ±2 % |            0.54× |
| get                       |   100,000 | Map get                 |       51.1 M ±2 % |        25.0 M ±2 % |            0.49× |
| get                       | 1,000,000 | Map get                 |       33.9 M ±2 % |        16.0 M ±5 % |            0.47× |
| get in access order (LRU) |     1,000 | Map get, delete and set |       17.7 M ±8 % |        18.3 M ±5 % |             1.0× |
| get in access order (LRU) |   100,000 | Map get, delete and set |      1.03 M ±31 % |        11.2 M ±1 % |              11× |
| get in access order (LRU) | 1,000,000 | Map get, delete and set |      73.7 k ±65 % |        8.65 M ±8 % |             117× |
| iterate                   |     1,000 | Map for…of              |        125 M ±4 % |        56.2 M ±2 % |            0.45× |
| iterate                   |   100,000 | Map for…of              |        121 M ±2 % |        30.3 M ±3 % |            0.25× |
| iterate                   | 1,000,000 | Map for…of              |        105 M ±5 % |        32.3 M ±1 % |            0.31× |
| set an existing key       |     1,000 | Map set                 |       65.2 M ±4 % |        32.0 M ±4 % |            0.49× |
| set an existing key       |   100,000 | Map set                 |       40.6 M ±7 % |        16.1 M ±2 % |            0.40× |
| set an existing key       | 1,000,000 | Map set                 |       21.2 M ±2 % |        10.9 M ±1 % |            0.51× |
| set new keys one by one   |     1,000 | Map set                 |       34.4 M ±2 % |        17.2 M ±4 % |            0.50× |
| set new keys one by one   |   100,000 | Map set                 |       11.1 M ±2 % |       6.13 M ±13 % |            0.55× |
| set new keys one by one   | 1,000,000 | Map set                 |       6.79 M ±4 % |       2.86 M ±11 % |            0.42× |

### LinkedHashSet

| Operation            |      Size | Native baseline    | Native per second | Library per second | Library ÷ native |
| -------------------- | --------: | ------------------ | ----------------: | -----------------: | ---------------: |
| add one by one       |     1,000 | Set add            |       36.7 M ±6 % |        18.3 M ±6 % |            0.50× |
| add one by one       |   100,000 | Set add            |       13.0 M ±3 % |       7.43 M ±11 % |            0.57× |
| add one by one       | 1,000,000 | Set add            |      7.97 M ±28 % |       3.52 M ±20 % |            0.44× |
| build from an array  |     1,000 | new Set            |       34.4 M ±4 % |        20.9 M ±3 % |            0.61× |
| build from an array  |   100,000 | new Set            |       12.5 M ±8 % |        7.67 M ±4 % |            0.61× |
| build from an array  | 1,000,000 | new Set            |       7.89 M ±3 % |       3.39 M ±22 % |            0.43× |
| delete and add again |     1,000 | Set delete and add |       21.5 M ±3 % |        10.1 M ±2 % |            0.47× |
| delete and add again |   100,000 | Set delete and add |      1.43 M ±26 % |        607 k ±26 % |            0.43× |
| delete and add again | 1,000,000 | Set delete and add |      93.2 k ±70 % |        117 k ±74 % |             1.3× |
| has                  |     1,000 | Set has            |        100 M ±3 % |        57.0 M ±2 % |            0.57× |
| has                  |   100,000 | Set has            |       58.2 M ±2 % |        38.8 M ±3 % |            0.67× |
| has                  | 1,000,000 | Set has            |       41.6 M ±1 % |        26.3 M ±3 % |            0.63× |
| iterate              |     1,000 | Set for…of         |       87.3 M ±4 % |        68.1 M ±4 % |            0.78× |
| iterate              |   100,000 | Set for…of         |       83.4 M ±3 % |        56.5 M ±1 % |            0.68× |
| iterate              | 1,000,000 | Set for…of         |       82.1 M ±1 % |        56.6 M ±4 % |            0.69× |

### LinkedList

| Operation                           |      Size | Native baseline       | Native per second | Library per second | Library ÷ native |
| ----------------------------------- | --------: | --------------------- | ----------------: | -----------------: | ---------------: |
| add at the end                      |     1,000 | Array push            |        252 M ±4 % |        1.34 M ±1 % |          0.0053× |
| add at the end                      |   100,000 | Array push            |       61.6 M ±2 % |        1.32 M ±5 % |           0.021× |
| add at the end                      | 1,000,000 | Array push            |       47.0 M ±2 % |        1.11 M ±3 % |           0.024× |
| add at the front, take from the end |     1,000 | Array unshift and pop |       9.21 M ±4 % |        1.31 M ±1 % |            0.14× |
| add at the front, take from the end |   100,000 | Array unshift and pop |       48.8 k ±2 % |        1.27 M ±2 % |              26× |
| iterate                             |     1,000 | Array for…of          |       84.7 M ±3 % |         101 M ±2 % |             1.2× |
| iterate                             |   100,000 | Array for…of          |       63.9 M ±7 % |        53.7 M ±6 % |            0.84× |
| iterate                             | 1,000,000 | Array for…of          |       67.3 M ±3 % |        53.7 M ±4 % |            0.80× |
| take from the front, add at the end |     1,000 | Array shift and push  |       13.4 M ±2 % |        1.31 M ±5 % |           0.098× |
| take from the front, add at the end |   100,000 | Array shift and push  |       49.5 k ±6 % |        1.26 M ±4 % |              25× |

### PriorityQueue

| Operation               |      Size | Native baseline               | Native per second | Library per second | Library ÷ native |
| ----------------------- | --------: | ----------------------------- | ----------------: | -----------------: | ---------------: |
| add one by one          |     1,000 | Array push, then sort         |       5.67 M ±1 % |        26.5 M ±3 % |             4.7× |
| add one by one          |   100,000 | Array push, then sort         |       3.22 M ±1 % |        18.0 M ±3 % |             5.6× |
| add one by one          | 1,000,000 | Array push, then sort         |      2.66 M ±11 % |        16.6 M ±4 % |             6.3× |
| build from an array     |     1,000 | Array copy and sort           |       5.94 M ±2 % |        48.9 M ±5 % |             8.2× |
| build from an array     |   100,000 | Array copy and sort           |       3.62 M ±3 % |        28.6 M ±2 % |             7.9× |
| build from an array     | 1,000,000 | Array copy and sort           |       2.88 M ±2 % |        23.3 M ±3 % |             8.1× |
| take the least, add one |     1,000 | sorted Array shift and insert |       7.74 M ±1 % |        4.65 M ±8 % |            0.60× |
| take the least, add one |   100,000 | sorted Array shift and insert |       49.4 k ±5 % |        2.66 M ±5 % |              54× |

### TreeMap

| Operation                    |      Size | Native baseline        | Native per second | Library per second | Library ÷ native |
| ---------------------------- | --------: | ---------------------- | ----------------: | -----------------: | ---------------: |
| build from entries           |     1,000 | Array copy and sort    |       5.10 M ±3 % |        8.09 M ±1 % |             1.6× |
| build from entries           |   100,000 | Array copy and sort    |       2.18 M ±2 % |        2.12 M ±8 % |            0.97× |
| build from entries           | 1,000,000 | Array copy and sort    |      1.53 M ±22 % |        1.04 M ±9 % |            0.68× |
| ceiling entry                |     1,000 | sorted Array bisection |       38.4 M ±1 % |        8.39 M ±1 % |            0.22× |
| ceiling entry                |   100,000 | sorted Array bisection |       10.0 M ±4 % |        3.42 M ±2 % |            0.34× |
| ceiling entry                | 1,000,000 | sorted Array bisection |       7.02 M ±4 % |       2.22 M ±14 % |            0.32× |
| delete and set again         |     1,000 | sorted Array splice    |      1.34 M ±21 % |        3.77 M ±3 % |             2.8× |
| delete and set again         |   100,000 | sorted Array splice    |      47.8 k ±16 % |        1.90 M ±2 % |              40× |
| floor entry                  |     1,000 | sorted Array bisection |       42.7 M ±3 % |        10.1 M ±2 % |            0.24× |
| floor entry                  |   100,000 | sorted Array bisection |       10.4 M ±1 % |        3.54 M ±2 % |            0.34× |
| floor entry                  | 1,000,000 | sorted Array bisection |       6.82 M ±2 % |        2.36 M ±2 % |            0.35× |
| get                          |     1,000 | Map get                |        142 M ±3 % |        9.92 M ±3 % |           0.070× |
| get                          |   100,000 | Map get                |       65.0 M ±6 % |        3.70 M ±2 % |           0.057× |
| get                          | 1,000,000 | Map get                |       42.9 M ±4 % |        2.69 M ±3 % |           0.063× |
| iterate                      |     1,000 | sorted Array for…of    |       70.9 M ±2 % |        27.1 M ±3 % |            0.38× |
| iterate                      |   100,000 | sorted Array for…of    |       66.6 M ±2 % |        21.1 M ±3 % |            0.32× |
| iterate                      | 1,000,000 | sorted Array for…of    |       67.2 M ±2 % |        16.6 M ±0 % |            0.25× |
| set new keys in seeded order |     1,000 | sorted Array insert    |       9.69 M ±2 % |        7.53 M ±2 % |            0.78× |
| set new keys in seeded order |   100,000 | sorted Array insert    |        223 k ±2 % |       2.29 M ±11 % |              10× |

### TreeSet

| Operation            |      Size | Native baseline        | Native per second | Library per second | Library ÷ native |
| -------------------- | --------: | ---------------------- | ----------------: | -----------------: | ---------------: |
| add one by one       |     1,000 | sorted Array insert    |       9.68 M ±2 % |        7.68 M ±4 % |            0.79× |
| add one by one       |   100,000 | sorted Array insert    |        221 k ±1 % |        2.72 M ±4 % |              12× |
| build from an array  |     1,000 | Array copy and sort    |       5.61 M ±3 % |        8.56 M ±4 % |             1.5× |
| build from an array  |   100,000 | Array copy and sort    |       3.32 M ±2 % |       2.67 M ±11 % |            0.80× |
| build from an array  | 1,000,000 | Array copy and sort    |       2.83 M ±2 % |        1.23 M ±2 % |            0.43× |
| ceiling              |     1,000 | sorted Array bisection |       35.4 M ±3 % |        8.90 M ±5 % |            0.25× |
| ceiling              |   100,000 | sorted Array bisection |       10.1 M ±3 % |        3.93 M ±2 % |            0.39× |
| ceiling              | 1,000,000 | sorted Array bisection |       6.56 M ±5 % |        2.47 M ±6 % |            0.38× |
| delete and add again |     1,000 | sorted Array splice    |      1.33 M ±13 % |        3.56 M ±0 % |             2.7× |
| delete and add again |   100,000 | sorted Array splice    |      51.5 k ±11 % |        2.00 M ±2 % |              39× |
| floor                |     1,000 | sorted Array bisection |       41.0 M ±3 % |        8.55 M ±4 % |            0.21× |
| floor                |   100,000 | sorted Array bisection |       9.88 M ±2 % |        3.67 M ±4 % |            0.37× |
| floor                | 1,000,000 | sorted Array bisection |       6.87 M ±4 % |       2.44 M ±13 % |            0.36× |
| has                  |     1,000 | Set has                |       85.1 M ±2 % |        9.91 M ±1 % |            0.12× |
| has                  |   100,000 | Set has                |       54.3 M ±4 % |        3.75 M ±2 % |           0.069× |
| has                  | 1,000,000 | Set has                |       37.4 M ±2 % |        2.55 M ±4 % |           0.068× |
| iterate              |     1,000 | sorted Array for…of    |       71.5 M ±2 % |        47.4 M ±2 % |            0.66× |
| iterate              |   100,000 | sorted Array for…of    |       66.0 M ±5 % |        32.2 M ±3 % |            0.49× |
| iterate              | 1,000,000 | sorted Array for…of    |       66.6 M ±2 % |        23.7 M ±2 % |            0.36× |
<!-- bench:end -->

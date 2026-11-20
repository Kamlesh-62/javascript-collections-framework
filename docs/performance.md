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
Run on 2026-11-20 with Node.js v24.11.1 on darwin, Intel(R) Core(TM) i5-8600 CPU @ 3.10GHz (6 cores, 64 GB), version 0.1.1 of the package.

### ArrayDeque

| Operation                           |      Size | Native baseline       | Native per second | Library per second | Library ÷ native |
| ----------------------------------- | --------: | --------------------- | ----------------: | -----------------: | ---------------: |
| add at the end                      |     1,000 | Array push            |       111 M ±18 % |       24.8 M ±26 % |            0.22× |
| add at the end                      |   100,000 | Array push            |      32.1 M ±16 % |       8.36 M ±18 % |            0.26× |
| add at the end                      | 1,000,000 | Array push            |      26.8 M ±45 % |       6.69 M ±39 % |            0.25× |
| add at the front, take from the end |     1,000 | Array unshift and pop |      5.06 M ±53 % |       34.4 M ±38 % |             6.8× |
| add at the front, take from the end |   100,000 | Array unshift and pop |      29.8 k ±43 % |       30.4 M ±29 % |           1,020× |
| iterate                             |     1,000 | Array for…of          |      39.8 M ±47 % |       33.6 M ±44 % |            0.84× |
| iterate                             |   100,000 | Array for…of          |      29.4 M ±37 % |       20.5 M ±69 % |            0.70× |
| iterate                             | 1,000,000 | Array for…of          |      35.9 M ±47 % |       30.1 M ±34 % |            0.84× |
| take from the front, add at the end |     1,000 | Array shift and push  |      5.64 M ±38 % |       25.3 M ±39 % |             4.5× |
| take from the front, add at the end |   100,000 | Array shift and push  |      27.5 k ±49 % |       35.7 M ±42 % |           1,299× |

### ArrayList

| Operation              |      Size | Native baseline      | Native per second | Library per second | Library ÷ native |
| ---------------------- | --------: | -------------------- | ----------------: | -----------------: | ---------------: |
| add at the end         |     1,000 | Array push           |       120 M ±53 % |       79.1 M ±44 % |            0.66× |
| add at the end         |   100,000 | Array push           |      29.5 M ±45 % |       25.6 M ±58 % |            0.87× |
| add at the end         | 1,000,000 | Array push           |      24.7 M ±78 % |       22.4 M ±22 % |            0.91× |
| build from an array    |     1,000 | Array.from           |       559 M ±48 % |       94.3 M ±20 % |            0.17× |
| build from an array    |   100,000 | Array.from           |      91.8 M ±64 % |       26.7 M ±37 % |            0.29× |
| build from an array    | 1,000,000 | Array.from           |       102 M ±35 % |       19.5 M ±17 % |            0.19× |
| get by index           |     1,000 | Array index          |       305 M ±31 % |       98.4 M ±26 % |            0.32× |
| get by index           |   100,000 | Array index          |       477 M ±30 % |       99.4 M ±38 % |            0.21× |
| get by index           | 1,000,000 | Array index          |       203 M ±38 % |        105 M ±38 % |            0.52× |
| iterate                |     1,000 | Array for…of         |       344 M ±78 % |       73.8 M ±33 % |            0.21× |
| iterate                |   100,000 | Array for…of         |      26.8 M ±25 % |       30.9 M ±34 % |             1.2× |
| iterate                | 1,000,000 | Array for…of         |      51.5 M ±49 % |       30.6 M ±62 % |            0.59× |
| remove first, add last |     1,000 | Array shift and push |      5.60 M ±39 % |        862 k ±37 % |            0.15× |
| remove first, add last |   100,000 | Array shift and push |      22.7 k ±37 % |       8.93 k ±39 % |            0.39× |

### HashMap

| Operation                        |      Size | Native baseline    | Native per second | Library per second | Library ÷ native |
| -------------------------------- | --------: | ------------------ | ----------------: | -----------------: | ---------------: |
| build from entries               |     1,000 | new Map            |      13.7 M ±25 % |       9.05 M ±29 % |            0.66× |
| build from entries               |   100,000 | new Map            |      4.52 M ±61 % |       2.01 M ±49 % |            0.44× |
| build from entries               | 1,000,000 | new Map            |      2.10 M ±27 % |       1.17 M ±12 % |            0.56× |
| delete and set again             |     1,000 | Map delete and set |      5.82 M ±71 % |       5.45 M ±22 % |            0.94× |
| delete and set again             |   100,000 | Map delete and set |     220 k ±2292 % |        175 k ±35 % |         unstable |
| delete and set again             | 1,000,000 | Map delete and set |      6.46 M ±89 % |       58.8 k ±39 % |          0.0091× |
| get                              |     1,000 | Map get            |      38.1 M ±20 % |       21.5 M ±19 % |            0.57× |
| get                              |   100,000 | Map get            |      20.0 M ±60 % |       8.98 M ±36 % |            0.45× |
| get                              | 1,000,000 | Map get            |      17.7 M ±64 % |       4.38 M ±80 % |            0.25× |
| get by value with the key option |     1,000 | Map get by id      |      50.1 M ±16 % |       9.88 M ±47 % |            0.20× |
| get by value with the key option |   100,000 | Map get by id      |      30.7 M ±50 % |       6.46 M ±30 % |            0.21× |
| get by value with the key option | 1,000,000 | Map get by id      |      16.2 M ±32 % |       4.08 M ±36 % |            0.25× |
| has                              |     1,000 | Map has            |      51.3 M ±32 % |       19.6 M ±42 % |            0.38× |
| has                              |   100,000 | Map has            |      29.1 M ±37 % |       12.8 M ±23 % |            0.44× |
| has                              | 1,000,000 | Map has            |      15.1 M ±12 % |       14.5 M ±40 % |            0.96× |
| iterate                          |     1,000 | Map for…of         |      66.3 M ±39 % |       19.7 M ±19 % |            0.30× |
| iterate                          |   100,000 | Map for…of         |      58.1 M ±22 % |       3.89 M ±51 % |           0.067× |
| iterate                          | 1,000,000 | Map for…of         |      49.6 M ±20 % |       2.11 M ±33 % |           0.043× |
| set an existing key              |     1,000 | Map set            |      31.8 M ±33 % |       11.3 M ±52 % |            0.36× |
| set an existing key              |   100,000 | Map set            |      21.3 M ±29 % |       5.70 M ±20 % |            0.27× |
| set an existing key              | 1,000,000 | Map set            |      7.86 M ±41 % |       6.27 M ±42 % |            0.80× |
| set new keys one by one          |     1,000 | Map set            |      17.9 M ±43 % |       7.52 M ±15 % |            0.42× |
| set new keys one by one          |   100,000 | Map set            |      4.32 M ±34 % |       2.70 M ±42 % |            0.63× |
| set new keys one by one          | 1,000,000 | Map set            |      3.17 M ±31 % |        1.90 M ±3 % |            0.60× |

### HashSet

| Operation            |      Size | Native baseline    | Native per second | Library per second | Library ÷ native |
| -------------------- | --------: | ------------------ | ----------------: | -----------------: | ---------------: |
| add one by one       |     1,000 | Set add            |      22.8 M ±38 % |       11.9 M ±15 % |            0.52× |
| add one by one       |   100,000 | Set add            |      3.80 M ±13 % |       3.68 M ±41 % |            0.97× |
| add one by one       | 1,000,000 | Set add            |      3.67 M ±24 % |       2.65 M ±18 % |            0.72× |
| build from an array  |     1,000 | new Set            |      16.9 M ±34 % |       11.6 M ±29 % |            0.68× |
| build from an array  |   100,000 | new Set            |      8.08 M ±35 % |       3.04 M ±64 % |            0.38× |
| build from an array  | 1,000,000 | new Set            |      2.19 M ±32 % |       1.69 M ±33 % |            0.77× |
| delete and add again |     1,000 | Set delete and add |      12.6 M ±40 % |       8.20 M ±53 % |            0.65× |
| delete and add again |   100,000 | Set delete and add |      429 k ±142 % |       327 k ±106 % |         unstable |
| delete and add again | 1,000,000 | Set delete and add |      90.1 k ±52 % |       750 k ±216 % |         unstable |
| has                  |     1,000 | Set has            |      52.3 M ±36 % |       26.0 M ±48 % |            0.50× |
| has                  |   100,000 | Set has            |      28.2 M ±29 % |       12.7 M ±62 % |            0.45× |
| has                  | 1,000,000 | Set has            |      17.6 M ±26 % |       13.0 M ±36 % |            0.74× |
| iterate              |     1,000 | Set for…of         |      46.7 M ±21 % |       47.3 M ±44 % |             1.0× |
| iterate              |   100,000 | Set for…of         |      39.7 M ±44 % |       51.5 M ±30 % |             1.3× |
| iterate              | 1,000,000 | Set for…of         |     27.5 M ±100 % |       33.4 M ±52 % |         unstable |

### LinkedHashMap

| Operation                 |      Size | Native baseline         | Native per second | Library per second | Library ÷ native |
| ------------------------- | --------: | ----------------------- | ----------------: | -----------------: | ---------------: |
| build from entries        |     1,000 | new Map                 |      15.4 M ±58 % |       6.92 M ±34 % |            0.45× |
| build from entries        |   100,000 | new Map                 |      4.34 M ±27 % |       2.71 M ±36 % |            0.63× |
| build from entries        | 1,000,000 | new Map                 |      1.96 M ±25 % |        833 k ±28 % |            0.43× |
| delete and set again      |     1,000 | Map delete and set      |      12.0 M ±45 % |       2.42 M ±56 % |            0.20× |
| delete and set again      |   100,000 | Map delete and set      |      359 k ±156 % |       244 k ±201 % |         unstable |
| delete and set again      | 1,000,000 | Map delete and set      |      78.7 k ±67 % |       2.98 M ±80 % |              38× |
| get                       |     1,000 | Map get                 |      45.8 M ±51 % |       15.0 M ±41 % |            0.33× |
| get                       |   100,000 | Map get                 |      26.7 M ±42 % |       8.04 M ±41 % |            0.30× |
| get                       | 1,000,000 | Map get                 |      19.1 M ±37 % |       9.63 M ±39 % |            0.50× |
| get in access order (LRU) |     1,000 | Map get, delete and set |      10.5 M ±37 % |       9.83 M ±22 % |            0.93× |
| get in access order (LRU) |   100,000 | Map get, delete and set |      314 k ±191 % |       4.68 M ±25 % |         unstable |
| get in access order (LRU) | 1,000,000 | Map get, delete and set |      73.0 k ±79 % |       3.13 M ±22 % |              43× |
| iterate                   |     1,000 | Map for…of              |      62.9 M ±60 % |       19.5 M ±44 % |            0.31× |
| iterate                   |   100,000 | Map for…of              |      29.8 M ±30 % |       14.5 M ±23 % |            0.49× |
| iterate                   | 1,000,000 | Map for…of              |      25.6 M ±25 % |       18.4 M ±26 % |            0.72× |
| set an existing key       |     1,000 | Map set                 |      30.0 M ±42 % |       14.1 M ±36 % |            0.47× |
| set an existing key       |   100,000 | Map set                 |      20.4 M ±71 % |       7.62 M ±38 % |            0.37× |
| set an existing key       | 1,000,000 | Map set                 |      9.72 M ±60 % |       3.05 M ±98 % |            0.31× |
| set new keys one by one   |     1,000 | Map set                 |      17.9 M ±28 % |       5.97 M ±42 % |            0.33× |
| set new keys one by one   |   100,000 | Map set                 |      4.97 M ±57 % |       1.21 M ±75 % |            0.24× |
| set new keys one by one   | 1,000,000 | Map set                 |      2.99 M ±25 % |       1.33 M ±21 % |            0.44× |

### LinkedHashSet

| Operation            |      Size | Native baseline    | Native per second | Library per second | Library ÷ native |
| -------------------- | --------: | ------------------ | ----------------: | -----------------: | ---------------: |
| add one by one       |     1,000 | Set add            |      16.4 M ±25 % |       6.27 M ±21 % |            0.38× |
| add one by one       |   100,000 | Set add            |      5.69 M ±43 % |       2.46 M ±33 % |            0.43× |
| add one by one       | 1,000,000 | Set add            |      3.73 M ±31 % |       1.22 M ±23 % |            0.33× |
| build from an array  |     1,000 | new Set            |      17.7 M ±33 % |       7.39 M ±29 % |            0.42× |
| build from an array  |   100,000 | new Set            |      6.21 M ±17 % |       3.31 M ±32 % |            0.53× |
| build from an array  | 1,000,000 | new Set            |      1.85 M ±43 % |       1.42 M ±20 % |            0.76× |
| delete and add again |     1,000 | Set delete and add |      10.4 M ±48 % |       4.13 M ±37 % |            0.40× |
| delete and add again |   100,000 | Set delete and add |       449 k ±20 % |       180 k ±444 % |         unstable |
| delete and add again | 1,000,000 | Set delete and add |       113 k ±62 % |       59.7 k ±49 % |            0.53× |
| has                  |     1,000 | Set has            |      52.8 M ±37 % |       18.6 M ±23 % |            0.35× |
| has                  |   100,000 | Set has            |      32.7 M ±58 % |       12.0 M ±53 % |            0.37× |
| has                  | 1,000,000 | Set has            |      13.9 M ±40 % |       8.66 M ±48 % |            0.62× |
| iterate              |     1,000 | Set for…of         |      45.7 M ±37 % |       19.0 M ±23 % |            0.42× |
| iterate              |   100,000 | Set for…of         |      40.4 M ±47 % |       14.1 M ±18 % |            0.35× |
| iterate              | 1,000,000 | Set for…of         |      43.3 M ±33 % |       10.1 M ±56 % |            0.23× |

### LinkedList

| Operation                           |      Size | Native baseline       | Native per second | Library per second | Library ÷ native |
| ----------------------------------- | --------: | --------------------- | ----------------: | -----------------: | ---------------: |
| add at the end                      |     1,000 | Array push            |       117 M ±33 % |        528 k ±60 % |          0.0045× |
| add at the end                      |   100,000 | Array push            |      25.7 M ±22 % |        575 k ±47 % |           0.022× |
| add at the end                      | 1,000,000 | Array push            |      14.6 M ±68 % |        375 k ±22 % |           0.026× |
| add at the front, take from the end |     1,000 | Array unshift and pop |      4.04 M ±26 % |        692 k ±60 % |            0.17× |
| add at the front, take from the end |   100,000 | Array unshift and pop |      24.0 k ±46 % |        575 k ±47 % |              24× |
| iterate                             |     1,000 | Array for…of          |      35.3 M ±39 % |       42.1 M ±20 % |             1.2× |
| iterate                             |   100,000 | Array for…of          |      29.6 M ±31 % |       15.3 M ±49 % |            0.52× |
| iterate                             | 1,000,000 | Array for…of          |      32.3 M ±23 % |       28.1 M ±53 % |            0.87× |
| take from the front, add at the end |     1,000 | Array shift and push  |      5.24 M ±37 % |        622 k ±23 % |            0.12× |
| take from the front, add at the end |   100,000 | Array shift and push  |      27.0 k ±39 % |        383 k ±31 % |              14× |

### PriorityQueue

| Operation               |      Size | Native baseline               | Native per second | Library per second | Library ÷ native |
| ----------------------- | --------: | ----------------------------- | ----------------: | -----------------: | ---------------: |
| add one by one          |     1,000 | Array push, then sort         |      2.91 M ±43 % |       12.2 M ±19 % |             4.2× |
| add one by one          |   100,000 | Array push, then sort         |      1.78 M ±37 % |       11.8 M ±36 % |             6.7× |
| add one by one          | 1,000,000 | Array push, then sort         |      1.35 M ±11 % |       9.96 M ±32 % |             7.4× |
| build from an array     |     1,000 | Array copy and sort           |      2.58 M ±34 % |       16.4 M ±12 % |             6.3× |
| build from an array     |   100,000 | Array copy and sort           |      1.32 M ±51 % |       9.12 M ±39 % |             6.9× |
| build from an array     | 1,000,000 | Array copy and sort           |      1.49 M ±19 % |       9.89 M ±11 % |             6.6× |
| take the least, add one |     1,000 | sorted Array shift and insert |      4.53 M ±33 % |       2.07 M ±45 % |            0.46× |
| take the least, add one |   100,000 | sorted Array shift and insert |      20.9 k ±38 % |        730 k ±26 % |              35× |

### TreeMap

| Operation                    |      Size | Native baseline        | Native per second | Library per second | Library ÷ native |
| ---------------------------- | --------: | ---------------------- | ----------------: | -----------------: | ---------------: |
| build from entries           |     1,000 | Array copy and sort    |      2.50 M ±36 % |       4.35 M ±33 % |             1.7× |
| build from entries           |   100,000 | Array copy and sort    |      1.18 M ±35 % |       1.06 M ±27 % |            0.90× |
| build from entries           | 1,000,000 | Array copy and sort    |        729 k ±6 % |         450 k ±4 % |            0.62× |
| ceiling entry                |     1,000 | sorted Array bisection |      16.4 M ±30 % |       5.10 M ±36 % |            0.31× |
| ceiling entry                |   100,000 | sorted Array bisection |      5.16 M ±22 % |       1.80 M ±60 % |            0.35× |
| ceiling entry                | 1,000,000 | sorted Array bisection |      2.87 M ±23 % |       486 k ±125 % |         unstable |
| delete and set again         |     1,000 | sorted Array splice    |      750 k ±123 % |       1.65 M ±45 % |         unstable |
| delete and set again         |   100,000 | sorted Array splice    |      24.8 k ±12 % |        820 k ±54 % |              33× |
| floor entry                  |     1,000 | sorted Array bisection |      29.8 M ±36 % |       4.18 M ±45 % |            0.14× |
| floor entry                  |   100,000 | sorted Array bisection |      5.71 M ±33 % |       1.71 M ±31 % |            0.30× |
| floor entry                  | 1,000,000 | sorted Array bisection |      2.99 M ±52 % |        648 k ±89 % |            0.22× |
| get                          |     1,000 | Map get                |      52.6 M ±50 % |       6.49 M ±27 % |            0.12× |
| get                          |   100,000 | Map get                |      32.4 M ±16 % |       1.81 M ±42 % |           0.056× |
| get                          | 1,000,000 | Map get                |      16.5 M ±36 % |        757 k ±52 % |           0.046× |
| iterate                      |     1,000 | sorted Array for…of    |      42.8 M ±45 % |       13.5 M ±44 % |            0.32× |
| iterate                      |   100,000 | sorted Array for…of    |      33.4 M ±68 % |       10.5 M ±37 % |            0.31× |
| iterate                      | 1,000,000 | sorted Array for…of    |      37.2 M ±30 % |       7.33 M ±22 % |            0.20× |
| set new keys in seeded order |     1,000 | sorted Array insert    |      3.84 M ±18 % |       3.72 M ±29 % |            0.97× |
| set new keys in seeded order |   100,000 | sorted Array insert    |        117 k ±7 % |       1.31 M ±49 % |              11× |

### TreeSet

| Operation            |      Size | Native baseline        | Native per second | Library per second | Library ÷ native |
| -------------------- | --------: | ---------------------- | ----------------: | -----------------: | ---------------: |
| add one by one       |     1,000 | sorted Array insert    |      5.02 M ±27 % |       3.88 M ±49 % |            0.77× |
| add one by one       |   100,000 | sorted Array insert    |       100 k ±14 % |       1.03 M ±30 % |              10× |
| build from an array  |     1,000 | Array copy and sort    |      2.91 M ±38 % |       3.63 M ±21 % |             1.2× |
| build from an array  |   100,000 | Array copy and sort    |      1.72 M ±18 % |       1.05 M ±24 % |            0.61× |
| build from an array  | 1,000,000 | Array copy and sort    |      1.49 M ±22 % |        524 k ±10 % |            0.35× |
| ceiling              |     1,000 | sorted Array bisection |      16.8 M ±37 % |       3.98 M ±31 % |            0.24× |
| ceiling              |   100,000 | sorted Array bisection |      5.45 M ±18 % |       1.55 M ±27 % |            0.28× |
| ceiling              | 1,000,000 | sorted Array bisection |      2.52 M ±69 % |       1.09 M ±42 % |            0.43× |
| delete and add again |     1,000 | sorted Array splice    |       621 k ±19 % |       2.42 M ±51 % |             3.9× |
| delete and add again |   100,000 | sorted Array splice    |      24.3 k ±16 % |        940 k ±36 % |              39× |
| floor                |     1,000 | sorted Array bisection |      21.4 M ±49 % |       3.83 M ±38 % |            0.18× |
| floor                |   100,000 | sorted Array bisection |      5.38 M ±25 % |       1.88 M ±38 % |            0.35× |
| floor                | 1,000,000 | sorted Array bisection |      2.69 M ±79 % |        842 k ±31 % |            0.31× |
| has                  |     1,000 | Set has                |      45.5 M ±30 % |       4.46 M ±10 % |           0.098× |
| has                  |   100,000 | Set has                |      27.2 M ±36 % |       1.75 M ±21 % |           0.064× |
| has                  | 1,000,000 | Set has                |      11.1 M ±87 % |       1.09 M ±60 % |           0.098× |
| iterate              |     1,000 | sorted Array for…of    |      37.2 M ±42 % |       35.9 M ±43 % |            0.97× |
| iterate              |   100,000 | sorted Array for…of    |      35.9 M ±44 % |       15.7 M ±14 % |            0.44× |
| iterate              | 1,000,000 | sorted Array for…of    |      38.6 M ±53 % |       8.69 M ±33 % |            0.22× |
<!-- bench:end -->

# Recipes

Short runnable programs, each solving one common task with the collection that fits it. Every
recipe uses fixed data and prints its results, with the exact printed text in a comment after each
`console.log`, so a recipe reads as its own example output.

Each file opens with four labelled comments: the task, the collection used and why, the time
complexity of the solution, and what a version written with `Array`, `Map` and `Set` alone would
need and what that costs.

[Open in StackBlitz](https://stackblitz.com/github/Kamlesh-62/javascript-collections-framework/tree/main/examples/recipes)
to run them in the browser: `npm start` runs every recipe in the order of the table. Locally, copy
a file next to an installed `javascript-collections-framework` and run it with `node`.

| Task                                     | Collection                                       | Time                                                                                   | Recipe                                                               |
| ---------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| The k largest values of a stream         | `PriorityQueue`                                  | O(n log k) for n values; O(k) memory.                                                  | [top-k.mjs](../examples/recipes/top-k.mjs)                           |
| Merging sorted arrays                    | `PriorityQueue`                                  | O(n log k) for n values in k arrays.                                                   | [merge-sorted.mjs](../examples/recipes/merge-sorted.mjs)             |
| The maximum of each sliding window       | `ArrayDeque`                                     | O(n) for n values: each index is added once and removed at most once.                  | [sliding-window-max.mjs](../examples/recipes/sliding-window-max.mjs) |
| An LRU cache                             | `LinkedHashMap` with `accessOrder` and `maxSize` | O(1) amortised average per read, insert and eviction.                                  | [lru-cache.mjs](../examples/recipes/lru-cache.mjs)                   |
| A booking calendar that rejects overlaps | `TreeMap`: `floorEntry`, `ceilingEntry`          | O(log n) per booking for n bookings.                                                   | [booking-calendar.mjs](../examples/recipes/booking-calendar.mjs)     |
| The shortest path on a grid              | `HashSet` with `key`, `ArrayDeque`               | O(rows × columns) on average: each cell is queued and visited at most once.            | [grid-shortest-path.mjs](../examples/recipes/grid-shortest-path.mjs) |
| A running median                         | two `PriorityQueue`s                             | O(log n) per number, O(1) to read the median.                                          | [running-median.mjs](../examples/recipes/running-median.mjs)         |
| The most recent distinct items           | `LinkedHashSet`                                  | O(1) amortised average per item.                                                       | [recent-distinct.mjs](../examples/recipes/recent-distinct.mjs)       |
| The events inside a time range           | `TreeMap`: `subMap`, `headMap`, `tailMap`        | O(log n + m) to list the m events of a range among n events; O(log n) per added event. | [time-range.mjs](../examples/recipes/time-range.mjs)                 |

The recipes use only exports and options that every release of the package has had. For the
details of each collection, see its page in the [documentation index](README.md).

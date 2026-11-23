# javascript-collections-framework

[![CI](https://github.com/Kamlesh-62/javascript-collections-framework/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Kamlesh-62/javascript-collections-framework/actions/workflows/ci.yml?query=branch%3Amain)
[![coverage](https://kamlesh-62.github.io/javascript-collections-framework/coverage/badge.svg)](https://kamlesh-62.github.io/javascript-collections-framework/coverage/report/)
[![npm](https://img.shields.io/npm/v/javascript-collections-framework)](https://www.npmjs.com/package/javascript-collections-framework)
[![size](https://kamlesh-62.github.io/javascript-collections-framework/badges/size.svg)](https://github.com/Kamlesh-62/javascript-collections-framework/blob/main/docs/performance.md#bundle-size)
[![dependencies](https://kamlesh-62.github.io/javascript-collections-framework/badges/dependencies.svg)](https://www.npmjs.com/package/javascript-collections-framework?activeTab=dependencies)

A typed collections framework for JavaScript and TypeScript: lists, sets, maps, queues and
deques behind shared interfaces, with documented complexity.

> **Status: 0.x.** Published on npm. Until `1.0.0`, a minor release may contain breaking changes,
> each listed in the [changelog](CHANGELOG.md); see [versioning](docs/versioning.md).

## Quick start

```sh
npm install javascript-collections-framework
```

```ts
import { LinkedHashMap, PriorityQueue, TreeMap } from 'javascript-collections-framework'

const bookings = new TreeMap([
  [900, 'stand-up'],
  [1030, 'review'],
  [1400, 'planning'],
])
bookings.floorEntry(1100)?.value // 'review': the booking at or before 11:00
bookings.headMap(1200).toJSON() // [[900, 'stand-up'], [1030, 'review']]

const tasks = new PriorityQueue([5, 1, 3])
tasks.poll() // 1: the smallest first

const cache = new LinkedHashMap<string, number>({ accessOrder: true, maxSize: 2 })
cache.set('a', 1).set('b', 2).size // 2
cache.get('a') // 1: 'a' is now the most recently used
cache.set('c', 3).has('b') // false: 'b', the least recently used, was evicted
;[...cache.keys()] // ['a', 'c']
```

Every collection is iterable and converts to plain arrays and JSON:

```ts
import { TreeSet } from 'javascript-collections-framework'

const sorted = new TreeSet([3, 1, 2])
;[...sorted] // [1, 2, 3]
Array.from(sorted) // [1, 2, 3]
const json = JSON.stringify(sorted) // '[1,2,3]'
TreeSet.from(JSON.parse(json)).equals(sorted) // true
```

[Open in StackBlitz](https://stackblitz.com/github/Kamlesh-62/javascript-collections-framework/tree/main/examples/playground)
to try it without installing anything. Used to `Array`, `Map` and `Set`? See
[coming from native JavaScript](docs/coming-from-native.md).

## Why this library?

JavaScript ships `Array`, `Map` and `Set`. Programs that need a sorted map, a deque, a priority
queue, a linked list, or a set keyed by value rather than by reference have to assemble them by
hand. This library provides those structures behind a small set of shared interfaces, so that
code written against an interface such as `List`, `Queue` or `Deque` works with any implementation.

|                                                    | This library                                        | Native `Array`/`Map`/`Set` | mnemonist                    | js-sdsl                                                | @datastructures-js                      |
| -------------------------------------------------- | --------------------------------------------------- | -------------------------- | ---------------------------- | ------------------------------------------------------ | --------------------------------------- |
| Shared interfaces, interchangeable implementations | Yes: `List`, `Queue`, `Deque`, `SortedMap` and more | No                         | No                           | Partly: common container base classes                  | No: one package per structure           |
| Sorted maps and sets with range queries            | Yes: `TreeMap`, `TreeSet`, range views              | No                         | No                           | `OrderedMap`, `OrderedSet` with lower and upper bounds | No                                      |
| Live views (sub-lists, ranges, reversed)           | Yes                                                 | No                         | No                           | No                                                     | No                                      |
| Value equality for keys                            | Yes: `key` and `equivalence` options                | No                         | No                           | No                                                     | No                                      |
| LRU map                                            | Yes: `LinkedHashMap`                                | No                         | Yes: `LRUMap`, `LRUCache`    | No                                                     | No                                      |
| Runtime dependencies                               | 0                                                   | —                          | 1                            | 0                                                      | 0 or 1 (priority-queue depends on heap) |
| TypeScript types                                   | Bundled                                             | Built in                   | Bundled                      | Bundled                                                | Bundled                                 |
| Sorted map, else priority queue, min + gzip        | 12.2 kB (`TreeMap`), 5.6 kB (`PriorityQueue`)       | 0                          | 2.7 kB, Heap (no sorted map) | 3.4 kB, OrderedMap                                     | 1.7 kB, PriorityQueue                   |

Checked on 2026-11-19 against [mnemonist](https://www.npmjs.com/package/mnemonist) 0.40.8,
[js-sdsl](https://www.npmjs.com/package/js-sdsl) 4.4.2,
[@datastructures-js/priority-queue](https://www.npmjs.com/package/@datastructures-js/priority-queue)
6.4.0, [@datastructures-js/deque](https://www.npmjs.com/package/@datastructures-js/deque) 1.0.8
and [@datastructures-js/linked-list](https://www.npmjs.com/package/@datastructures-js/linked-list)
6.1.4. Sizes are one export bundled alone, minified and gzipped, the way the
[size table](docs/performance.md#bundle-size) measures this library. Importing every export
at once: 34.6 kB (whole package).

When another choice is better:

- **Native `Array`, `Map` and `Set`** when keys are primitives or compared by reference and no
  order, range or queue is needed: they are built into the engine and add nothing to a bundle.
- **mnemonist** for its breadth: tries, BK-trees, bloom filters, sparse sets and other
  specialised structures this library does not have.
- **js-sdsl** for the smallest sorted map: its `OrderedMap` is about a quarter of the size of
  `TreeMap`, with iterators in the style of the C++ standard library.
- **@datastructures-js** when one structure is all that is needed: each is a small package of its
  own.

## Install

```sh
npm install javascript-collections-framework
pnpm add javascript-collections-framework
yarn add javascript-collections-framework
bun add javascript-collections-framework
```

Or without a build step:

```html
<!-- Pin an exact version; add the integrity hash published with each release. -->
<script src="https://cdn.jsdelivr.net/npm/javascript-collections-framework@VERSION/dist/index.iife.js"
        integrity="sha384-…" crossorigin="anonymous"></script>
```

## Goals

- **One model.** Shared interfaces (`Collection`, `List`, `Queue`, `Deque`, sorted and
  navigable maps and sets) with interchangeable implementations, plus iterables,
  `Symbol.iterator`, `for…of` and spread throughout.
- **Typed.** Written in TypeScript with full generic types; works from plain JavaScript.
- **Documented cost.** Every operation states its time complexity.
- **Zero runtime dependencies.** Tree-shakeable ESM, with a CommonJS build for older tooling.
- **Runs everywhere.** ES2015 output with no platform APIs: Node.js, Bun, Deno, browsers, edge
  runtimes and React Native, from TypeScript or plain JavaScript, via ESM, CommonJS or a
  `<script>` tag. See [compatibility](docs/compatibility.md) for what is tested today.

## Available collections

| Family            | Implementations                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| Lists             | [`ArrayList`](docs/lists.md)                                                                                     |
| Sets              | [`HashSet`](docs/sets.md), [`LinkedHashSet`](docs/linked-hash-sets.md), [`TreeSet`](docs/sorted-sets.md)         |
| Maps              | [`HashMap`](docs/maps.md), [`LinkedHashMap`](docs/linked-hash-maps.md), [`TreeMap`](docs/sorted-maps.md)         |
| Queues and deques | [`ArrayDeque`](docs/deques.md), [`LinkedList`](docs/linked-lists.md), [`PriorityQueue`](docs/priority-queues.md) |
| Sets from maps    | [`newSetFromMap`](docs/sets-and-maps.md#newsetfrommap)                                                           |
| Immutable         | [`listOf`, `setOf`, `mapOf`, `copyOfList`, `copyOfSet`, `copyOfMap`](docs/immutable.md)                          |
| Read-only views   | [`unmodifiableList`, `unmodifiableSet`, `unmodifiableMap` and six more](docs/unmodifiable.md)                    |
| Lists over arrays | [`asList`](docs/unmodifiable.md#aslist-a-list-over-an-array)                                                     |
| Algorithms        | [`binarySearch`, `sortedIndex`, `rotate`, `shuffle`, `min`, `max` and seven more](docs/algorithms.md)            |

## Planned collections

Every collection planned so far is available. New ones are listed here, and move to the
[documentation](docs/README.md) when they ship.

## Documentation

Using collections with React, Vue, Svelte or other frameworks, or sending them through JSON or
workers: see [docs/frameworks.md](docs/frameworks.md).

New to the library? The [behaviour notes](docs/behaviour-notes.md) list what most often surprises
newcomers.

See [`docs/`](docs/README.md), and the
[API reference](https://kamlesh-62.github.io/javascript-collections-framework/) for every export.
What each release may change is in
[versioning](docs/versioning.md). What is tested, at what scale, and what is not, is in
[how this library is tested](docs/testing.md).

## Security

Zero runtime dependencies and no install scripts. To report a vulnerability, see
[SECURITY.md](SECURITY.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)

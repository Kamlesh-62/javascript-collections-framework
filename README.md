# javascript-collections-framework

A typed collections framework for JavaScript and TypeScript: lists, sets, maps, queues and
deques behind shared interfaces, with documented complexity.

> **Status: pre-release.** The API is being designed and is not published to npm yet. Nothing
> below is stable until `1.0.0`.

JavaScript ships `Array`, `Map` and `Set`. Programs that need a sorted map, a deque, a priority
queue, a linked list, or a set keyed by value rather than by reference have to assemble them by
hand. This library provides those structures behind a small set of shared interfaces, so that
code written against an interface such as `List`, `Queue` or `Deque` works with any implementation.

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

## Available collections

| Family            | Implementations                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| Lists             | [`ArrayList`](docs/lists.md)                                                                                     |
| Sets              | [`HashSet`](docs/sets.md)                                                                                        |
| Maps              | [`HashMap`](docs/maps.md)                                                                                        |
| Queues and deques | [`ArrayDeque`](docs/deques.md), [`LinkedList`](docs/linked-lists.md), [`PriorityQueue`](docs/priority-queues.md) |

## Planned collections

| Family | Implementations            |
| ------ | -------------------------- |
| Sets   | `LinkedHashSet`, `TreeSet` |
| Maps   | `LinkedHashMap`, `TreeMap` |

The table lists what is planned, not what is available. Each entry moves to the
[documentation](docs/README.md) when it ships.

## Documentation

See [`docs/`](docs/README.md). What each release may change is in
[versioning](docs/versioning.md).

## Security

Zero runtime dependencies and no install scripts. To report a vulnerability, see
[SECURITY.md](SECURITY.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)

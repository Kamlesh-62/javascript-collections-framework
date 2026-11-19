# Immutable lists, sets and maps

`listOf`, `setOf` and `mapOf` create a list, set or map from their arguments. `copyOfList`,
`copyOfSet` and `copyOfMap` create one from an iterable. The result cannot be changed through any
method: not on the collection, its views, its cursors or its entries. Each one reads like the
matching mutable collection, prints and serialises like it, and is equal to any list, set or map
with the same contents.

```ts
import { copyOfSet, listOf, mapOf, setOf } from 'javascript-collections-framework'

const days = listOf('mon', 'tue', 'wed')
days.get(1) // 'tue'

const vowels = setOf('a', 'e', 'i', 'o', 'u')
vowels.has('e') // true

const limits = mapOf(['small', 10], ['large', 100])
limits.get('large') // 100

days.add('thu') // compile error; at run time, UnsupportedOperationError
```

## Creating

| Call                            | Result                                                                  |
| ------------------------------- | ----------------------------------------------------------------------- |
| `listOf(a, b, c)`               | a list of the arguments, in order, duplicates kept                      |
| `setOf(a, b, c)`                | a set of the distinct arguments, in first-seen order                    |
| `mapOf([k1, v1], [k2, v2])`     | a map of the pairs (map entries are accepted too)                       |
| `copyOfList(iterable)`          | a list of the iterable's elements, in iteration order                   |
| `copyOfSet(iterable, options?)` | a set of its distinct elements; `options` as for `HashSet`              |
| `copyOfMap(entries, options?)`  | a map of a library map, a native `Map`, or `[key, value]` pairs/entries |

`listOf()`, `setOf()` and `mapOf()` with no arguments return empty collections, and `listOf(x)`
returns a list of one element. For a list of `n` copies of a value, use
`copyOfList(Array(n).fill(value))`.

The `…Of` factories are for short argument lists. Spreading a large array into a call, as in
`listOf(...bigArray)`, fails at the call site before the factory runs; use the `copyOf…` factories
for data of any size.

## Duplicates and empty values follow `Set` and `Map`

The sets and maps are built by the rules of `new Set` and `new Map`:

| Input                                         | `new Set` / `new Map`     | `setOf` / `mapOf`         |
| --------------------------------------------- | ------------------------- | ------------------------- |
| `1, 1`                                        | one member                | one member                |
| `-0` and `0`                                  | one member, stored as `0` | one member, stored as `0` |
| `NaN, NaN`                                    | one member                | one member                |
| `['a', 1], ['a', 2]`                          | `'a'` first, value `2`    | `'a'` first, value `2`    |
| `null`, `undefined` as elements, keys, values | stored                    | stored                    |

A repeated key keeps its first position and its first key object and takes its last value. Keys
named after built-in properties, such as `'__proto__'` and `'constructor'`, are ordinary keys, so
`copyOfMap(Object.entries(JSON.parse(text)))` keeps every one of them.

## Value-keyed copies

`copyOfSet` and `copyOfMap` take the options `HashSet` and `HashMap` take. A `key` function treats
values with the same derived key as one; an `equivalence` decides sameness with its `equals` and
`hash`:

```ts
const names = copyOfSet(['Ann', 'ann', 'Bo'], { key: (name) => name.toLowerCase() })
names.size // 2
names.has('ANN') // true

const points = copyOfMap([[{ x: 0, y: 0 }, 'origin']], { key: (p) => `${p.x},${p.y}` })
points.get({ x: 0, y: 0 }) // 'origin'
```

The options are checked before the source is read, and the whole source is read before the first
`key`, `equals` or `hash` call. A callback that changes the source therefore cannot change the
result, or make the copy run without end.

Options are read as native option objects are: an option inherited from the options object's
prototype counts as given.

## What "immutable" covers

- **The collection, not its elements.** Elements, keys and values are stored as given, never
  frozen or cloned. An object inside an immutable list can still be changed through any other
  reference to it.
- **Every change is refused.** Every method that would change the collection throws
  `UnsupportedOperationError`, even when the call would change nothing (`addAll([])`, `clear()` on
  an empty list). This also applies to sub-lists, reversed views, key, entry and value views, to
  cursors (`remove`, `set`, `insert`) and to map entries (`setValue`). The error comes before any
  argument is checked, any iterable is read or any callback is called. The message names the
  collection and the method: `ImmutableList.add: the collection cannot be changed`.
- **Mutators are compile errors where the types allow it.** The factories return
  `ReadonlyList`, `ReadonlySetCollection` and `ReadonlyMapCollection`, which have no mutators.
  Cursors and entries share their types with mutable collections, so `cursor().remove()` and
  `entry.setValue(v)` compile and are refused at run time.
- **The source is copied.** Later changes to the array, set or map a collection was made from do
  not show through, and `revision` never changes.
- **It is not a security boundary.** Immutability holds through the public API. The collections
  are ordinary objects, not frozen, so they work inside framework proxies such as Vue's
  `reactive`. The storage behind them, and behind their views, iterators, cursors and entries,
  sits under a non-enumerable symbol key, out of reach of property access, spread and
  `Object.assign`, but reflection (`Object.getOwnPropertySymbols`) can
  still find and change it.

## Views and cursors

Immutable lists have `subList`, `reversed()`, `cursor()` and `listCursor(i)`, and immutable maps
have `keySet()`, `entrySet()` and `valueCollection()`. All of them are read-only. A map's entries
are fixed: their `value` never changes. Each `valueCollection()` call returns a new view that is
equal only to itself, as with every map.

## Equality, printing and JSON

An immutable list equals any list with equal elements in the same order (`ArrayList`, a sub-list,
a reversed view, another immutable list), and the two hash alike. An immutable set equals any set
with the same members, and an immutable map any map with equal mappings. Their hashes are equal
when both compare the same way (both default, or the same `key` or `equivalence` object). An
immutable list never equals a `LinkedList`, deque, set, map or array, and an immutable set or map
never equals a native `Set` or `Map`.

```ts
listOf(1, 2).equals(new ArrayList([1, 2])) // true
setOf(1, 2).equals(new TreeSet([2, 1])) // true
```

Each one prints with its own name: `ImmutableList(2) [1, 2]`, `ImmutableSet(1) {1}`,
`ImmutableMap(1) {'a' => 1}`. Views print as `ImmutableSubList`, `ImmutableReversedList`,
`ImmutableMapKeySet`, `ImmutableMapEntrySet` and `ImmutableMapValues`. `JSON.stringify` gives the
same JSON as the mutable collection with the same contents. `isList`, `isSetCollection` and
`isMapCollection` recognise the results.

## Making a mutable copy

Every mutable collection, and native `Set`, `Map` and `Array.from`, accepts an immutable one:

```ts
const editable = ArrayList.from(listOf(1, 2))
editable.add(3)
```

A copy takes the target's default equality. To keep a `key` or `equivalence`, pass it again:
`HashSet.from(names, { key: (name) => name.toLowerCase() })`. `copyOf…` of an immutable
collection with the same options may return that collection itself.

For a read-only view of a collection that keeps changing, see
[unmodifiable views](unmodifiable.md).

`newSetFromMap` accepts an empty immutable map. The set it returns cannot add, because adding
writes to the map.

## Cost

| Operation                                         | Time                                             |
| ------------------------------------------------- | ------------------------------------------------ |
| `listOf`, `copyOfList`                            | O(n)                                             |
| `setOf`, `copyOfSet`, `mapOf`, `copyOfMap`        | O(n) average, plus the `key`/`equivalence` calls |
| list `get`, `getFirst`, `getLast`                 | O(1)                                             |
| list `indexOf`, `lastIndexOf`, `has`              | O(n)                                             |
| set `has`; map `get`, `has`, `getOrDefault`       | O(1) average                                     |
| views (`subList`, `reversed`, `keySet`, …)        | O(1) to create                                   |
| iteration, `toArray`, `toJSON`, `equals`, hashing | O(n)                                             |
| any refused change                                | O(1)                                             |

## Differences from `Object.freeze`

| `Object.freeze(array)`                                    | `listOf` / `copyOfList`                                  |
| --------------------------------------------------------- | -------------------------------------------------------- |
| writes fail silently outside strict mode                  | every change throws `UnsupportedOperationError`          |
| does nothing for `Set` and `Map`: `add`, `set` still work | sets and maps are immutable too                          |
| no value equality                                         | `equals` and hashing by contents                         |
| freezes the array object itself                           | the collection is a plain object; contents stay unfrozen |

## Types

```ts
import type {
  ReadonlyList,
  ReadonlyMapCollection,
  ReadonlySetCollection,
} from 'javascript-collections-framework'
```

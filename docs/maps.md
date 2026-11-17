# Maps and `HashMap`

A **map** holds key–value mappings, each key once. `HashMap` is a drop-in for native `Map`: the
same methods with the same results, insertion order, SameValueZero keys and live iteration. On top
of that it can compare keys by value, has read-modify-write helpers (`getOrDefault`, `compute`,
`merge`, `replaceAll`), live views of its keys, entries and values, and compares whole maps by
their mappings.

```ts
import { HashMap, type MapCollection } from 'javascript-collections-framework'

const ages = new HashMap([['ann', 31]])
ages.set('bob', 27).get('bob') // 27
ages.has('cy') // false
ages.delete('ann') // true

const counts = new HashMap<string, number>()
for (const word of ['a', 'b', 'a']) counts.merge(word, 1, (n, one) => n + one)
String(counts) // "HashMap(2) {'a' => 2, 'b' => 1}"
```

## A drop-in for `Map`

| Native `Map`                                           | `HashMap`                                                        |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| `set(k, v)` returns the map                            | the same                                                         |
| `get(k)` returns `undefined` when absent               | the same                                                         |
| `has(k)`, `delete(k)`, `clear()`, `size`               | the same                                                         |
| `keys()`, `values()`, `entries()`                      | the same; each step of `entries()` is a new `[key, value]` array |
| `forEach((value, key, map) => …, thisArg)`             | the same                                                         |
| `getOrInsert`, `getOrInsertComputed`                   | the same, on every runtime                                       |
| iteration yields `[key, value]`                        | the same; `new Map(hashMap)` copies it                           |
| insertion order; setting a present key keeps its place | the same                                                         |
| `NaN` is one key, `-0` is stored as `0`                | the same                                                         |
| `null` and `undefined` as keys and values              | the same                                                         |

`new HashMap(entries)` and `HashMap.from(entries)` take `[key, value]` arrays, map entries, a
native `Map` or another map; later pairs replace earlier ones for equal keys.

## Comparing keys by value

By default two distinct objects are two keys, as in `Map`. Pass **one** of two options, exactly as
for [`HashSet`](sets.md#comparing-members-by-value) (both together throw `TypeError`):

```ts
interface User {
  id: number
  name: string
}
const scores = new HashMap<User, number>({ key: (user) => user.id })
scores.set({ id: 1, name: 'Ada' }, 10).set({ id: 1, name: 'Ada L.' }, 12)
scores.size // 1 — the first key object stays, the value is 12

const byValue = new HashMap<Point, string>({ equivalence: valueEquivalence })
```

The options apply to keys only; values are never hashed. `key` (or `hash`) is called once per key
you pass in, never again for a key the map holds — the derived key or hash is stored with the
mapping and reused when the map grows, shrinks, removes the mapping, or when an entry reads or
writes it. Results are checked as in `HashSet` (`HashMap.set: key function returned object`).

A `key`, `equals` or `hash` function may read the map, but if it adds or removes mappings, the call
that ran it throws `ConcurrentModificationError`; that call makes no change of its own. Changing
the fields a stored key's key or hash depends on leaves lookups for it unspecified; the mapping can
still be removed through a view's cursor, `removeIf`, `removeAll`, `retainAll`, or `clear`.

## Reading, writing and absence

`get` returns `undefined` both for an absent key and for a stored `undefined`. To tell them apart,
use `has(k)` or `getOrDefault(k, fallback)`, which returns the stored value even when it is
`undefined`. `containsValue(v)` scans the values with SameValueZero (O(n)).

| Method            | Returns                                                 |
| ----------------- | ------------------------------------------------------- |
| `set(k, v)`       | the map                                                 |
| `put(k, v)`       | the previous value, or `undefined`                      |
| `delete(k)`       | whether a mapping was removed                           |
| `remove(k)`       | the removed value, or `undefined`                       |
| `replace(k, v)`   | the previous value; does nothing when the key is absent |
| `putAll(entries)` | nothing; reads and checks the whole argument first      |

## Upsert, compute and merge

Callbacks take the value first and the map last, as `forEach` does.

```ts
const groups = new HashMap<string, string[]>()
groups.getOrInsert('a', []).push('apple')
groups.getOrInsertComputed('b', () => []).push('banana')

const stock = new HashMap([['apple', 2]])
stock.compute('apple', (n) => (n ?? 0) + 1) // 3
stock.computeIfPresent('apple', (n) => (n > 1 ? n - 1 : undefined)) // 2
stock.merge('pear', 1, (old, one) => old + one) // 1 — absent, so stored as given
stock.replaceAll((n) => n * 10)
```

- `getOrInsert` and `getOrInsertComputed` follow native `Map` exactly: `getOrInsertComputed`
  checks that its callback is a function first, calls it only when the key is absent, and if the
  callback itself inserted the key, overwrites that mapping's value in place. Its callback may
  change the map freely.
- In `compute`, `computeIfPresent` and `merge`, a result of `undefined` **removes** the mapping
  (`null` is stored). Inside `compute`, a stored `undefined` and an absent key both arrive as
  `undefined`; use `has` if the difference matters.
- If a `compute`, `computeIfPresent`, `merge` or `replaceAll` callback adds or removes mappings, the
  call throws `ConcurrentModificationError` after the callback returns; the callback's changes stay
  and the call makes none of its own. A callback that throws leaves the map as the callback left
  it. `replaceAll` keeps the values it replaced before an error.

`revision` changes when a mapping is added or removed and when a value is written (even the same
value); calls that change nothing, such as a `getOrInsert` hit, leave it as it was.

## Views and entries

`keySet()`, `entrySet()` and `valueCollection()` return live views — new objects on every call —
that follow the map and change it:

| View                | Kind                            | Membership                                                      | Removing                                                                                |
| ------------------- | ------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `keySet()`          | `SetCollection<K>`              | the map's key equality                                          | removes the mapping                                                                     |
| `entrySet()`        | `SetCollection<MapEntry<K, V>>` | an entry whose key is present with a value equal under `equals` | removes the mapping                                                                     |
| `valueCollection()` | `Collection<V>`                 | SameValueZero                                                   | `delete(v)` removes the first mapping with that value; bulk removals remove every match |

No view can add: `add` throws `UnsupportedOperationError`; set mappings on the map. `[k, v]`
arrays are never members of `entrySet()`. The key view hashes like a `HashSet` with the same
options, the entry view like the map; the value view equals only itself. For views and maps
compared across implementations, `putAll` from any map, and a set backed by a map
(`newSetFromMap`), see [sets and maps together](sets-and-maps.md).

```ts
const prices = new HashMap([
  ['tea', 3],
  ['cake', 0],
])
prices.keySet().retainAll(['tea'])
prices.valueCollection().removeIf((p) => p === 0)
for (const entry of prices.entrySet()) entry.setValue(entry.value * 2)
const [key, value] = [...prices.entrySet()][0] // entries destructure as [key, value]
```

An entry is a handle on one key of one map. `entry.value` reads the map's current value while the
key is present; after the key is removed it returns the value it last read or wrote.
`entry.setValue(v)` writes through while the key is present (a key removed and added again
counts) and throws `IllegalStateError` otherwise. Two entries are equal when their keys and values
are equal under `equals`; an entry prints as `'tea' => 6` and `toJSON()` gives `[key, value]`.
Whether iteration reuses entry objects is unspecified.

## Live iteration

Iterating the map, `keys()`, `values()`, `entries()`, `forEach` and every view works exactly as on
a native `Map`: mappings deleted before the loop reaches them are skipped, mappings added during
the loop are visited, a key deleted and set again moves to the end, and `clear()` ends the loop.
Writing a value is not a structural change. Nothing throws `ConcurrentModificationError`. View
cursors are live in the same way: a mapping `hasNext()` has reached is returned even if it is
deleted before `next()`.

## Equality, hashing and output

Two maps are equal when they have the same size and each maps every key of the other to a value
equal under `equals`, in any order. Each side is looked up with its own key equality, so the answer
is the same both ways round. Native `Map`, sets, lists and plain objects are never equal to a map.
The other map is asked through its entry view's `has` (`other.entrySet().has(entry)`), which never
reorders an access-ordered [`LinkedHashMap`](linked-hash-maps.md); values are compared as the other
map's value against this map's, and a value whose `equals` adds or removes mappings of the other
map makes the comparison throw `ConcurrentModificationError`.

Equal maps that use the same `key` function, the same `equivalence`, or neither have the same
`[hashCodeSymbol]` hash; the values are unspecified and there is no `hashCode()` method. A map that
contains itself prints `[Circular]` and can still be compared and hashed.

```ts
String(new HashMap([['a', 1]])) // "HashMap(1) {'a' => 1}"
JSON.stringify(new HashMap([['a', 1]])) // '[["a",1]]' — JSON.stringify(new Map(...)) is '{}'
```

Insertion order, live iteration and SameValueZero keys by default are specified. Hash values,
seeds, the bucket layout and `revision` values are not.

## Cost

| Operation                                                                    | Time                                        |
| ---------------------------------------------------------------------------- | ------------------------------------------- |
| `get`, `getOrDefault`, `has`, `set`, `put`, `delete`, `remove`, `replace`    | O(1) average, plus one `key` or `hash` call |
| `getOrInsert`, `getOrInsertComputed`, `compute`, `computeIfPresent`, `merge` | O(1) average, plus the calls                |
| `keySet().has/delete`, `entrySet().has/delete`, entry `value`/`setValue`     | O(1) average                                |
| creating a view                                                              | O(1)                                        |
| `containsValue`, `valueCollection().has/delete`                              | O(n)                                        |
| `replaceAll`, `equals`, `toString`, `toJSON`, `copy`, `forEach`              | O(n)                                        |
| `putAll`                                                                     | O(m) average                                |
| view `removeIf`, `removeAll`, `retainAll`                                    | O(n + m) average, plus the calls            |
| `clear`                                                                      | O(1) with `equivalence`; one native `clear` |

With no option or with `key`, each operation is one or two native `Map` operations. With an
`equivalence`, keys live in seeded hash buckets, as in [`HashSet`](sets.md#cost); keys that all
return the same hash degrade those operations to O(n).

## Differences from `Map`

| `Map`                                               | `HashMap`                                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| distinct objects are always distinct keys           | a `key` or `equivalence` can make them one key                                                         |
| the constructor reads `[0]` and `[1]` of any object | each item must be an array of length 2 or a map entry, checked before anything is stored (`TypeError`) |
| `JSON.stringify` gives `{}`                         | `toJSON()` gives `[key, value]` pairs                                                                  |
| `String(map)` gives `[object Map]`                  | `HashMap(1) {'a' => 1}`                                                                                |
| no structural equality                              | `equals` compares mappings                                                                             |
| no live key, entry or value collections             | `keySet()`, `entrySet()`, `valueCollection()`                                                          |

`new HashMap({ a: 1 })` is an empty map: a first argument that is not iterable is read as the
options, and unknown option names are ignored. Use `HashMap.from(Object.entries(object))` to copy
an object's properties.

## Types

| Type                          | What it adds                                                            |
| ----------------------------- | ----------------------------------------------------------------------- |
| `ReadonlyMapCollection<K, V>` | the reading methods, views typed read-only, `forEach((v, k, map) => …)` |
| `MapCollection<K, V>`         | the writing, upsert and compute methods                                 |
| `MapEntry<K, V>`              | `key`, `value`, `setValue`, `equals`, `toJSON`                          |
| `HashMapOptions<K>`           | `key` or `equivalence`                                                  |

For a map in insertion order that can also be read and changed at both ends, kept in access order
or bounded in size, see [`LinkedHashMap`](linked-hash-maps.md) and the `SequencedMap` type.

`isMapCollection(value)` recognises a map from any copy of the package (native `Map` is not one,
and neither are the views); a map is not a `Collection`, so `isCollection(map)` is `false`.
`instanceof HashMap` recognises a `HashMap`. Type parameters as `MapCollection<K, V>` rather than
`HashMap<K, V>`.

For mappings kept in key order, with nearest-key queries and range views, see
[sorted maps and `TreeMap`](sorted-maps.md); its `SortedMap<K, V>` type extends
`MapCollection<K, V>`, and a `TreeMap` equals a `HashMap` with the same mappings.

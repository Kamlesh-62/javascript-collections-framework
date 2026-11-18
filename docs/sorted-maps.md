# Sorted maps and `TreeMap`

A **sorted map** keeps its mappings in the order of their keys while you set and delete them, and
answers "which mapping is nearest this key?" directly. `TreeMap` stores them in a balanced binary
search tree: `get`, `set`, `has`, `delete` and the nearest-entry queries are O(log n). Without it,
the usual stand-in is a native `Map` plus a sorted array of its keys, kept in step by hand at O(n)
per insert or removal.

Use it for price levels, version ranges, time series, or interval scheduling ("the booking that
starts at or before 10:30").

```ts
import { TreeMap, type SortedMap } from 'javascript-collections-framework'

const bookings = new TreeMap([
  [900, 'stand-up'],
  [1030, 'review'],
  [1400, 'planning'],
])
bookings.floorEntry(1100)?.value // 'review': the booking that started at or before 11:00
bookings.ceilingEntry(1100)?.key // 1400: the next one
bookings.headMap(1200).toJSON() // [[900, 'stand-up'], [1030, 'review']]: the morning
bookings.keySet().getLast() // 1400

const latestFirst: SortedMap<number, string> = new TreeMap<number, string>({
  comparator: (a, b) => b - a,
})
```

To hand out a read-only view, use [`unmodifiableSortedMap`](unmodifiable.md).

`TreeMap` has the whole map API of [`HashMap`](maps.md) — `size`, `get`, `set` returning the map,
`has`, `delete`, `clear`, `keys`, `values`, `entries`, `forEach((value, key, map) => …)`,
`getOrDefault`, `getOrInsert`, `getOrInsertComputed`, `compute`, `computeIfPresent`, `merge`,
`replaceAll`, `putAll`, live `keySet()`, `entrySet()` and `valueCollection()` views, `revision`,
printing and JSON — with every result in ascending key order.

## Order and sameness

Without options the map orders its keys by [natural order](ordering.md): numbers, strings,
bigints, booleans, dates, or your own objects through `compareSymbol`. All keys must be of one
kind; setting a string key in a map of number keys throws `ClassCastError`, and so does a key with
no natural order (a plain object, a symbol, a function), even in an empty map. A `null` or
`undefined` key throws `NullElementError`. `-0` is stored as `0`, as a native `Map` does; with a
`comparator`, keys are kept as given. Values may be anything, `null` and `undefined` included.

With a `comparator` option the map orders by it, and the comparator also decides **sameness**: two
keys are the same key when it returns `0` for them, whatever their identity. Setting such a key
keeps the stored key object and replaces only the value:

```ts
interface Room {
  id: number
  name: string
}
const rooms = new TreeMap<Room, string>({ comparator: (a, b) => a.id - b.id })
const first = { id: 1, name: 'Ada' }
rooms.set(first, 'booked')
rooms.set({ id: 1, name: 'renamed' }, 'free') // the same key: only the value changes
rooms.firstEntry()?.key === first // true
```

A comparator that accepts `null` (such as `nullsFirst()`) lets the map store and find a `null`
key.

| Constructor form                  | Gives                                             |
| --------------------------------- | ------------------------------------------------- |
| `new TreeMap()`                   | an empty map in natural key order                 |
| `new TreeMap(entries)`            | the mappings of any iterable of pairs, sorted     |
| `new TreeMap({ comparator })`     | an empty map ordered by `comparator`              |
| `new TreeMap(entries, options)`   | the mappings, ordered by `options.comparator`     |
| `TreeMap.from(entries, options?)` | the same as the previous form; `entries` required |

- `entries` holds `[key, value]` arrays of length exactly 2 or map entries — a native `Map`,
  another map or an entry view work too. Every item is checked before anything is stored; anything
  else throws `TypeError`.
- Of several equal keys, the first key object is kept with the last value. Keys already in
  ascending order are built into the tree directly, with one comparison per neighbouring pair.
- `comparator` is read once, when the map is created; other keys are ignored. A `comparator` that
  is not a function throws `TypeError`, and so does passing a bare function where the entries go
  (pass it as `{ comparator }`).
- A map built from another `TreeMap` does **not** take its comparator: it uses natural order unless
  you pass one. `copy()` keeps the comparator and calls no user code.
- `comparator()` returns the comparator, or `undefined` for natural order.

## Looking up absent keys

In natural order, `get`, `getOrDefault`, `has`, `delete`, `remove`, `replace` and
`computeIfPresent` answer "absent" for `null`, `undefined` and keys of another kind — `undefined`,
the fallback or `false`, changing nothing — as a native `Map` does, instead of throwing. So do the
entry view's `has`, `delete`, `removeAll` and `retainAll`. Methods that can create a mapping, the
nearest-entry queries and range bounds still throw for them. Errors thrown by your own comparator
or `compareSymbol` method always propagate.

```ts
const prices = new TreeMap([[1, 'one']])
prices.get('1' as never) // undefined
prices.has(null as never) // false
prices.set('1' as never, 'x') // throws ClassCastError
```

A method that can create a mapping (`set`, `put`, `putAll`, `getOrInsert`,
`getOrInsertComputed`, `compute`, `merge`) checks, in order and before calling any callback: the
callback is a function, the key is not `null`/`undefined` (natural order), the key can be compared,
and — on a range view — the key is in range. `putAll` checks its whole input first.

## Ends, nearest entries and key-only queries

| Method                                | Returns                                                         |
| ------------------------------------- | --------------------------------------------------------------- |
| `firstEntry()`, `lastEntry()`         | the entry of the least or greatest key, or `undefined` if empty |
| `lowerEntry(k)`                       | the entry of the greatest key less than `k`, or `undefined`     |
| `floorEntry(k)`                       | the entry of the greatest key less than or equal to `k`         |
| `ceilingEntry(k)`                     | the entry of the least key greater than or equal to `k`         |
| `higherEntry(k)`                      | the entry of the least key greater than `k`                     |
| `pollFirstEntry()`, `pollLastEntry()` | removes the first or last mapping and returns its entry         |

`k` need not be present. For questions about keys alone, use `keySet()`, a live sorted set with
the whole [`TreeSet`](sorted-sets.md) API:

```ts
const keys = bookings.keySet()
keys.floor(1100) // 1030
keys.getFirst() // 900; NoSuchElementError when empty
keys.pollLast() // 1400, and the mapping is removed from the map
```

## Entries are live handles

Every entry the map gives out — from navigation, polls, `entrySet()` or its cursor — is a handle
on (map, key), as with `HashMap`. While the mapping is stored, `entry.value` reads the current
value and `entry.setValue(v)` writes through (a value write, so open iterators carry on); neither
calls your comparator. Once the key has left the map, `value` returns the value it last read and
`setValue` throws `IllegalStateError`; if the key is set again, the entry finds the new mapping
(one search, with your comparator) and works again.

```ts
const map = new TreeMap([
  [1, 'a'],
  [2, 'b'],
])
const entry = map.pollFirstEntry()! // removes 1
entry.value // 'a'
entry.setValue('x') // throws IllegalStateError
map.set(1, 'again')
entry.setValue('y') // 'again'; map.get(1) is now 'y'
```

Entries from a view are handles on the whole map: `setValue` does not check the view's range.

## Range views

`subMap`, `headMap` and `tailMap` return **live views** of a key range: changes to the map show in
the view and changes through the view reach the map.

```ts
const map = new TreeMap([
  [10, 'a'],
  [20, 'b'],
  [30, 'c'],
  [40, 'd'],
])
const middle = map.subMap(20, 40) // keys in [20, 40)
map.set(25, 'x')
middle.toJSON() // [[20, 'b'], [25, 'x'], [30, 'c']]
middle.delete(20) // removes it from the map too
middle.set(35, 'y') // fine: 35 is in range
middle.set(45, 'z') // throws IllegalArgumentError: outside the range
middle.get(10) // undefined: not in the view, though in the map
```

| Call                                               | Key range (default)                    |
| -------------------------------------------------- | -------------------------------------- |
| `subMap(from, to)`                                 | `from` ≤ k < `to`                      |
| `subMap(from, to, { fromInclusive, toInclusive })` | as the flags say                       |
| `headMap(to)`, `headMap(to, { inclusive })`        | k < `to` (≤ with `inclusive: true`)    |
| `tailMap(from)`, `tailMap(from, { inclusive })`    | k ≥ `from` (> with `inclusive: false`) |

- The options are the `SubSetOptions` and `BoundOptions` of sorted sets, read once; omitted flags,
  `undefined` and `null` take the defaults. Options that are not an object, or flags that are not
  booleans, throw `TypeError`.
- `from` after `to` throws `IllegalArgumentError`; `subMap(x, x)` is an empty view unless both
  flags are `true`. In natural order, a bound is checked like a key.
- A view's own `subMap`, `headMap` and `tailMap` give narrower views; a range reaching outside the
  view throws `IllegalArgumentError`.
- Creating a mapping outside the range through the view throws `IllegalArgumentError`; looking one
  up answers absent. `size`, `containsValue`, `clear`, `replaceAll`, `forEach`, the ends,
  navigation, polls, iteration, equality, hashing and printing see only the mappings in range.
- A view's `size` counts the mappings in range each time, in O(k + log n) for k mappings; its
  `clear()` removes them one by one.
- Views share the map's `revision`, print as `TreeSubMap(2) {20 => 'b', 25 => 'x'}`, and are
  recognised by `isSortedMap`; `instanceof TreeMap` is `false` for them.

## Reversed views

`reversed()` returns a live view in descending key order. Everything is mirrored: its first entry
is the map's last, its `lowerEntry` is the map's `higherEntry`, and its ranges run from greater to
lesser. Reversing it gives back the map or view it came from.

```ts
const map = new TreeMap([
  [1, 'a'],
  [2, 'b'],
  [3, 'c'],
])
const down = map.reversed()
String(down) // "ReversedTreeMap(3) {3 => 'c', 2 => 'b', 1 => 'a'}"
down.lowerEntry(2)?.key // 3
down.headMap(2).toJSON() // [[3, 'c']]
down.reversed() === map // true
```

A reversed view's `comparator()` returns a function that orders in reverse, the same function on
every call. Its key set is the reversed key set: `map.reversed().keySet().getFirst()` is the
greatest key.

## Key, entry and value views

- `keySet()` is a sorted set of the keys in the view's order (`TreeMapKeySet`). Removing a key
  removes its mapping; `add`, `addFirst` and `addLast` throw `UnsupportedOperationError` (so does
  `addAll`, unless its argument is empty). Its range and reversed views are the key sets of the
  matching map views.
- `entrySet()` is a sequenced set of entries in key order (`TreeMapEntrySet`). An entry is a
  member when its key is present with a value equal under `equals`; removing it removes the
  mapping.
- `valueCollection()` is a sequenced collection of the values in key order (`TreeMapValues`);
  `delete(v)` removes the mapping of the first key with that value, in the view's order. It equals
  only itself.

The entry and value views have the view's ends: `getFirst` and `getLast` return the entry or value
of the first and last key, `removeFirst` and `removeLast` remove those mappings (each throwing
`NoSuchElementError` when empty), `reversed()` is the matching view of the reversed map, and
`addFirst` and `addLast` throw `UnsupportedOperationError`. `isSequencedCollection` is `true` for
them.

Each call returns a new view; none can add.

## Changing a map while iterating

Adding or removing mappings while a `for…of`, `forEach`, `keys`/`values`/`entries` iterator or a
view cursor is open — on the map or any of its views — makes the next step throw
`ConcurrentModificationError`. Writing a value (`set` on a present key, `replace`, `replaceAll`,
`entry.setValue`) is not such a change, so iteration carries on. To remove while walking, use a
view cursor's `remove()`, or `removeIf` on a view.

A `compute`, `computeIfPresent`, `merge` or `replaceAll` callback that adds or removes mappings
makes the call throw `ConcurrentModificationError` (its own change stays); a
`getOrInsertComputed` callback may change the map freely, as with native `Map`.

## Failures change nothing

A comparator is your code, so the map guards against it:

- Every operation makes all its comparisons before it changes the tree. If the comparator (or a
  `compareSymbol` method) throws, or returns something that is not a number or is `NaN`, the call
  throws and the map is exactly as before: same mappings, `size` and `revision`, and open
  iterators keep working.
- `putAll` sets one mapping at a time after checking its whole input: if a comparison fails
  part-way, the mappings set before it stay.
- If the comparator adds or removes mappings of the map it is comparing for, the call throws
  `ConcurrentModificationError` and makes no further change.

## Inconsistent comparators

A comparator should be a total order. If it is not — random, or reading a value that changes while
the key is in the map — lookups may give wrong answers and the same key may be stored twice. The
map still never loses or duplicates a stored mapping, `size` stays exact, iteration visits each
stored mapping once, and every call finishes within the usual number of comparisons.

## Equality and hashing

Two maps are equal when they have the same size and each maps every key of the other to a value
equal under `equals`, in any order — so a `TreeMap` equals a `HashMap` or
[`LinkedHashMap`](linked-hash-maps.md) with the same mappings, both ways round. The other map is
asked through its entry view's `has`, so values are compared as the other map's value against this
map's, and a value whose `equals` adds or removes mappings of the other map makes the comparison
throw `ConcurrentModificationError`. In natural order, looking up a key of another kind answers absent, so a `HashMap` with
a `null` or string key is simply not equal. Native `Map`, sets and plain objects are never equal to
a map.

Equal maps get the same `[hashCodeSymbol]` hash — the same as an equal default `HashMap` — when
their comparators treat as equal only keys that hash alike (always true for natural order on
numbers, strings and the other primitives). When the comparator's sameness differs from `equals`,
a `TreeMap` and a `HashMap` with "the same" mappings may disagree in `equals`, and their hashes may
differ. Hash values are unspecified, and there is no `hashCode()` method.

```ts
String(
  new TreeMap([
    [2, 'b'],
    [1, 'a'],
  ]),
) // "TreeMap(2) {1 => 'a', 2 => 'b'}"
JSON.stringify(
  new TreeMap([
    [2, 'b'],
    [1, 'a'],
  ]),
) // '[[1,"a"],[2,"b"]]'
```

A map that contains itself prints `[Circular]` and can still be compared and hashed.

## Cost

| Operation                                                                       | Time                                                                          |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `get`, `getOrDefault`, `has`, `delete`, `remove`, `replace`, `computeIfPresent` | O(log n): at most 2⌈log2(n + 1)⌉ comparisons                                  |
| `set`, `put`, `getOrInsert`, `compute`, `merge`                                 | O(log n): at most 2⌈log2(n + 1)⌉ + 2 comparisons, one search                  |
| `getOrInsertComputed`                                                           | as `set`, plus one more search only if the callback added or removed mappings |
| `lowerEntry`, `floorEntry`, `ceilingEntry`, `higherEntry`                       | O(log n): at most 2⌈log2(n + 1)⌉ comparisons                                  |
| `firstEntry`, `lastEntry`, `pollFirstEntry`, `pollLastEntry`                    | O(log n), no comparisons                                                      |
| keyed operations and nearest entries on a range view                            | O(log n): at most 2 more comparisons                                          |
| ends and polls on a range view                                                  | O(log n): at most 2⌈log2(n + 1)⌉ + 2 comparisons                              |
| a range view's `size` / `clear()`                                               | O(k + log n) / O(k log n) for k mappings in range                             |
| entry `value`, `setValue`                                                       | O(1), no comparisons while stored; O(log n) once removed                      |
| iteration step, cursor `next`                                                   | O(1) amortised                                                                |
| `containsValue`, `replaceAll`, `forEach`, `toString`, `toJSON`                  | O(n) plus the calls                                                           |
| `equals(other)`                                                                 | O(n log n) plus the lookups on `other`                                        |
| `putAll(items)`                                                                 | O(m log(n + m))                                                               |
| the constructor, `from` (keys in ascending order)                               | O(n): at most n − 1 comparisons (one when n is 1 in natural order)            |
| the constructor, `from` (any other order)                                       | O(n log n)                                                                    |
| `copy()`                                                                        | O(n), no comparisons                                                          |
| `clear()` on the map                                                            | O(1)                                                                          |

No operation recurses, so very large maps are safe to build, iterate, print, compare and copy.

## Differences from `Map`

| `Map`                                               | `TreeMap`                                                                         |
| --------------------------------------------------- | --------------------------------------------------------------------------------- |
| insertion order                                     | key order; setting a present key keeps its place                                  |
| keys compared with SameValueZero                    | keys compared with the comparator (natural order by default)                      |
| any key, `null` and `undefined` included            | in natural order, keys of one kind, no `null`/`undefined` (lookups answer absent) |
| live iteration                                      | fail-fast iteration (`ConcurrentModificationError`)                               |
| no nearest-key queries                              | `floorEntry`, `ceilingEntry`, … and `keySet().floor(k)`, …                        |
| no range views                                      | live `subMap`, `headMap`, `tailMap`, `reversed()`                                 |
| the constructor reads `[0]` and `[1]` of any object | each item must be an array of length 2 or a map entry (`TypeError`)               |
| `JSON.stringify` gives `{}`                         | `toJSON()` gives `[key, value]` pairs                                             |

## Types

| Type                      | What it adds                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| `ReadonlySortedMap<K, V>` | `comparator`, the ends and nearest entries, read-only range and reversed views, a sorted `keySet()` |
| `SortedMap<K, V>`         | `pollFirstEntry`, `pollLastEntry`, and views you can change through                                 |
| `TreeMapOptions<K>`       | `comparator`                                                                                        |

`TreeMap<K, V>` implements `SortedMap<K, V>`, which extends `SequencedMap<K, V>` (and through it
`MapCollection<K, V>`): a sorted map is a [sequenced map](linked-hash-maps.md#types) whose order is
decided by its keys, so `putFirst` and `putLast` throw `UnsupportedOperationError` without
checking or changing anything — use `set`. Its entry and value views are typed `SequencedSet` and
`SequencedCollection`.
`isSortedMap(value)` recognises a `TreeMap` and its range and reversed views from any copy of the
package; `isMapCollection` recognises them too, and `instanceof TreeMap` recognises the map itself.
A sorted map is not a collection, and its key set is a sorted set, not a sorted map. Type parameters
as `SortedMap<K, V>` rather than `TreeMap<K, V>`.

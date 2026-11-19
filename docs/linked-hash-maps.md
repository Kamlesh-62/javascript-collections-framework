# Linked hash maps and `LinkedHashMap`

`LinkedHashMap` is a map in insertion order — like native `Map` and [`HashMap`](maps.md) — that can
also be read and changed at **both ends**: the first and last mapping, removing either, inserting
at the front, moving a mapping to either end, and walking the map newest first through a live
reversed view. It can also keep itself in **access order** (least recently used first) and to a
**maximum size**, which together make an LRU cache from options alone.

```ts
import { LinkedHashMap } from 'javascript-collections-framework'

const cache = new LinkedHashMap<string, number>({ accessOrder: true, maxSize: 2 })
cache.set('a', 1).set('b', 2)
cache.get('a') // 1 — 'a' is now the most recently used
cache.set('c', 3) // evicts 'b', the least recently used
;[...cache.keys()] // ['a', 'c']
```

To hand out a read-only view, use [`unmodifiableSequencedMap`](unmodifiable.md).

## When to use it

| Need                                                                    | Use                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------ |
| mappings in insertion order, `get`/`set`/`delete`                       | `Map` or [`HashMap`](maps.md)                    |
| the same, plus the last mapping, front insertion or "move to front/end" | `LinkedHashMap`                                  |
| a cache that drops the least recently used entry                        | `LinkedHashMap` with `accessOrder` and `maxSize` |
| a registry or history that keeps at most `n` entries                    | `LinkedHashMap` with `maxSize`                   |
| mappings kept in key order                                              | [`TreeMap`](sorted-maps.md)                      |

On a native `Map` the last mapping needs a full walk, nothing inserts at the front, moving a key
to the end is `delete` then `set`, a newest-first walk means copying to an array, and a size bound
has to be written by hand around every insertion.

## Everything a `HashMap` does

`LinkedHashMap` has the same methods and results as [`HashMap`](maps.md): `set` returns the map,
`get`, `has`, `delete`, `clear`, `size`, `getOrDefault`, `put`, `remove`, `replace`,
`getOrInsert`, `getOrInsertComputed`, `compute`, `computeIfPresent`, `merge`, `replaceAll`,
`putAll`, `keys`/`values`/`entries`, `forEach((value, key, map) => …)`, SameValueZero keys (`NaN`
is one key, `-0` is stored as `0`), `null` and `undefined` as keys and values, the
[`key` and `equivalence` options](maps.md#comparing-keys-by-value), live entries, `copy`,
`toJSON` and the same rules for callbacks that change the map. `set` of a key already present
keeps it where it is; a key deleted and set again goes to the end. Keys named after built-in
properties, such as `'__proto__'` and `'constructor'`, are ordinary keys, as in a `HashMap`.

A `LinkedHashMap` is not a `HashMap` (`instanceof HashMap` is `false`); both are maps, and both
answer `true` to `isMapCollection`.

## Both ends

| Method             | Does                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------- |
| `firstEntry()`     | returns the entry of the first mapping, or `undefined`                                    |
| `lastEntry()`      | returns the entry of the last mapping, or `undefined`                                     |
| `pollFirstEntry()` | removes the first mapping and returns its entry, or `undefined`                           |
| `pollLastEntry()`  | removes the last mapping and returns its entry, or `undefined`                            |
| `putFirst(k, v)`   | inserts the mapping at the front, or moves the present mapping there and writes its value |
| `putLast(k, v)`    | inserts the mapping at the end, or moves the present mapping there and writes its value   |

The ends and polls never call a `key`, `equals` or `hash` function and never move anything, also
in access order. The entries they return are the same live handles every map returns: an entry
reads the map's current value of its key, and an entry of a removed mapping still reads its last
value but throws `IllegalStateError` on `setValue` until the key is set again.

`putFirst` and `putLast` return the map and keep the **stored** key — the argument only finds it.
Putting the first key first, or the last key last, only writes the value. Every insertion,
removal, move and value write changes `revision`.

## The reversed view

`reversed()` returns a live view of the same mappings in the opposite order, tagged
`ReversedLinkedHashMap`. Changes through either show in both, and `reversed()` on the view returns
the map.

- The view's `firstEntry`, `pollFirstEntry` and `putFirst` act on the map's last mapping or end;
  its `lastEntry`, `pollLastEntry` and `putLast` on the map's first.
- A new key inserted through the view by any method — `set`, `put`, `putAll`, `getOrInsert`,
  `getOrInsertComputed`, `compute`, `merge` — goes to the **view's** end, the map's front.
- `forEach`, `replaceAll`, `putAll`, printing and the views run in the view's order; `forEach`
  passes the view as its third argument.
- Access moves still go to the map's end and evictions still take from the map's front.

```ts
const map = new LinkedHashMap([
  ['a', 1],
  ['b', 2],
])
const view = map.reversed()
String(view) // "ReversedLinkedHashMap(2) {'b' => 2, 'a' => 1}"
view.set('z', 0) // map: {'z' => 0, 'a' => 1, 'b' => 2}
view.pollFirstEntry()?.key // 'b'
```

## Access order

With `accessOrder: true`, every read or write of a present key moves its mapping to the end, so
the first mapping is the least recently used:

- moved: `get`, `getOrDefault`, `getOrInsert` and `getOrInsertComputed` of a present key; `set`,
  `put`, `replace`, `compute`, `computeIfPresent` and `merge` that write a present key's value;
  each present key of `putAll`, the constructor and `from`;
- not moved: `has`, `containsValue`, iteration, the views (including `keySet().has`), the ends,
  an entry's `value` and `setValue`, `replaceAll`, `equals` (either way round), hashing and
  printing. `putFirst` and `putLast` put the mapping where they say.

An access move changes `revision` but is not a change for callbacks: a `compute`, `merge`,
`replaceAll`, `key`, `equals`, `hash` or `removeIf` callback may read the map without a
`ConcurrentModificationError`, and a view's `removeIf`, `removeAll` and `retainAll` decide by
mapping, whatever their predicate reads.

## Bounded size and eviction

With `maxSize: n` (a positive safe integer), inserting a new key that makes `size` exceed `n`
removes mappings from the front — the first in the map's order, skipping only the mapping that
insertion made — before the call returns. Value writes and moves never evict. In insertion order
the oldest mapping goes; in access order, the least recently used.

`onEvict(value, key, map)` is told about each evicted mapping, value first and with `this`
`undefined`, in eviction order, after the map is consistent:

```ts
interface Session {
  close(id: string): void
}
const sessions = new LinkedHashMap<string, Session>({
  accessOrder: true,
  maxSize: 1000,
  onEvict: (session, id) => session.close(id),
})
```

- `onEvict` is not called for `delete`, `remove`, polls, `clear`, view removals or replaced values.
- Evictions are queued and delivered when the outermost call on the map ends — `putAll`, the
  constructor and `from` once, after their last pair. A call made on the map from inside
  `onEvict`, or from any of the map's callbacks, only adds to the queue, so nesting never grows
  the stack; a call on another map delivers that map's own queue.
- `onEvict` may change the map — re-insert the evicted key, refill, clear — and the map stays
  consistent and within `maxSize`; the evictions it causes are delivered from the same queue.
- If `onEvict` throws, the rest of the queue is dropped and the error propagates; the call's
  insertions and evictions stay. If the call failed itself, its own error wins, and the queue is
  still delivered before it propagates. The constructor and `from` throw too.

`putAll`, the constructor and `from` set each pair as one `set` with its own access move and
eviction, so `new LinkedHashMap([['a', 1], ['b', 2], ['c', 3], ['a', 4]], { maxSize: 2 })` ends as
`{'c' => 3, 'a' => 4}` after evicting `a` then `b`.

For an LRU **set** — members only, the least recently added evicted first — wrap an access-ordered
map with `maxSize` in [`newSetFromMap`](sets-and-maps.md#newsetfrommap).

## Live iteration, moves and accesses

Iteration is live, as on a native `Map`, and never throws `ConcurrentModificationError`:

- mappings deleted before the loop reaches them are skipped;
- mappings inserted at the end the loop is heading to are visited; those inserted at the end it
  started from are not;
- `putFirst` and `putLast` act as a delete followed by an insertion at the new end;
- an **access** move never makes a loop return a mapping twice: on a forward loop an unvisited
  mapping is visited once at its new place, on a loop over `reversed()` it is skipped. So
  `for (const k of map.keys()) map.get(k)` ends after `size` steps;
- `clear()` puts an open loop before the first mapping; a loop that has finished stays finished.

A forward loop over an access-ordered map remembers the mappings it returned until it is dropped,
so release iterators you no longer need. A cursor is live too: `hasNext()` looks one mapping ahead
and that mapping is returned even if it is then deleted or moved; `remove()` removes the mapping
the cursor last returned from wherever it now stands, without calling a `key`, `equals` or `hash`
function.

## Key, entry and value views

`keySet()`, `entrySet()` and `valueCollection()` are live views in the map's (or reversed view's)
order, tagged `LinkedHashMapKeySet`, `LinkedHashMapEntrySet` and `LinkedHashMapValues`. They are
sequenced: `getFirst`, `getLast`, `removeFirst` and `removeLast` act on the ends (throwing
`NoSuchElementError` when empty, as `LinkedHashMapKeySet.getFirst: the set is empty`), and
`reversed()` is the matching view of the reversed map. Removing through a view removes the mapping;
`add`, `addAll` (with a non-empty argument), `addFirst` and `addLast` throw
`UnsupportedOperationError`.

## Options

| Option        | Default | Meaning                                                                |
| ------------- | ------- | ---------------------------------------------------------------------- |
| `key`         | none    | derive the primitive a key is found by                                 |
| `equivalence` | none    | decide key equality by `equals` and `hash`                             |
| `accessOrder` | `false` | move a mapping to the end when it is read or written                   |
| `maxSize`     | none    | the most mappings kept; a positive safe integer                        |
| `onEvict`     | none    | `(value, key, map) => void`, told about each mapping `maxSize` removed |

Each option is read once at construction, as native option objects are read: an option inherited
from the options object's prototype counts as given. A wrong type throws `TypeError`
(`LinkedHashMap: accessOrder is not a boolean (1)`); a `maxSize` that is `0`, negative, fractional,
`NaN`, `Infinity` or above `Number.MAX_SAFE_INTEGER` throws `IllegalArgumentError`
(`LinkedHashMap: maxSize must be a positive safe integer (0)`), before anything is stored. Options
are never taken from a source map, and `copy()` keeps all of them, the same `onEvict` function
included, without calling any user function.

## Equality, hashing and output

Two maps are equal when they have the same size and each maps every key of the other to an equal
value, in any order: a `LinkedHashMap` equals a `HashMap` or `TreeMap` with the same mappings,
both ways round, and comparing never reorders an access-ordered map. Equal maps that use the same
`key`, the same `equivalence`, or neither have the same `[hashCodeSymbol]` hash as an equal
`HashMap`; hash values are unspecified.

```ts
String(
  new LinkedHashMap([
    ['b', 2],
    ['a', 1],
  ]),
) // "LinkedHashMap(2) {'b' => 2, 'a' => 1}"
JSON.stringify(
  new LinkedHashMap([
    ['b', 2],
    ['a', 1],
  ]),
) // '[["b",2],["a",1]]'
```

## Cost

| Operation                                                                        | Time                                        |
| -------------------------------------------------------------------------------- | ------------------------------------------- |
| `get`, `getOrDefault`, `has`, `set`, `put`, `delete`, `remove`, `replace`        | O(1) average, plus one `key` or `hash` call |
| `putFirst`, `putLast`                                                            | as `set`                                    |
| `getOrInsert`, `getOrInsertComputed`, `compute`, `computeIfPresent`, `merge`     | O(1) average, plus the calls                |
| `firstEntry`, `lastEntry`, `pollFirstEntry`, `pollLastEntry`, view ends          | O(1) average, no user calls                 |
| an access move, each eviction                                                    | O(1), no user calls                         |
| delivering `e` evictions                                                         | O(e), plus the `onEvict` calls              |
| `reversed()`, creating a view                                                    | O(1)                                        |
| iteration step, cursor `next`                                                    | O(1) amortised                              |
| `putAll`, the constructor, `from`                                                | O(m) average for `m` pairs                  |
| `replaceAll`, `forEach`, `containsValue`, `toString`, `toJSON`, `equals`, `copy` | O(n)                                        |
| view `removeIf`, `removeAll`, `retainAll`                                        | O(n + m) average, plus the calls            |
| `clear`                                                                          | O(1) with `equivalence`; one native `clear` |

With an `equivalence`, the same seeded buckets and collision behaviour as
[`HashMap`](maps.md#cost) apply. Each mapping costs a little more memory than in a `HashMap`: it
also carries its place in the order. An open forward iteration of an access-ordered map holds memory
proportional to the mappings it has visited.

## Differences from `Map`

| `Map`                                     | `LinkedHashMap`                                     |
| ----------------------------------------- | --------------------------------------------------- |
| the last mapping needs a full walk        | `lastEntry()` in O(1)                               |
| no front insertion                        | `putFirst(k, v)`                                    |
| moving to the end is `delete` then `set`  | `putLast(k, v)`, and `putFirst(k, v)` for the front |
| a newest-first walk copies to an array    | `reversed()`, a live view                           |
| no access order                           | `accessOrder: true`                                 |
| no size bound                             | `maxSize` and `onEvict`                             |
| distinct objects are always distinct keys | a `key` or `equivalence` can make them one key      |
| `JSON.stringify` gives `{}`               | `toJSON()` gives `[key, value]` pairs               |
| `String(map)` gives `[object Map]`        | `LinkedHashMap(1) {'a' => 1}`                       |

## Types

| Type                         | What it adds                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `ReadonlySequencedMap<K, V>` | `firstEntry`, `lastEntry`, a read-only `reversed()` view, sequenced key, entry and value views |
| `SequencedMap<K, V>`         | `pollFirstEntry`, `pollLastEntry`, `putFirst`/`putLast` (insert or move), `reversed()`         |
| `LinkedHashMapOptions<K, V>` | `key` or `equivalence`, `accessOrder`, `maxSize`, `onEvict`                                    |

`LinkedHashMap<K, V>` implements `SequencedMap<K, V>`, which extends `MapCollection<K, V>`. Sorted
maps are sequenced maps too: a [`TreeMap`](sorted-maps.md) is a `SequencedMap` whose `putFirst`
and `putLast` throw `UnsupportedOperationError`, because its keys decide where a mapping goes.
Whether a `SequencedMap` iterates live or fails fast is stated by each class.
`instanceof LinkedHashMap` recognises the map from any copy of the package (not its reversed view).
Type parameters as `SequencedMap<K, V>` rather than `LinkedHashMap<K, V>`.

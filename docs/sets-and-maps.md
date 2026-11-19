# Sets and maps together

Every set in the package — [`HashSet`](sets.md), [`LinkedHashSet`](linked-hash-sets.md),
[`TreeSet`](sorted-sets.md) and its views, a map's `keySet()` and `entrySet()` — is a set by the
same rules, and every map — [`HashMap`](maps.md), [`LinkedHashMap`](linked-hash-maps.md),
[`TreeMap`](sorted-maps.md) and their views — is a map by the same rules. They compare with each
other, accept each other in bulk operations, and work with native `Set` and `Map` without
conversion code. `newSetFromMap` turns any map into a set with that map's order, equality and
eviction.

```ts
import { HashSet, LinkedHashMap, newSetFromMap, TreeSet } from 'javascript-collections-framework'

new HashSet([1, 2, 3]).equals(new TreeSet([3, 2, 1])) // true

const recent = newSetFromMap(new LinkedHashMap<string, boolean>({ accessOrder: true, maxSize: 2 }))
recent.add('a').add('b').add('a').add('c') // 'b', the least recently added, is evicted
recent.toArray() // ['a', 'c']
```

## Sets are equal across implementations

Two sets are equal when they have the same size and each side's `has` finds every member of the
other, whatever their classes or iteration order. The check runs both ways, so the answer is the
same whichever set is asked:

```ts
const keys = new HashMap([
  ['a', 1],
  ['b', 2],
]).keySet()
keys.equals(new TreeSet(['b', 'a'])) // true
new LinkedHashSet(['b', 'a']).equals(keys) // true
```

A set is never equal to a list, queue, deque, map, array or native `Set`, in either direction and
through the `equals` function too.

When one side is sorted, its comparator decides its `has`. A natural order that meets `null` or a
value of another kind answers "absent", so the sets are not equal. A comparator that throws makes
`equals` throw the same error. A comparator that treats members as equal that the other set keeps
apart (case-insensitive strings against a default set) makes the sets unequal both ways.

## Hashes and equality options

Equal sets have the same `[hashCodeSymbol]` hash when they compare members the same way: both by
default (SameValueZero, `sameValueZeroEquivalence`, or a natural or consistent order on
primitives), both with the same `key` function object, or both with the same `equivalence` object
(sets with `valueEquivalence` hash alike even across two loaded copies of the package). Otherwise
equal sets may hash differently. The hash values themselves are unspecified.

## Map views are sets

`keySet()` and `entrySet()` of every map pass the same set contract as `HashSet`: `has`, `equals`,
hashing, printing, `forEach`, the native `Set` reading methods and every removal. Removing through
a view — `delete`, `removeAll`, `retainAll`, `removeIf`, `clear` — removes the matching mappings
from the map and nothing else. Views cannot add; set mappings on the map.

The entry sets of two maps with equal mappings are equal across implementations, and each entry
set hashes as its map. The key sets of two maps with the same keys are equal to each other and to a
`HashSet` of those keys.

## Maps are equal across implementations

Two maps are equal when they have the same size, each finds every key of the other with its own key
equality, and the values are equal under `equals`. This holds across `HashMap`, `LinkedHashMap` in
either order, `TreeMap`, and their reversed and range views; comparing never reorders an
access-ordered map. Equal maps hash alike under the same conditions as sets, for their keys. A map
is never equal to a set, a list or a native `Map`.

## Copying between maps

`putAll` accepts any library map, a native `Map`, or a map's `entrySet()`. It reads the source once,
in the source's order, without reordering an access-ordered source, and stores each pair as the
target's own `set` does:

```ts
const sorted = new TreeMap<string, number>()
sorted.putAll(
  new HashMap([
    ['b', 2],
    ['a', 1],
  ]),
) // keys in order: 'a', 'b'

const bounded = new LinkedHashMap<string, number>({ maxSize: 2 })
bounded.putAll(
  new Map([
    ['a', 1],
    ['b', 2],
    ['c', 3],
  ]),
) // evicts 'a'
```

`map.putAll(map)` and `map.putAll(map.entrySet())` keep the same mappings, size and order, and
change `revision` as value writes do. A natural-order `TreeMap` given a `null` key or keys of
mixed kinds throws and stays unchanged.

## Native `Set` and `Map`

Library sets are set-like (`size`, `has`, `keys`), so the native set methods accept them as the
argument: `union`, `intersection`, `difference`, `symmetricDifference`, `isSubsetOf`,
`isSupersetOf` and `isDisjointFrom`, where the runtime has them. A set with default equality gives
the same result as a native `Set` of its members. A set with other equality is consulted through
its own `has`, so results follow its equality:

```ts
const lower = new HashSet(['A'], { key: (s: string) => s.toLowerCase() })
new Set(['a']).isSubsetOf(lower) // true
```

Library sets and maps are iterable, so `new Set(set)` and `new Map(map)` copy them in their
iteration order; and every library set and map can be built from a native `Set` or `Map` (hash and
linked collections keep the native order). The output of `Map.groupBy` can be passed straight to
`new HashMap(…)`, `new LinkedHashMap(…)` or `new TreeMap(…)`.

## newSetFromMap

`newSetFromMap(map)` returns a `SetCollection` whose members are the keys of `map`. The map must be
an empty library map (from any loaded copy of the same major version), or an empty range or
reversed view of one; a non-empty map throws `IllegalArgumentError`, and anything else — a native
`Map`, a set, a map's `keySet()` or `entrySet()`, `null` — throws `TypeError`. An empty
[immutable map](immutable.md) is accepted, but the set cannot add: `add` throws
`UnsupportedOperationError` (`ImmutableMap.getOrInsert: the collection cannot be changed`), and
its removals throw as the map's `keySet()` does. The same holds for an empty
[unmodifiable map view](unmodifiable.md).

### Recipes

An LRU set — at most `n` members, the least recently added or re-added evicted first:

```ts
const seen = newSetFromMap(
  new LinkedHashMap<string, boolean>({
    accessOrder: true,
    maxSize: 1000,
    onEvict: (_value, id) => console.log('forgot', id),
  }),
)
const id = 'user:42'
seen.add(id) // re-adding a present id makes it the most recent; has(id) does not
```

A set in a custom order:

```ts
const byLength = newSetFromMap(
  new TreeMap<string, boolean>({
    comparator: (a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0),
  }),
)
byLength.add('ccc').add('a').add('bb')
byLength.toArray() // ['a', 'bb', 'ccc']
```

### How it behaves

- **Adding** calls `map.getOrInsert(member, true)` and returns the set, so the map's key rules,
  access order, `maxSize` and `onEvict` apply. Re-adding a present member keeps the stored member
  and writes no value; `revision` stays the same, except on an access-ordered `LinkedHashMap`,
  where it is an access move.
- **`addAll`** adds one element at a time and returns `true` when some element was absent just
  before its own add — even when an eviction left `size` unchanged. It asks the map twice per
  element (`has`, then `getOrInsert`), so a `key` function, `hash` or comparator runs for both
  calls.
- **Reading and removing** go through the map's `keySet()`: iteration, `cursor`, `forEach` (whose
  third argument is the set), `delete`, `removeIf`, `removeAll`, `retainAll` and `clear` behave as
  that key set does — live for `HashMap` and `LinkedHashMap`, fail-fast for `TreeMap` and its views.
- **The map shows through**: mappings set or removed on the map appear in the set; the set's `size`
  and `revision` are the map's. Writing another value for a present key (`map.set(k, false)`)
  leaves membership unchanged.
- **Equality and output**: the set equals any set with the same members, hashes by the map's key
  equality, prints as `SetFromMap(2) {'a', 'b'}`, and `toJSON()` gives an array. It is not an
  instance of any class in the package and has no `copy()`: copy the map and wrap it again.
- **Key rules** are the map's: over a default `HashMap`, `-0` is stored as `0`, `NaN` is one
  member, and `null` and `undefined` are members; over a natural-order `TreeMap`, `null` throws
  `NullElementError` and a value of another kind throws `ClassCastError` from `add` while `has`
  returns `false`.

### Errors

| Error                                                               | Thrown by                                                 | Named after                               |
| ------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------- |
| `TypeError` for a non-iterable or non-function argument             | `addAll`, `removeAll`, `retainAll`, `removeIf`, `forEach` | `SetFromMap.<method>`                     |
| key checks, range checks (`IllegalArgumentError`), `onEvict` errors | the map, during `add` or `addAll`                         | the map (`TreeMap.getOrInsert: …`)        |
| cursor state errors, `ConcurrentModificationError`                  | iteration, `cursor`, `forEach`, removals                  | the key view (`TreeMapKeySet.forEach: …`) |

An error from the map stops `addAll` at that element: every element added before it stays (less
any evicted). A range error adds nothing for its element; an `onEvict` error leaves the element
whose add evicted stored and the evicted member removed.

### Cost

`newSetFromMap` is O(1), except over a range view of a `TreeMap`, where its emptiness check is
O(log n). Each operation of the set costs what the matching map or key set operation costs:
`has`, `add` and `delete` are the map's lookup (O(1) expected for hash maps, O(log n) for
`TreeMap`), plus eviction for a bounded `LinkedHashMap`; `size` and `isEmpty` are the map's (a
range view counts its range); `addAll` of `k` elements is `k` lookups and `k` inserts; iteration
and `removeIf` are O(n); `clear`, `removeAll` and `retainAll` cost what the key set's do.

## Types

<!-- example: not run — a signature -->

```ts
function newSetFromMap<E>(map: MapCollection<E, boolean>): SetCollection<E>
```

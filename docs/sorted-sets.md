# Sorted sets and `TreeSet`

A **sorted set** keeps its members in order while you add and remove them, and answers
"what is the nearest member to this value?" directly. `TreeSet` stores them in a balanced binary
search tree: `add`, `has`, `delete` and the nearest-match queries are O(log n), where keeping an
array sorted costs O(n) per insert or removal (a binary search, then `splice`) or O(n log n) to
`sort` after each change.

Use it for leaderboards, time-ordered events, free time slots ("the next slot at or after 10:30"),
deduplicated sorted output, or any window over a range of values.

```ts
import { TreeSet, type SortedSet } from 'javascript-collections-framework'

const slots = new TreeSet([1030, 900, 1415, 1600])
slots.ceiling(1000) // 1030: the first slot at or after 10:00
slots.floor(1500) // 1415: the last slot at or before 15:00
slots.headSet(1200).toArray() // [900, 1030]: the morning

const scores: SortedSet<number> = new TreeSet<number>({ comparator: (a, b) => b - a })
scores.add(70).add(95).add(82)
scores.getFirst() // 95: the highest, since the order is descending
```

`TreeSet` follows the [shared collection contract](collections.md) and the set contract of
[`HashSet`](sets.md): `size`, `add` returning the set, `has`, `delete`, `clear`, `keys`,
`values`, `entries`, `forEach((member, member, set) => …)`, cursors, `revision`, printing and
JSON. It is also a sequenced collection: `getFirst`, `getLast`, `removeFirst`, `removeLast` and
`reversed()`.

## Order and sameness

Without options the set uses [natural order](ordering.md): numbers, strings, bigints, booleans,
dates, or your own objects through `compareSymbol`. All members must be of one kind; adding a
string to a set of numbers throws `ClassCastError`, and so does adding a value with no natural
order (a plain object, a symbol, a function), even to an empty set. `null` and `undefined` throw
`NullElementError`. `-0` is stored as `0`, as a native `Set` does; with a `comparator`, `-0` is kept as given.

With a `comparator` option the set orders by it, and the comparator also decides **sameness**: two
values are the same member when it returns `0` for them, whatever their identity. `add` keeps the
member already present and changes nothing:

```ts
const byLength = new TreeSet<string>({ comparator: (a, b) => a.length - b.length })
byLength.add('bb').add('cc') // 'cc' has the same length as 'bb': not added
byLength.toArray() // ['bb']
byLength.has('xy') // true

interface User {
  id: number
  name: string
}
const users = new TreeSet<User>({ comparator: (a, b) => a.id - b.id })
users.add({ id: 1, name: 'Ada' })
users.has({ id: 1, name: 'someone else' }) // true: same id
```

A comparator that accepts `null` (such as `nullsFirst()`) lets the set store and find `null`.

| Constructor form                   | Gives                                              |
| ---------------------------------- | -------------------------------------------------- |
| `new TreeSet()`                    | an empty set in natural order                      |
| `new TreeSet(elements)`            | the distinct elements of any iterable, sorted      |
| `new TreeSet({ comparator })`      | an empty set ordered by `comparator`               |
| `new TreeSet(elements, options)`   | the elements, ordered by `options.comparator`      |
| `TreeSet.from(elements, options?)` | the same as the previous form; `elements` required |

- Of several equal elements, the first is kept. Elements already in ascending order are built
  into the tree directly, with one comparison per neighbouring pair.
- `comparator` is read once, when the set is created; other keys are ignored. A `comparator` that
  is not a function throws `TypeError`, and so does passing a bare function where the elements go
  (pass it as `{ comparator }`).
- A set built from another `TreeSet` does **not** take its comparator: it uses natural order unless
  you pass one. `copy()` keeps the comparator.
- `comparator()` returns the comparator, or `undefined` for natural order.

## Looking up absent values

In natural order, `has` and `delete` answer `false` for `null`, `undefined` and values of another
kind, as a native `Set` does, instead of throwing; `removeAll` and `retainAll` treat them as
matching nothing. `add`, the nearest-match queries and range bounds still throw for them. Errors
thrown by your own comparator or `compareSymbol` method always propagate.

```ts
const numbers = new TreeSet([1, 2, 3])
numbers.has('2' as never) // false
numbers.delete(null as never) // false
```

## Ends and nearest members

| Method                          | Returns                                                     |
| ------------------------------- | ----------------------------------------------------------- |
| `getFirst()`, `getLast()`       | the least or greatest member; `NoSuchElementError` if empty |
| `lower(e)`                      | the greatest member less than `e`, or `undefined`           |
| `floor(e)`                      | the greatest member less than or equal to `e`               |
| `ceiling(e)`                    | the least member greater than or equal to `e`               |
| `higher(e)`                     | the least member greater than `e`                           |
| `pollFirst()`, `pollLast()`     | removes and returns an end, or `undefined` if empty         |
| `removeFirst()`, `removeLast()` | removes and returns an end; `NoSuchElementError` if empty   |

`e` need not be a member. `addFirst` and `addLast` throw `UnsupportedOperationError`: the order
decides where a member goes, so use `add`.

## Range views

`subSet`, `headSet` and `tailSet` return **live views** of a range: changes to the set show in the
view and changes through the view reach the set.

```ts
const set = new TreeSet([10, 20, 30, 40, 50])
const middle = set.subSet(20, 40) // [20, 40): 20 and 30
set.add(25)
middle.toArray() // [20, 25, 30]
middle.delete(20) // removes 20 from the set too
middle.add(35) // fine: 35 is in range
middle.add(45) // throws IllegalArgumentError: outside the range
middle.has(50) // false: not in the view, though in the set
```

| Call                                               | Range (default)                        |
| -------------------------------------------------- | -------------------------------------- |
| `subSet(from, to)`                                 | `from` ≤ e < `to`                      |
| `subSet(from, to, { fromInclusive, toInclusive })` | as the flags say                       |
| `headSet(to)`, `headSet(to, { inclusive })`        | e < `to` (≤ with `inclusive: true`)    |
| `tailSet(from)`, `tailSet(from, { inclusive })`    | e ≥ `from` (> with `inclusive: false`) |

- The options object is read once; omitted flags, `undefined` and `null` take the defaults; other
  keys are ignored. Options that are not an object, or flags that are not booleans, throw
  `TypeError`.
- `from` after `to` throws `IllegalArgumentError`; `subSet(x, x)` is an empty view unless both
  flags are `true`.
- In natural order, a bound is checked like an element: `null` throws `NullElementError`, a value
  of another kind `ClassCastError`.
- A view's own `subSet`, `headSet` and `tailSet` give narrower views; asking for a range that
  reaches outside the view (or an inclusive end where the view's end is exclusive) throws
  `IllegalArgumentError`.
- A view's `size` counts the members in range each time, in O(k + log n) for k members. Its
  `getFirst`, `pollFirst`, navigation and iteration see only members in range.
- Views share the set's `revision`, and an iterator over the set or any view fails fast when any of
  them changes the members. Views print as `TreeSubSet(2) {20, 30}`; `isSortedSet` recognises them,
  `instanceof TreeSet` does not.

## Reversed views

`reversed()` returns a live view in descending order. Everything is mirrored: its first member is
the set's last, its `lower` is the set's `higher`, its `floor` the set's `ceiling`, and its ranges
run from greater to lesser.

```ts
const set = new TreeSet([1, 2, 3, 4, 5])
const down = set.reversed()
down.toArray() // [5, 4, 3, 2, 1]
down.lower(3) // 4: the member before 3 in descending order
down.headSet(3).toArray() // [5, 4]
down.subSet(4, 2).toArray() // [4, 3]
String(down) // 'ReversedTreeSet(5) {5, 4, 3, 2, 1}'
down.reversed() === set // true

const cursor = down.cursor() // walks from greatest to least
while (cursor.hasNext()) if (cursor.next() % 2 === 0) cursor.remove()
set.toArray() // [1, 3, 5]
```

`reversed()` works on range views too, and reversing a reversed view gives back the set or view it
came from. A reversed view's `comparator()` returns a function that orders in reverse, the same
function on every call.

## Failures change nothing

A comparator is your code, so the set guards against it:

- Every operation makes all its comparisons before it changes the tree. If the comparator (or a
  `compareSymbol` method) throws, or returns something that is not a number or is `NaN`, the call
  throws and the set is exactly as before: same members, same `size`, same `revision`, and open
  iterators keep working.
- `addAll` adds one element at a time: if a comparison fails part-way, the elements added before it
  stay. In natural order it first checks that no element is `null` or `undefined`.
- If the comparator adds or removes members of the set it is comparing for, the call throws
  `ConcurrentModificationError` and makes no further change (the comparator's own change stays).
- `removeIf`, `removeAll` and `retainAll` decide every member first, then remove; an error while
  deciding removes nothing.

## Inconsistent comparators

A comparator should be a total order: consistent signs (`compare(a, b)` and `compare(b, a)` have
opposite signs), transitive, and stable over time. If it is not — random, or reading a value that
changes while the member is in the set — lookups may give wrong answers and the same value may be
stored twice. The set still never loses or duplicates a stored member, `size` stays exact,
iteration visits each stored member once, and every call finishes within the usual number of
comparisons.

The same applies to sameness: when the comparator returns `0` for values that `equals` or a
`HashSet` would treat as different (or the other way round), a `TreeSet` and a `HashSet` with
"the same" members may disagree in `equals`, and their hashes may differ.

## Changing a set while iterating

Adding or removing members while a `for…of`, `forEach` or cursor is open — on the set or any of its
views — makes the next step throw `ConcurrentModificationError`. To remove while walking, use the
cursor's `remove()`, or `removeIf`.

## Cost

| Operation                                                                   | Time                                                               |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `add`, `has`, `delete`, `lower`, `floor`, `ceiling`, `higher`               | O(log n): at most 2⌈log2(n + 1)⌉ + 2 comparisons                   |
| `getFirst`, `getLast`, `pollFirst`, `pollLast`, `removeFirst`, `removeLast` | O(log n), no comparisons                                           |
| the same on a range view                                                    | O(log n): at most 2 more comparisons, plus a search for the ends   |
| a range view's `size`                                                       | O(k + log n) for k members in range                                |
| iteration step, cursor `next`                                               | O(1) amortised                                                     |
| a cursor's `remove()`                                                       | O(log n), no comparisons                                           |
| the constructor, `from` (elements in ascending order)                       | O(n): at most n − 1 comparisons (one when n is 1 in natural order) |
| the constructor, `from` (any other order)                                   | O(n log n)                                                         |
| `copy()`                                                                    | O(n), no comparisons                                               |
| `addAll(items)`                                                             | O(m log(n + m))                                                    |
| `removeIf`                                                                  | O(n log n) plus the calls                                          |
| `removeAll(items)`, `retainAll(items)`                                      | O((n + m) log n)                                                   |
| `clear()`                                                                   | O(1)                                                               |
| `toArray()`, `toString()`, `forEach`                                        | O(n)                                                               |
| `equals(other)`                                                             | O(n log n) plus the calls to `other.has`                           |

No operation recurses, so very large sets are safe to build, iterate, print, compare and copy.

## Equality and hashing

Two sets are equal when they have the same size and each has every member of the other, in any
order, so a `TreeSet` equals a `HashSet` or a map's `keySet()` with the same members, both ways
round. Lists, queues,
arrays and native `Set` are never equal to it. `hashCode(set)` combines the members' hashes; equal
sets get the same hash when their comparators treat as equal only values that hash alike (always
true for natural order on numbers, strings and the other primitives).

## Differences from a sorted array

| Sorted `Array`                              | `TreeSet`                                     |
| ------------------------------------------- | --------------------------------------------- |
| inserting or removing keeps order at O(n)   | `add` and `delete` are O(log n)               |
| duplicates are allowed                      | each member once; equal values are one member |
| a binary search finds the nearest value     | `lower`, `floor`, `ceiling`, `higher`         |
| `slice` copies a range                      | `subSet`, `headSet`, `tailSet` are live views |
| `arr[i]` reads the i-th smallest            | only the ends and nearest members are direct  |
| `sort()` without a comparator compares text | natural order compares numbers as numbers     |
| `null` and `undefined` can be elements      | refused in natural order                      |

## Types

| Type                   | What it adds                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `ReadonlySortedSet<E>` | `comparator`, `lower`, `floor`, `ceiling`, `higher`, read-only range and reversed views |
| `SortedSet<E>`         | `pollFirst`, `pollLast`, and views you can change through                               |
| `SubSetOptions`        | `fromInclusive`, `toInclusive`                                                          |
| `BoundOptions`         | `inclusive`                                                                             |
| `TreeSetOptions<E>`    | `comparator`                                                                            |

`TreeSet<E>` implements `SortedSet<E>`, which extends `SequencedSet<E>` (and so `SetCollection<E>`
and `SequencedCollection<E>`): sorted sets are [sequenced sets](linked-hash-sets.md#types) whose
`addFirst` and `addLast` throw `UnsupportedOperationError`. `isSortedSet(value)` recognises a `TreeSet` and its views from any copy
of the package; `isSetCollection` and `isSequencedCollection` recognise them too, and
`instanceof TreeSet` recognises the set itself. Type parameters as `SortedSet<E>` rather than
`TreeSet<E>`.

The key set of a [`TreeMap`](sorted-maps.md) is a sorted set too: `map.keySet()` answers
`floor`, `ceiling`, `getFirst` and the rest for the map's keys, removes through to the map, and
equals a `TreeSet` with the same members. It cannot add; set mappings on the map. `SubSetOptions`
and `BoundOptions` are also the options of `subMap`, `headMap` and `tailMap`.

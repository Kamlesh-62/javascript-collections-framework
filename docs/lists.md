# Lists and `ArrayList`

A list is ordered, indexed from 0, and allows duplicates. `ArrayList` is a list stored in an
array: reading and writing by index is O(1) and appending is amortised O(1).

```ts
import { ArrayList, type List } from 'javascript-collections-framework'

const list: List<number> = new ArrayList([3, 1, 2])
list.add(4).insert(0, 0) // [0, 3, 1, 2, 4]
list.sort() // [0, 1, 2, 3, 4]
list.subList(1, 3).clear() // [0, 3, 4]
list.get(5) // throws IndexOutOfBoundsError
```

`ArrayList` follows the [shared collection contract](collections.md): `size`, `has`, `add`,
`delete`, `forEach`, iteration, cursors, `revision`, `equals`, printing and JSON. For a list that
cannot change, see [immutable lists](immutable.md) (`listOf`, `copyOfList`).

## Creating a list

| Call                                  | Result                                                   |
| ------------------------------------- | -------------------------------------------------------- |
| `new ArrayList()`                     | an empty list (`undefined` and `null` too, as `new Set`) |
| `new ArrayList(iterable)`             | the iterable's elements, in order                        |
| `ArrayList.from(iterable)`            | the same                                                 |
| `ArrayList.from(iterable, fn, this?)` | `fn(element, index)` for each element, as `Array.from`   |
| `list.copy()`                         | a new, independent `ArrayList` with the same elements    |

`ArrayList.from` accepts iterables only: an array-like such as `{ length: 2 }` throws `TypeError`,
as does `null`.

## Reading

| Operation        | Returns                                                         | Time |
| ---------------- | --------------------------------------------------------------- | ---- |
| `get(i)`         | the element at `i`; throws `IndexOutOfBoundsError` out of range | O(1) |
| `getFirst()`     | the first element; throws `NoSuchElementError` when empty       | O(1) |
| `getLast()`      | the last element; throws `NoSuchElementError` when empty        | O(1) |
| `indexOf(e)`     | the lowest index of `e`, or `-1`                                | O(n) |
| `lastIndexOf(e)` | the highest index of `e`, or `-1`                               | O(n) |
| `has(e)`         | whether `e` is present                                          | O(n) |

Indexes are never coerced: `list.get('1')`, `list.get(1.5)` and `list.get(NaN)` throw
`IndexOutOfBoundsError` instead of returning `undefined`. `-0` counts as `0`.

## Changing

| Operation             | Does                                                          | Time           |
| --------------------- | ------------------------------------------------------------- | -------------- |
| `add(e)`              | appends `e`; returns the list                                 | amortised O(1) |
| `insert(i, e)`        | inserts `e` at `i`, shifting later elements; returns the list | O(n − i)       |
| `insertAll(i, items)` | inserts every item at `i`, in order                           | O(n + m)       |
| `addAll(items)`       | appends every item                                            | amortised O(m) |
| `set(i, e)`           | replaces the element at `i`; returns the old one              | O(1)           |
| `removeAt(i)`         | removes and returns the element at `i`                        | O(n − i)       |
| `delete(e)`           | removes the first `e`; returns whether one was removed        | O(n)           |
| `addFirst(e)`         | inserts at index 0; returns the list                          | O(n)           |
| `addLast(e)`          | appends, the same as `add`; returns the list                  | amortised O(1) |
| `removeFirst()`       | removes and returns the first element                         | O(n)           |
| `removeLast()`        | removes and returns the last element                          | O(1)           |
| `removeIf(pred)`      | removes the elements `pred(element, index, list)` picks       | O(n)           |
| `removeAll(items)`    | removes every element equal to one in `items`                 | O(n + m)       |
| `retainAll(items)`    | keeps only elements equal to one in `items`                   | O(n + m)       |
| `replaceAll(op)`      | replaces each element with `op(element, index, list)`         | O(n)           |
| `clear()`             | removes everything                                            | O(n)           |

**`add` appends, `insert` places.** There is no `add(index, element)`; `insert` names the
positional form. **`delete` removes by value, `removeAt` by position.** On a list of numbers,
`list.delete(1)` removes the value `1`, and `list.removeAt(1)` removes index 1.

`set`, `replaceAll` and a cursor's `set` replace elements in place: `revision` changes, and open
iterators keep working, as they do over an array. Anything that adds, removes or reorders elements
makes open iterators throw `ConcurrentModificationError` on their next step; use a cursor to change
a list while walking it.

## Sorting

`sort(comparator?)` sorts in place, keeps equal elements in their original order (stable), and
returns the list. Without a comparator it uses [natural order](ordering.md): numbers by value,
strings by UTF-16 code unit, dates by time, and your own types through `compareSymbol`.

```ts
list.sort() // natural order
list.sort(reverseOrder()) // largest first
list.sort(comparing((p) => p.age)) // by a key
list.sort(nullsLast(naturalOrder<number>())) // null and undefined last
```

It makes at most `n·⌈log₂ n⌉` comparisons. If the comparator throws, returns `NaN` or returns
something that is not a number, or natural order meets values it cannot compare, the list is left
exactly as it was and the error propagates.

## Cost of the other operations

| Operation                                          | Time                                                                                           |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `sort`                                             | O(n log n), at most `n·⌈log₂ n⌉` comparisons, O(n) extra space                                 |
| `subList`, `reversed`, `listCursor`, `cursor`      | O(1)                                                                                           |
| cursor `next`, `previous`, `set`                   | O(1)                                                                                           |
| cursor `insert`, `remove`                          | as `insert` / `removeAt` at the cursor's position                                              |
| an operation on a sub-list                         | as the same operation on the list at the mapped index, however deeply views are nested         |
| an operation on a reversed view                    | as the mirrored operation on the list: the view's `add` costs what the list's `addFirst` costs |
| `forEach`, `toArray`, `equals`, `toString`, `copy` | O(n)                                                                                           |

## Iterating and cursors

`for…of`, spread and `forEach(element, index, list)` visit the elements by index.
`listCursor(index?)` returns a cursor that moves both ways and edits at its position:

```ts
const cursor = list.listCursor()
while (cursor.hasNext()) {
  const n = cursor.next()
  if (n < 0)
    cursor.remove() // drop negatives
  else if (n === 0)
    cursor.insert(-0.5) // insert before the next element
  else cursor.set(n * 2) // replace in place
}
```

| Cursor method                    | Does                                                                      |
| -------------------------------- | ------------------------------------------------------------------------- |
| `hasNext()`, `hasPrevious()`     | whether there is an element after / before the cursor                     |
| `next()`, `previous()`           | returns that element and moves past it                                    |
| `nextIndex()`, `previousIndex()` | the index `next()` / `previous()` would return (`size`, `-1` at the ends) |
| `set(e)`                         | replaces the element the last `next()`/`previous()` returned              |
| `insert(e)`                      | inserts before the cursor                                                 |
| `remove()`                       | removes the element the last `next()`/`previous()` returned               |

`set` and `remove` need a `next()` or `previous()` first, and none of `insert`/`remove` since;
otherwise they throw `IllegalStateError`. Changes through a cursor keep it working and make other
open cursors and iterators throw `ConcurrentModificationError`.

## Views: `subList` and `reversed`

`subList(from, to)` is a live window onto `[from, to)`; `reversed()` is the list back to front.
Neither copies anything, and changes through a view reach the list:

```ts
const list = new ArrayList([0, 1, 2, 3, 4, 5])
list.subList(1, 4).clear() // list is [0, 4, 5]
list.reversed().addFirst(6) // list is [0, 4, 5, 6]
list.reversed().reversed() === list // true
```

Indexes and error messages on a view count within the view (`SubList.get: index 5 is out of
bounds for size 2`). Views print with their own name: `SubList(2) [1, 2]`, `ReversedList(3) [3, 2, 1]`.

A sub-list stays usable while the list's structure changes only through that sub-list (or views
made from it). Once the list gains or loses elements, or is sorted, in any other way —
`list.add(x)`, `list.sort()`, or a change through another sub-list — the sub-list is **stale**:
every method and `size` throw `ConcurrentModificationError`.
Its `revision` can still be read, and `console.log` shows `SubList <stale>`. Replacing elements
with `set` never makes a view stale. A reversed view of a list never goes stale; a reversed view of
a sub-list goes stale with that sub-list.

## Equality and printing

`equals(other)` is true for any list — another `ArrayList`, a sub-list, a reversed view, from any
copy of the package — of the same size whose elements are equal in order under
[`equals(a, b)`](equality.md), so nested lists compare by content. An array is never equal to a
list. Equal lists give the same hash under the `hashCodeSymbol` protocol, so lists work as keys
in value-keyed maps.

`String(list)` gives `ArrayList(3) [1, 2, 'a']`; `JSON.stringify(list)` gives `[1,2,"a"]`.

`isList(value)` and `isSequencedCollection(value)` recognise lists and their views, and
`instanceof ArrayList` recognises an `ArrayList` from any copy of the package (not its views).

## Differences from `Array`

| `Array`                                        | `ArrayList`                                                                                   |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `arr[9]` out of range is `undefined`           | `get(9)` throws `IndexOutOfBoundsError`                                                       |
| `indexOf(NaN)` is `-1`                         | `indexOf(NaN)` finds `NaN` (SameValueZero, like `includes`)                                   |
| `sort()` compares as strings                   | `sort()` uses natural order (`[10, 9]` sorts as `[9, 10]`)                                    |
| `sort` moves `undefined` to the end uncompared | `null` and `undefined` reach the comparator; natural order throws `NullElementError` for them |
| a comparator returning `NaN` counts as `0`     | it throws `TypeError` and the list is unchanged                                               |
| `Array.from` accepts array-likes               | `ArrayList.from` accepts iterables only                                                       |
| changing an array while looping is allowed     | adding, removing or sorting while iterating throws `ConcurrentModificationError`              |
| `slice` copies                                 | `subList` is a live view                                                                      |

## Types

| Type                             | What it adds                                                   |
| -------------------------------- | -------------------------------------------------------------- |
| `ReadonlySequencedCollection<E>` | `getFirst`, `getLast`, `reversed`                              |
| `SequencedCollection<E>`         | `addFirst`, `addLast`, `removeFirst`, `removeLast`             |
| `ReadonlyList<E>`                | `get`, `indexOf`, `lastIndexOf`, `listCursor`, `subList`       |
| `List<E>`                        | `set`, `insert`, `insertAll`, `removeAt`, `replaceAll`, `sort` |
| `ListCursor<E>`                  | the two-way cursor above                                       |

Type parameters and variables as `List<E>` (or `ReadonlyList<E>` for read-only access) rather than
`ArrayList<E>`. On a `ReadonlyList`, `subList` and `reversed` return `ReadonlyList`, so changing a
read-only list through a view does not compile.

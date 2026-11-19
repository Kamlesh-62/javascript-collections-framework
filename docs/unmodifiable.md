# Unmodifiable views and lists over arrays

An unmodifiable view is a read-only window onto a collection that its owner keeps changing.
Callers see every change the owner makes but cannot make their own. `asList` goes the other way:
it shows a plain array as a list, and every change made through the list writes to the array.

```ts
import { ArrayList, asList, unmodifiableList } from 'javascript-collections-framework'

class Cart {
  private readonly lines = new ArrayList<string>()
  readonly items = unmodifiableList(this.lines) // callers read, the cart writes

  add(line: string): void {
    this.lines.add(line)
  }
}

const cart = new Cart()
cart.add('tea')
cart.items.get(0) // 'tea'
cart.items.add('cake') // compile error; at run time, UnsupportedOperationError

const scores = [30, 10, 20]
asList(scores).sort()
scores // [10, 20, 30]
```

## The view functions

| Function                             | Accepts                           | Prints as                         |
| ------------------------------------ | --------------------------------- | --------------------------------- |
| `unmodifiableCollection(c)`          | any collection                    | `UnmodifiableCollection`          |
| `unmodifiableSequencedCollection(c)` | a list, deque or sequenced set    | `UnmodifiableSequencedCollection` |
| `unmodifiableList(list)`             | a list                            | `UnmodifiableList`                |
| `unmodifiableSet(set)`               | a set                             | `UnmodifiableSet`                 |
| `unmodifiableSequencedSet(set)`      | a `LinkedHashSet` or a sorted set | `UnmodifiableSequencedSet`        |
| `unmodifiableSortedSet(set)`         | a sorted set                      | `UnmodifiableSortedSet`           |
| `unmodifiableMap(map)`               | a map                             | `UnmodifiableMap`                 |
| `unmodifiableSequencedMap(map)`      | a `LinkedHashMap` or a sorted map | `UnmodifiableSequencedMap`        |
| `unmodifiableSortedMap(map)`         | a sorted map                      | `UnmodifiableSortedMap`           |

Each function checks that its argument belongs to the family, from any loaded copy of the package,
and throws `TypeError` otherwise. Each returns the matching read-only type (`ReadonlyList`,
`ReadonlySortedMap`, …). Creating a view takes O(1) time, and each operation on it costs what the
same operation on the source costs.

## What a view refuses

Every method that would change the source throws `UnsupportedOperationError`, even when the call
would change nothing (`addAll([])`, `clear()` on an empty view). The error comes before any
argument is checked, any iterable is read or any callback is called. The message names the view
and the method: `UnmodifiableList.add: the collection cannot be changed`.

The same holds for everything a view hands out:

- sub-lists and reversed views;
- range views (`subSet`, `headMap`, …);
- key, entry and value views;
- cursors: `UnmodifiableList.cursor.remove`, `UnmodifiableList.listCursor.set`;
- entries: `MapEntry.setValue`.

The read-only types make these calls compile errors too, except for cursor and entry methods,
which share their types with mutable collections.

A view does not hand out its source: not as a callback argument (`forEach` passes the view), a
view, a cursor, an entry or a `toJSON` result. Views, their iterators, cursors and entries keep
their source under a non-enumerable symbol key that the package does not export, so property
access, spread, `Object.assign` and `JSON.stringify` never reach it. A view is not a security
boundary, though: it is an ordinary object, so reflection (`Object.getOwnPropertySymbols`) can
still find the source.

## Reads show the owner's changes

Reads go to the source at the time of each call, so a view always shows the source as it is. The
same goes for everything obtained from it, such as a sub-list or a sorted map's key set.

- **Entries:** a map view hands out read-only entries that read the source's entry each time. An
  entry shows the current value, and after its key is removed it keeps the last value, as the
  source's entries do.
- **Iteration under change** follows the source. A view of a `HashSet` or `HashMap` iterates live,
  as native `Set` and `Map` do. A view of a list, deque, tree or priority queue fails fast, with
  the error named as the source names it.
- **Access order:** a `get` or `getOrDefault` through a view of an access-ordered `LinkedHashMap`
  is an access, as on the map: it moves the mapping to the end and changes `revision`. `has`,
  iteration and the ends move nothing.

## Equality, type checks and output

List, set and map views equal their source, and every collection the source equals, both ways,
with the same `[hashCodeSymbol]` hash. `unmodifiableCollection` and
`unmodifiableSequencedCollection` views, and a map view's `valueCollection()`, compare by identity,
because a collection of any family can be wrapped.

Each view answers the type checks for its own family, not its source's:
`unmodifiableSequencedCollection(list)` is a sequenced collection but not a list, and no view is a
queue or deque. Views of sorted sets and maps are also sequenced, so `unmodifiableSequencedSet` and
`unmodifiableSequencedMap` accept them.

## Wrapping a read-only collection

Read-only wrappers never nest. A view function returns its argument itself when the argument is
already a view that function would return: `unmodifiableList(view) === view`, and the same holds
for the view's sub-lists and reversed views, a sorted view's ranges, and a map view's key, entry and
value views under the function that prints the same name. Given any other unmodifiable view, or an
immutable collection from `listOf`, `setOf`, `mapOf` or the `copyOf…` factories, the function
wraps what that collection reads, so the result always carries the function's own name and family,
and entries handed out by an entry view stay read-only:

```ts
const tree = new TreeSet([1, 2, 3])
const sorted = unmodifiableSortedSet(tree)
unmodifiableSortedSet(sorted) === sorted // true
String(unmodifiableCollection(sorted)) // "UnmodifiableCollection(3) [1, 2, 3]" — reading `tree`

const entries = unmodifiableSet(mapOf(['a', 1]).entrySet())
entries.toArray()[0].setValue(2) // UnsupportedOperationError
```

The family check runs on the argument first: `unmodifiableList(unmodifiableSequencedCollection(list))`
still throws `TypeError`, because a sequenced collection view is not a list. A view seen through a
`Proxy`, a view from another loaded copy of the package, and an object that only shares a view's
prototype are wrapped like any other collection.

`toArray`, `toJSON` and iteration give what the source gives, and `revision` is the source's.

`newSetFromMap` accepts an empty unmodifiable map, but the set it returns cannot add.

## asList: a list over an array

`asList(array)` returns a list whose elements are the array itself, without copying it. Each call
returns a new, independent list.

- **Changes through the list write to the array.** `add` appends, `insert` and `removeAt` shift
  elements, and `set`, `sort`, `replaceAll` and `clear` change it in place. This also applies
  through sub-lists, the reversed view and cursors. The list moves elements with its own loops and
  never calls the array's methods, so an array subclass that overrides `push` or `splice` is not
  called.
- **Direct changes to the array show through.** A direct change of its length (`push`, `splice`,
  `length = 0`) counts as a structural change the next time the list looks: `revision` changes,
  and open iterators, cursors and sub-lists throw `ConcurrentModificationError` on their next move
  (`hasNext` never throws). So `asList(a).forEach((x) => a.push(x))` throws instead of running
  without end. The reversed view reads the length on every call and never goes stale.
- **Same-length direct changes are not detected.** `arr[0] = x`, `reverse()`, `sort()`, `fill()`,
  or a `shift()` followed by a `push()` show through but do not change `revision` and do not make
  iterators fail.
- **Frozen arrays.** A frozen array refuses every write, and a sealed or non-extensible one every
  change of length, with `TypeError` before anything is written. Native `pop` can still shrink a
  non-extensible array; the list refuses it for one simple rule.
- **Other locked arrays.** Only frozen, sealed and non-extensible arrays are checked. An element
  made non-writable or non-configurable with `Object.defineProperty`, or a `Proxy` array, can make
  a write fail part-way and leave elements shifted.
- **Holes** read as `undefined`. A write may turn holes into stored `undefined` elements.

To search a sorted array in O(log n), wrap it: `binarySearch(asList(array), key)` (see
[algorithms](algorithms.md)).

### Differences from the array's own methods

| `Array`                                                   | `asList(array)`                                                                                                                         |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `indexOf` uses `===` (`NaN` is never found)               | `indexOf` uses SameValueZero, as `includes` does                                                                                        |
| `sort()` sorts by string, puts `undefined` and holes last | `sort()` uses natural order and throws `NullElementError` for `null`, `undefined` and holes; a comparator receives holes as `undefined` |
| an index out of range reads `undefined`                   | `get` throws `IndexOutOfBoundsError`                                                                                                    |
| no value equality                                         | `equals` compares with any list by elements; never equal to the array                                                                   |
| prints as an array                                        | prints as `ArrayListView(n) [...]`; `toJSON` returns a new array                                                                        |

| Operation                        | Time           |
| -------------------------------- | -------------- |
| `asList`, `get`, `set`, `size`   | O(1)           |
| `add`                            | amortised O(1) |
| `insert`, `removeAt`, `removeIf` | O(n)           |
| `sort`                           | O(n log n)     |

# Collections: the shared contract

Every collection in this package — lists, sets, queues, deques — implements one contract, so code
written against it works with any of them.

> Available now: the `ReadonlyCollection`, `Collection` and `Cursor` types, `isCollection`,
> [`ArrayList`](lists.md), [`HashSet`](sets.md), [`TreeSet`](sorted-sets.md),
> [`ArrayDeque`](deques.md), [`LinkedList`](linked-lists.md) and
> [`PriorityQueue`](priority-queues.md). The other collection classes arrive in later releases and
> all follow this contract. Maps such as [`HashMap`](maps.md) and [`TreeMap`](sorted-maps.md) are
> not collections; their `keySet()`, `entrySet()` and `valueCollection()` views are (a `TreeMap`'s
> key set is a sorted set).

```ts
import type { Collection, Cursor, ReadonlyCollection } from 'javascript-collections-framework'
import { isCollection } from 'javascript-collections-framework'
```

## Reading and changing

The names are the ones native `Set` uses, with the same results:

| Operation                  | Returns                                                                    |
| -------------------------- | -------------------------------------------------------------------------- |
| `size`                     | the number of elements                                                     |
| `has(e)`                   | whether an equal element is present (SameValueZero by default, like `Set`) |
| `add(e)`                   | the collection, so calls chain: `c.add(1).add(2)`                          |
| `delete(e)`                | whether an element was removed                                             |
| `clear()`                  | nothing                                                                    |
| `forEach(action, thisArg)` | nothing; calls `action` once per element                                   |

And operations native collections lack:

| Operation             | Returns                                                       |
| --------------------- | ------------------------------------------------------------- |
| `isEmpty()`           | `size === 0`                                                  |
| `toArray()`           | a new array of the elements                                   |
| `addAll(items)`       | whether anything was added                                    |
| `removeAll(items)`    | whether anything was removed                                  |
| `retainAll(items)`    | whether anything was removed                                  |
| `removeIf(predicate)` | whether anything was removed                                  |
| `equals(other)`       | whether the two are equal, as the collection's family defines |

The bulk operations read their whole argument before changing anything, so passing the collection
itself, or an iterable that throws part-way, is safe. `removeAll`, `retainAll` and `removeIf`
decide which elements go before removing any, so an error thrown by your code while they decide
leaves the collection unchanged. `addAll` adds one element at a time; if your code throws part-way
(a comparator, for example), the elements added before the error stay.

There is no `containsAll`. Write `[...items].every((e) => c.has(e))`.

## Iterating

Every collection is iterable: `for…of`, spread and `Array.from` work, and where the runtime has
the ES2025 iterator helpers (`map`, `filter`, `take`, `toArray`, …) they work on its iterators.

### Changing a collection while iterating it

Collections behave in one of two ways, fixed per class:

- **Live** — hash collections (`HashSet`, `HashMap` and their linked variants), exactly like native
  `Set` and `Map`: deleting during a loop is allowed, elements deleted before they are reached are
  skipped, added elements are visited, and nothing throws.

  ```ts
  for (const id of seen) if (expired(id)) seen.delete(id) // fine
  ```

- **Fail-fast** — collections with no native counterpart (lists, deques, priority queues, sorted
  sets and maps): adding or removing elements during a loop, other than through the cursor doing
  the walking, makes the next step throw `ConcurrentModificationError`, so the bug shows up where
  it happens. Replacing an element in place does not count.

`removeIf` and `removeAll`/`retainAll` throw `ConcurrentModificationError` in both kinds if your
callback adds or removes elements while they decide.

### Removing while iterating: cursors

A cursor walks a collection and can remove the element it just returned:

```ts
const cursor = numbers.cursor()
while (cursor.hasNext()) {
  if (cursor.next() < 0) cursor.remove()
}
```

`next()` returns the element itself, so a cursor is not a JavaScript iterator: `for…of` over a
cursor is an error. On a fail-fast collection, a change made through one cursor keeps it valid and
makes every other open cursor and iterator throw. On a live collection, `remove()` deletes the
element by value (no error if it is already gone), and once `hasNext()` has seen an element the
following `next()` returns it.

## Watching for changes: `revision`

`revision` is a number that changes whenever the contents change — adding, removing, or replacing
an element — and never when the collection is only read. Frameworks can use it to know when to
re-render:

```ts
const snapshot = useSyncExternalStore(subscribe, () => collection.revision)
```

Its exact values are not part of the API; compare it only for "changed or not".

## Equality

A collection equals only itself unless its family defines value equality: lists compare by their
elements in order, sets by their members, maps by their entries (each family's page says how).
`a.equals(b)` always gives the same answer as `b.equals(a)`. Collections take part in the
[equality protocol](equality.md), so under `valueEquivalence` an equal list can be found as a key.
A collection that contains itself can still be compared, hashed and printed.

## Printing and JSON

```ts
String(list) // "ArrayList(3) [1, 2, 'a']"
String(set) // "HashSet(2) {1, 2}"
```

Strings are quoted, `-0` stays visible, arrays and nested collections print the same way, functions
print as `[Function: name]`, and a collection that contains itself prints `[Circular]` in its place.
Other objects print with their own `toString`, as `Array.prototype.join` does. In Node, `console.log`
shows the class name, size and elements in Node's own style.

`JSON.stringify(collection)` writes an array of the elements. A collection that contains itself
cannot be written as JSON: `JSON.stringify` fails with the engine's error.

## Recognising a collection

```ts
isCollection(value) // true for any collection from this package, even another loaded copy
```

Maps, arrays and native `Set`/`Map` are not collections; `isMapCollection` recognises a
[map](maps.md).

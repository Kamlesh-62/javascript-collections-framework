# Linked hash sets and `LinkedHashSet`

`LinkedHashSet` is a set in insertion order — like native `Set` and [`HashSet`](sets.md) — that
can also be read and changed at **both ends**: the first and last member, removing either,
inserting at the front, moving a member to either end, and walking the set newest first through a
live reversed view. Each of these takes O(1) amortised (average for those that look up or
remove).

```ts
import { LinkedHashSet } from 'javascript-collections-framework'

const recent = new LinkedHashSet(['a', 'b', 'c'])
recent.addLast('a') // moves 'a' to the end: LinkedHashSet(3) {'b', 'c', 'a'}
recent.getFirst() // 'b' — the oldest
recent.removeFirst() // 'b'
recent.addFirst('z') // LinkedHashSet(3) {'z', 'c', 'a'}
const newestFirst = [...recent.reversed()] // ['a', 'c', 'z']
```

To hand out a read-only view, use [`unmodifiableSequencedSet`](unmodifiable.md).

## When to use it

| Need                                                                   | Use                           |
| ---------------------------------------------------------------------- | ----------------------------- |
| members in insertion order, `has`/`add`/`delete`                       | `Set` or [`HashSet`](sets.md) |
| the same, plus the last member, front insertion or "move to front/end" | `LinkedHashSet`               |
| a recently-used list, a de-duplicated queue, a "move to top" history   | `LinkedHashSet`               |
| members kept sorted                                                    | [`TreeSet`](sorted-sets.md)   |

On a native `Set` the last member needs a full walk, the first can be removed only through an
iterator, nothing inserts at the front, and a newest-first walk means copying to an array.

## Everything a `HashSet` does

`LinkedHashSet` has the same methods and results as [`HashSet`](sets.md): `add` returns the set,
`has`, `delete`, `clear`, `size`, `keys`/`values`/`entries`, `forEach((e, e, set) => …)`,
SameValueZero membership (`NaN` is one member, `-0` is stored as `0`), `null` and `undefined` as
members, the [`key` and `equivalence` options](sets.md#comparing-members-by-value), the bulk methods,
cursors, `copy`, `toJSON` and the same rules for functions that change the set. `add` of a member
already present keeps it where it is; a member deleted and added again goes to the end.

```ts
const users = new LinkedHashSet<{ id: number }>({ key: (user) => user.id })
```

A `LinkedHashSet` is not a `HashSet` (`instanceof HashSet` is `false`); both are sets, and both
answer `true` to `isSetCollection`. `LinkedHashSet` also answers `true` to `isSequencedCollection`.

## Both ends

| Method          | Does                                                                    |
| --------------- | ----------------------------------------------------------------------- |
| `getFirst()`    | returns the first member                                                |
| `getLast()`     | returns the last member                                                 |
| `removeFirst()` | removes and returns the first member                                    |
| `removeLast()`  | removes and returns the last member                                     |
| `addFirst(e)`   | inserts `e` at the front, or moves the member equal to `e` to the front |
| `addLast(e)`    | inserts `e` at the end, or moves the member equal to `e` to the end     |

On an empty set the first four throw `NoSuchElementError` (`LinkedHashSet.getFirst: the set is
empty`) and change nothing. None of them calls a `key`, `equals` or `hash` function: the member
is removed by the key or hash stored with it.

`addFirst` and `addLast` return the set. A move keeps the **stored** member — the argument only
finds it:

```ts
const people = new LinkedHashSet([{ id: 1, name: 'Ada' }], { key: (p) => p.id })
people.addLast({ id: 1, name: 'other' })
people.getLast().name // 'Ada'
```

Moving a member to the end it is already at changes nothing, `revision` included. Every insertion,
removal and move changes `revision`.

## The reversed view

`reversed()` returns a live view of the same members in the opposite order. Changes through
either show in both, and `reversed()` on the view returns the set.

- The view's `getFirst`, `removeFirst` and `addFirst` act on the set's last member or end; its
  `getLast`, `removeLast` and `addLast` on the set's first.
- `add(e)` on the view inserts an absent `e` at the **view's** end — the set's front — and keeps a
  present member where it is. `addAll` adds each element in turn, so `view.addAll([a, b])` leaves
  the view ending `…, a, b`.
- `removeIf`, `removeAll` and `retainAll` visit members in the view's order; `forEach` passes the
  view as its third argument.
- `has`, `delete`, `clear`, `size`, `revision`, equality and the hash are the set's.

```ts
const set = new LinkedHashSet([1, 2, 3])
const view = set.reversed()
String(view) // 'ReversedLinkedHashSet(3) {3, 2, 1}'
view.add(0) // set: {0, 1, 2, 3}
view.removeFirst() // 3
```

## Live iteration with moves

Iteration is live, as on a native `Set`, and never throws `ConcurrentModificationError`:

- members deleted before the loop reaches them are skipped;
- members inserted at the end the loop is heading to are visited; members inserted at the end it
  started from are not (on the set, `add`/`addLast` are visited and `addFirst` is not; on the
  reversed view the other way round);
- a move acts as a delete followed by an insertion at the new end: the loop visits the member again
  only when its new place is still ahead, as native `delete` then `add` does. Moving the member the
  loop just returned lets the loop continue from that member's old neighbour;
- `clear()` puts an open loop before the first member, so members added afterwards at the end are
  visited; a loop that has finished stays finished.

```ts
const set = new LinkedHashSet([1, 2, 3])
for (const n of set) {
  if (n === 2) set.addFirst(3) // 3 moves behind the loop: not visited
}
// visited: 1, 2
```

**Warning:** `for (const x of set) set.addLast(x)` never ends: each member moves ahead of the loop
and is reached again, exactly as `for (const x of set) { set.delete(x); set.add(x) }` never ends on
a native `Set`.

A cursor is live too. `hasNext()` looks one member ahead and that member is returned even if it is
then deleted or moved. `remove()` removes the member the cursor last returned from wherever it now
stands, without calling a `key`, `equals` or `hash` function; if that member is already gone, it
deletes an equal member by value.

## Equality, hashing and output

Two sets are equal when they have the same members, in any order: a `LinkedHashSet` equals a
`HashSet` or `TreeSet` with the same members, both ways round. Equal sets that use the same `key`,
the same `equivalence`, or neither have the same `[hashCodeSymbol]` hash as an equal `HashSet`,
whatever the order; hash values are unspecified.

```ts
String(new LinkedHashSet([2, 1])) // 'LinkedHashSet(2) {2, 1}'
JSON.stringify(new LinkedHashSet([2, 1])) // '[2,1]'
```

`new LinkedHashSet(source)` and `LinkedHashSet.from(source)` keep the source's iteration order,
the first of equal elements winning — so a reversed view as the source gives newest first. Options
are never taken from a source set. `copy()` keeps the members, the order and the options and calls
no user function.

## Open iterators and changed keys

An open iterator or cursor keeps the members removed since its last step reachable until it
advances or is dropped, so release iterators you no longer need — especially when a set is used
as a queue with many removals.

As with [`HashSet`](sets.md), members are found by their `key` result or `hash` when they are
stored. If that changes while a member is in the set, lookups, `addFirst`, `addLast` and `delete`
give unspecified results for it; `removeFirst`, `removeLast`, a cursor's `remove`, `removeIf` and
`clear` still remove it.

## Cost

| Operation                                          | Time                                                                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `add`, `has`, `delete`                             | O(1) average, plus one `key` or `hash` call                                                          |
| `addFirst`, `addLast`                              | O(1) amortised average, plus one `key` or `hash` call                                                |
| `getFirst`, `getLast`, `removeFirst`, `removeLast` | O(1) amortised average, no user calls                                                                |
| `reversed()`                                       | O(1)                                                                                                 |
| iteration step, cursor `next` and `remove`         | O(1) amortised over the steps and the changes made while the iterator is open (average for `remove`) |
| `removeIf`, `removeAll`, `retainAll`               | O(n + m) average, plus the calls                                                                     |
| `addAll`                                           | O(m) average                                                                                         |
| `clear`                                            | O(1) with `equivalence`; one native `clear`                                                          |
| `toArray`, `copy`, `toString`, `forEach`, `equals` | O(n)                                                                                                 |

A set without the `key` or `equivalence` option keeps its members in a native `Set` until the first
call that needs linked order: `addFirst`, `addLast` of a member, `getLast`, `removeLast`, or any
call through `reversed()`. That call costs O(n), once in the set's life, which is why the rows above
that can make it are amortised; everything else then runs on linked records as before.

With an `equivalence`, the same seeded buckets and collision behaviour as
[`HashSet`](sets.md#cost) apply. Each member costs a little more memory than in a `HashSet`: it
also carries its place in the order.

## Differences from `Set`

| `Set`                                           | `LinkedHashSet`                                   |
| ----------------------------------------------- | ------------------------------------------------- |
| the last member needs a full walk               | `getLast()` in O(1) amortised                     |
| the first member is removed through an iterator | `removeFirst()`, `removeLast()`                   |
| no front insertion                              | `addFirst(e)`                                     |
| moving to the end is `delete` then `add`        | `addLast(e)`, and `addFirst(e)` for the front     |
| a newest-first walk copies to an array          | `reversed()`, a live view                         |
| distinct objects are always distinct members    | a `key` or `equivalence` can make them one member |
| `JSON.stringify` gives `{}`                     | `toJSON()` gives an array of the members          |
| `String(set)` gives `[object Set]`              | `LinkedHashSet(2) {1, 2}`                         |

## Types

| Type                      | What it adds                                                                     |
| ------------------------- | -------------------------------------------------------------------------------- |
| `ReadonlySequencedSet<E>` | a set with `getFirst`, `getLast` and a read-only `reversed()` view               |
| `SequencedSet<E>`         | `addFirst`/`addLast` (insert or move), `removeFirst`, `removeLast`, `reversed()` |
| `LinkedHashSetOptions<E>` | `key` or `equivalence`                                                           |

`LinkedHashSet<E>` implements `SequencedSet<E>`, which extends `SetCollection<E>` and
`SequencedCollection<E>`. Sorted sets are sequenced sets too: a [`TreeSet`](sorted-sets.md) is a
`SequencedSet` whose `addFirst` and `addLast` throw `UnsupportedOperationError`, because its order
decides where a member goes. Whether a `SequencedSet` iterates live or fails fast is stated by
each class. `instanceof LinkedHashSet` recognises the set from any copy of the package (not its
reversed view). Type parameters as `SequencedSet<E>` rather than `LinkedHashSet<E>`.

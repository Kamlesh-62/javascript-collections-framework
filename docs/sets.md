# Sets and `HashSet`

A **set** holds each member once. `HashSet` is a drop-in for native `Set`: the same methods with
the same results, insertion order, SameValueZero membership and live iteration. On top of that it
can compare members by value, compares whole sets by their members, and has the shared
[collection API](collections.md) (`removeIf`, `removeAll`, `retainAll`, cursors, `toJSON`).

```ts
import { HashSet, type SetCollection } from 'javascript-collections-framework'

const tags = new HashSet(['a', 'b'])
tags.add('a').add('c') // HashSet(3) {'a', 'b', 'c'}
tags.has('b') // true
tags.delete('b') // true
const members = [...tags] // ['a', 'c']
```

## A drop-in for `Set`

| Native `Set`                                              | `HashSet`                                            |
| --------------------------------------------------------- | ---------------------------------------------------- |
| `add(e)` returns the set                                  | the same                                             |
| `has(e)`, `delete(e)`, `clear()`                          | the same                                             |
| `size`                                                    | the same                                             |
| `keys()`, `values()`, `entries()`                         | the same; `entries()` yields `[e, e]`                |
| `forEach((e, e, set) => …, thisArg)`                      | the same                                             |
| insertion order                                           | the same                                             |
| `NaN` is one member, `-0` is stored as `0`                | the same                                             |
| `null` and `undefined` are members                        | the same                                             |
| `new Set(set)`, spread, `Set.prototype.union` and friends | accept a `HashSet` (it has `size`, `has` and `keys`) |

`new HashSet(iterable)` and `HashSet.from(iterable)` take any iterable, strings included
(`new HashSet('aba')` holds `'a'` and `'b'`), and keep the first of each group of equal values.

## Comparing members by value

By default two distinct objects are two members, as in `Set`. Pass **one** of two options to
change that (both together throw `TypeError`):

**`key`** — the usual choice. A function that gives each value the primitive it should be found
by; two values with SameValueZero-equal keys are one member. The original values are stored and
returned, never the keys.

```ts
interface User {
  id: number
  name: string
}
const users = new HashSet<User>({ key: (user) => user.id })
users.add({ id: 1, name: 'Ada' }).add({ id: 1, name: 'Ada L.' })
users.size // 1 — the first one stays
users.has({ id: 1, name: '' }) // true
```

**`equivalence`** — an object with `equals` and `hash`, for equality a single key cannot express.
`valueEquivalence` uses the [`equalsSymbol`/`hashCodeSymbol` protocol](equality.md) of your
classes:

```ts
import { HashSet, valueEquivalence } from 'javascript-collections-framework'

const points = new HashSet<Point>({ equivalence: valueEquivalence })
points.add(new Point(1, 2)).add(new Point(1, 2))
points.size // 1 when Point implements the protocol

const caseless = new HashSet<string>({
  equivalence: {
    equals: (a, b) => a.toLowerCase() === b.toLowerCase(),
    hash: (s) => hashCode(s.toLowerCase()),
  },
})
```

The options are read once, when the set is created, and `copy()` and `HashSet.from(items,
options)` keep them. `key`, `equals` and `hash` are called with `null` and `undefined` like any
other value, and never with `-0` (it becomes `0` first). The set checks what they return:
`key` must return a primitive, `equals` a boolean and `hash` a finite number, or the call throws
`TypeError` naming the method (`HashSet.add: key function returned object`).

`sameValueZeroEquivalence` gives exactly the default behaviour.

### Calls

A set calls `key` (or `hash`) once per value you pass in and never again for a member it already
holds: the derived key or hash is stored with the member and reused when the set grows, shrinks
or removes it. `removeAll` and `retainAll` derive the keys (or hashes) of their argument once
each and compare them with the stored ones.

### Changing a member while it is in the set

Do not change the fields a member's key or hash depends on while it is in the set. If you do,
nothing breaks, but `has`, `add` and `delete` for that member give unspecified results. A cursor's
`remove()`, `removeIf` and `clear()` still remove it, because they use the stored key or hash
instead of computing a new one.

### Functions that change the set

A `key`, `equals` or `hash` function may read the set, but if it adds, deletes or clears members,
the call that ran it throws `ConcurrentModificationError` once the function returns. That call
makes no change of its own; the function's changes stay. An error thrown by the function itself
propagates unchanged.

## Live iteration

Iteration works exactly as on a native `Set`: members deleted before the loop reaches them are
skipped, members added during the loop are visited, a member deleted and added again moves to the
end, and `clear()` ends the loop (members added after it are visited). Nothing throws
`ConcurrentModificationError`.

```ts
const queue = new HashSet([1])
for (const n of queue) {
  if (n < 4) queue.add(n + 1) // visited: 1, 2, 3, 4
}
```

A cursor is live too: `hasNext()` looks one member ahead and that member is returned even if it is
deleted before `next()`. Its `remove()` removes the member it last returned; if that member is
already gone, it deletes an equal member by value.

## Equality, hashing and output

Two sets are equal when they have the same size and each has every member of the other, in any
order: `new HashSet([1, 2]).equals(new HashSet([2, 1]))` is `true`. Each side is checked with its
own `has`, so the answer is the same both ways round even when the two sets compare members
differently. Lists, queues, maps, arrays and native `Set` are never equal to a set.

Equal sets that use the same `key` function, the same `equivalence` object, or neither, have the
same `[hashCodeSymbol]` hash; the hash values themselves are unspecified. A set that contains
itself prints `[Circular]` and can still be compared and hashed.

```ts
String(new HashSet([1, 'a'])) // "HashSet(2) {1, 'a'}"
JSON.stringify(new HashSet([1, 2])) // '[1,2]' — JSON.stringify(new Set([1, 2])) is '{}'
```

## Cost

| Operation                                          | Time                                        |
| -------------------------------------------------- | ------------------------------------------- |
| `add`, `has`, `delete`                             | O(1) average, plus one `key` or `hash` call |
| iteration step, cursor `next` and `remove`         | O(1) (average for `remove`)                 |
| `removeIf`, `removeAll`, `retainAll`               | O(n + m) average, plus the calls            |
| `addAll`                                           | O(m) average                                |
| `clear`                                            | O(1) with `equivalence`; one native `clear` |
| `toArray`, `copy`, `toString`, `forEach`, `equals` | O(n)                                        |

With no option or with `key`, each operation is one native `Set` or `Map` operation. With an
`equivalence`, members live in hash buckets whose layout is seeded per set, so it cannot be
predicted from outside; a bucket that grows long with different hashes is re-laid with a new seed.
Values that all return the **same** hash cannot be told apart by any layout, so with such an
equivalence `add`, `has` and `delete` degrade to O(n). With `valueEquivalence`, symbols are hashed
by their description, so many symbols with one description share a hash in the same way. Hash values, seeds, the bucket layout and
when it changes are unspecified.

## Differences from `Set`

| `Set`                                        | `HashSet`                                         |
| -------------------------------------------- | ------------------------------------------------- |
| distinct objects are always distinct members | a `key` or `equivalence` can make them one member |
| `JSON.stringify` gives `{}`                  | `toJSON()` gives an array of the members          |
| `String(set)` gives `[object Set]`           | `HashSet(2) {1, 2}`                               |
| no structural equality                       | `equals` compares members                         |
| no bulk removal                              | `removeIf`, `removeAll`, `retainAll`              |

## Types

| Type                       | What it adds                                             |
| -------------------------- | -------------------------------------------------------- |
| `ReadonlySetCollection<E>` | `keys`, `values`, `entries`, `forEach((e, e, set) => …)` |
| `SetCollection<E>`         | the changing methods of `Collection`                     |
| `HashSetOptions<E>`        | `key` or `equivalence`                                   |

`isSetCollection(value)` recognises a set from any copy of the package (native `Set` is not one);
`instanceof HashSet` recognises a `HashSet`. Type parameters as `SetCollection<E>` rather than
`HashSet<E>`.

For a set kept in sorted order, with nearest-match queries and range views, see
[sorted sets and `TreeSet`](sorted-sets.md). A `TreeSet` and a `HashSet` with the same members are
equal.

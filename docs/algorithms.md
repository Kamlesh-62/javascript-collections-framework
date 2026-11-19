# Algorithms

Free functions for common tasks on lists and iterables: binary search and insertion points,
reversing, rotating, shuffling, swapping and filling in place, the least and greatest element,
counting, overlap and sub-list search. They work on every list in the package — `ArrayList`, its
sub-lists and reversed views, immutable lists, unmodifiable views and lists over arrays (`asList`)
— and the inspecting functions take any iterable.

```ts
import {
  ArrayList,
  asList,
  binarySearch,
  max,
  rotate,
  shuffle,
  sortedIndex,
} from 'javascript-collections-framework'

const scores = [10, 20, 30, 40]
binarySearch(asList(scores), 30) // 2
sortedIndex(asList(scores), 25) // 2: insert 25 at index 2 to keep the order

const list = new ArrayList(['a', 'b', 'c'])
rotate(list, 1) // ['c', 'a', 'b']
shuffle(list)

max(new Set([3, 9, 4])) // 9
```

| Function                             | Does                                                             | Time                                                                       |
| ------------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `binarySearch(list, key, cmp?)`      | first index whose element equals `key` in a sorted list, or `-1` | O(log n)                                                                   |
| `sortedIndex(list, key, cmp?)`       | where `key` belongs in a sorted list (the first index not less)  | O(log n)                                                                   |
| `reverse(list)`                      | reverses in place                                                | O(n)                                                                       |
| `rotate(list, distance)`             | moves each element `distance` places right (negative: left)      | O(n)                                                                       |
| `shuffle(list, random?)`             | random order, every permutation equally likely                   | O(n)                                                                       |
| `swap(list, i, j)`                   | exchanges two elements                                           | O(1)                                                                       |
| `fill(list, element)`                | sets every element                                               | O(n)                                                                       |
| `min(elements, cmp?)`                | least element, or `undefined` when empty                         | O(n)                                                                       |
| `max(elements, cmp?)`                | greatest element, or `undefined` when empty                      | O(n)                                                                       |
| `frequency(elements, element)`       | how many elements are SameValueZero-equal to `element`           | O(n)                                                                       |
| `disjoint(a, b)`                     | whether `a` and `b` share no element                             | O(n + m) with a hash set, O(n log m) with a sorted one, O(n·m) with a list |
| `indexOfSubList(source, target)`     | first index of `target` as a run inside `source`, or `-1`        | O(n·m)                                                                     |
| `lastIndexOfSubList(source, target)` | last index of that run, or `-1`                                  | O(n·m)                                                                     |

`cmp` is a comparator `(a, b) => number`; without one, natural order is used (numbers, strings,
bigints, booleans, dates, and objects with a `[compareSymbol]` method). `null` is not accepted in
place of a comparator.

## Searching a sorted list

`binarySearch` and `sortedIndex` assume the list is sorted by the same comparator; on an unsorted
list their answer is unspecified. `binarySearch` returns the _first_ matching index when there are
duplicates, and `-1` when there is none — the same convention as `indexOf`. `sortedIndex` returns
the insertion point: the index of the first element that does not compare less than the key, which
is `list.size` when every element does.

```ts
const sorted = asList([1, 3, 3, 7])
binarySearch(sorted, 3) // 1
binarySearch(sorted, 4) // -1
sortedIndex(sorted, 4) // 3
```

Natural order refuses `null` and `undefined` (`NullElementError`) and values of different kinds
(`ClassCastError`), as `list.sort` does; search a list that holds `null` with `nullsFirst()` or
`nullsLast()`. Those errors come only from comparisons actually made, so searching an empty list
never throws. A comparator that changes the list while the search runs makes it throw
`ConcurrentModificationError` — any change through the list counts, even a `set`.

To search an array, wrap it: `binarySearch(asList(array), key)` reads the array in place.

## Rearranging in place

`reverse`, `rotate`, `shuffle`, `swap` and `fill` change the list through `set` only, as writing
`array[i]` would. Iterators and cursors that are open on the list stay valid and see the new
order — unlike `list.sort`, which counts as a structural change and makes them throw. `revision`
changes whenever something is written; a call that writes nothing (reversing one element,
rotating by a multiple of the size, `swap(list, i, i)`, filling an empty list) leaves it as it was.

On a read-only list, the list's own refusal propagates as soon as a write would happen
(`UnsupportedOperationError`, or `TypeError` for `asList` over a frozen array); a call that writes
nothing does not throw.

`rotate` accepts any safe integer and reduces it modulo the size, so `rotate(list, -1)` moves the
first element to the end. A distance that is not a number throws `TypeError`; `NaN`, infinity, a
fraction or an unsafe integer throws `IllegalArgumentError`.

## Shuffling

`shuffle` uses the Fisher–Yates method: with a uniform `random`, every permutation is equally
likely. It calls `random` once per element after the first, max(size − 1, 0) times, each time
expecting a number in `[0, 1)`; if `random` throws, the swaps made before stay and the error
propagates. Pass a seeded generator to get the same order every time:

```ts
function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), state | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const deck = new ArrayList(['ace', 'king', 'queen'])
shuffle(deck, seeded(42)) // the same order on every run
```

The default is `Math.random`, which is not cryptographically secure. A value outside `[0, 1)` or
`NaN` throws `IllegalArgumentError` and a non-number throws `TypeError`, before the swap it would
drive; the swaps already made stay, so the list still holds its elements in some order.

## The least and greatest element

`min` and `max` take any iterable — arrays, native `Set`s, every collection in the package — and
return `undefined` when it is empty. Among equal elements they return the first one met. They walk
the input once and never spread it into a call, so a million elements are fine (unlike
`Math.max(...array)`). A single element is returned without a comparison, so `min([undefined])` is
also `undefined`: check the size first when the input may hold `undefined`.

## Counting and overlap

`frequency` counts elements that are SameValueZero-equal to the value, as `includes` would match
them. It does not use a set's own `key`, `equivalence` or comparator: on a set that ignores case,
`frequency(set, 'ann')` can be `0` while `set.has('ann')` is `true`.

`disjoint(a, b)` answers whether no element is in both. When `b` is a collection from this package,
each element of `a` is looked up with `b.has`, so `b`'s own equality applies; otherwise, when `a` is
one, the elements of `b` are looked up in `a`; otherwise the elements are compared with
SameValueZero. Two collections that compare differently can therefore give a different answer
depending on the order of the arguments. Maps are iterated as their entries, so pass `map.keys()` to
compare keys.

## Differences from `Array` methods

| `Array`                                              | Here                                                            |
| ---------------------------------------------------- | --------------------------------------------------------------- |
| `array.reverse()` and `array.fill(v)` on arrays only | `reverse(list)` and `fill(list, v)` on any list, views included |
| `indexOf` (by `===`) scans every element             | `binarySearch` uses the order, in O(log n)                      |
| no insertion point, rotate, swap or shuffle          | `sortedIndex`, `rotate`, `swap`, `shuffle`                      |
| `Math.min(...array)` overflows on large arrays       | `min`/`max` iterate, with an optional comparator                |

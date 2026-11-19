# Behaviour notes

The collections follow `Array`, `Map` and `Set` wherever those define an operation. This page
lists the behaviours that most often surprise someone new to the library, each with a short
example and a link to the page that covers it in full. The examples on this page run in sequence,
as one program.

## `undefined` for absence, and where reads throw

A lookup that finds nothing returns `undefined`, as `Map.prototype.get` does: `get` on a map,
`peek` and `poll` on an empty queue, `floor` or `ceiling` with no match. Two kinds of read throw
instead, because there is no value to return and `undefined` could be a stored element: an index
outside `0 … size − 1` throws `IndexOutOfBoundsError`, and asking an empty collection for an end
(`getFirst`, `getLast`, `removeFirst`, `removeLast`) throws `NoSuchElementError`.

```ts
import {
  ArrayDeque,
  ArrayList,
  asList,
  HashMap,
  HashSet,
  LinkedList,
  PriorityQueue,
  TreeSet,
  unmodifiableCollection,
} from 'javascript-collections-framework'

new HashMap<string, number>().get('a') // undefined
new PriorityQueue<number>().poll() // undefined
new TreeSet([10, 20]).floor(5) // undefined
new ArrayList([1, 2, 3]).get(3) // throws IndexOutOfBoundsError
new ArrayDeque<number>().getFirst() // throws NoSuchElementError
```

See [lists](lists.md#reading), [maps](maps.md#reading-writing-and-absence) and
[errors](errors.md).

## `delete(e)` and `removeAt(i)`; map `delete(k)` and `remove(k)`

On a list, `delete(e)` removes by value and returns whether it removed one, as `Set.delete` does;
`removeAt(i)` removes by position and returns the element. On a list of numbers the difference
matters. On a map, `delete(k)` returns whether a mapping was removed, as `Map.delete` does, and
`remove(k)` returns the removed value.

```ts
const numbers = new ArrayList([10, 1, 20])
numbers.delete(1) // true — the value 1 is removed
numbers.removeAt(1) // 20 — the element at index 1 is removed
numbers.toArray() // [10]

const stock = new HashMap([['tea', 3]])
stock.remove('tea') // 3
stock.delete('tea') // false
```

See [lists](lists.md#changing) and [maps](maps.md#reading-writing-and-absence).

## `set` and `put`; `list.set` returns the old element

A map's `set(k, v)` returns the map, as `Map.set` does, so calls chain; `put(k, v)` returns the
previous value, or `undefined`. A list's `set(i, e)` replaces the element at `i` and returns the
element it replaced, not the list.

```ts
const ages = new HashMap<string, number>()
ages.set('ann', 31).set('bob', 27).size // 2
ages.put('ann', 32) // 31

const letters = new ArrayList(['a', 'b'])
letters.set(0, 'z') // 'a'
```

See [maps](maps.md#reading-writing-and-absence) and [lists](lists.md#changing).

## Live and fail-fast iteration

Hash collections — `HashSet`, `HashMap` and their linked variants — iterate live, exactly as native
`Set` and `Map` do: deleting during a loop is allowed and added elements are visited. Lists,
deques, priority queues and sorted collections fail fast: adding or removing an element during a
loop, other than through the cursor doing the walking, makes the next step throw
`ConcurrentModificationError`.

```ts
const seen = new HashSet([1, 2, 3])
for (const n of seen) if (n === 1) seen.add(4) // allowed; 4 is visited
seen.size // 4

const items = new ArrayList([1, 2, 3])
const loop = () => {
  for (const n of items) if (n === 1) items.add(4)
}
loop() // throws ConcurrentModificationError
```

See [collections](collections.md#changing-a-collection-while-iterating-it).

## A priority queue iterates in heap order

`poll` returns the least element each time, but iterating, spreading or printing a
`PriorityQueue` visits the elements in the order of its internal heap, which is not sorted. To
read the elements in order, poll them, or copy them into a sorted list.

```ts
const tasks = new PriorityQueue([5, 1, 4, 2, 3])
String(tasks) // heap order, for example PriorityQueue(5) [1, 2, 4, 5, 3]
tasks.peek() // 1
tasks.poll() // 1
```

See [priority queues](priority-queues.md#iteration-is-not-sorted).

## Sorted collections decide sameness by their comparator

A `TreeSet` or `TreeMap` treats two values as the same member or key when its comparator returns
`0` for them, whatever their identity: a set ordered by length holds one string of each length.

```ts
const byLength = new TreeSet<string>({ comparator: (a, b) => a.length - b.length })
byLength.add('bb').add('cc').size // 1
byLength.has('xy') // true
```

See [sorted sets](sorted-sets.md#order-and-sameness) and
[sorted maps](sorted-maps.md#order-and-sameness).

## `values()` and `valueCollection()`

`values()` returns an iterator, as `Map.prototype.values` does. `valueCollection()` returns a live
`Collection` of the values: it has a `size`, follows the map, and removing a value through it
removes the mapping.

```ts
const prices = new HashMap([
  ['tea', 3],
  ['cake', 0],
])
;[...prices.values()] // [3, 0]
prices.valueCollection().delete(0) // true
prices.has('cake') // false
```

See [maps](maps.md#views-and-entries).

## Collections that compare by identity

`ArrayList` (and every list view), sets and maps compare by content. `LinkedList`, queues,
deques, a map's `valueCollection()` and the views from `unmodifiableCollection` compare by
identity: each equals only itself.

```ts
new ArrayList([1]).equals(new ArrayList([1])) // true
new LinkedList([1]).equals(new LinkedList([1])) // false
new ArrayDeque([1]).equals(new ArrayDeque([1])) // false
new PriorityQueue([1]).equals(new PriorityQueue([1])) // false
unmodifiableCollection(new ArrayList([1])).equals(new ArrayList([1])) // false
```

See [`LinkedList`](linked-lists.md#iteration-the-reversed-view-and-equality),
[deques](deques.md#equality), [priority queues](priority-queues.md#equality),
[maps](maps.md#views-and-entries) and
[unmodifiable views](unmodifiable.md#equality-type-checks-and-output).

## Views and `asList` follow their source

`subList`, `reversed`, `keySet`, range views and the unmodifiable views copy nothing: they read
their source on every call, so they show its later changes, and changes made through a writable
view reach the source. `asList(array)` is a list over the array itself: writing through the list
writes to the array.

```ts
const list = new ArrayList([0, 1, 2, 3])
const middle = list.subList(1, 3)
middle.set(0, 9)
list.get(1) // 9

const scores = [30, 10, 20]
asList(scores).sort()
scores // [10, 20, 30]
```

See [lists](lists.md#views-sublist-and-reversed),
[unmodifiable views](unmodifiable.md#reads-show-the-owners-changes) and
[`asList`](unmodifiable.md#aslist-a-list-over-an-array).

## A deque's `push` returns the deque

`Array.prototype.push` returns the new length. A deque's `push`, like its `add`, returns the deque,
so calls chain; `pop` removes and returns the last element, as on an array.

```ts
const stack = new ArrayDeque<number>()
stack.push(1).push(2).size // 2
stack.pop() // 2
```

See [deques](deques.md#operations).

## `sort()` uses natural order

`Array.prototype.sort` without a comparator compares elements as strings, so `[10, 9]` stays
`[10, 9]`. A list's `sort()` without a comparator uses natural order: numbers by value, strings by
UTF-16 code unit, dates by time.

```ts
const sizes = new ArrayList([10, 9, 100])
sizes.sort()
sizes.getFirst() // 9
```

See [ordering](ordering.md#natural-order) and [lists](lists.md#sorting).

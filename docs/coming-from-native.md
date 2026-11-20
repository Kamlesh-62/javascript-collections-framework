# Coming from native JavaScript

Each section below starts from a pattern written with `Array`, `Map` or `Set`, shows the same
work with a collection from this library, states the cost of the operation that differs, and says
when the native structure remains the better choice. Collections follow the native names where
an operation exists natively (`size`, `has`, `get`, `set`, `delete`, `for…of`, spread), so most
code changes only where the native structure falls short.

## `Array` and `ArrayList`

An array is the default list. `ArrayList` is a list with a checked index, a `List` interface
shared with `LinkedList` and the read-only views, and live sub-list and reversed views.

```ts
const names = ['Ada', 'Grace']
names.push('Alan')
names[5] // undefined: out of range reads quietly
```

```ts
import { ArrayList } from 'javascript-collections-framework'

const people = new ArrayList(['Ada', 'Grace'])
people.add('Alan')
people.get(1) // 'Grace'
people.get(5) // throws IndexOutOfBoundsError
people.subList(1, 3).toArray() // ['Grace', 'Alan']: a live view, not a copy
;[...people] // ['Ada', 'Grace', 'Alan']
```

**Complexity:** the same. Reading by index is O(1) in both, and adding at the end is amortised
O(1).

**Keep the array** when the data is a plain sequence passed to code that expects an array, or
sent through `JSON` or `postMessage` as it is.

## `Map`/`Set` and `HashMap`/`HashSet`

`HashMap` and `HashSet` keep the native names, insertion order and SameValueZero equality. The
difference is the `key` option: two different objects can be the same key.

```ts
const visits = new Map<{ id: number }, number>()
visits.set({ id: 1 }, 1)
visits.set({ id: 1 }, 2)
visits.size // 2: two objects, two keys
```

```ts
import { HashMap, HashSet } from 'javascript-collections-framework'

const byId = new HashMap<{ id: number }, number>({ key: (user) => user.id })
byId.set({ id: 1 }, 1)
byId.set({ id: 1 }, 2)
byId.size // 1: the same id, the same key
byId.get({ id: 1 }) // 2

const tags = new HashSet<string>(['a', 'b'])
tags.has('a') // true
```

**Complexity:** the same: `get`, `set`, `has` and `delete` are O(1) on average in both. With
`key`, each operation also calls the `key` function once.

**Keep `Map` and `Set`** when keys are primitives or are compared by reference: they are built
into the engine and add nothing to a bundle.

## A sorted array and `TreeSet`/`TreeMap`

Keeping an array sorted means finding the position and calling `splice` on every insert.
`TreeSet` and `TreeMap` keep their order as elements are added, and answer nearest-match and range
queries.

```ts
const sorted = [10, 30]
const at = sorted.findIndex((n) => n > 20)
sorted.splice(at === -1 ? sorted.length : at, 0, 20)
sorted // [10, 20, 30]
```

```ts
import { TreeMap, TreeSet } from 'javascript-collections-framework'

const scores = new TreeSet([10, 30])
scores.add(20)
;[...scores] // [10, 20, 30]
scores.floor(25) // 20: the greatest element at or below 25
scores.ceiling(25) // 30

const events = new TreeMap([
  [900, 'stand-up'],
  [1400, 'planning'],
])
events.headMap(1200).toJSON() // [[900, 'stand-up']]: the keys below 1200
```

**Complexity:** an insert into a sorted array is O(n), because `splice` moves every later
element; `TreeSet.add` and `TreeMap.set` are O(log n). Nearest-match queries are O(log n) in both
when the array is searched by bisection.

**Keep the sorted array** when it is built once and then only read: a binary search over an array
is O(log n) too, and the array uses less memory.

## An array as a queue and `ArrayDeque`

`shift` takes from the front of an array, and the language defines it as moving every remaining
element down by one.
`ArrayDeque` adds and removes at both ends without moving anything.

```ts
const waiting = ['a', 'b', 'c']
waiting.push('d')
waiting.shift() // 'a'
```

```ts
import { ArrayDeque } from 'javascript-collections-framework'

const queue = new ArrayDeque(['a', 'b', 'c'])
queue.push('d')
queue.poll() // 'a': from the front
queue.pop() // 'd': from the back
queue.addFirst('z')
;[...queue] // ['z', 'b', 'c']
```

**Complexity:** `Array.prototype.shift` is O(n) in the worst case (engines may do better for some
array sizes); `ArrayDeque.poll` is O(1), and `push` and
`addFirst` are amortised O(1).

**Keep the array** when the queue stays small or is only ever added to at the end and read with
`pop`.

## A hand-written heap and `PriorityQueue`

Taking the smallest element first needs a binary heap. Without one, code sorts the array on every
insert or searches it on every removal.

```ts
const jobs = [5, 1, 3]
jobs.sort((a, b) => a - b)
jobs.shift() // 1: but each insert needs another sort
```

```ts
import { PriorityQueue } from 'javascript-collections-framework'

const pending = new PriorityQueue([5, 1, 3])
pending.add(0)
pending.poll() // 0
pending.poll() // 1
pending.peek() // 3

const latest = new PriorityQueue<number>({ comparator: (a, b) => b - a })
latest.add(1).add(9)
latest.poll() // 9: the comparator decides the order
```

**Complexity:** a hand-written binary heap is also O(log n) for `add` and `poll`; sorting on each
insert is O(n log n). `PriorityQueue` is a heap with a tested contract and the shared `Queue`
interface.

**Keep a hand-written heap** when a few lines in one file are all that is needed and a dependency
is not.

## The `Map` LRU trick and `LinkedHashMap`

A `Map` iterates in insertion order, so deleting and re-setting a key on each read moves it to the
end, and the first key is then the least recently used. `LinkedHashMap` does this itself with
`accessOrder`, and evicts with `maxSize`.

```ts
const recent = new Map<string, number>([
  ['a', 1],
  ['b', 2],
])
const value = recent.get('a')
if (value !== undefined) {
  recent.delete('a')
  recent.set('a', value)
}
recent.set('c', 3)
if (recent.size > 2) recent.delete(recent.keys().next().value as string)
;[...recent.keys()] // ['a', 'c']
```

```ts
import { LinkedHashMap } from 'javascript-collections-framework'

const cache = new LinkedHashMap<string, number>({ accessOrder: true, maxSize: 2 })
cache.set('a', 1).set('b', 2)
cache.get('a') // 1: now the most recently used
cache.set('c', 3) // evicts 'b'
;[...cache.keys()] // ['a', 'c']
```

**Complexity:** the same: O(1) on average per read and per write in both. `LinkedHashMap` adds the eviction
rule, an `onEvict` callback and the `MapCollection` interface.

**Keep the `Map` trick** when the cache is one small function and its size limit never changes.

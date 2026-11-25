# Priority queues and `PriorityQueue`

A **priority queue** hands out its least element next, whatever order the elements were added in.
`PriorityQueue` stores them as a binary heap: `add` and `poll` are O(log n) and `peek` is O(1),
where keeping an array sorted costs O(n) or more per insert (a binary-search `splice`, or `push`
then `sort`) or O(n) per removal (`sort` once, then `shift`).

Use it for schedulers (run the most urgent job next), shortest-path searches, top-k selection and
event simulations — anywhere the question is "what is the smallest one now?".

```ts
import { PriorityQueue, type Queue } from 'javascript-collections-framework'

const numbers = new PriorityQueue([5, 1, 4])
numbers.add(2).add(3)
numbers.poll() // 1
numbers.peek() // 2

interface Job {
  name: string
  priority: number
}
const jobs: Queue<Job> = new PriorityQueue<Job>({
  comparator: (a, b) => a.priority - b.priority,
})
jobs.add({ name: 'deploy', priority: 2 }).add({ name: 'hotfix', priority: 1 })
jobs.poll() // { name: 'hotfix', priority: 1 }
```

`PriorityQueue` follows the [shared collection contract](collections.md) and the `Queue`
interface: `size`, `has`, `add`, `delete`, `forEach`, iteration, cursors, `revision`, printing and
JSON. It is not a deque: there is no `push`, `pop`, `peekLast` or `reversed()`.

Recipes: [the k largest values of a stream](../examples/recipes/top-k.mjs), [merging sorted arrays](../examples/recipes/merge-sorted.mjs), [a running median](../examples/recipes/running-median.mjs). More in [recipes](recipes.md).

## Order and options

Without options the queue uses [natural order](ordering.md): numbers, strings, bigints, booleans,
dates, or your own objects through `compareSymbol`. All elements must be of one kind; adding a
string to a queue of numbers throws `ClassCastError`, and so does adding a value with no natural
order (a plain object, a symbol, a function), even to an empty queue.

With a `comparator` option the queue orders by it: the element for which no other compares less is
polled first. Reverse the order to poll the largest first:

```ts
import { PriorityQueue, reverseOrder } from 'javascript-collections-framework'

const largestFirst = new PriorityQueue([3, 9, 4], { comparator: reverseOrder<number>() })
largestFirst.poll() // 9
```

| Constructor form                         | Gives                                              |
| ---------------------------------------- | -------------------------------------------------- |
| `new PriorityQueue()`                    | an empty queue in natural order                    |
| `new PriorityQueue(elements)`            | the elements of any iterable, in natural order     |
| `new PriorityQueue({ comparator })`      | an empty queue ordered by `comparator`             |
| `new PriorityQueue(elements, options)`   | the elements, ordered by `options.comparator`      |
| `PriorityQueue.from(elements, options?)` | the same as the previous form; `elements` required |

Options are read as native option objects are: an option inherited from the options object's
prototype counts as given.

- `comparator` is read once, when the queue is created; other keys are ignored. A `comparator`
  that is not a function throws `TypeError`, and so does passing a bare function where the
  elements go (pass it as `{ comparator }`).
- `elements` may be `undefined` or `null` for an empty queue (not in `from`).
- A queue built from another `PriorityQueue` does **not** take its comparator: it uses natural
  order unless you pass one. `copy()` keeps the comparator.
- `comparator()` returns the comparator, or `undefined` for natural order.

## Iteration is not sorted

`for…of`, `forEach`, `toArray()`, `toJSON()` and `toString()` visit the elements in **heap
order**: the first is the least, the rest are in an order that is not sorted and not specified.
All of them use the same order between changes. For sorted output, take the elements out with
`poll`:

```ts
const queue = new PriorityQueue([5, 1, 4, 2, 3])
String(queue) // heap order, not sorted: for example PriorityQueue(5) [1, 2, 4, 5, 3]
queue.peek() // 1

const sorted: number[] = []
while (!queue.isEmpty()) sorted.push(queue.poll()!)
sorted // [1, 2, 3, 4, 5]
```

To sort without emptying the queue, drain a `copy()`.

## Ties

When several elements compare as equal, which of them `poll` returns first is unspecified; it is
not necessarily the one added first. To break ties by arrival, add a sequence number and compare
it last:

```ts
let sequence = 0
const fair = new PriorityQueue<{ priority: number; seq: number }>({
  comparator: (a, b) => a.priority - b.priority || a.seq - b.seq,
})
fair.add({ priority: 1, seq: sequence++ })
```

## `null` and `undefined` are not allowed

Every way of adding — `add`, `addAll`, the constructor, `from` — throws `NullElementError` for
`null` or `undefined`, and `addAll`, the constructor and `from` check every element before adding
any. In return, `undefined` from `poll()` or `peek()` always means "empty":

```ts
const run = (job: Job) => job.name
for (let job = jobs.poll(); job !== undefined; job = jobs.poll()) run(job)
```

`has(null)` and `delete(undefined)` simply return `false`.

## Finding and removing

`has(e)` and `delete(e)` look for an element equal to `e` under SameValueZero, as `Set` and
`Array.prototype.includes` do — **not** under the comparator. Two different objects that compare as
equal are still different elements, so `delete` removes only the one you pass:

```ts
const a = { priority: 1 }
const b = { priority: 1 }
const queue = new PriorityQueue([a, b], { comparator: (x, y) => x.priority - y.priority })
queue.delete({ priority: 1 }) // false: no such object
queue.delete(b) // true: a stays
```

## Failures change nothing

A comparator is your code, so the queue guards against it:

- If the comparator (or a `compareSymbol` method) throws, or returns something that is not a
  number or is `NaN`, the call throws and the queue is exactly as before: same elements, same
  `size`, same `revision`, and open iterators keep working. This holds for `add`, `poll`, `delete`,
  a cursor's `remove()`, `removeIf`, `removeAll` and `retainAll`.
- `addAll` adds one element at a time: if a comparison fails part-way, the elements added before it
  stay and the failing one is not added. The constructor and `from` throw and return nothing.
- If the comparator adds or removes elements of the queue it is comparing for, the call throws
  `ConcurrentModificationError` and makes no further change (the comparator's own change stays).
- A comparator that is inconsistent — random, or not transitive — can only spoil the order in which
  `poll` returns elements. Nothing is lost or duplicated, `size` stays exact, and every call
  finishes.

## Changing a queue while iterating

Adding or removing elements while a `for…of`, `forEach` or cursor is open makes the next step throw
`ConcurrentModificationError`. To remove while walking, use the cursor's `remove()`; the cursor
still visits every other element exactly once:

```ts
const queue = new PriorityQueue(
  [
    { priority: 2, cancelled: true },
    { priority: 1, cancelled: false },
  ],
  { comparator: (a, b) => a.priority - b.priority },
)
const cursor = queue.cursor()
while (cursor.hasNext()) if (cursor.next().cancelled) cursor.remove()
queue.size // 1
```

## Cost

| Operation                                     | Time                                                 |
| --------------------------------------------- | ---------------------------------------------------- |
| `add(e)`                                      | O(log n): at most ⌊log2 n⌋ + 1, n the size after     |
| `poll()`                                      | O(log n): at most 2⌊log2 n⌋ comparisons              |
| `peek()`, `size`, `isEmpty()`, `comparator()` | O(1), no comparisons                                 |
| `has(e)`                                      | O(n), no comparisons                                 |
| `delete(e)`                                   | O(n) to find, then at most 2⌊log2 n⌋ + 1 comparisons |
| a cursor's `remove()`                         | O(log n); O(n) for an element moved behind it        |
| the constructor, `from`                       | O(n): at most 2n comparisons                         |
| `copy()`                                      | O(n), no comparisons                                 |
| `addAll(items)`                               | O(m log(n + m))                                      |
| `removeIf`, `removeAll`, `retainAll`          | O(n + m) plus the calls, then at most 2n comparisons |
| `clear()`                                     | O(1)                                                 |
| `toArray()`, `toString()`, `forEach`          | O(n)                                                 |

No operation recurses, so very large queues are safe to build, drain and print. `removeIf`,
`removeAll` and `retainAll` rebuild the heap in a second array, so they use O(n) extra memory while
they run.

## Equality

Two queues are equal only when they are the same object: `new PriorityQueue([1]).equals(new
PriorityQueue([1]))` is `false`. To compare contents, compare sorted copies, for example by
draining a `copy()` of each.

## Differences from a sorted array

| Sorted `Array`                              | `PriorityQueue`                               |
| ------------------------------------------- | --------------------------------------------- |
| inserting keeps it sorted at O(n) or more   | `add` is O(log n)                             |
| `shift()` takes the smallest in O(n)        | `poll()` takes the least in O(log n)          |
| iterating gives sorted order                | iterating gives heap order; drain with `poll` |
| `arr[i]` reads the i-th smallest            | only the least (`peek`) is reachable directly |
| `null` and `undefined` can be elements      | they throw `NullElementError`                 |
| `sort()` without a comparator compares text | natural order compares numbers as numbers     |

## Types

`PriorityQueue<E>` implements `Queue<E>`; type parameters as `Queue<E>` when any queue will do.
`PriorityQueueOptions<E>` is exported as a type. `isQueue` and `isCollection` recognise a
`PriorityQueue` from any copy of the package (`isDeque` does not), and `instanceof PriorityQueue`
recognises the queue itself.

Through a `Proxy`, a deque or queue equals itself (`proxy.equals(proxy)` is `true`); the collection
itself does not know its proxies. See [frameworks](frameworks.md#proxies).

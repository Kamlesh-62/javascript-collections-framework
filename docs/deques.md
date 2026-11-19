# Queues, deques and `ArrayDeque`

A **queue** hands out its elements one at a time: `add` puts an element in, `poll` takes the next
one out, `peek` looks at it without taking it. A **deque** (double-ended queue) is a queue you can
change at both ends. `ArrayDeque` is a deque stored in a circular array: adding at either end is
amortised O(1) and removing is O(1), where `Array.prototype.shift` and `unshift` are O(n).

```ts
import { ArrayDeque, type Deque } from 'javascript-collections-framework'

// As a queue: first in, first out.
const jobs = new ArrayDeque<string>()
jobs.add('build').add('test')
jobs.poll() // 'build'

// As a stack: push and pop at the end, as on an array.
const history: Deque<number> = new ArrayDeque()
history.push(1).push(2)
history.pop() // 2
```

`ArrayDeque` follows the [shared collection contract](collections.md): `size`, `has`, `add`,
`delete`, `forEach`, iteration, cursors, `revision`, printing and JSON.

[`LinkedList`](linked-lists.md) is the other deque: it stores `null` and `undefined` and adds node
handles for O(1) insertion and removal next to a known element. For a queue that hands out its
least element first instead of its oldest, see [`PriorityQueue`](priority-queues.md).

## Operations

| Operation                                                 | Does                                                                         | Time                    |
| --------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------- |
| `add(e)`, `addLast(e)`, `push(e)`                         | adds at the end; returns the deque                                           | amortised O(1)          |
| `addFirst(e)`                                             | adds at the front; returns the deque                                         | amortised O(1)          |
| `poll()`                                                  | removes and returns the first element, or `undefined`                        | O(1)                    |
| `pop()`                                                   | removes and returns the last element, or `undefined`                         | O(1)                    |
| `peek()`, `peekLast()`                                    | returns the first / last element, or `undefined`                             | O(1)                    |
| `removeFirst()`, `removeLast()`                           | removes and returns the first / last; throws `NoSuchElementError` when empty | O(1)                    |
| `getFirst()`, `getLast()`                                 | returns the first / last; throws `NoSuchElementError` when empty             | O(1)                    |
| `has(e)`                                                  | whether `e` is present                                                       | O(n)                    |
| `delete(e)`                                               | removes the first `e`, searching from the front                              | O(n)                    |
| `removeIf(pred)`, `removeAll(items)`, `retainAll(items)`  | removes in one pass                                                          | O(n + m) plus the calls |
| `addAll(items)`                                           | adds every item at the end, after checking them all                          | amortised O(m)          |
| `clear()`, `toArray()`, `copy()`, `toString()`, `forEach` | as for every collection                                                      | O(n)                    |
| `cursor()`                                                | a cursor from front to back; its `remove()` is O(n)                          | O(1)                    |
| `reversed()`                                              | a live view back to front                                                    | O(1)                    |

`poll`, `peek` and `pop` return `undefined` when the deque is empty; `removeFirst`, `getFirst`,
`removeLast` and `getLast` throw `NoSuchElementError` instead. Pick whichever suits the call site.

## `null` and `undefined` are not allowed

Every way of adding an element — `add`, `addFirst`, `push`, `addAll`, the constructor, `from` —
throws `NullElementError` for `null` or `undefined`, and `addAll` checks every element before
adding any. In return, `undefined` from `poll()`, `peek()` or `pop()` always means "empty":

```ts
// Breadth-first search.
interface TreeNode {
  children: TreeNode[]
}
const start: TreeNode = { children: [{ children: [] }, { children: [] }] }
const queue = new ArrayDeque([start])
for (let node = queue.poll(); node !== undefined; node = queue.poll()) {
  for (const next of node.children) queue.add(next)
}
```

`has(null)` and `delete(undefined)` simply return `false`.

A deque holds at most 2^30 elements; adding past that throws `IllegalStateError` before anything
changes (in practice the runtime usually runs out of memory first).

## The reversed view

`reversed()` is the deque back to front, without copying. Changes through it reach the deque at
the other end: the view's `push` adds at the deque's front, its `poll` is the deque's `pop`.

```ts
const deque = new ArrayDeque([1, 2, 1, 3])
deque.reversed().peek() // 3
deque.reversed().delete(1) // removes the last 1: deque is [1, 2, 3]
const cursor = deque.reversed().cursor() // walks 3, 2, 1
deque.reversed().reversed() === deque // true
```

The view never goes stale: it always shows the deque as it is now. It prints as
`ReversedDeque(3) [3, 2, 1]`.

## Changing a deque while iterating

Adding or removing elements while a `for…of`, `forEach` or cursor is in progress makes the next
step throw `ConcurrentModificationError`. To remove while walking, use the cursor's `remove()`;
to process and drain, loop on `poll()` as above.

## Equality

Two deques are equal only when they are the same object: `new ArrayDeque([1]).equals(new
ArrayDeque([1]))` is `false`. Compare `toArray()` results to compare contents. A deque is never
equal to a list.

## Differences from `Array`

| `Array`                                    | `ArrayDeque`                                                            |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| `shift()` and `unshift()` are O(n)         | `poll()` and `addFirst()` are O(1)                                      |
| `push(e)` returns the new length           | `push(e)` returns the deque, so calls chain                             |
| `pop()` returns `undefined` when empty     | the same                                                                |
| `null` and `undefined` can be elements     | they throw `NullElementError`                                           |
| `arr[i]` reads any position                | no index access: read the ends, or iterate                              |
| changing an array while looping is allowed | adding or removing while iterating throws `ConcurrentModificationError` |

## Types

| Type               | What it adds                                                      |
| ------------------ | ----------------------------------------------------------------- |
| `ReadonlyQueue<E>` | `peek`                                                            |
| `Queue<E>`         | `poll` (and `add` from `Collection`)                              |
| `ReadonlyDeque<E>` | `peekLast`, `getFirst`, `getLast`, `reversed`                     |
| `Deque<E>`         | `addFirst`, `addLast`, `removeFirst`, `removeLast`, `push`, `pop` |

`isQueue(value)` and `isDeque(value)` recognise deques and their views from any copy of the
package; `instanceof ArrayDeque` recognises an `ArrayDeque` (not its view). Type parameters as
`Queue<E>` or `Deque<E>` rather than `ArrayDeque<E>`.

Through a `Proxy`, a deque or queue equals itself (`proxy.equals(proxy)` is `true`); the collection
itself does not know its proxies. See [frameworks](frameworks.md#proxies).

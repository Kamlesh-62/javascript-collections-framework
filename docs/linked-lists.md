# `LinkedList` and node handles

`LinkedList` is a [deque](deques.md) stored as a doubly linked list. What it adds is **node
handles**: a reference to one element's position that stays valid while the list changes around
it, so you can insert or remove next to that element in O(1). Arrays shift every later element
(`splice` is O(n)); `ArrayDeque` only works at the ends.

Reach for it when code keeps hold of positions: a cache moving an entry to the front, an editor
inserting next to a cursor, a scheduler unlinking a cancelled task. For a plain queue or stack,
`ArrayDeque` keeps elements in one array and needs no node per element; for index access, use [`ArrayList`](lists.md).

```ts
import { LinkedList, type LinkedListNode } from 'javascript-collections-framework'

const list = new LinkedList<string>(['b', 'd'])
const d = list.lastNode()! // the handle of 'd'
list.insertBefore(d, 'c') // ['b', 'c', 'd']
list.addFirstNode('a') // ['a', 'b', 'c', 'd']
list.removeNode(d) // 'd'; list is ['a', 'b', 'c']
```

`LinkedList` follows the [shared collection contract](collections.md) and every `Deque` operation
of [`ArrayDeque`](deques.md): `add`/`poll` as a queue, `push`/`pop` at the end as a stack,
`peek`/`peekLast`, `getFirst`/`getLast`, `removeFirst`/`removeLast`, `has`, `delete`, `reversed()`.

## Handles

| Method                      | Does                                                         | Time |
| --------------------------- | ------------------------------------------------------------ | ---- |
| `addFirstNode(e)`           | adds at the front; returns the new handle                    | O(1) |
| `addLastNode(e)`            | adds at the end; returns the new handle                      | O(1) |
| `insertBefore(node, e)`     | inserts just before `node`'s element; returns the new handle | O(1) |
| `insertAfter(node, e)`      | inserts just after `node`'s element; returns the new handle  | O(1) |
| `removeNode(node)`          | removes `node`'s element and returns it                      | O(1) |
| `firstNode()`, `lastNode()` | the handle at each end, or `undefined` when empty            | O(1) |

A handle (`LinkedListNode<E>`) has three members:

- `value` — the element; setting it replaces the element in place;
- `next`, `previous` — the neighbouring handles, or `undefined` at the ends.

Each element has **exactly one handle** for as long as it is in the list, whichever method added
it: `list.addLastNode(1) === list.lastNode()`, and `node.next.previous === node`. Handles can be
`Map` keys.

### Moving an entry to the front (a small LRU cache)

```ts
const order = new LinkedList<string>()
const where = new Map<string, LinkedListNode<string>>()

function touch(key: string): void {
  const node = where.get(key)
  if (node !== undefined) order.removeNode(node)
  where.set(key, order.addFirstNode(key)) // removing and adding again gives a new handle
  if (order.size > 100) where.delete(order.pop()!)
}
```

### Walking and removing

`next` and `previous` always show the list as it is now, and walking by handles never throws. To
remove while walking, read `next` first:

```ts
for (let node = list.firstNode(); node !== undefined; ) {
  const next = node.next
  if (node.value.startsWith('#')) list.removeNode(node)
  node = next
}
```

### Removed handles

Once its element is removed — by `removeNode`, `poll`, `delete`, `clear`, a cursor, the reversed
view or anything else — a handle's `next` and `previous` are `undefined` and its `value` can still
be read. Passing it to `insertBefore`, `insertAfter` or `removeNode` throws
`IllegalArgumentError`, as does a handle of another list or a value that is not a handle; nothing
changes. Setting the `value` of a removed handle throws `IllegalStateError`.

A handle prints as `LinkedListNode { value: 1 }` and shows nothing else: `JSON.stringify(node)` is
`'{}'` and `Object.keys(node)` is `[]`. Serialise `node.value`, or the list itself.

## `null` and `undefined` are stored

As in an array, `null` and `undefined` are ordinary elements. So `poll()`, `peek()` and `pop()`
return `undefined` both for an empty list and for a stored `undefined`. Tell them apart with
`isEmpty()`, or use the throwing forms:

```ts
while (!queue.isEmpty()) handle(queue.poll())
// or: queue.removeFirst() throws NoSuchElementError only when the list is empty
```

`has(undefined)` and `delete(null)` find stored empty values.

## Operations and costs

| Operation                                                                             | Time                    |
| ------------------------------------------------------------------------------------- | ----------------------- |
| `add`, `addLast`, `push`, `addFirst`, and the handle methods above                    | O(1)                    |
| a handle's `value` (read or set), `next`, `previous`                                  | O(1)                    |
| `poll`, `pop`, `peek`, `peekLast`, `getFirst`, `getLast`, `removeFirst`, `removeLast` | O(1)                    |
| `has(e)`, `delete(e)`                                                                 | O(n)                    |
| `cursor()` `next` and `remove`                                                        | O(1)                    |
| `removeIf`, `removeAll`, `retainAll`                                                  | O(n + m) plus the calls |
| `addAll`, the constructor, `from`                                                     | O(m)                    |
| `clear`, `toArray`, `copy`, `toString`                                                | O(n)                    |
| `forEach`                                                                             | O(n) plus the calls     |
| `reversed()`                                                                          | O(1)                    |

There is no limit but memory, and no operation recurses, so very long lists are safe to walk,
print, copy and clear.

## Iteration, the reversed view and equality

- Adding or removing while a `for…of`, `forEach` or cursor is open — through a handle, the
  reversed view or any other method — makes the next step throw `ConcurrentModificationError`.
  Setting a handle's `value` does not: an iterator that has not reached that element yet returns
  the new value.
- `reversed()` is the list back to front, as for `ArrayDeque`. It has no handle methods and prints
  as `ReversedDeque(2) [2, 1]`.
- Two lists are equal only when they are the same object; compare `toArray()` results to compare
  contents. `copy()` returns an independent list with new handles.

## Differences from `Array`

| `Array`                               | `LinkedList`                                         |
| ------------------------------------- | ---------------------------------------------------- |
| `splice` in the middle is O(n)        | `insertBefore`, `insertAfter`, `removeNode` are O(1) |
| `shift()` and `unshift()` are O(n)    | `poll()` and `addFirst()` are O(1)                   |
| `arr[i]` reads any position in O(1)   | no index access: walk from an end, or keep a handle  |
| `push(e)` returns the new length      | `push(e)` returns the list                           |
| changing an array while looping works | adding or removing while iterating throws            |

## Types

`LinkedList<E>` implements `Deque<E>`; type parameters as `Deque<E>` unless you need handles.
`LinkedListNode<E>` is exported as a type only. `isDeque`, `isQueue`, `isCollection` and
`isSequencedCollection` recognise a `LinkedList` and its view from any copy of the package;
`instanceof LinkedList` recognises the list itself.

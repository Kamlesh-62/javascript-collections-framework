# Using collections with frameworks

Collections are mutable objects with an identity, like `Map` and `Set`. Frameworks that decide
whether to re-render by comparing references — React, Angular signals, Svelte, Solid — do not see a
change made in place. This page gives a pattern that works in each framework, how to send
collections across servers, workers and storage, and how they behave with `await`.

## Why an in-place change goes unseen

<!-- example: not run — a framework recipe, tested in test/frameworks/ -->
```ts
const [items, setItems] = useState(() => new ArrayList<string>())
items.add('tea')
setItems(items) // the same object: React skips the render
```

Two patterns fix this everywhere:

- **Copy on write.** Change a copy and store the copy: `const next = items.copy(); next.add('tea');
  setItems(next)`. Each change gives a new reference. Simple; costs O(n) per change.
- **Watch `revision`.** Every mutable collection has a `revision` number that changes on every
  change to its contents, in-place replacements included. Keep one collection and tell the
  framework to read `revision`. No copying.

`revision` by kind of collection:

| Collection                                              | `revision` changes when                                                                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lists, deques, queues, sets, maps                       | anything is added, removed or replaced; not when a call changes nothing (deleting an absent value, `clear` on an empty collection)                           |
| `LinkedHashMap` with `accessOrder: true`                | also on `get` and `getOrDefault`, which move the entry — avoid calling them during render, or render from a copy                                             |
| Immutable results (`listOf`, `copyOfSet`, …)            | never                                                                                                                                                        |
| Views (`subList`, `keySet()`, `unmodifiableList(…)`, …) | as their source's                                                                                                                                            |
| `asList(array)`                                         | on changes through the list, and when the array's length differs from the last time `revision` was read; direct same-length writes to the array are not seen |

Reactive wrappers that work on plain objects, arrays and native collections do not make a library
collection reactive. For example, Vue's `reactive({ list })` leaves `list` unwrapped (this is
tested), so changing it in place is not noticed: use the patterns below.

## React

With `useSyncExternalStore`, keep one collection and let React read `revision` as the snapshot:

```tsx
import { ArrayList } from 'javascript-collections-framework'
import { useSyncExternalStore } from 'react'

function createStore<T extends { readonly revision: number }>(collection: T) {
  const listeners = new Set<() => void>()
  return {
    collection,
    subscribe: (listener: () => void) => (
      listeners.add(listener), () => listeners.delete(listener)
    ),
    getSnapshot: () => collection.revision,
    update(change: (c: T) => void) {
      change(collection)
      for (const listener of listeners) listener()
    },
  }
}

const cart = createStore(new ArrayList<string>())

function Cart() {
  useSyncExternalStore(cart.subscribe, cart.getSnapshot)
  return <p>{cart.collection.toArray().join(', ')}</p>
}

cart.update((list) => list.add('tea')) // re-renders, and so does an in-place list.set(0, 'cake')
```

With `useState`, copy on write: `setItems((prev) => { const next = prev.copy(); next.add(x); return next })`.

## Vue 3

Hold the collection in a `shallowRef` and call `triggerRef` after changing it:

<!-- example: not run — a framework recipe, tested in test/frameworks/ -->
```ts
import { shallowRef, triggerRef } from 'vue'

const items = shallowRef(new ArrayList<string>())
function add(item: string) {
  items.value.add(item)
  triggerRef(items)
}
```

Or keep a ref of `revision` and update it after each change. `reactive({ items })` leaves the
collection unwrapped, so changing it in place alone does not update the view.

## Svelte 5

Keep `revision` in `$state` and refresh it after a change, or reassign a copy:

```svelte
<script>
  let { list } = $props()
  let revision = $state(0)
  function add(item) {
    list.add(item)
    revision = list.revision
  }
</script>

<p>{revision >= 0 ? list.toArray().join(', ') : ''}</p>
```

## Other frameworks

These recipes follow each framework's documented API but, unlike the React, Vue and Svelte ones,
are not run as tests.

- **Angular signals:** `const items = signal(list, { equal: () => false })`, then
  `items.set(items())` after each change, or store `list.copy()`.
- **Solid:** `createSignal(list, { equals: false })` and set it again after each change, or store a
  copy; do not put the collection in a `createStore` store.
- **MobX:** keep the collection outside `observable` (do not pass it to `observable`) and an
  `observable.box(list.revision)` updated in your actions, or replace the collection with a copy in
  an action.
- **Redux Toolkit:** store plain data (`list.toJSON()`) in the state and rebuild with `X.from` in a
  memoised selector (`createSelector`), so a new collection is built only when that slice changes;
  do not turn off `serializableCheck` for the whole store.
- **Immer:** collections are not drafted; inside `produce`, assign a changed `copy()`.
- **Next.js server components:** pass `collection.toJSON()` as a prop and rebuild it in the client
  component.

## Sending collections: JSON, `structuredClone`, `postMessage`

Send a collection as its `toJSON()` form — an array, or `[key, value]` pairs for maps — and rebuild
it on the other side:

| Collection                                                                                    | Rebuild with                                           |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `ArrayList`, `LinkedList`, `ArrayDeque`                                                       | `X.from(json)`                                         |
| `HashSet`, `LinkedHashSet`, `TreeSet`, `PriorityQueue`, `HashMap`, `LinkedHashMap`, `TreeMap` | `X.from(json, options)`                                |
| `listOf`/`copyOfList` results                                                                 | `copyOfList(json)`                                     |
| `setOf`/`mapOf`/`copyOfSet`/`copyOfMap` results                                               | `copyOfSet(json, options)`, `copyOfMap(json, options)` |
| Unmodifiable views, `newSetFromMap`                                                           | rebuild the source, then wrap it again                 |
| `asList(array)`                                                                               | `asList(json)`                                         |

```ts
const text = JSON.stringify(
  new TreeMap([
    [2, 'b'],
    [1, 'a'],
  ]),
)
const rebuilt = TreeMap.from(JSON.parse(text)) // equal to the original
```

**Options are never part of the JSON.** A `key`, `equivalence`, comparator, `accessOrder`,
`maxSize` or `onEvict` must be passed again when rebuilding — and it must work on the parsed data
(plain objects, not class instances).

**What JSON loses:**

- `undefined`, `NaN` and `±Infinity` become `null`; `ArrayDeque`, `PriorityQueue` and a
  natural-order `TreeSet` or `TreeMap` then refuse them with `NullElementError`.
- A `Date` becomes a string; a `bigint` makes `JSON.stringify` throw.
- Objects come back as new objects, which are not equal to the originals under the default
  equality (use a `key` such as `(p) => p.id`).
- A collection inside a collection comes back as an array and is not rebuilt.
- `from` accepts any iterable, so a JSON string becomes its characters, as with `Array.from`.

`structuredClone(collection)` on an instance either throws (`DataCloneError`, for a collection with
a function option) or returns a plain object without the methods; the original is not affected.
Send `toJSON()` instead.

## Proxies

Methods work when a collection is wrapped in a plain `Proxy` (one with no traps). A proxy of a deque
or queue equals itself (`p.equals(p)`) and its collection (`p.equals(target)`), but the collection
does not know its proxies (`target.equals(p)` is `false`), so equality is not symmetric there.
Callbacks of `ArrayList`, `HashMap` and the other classes receive the collection itself, not the
proxy, and `proxy.reversed().reversed()` is the collection itself. Callbacks of views, immutable
results and `newSetFromMap` sets receive the proxy, and `reversed().reversed()` of those is a new
view over the same contents.

## Threads, workers and `await`

Collections are single-threaded, like `Array`, `Map` and `Set`. They cannot be shared between
workers: send `toJSON()` with `postMessage` and rebuild it in the worker.

JavaScript runs one task at a time, so a collection can only change during iteration at an `await`
in the loop or in a callback:

- Lists, deques, priority queues and tree sets and maps (and their views) **fail fast**: the next
  step of an iteration throws `ConcurrentModificationError` after another task changes them.
- `HashSet`, `HashMap`, `LinkedHashSet` and `LinkedHashMap` **iterate live**, as native `Set` and
  `Map` do: added entries are visited, deleted ones skipped. An access-ordered `get` moves an entry,
  which is then visited once at its new place.

To iterate safely across `await` while other code may change the collection, iterate a copy:

```ts
const list = new ArrayList(['a', 'b'])
const save = async (item: string) => item
for (const item of list.copy()) {
  await save(item) // other tasks may change `list` meanwhile
}
```

## How collections look in consoles and devtools

Collections print as `ArrayList(3) [1, 2, 3]`, `HashMap(1) {'a' => 1}` in `String(...)` and in
Node's console, and as `[object ArrayList]` in `Object.prototype.toString`. Their methods carry the native names you will see in devtools and stack
traces: `has`, `delete`, `get`/`set`, and `push`/`pop` at the tail of a deque. Browser devtools may
show internal fields of an instance; those are not part of the API and can change in any release.

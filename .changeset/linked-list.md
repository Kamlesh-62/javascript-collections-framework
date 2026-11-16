---
"javascript-collections-framework": minor
---

Add `LinkedList`, a double-ended queue stored as a doubly linked list, and the `LinkedListNode` type. It works wherever a `Deque` is expected and adds node handles: `addFirstNode`, `addLastNode`, `insertBefore`, `insertAfter` and `removeNode` insert or remove next to a known element in O(1), and `firstNode`/`lastNode` with each handle's `next`/`previous` walk the list. Each element has one handle while it is in the list; a removed handle is refused. `null` and `undefined` are stored as in an array (`isEmpty()` tells a stored `undefined` from an empty list). Equality is identity, as for every deque.

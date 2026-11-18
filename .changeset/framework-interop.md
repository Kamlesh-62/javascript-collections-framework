---
"javascript-collections-framework": patch
---

`equals` on an `ArrayDeque`, `LinkedList` or `PriorityQueue` called through a `Proxy` of it now returns `true` for that proxy, as it does for the collection itself. A new guide, `docs/frameworks.md`, shows how to use collections with React, Vue, Svelte and other frameworks, how `revision` signals changes, how to send collections through JSON, `structuredClone` and workers, and how they behave across `await`.

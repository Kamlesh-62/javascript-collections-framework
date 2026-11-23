---
"javascript-collections-framework": patch
---

Faster reads, writes and iteration for hash maps and sets, and faster natural-order comparisons in sorted collections and priority queues, with no change in behaviour. A `HashMap` without the `key` or `equivalence` option now reads, writes and deletes with one call to its native `Map` where one suffices and iterates the native `Map` directly; `LinkedHashMap` and `LinkedHashSet` look a key up once; two numbers or two strings are compared without classifying them. Lists and deques build their error messages only when an error is thrown, and default hash collections skip the guard they need only around user callbacks.

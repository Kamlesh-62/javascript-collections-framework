---
"javascript-collections-framework": patch
---

Read-only views, immutable collections, and their iterators, cursors and entries no longer keep their source in a plain property. Before, `listOf(1).source`, a field of the iterator a read-only view returned, or an entry handed to user code by a read-only map's `equals`, could change the storage behind it. The source now sits under a non-enumerable symbol key, so property access, spread, `Object.assign` and `JSON.stringify` cannot reach it; framework proxies keep working.

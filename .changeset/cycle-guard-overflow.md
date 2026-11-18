---
"javascript-collections-framework": patch
---

When printing, comparing or hashing a collection nested too deeply throws the engine's
`RangeError`, every collection in it prints, compares and hashes normally once that call has
returned. Before, one collection near the point of the overflow could stay marked as in progress
and then print as `[Circular]`, compare unequal or hash as `0`.

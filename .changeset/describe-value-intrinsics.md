---
"javascript-collections-framework": patch
---

Error messages that describe an argument (an out-of-range index, a non-iterable value) no longer call `String`, `JSON.stringify` or string methods that other code replaced after the package loaded; they use the built-ins captured when the package loads.

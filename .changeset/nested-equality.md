---
"javascript-collections-framework": patch
---

Comparing maps or sets nested inside each other no longer doubles the work at every level of
nesting. Each member was checked from both sides, so two collections nested 30 levels deep took
about a billion comparisons. Nested maps now compare in time linear in the depth; nested sets
that compare members by value also hash each level's members, which grows with the square of the
depth.

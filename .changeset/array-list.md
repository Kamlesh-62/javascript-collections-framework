---
"javascript-collections-framework": minor
---

Add `ArrayList`, a growable list stored in an array, with the `List`, `ReadonlyList`, `SequencedCollection`, `ReadonlySequencedCollection` and `ListCursor` types and the `isList` and `isSequencedCollection` guards. Indexes are checked (`get(9)` throws `IndexOutOfBoundsError` instead of returning `undefined`); `add` appends and `insert` places; `delete` removes by value and `removeAt` by position; `sort` is stable, uses natural order by default and leaves the list unchanged if the comparator fails; `listCursor` moves both ways and edits in place; `subList` and `reversed` are live views. `indexOf` finds `NaN`, and `ArrayList.from` takes `Array.from`'s map function.

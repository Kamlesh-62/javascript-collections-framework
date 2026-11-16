---
"javascript-collections-framework": minor
---

Add `HashSet`, the `SetCollection` and `ReadonlySetCollection` types, the `HashSetOptions` type and the `isSetCollection` guard. A default `HashSet` behaves like native `Set` — `add` returns the set, `has`/`delete`/`clear`/`size`/`keys`/`values`/`entries`/`forEach`, insertion order, SameValueZero membership (`-0` stored as `0`), `null` and `undefined` as members, and live iteration — and works with `new Set(set)` and native set methods. A `key` option (values with SameValueZero-equal keys are one member) or an `equivalence` option (such as `valueEquivalence`) compares members by value; keys and hashes are derived once per value and stored. `equals` compares two sets by their members in any order, `toJSON()` returns an array, and `removeIf`, `removeAll`, `retainAll` and cursors come from the shared collection API. With an `equivalence`, members are kept in hash buckets seeded per set.

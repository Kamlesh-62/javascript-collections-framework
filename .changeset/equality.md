---
"javascript-collections-framework": minor
---

Add equality and hashing: `equals` and `hashCode`, `sameValueZeroEquivalence` (the default, like native `Map` and `Set`) and `valueEquivalence`, the `Equivalence`, `KeyOf`, `Equatable` and `HashFunction` types, and the `equalsSymbol`/`hashCodeSymbol` protocol for classes that define value equality. Hashes are seeded and never run code for primitive values, even when built-in methods are replaced after the package loads.

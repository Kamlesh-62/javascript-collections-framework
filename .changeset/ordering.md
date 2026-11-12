---
"javascript-collections-framework": minor
---

Add natural order and comparators: the `Comparator` type, `naturalOrder`, `reverseOrder`, `comparing`, `thenComparing`, `nullsFirst` and `nullsLast`, plus `compareSymbol` and the `Comparable` type for classes that define their own order. Natural order compares numbers, strings, bigints, booleans and dates without converting them, and throws `ClassCastError` for values of different kinds.

# Ordering

Sorted collections, priority queues and sorting functions need one definition of "comes before".
This page describes the library's **natural order**, the `Comparator` type, and the helpers that
build comparators.

```ts
import {
  comparing,
  naturalOrder,
  nullsFirst,
  reverseOrder,
  thenComparing,
} from 'javascript-collections-framework'
```

## Comparators

A comparator is a function `(a, b) => number`: negative when `a` comes first, positive when `b`
comes first, zero when they are equal in that order. Only the sign matters. It is exactly the
shape `Array.prototype.sort` accepts, so every comparator works with native `sort` too:

```ts
const byLength = (a: string, b: string) => a.length - b.length
;['ccc', 'a', 'bb'].sort(byLength) // ['a', 'bb', 'ccc']
```

## Natural order

When no comparator is given, values are ordered by natural order:

| Values                                   | Order                                                                               |
| ---------------------------------------- | ----------------------------------------------------------------------------------- |
| numbers                                  | numerically; `-0` equals `0`; `NaN` equals `NaN` and comes after every other number |
| strings                                  | by UTF-16 code units — the order of `<` on two strings, identical on every runtime  |
| bigints                                  | numerically                                                                         |
| booleans                                 | `false` before `true`                                                               |
| dates                                    | by time value; an invalid date comes after every valid one                          |
| objects that implement `[compareSymbol]` | by that method (see below)                                                          |

Two values of different kinds cannot be compared and throw `ClassCastError` — including a number
and a bigint (`1` and `1n`), a boolean and a number, or a date and a number. `null` and `undefined`
throw `NullElementError`; use [`nullsFirst` or `nullsLast`](#helpers) to allow them. Any other
value — symbols, functions, and objects that are neither dates nor implement `[compareSymbol]` —
throws `ClassCastError`.

Natural order never converts values. Native `sort` without a comparator compares text, so
`[10, 9, 1].sort()` gives `[1, 10, 9]`, and `<` converts mixed values (`2 < '10'` is `true`).
Natural order gives `[1, 9, 10]` and refuses the mixed pair.

Strings are compared by code units, not by language: `'B'` comes before `'a'`. For the order of a
language, pass a comparator:

```ts
const german = new Intl.Collator('de').compare
words.sort(german)
```

Dates are recognised wherever they were created, including in another frame or a `vm` context,
and Date subclasses count as dates. Objects that only look like dates do not, and neither does a
`Proxy` wrapped around a date.

### Dates in sorted and hashed collections

Natural order compares dates by their time, but two separate `Date` objects are still two
different values to a hashed collection. So two dates with the same time are **one** element of a
sorted set and **two** elements of a hashed set. To make a hashed collection treat them as equal,
key it by the time value, `d.getTime()`.

## Your own types: `compareSymbol`

An object can state its own natural order by implementing `[compareSymbol]`:

```ts
import { type Comparable, compareSymbol, naturalOrder } from 'javascript-collections-framework'

class Version implements Comparable<Version> {
  constructor(
    readonly major: number,
    readonly minor: number,
  ) {}
  [compareSymbol](other: Version): number {
    return this.major - other.major || this.minor - other.minor
  }
}

;[new Version(2, 0), new Version(1, 4)].sort(naturalOrder()) // 1.4, then 2.0
```

- Both values must implement it; otherwise the pair throws `ClassCastError`.
- The method must return a number other than `NaN`; anything else throws `TypeError`.
- Keep the order consistent: if `a` comes before `b`, then `b` comes after `a`; and if `a` comes
  before `b` and `b` before `c`, then `a` comes before `c`. Sorted collections rely on this and
  cannot check it for you.
- A method named `compareTo` is not used. Opting in with the symbol means no object is compared
  by accident.
- Dates always compare by time, even if they implement `[compareSymbol]`.
- Looking up `[compareSymbol]` on a `Proxy` runs the proxy's `get` trap, which is your own code.

## Helpers

| Helper                          | Returns a comparator that…                                         |
| ------------------------------- | ------------------------------------------------------------------ |
| `naturalOrder()`                | applies natural order                                              |
| `reverseOrder(c?)`              | reverses `c`, or natural order                                     |
| `comparing(key, c?)`            | compares `key(value)` with `c`, or in natural order                |
| `thenComparing(first, ...next)` | uses `first`, then each of `next` to break ties                    |
| `nullsFirst(c?)`                | puts `null` and `undefined` first, then uses `c`, or natural order |
| `nullsLast(c?)`                 | puts `null` and `undefined` last, then uses `c`, or natural order  |

```ts
type Person = { last: string; first: string; nickname?: string }

const byName = thenComparing<Person>(
  comparing((p) => p.last),
  comparing((p) => p.first),
)
const byNickname = comparing((p: Person) => p.nickname, nullsFirst())
const oldestFirst = reverseOrder(comparing((p: { age: number }) => p.age))
```

- An argument that is not a function — including `null` — throws `TypeError` as soon as the helper
  is called. Leaving an optional comparator out means natural order.
- `comparing` calls `key` once for each value in a comparison. To allow missing keys, wrap the key
  comparator: `comparing(key, nullsFirst())`.
- `nullsFirst` and `nullsLast` never pass `null` or `undefined` to your comparator.
- The helpers return your comparator's results unchanged, exactly as a hand-written comparator
  would. Sorted collections check every result: a comparator that returns `NaN` or a non-number
  makes them throw `TypeError` instead of corrupting their contents.
- Native `sort` always moves `undefined` and empty slots to the end without calling the
  comparator, so with native `sort`, `nullsFirst` moves only `null` to the front.

## Cost

Each comparison is constant time for numbers, booleans, dates and `[compareSymbol]` objects (plus
your method), proportional to the shared prefix for strings, and to the number of digits for
bigints. The helpers add one call per wrapped function.

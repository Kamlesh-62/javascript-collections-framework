# Equality and hashing

How collections decide that two values are "the same", and how to change it.

> Available now: `equals`, `hashCode`, the two equivalences, the types and the protocol, and the
> `key` and `equivalence` options of [`HashSet`](sets.md) and [`HashMap`](maps.md). The linked
> variants arrive in a later release and take the same options.

```ts
import {
  equals,
  equalsSymbol,
  hashCode,
  hashCodeSymbol,
  sameValueZeroEquivalence,
  valueEquivalence,
  type Equatable,
  type Equivalence,
  type HashFunction,
  type KeyOf,
} from 'javascript-collections-framework'
```

## The default: like native `Map` and `Set`

Unless you say otherwise, collections compare values the way native `Map` and `Set` do —
**SameValueZero**:

- numbers, strings, bigints and booleans by value; `NaN` equals `NaN`; `-0` equals `0`;
- `null` and `undefined` are each equal only to themselves;
- objects, arrays, dates, functions and classes by **identity**: two separate `{ x: 1 }` objects
  are different keys.

So a hashed collection with no options behaves exactly like its native counterpart.
`sameValueZeroEquivalence` is this rule as an object, if you need to pass it explicitly.

## Keying by value: the `key` option (recommended)

When two objects should count as the same key, give the collection a function that returns a
primitive key for each value:

```ts
interface User {
  id: number
}
interface Profile {
  name: string
}
interface Point {
  x: number
  y: number
}
const users = new HashMap<User, Profile>({ key: (user) => user.id })
const points = new HashSet<Point>({ key: (p) => `${p.x},${p.y}` })
```

The collection stores entries in a native `Map` keyed by what the function returns, so lookups run
at native speed. Keys compare with SameValueZero.

- The function is called once per value per operation, with only the value.
- A key is derived when the value is stored and not again later, so do not change the fields a key
  is built from while the value is in a collection.
- The function must return a primitive (string, number, bigint, boolean, symbol, `null` or
  `undefined`). Returning an object or array — `(p) => [p.x, p.y]` — throws `TypeError`, because a
  new array on every call could never match a stored one.

## Custom equality: `Equivalence`

When a key function is not enough, pass an equivalence: an `equals` and a `hash` that agree.

```ts
const caseInsensitive: Equivalence<string> = {
  equals: (a, b) => a.toLowerCase() === b.toLowerCase(),
  hash: (s) => hashCode(s.toLowerCase()),
}
const tags = new HashSet<string>({ equivalence: caseInsensitive })
```

- `equals` must be reflexive, symmetric and transitive, and **return a boolean**. A compare-style
  function such as `(a, b) => a.id - b.id` returns `0` for equal values and throws `TypeError`.
- `hash` must return the same finite number for values that are equal.
- Both functions are read once when the collection is created and are called with `this` set to
  the equivalence object, so an instance of a class works as an equivalence.

## Classes that define their own equality: the protocol

A class can define value equality with two symbol-keyed methods:

```ts
class Point implements Equatable {
  constructor(
    readonly x: number,
    readonly y: number,
  ) {}

  [equalsSymbol](other: unknown): boolean {
    return other instanceof Point && other.x === this.x && other.y === this.y
  }

  [hashCodeSymbol](hash: HashFunction): number {
    return hash(this.x) * 31 + hash(this.y)
  }
}

equals(new Point(1, 2), new Point(1, 2)) // true
```

The protocol is used by `equals`, `hashCode` and `valueEquivalence` (pass
`{ equivalence: valueEquivalence }` to a collection to use it there). It is **not** used by default.

- **Both values must implement it.** Between an implementing and a non-implementing value, or a
  function or class, comparison is by identity.
- **Implement both methods.** Hashing an object that has only one of them throws `TypeError`,
  because such an object would get lost in hashed collections.
- `[equalsSymbol]` must return a boolean; `[hashCodeSymbol]` must return a finite number (it is
  reduced to a 32-bit integer).
- **Use the `hash` argument for nested values.** It is the hash function of whoever is hashing, so
  nested values hash the same way theirs do. Ignoring it is allowed.
- Keep the methods consistent: symmetric, transitive, and equal objects with equal hashes. The
  library cannot check this for you.
- Methods named `equals` and `hashCode` are not used — only the symbol-keyed ones.
- The protocol is looked up only on objects. Adding it to `Number.prototype` or `String.prototype`
  changes nothing for numbers or strings.
- Nested values are compared and hashed recursively, one level of the call stack per level of
  nesting. Extremely deep nesting throws the engine's `RangeError`; a cycle through your own
  methods is yours to avoid (the library's collections guard against cycles themselves).

## How each kind of value compares and hashes

| Value                               | `equals`                                           | `hashCode` based on                                |
| ----------------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| number                              | SameValueZero (`NaN` = `NaN`, `-0` = `0`)          | the number, with every `NaN` alike and `-0` as `0` |
| bigint                              | by value; never equal to a number                  | its digits                                         |
| string                              | by value                                           | its characters                                     |
| boolean, `null`, `undefined`        | by value; `null` ≠ `undefined`                     | a fixed value for each                             |
| symbol                              | by identity                                        | its description (two symbols may share a hash)     |
| function, class                     | by identity                                        | identity                                           |
| object implementing the protocol    | its `[equalsSymbol]`, when both sides implement it | its `[hashCodeSymbol](hash)`                       |
| any other object (dates, arrays, …) | by identity                                        | identity                                           |

Dates compare by identity here, but by time in [natural order](ordering.md): a sorted set treats two
dates with the same time as one element, a hashed set keeps both unless you key it by
`d.getTime()`.

## Hash values

`hashCode(value)` returns a 32-bit integer, and equal values always get the same one. The values
themselves are **not** part of the API: they are seeded randomly, so colliding keys are hard to
predict (hashed collections add their own defences), so they differ between runs and between copies of the package loaded in the
same app. Never store hash values or send them anywhere. A protocol object's hash is the exception —
it is whatever its `[hashCodeSymbol]` returns.

Hashing never runs code for a primitive value, even if another script on the page replaces
built-in methods such as `String.prototype.charCodeAt` after this package has loaded. Built-ins
replaced before the package loads are outside this protection.

## Cost

`equals` is constant time for primitives, plus your `[equalsSymbol]` method for protocol objects.
`hashCode` is constant time for numbers, booleans, `null`, `undefined` and objects, proportional to
the length for strings and symbol descriptions, and to the number of digits for bigints, plus your
`[hashCodeSymbol]` method.

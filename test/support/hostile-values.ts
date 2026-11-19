// The table of unusual and hostile values, the value families every collection belongs to, and
// the expected result of each (value, family) pair. `test/hostile-values.test.ts` runs every value
// through every member of every family, empty and next to companions, as an element or key and as
// a map value.

import {
  ArrayDeque,
  ArrayList,
  asList,
  type Comparator,
  compareSymbol,
  copyOfList,
  copyOfMap,
  copyOfSet,
  equalsSymbol,
  HashMap,
  HashSet,
  hashCodeSymbol,
  LinkedHashMap,
  LinkedHashSet,
  LinkedList,
  listOf,
  mapOf,
  newSetFromMap,
  PriorityQueue,
  setOf,
  TreeMap,
  TreeSet,
  unmodifiableCollection,
  unmodifiableList,
  unmodifiableMap,
  unmodifiableSequencedCollection,
  unmodifiableSequencedMap,
  unmodifiableSequencedSet,
  unmodifiableSet,
  unmodifiableSortedMap,
  unmodifiableSortedSet,
  valueEquivalence,
} from '../../src/index'
import { HOSTILE } from '../stress/config'

// ---------------------------------------------------------------------------------------------
// Values

/** What the hostile objects throw, so a test can tell their errors from the library's. */
export class HostileError extends Error {
  constructor(what: string) {
    super(`hostile value: ${what}`)
    this.name = 'HostileError'
  }
}

/** Calls of `valueOf` on any hostile object; the library must never make one. */
export const valueOfCalls = { count: 0 }

function countingValueOf(this: unknown): unknown {
  valueOfCalls.count++
  return 0
}

/** A plain object with a counting `valueOf` and one property replaced by a throwing getter. */
function throwingGetter(key: PropertyKey): object {
  const out = { valueOf: countingValueOf }
  Object.defineProperty(out, key, {
    get() {
      throw new HostileError(`reading ${String(key)}`)
    },
    enumerable: false,
  })
  return out
}

/** A plain object with a counting `valueOf` and the given protocol methods. */
function withProtocol(methods: { [key: symbol]: unknown }): object {
  return Object.assign({ valueOf: countingValueOf }, methods)
}

let long: string | undefined
/** The very long string, built once per run from a seeded pattern. */
export function longString(): string {
  if (long === undefined) {
    const unit = 'abcdefghijklmnopqrstuvwxyz0123456789'
    let out = unit
    while (out.length < HOSTILE.longString) out += out
    long = out.slice(0, HOSTILE.longString)
  }
  return long
}

const SYMBOL = Symbol('hostile')
const FUNCTION = function named(): void {}
const FROZEN = Object.freeze({ frozen: true })
const SEALED = Object.seal({ sealed: true })
const FROZEN_ARRAY = Object.freeze([1, 2])
const PROXY = new Proxy({ proxied: true }, {})
const REVOKED = (() => {
  const { proxy, revoke } = Proxy.revocable({}, {})
  revoke()
  return proxy
})()
const NULL_PROTOTYPE: object = Object.create(null)

/** One value of the table. `make` returns the same value for a primitive or a constant object. */
export interface HostileValue {
  readonly name: string
  readonly make: () => unknown
}

/** Every value of the table, by name. */
export const VALUES: readonly HostileValue[] = [
  { name: 'NaN', make: () => Number.NaN },
  { name: '-0', make: () => -0 },
  { name: '0', make: () => 0 },
  { name: 'null', make: () => null },
  { name: 'undefined', make: () => undefined },
  { name: 'symbol', make: () => SYMBOL },
  { name: 'registered symbol', make: () => Symbol.for('hostile') },
  { name: 'bigint', make: () => 1n },
  { name: 'function', make: () => FUNCTION },
  { name: 'empty string', make: () => '' },
  { name: 'long string', make: longString },
  { name: 'lone high surrogate', make: () => '\ud800' },
  { name: 'lone low surrogate', make: () => 'x\udc00' },
  { name: '__proto__', make: () => '__proto__' },
  { name: 'constructor', make: () => 'constructor' },
  { name: 'prototype', make: () => 'prototype' },
  { name: 'hasOwnProperty', make: () => 'hasOwnProperty' },
  { name: 'frozen object', make: () => FROZEN },
  { name: 'sealed object', make: () => SEALED },
  { name: 'frozen array', make: () => FROZEN_ARRAY },
  { name: 'null-prototype object', make: () => NULL_PROTOTYPE },
  { name: 'proxy', make: () => PROXY },
  { name: 'revoked proxy', make: () => REVOKED },
  { name: 'fresh object', make: () => ({ valueOf: countingValueOf }) },
  { name: 'throwing equalsSymbol getter', make: () => throwingGetter(equalsSymbol) },
  { name: 'throwing hashCodeSymbol getter', make: () => throwingGetter(hashCodeSymbol) },
  { name: 'throwing compareSymbol getter', make: () => throwingGetter(compareSymbol) },
  { name: 'throwing toString getter', make: () => throwingGetter('toString') },
  { name: 'throwing toPrimitive getter', make: () => throwingGetter(Symbol.toPrimitive) },
  { name: 'throwing toJSON getter', make: () => throwingGetter('toJSON') },
  {
    name: 'equalsSymbol throws',
    make: () =>
      withProtocol({
        [equalsSymbol]: () => {
          throw new HostileError('equals')
        },
        [hashCodeSymbol]: () => 1,
      }),
  },
  {
    name: 'hashCodeSymbol throws',
    make: () =>
      withProtocol({
        [equalsSymbol]: () => true,
        [hashCodeSymbol]: () => {
          throw new HostileError('hash')
        },
      }),
  },
  {
    name: 'equalsSymbol returns a non-boolean',
    make: () => withProtocol({ [equalsSymbol]: () => 'yes', [hashCodeSymbol]: () => 1 }),
  },
  {
    name: 'hashCodeSymbol returns NaN',
    make: () => withProtocol({ [equalsSymbol]: () => true, [hashCodeSymbol]: () => Number.NaN }),
  },
  {
    name: 'hashCodeSymbol returns a string',
    make: () => withProtocol({ [equalsSymbol]: () => true, [hashCodeSymbol]: () => '1' }),
  },
  {
    name: 'equal by protocol',
    make: () =>
      withProtocol({ [equalsSymbol]: (o: unknown) => o !== null, [hashCodeSymbol]: () => 7 }),
  },
]

// ---------------------------------------------------------------------------------------------
// Families

/** How a collection handles the values it is given. */
export type ValueFamily =
  | 'list'
  | 'linked-list'
  | 'array-deque'
  | 'priority-queue-natural'
  | 'priority-queue-comparator'
  | 'hash'
  | 'hash-key'
  | 'hash-equivalence'
  | 'sorted-natural'
  | 'sorted-comparator'

export const FAMILY_NAMES: readonly ValueFamily[] = [
  'list',
  'linked-list',
  'array-deque',
  'priority-queue-natural',
  'priority-queue-comparator',
  'hash',
  'hash-key',
  'hash-equivalence',
  'sorted-natural',
  'sorted-comparator',
]

/**
 * A total order over every value: the order in which values are first seen, SameValueZero values
 * sharing a place. It never reads a property of the values.
 */
const seen = new Map<unknown, number>()
function rank(value: unknown): number {
  let r = seen.get(value)
  if (r === undefined) {
    r = seen.size
    seen.set(value, r)
  }
  return r
}
export const byFirstSeen: Comparator<unknown> = (a, b) => rank(a) - rank(b)

/** A `key` function for every value: the same rank. */
export const keyOfAny = (value: unknown): number => rank(value)

/**
 * One way to put values into a collection and ask about them. `position` says whether the value
 * is an element (or a key), or a map value stored under a fixed key.
 */
export interface Box {
  /** The collection or map the value goes into. */
  readonly target: object
  add(value: unknown): void
  has(value: unknown): boolean
  delete(value: unknown): boolean
  readonly size: number
}

/** The key a map value is stored under. */
export const VALUE_KEY = 'k'
/** The value an element-position key maps to. */
export const KEY_VALUE = 'v'

type AnyCollection = {
  add(v: unknown): unknown
  has(v: unknown): boolean
  delete(v: unknown): boolean
  readonly size: number
}
type AnyMap = {
  set(k: unknown, v: unknown): unknown
  has(k: unknown): boolean
  delete(k: unknown): boolean
  containsValue(v: unknown): boolean
  readonly size: number
}

function collectionBox(target: AnyCollection): Box {
  return {
    target,
    add: (v) => {
      target.add(v)
    },
    has: (v) => target.has(v),
    delete: (v) => target.delete(v),
    get size() {
      return target.size
    },
  }
}

/** A box whose values go in as keys of `map` and are asked about through `view`. */
function keyViewBox(map: AnyMap, view: AnyCollection): Box {
  return {
    target: view,
    add: (v) => {
      map.set(v, KEY_VALUE)
    },
    has: (v) => view.has(v),
    delete: (v) => view.delete(v),
    get size() {
      return view.size
    },
  }
}

/** A box whose values go in as map keys. */
export function keyBox(map: AnyMap): Box {
  return {
    target: map,
    add: (v) => {
      map.set(v, KEY_VALUE)
    },
    has: (v) => map.has(v),
    delete: (v) => map.delete(v),
    get size() {
      return map.size
    },
  }
}

/** A box whose values go in as map values, each under its own fresh key. */
export function valueBox(map: AnyMap): Box {
  const keys = new Map<unknown, unknown>()
  let next = 0
  return {
    target: map,
    add: (v) => {
      const key = next === 0 ? VALUE_KEY : `${VALUE_KEY}${next}`
      next++
      keys.set(v, key)
      map.set(key, v)
    },
    has: (v) => map.containsValue(v),
    delete: (v) => keys.has(v) && map.delete(keys.get(v)),
    get size() {
      return map.size
    },
  }
}

/** The members of one family: element (or key) boxes, and the maps whose keys follow it. */
export interface Family {
  readonly elements: { readonly [member: string]: () => Box }
  readonly maps: { readonly [member: string]: () => AnyMap }
}

const opts = {
  key: { key: keyOfAny },
  equivalence: { equivalence: valueEquivalence },
  comparator: { comparator: byFirstSeen },
}

/** Every family with a factory for each class, factory and view that belongs to it. */
export const FAMILIES: { readonly [F in ValueFamily]: Family } = {
  list: {
    elements: {
      ArrayList: () => collectionBox(new ArrayList()),
      'ArrayList.subList': () => collectionBox(new ArrayList().subList(0, 0)),
      'ArrayList.reversed': () => collectionBox(new ArrayList().reversed()),
      asList: () => collectionBox(asList<unknown>([])),
      'HashMap.valueCollection': () => {
        const map = new HashMap<unknown, unknown>()
        const box = valueBox(map as unknown as AnyMap)
        const view = map.valueCollection()
        return {
          ...box,
          target: view,
          has: (v) => view.has(v),
          get size() {
            return view.size
          },
        }
      },
    },
    maps: {},
  },
  'linked-list': {
    elements: {
      LinkedList: () => collectionBox(new LinkedList()),
      'LinkedList.reversed': () => collectionBox(new LinkedList().reversed()),
    },
    maps: {},
  },
  'array-deque': {
    elements: {
      ArrayDeque: () => collectionBox(new ArrayDeque()),
      'ArrayDeque.reversed': () => collectionBox(new ArrayDeque().reversed()),
    },
    maps: {},
  },
  'priority-queue-natural': {
    elements: { PriorityQueue: () => collectionBox(new PriorityQueue()) },
    maps: {},
  },
  'priority-queue-comparator': {
    elements: {
      'PriorityQueue/comparator': () => collectionBox(new PriorityQueue(opts.comparator)),
    },
    maps: {},
  },
  hash: {
    elements: {
      HashSet: () => collectionBox(new HashSet()),
      LinkedHashSet: () => collectionBox(new LinkedHashSet()),
      'LinkedHashSet.reversed': () => collectionBox(new LinkedHashSet().reversed()),
      newSetFromMap: () => collectionBox(newSetFromMap(new HashMap<unknown, boolean>())),
      'HashMap.keySet': () => {
        const map = new HashMap<unknown, unknown>()
        return keyViewBox(map as unknown as AnyMap, map.keySet())
      },
      'LinkedHashMap.keySet': () => {
        const map = new LinkedHashMap<unknown, unknown>()
        return keyViewBox(map as unknown as AnyMap, map.keySet())
      },
    },
    maps: {
      HashMap: () => new HashMap() as unknown as AnyMap,
      LinkedHashMap: () => new LinkedHashMap() as unknown as AnyMap,
      'LinkedHashMap.reversed': () => new LinkedHashMap().reversed() as unknown as AnyMap,
    },
  },
  'hash-key': {
    elements: {
      'HashSet/key': () => collectionBox(new HashSet(opts.key)),
      'LinkedHashSet/key': () => collectionBox(new LinkedHashSet(opts.key)),
    },
    maps: {
      'HashMap/key': () => new HashMap(opts.key) as unknown as AnyMap,
      'LinkedHashMap/key': () => new LinkedHashMap(opts.key) as unknown as AnyMap,
    },
  },
  'hash-equivalence': {
    elements: {
      'HashSet/equivalence': () => collectionBox(new HashSet(opts.equivalence)),
      'LinkedHashSet/equivalence': () => collectionBox(new LinkedHashSet(opts.equivalence)),
    },
    maps: {
      'HashMap/equivalence': () => new HashMap(opts.equivalence) as unknown as AnyMap,
      'LinkedHashMap/equivalence': () => new LinkedHashMap(opts.equivalence) as unknown as AnyMap,
    },
  },
  'sorted-natural': {
    elements: {
      TreeSet: () => collectionBox(new TreeSet()),
      'TreeSet.reversed': () => collectionBox(new TreeSet().reversed()),
      'TreeMap.keySet': () => {
        const map = new TreeMap<unknown, unknown>()
        return keyViewBox(map as unknown as AnyMap, map.keySet())
      },
    },
    maps: {
      TreeMap: () => new TreeMap() as unknown as AnyMap,
      'TreeMap.reversed': () => new TreeMap().reversed() as unknown as AnyMap,
    },
  },
  'sorted-comparator': {
    elements: {
      'TreeSet/comparator': () => collectionBox(new TreeSet(opts.comparator)),
    },
    maps: {
      'TreeMap/comparator': () => new TreeMap(opts.comparator) as unknown as AnyMap,
    },
  },
}

/**
 * The read-only overlay: immutable collections and unmodifiable views, each built holding one
 * value, with the family its lookups follow. Every mutator throws `UnsupportedOperationError`.
 */
export const READ_ONLY: {
  readonly [member: string]: {
    readonly family: ValueFamily
    readonly kind: 'collection' | 'map'
    /** Whether `equals` is by identity rather than by contents. */
    readonly identityEquals?: boolean
    readonly make: (value: unknown) => object
  }
} = {
  listOf: { family: 'list', kind: 'collection', make: (v) => listOf(v) },
  copyOfList: { family: 'list', kind: 'collection', make: (v) => copyOfList([v]) },
  setOf: { family: 'hash', kind: 'collection', make: (v) => setOf(v) },
  copyOfSet: { family: 'hash', kind: 'collection', make: (v) => copyOfSet([v]) },
  'copyOfSet/key': {
    family: 'hash-key',
    kind: 'collection',
    make: (v) => copyOfSet([v], opts.key),
  },
  'copyOfSet/equivalence': {
    family: 'hash-equivalence',
    kind: 'collection',
    make: (v) => copyOfSet([v], opts.equivalence),
  },
  mapOf: { family: 'hash', kind: 'map', make: (v) => mapOf([v, KEY_VALUE]) },
  copyOfMap: { family: 'hash', kind: 'map', make: (v) => copyOfMap([[v, KEY_VALUE]]) },
  'copyOfMap/key': {
    family: 'hash-key',
    kind: 'map',
    make: (v) => copyOfMap([[v, KEY_VALUE]], opts.key),
  },
  'copyOfMap/equivalence': {
    family: 'hash-equivalence',
    kind: 'map',
    make: (v) => copyOfMap([[v, KEY_VALUE]], opts.equivalence),
  },
  unmodifiableCollection: {
    family: 'list',
    kind: 'collection',
    identityEquals: true,
    make: (v) => unmodifiableCollection(new ArrayList([v])),
  },
  unmodifiableSequencedCollection: {
    family: 'array-deque',
    kind: 'collection',
    identityEquals: true,
    make: (v) => unmodifiableSequencedCollection(new ArrayDeque([v])),
  },
  unmodifiableList: {
    family: 'list',
    kind: 'collection',
    make: (v) => unmodifiableList(new ArrayList([v])),
  },
  unmodifiableSet: {
    family: 'hash',
    kind: 'collection',
    make: (v) => unmodifiableSet(new HashSet([v])),
  },
  unmodifiableSequencedSet: {
    family: 'hash',
    kind: 'collection',
    make: (v) => unmodifiableSequencedSet(new LinkedHashSet([v])),
  },
  unmodifiableSortedSet: {
    family: 'sorted-natural',
    kind: 'collection',
    make: (v) => unmodifiableSortedSet(new TreeSet([v])),
  },
  unmodifiableMap: {
    family: 'hash',
    kind: 'map',
    make: (v) => unmodifiableMap(new HashMap([[v, KEY_VALUE]])),
  },
  unmodifiableSequencedMap: {
    family: 'hash',
    kind: 'map',
    make: (v) => unmodifiableSequencedMap(new LinkedHashMap([[v, KEY_VALUE]])),
  },
  unmodifiableSortedMap: {
    family: 'sorted-natural',
    kind: 'map',
    make: (v) => unmodifiableSortedMap(new TreeMap([[v, KEY_VALUE]])),
  },
}

// ---------------------------------------------------------------------------------------------
// Observing a value

/** `true` for success, or the name of the error thrown. */
export type Outcome = true | string

/** The name of an error: `HostileError` for the values' own, otherwise the error's `name`. */
export function errorName(error: unknown): string {
  if (error instanceof HostileError) return 'HostileError'
  if (error instanceof Error) return error.name
  return typeof error
}

/** Runs `body` and returns its result, or the name of the error it throws. */
export function attempt<T>(body: () => T): T | { readonly error: string } {
  try {
    return body()
  } catch (error) {
    return { error: errorName(error) }
  }
}

/** Runs `body` and returns `true`, or the name of the error it throws. */
export function outcome(body: () => unknown): Outcome {
  try {
    body()
    return true
  } catch (error) {
    return errorName(error)
  }
}

/** The companions stored before the value, by situation. */
export const SITUATIONS = {
  empty: [] as readonly unknown[],
  numbers: Array.from({ length: HOSTILE.companions }, (_, i) => i + 1) as readonly unknown[],
  strings: Array.from({ length: HOSTILE.companions }, (_, i) => `c${i}`) as readonly unknown[],
} as const
export type Situation = keyof typeof SITUATIONS

/** Where the value goes. */
export type Position = 'element' | 'value'

// ---------------------------------------------------------------------------------------------
// Expectations

/** A rejection: the error `add` (or `set`) throws, and what `has` then answers (or throws). */
export type Rejection = readonly [error: string, has: false | string]

/** The expected result of one value in one family (or as a map value). */
export interface Expectation {
  /** `true` when an empty collection accepts the value, or the rejection. */
  readonly empty: true | Rejection
  /** Next to number companions; as `empty` when omitted. */
  readonly numbers?: true | Rejection
  /** Next to string companions; as `empty` when omitted. */
  readonly strings?: true | Rejection
  /** What `has` answers for a second value made the same way, or the error it throws. */
  readonly fresh?: boolean | string
  /** What `equals` answers for two one-element collections of separately made values. */
  readonly equals?: boolean | string
  /** `true` when `hashCode` of a one-element collection succeeds, or the error it throws. */
  readonly hash?: Outcome
}

/** A printed or JSON form, or the error producing it throws. */
export type Form = string | { readonly error: string }

/** Everything expected of one value. */
export interface ValueExpectations {
  /** The element's text in `toString`, in every family unless `printedIn` names another. */
  readonly printed: Form
  readonly printedIn?: { readonly [family: string]: Form }
  /** The element's text in `JSON.stringify` of its collection. */
  readonly json: Form
  /** Other values of the table that every family treats as equal to this one. */
  readonly same?: readonly string[]
  readonly families: { readonly [F in ValueFamily | 'map value']: Expectation }
}

/**
 * Keeps the type of an entry whose key names a built-in property (`__proto__`, `constructor`,
 * `hasOwnProperty`), which loses the table's contextual type.
 */
function typed(entry: ValueExpectations): ValueExpectations {
  return entry
}

function quoted(quote: string, text: string): string {
  return quote + text + quote
}

/**
 * The expectation table. Families that compare by identity (`LinkedList`, `ArrayDeque` and the
 * priority queue) give `equals: false` for separate collections; natural order rejects values it
 * cannot order; `valueEquivalence` reads the equality protocol, so its errors surface there.
 */
export const EXPECTATIONS: { readonly [value: string]: ValueExpectations } = {
  NaN: {
    printed: 'NaN',
    json: 'null',
    families: {
      list: { empty: true, fresh: true, equals: true, hash: true },
      'linked-list': { empty: true, fresh: true, equals: false, hash: true },
      'array-deque': { empty: true, fresh: true, equals: false, hash: true },
      'priority-queue-natural': {
        empty: true,
        strings: ['ClassCastError', false],
        fresh: true,
        equals: false,
        hash: true,
      },
      'priority-queue-comparator': { empty: true, fresh: true, equals: false, hash: true },
      hash: { empty: true, fresh: true, equals: true, hash: true },
      'hash-key': { empty: true, fresh: true, equals: true, hash: true },
      'hash-equivalence': { empty: true, fresh: true, equals: true, hash: true },
      'sorted-natural': {
        empty: true,
        strings: ['ClassCastError', false],
        fresh: true,
        equals: true,
        hash: true,
      },
      'sorted-comparator': { empty: true, fresh: true, equals: true, hash: true },
      'map value': { empty: true, fresh: true, equals: true, hash: true },
    },
  },
  '-0': {
    printed: '-0',
    printedIn: { hash: '0', 'hash-key': '0', 'hash-equivalence': '0', 'sorted-natural': '0' },
    json: '0',
    same: ['0'],
    families: {
      list: { empty: true, fresh: true, equals: true, hash: true },
      'linked-list': { empty: true, fresh: true, equals: false, hash: true },
      'array-deque': { empty: true, fresh: true, equals: false, hash: true },
      'priority-queue-natural': {
        empty: true,
        strings: ['ClassCastError', false],
        fresh: true,
        equals: false,
        hash: true,
      },
      'priority-queue-comparator': { empty: true, fresh: true, equals: false, hash: true },
      hash: { empty: true, fresh: true, equals: true, hash: true },
      'hash-key': { empty: true, fresh: true, equals: true, hash: true },
      'hash-equivalence': { empty: true, fresh: true, equals: true, hash: true },
      'sorted-natural': {
        empty: true,
        strings: ['ClassCastError', false],
        fresh: true,
        equals: true,
        hash: true,
      },
      'sorted-comparator': { empty: true, fresh: true, equals: true, hash: true },
      'map value': { empty: true, fresh: true, equals: true, hash: true },
    },
  },
  '0': {
    printed: '0',
    json: '0',
    same: ['-0'],
    families: {
      list: { empty: true, fresh: true, equals: true, hash: true },
      'linked-list': { empty: true, fresh: true, equals: false, hash: true },
      'array-deque': { empty: true, fresh: true, equals: false, hash: true },
      'priority-queue-natural': {
        empty: true,
        strings: ['ClassCastError', false],
        fresh: true,
        equals: false,
        hash: true,
      },
      'priority-queue-comparator': { empty: true, fresh: true, equals: false, hash: true },
      hash: { empty: true, fresh: true, equals: true, hash: true },
      'hash-key': { empty: true, fresh: true, equals: true, hash: true },
      'hash-equivalence': { empty: true, fresh: true, equals: true, hash: true },
      'sorted-natural': {
        empty: true,
        strings: ['ClassCastError', false],
        fresh: true,
        equals: true,
        hash: true,
      },
      'sorted-comparator': { empty: true, fresh: true, equals: true, hash: true },
      'map value': { empty: true, fresh: true, equals: true, hash: true },
    },
  },
  null: {
    printed: 'null',
    json: 'null',
    families: {
      list: { empty: true, fresh: true, equals: true, hash: true },
      'linked-list': { empty: true, fresh: true, equals: false, hash: true },
      'array-deque': { empty: ['NullElementError', false] },
      'priority-queue-natural': { empty: ['NullElementError', false] },
      'priority-queue-comparator': { empty: ['NullElementError', false] },
      hash: { empty: true, fresh: true, equals: true, hash: true },
      'hash-key': { empty: true, fresh: true, equals: true, hash: true },
      'hash-equivalence': { empty: true, fresh: true, equals: true, hash: true },
      'sorted-natural': { empty: ['NullElementError', false] },
      'sorted-comparator': { empty: true, fresh: true, equals: true, hash: true },
      'map value': { empty: true, fresh: true, equals: true, hash: true },
    },
  },
  undefined: {
    printed: 'undefined',
    json: 'null',
    families: {
      list: { empty: true, fresh: true, equals: true, hash: true },
      'linked-list': { empty: true, fresh: true, equals: false, hash: true },
      'array-deque': { empty: ['NullElementError', false] },
      'priority-queue-natural': { empty: ['NullElementError', false] },
      'priority-queue-comparator': { empty: ['NullElementError', false] },
      hash: { empty: true, fresh: true, equals: true, hash: true },
      'hash-key': { empty: true, fresh: true, equals: true, hash: true },
      'hash-equivalence': { empty: true, fresh: true, equals: true, hash: true },
      'sorted-natural': { empty: ['NullElementError', false] },
      'sorted-comparator': { empty: true, fresh: true, equals: true, hash: true },
      'map value': { empty: true, fresh: true, equals: true, hash: true },
    },
  },
  symbol: {
    printed: 'Symbol(hostile)',
    json: 'null',
    families: {
      list: { empty: true, fresh: true, equals: true, hash: true },
      'linked-list': { empty: true, fresh: true, equals: false, hash: true },
      'array-deque': { empty: true, fresh: true, equals: false, hash: true },
      'priority-queue-natural': { empty: ['ClassCastError', false] },
      'priority-queue-comparator': { empty: true, fresh: true, equals: false, hash: true },
      hash: { empty: true, fresh: true, equals: true, hash: true },
      'hash-key': { empty: true, fresh: true, equals: true, hash: true },
      'hash-equivalence': { empty: true, fresh: true, equals: true, hash: true },
      'sorted-natural': { empty: ['ClassCastError', false] },
      'sorted-comparator': { empty: true, fresh: true, equals: true, hash: true },
      'map value': { empty: true, fresh: true, equals: true, hash: true },
    },
  },
  'registered symbol': {
    printed: 'Symbol(hostile)',
    json: 'null',
    families: {
      list: { empty: true, fresh: true, equals: true, hash: true },
      'linked-list': { empty: true, fresh: true, equals: false, hash: true },
      'array-deque': { empty: true, fresh: true, equals: false, hash: true },
      'priority-queue-natural': { empty: ['ClassCastError', false] },
      'priority-queue-comparator': { empty: true, fresh: true, equals: false, hash: true },
      hash: { empty: true, fresh: true, equals: true, hash: true },
      'hash-key': { empty: true, fresh: true, equals: true, hash: true },
      'hash-equivalence': { empty: true, fresh: true, equals: true, hash: true },
      'sorted-natural': { empty: ['ClassCastError', false] },
      'sorted-comparator': { empty: true, fresh: true, equals: true, hash: true },
      'map value': { empty: true, fresh: true, equals: true, hash: true },
    },
  },
  bigint: {
    printed: '1n',
    json: { error: 'TypeError' },
    families: {
      list: { empty: true, fresh: true, equals: true, hash: true },
      'linked-list': { empty: true, fresh: true, equals: false, hash: true },
      'array-deque': { empty: true, fresh: true, equals: false, hash: true },
      'priority-queue-natural': {
        empty: true,
        numbers: ['ClassCastError', false],
        strings: ['ClassCastError', false],
        fresh: true,
        equals: false,
        hash: true,
      },
      'priority-queue-comparator': { empty: true, fresh: true, equals: false, hash: true },
      hash: { empty: true, fresh: true, equals: true, hash: true },
      'hash-key': { empty: true, fresh: true, equals: true, hash: true },
      'hash-equivalence': { empty: true, fresh: true, equals: true, hash: true },
      'sorted-natural': {
        empty: true,
        numbers: ['ClassCastError', false],
        strings: ['ClassCastError', false],
        fresh: true,
        equals: true,
        hash: true,
      },
      'sorted-comparator': { empty: true, fresh: true, equals: true, hash: true },
      'map value': { empty: true, fresh: true, equals: true, hash: true },
    },
  },
  function: {
    printed: '[Function: named]',
    json: 'null',
    families: {
      list: { empty: true, fresh: true, equals: true, hash: true },
      'linked-list': { empty: true, fresh: true, equals: false, hash: true },
      'array-deque': { empty: true, fresh: true, equals: false, hash: true },
      'priority-queue-natural': { empty: ['ClassCastError', false] },
      'priority-queue-comparator': { empty: true, fresh: true, equals: false, hash: true },
      hash: { empty: true, fresh: true, equals: true, hash: true },
      'hash-key': { empty: true, fresh: true, equals: true, hash: true },
      'hash-equivalence': { empty: true, fresh: true, equals: true, hash: true },
      'sorted-natural': { empty: ['ClassCastError', false] },
      'sorted-comparator': { empty: true, fresh: true, equals: true, hash: true },
      'map value': { empty: true, fresh: true, equals: true, hash: true },
    },
  },
  'empty string': {
    printed: "''",
    json: '""',
    families: {
      list: { empty: true, fresh: true, equals: true, hash: true },
      'linked-list': { empty: true, fresh: true, equals: false, hash: true },
      'array-deque': { empty: true, fresh: true, equals: false, hash: true },
      'priority-queue-natural': {
        empty: true,
        numbers: ['ClassCastError', false],
        fresh: true,
        equals: false,
        hash: true,
      },
      'priority-queue-comparator': { empty: true, fresh: true, equals: false, hash: true },
      hash: { empty: true, fresh: true, equals: true, hash: true },
      'hash-key': { empty: true, fresh: true, equals: true, hash: true },
      'hash-equivalence': { empty: true, fresh: true, equals: true, hash: true },
      'sorted-natural': {
        empty: true,
        numbers: ['ClassCastError', false],
        fresh: true,
        equals: true,
        hash: true,
      },
      'sorted-comparator': { empty: true, fresh: true, equals: true, hash: true },
      'map value': { empty: true, fresh: true, equals: true, hash: true },
    },
  },
  'long string': {
    printed: quoted("'", longString()),
    json: quoted('"', longString()),
    families: {
      list: { empty: true, fresh: true, equals: true, hash: true },
      'linked-list': { empty: true, fresh: true, equals: false, hash: true },
      'array-deque': { empty: true, fresh: true, equals: false, hash: true },
      'priority-queue-natural': {
        empty: true,
        numbers: ['ClassCastError', false],
        fresh: true,
        equals: false,
        hash: true,
      },
      'priority-queue-comparator': { empty: true, fresh: true, equals: false, hash: true },
      hash: { empty: true, fresh: true, equals: true, hash: true },
      'hash-key': { empty: true, fresh: true, equals: true, hash: true },
      'hash-equivalence': { empty: true, fresh: true, equals: true, hash: true },
      'sorted-natural': {
        empty: true,
        numbers: ['ClassCastError', false],
        fresh: true,
        equals: true,
        hash: true,
      },
      'sorted-comparator': { empty: true, fresh: true, equals: true, hash: true },
      'map value': { empty: true, fresh: true, equals: true, hash: true },
    },
  },
  'lone high surrogate': {
    printed: "'\\ud800'",
    json: '"\\ud800"',
    families: {
      list: { empty: true, fresh: true, equals: true, hash: true },
      'linked-list': { empty: true, fresh: true, equals: false, hash: true },
      'array-deque': { empty: true, fresh: true, equals: false, hash: true },
      'priority-queue-natural': {
        empty: true,
        numbers: ['ClassCastError', false],
        fresh: true,
        equals: false,
        hash: true,
      },
      'priority-queue-comparator': { empty: true, fresh: true, equals: false, hash: true },
      hash: { empty: true, fresh: true, equals: true, hash: true },
      'hash-key': { empty: true, fresh: true, equals: true, hash: true },
      'hash-equivalence': { empty: true, fresh: true, equals: true, hash: true },
      'sorted-natural': {
        empty: true,
        numbers: ['ClassCastError', false],
        fresh: true,
        equals: true,
        hash: true,
      },
      'sorted-comparator': { empty: true, fresh: true, equals: true, hash: true },
      'map value': { empty: true, fresh: true, equals: true, hash: true },
    },
  },
  'lone low surrogate': {
    printed: "'x\\udc00'",
    json: '"x\\udc00"',
    families: {
      list: { empty: true, fresh: true, equals: true, hash: true },
      'linked-list': { empty: true, fresh: true, equals: false, hash: true },
      'array-deque': { empty: true, fresh: true, equals: false, hash: true },
      'priority-queue-natural': {
        empty: true,
        numbers: ['ClassCastError', false],
        fresh: true,
        equals: false,
        hash: true,
      },
      'priority-queue-comparator': { empty: true, fresh: true, equals: false, hash: true },
      hash: { empty: true, fresh: true, equals: true, hash: true },
      'hash-key': { empty: true, fresh: true, equals: true, hash: true },
      'hash-equivalence': { empty: true, fresh: true, equals: true, hash: true },
      'sorted-natural': {
        empty: true,
        numbers: ['ClassCastError', false],
        fresh: true,
        equals: true,
        hash: true,
      },
      'sorted-comparator': { empty: true, fresh: true, equals: true, hash: true },
      'map value': { empty: true, fresh: true, equals: true, hash: true },
    },
  },
  // A computed key: a literal `__proto__:` would set the prototype instead.
  ['__proto__']: typed({
    printed: "'__proto__'",
    json: '"__proto__"',
    families: {
      list: { empty: true, fresh: true, equals: true, hash: true },
      'linked-list': { empty: true, fresh: true, equals: false, hash: true },
      'array-deque': { empty: true, fresh: true, equals: false, hash: true },
      'priority-queue-natural': {
        empty: true,
        numbers: ['ClassCastError', false],
        fresh: true,
        equals: false,
        hash: true,
      },
      'priority-queue-comparator': { empty: true, fresh: true, equals: false, hash: true },
      hash: { empty: true, fresh: true, equals: true, hash: true },
      'hash-key': { empty: true, fresh: true, equals: true, hash: true },
      'hash-equivalence': { empty: true, fresh: true, equals: true, hash: true },
      'sorted-natural': {
        empty: true,
        numbers: ['ClassCastError', false],
        fresh: true,
        equals: true,
        hash: true,
      },
      'sorted-comparator': { empty: true, fresh: true, equals: true, hash: true },
      'map value': { empty: true, fresh: true, equals: true, hash: true },
    },
  }),
  constructor: typed({
    printed: "'constructor'",
    json: '"constructor"',
    families: {
      list: { empty: true, fresh: true, equals: true, hash: true },
      'linked-list': { empty: true, fresh: true, equals: false, hash: true },
      'array-deque': { empty: true, fresh: true, equals: false, hash: true },
      'priority-queue-natural': {
        empty: true,
        numbers: ['ClassCastError', false],
        fresh: true,
        equals: false,
        hash: true,
      },
      'priority-queue-comparator': { empty: true, fresh: true, equals: false, hash: true },
      hash: { empty: true, fresh: true, equals: true, hash: true },
      'hash-key': { empty: true, fresh: true, equals: true, hash: true },
      'hash-equivalence': { empty: true, fresh: true, equals: true, hash: true },
      'sorted-natural': {
        empty: true,
        numbers: ['ClassCastError', false],
        fresh: true,
        equals: true,
        hash: true,
      },
      'sorted-comparator': { empty: true, fresh: true, equals: true, hash: true },
      'map value': { empty: true, fresh: true, equals: true, hash: true },
    },
  }),
  prototype: {
    printed: "'prototype'",
    json: '"prototype"',
    families: {
      list: { empty: true, fresh: true, equals: true, hash: true },
      'linked-list': { empty: true, fresh: true, equals: false, hash: true },
      'array-deque': { empty: true, fresh: true, equals: false, hash: true },
      'priority-queue-natural': {
        empty: true,
        numbers: ['ClassCastError', false],
        fresh: true,
        equals: false,
        hash: true,
      },
      'priority-queue-comparator': { empty: true, fresh: true, equals: false, hash: true },
      hash: { empty: true, fresh: true, equals: true, hash: true },
      'hash-key': { empty: true, fresh: true, equals: true, hash: true },
      'hash-equivalence': { empty: true, fresh: true, equals: true, hash: true },
      'sorted-natural': {
        empty: true,
        numbers: ['ClassCastError', false],
        fresh: true,
        equals: true,
        hash: true,
      },
      'sorted-comparator': { empty: true, fresh: true, equals: true, hash: true },
      'map value': { empty: true, fresh: true, equals: true, hash: true },
    },
  },
  hasOwnProperty: typed({
    printed: "'hasOwnProperty'",
    json: '"hasOwnProperty"',
    families: {
      list: { empty: true, fresh: true, equals: true, hash: true },
      'linked-list': { empty: true, fresh: true, equals: false, hash: true },
      'array-deque': { empty: true, fresh: true, equals: false, hash: true },
      'priority-queue-natural': {
        empty: true,
        numbers: ['ClassCastError', false],
        fresh: true,
        equals: false,
        hash: true,
      },
      'priority-queue-comparator': { empty: true, fresh: true, equals: false, hash: true },
      hash: { empty: true, fresh: true, equals: true, hash: true },
      'hash-key': { empty: true, fresh: true, equals: true, hash: true },
      'hash-equivalence': { empty: true, fresh: true, equals: true, hash: true },
      'sorted-natural': {
        empty: true,
        numbers: ['ClassCastError', false],
        fresh: true,
        equals: true,
        hash: true,
      },
      'sorted-comparator': { empty: true, fresh: true, equals: true, hash: true },
      'map value': { empty: true, fresh: true, equals: true, hash: true },
    },
  }),
  'frozen object': {
    printed: '[object Object]',
    json: '{"frozen":true}',
    families: {
      list: { empty: true, fresh: true, equals: true, hash: true },
      'linked-list': { empty: true, fresh: true, equals: false, hash: true },
      'array-deque': { empty: true, fresh: true, equals: false, hash: true },
      'priority-queue-natural': { empty: ['ClassCastError', false] },
      'priority-queue-comparator': { empty: true, fresh: true, equals: false, hash: true },
      hash: { empty: true, fresh: true, equals: true, hash: true },
      'hash-key': { empty: true, fresh: true, equals: true, hash: true },
      'hash-equivalence': { empty: true, fresh: true, equals: true, hash: true },
      'sorted-natural': { empty: ['ClassCastError', false] },
      'sorted-comparator': { empty: true, fresh: true, equals: true, hash: true },
      'map value': { empty: true, fresh: true, equals: true, hash: true },
    },
  },
  'sealed object': {
    printed: '[object Object]',
    json: '{"sealed":true}',
    families: {
      list: { empty: true, fresh: true, equals: true, hash: true },
      'linked-list': { empty: true, fresh: true, equals: false, hash: true },
      'array-deque': { empty: true, fresh: true, equals: false, hash: true },
      'priority-queue-natural': { empty: ['ClassCastError', false] },
      'priority-queue-comparator': { empty: true, fresh: true, equals: false, hash: true },
      hash: { empty: true, fresh: true, equals: true, hash: true },
      'hash-key': { empty: true, fresh: true, equals: true, hash: true },
      'hash-equivalence': { empty: true, fresh: true, equals: true, hash: true },
      'sorted-natural': { empty: ['ClassCastError', false] },
      'sorted-comparator': { empty: true, fresh: true, equals: true, hash: true },
      'map value': { empty: true, fresh: true, equals: true, hash: true },
    },
  },
  'frozen array': {
    printed: '[1, 2]',
    json: '[1,2]',
    families: {
      list: { empty: true, fresh: true, equals: true, hash: true },
      'linked-list': { empty: true, fresh: true, equals: false, hash: true },
      'array-deque': { empty: true, fresh: true, equals: false, hash: true },
      'priority-queue-natural': { empty: ['ClassCastError', false] },
      'priority-queue-comparator': { empty: true, fresh: true, equals: false, hash: true },
      hash: { empty: true, fresh: true, equals: true, hash: true },
      'hash-key': { empty: true, fresh: true, equals: true, hash: true },
      'hash-equivalence': { empty: true, fresh: true, equals: true, hash: true },
      'sorted-natural': { empty: ['ClassCastError', false] },
      'sorted-comparator': { empty: true, fresh: true, equals: true, hash: true },
      'map value': { empty: true, fresh: true, equals: true, hash: true },
    },
  },
  'null-prototype object': {
    printed: { error: 'TypeError' },
    json: '{}',
    families: {
      list: { empty: true, fresh: true, equals: true, hash: true },
      'linked-list': { empty: true, fresh: true, equals: false, hash: true },
      'array-deque': { empty: true, fresh: true, equals: false, hash: true },
      'priority-queue-natural': { empty: ['ClassCastError', false] },
      'priority-queue-comparator': { empty: true, fresh: true, equals: false, hash: true },
      hash: { empty: true, fresh: true, equals: true, hash: true },
      'hash-key': { empty: true, fresh: true, equals: true, hash: true },
      'hash-equivalence': { empty: true, fresh: true, equals: true, hash: true },
      'sorted-natural': { empty: ['ClassCastError', false] },
      'sorted-comparator': { empty: true, fresh: true, equals: true, hash: true },
      'map value': { empty: true, fresh: true, equals: true, hash: true },
    },
  },
  proxy: {
    printed: '[object Object]',
    json: '{"proxied":true}',
    families: {
      list: { empty: true, fresh: true, equals: true, hash: true },
      'linked-list': { empty: true, fresh: true, equals: false, hash: true },
      'array-deque': { empty: true, fresh: true, equals: false, hash: true },
      'priority-queue-natural': { empty: ['ClassCastError', false] },
      'priority-queue-comparator': { empty: true, fresh: true, equals: false, hash: true },
      hash: { empty: true, fresh: true, equals: true, hash: true },
      'hash-key': { empty: true, fresh: true, equals: true, hash: true },
      'hash-equivalence': { empty: true, fresh: true, equals: true, hash: true },
      'sorted-natural': { empty: ['ClassCastError', false] },
      'sorted-comparator': { empty: true, fresh: true, equals: true, hash: true },
      'map value': { empty: true, fresh: true, equals: true, hash: true },
    },
  },
  'revoked proxy': {
    printed: { error: 'TypeError' },
    json: { error: 'TypeError' },
    families: {
      list: { empty: true, fresh: true, equals: true, hash: 'TypeError' },
      'linked-list': { empty: true, fresh: true, equals: false, hash: true },
      'array-deque': { empty: true, fresh: true, equals: false, hash: true },
      'priority-queue-natural': { empty: ['TypeError', false] },
      'priority-queue-comparator': { empty: true, fresh: true, equals: false, hash: true },
      hash: { empty: true, fresh: true, equals: true, hash: 'TypeError' },
      'hash-key': { empty: true, fresh: true, equals: true, hash: true },
      'hash-equivalence': { empty: ['TypeError', 'TypeError'] },
      'sorted-natural': {
        empty: ['TypeError', false],
        numbers: ['TypeError', 'TypeError'],
        strings: ['TypeError', 'TypeError'],
      },
      'sorted-comparator': { empty: true, fresh: true, equals: true, hash: 'TypeError' },
      'map value': { empty: true, fresh: true, equals: true, hash: 'TypeError' },
    },
  },
  'fresh object': {
    printed: '[object Object]',
    json: '{}',
    families: {
      list: { empty: true, fresh: false, equals: false, hash: true },
      'linked-list': { empty: true, fresh: false, equals: false, hash: true },
      'array-deque': { empty: true, fresh: false, equals: false, hash: true },
      'priority-queue-natural': { empty: ['ClassCastError', false] },
      'priority-queue-comparator': { empty: true, fresh: false, equals: false, hash: true },
      hash: { empty: true, fresh: false, equals: false, hash: true },
      'hash-key': { empty: true, fresh: false, equals: false, hash: true },
      'hash-equivalence': { empty: true, fresh: false, equals: false, hash: true },
      'sorted-natural': { empty: ['ClassCastError', false] },
      'sorted-comparator': { empty: true, fresh: false, equals: false, hash: true },
      'map value': { empty: true, fresh: false, equals: false, hash: true },
    },
  },
  'throwing equalsSymbol getter': {
    printed: '[object Object]',
    json: '{}',
    families: {
      list: { empty: true, fresh: false, equals: 'HostileError', hash: 'HostileError' },
      'linked-list': { empty: true, fresh: false, equals: false, hash: true },
      'array-deque': { empty: true, fresh: false, equals: false, hash: true },
      'priority-queue-natural': { empty: ['ClassCastError', false] },
      'priority-queue-comparator': { empty: true, fresh: false, equals: false, hash: true },
      hash: { empty: true, fresh: false, equals: false, hash: 'HostileError' },
      'hash-key': { empty: true, fresh: false, equals: false, hash: true },
      'hash-equivalence': { empty: ['HostileError', 'HostileError'] },
      'sorted-natural': { empty: ['ClassCastError', false] },
      'sorted-comparator': { empty: true, fresh: false, equals: false, hash: 'HostileError' },
      'map value': { empty: true, fresh: false, equals: 'HostileError', hash: 'HostileError' },
    },
  },
  'throwing hashCodeSymbol getter': {
    printed: '[object Object]',
    json: '{}',
    families: {
      list: { empty: true, fresh: false, equals: false, hash: 'HostileError' },
      'linked-list': { empty: true, fresh: false, equals: false, hash: true },
      'array-deque': { empty: true, fresh: false, equals: false, hash: true },
      'priority-queue-natural': { empty: ['ClassCastError', false] },
      'priority-queue-comparator': { empty: true, fresh: false, equals: false, hash: true },
      hash: { empty: true, fresh: false, equals: false, hash: 'HostileError' },
      'hash-key': { empty: true, fresh: false, equals: false, hash: true },
      'hash-equivalence': { empty: ['HostileError', 'HostileError'] },
      'sorted-natural': { empty: ['ClassCastError', false] },
      'sorted-comparator': { empty: true, fresh: false, equals: false, hash: 'HostileError' },
      'map value': { empty: true, fresh: false, equals: false, hash: 'HostileError' },
    },
  },
  'throwing compareSymbol getter': {
    printed: '[object Object]',
    json: '{}',
    families: {
      list: { empty: true, fresh: false, equals: false, hash: true },
      'linked-list': { empty: true, fresh: false, equals: false, hash: true },
      'array-deque': { empty: true, fresh: false, equals: false, hash: true },
      'priority-queue-natural': { empty: ['HostileError', false] },
      'priority-queue-comparator': { empty: true, fresh: false, equals: false, hash: true },
      hash: { empty: true, fresh: false, equals: false, hash: true },
      'hash-key': { empty: true, fresh: false, equals: false, hash: true },
      'hash-equivalence': { empty: true, fresh: false, equals: false, hash: true },
      'sorted-natural': {
        empty: ['HostileError', false],
        numbers: ['HostileError', 'HostileError'],
        strings: ['HostileError', 'HostileError'],
      },
      'sorted-comparator': { empty: true, fresh: false, equals: false, hash: true },
      'map value': { empty: true, fresh: false, equals: false, hash: true },
    },
  },
  'throwing toString getter': {
    printed: { error: 'HostileError' },
    json: '{}',
    families: {
      list: { empty: true, fresh: false, equals: false, hash: true },
      'linked-list': { empty: true, fresh: false, equals: false, hash: true },
      'array-deque': { empty: true, fresh: false, equals: false, hash: true },
      'priority-queue-natural': { empty: ['ClassCastError', false] },
      'priority-queue-comparator': { empty: true, fresh: false, equals: false, hash: true },
      hash: { empty: true, fresh: false, equals: false, hash: true },
      'hash-key': { empty: true, fresh: false, equals: false, hash: true },
      'hash-equivalence': { empty: true, fresh: false, equals: false, hash: true },
      'sorted-natural': { empty: ['ClassCastError', false] },
      'sorted-comparator': { empty: true, fresh: false, equals: false, hash: true },
      'map value': { empty: true, fresh: false, equals: false, hash: true },
    },
  },
  'throwing toPrimitive getter': {
    printed: { error: 'HostileError' },
    json: '{}',
    families: {
      list: { empty: true, fresh: false, equals: false, hash: true },
      'linked-list': { empty: true, fresh: false, equals: false, hash: true },
      'array-deque': { empty: true, fresh: false, equals: false, hash: true },
      'priority-queue-natural': { empty: ['ClassCastError', false] },
      'priority-queue-comparator': { empty: true, fresh: false, equals: false, hash: true },
      hash: { empty: true, fresh: false, equals: false, hash: true },
      'hash-key': { empty: true, fresh: false, equals: false, hash: true },
      'hash-equivalence': { empty: true, fresh: false, equals: false, hash: true },
      'sorted-natural': { empty: ['ClassCastError', false] },
      'sorted-comparator': { empty: true, fresh: false, equals: false, hash: true },
      'map value': { empty: true, fresh: false, equals: false, hash: true },
    },
  },
  'throwing toJSON getter': {
    printed: '[object Object]',
    json: { error: 'HostileError' },
    families: {
      list: { empty: true, fresh: false, equals: false, hash: true },
      'linked-list': { empty: true, fresh: false, equals: false, hash: true },
      'array-deque': { empty: true, fresh: false, equals: false, hash: true },
      'priority-queue-natural': { empty: ['ClassCastError', false] },
      'priority-queue-comparator': { empty: true, fresh: false, equals: false, hash: true },
      hash: { empty: true, fresh: false, equals: false, hash: true },
      'hash-key': { empty: true, fresh: false, equals: false, hash: true },
      'hash-equivalence': { empty: true, fresh: false, equals: false, hash: true },
      'sorted-natural': { empty: ['ClassCastError', false] },
      'sorted-comparator': { empty: true, fresh: false, equals: false, hash: true },
      'map value': { empty: true, fresh: false, equals: false, hash: true },
    },
  },
  'equalsSymbol throws': {
    printed: '[object Object]',
    json: '{}',
    families: {
      list: { empty: true, fresh: false, equals: 'HostileError', hash: true },
      'linked-list': { empty: true, fresh: false, equals: false, hash: true },
      'array-deque': { empty: true, fresh: false, equals: false, hash: true },
      'priority-queue-natural': { empty: ['ClassCastError', false] },
      'priority-queue-comparator': { empty: true, fresh: false, equals: false, hash: true },
      hash: { empty: true, fresh: false, equals: false, hash: true },
      'hash-key': { empty: true, fresh: false, equals: false, hash: true },
      'hash-equivalence': {
        empty: true,
        fresh: 'HostileError',
        equals: 'HostileError',
        hash: true,
      },
      'sorted-natural': { empty: ['ClassCastError', false] },
      'sorted-comparator': { empty: true, fresh: false, equals: false, hash: true },
      'map value': { empty: true, fresh: false, equals: 'HostileError', hash: true },
    },
  },
  'hashCodeSymbol throws': {
    printed: '[object Object]',
    json: '{}',
    families: {
      list: { empty: true, fresh: false, equals: true, hash: 'HostileError' },
      'linked-list': { empty: true, fresh: false, equals: false, hash: true },
      'array-deque': { empty: true, fresh: false, equals: false, hash: true },
      'priority-queue-natural': { empty: ['ClassCastError', false] },
      'priority-queue-comparator': { empty: true, fresh: false, equals: false, hash: true },
      hash: { empty: true, fresh: false, equals: false, hash: 'HostileError' },
      'hash-key': { empty: true, fresh: false, equals: false, hash: true },
      'hash-equivalence': { empty: ['HostileError', 'HostileError'] },
      'sorted-natural': { empty: ['ClassCastError', false] },
      'sorted-comparator': { empty: true, fresh: false, equals: false, hash: 'HostileError' },
      'map value': { empty: true, fresh: false, equals: true, hash: 'HostileError' },
    },
  },
  'equalsSymbol returns a non-boolean': {
    printed: '[object Object]',
    json: '{}',
    families: {
      list: { empty: true, fresh: false, equals: 'TypeError', hash: true },
      'linked-list': { empty: true, fresh: false, equals: false, hash: true },
      'array-deque': { empty: true, fresh: false, equals: false, hash: true },
      'priority-queue-natural': { empty: ['ClassCastError', false] },
      'priority-queue-comparator': { empty: true, fresh: false, equals: false, hash: true },
      hash: { empty: true, fresh: false, equals: false, hash: true },
      'hash-key': { empty: true, fresh: false, equals: false, hash: true },
      'hash-equivalence': { empty: true, fresh: 'TypeError', equals: 'TypeError', hash: true },
      'sorted-natural': { empty: ['ClassCastError', false] },
      'sorted-comparator': { empty: true, fresh: false, equals: false, hash: true },
      'map value': { empty: true, fresh: false, equals: 'TypeError', hash: true },
    },
  },
  'hashCodeSymbol returns NaN': {
    printed: '[object Object]',
    json: '{}',
    families: {
      list: { empty: true, fresh: false, equals: true, hash: 'TypeError' },
      'linked-list': { empty: true, fresh: false, equals: false, hash: true },
      'array-deque': { empty: true, fresh: false, equals: false, hash: true },
      'priority-queue-natural': { empty: ['ClassCastError', false] },
      'priority-queue-comparator': { empty: true, fresh: false, equals: false, hash: true },
      hash: { empty: true, fresh: false, equals: false, hash: 'TypeError' },
      'hash-key': { empty: true, fresh: false, equals: false, hash: true },
      'hash-equivalence': { empty: ['TypeError', 'TypeError'] },
      'sorted-natural': { empty: ['ClassCastError', false] },
      'sorted-comparator': { empty: true, fresh: false, equals: false, hash: 'TypeError' },
      'map value': { empty: true, fresh: false, equals: true, hash: 'TypeError' },
    },
  },
  'hashCodeSymbol returns a string': {
    printed: '[object Object]',
    json: '{}',
    families: {
      list: { empty: true, fresh: false, equals: true, hash: 'TypeError' },
      'linked-list': { empty: true, fresh: false, equals: false, hash: true },
      'array-deque': { empty: true, fresh: false, equals: false, hash: true },
      'priority-queue-natural': { empty: ['ClassCastError', false] },
      'priority-queue-comparator': { empty: true, fresh: false, equals: false, hash: true },
      hash: { empty: true, fresh: false, equals: false, hash: 'TypeError' },
      'hash-key': { empty: true, fresh: false, equals: false, hash: true },
      'hash-equivalence': { empty: ['TypeError', 'TypeError'] },
      'sorted-natural': { empty: ['ClassCastError', false] },
      'sorted-comparator': { empty: true, fresh: false, equals: false, hash: 'TypeError' },
      'map value': { empty: true, fresh: false, equals: true, hash: 'TypeError' },
    },
  },
  'equal by protocol': {
    printed: '[object Object]',
    json: '{}',
    families: {
      list: { empty: true, fresh: false, equals: true, hash: true },
      'linked-list': { empty: true, fresh: false, equals: false, hash: true },
      'array-deque': { empty: true, fresh: false, equals: false, hash: true },
      'priority-queue-natural': { empty: ['ClassCastError', false] },
      'priority-queue-comparator': { empty: true, fresh: false, equals: false, hash: true },
      hash: { empty: true, fresh: false, equals: false, hash: true },
      'hash-key': { empty: true, fresh: false, equals: false, hash: true },
      'hash-equivalence': { empty: true, fresh: true, equals: true, hash: true },
      'sorted-natural': { empty: ['ClassCastError', false] },
      'sorted-comparator': { empty: true, fresh: false, equals: false, hash: true },
      'map value': { empty: true, fresh: false, equals: true, hash: true },
    },
  },
}

// ---------------------------------------------------------------------------------------------
// Membership

/**
 * The family of every collection class and factory the package exports, of every option path that
 * changes the family, and of every collection a member of the bound table returns. `read-only`
 * marks the overlay, whose lookups follow its source.
 */
export const MEMBERSHIP: { readonly [member: string]: ValueFamily | 'read-only' } = {
  ArrayList: 'list',
  'ArrayList.copy': 'list',
  'ArrayList.reversed': 'list',
  'ArrayList.subList': 'list',
  asList: 'list',
  LinkedList: 'linked-list',
  'LinkedList.copy': 'linked-list',
  'LinkedList.reversed': 'linked-list',
  ArrayDeque: 'array-deque',
  'ArrayDeque.copy': 'array-deque',
  'ArrayDeque.reversed': 'array-deque',
  PriorityQueue: 'priority-queue-natural',
  'PriorityQueue.copy': 'priority-queue-natural',
  'PriorityQueue/comparator': 'priority-queue-comparator',
  HashSet: 'hash',
  'HashSet.copy': 'hash',
  'HashSet/key': 'hash-key',
  'HashSet/equivalence': 'hash-equivalence',
  LinkedHashSet: 'hash',
  'LinkedHashSet.copy': 'hash',
  'LinkedHashSet.reversed': 'hash',
  'LinkedHashSet/key': 'hash-key',
  'LinkedHashSet/equivalence': 'hash-equivalence',
  newSetFromMap: 'hash',
  HashMap: 'hash',
  'HashMap.copy': 'hash',
  'HashMap.keySet': 'hash',
  'HashMap.entrySet': 'hash',
  'HashMap.valueCollection': 'list',
  'HashMap/key': 'hash-key',
  'HashMap/equivalence': 'hash-equivalence',
  LinkedHashMap: 'hash',
  'LinkedHashMap.copy': 'hash',
  'LinkedHashMap.keySet': 'hash',
  'LinkedHashMap.entrySet': 'hash',
  'LinkedHashMap.valueCollection': 'list',
  'LinkedHashMap.reversed': 'hash',
  'LinkedHashMap/key': 'hash-key',
  'LinkedHashMap/equivalence': 'hash-equivalence',
  TreeSet: 'sorted-natural',
  'TreeSet.copy': 'sorted-natural',
  'TreeSet.reversed': 'sorted-natural',
  'TreeSet.headSet': 'sorted-natural',
  'TreeSet.subSet': 'sorted-natural',
  'TreeSet.tailSet': 'sorted-natural',
  'TreeSet/comparator': 'sorted-comparator',
  TreeMap: 'sorted-natural',
  'TreeMap.copy': 'sorted-natural',
  'TreeMap.keySet': 'sorted-natural',
  'TreeMap.entrySet': 'sorted-natural',
  'TreeMap.valueCollection': 'list',
  'TreeMap.reversed': 'sorted-natural',
  'TreeMap.headMap': 'sorted-natural',
  'TreeMap.subMap': 'sorted-natural',
  'TreeMap.tailMap': 'sorted-natural',
  'TreeMap/comparator': 'sorted-comparator',
  listOf: 'read-only',
  copyOfList: 'read-only',
  setOf: 'read-only',
  copyOfSet: 'read-only',
  mapOf: 'read-only',
  copyOfMap: 'read-only',
  unmodifiableCollection: 'read-only',
  unmodifiableSequencedCollection: 'read-only',
  unmodifiableList: 'read-only',
  unmodifiableSet: 'read-only',
  unmodifiableSequencedSet: 'read-only',
  unmodifiableSortedSet: 'read-only',
  unmodifiableMap: 'read-only',
  unmodifiableSequencedMap: 'read-only',
  unmodifiableSortedMap: 'read-only',
}

/** Exports that hold no values, so they have no family. */
export const NOT_COLLECTIONS: readonly string[] = [
  'ClassCastError',
  'ConcurrentModificationError',
  'IllegalArgumentError',
  'IllegalStateError',
  'IndexOutOfBoundsError',
  'NoSuchElementError',
  'NullElementError',
  'UnsupportedOperationError',
  'binarySearch',
  'compareSymbol',
  'comparing',
  'disjoint',
  'equals',
  'equalsSymbol',
  'fill',
  'frequency',
  'hashCode',
  'hashCodeSymbol',
  'indexOfSubList',
  'isCollection',
  'isDeque',
  'isList',
  'isMapCollection',
  'isQueue',
  'isSequencedCollection',
  'isSetCollection',
  'isSortedMap',
  'isSortedSet',
  'lastIndexOfSubList',
  'max',
  'min',
  'naturalOrder',
  'nullsFirst',
  'nullsLast',
  'reverse',
  'reverseOrder',
  'rotate',
  'sameValueZeroEquivalence',
  'shuffle',
  'sortedIndex',
  'swap',
  'thenComparing',
  'valueEquivalence',
]

/** Members in the bound table's views group that return a collection. */
export const VIEW_METHODS: readonly string[] = [
  'copy',
  'entrySet',
  'headMap',
  'headSet',
  'keySet',
  'reversed',
  'subList',
  'subMap',
  'subSet',
  'tailMap',
  'tailSet',
  'valueCollection',
]

/** Members in the bound table's views group that return an iterator, a cursor, an array or text. */
export const OUTPUT_METHODS: readonly string[] = [
  '[Symbol.iterator]',
  'cursor',
  'entries',
  'keys',
  'listCursor',
  'toArray',
  'toJSON',
  'toString',
  'values',
]

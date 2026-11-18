import { describe, expect, it } from 'vitest'
import {
  ArrayDeque,
  ArrayList,
  equals,
  HashMap,
  HashSet,
  hashCode,
  LinkedHashMap,
  LinkedHashSet,
  LinkedList,
  TreeMap,
  TreeSet,
  valueEquivalence,
} from '../../src/index'
import { SCALE } from './config'

const N = SCALE.elements
const D = SCALE.nestingDepth

/** 0 … N − 1 in a fixed scrambled order. */
const values = Array.from({ length: N }, (_, i) => (i * 7_919) % N)

interface Printed {
  readonly name: string
  readonly make: () => object
  /** The printed form, written from the documented format. */
  readonly printed: string
  /** What `JSON.stringify` writes: an array of the elements (pairs for maps). */
  readonly json: unknown
  /** An equal collection, built independently, and an unequal one. */
  readonly equal: () => object
  readonly unequal: () => object
  /** Deques compare as the same object only, as documented. */
  readonly identity?: boolean
}

function sequence(name: string, make: (items: number[]) => object, identity = false): Printed {
  return {
    name,
    identity,
    make: () => make(values),
    printed: `${name}(${N}) [${values.join(', ')}]`,
    json: values,
    equal: () => make(values.slice()),
    unequal: () => make([...values.slice(0, -1), -1]),
  }
}

function set(name: string, make: (items: number[]) => object, sorted: boolean): Printed {
  const order = sorted ? values.slice().sort((a, b) => a - b) : values
  return {
    name,
    make: () => make(values),
    printed: `${name}(${N}) {${order.join(', ')}}`,
    json: order,
    // Equal sets need not iterate in the same order.
    equal: () => make(values.slice().reverse()),
    unequal: () => make([...values.slice(0, -1), -1]),
  }
}

function map(
  name: string,
  make: (entries: Array<[number, number]>) => object,
  sorted: boolean,
): Printed {
  const keys = sorted ? values.slice().sort((a, b) => a - b) : values
  const entries = (source: number[]) => source.map((k) => [k, k * 2] as [number, number])
  return {
    name,
    make: () => make(entries(values)),
    printed: `${name}(${N}) {${keys.map((k) => `${k} => ${k * 2}`).join(', ')}}`,
    json: entries(keys),
    equal: () => make(entries(values.slice().reverse())),
    unequal: () => make([...entries(values.slice(0, -1)), [values[N - 1] as number, -1]]),
  }
}

describe('printing, JSON, equality and hashing at a million elements', () => {
  const cases: Printed[] = [
    sequence('ArrayList', (items) => new ArrayList(items)),
    sequence('LinkedList', (items) => new LinkedList(items), true),
    sequence('ArrayDeque', (items) => new ArrayDeque(items), true),
    set('HashSet', (items) => new HashSet(items), false),
    set('LinkedHashSet', (items) => new LinkedHashSet(items), false),
    set('TreeSet', (items) => new TreeSet(items), true),
    map('HashMap', (entries) => new HashMap(entries), false),
    map('LinkedHashMap', (entries) => new LinkedHashMap(entries), false),
    map('TreeMap', (entries) => new TreeMap(entries), true),
  ]
  for (const c of cases) {
    it(`${c.name}: prints, writes JSON, compares and hashes a million elements as the reference does [033 S1-AC4]`, () => {
      const collection = c.make()
      expect(String(collection) === c.printed, `${c.name} printed form`).toBe(true)
      expect(JSON.stringify(collection) === JSON.stringify(c.json), `${c.name} JSON`).toBe(true)
      const other = c.equal()
      expect(equals(collection, collection)).toBe(true)
      if (c.identity === true) {
        expect(equals(collection, other)).toBe(false)
        return
      }
      expect(equals(collection, other)).toBe(true)
      expect(equals(other, collection)).toBe(true)
      expect(hashCode(collection)).toBe(hashCode(other))
      expect(equals(collection, c.unequal())).toBe(false)
    })
  }
})

interface Chain {
  readonly name: string
  /** Wraps `inner` in one more level. */
  readonly wrap: (inner: unknown) => object
  /** The innermost collection, around `0`. */
  readonly leaf: () => object
  /** The printed form of one level, before and after the inner part. */
  readonly open: string
  readonly close: string
  /** The JSON of one level, before and after the inner part. */
  readonly jsonOpen: string
  readonly jsonClose: string
  /**
   * How two independently built chains compare: `equal`, or `identity` (deques compare as the same
   * object only).
   */
  readonly equality: 'equal' | 'identity'
}

function chain(c: Chain, depth: number): object {
  let value: object = c.leaf()
  for (let i = 1; i < depth; i++) value = c.wrap(value)
  return value
}

describe('nested collections', () => {
  const chains: Chain[] = [
    {
      name: 'a list in a list',
      wrap: (inner) => new ArrayList([inner]),
      leaf: () => new ArrayList([0]),
      open: 'ArrayList(1) [',
      close: ']',
      jsonOpen: '[',
      jsonClose: ']',
      equality: 'equal',
    },
    {
      name: 'a deque in a deque',
      wrap: (inner) => new ArrayDeque([inner]),
      leaf: () => new ArrayDeque([0]),
      open: 'ArrayDeque(1) [',
      close: ']',
      jsonOpen: '[',
      jsonClose: ']',
      equality: 'identity',
    },
    {
      name: 'a map value in a map',
      wrap: (inner) => new HashMap([[0, inner]]),
      leaf: () => new HashMap([[0, 0]]),
      open: 'HashMap(1) {0 => ',
      close: '}',
      jsonOpen: '[[0,',
      jsonClose: ']]',
      equality: 'equal',
    },
    {
      name: 'a set in a set',
      wrap: (inner) => new HashSet([inner], { equivalence: valueEquivalence }),
      leaf: () => new HashSet([0], { equivalence: valueEquivalence }),
      open: 'HashSet(1) {',
      close: '}',
      jsonOpen: '[',
      jsonClose: ']',
      equality: 'equal',
    },
  ]
  for (const c of chains) {
    it(`${c.name}, nested to the configured depth: prints, writes JSON, compares and hashes without a stack overflow [033 S1-AC4]`, () => {
      const top = chain(c, D)
      expect(String(top)).toBe(`${c.open.repeat(D - 1)}${c.open}0${c.close.repeat(D)}`)
      expect(JSON.stringify(top)).toBe(`${c.jsonOpen.repeat(D)}0${c.jsonClose.repeat(D)}`)
      const other = chain(c, D)
      expect(equals(top, top)).toBe(true)
      expect(equals(top, chain(c, D - 1))).toBe(false)
      if (c.equality === 'identity') {
        expect(equals(top, other)).toBe(false)
        return
      }
      expect(hashCode(top)).toBe(hashCode(other))
      expect(equals(top, other)).toBe(true)
    })
  }

  const deep: Array<{
    name: string
    wrap: (inner: unknown) => ArrayList<unknown> | HashMap<number, unknown>
    cut: (link: ArrayList<unknown> | HashMap<number, unknown>) => void
    copy: () => object
    printed: string
  }> = [
    {
      name: 'ArrayList',
      wrap: (inner) => new ArrayList([inner]),
      cut: (link) => void (link as ArrayList<unknown>).set(0, 'leaf'),
      copy: () => new ArrayList(['leaf']),
      printed: "ArrayList(1) ['leaf']",
    },
    {
      name: 'HashMap',
      wrap: (inner) => new HashMap<number, unknown>([[0, inner]]),
      cut: (link) => void (link as HashMap<number, unknown>).set(0, 'leaf'),
      copy: () => new HashMap([[0, 'leaf']]),
      printed: "HashMap(1) {0 => 'leaf'}",
    },
  ]
  for (const c of deep) {
    it(`a ${c.name} chain nested far past the stack throws RangeError when printed, compared or hashed, and leaves no collection marked as in progress [033 S1-AC5]`, () => {
      const build = () => {
        const links: Array<ArrayList<unknown> | HashMap<number, unknown>> = []
        let value: unknown = 0
        for (let i = 0; i < SCALE.overflowDepth; i++) {
          const link = c.wrap(value)
          links.push(link)
          value = link
        }
        return links
      }
      const links = build()
      const top = links[links.length - 1] as object
      const other = build()[SCALE.overflowDepth - 1] as object
      expect(() => String(top)).toThrow(RangeError)
      expect(() => equals(top, other)).toThrow(RangeError)
      expect(() => hashCode(top)).toThrow(RangeError)
      for (const link of links) c.cut(link)
      const copy = c.copy()
      const copyHash = hashCode(copy)
      let wrong = 0
      for (const link of links) {
        const printed = String(link)
        if (printed !== c.printed || printed.includes('[Circular]')) wrong++
        else if (!equals(link, copy) || hashCode(link) !== copyHash) wrong++
      }
      expect(wrong).toBe(0)
    })
  }

  it('JSON.stringify of a collection that contains itself fails with the engine’s RangeError [033 S1-AC6]', () => {
    const list = new ArrayList<unknown>([1])
    list.add(list)
    expect(() => JSON.stringify(list)).toThrow(RangeError)
    const values = new HashMap<number, unknown>()
    values.set(0, values)
    expect(() => JSON.stringify(values)).toThrow(RangeError)
    expect(String(list)).toBe('ArrayList(2) [1, [Circular]]')
  })
})

import { describe, expect, it } from 'vitest'
import {
  ArrayList,
  equals,
  equalsSymbol,
  HashMap,
  HashSet,
  hashCode,
  hashCodeSymbol,
  LinkedHashMap,
  LinkedHashSet,
  TreeMap,
  valueEquivalence,
} from '../src/index'

// Deep enough that doubling work per level (2^30 leaf comparisons) could never pass the bounds;
// shallow enough for engines with small stacks.
const DEPTH = 30

let leafCalls = 0
let leafHashes = 0
let leafThrows = false

class Leaf {
  constructor(readonly id: number) {}
  [equalsSymbol](other: unknown): boolean {
    leafCalls++
    if (leafThrows) throw new Error('leaf comparison failed')
    return other instanceof Leaf && other.id === this.id
  }
  [hashCodeSymbol](): number {
    leafHashes++
    return this.id
  }
}

const kinds: Array<{ name: string; wrap: (inner: unknown) => object }> = [
  { name: 'HashMap', wrap: (inner) => new HashMap([[0, inner]]) },
  { name: 'LinkedHashMap', wrap: (inner) => new LinkedHashMap([[0, inner]]) },
  { name: 'TreeMap', wrap: (inner) => new TreeMap([[0, inner]]) },
  { name: 'HashSet', wrap: (inner) => new HashSet([inner], { equivalence: valueEquivalence }) },
  {
    name: 'LinkedHashSet',
    wrap: (inner) => new LinkedHashSet([inner], { equivalence: valueEquivalence }),
  },
  { name: 'ArrayList', wrap: (inner) => new ArrayList([inner]) },
]

const mapWrap = (inner: unknown): object => new HashMap([[0, inner]])

function chain(wrap: (inner: unknown) => object, depth: number, leaf: Leaf): object {
  let value: unknown = leaf
  for (let i = 0; i < depth; i++) value = wrap(value)
  return value as object
}

describe('equality of nested collections', () => {
  for (const { name, wrap } of kinds) {
    it(`${name} nested 30 deep compares each pair of levels a bounded number of times [033 S1-AC4]`, () => {
      const a = chain(wrap, DEPTH, new Leaf(1))
      const b = chain(wrap, DEPTH, new Leaf(1))
      leafCalls = 0
      expect(equals(a, b)).toBe(true)
      expect(equals(b, a)).toBe(true)
      expect(leafCalls).toBeLessThanOrEqual(4)
    })

    it(`${name} nested 30 deep with a different innermost value is unequal both ways round [033 S1-AC4]`, () => {
      const a = chain(wrap, DEPTH, new Leaf(1))
      const b = chain(wrap, DEPTH, new Leaf(2))
      leafCalls = 0
      expect(equals(a, b)).toBe(false)
      expect(equals(b, a)).toBe(false)
      expect(leafCalls).toBeLessThanOrEqual(8)
    })
  }

  it('forgets earlier results once a comparison returns, so later changes are seen [033 S1-AC4]', () => {
    const inner = new HashMap([[0, new Leaf(1)]])
    const a = new HashMap([[0, inner]])
    const b = new HashMap([[0, new HashMap([[0, new Leaf(1)]])]])
    expect(equals(a, b)).toBe(true)
    inner.set(0, new Leaf(2))
    expect(equals(a, b)).toBe(false)
    expect(equals(b, a)).toBe(false)
  })

  it('forgets earlier results when a comparison throws [033 S1-AC4]', () => {
    const a = chain(mapWrap, 10, new Leaf(1))
    const b = chain(mapWrap, 10, new Leaf(1))
    leafThrows = true
    try {
      expect(() => equals(a, b)).toThrow('leaf comparison failed')
    } finally {
      leafThrows = false
    }
    expect(equals(a, b)).toBe(true)
    // Change the innermost map of `a`: a comparison remembered from before must not answer.
    let innermost = a as HashMap<number, unknown>
    for (let i = 1; i < 10; i++) innermost = innermost.get(0) as HashMap<number, unknown>
    innermost.set(0, new Leaf(2))
    expect(equals(a, b)).toBe(false)
    expect(equals(b, a)).toBe(false)
  })

  for (const { name, wrap } of kinds.filter((k) => k.name.endsWith('Set'))) {
    it(`${name} nested ${DEPTH} deep hashes each level's members a number of times that grows at most with the square of the depth [033 S1-AC4]`, () => {
      const a = chain(wrap, DEPTH, new Leaf(1))
      const b = chain(wrap, DEPTH, new Leaf(1))
      leafHashes = 0
      expect(equals(a, b)).toBe(true)
      expect(leafHashes).toBeLessThanOrEqual(DEPTH * DEPTH)
    })
  }

  it('compares again a pair that changed after it was found equal, within the same comparison [033 S1-AC4]', () => {
    const x = new HashMap([[0, 1]])
    const y = new HashMap([[0, 1]])
    const seen: boolean[] = []
    class Probe {
      [equalsSymbol](other: unknown): boolean {
        seen.push(equals(x, y))
        x.set(0, 2)
        seen.push(equals(x, y))
        return other instanceof Probe
      }
      [hashCodeSymbol](): number {
        return 0
      }
    }
    expect(equals(new HashMap([[0, new Probe()]]), new HashMap([[0, new Probe()]]))).toBe(true)
    expect(seen.slice(0, 2)).toEqual([true, false])
  })
})

describe('collections nested past the stack', () => {
  it('print, compare and hash normally again after a comparison throws the engine error [033 S1-AC5]', () => {
    const build = () => {
      const links: ArrayList<unknown>[] = []
      let value: unknown = 0
      for (let i = 0; i < 100_000; i++) {
        value = new ArrayList([value])
        links.push(value as ArrayList<unknown>)
      }
      return links
    }
    const links = build()
    const top = links[links.length - 1] as ArrayList<unknown>
    const other = build()[links.length - 1] as ArrayList<unknown>
    expect(() => String(top)).toThrow(RangeError)
    expect(() => equals(top, other)).toThrow(RangeError)
    expect(() => hashCode(top)).toThrow(RangeError)
    for (const link of links) link.set(0, 'leaf')
    const copy = new ArrayList(['leaf'])
    const copyHash = hashCode(copy)
    const wrong = links.filter(
      (link) =>
        String(link) !== "ArrayList(1) ['leaf']" ||
        !equals(link, copy) ||
        hashCode(link) !== copyHash,
    )
    expect(wrong.length).toBe(0)
  })
})

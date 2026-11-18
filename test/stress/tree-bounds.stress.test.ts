import { assert, describe, expect, it } from 'vitest'
import { compareSymbol, TreeMap, TreeSet } from '../../src/index'
import { integer, seeded } from '../support/random'
import { SCALE } from './config'

const N = SCALE.elements

/** ⌈log₂(n + 1)⌉, exactly. */
const height = (n: number): number => 32 - Math.clz32(n)

let calls = 0

/** A key in natural order that counts its comparisons. */
class Key {
  constructor(readonly n: number) {}
  [compareSymbol](other: Key): number {
    calls++
    return this.n - other.n
  }
}

const counting = (a: number, b: number): number => {
  calls++
  return a - b
}

type Order = 'ascending' | 'descending' | 'alternating'

/** The i-th key of `order` over 0 … N − 1; alternating is 0, N − 1, 1, N − 2, …. */
function keyAt(order: Order, i: number): number {
  if (order === 'ascending') return i
  if (order === 'descending') return N - 1 - i
  return i % 2 === 0 ? i / 2 : N - 1 - (i - 1) / 2
}

interface Tree {
  readonly size: number
  insert(n: number): void
  lookup(n: number): boolean
  remove(n: number): boolean
  keys(): number[]
}

/** Runs `op` with the counter reset and fails if it compared more than the bound for `size`. */
function bounded<T>(op: () => T, size: number, c: number, at: string): T {
  calls = 0
  const result = op()
  const bound = 2 * height(size) + c
  if (calls > bound) assert.fail(`${at}: ${calls} comparisons at size ${size}, bound ${bound}`)
  return result
}

function checkBounds(name: string, make: () => Tree, c: number, order: Order): void {
  const random = seeded(5)
  const tree = make()
  for (let i = 0; i < N; i++) {
    const k = keyAt(order, i)
    bounded(() => tree.insert(k), tree.size, c, `${name} ${order} insert ${k}`)
  }
  expect(tree.size).toBe(N)
  const keys = tree.keys()
  for (let i = 0; i < N; i++)
    if (keys[i] !== i) assert.fail(`${name} ${order}: key ${i} is ${keys[i]}`)
  for (let q = 0; q < SCALE.queries; q++) {
    const k = integer(random, -N, 2 * N)
    const found = bounded(() => tree.lookup(k), N, c, `${name} ${order} lookup ${k}`)
    if (found !== (k >= 0 && k < N)) assert.fail(`${name} ${order}: lookup ${k} gave ${found}`)
  }
  for (let i = 0; i < N; i++) {
    const k = keyAt(order, i)
    const removed = bounded(() => tree.remove(k), tree.size, c, `${name} ${order} remove ${k}`)
    if (!removed) assert.fail(`${name} ${order}: remove ${k} found nothing`)
  }
  expect(tree.size).toBe(0)
}

const comparatorSet = (): Tree => {
  const set = new TreeSet<number>({ comparator: counting })
  return {
    get size() {
      return set.size
    },
    insert: (n) => void set.add(n),
    lookup: (n) => set.has(n),
    remove: (n) => set.delete(n),
    keys: () => set.toArray(),
  }
}

const naturalSet = (): Tree => {
  const set = new TreeSet<Key>()
  return {
    get size() {
      return set.size
    },
    insert: (n) => void set.add(new Key(n)),
    lookup: (n) => set.has(new Key(n)),
    remove: (n) => set.delete(new Key(n)),
    keys: () => set.toArray().map((k) => k.n),
  }
}

const comparatorMap = (): Tree => {
  const map = new TreeMap<number, number>({ comparator: counting })
  return {
    get size() {
      return map.size
    },
    insert: (n) => void map.set(n, n),
    lookup: (n) => map.get(n) === n,
    remove: (n) => map.delete(n),
    keys: () => [...map.keys()],
  }
}

const naturalMap = (): Tree => {
  const map = new TreeMap<Key, number>()
  return {
    get size() {
      return map.size
    },
    insert: (n) => void map.set(new Key(n), n),
    lookup: (n) => map.get(new Key(n)) === n,
    remove: (n) => map.delete(new Key(n)),
    keys: () => [...map.keys()].map((k) => k.n),
  }
}

describe('tree comparison bounds at a million keys', () => {
  const orders: Order[] = ['ascending', 'descending', 'alternating']
  const trees: Array<[string, () => Tree, number]> = [
    ['TreeSet with a comparator', comparatorSet, 0],
    ['TreeSet in natural order', naturalSet, 1],
    ['TreeMap with a comparator', comparatorMap, 0],
    ['TreeMap in natural order', naturalMap, 1],
  ]
  for (const [name, make, c] of trees) {
    for (const order of orders) {
      it(`${name}: every insertion, lookup and removal of ${order} keys stays within 2·⌈log₂(n + 1)⌉ + ${c} comparisons [033 S1-AC2]`, () => {
        checkBounds(name, make, c, order)
      })
    }
  }
})

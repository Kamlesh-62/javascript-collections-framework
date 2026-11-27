import { describe, expect, it } from 'vitest'
import { MapNode, MapTree } from '../../src/internal/engines/map-tree'
import {
  OrderedTree,
  successor,
  TreeCursor,
  TreeIterator,
  TreeNode,
} from '../../src/internal/engines/ordered-tree'
import { ChangeCounter } from '../../src/internal/revision'
import { integer, seeded } from '../support/random'

const ascending = (a: number, b: number): number => a - b

function tree(): OrderedTree<number> {
  return new OrderedTree<number>(ascending, new ChangeCounter())
}

/**
 * Checks the red-black and search-tree properties without recursion: values in ascending order,
 * parent links consistent, a black root, no red node with a red child, the same number of black
 * nodes on every path, and `count` equal to the number of nodes. Returns the values in order.
 */
function checkShape(t: OrderedTree<number>): number[] {
  const values: number[] = []
  const root = t.root
  if (root === null) {
    expect(t.count).toBe(0)
    return values
  }
  expect(root.parent).toBeNull()
  expect(root.red).toBe(false)
  let blackHeight = -1
  const stack: Array<{ node: TreeNode<number>; blacks: number }> = [{ node: root, blacks: 0 }]
  while (stack.length > 0) {
    const { node, blacks } = stack.pop() as { node: TreeNode<number>; blacks: number }
    const here = blacks + (node.red ? 0 : 1)
    for (const child of [node.left, node.right]) {
      if (child === null) {
        if (blackHeight === -1) blackHeight = here
        expect(here).toBe(blackHeight)
      } else {
        expect(child.parent).toBe(node)
        if (node.red) expect(child.red).toBe(false)
        stack.push({ node: child, blacks: here })
      }
    }
  }
  for (let node = t.first(); node !== null; ) {
    values.push(node.value)
    let next: TreeNode<number> | null
    if (node.right !== null) {
      next = node.right
      while (next.left !== null) next = next.left
    } else {
      let child: TreeNode<number> = node
      next = node.parent
      while (next !== null && child === next.right) {
        child = next
        next = next.parent
      }
    }
    node = next
  }
  expect(values.length).toBe(t.count)
  for (let i = 1; i < values.length; i++)
    expect(values[i - 1] as number).toBeLessThan(values[i] as number)
  return values
}

describe('OrderedTree', () => {
  it('stays a valid red-black tree through seeded inserts and removals', () => {
    for (const seed of [1, 2, 3]) {
      const random = seeded(seed)
      const t = tree()
      const model = new Set<number>()
      for (let step = 0; step < 3000; step++) {
        const value = integer(random, 0, 400)
        if (random() < 0.55) {
          expect(t.insert(value, 'test', 0)).toBe(!model.has(value))
          model.add(value)
        } else {
          const node = t.find(value, 'test', 0, false)
          expect(node !== null).toBe(model.has(value))
          if (node !== null) t.remove(node)
          model.delete(value)
        }
        if (step % 100 === 0) checkShape(t)
      }
      expect(checkShape(t)).toEqual([...model].sort(ascending))
    }
  })

  it('builds a valid red-black tree from sorted values of every small size', () => {
    for (let size = 0; size <= 130; size++) {
      const t = tree()
      const values = Array.from({ length: size }, (_, i) => i * 2)
      t.buildSorted(values)
      expect(checkShape(t)).toEqual(values)
      // Still valid after changes.
      t.insert(1, 'test', 0)
      const first = t.first()
      if (first !== null) t.remove(first)
      checkShape(t)
    }
  })

  it('copies node for node, colours included, into an independent tree', () => {
    const t = tree()
    for (let i = 0; i < 200; i++) t.insert((i * 37) % 200, 'test', 0)
    const copy = tree()
    copy.copyFrom(t)
    expect(checkShape(copy)).toEqual(checkShape(t))
    copy.remove(copy.first() as TreeNode<number>)
    expect(copy.count).toBe(t.count - 1)
    expect(checkShape(t).length).toBe(200)
  })

  it('keeps every other node with its value when a node with two children is removed', () => {
    const t = tree()
    for (let i = 0; i < 31; i++) t.insert(i, 'test', 0)
    const nodes = new Map<number, TreeNode<number>>()
    for (let node = t.first(); node !== null; ) {
      nodes.set(node.value, node)
      node = t.find(node.value + 1, 'test', 0, false)
    }
    const root = t.root as TreeNode<number>
    expect(root.left !== null && root.right !== null).toBe(true)
    t.remove(root)
    for (const [value, node] of nodes) {
      if (node === root) continue
      expect(node.value).toBe(value)
      expect(t.find(value, 'test', 0, false)).toBe(node)
    }
    checkShape(t)
  })
})

describe('OrderedTree — locate and link, node makers, projection', () => {
  it('locate then link makes the same comparisons, in the same order, as insert [016 S1-AC7]', () => {
    const random = seeded(7)
    const values: number[] = []
    for (let i = 0; i < 300; i++) values.push(integer(random, 0, 200))
    const calls = (log: string[]) => (a: number, b: number) => {
      log.push(`${a}:${b}`)
      return a - b
    }
    const insertLog: string[] = []
    const splitLog: string[] = []
    const a = new OrderedTree<number>(calls(insertLog), new ChangeCounter())
    const b = new OrderedTree<number>(calls(splitLog), new ChangeCounter())
    for (const v of values) {
      const added = a.insert(v, 'test', 0)
      const place = b.locate(v, 'test', 0)
      if (place.node === null) b.link(new MapNode(v, 0, 0), place)
      expect(place.node === null).toBe(added)
    }
    expect(splitLog).toEqual(insertLog)
    expect(checkShape(b)).toEqual(checkShape(a))
  })

  it('locate checks a value against itself in natural order on an empty tree, and changes nothing', () => {
    const t = new OrderedTree<unknown>(undefined, new ChangeCounter())
    expect(() => t.locate(null, 'test', 0)).toThrow()
    expect(() => t.locate({}, 'test', 0)).toThrow()
    const place = t.locate(1, 'test', 0)
    expect(place).toEqual({ node: null, parent: null, left: false })
    expect(t.count).toBe(0)
  })

  it('builds and copies with node makers, keeping values and shape [016 S5-AC5]', () => {
    const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const values = keys.map((k) => `v${k}`)
    const m = new MapTree<number, string>(ascending, new ChangeCounter())
    m.buildPairs(keys, values)
    expect(checkShape(m as unknown as OrderedTree<number>)).toEqual(keys)
    const copy = new MapTree<number, string>(ascending, new ChangeCounter())
    copy.copyPairs(m)
    expect(checkShape(copy as unknown as OrderedTree<number>)).toEqual(keys)
    for (const k of keys) {
      const node = copy.find(k, 'test', 0, false) as MapNode<number, string>
      expect(node).toBeInstanceOf(MapNode)
      expect(node.mapped).toBe(`v${k}`)
      expect(copy.stored(node)).toBe(true)
      expect(node).not.toBe(m.find(k, 'test', 0, false))
    }
  })

  it('tells stored nodes from removed ones after remove, clear and re-adding [016 S3-AC5]', () => {
    const changes = new ChangeCounter()
    const m = new MapTree<number, string>(ascending, changes)
    const add = (k: number) => {
      const place = m.locate(k, 'test', changes.structure)
      const node = m.newNode(k, `v${k}`)
      m.link(node, place)
      return node
    }
    const one = add(1)
    const two = add(2)
    const three = add(3)
    expect([one, two, three].map((n) => m.stored(n))).toEqual([true, true, true])
    m.remove(two)
    expect([one, two, three].map((n) => m.stored(n))).toEqual([true, false, true])
    m.clear()
    expect([one, two, three].map((n) => m.stored(n))).toEqual([false, false, false])
    const again = add(1)
    expect(m.stored(again)).toBe(true)
    expect(m.stored(one)).toBe(false)
    expect(m.count).toBe(1)
  })

  it('names the map in the re-entrant comparator message', () => {
    const changes = new ChangeCounter()
    const m = new MapTree<number, string>((a, b) => {
      changes.structural()
      return a - b
    }, changes)
    m.link(m.newNode(1, 'a'), m.locate(1, 'test', 0))
    expect(() => m.find(2, 'TreeMap.get', 0, false)).toThrow(
      'TreeMap.get: the map was changed by the comparator',
    )
  })

  it('projects nodes in iterators and cursors', () => {
    const t = tree()
    for (const v of [3, 1, 2]) t.insert(v, 'test', 0)
    const doubled = new TreeIterator(t.first(), null, false, t.changes, 'test', (n) => n.value * 2)
    expect([...doubled]).toEqual([2, 4, 6])
    const cursor = new TreeCursor(t, t.last(), null, true, 'test', (n) => `#${n.value}`)
    expect(cursor.next()).toBe('#3')
    cursor.remove()
    expect(cursor.next()).toBe('#2')
    expect(checkShape(t)).toEqual([1, 2])
  })
})

describe('OrderedTree plain descent', () => {
  function natural<E>(): OrderedTree<E> {
    return new OrderedTree<E>(undefined, new ChangeCounter())
  }

  it('finds and places numbers, NaN and -0 as the compared descent does [051 S1-AC5]', () => {
    for (const n of [0, 1, 2, 5, 64, 4_096]) {
      const random = seeded(n + 3)
      const t = natural<number>()
      for (let i = 0; i < n; i++) {
        const r = random()
        const value = r < 0.02 ? Number.NaN : integer(random, -n, n)
        t.insert(value === 0 ? 0 : value, 'test', 0)
      }
      for (let q = 0; q < 300; q++) {
        const r = random()
        const value = r < 0.05 ? Number.NaN : r < 0.1 ? -0 : integer(random, -n - 1, n + 1)
        if (!t.plain(value)) {
          expect(t.root).toBe(null)
          continue
        }
        expect(t.findPlain(value)).toBe(t.find(value, 'test', 0, false))
        const placed = t.locatePlain(value)
        const place = t.locate(value, 'test', 0)
        expect(placed).toBe(place.node)
      }
    }
  })

  it('finds and places strings as the compared descent does, and links where it placed [051 S1-AC8]', () => {
    const random = seeded(11)
    const t = natural<string>()
    t.insert('m', 'test', 0)
    for (let i = 0; i < 2_000; i++) {
      const value = `k${integer(random, 0, 900)}`
      expect(t.plain(value)).toBe(true)
      expect(t.findPlain(value)).toBe(t.find(value, 'test', 0, false))
      if (t.locatePlain(value) === null) {
        t.linkPlain(new TreeNode(value))
        expect(t.find(value, 'test', 0, false)?.value).toBe(value)
      }
    }
    const values: string[] = []
    for (let node = t.first(); node !== null; node = successor(node)) values.push(node.value)
    expect(values).toEqual([...new Set(values)].sort())
    expect(t.count).toBe(values.length)
  })

  it('takes the plain descent only for natural order, a non-empty tree and the same plain kind [051 S1-AC8]', () => {
    const empty = natural<unknown>()
    expect(empty.plain(1)).toBe(false)
    const numbers = natural<unknown>()
    numbers.insert(1, 'test', 0)
    expect(numbers.plain(2)).toBe(true)
    expect(numbers.plain('2')).toBe(false)
    expect(numbers.plain(null)).toBe(false)
    expect(numbers.plain(new Date(1))).toBe(false)
    const ordered = new OrderedTree<number>(ascending, new ChangeCounter())
    ordered.insert(1, 'test', 0)
    expect(ordered.plain(2)).toBe(false)
  })
})

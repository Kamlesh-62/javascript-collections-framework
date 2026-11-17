import { describe, expect, it } from 'vitest'
import { OrderedTree, type TreeNode } from '../../src/internal/engines/ordered-tree'
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

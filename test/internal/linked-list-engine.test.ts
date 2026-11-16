import { describe, expect, it } from 'vitest'
import { LinkedList } from '../../src/collections/linked-list'
import type { LinkedListNode } from '../../src/interfaces/linked-list-node'

/** Every own property value of `object`, symbol-keyed ones included. */
function ownValues(object: object): unknown[] {
  return Reflect.ownKeys(object).map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(object, key)
    return descriptor?.value
  })
}

/** The list's engine, read only by this test. */
function engineOf(list: LinkedList<number>): object {
  return (list as unknown as { engine: object }).engine
}

/** The nodes reachable from the list's ends, walked both ways. */
function liveNodes(list: LinkedList<number>): LinkedListNode<number>[] {
  const nodes: LinkedListNode<number>[] = []
  for (let n = list.firstNode(); n !== undefined; n = n.next) nodes.push(n)
  for (let n = list.lastNode(); n !== undefined; n = n.previous) nodes.push(n)
  return nodes
}

type Removal = (list: LinkedList<number>, node: LinkedListNode<number>) => unknown

describe('LinkedListEngine — removed nodes are cut loose', () => {
  // Each removal takes out the element the node at `at` holds (value 10 + at).
  const removals: ReadonlyArray<[string, number, Removal]> = [
    ['poll', 0, (l) => l.poll()],
    ['pop', 4, (l) => l.pop()],
    ['removeFirst', 0, (l) => l.removeFirst()],
    ['removeLast', 4, (l) => l.removeLast()],
    ['delete head', 0, (l) => l.delete(10)],
    ['delete middle', 2, (l) => l.delete(12)],
    ['delete tail', 4, (l) => l.delete(14)],
    ['removeNode', 2, (l, n) => l.removeNode(n)],
    [
      'cursor remove',
      1,
      (l) => {
        const c = l.cursor()
        c.next()
        c.next()
        c.remove()
      },
    ],
    ['reversed poll', 4, (l) => l.reversed().poll()],
    ['reversed pop', 0, (l) => l.reversed().pop()],
    ['reversed delete', 3, (l) => l.reversed().delete(13)],
    [
      'reversed cursor remove',
      3,
      (l) => {
        const c = l.reversed().cursor()
        c.next()
        c.next()
        c.remove()
      },
    ],
    ['removeIf', 2, (l) => l.removeIf((e) => e === 12)],
    ['removeAll', 1, (l) => l.removeAll([11])],
    ['retainAll', 2, (l) => l.retainAll([10, 11, 13, 14])],
    ['clear', 2, (l) => l.clear()],
  ]

  for (const [name, at, remove] of removals) {
    it(`${name} leaves no reference to or from the removed node [007 S4-AC3]`, () => {
      const list = new LinkedList([10, 11, 12, 13, 14])
      const nodes = liveNodes(list).slice(0, 5)
      const node = nodes[at] as LinkedListNode<number>
      remove(list, node)
      // The node refers to no list and no other node.
      for (const value of ownValues(node)) {
        expect(value === engineOf(list) || value === list || nodes.includes(value as never)).toBe(
          false,
        )
      }
      expect(node.next).toBeUndefined()
      expect(node.previous).toBeUndefined()
      // No remaining node and no list field refers to it.
      for (const remaining of liveNodes(list)) {
        expect(remaining).not.toBe(node)
        expect(ownValues(remaining)).not.toContain(node)
      }
      expect(ownValues(engineOf(list))).not.toContain(node)
      if (name === 'clear') {
        for (const each of nodes) {
          for (const value of ownValues(each)) expect(nodes.includes(value as never)).toBe(false)
        }
      }
    })
  }
})

// `revision` as a change signal for frameworks, across every group of collection.

import { describe, expect, it } from 'vitest'
import {
  ArrayDeque,
  ArrayList,
  asList,
  copyOfList,
  HashMap,
  HashSet,
  LinkedHashMap,
  LinkedHashSet,
  LinkedList,
  listOf,
  mapOf,
  PriorityQueue,
  setOf,
  TreeMap,
  TreeSet,
  unmodifiableList,
  unmodifiableMap,
} from '../../src/index'

/** Asserts that `change` moves `revision` (or not) on `target`. */
function moves(
  target: { readonly revision: number },
  change: () => unknown,
  expected: boolean,
  label: string,
): void {
  const before = target.revision
  change()
  expect(target.revision !== before, label).toBe(expected)
}

describe('revision as a change signal [021 S2-AC6]', () => {
  it('changes on every change to contents of a mutable collection, in-place replacements included', () => {
    const list = new ArrayList([1, 2])
    moves(list, () => list.add(3), true, 'ArrayList add')
    moves(list, () => list.set(0, 9), true, 'ArrayList set')
    const linked = new LinkedList([1, 2])
    moves(linked, () => linked.push(3), true, 'LinkedList push')
    const deque = new ArrayDeque([1])
    moves(deque, () => deque.addFirst(0), true, 'ArrayDeque addFirst')
    const queue = new PriorityQueue([2])
    moves(queue, () => queue.add(1), true, 'PriorityQueue add')
    const set = new HashSet([1])
    moves(set, () => set.add(2), true, 'HashSet add')
    const linkedSet = new LinkedHashSet([1, 2])
    moves(linkedSet, () => linkedSet.addFirst(2), true, 'LinkedHashSet move')
    const tree = new TreeSet([1])
    moves(tree, () => tree.delete(1), true, 'TreeSet delete')
    const map = new HashMap([['a', 1]])
    moves(map, () => map.set('a', 2), true, 'HashMap set existing key')
    const treeMap = new TreeMap([[1, 'a']])
    moves(treeMap, () => treeMap.set(1, 'b'), true, 'TreeMap replace value')
  })

  it('stays constant on immutable results, and views report their source', () => {
    for (const immutable of [listOf(1), setOf(1), mapOf(['a', 1]), copyOfList([1])]) {
      const before = immutable.revision
      try {
        ;(immutable as unknown as { clear(): void }).clear()
      } catch {
        // refused, as every change to an immutable collection is
      }
      expect(immutable.revision).toBe(before)
    }
    const source = new ArrayList([1, 2, 3])
    const views = [unmodifiableList(source), source.subList(0, 2), source.reversed()]
    source.set(0, 5)
    for (const view of views) expect(view.revision).toBe(source.revision)
    const map = new HashMap([['a', 1]])
    const mapViews = [unmodifiableMap(map), map.keySet(), map.valueCollection()]
    map.set('b', 2)
    for (const view of mapViews) expect(view.revision).toBe(map.revision)
  })

  it('changes on get of an access-ordered LinkedHashMap', () => {
    const lru = new LinkedHashMap<string, number>(
      [
        ['a', 1],
        ['b', 2],
      ],
      { accessOrder: true },
    )
    moves(lru, () => lru.get('a'), true, 'access-ordered get')
    moves(lru, () => lru.has('b'), false, 'has is not an access')
    const plain = new LinkedHashMap([['a', 1]])
    moves(plain, () => plain.get('a'), false, 'insertion-ordered get')
  })

  it('for asList, changes through the list and on a length change seen at the next read', () => {
    const array = [1, 2]
    const list = asList(array)
    moves(list, () => list.set(0, 5), true, 'set through the list')
    moves(list, () => array.push(3), true, 'direct push')
    moves(
      list,
      () => {
        array[0] = 9
      },
      false,
      'same-length direct write',
    )
    moves(
      list,
      () => {
        array.push(4)
        array.pop()
      },
      false,
      'push then pop between two reads',
    )
  })

  it('stays unchanged on calls that change nothing', () => {
    const set = new HashSet([1])
    moves(set, () => set.delete(9), false, 'delete absent')
    moves(set, () => set.add(1), false, 'add present')
    const empty = new ArrayList<number>()
    moves(empty, () => empty.clear(), false, 'clear empty')
    const map = new HashMap([['a', 1]])
    moves(map, () => map.delete('z'), false, 'delete absent key')
  })
})

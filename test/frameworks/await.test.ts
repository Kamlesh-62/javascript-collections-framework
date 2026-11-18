// Iterating across `await` while another task changes the collection. JavaScript runs one task at
// a time, so a change can only happen at an `await`; these tests interleave two async functions
// through awaited promises, with no timers.

import { describe, expect, it } from 'vitest'
import {
  ArrayDeque,
  ArrayList,
  asList,
  ConcurrentModificationError,
  HashMap,
  HashSet,
  LinkedHashMap,
  LinkedHashSet,
  LinkedList,
  PriorityQueue,
  TreeMap,
  TreeSet,
} from '../../src/index'

/** A promise the other task resolves, so the loop yields exactly once per step. */
function gate(): { wait: Promise<void>; open: () => void } {
  let open = () => {}
  const wait = new Promise<void>((resolve) => {
    open = resolve
  })
  return { wait, open }
}

/** Iterates `values` with an `await` after each element; `between` runs while the loop waits. */
async function iterateAcross(
  values: Iterable<unknown>,
  between: (step: number) => void,
): Promise<unknown[]> {
  const seen: unknown[] = []
  let step = 0
  for (const value of values) {
    seen.push(value)
    const { wait, open } = gate()
    const other = Promise.resolve().then(() => {
      between(step)
      open()
    })
    await wait
    await other
    step++
  }
  return seen
}

describe('iteration across await', () => {
  it('fails fast on the next step for lists, deques, queues and trees changed by another task [021 S3-AC2]', async () => {
    const failFast: Array<[string, Iterable<unknown>, () => void]> = []
    const list = new ArrayList([1, 2, 3])
    failFast.push(['ArrayList', list, () => list.add(9)])
    const sub = new ArrayList([0, 1, 2, 3])
    const subList = sub.subList(0, 3)
    failFast.push(['subList', subList, () => subList.add(9)])
    const array = [1, 2, 3]
    failFast.push(['asList', asList(array), () => array.push(9)])
    const deque = new ArrayDeque([1, 2, 3])
    failFast.push(['ArrayDeque', deque, () => deque.push(9)])
    const linked = new LinkedList([1, 2, 3])
    failFast.push(['LinkedList', linked, () => linked.push(9)])
    const queue = new PriorityQueue([1, 2, 3])
    failFast.push(['PriorityQueue', queue, () => queue.add(9)])
    const tree = new TreeSet([1, 2, 3])
    failFast.push(['TreeSet', tree, () => tree.add(9)])
    failFast.push(['TreeSet range', tree.headSet(100), () => tree.add(10)])
    const treeMap = new TreeMap([
      [1, 'a'],
      [2, 'b'],
      [3, 'c'],
    ])
    failFast.push(['TreeMap', treeMap, () => treeMap.set(9, 'z')])
    for (const [name, values, change] of failFast) {
      const seen: unknown[] = []
      const result = await iterateAcross(values, (step) => {
        seen.push(step)
        if (step === 0) change()
      }).catch((error: unknown) => error)
      expect(result, name).toBeInstanceOf(ConcurrentModificationError)
      expect(seen, `${name} throws on the very next step`).toEqual([0])
    }
  })

  it('does not throw after the iterator has returned done', async () => {
    const list = new ArrayList([1])
    const iterator = list[Symbol.iterator]()
    iterator.next()
    expect(iterator.next().done).toBe(true)
    await Promise.resolve()
    list.add(2)
    expect(iterator.next().done).toBe(true)
  })

  it('iterates hash collections live, as their class rule says [021 S3-AC2]', async () => {
    const set = new HashSet([1, 2, 3])
    expect(
      await iterateAcross(set, (step) => {
        if (step === 0) {
          set.delete(2)
          set.add(4)
        }
      }),
    ).toEqual([1, 3, 4])
    const map = new HashMap([
      ['a', 1],
      ['b', 2],
    ])
    expect(
      await iterateAcross(map.keys(), (step) => {
        if (step === 0) map.set('c', 3)
      }),
    ).toEqual(['a', 'b', 'c'])
    const linked = new LinkedHashSet([1, 2])
    expect(
      await iterateAcross(linked, (step) => {
        if (step === 0) linked.add(3)
      }),
    ).toEqual([1, 2, 3])
    const lru = new LinkedHashMap<string, number>(
      [
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ],
      { accessOrder: true },
    )
    expect(
      await iterateAcross(lru.keys(), (step) => {
        if (step === 0) lru.get('b') // moves 'b' to the end: visited once, at its new place
      }),
    ).toEqual(['a', 'c', 'b'])
  })

  it('applies to for await over a sync iterator too [021 S3-AC2]', async () => {
    const list = new ArrayList([1, 2, 3])
    const run = async () => {
      for await (const value of list) {
        if (value === 1) await Promise.resolve().then(() => list.add(4))
      }
    }
    await expect(run()).rejects.toBeInstanceOf(ConcurrentModificationError)
  })

  it('never throws when a copy is iterated while the original changes [021 S3-AC3]', async () => {
    const list = new ArrayList([1, 2, 3])
    const seen = await iterateAcross(list.copy(), () => list.add(9))
    expect(seen).toEqual([1, 2, 3])
    const tree = new TreeSet([1, 2])
    expect(await iterateAcross(tree.toArray(), () => tree.add(5))).toEqual([1, 2])
  })
})

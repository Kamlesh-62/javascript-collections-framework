import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import { ArrayList } from '../src/collections/array-list'
import { ConcurrentModificationError, IndexOutOfBoundsError } from '../src/index'
import type { List } from '../src/interfaces/list'
import { describeCollection } from './contracts/collection'
import { describeList } from './contracts/list'
import { describeSequencedCollection } from './contracts/sequenced'
import { combine } from './fixtures/structural-list'
import { ALL_LISTS } from './support/list-factories'
import { runListReferenceModel } from './support/reference-model'

function caught(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  return undefined
}

describe('reversed views', () => {
  it('index i is the parent index size - 1 - i, live [006 S6-AC1]', () => {
    const list = new ArrayList([1, 2, 3])
    const reversed = list.reversed()
    expect(reversed.toArray()).toEqual([3, 2, 1])
    expect(reversed.get(0)).toBe(3)
    expect(reversed.getLast()).toBe(1)
    expect(reversed.indexOf(3)).toBe(0)
    list.add(4)
    expect(reversed.toArray()).toEqual([4, 3, 2, 1])
    expect([...reversed]).toEqual([4, 3, 2, 1])
  })

  it('applies changes to the parent at the mirrored position [006 S6-AC2]', () => {
    const list = new ArrayList([1, 2, 3])
    const reversed = list.reversed()
    reversed.addFirst(4)
    expect(list.toArray()).toEqual([1, 2, 3, 4])
    reversed.addLast(0)
    expect(list.toArray()).toEqual([0, 1, 2, 3, 4])
    reversed.add(-1)
    expect(list.getFirst()).toBe(-1)
    reversed.insert(1, 35)
    expect(list.toArray()).toEqual([-1, 0, 1, 2, 3, 35, 4])
    reversed.insertAll(0, [7, 6])
    expect(list.toArray()).toEqual([-1, 0, 1, 2, 3, 35, 4, 6, 7])
    expect(reversed.removeFirst()).toBe(7)
    expect(reversed.removeAt(0)).toBe(6)
    reversed.set(0, 40)
    expect(list.getLast()).toBe(40)
    reversed.subList(0, 2).clear()
    expect(list.toArray()).toEqual([-1, 0, 1, 2, 3])
    reversed.sort()
    expect(list.toArray()).toEqual([3, 2, 1, 0, -1])
    reversed.removeIf((n) => n === 0)
    expect(list.toArray()).toEqual([3, 2, 1, -1])
  })

  it('reversing a reversed view returns its source [006 S6-AC3]', () => {
    const list = new ArrayList([1, 2])
    expect(list.reversed().reversed()).toBe(list)
    const view = list.subList(0, 1)
    expect(view.reversed().reversed()).toBe(view)
  })

  it('is stale exactly when its source is, with the ReversedList tag [006 S6-AC4]', () => {
    const list = new ArrayList([1, 2, 3, 4])
    const reversed = list.reversed()
    const iterator = reversed[Symbol.iterator]()
    list.add(5)
    list.removeFirst()
    expect(reversed.toArray()).toEqual([5, 4, 3, 2])
    expect(() => iterator.next()).toThrow(ConcurrentModificationError)
    expect(reversed.revision).toBe(list.revision)
    expect(String(reversed)).toBe('ReversedList(4) [5, 4, 3, 2]')
    expect(Object.prototype.toString.call(reversed)).toBe('[object ReversedList]')
    expect((caught(() => reversed.get(7)) as Error).message).toBe(
      'ReversedList.get: index 7 is out of bounds for size 4',
    )
    expect(() => reversed.get(7)).toThrow(IndexOutOfBoundsError)

    const view = list.subList(1, 3)
    const overView = view.reversed()
    const subOfReversed = reversed.subList(0, 2)
    expect(overView.toArray()).toEqual([4, 3])
    expect(subOfReversed.toArray()).toEqual([5, 4])
    list.add(6)
    expect(() => overView.size).toThrow(ConcurrentModificationError)
    expect(() => overView.reversed()).toThrow(ConcurrentModificationError)
    expect(() => subOfReversed.size).toThrow(ConcurrentModificationError)
    expect(overView.revision).toBe(list.revision)
    expect(inspect(overView)).toBe('ReversedList <stale>')
    expect(inspect(list.reversed())).toBe('ReversedList(5) [ 6, 5, 4, 3, 2 ]')
  })
})

// Contract suites for reversed views and reversed sub-lists.
for (const [name, make] of ALL_LISTS.filter(([kind]) => kind === 'ReversedList')) {
  const peers = ALL_LISTS.map(([, peer]) => peer).filter((peer) => peer !== make)
  describeCollection(name, make as never, {
    iteration: 'fail-fast',
    brackets: 'list',
    replace: (c, index, value) => (c as List<unknown>).set(index, value),
    peers: peers as never,
    structural: { expectedHash: combine },
  })
  describeSequencedCollection(name, make)
  describeList(name, make, peers)
}

describe('reversed views — reference model', () => {
  it('matches a native array under seeded random operations [006 S8-AC5]', () => {
    for (const seed of [6, 7]) {
      runListReferenceModel({
        seed,
        steps: 400,
        make: () => new ArrayList<number>().reversed() as List<number>,
      })
    }
  })
})

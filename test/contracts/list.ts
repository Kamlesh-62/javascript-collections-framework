// The contract every list keeps — `ArrayList` and its views alike. Each implementation's test file
// runs it through `describeList`; a new list or view must keep every one of these tests passing.

import { describe, expect, it } from 'vitest'
import {
  ConcurrentModificationError,
  IllegalArgumentError,
  IllegalStateError,
  IndexOutOfBoundsError,
  NoSuchElementError,
} from '../../src/index'
import type { ListFactory } from '../support/list-factories'
import { ownerOf } from '../support/owner'
import { describeReadonlyList } from './readonly-list'

export function describeList(name: string, make: ListFactory, peers: ListFactory[] = []): void {
  describeReadonlyList(name, make, peers)

  describe(`${name} — list contract`, () => {
    it('add appends and returns the list; insert puts at a position [006 S2-AC1] [006 S2-AC2]', () => {
      const l = make([1, 3])
      expect(l.add(4)).toBe(l)
      expect(l.insert(1, 2)).toBe(l)
      expect(l.toArray()).toEqual([1, 2, 3, 4])
      expect(() => l.insert(9, 0)).toThrow(IndexOutOfBoundsError)
    })

    it('set returns the old element without invalidating iterators [006 S2-AC4]', () => {
      const l = make([1, 2])
      const it = l[Symbol.iterator]()
      it.next()
      expect(l.set(1, 20)).toBe(2)
      expect(it.next().value).toBe(20)
    })

    it('removeAt, delete and insertAll change by position and value [006 S2-AC5] [006 S2-AC6] [006 S2-AC7]', () => {
      const l = make([1, 2, 3, 2])
      expect(l.removeAt(0)).toBe(1)
      expect(l.delete(2)).toBe(true)
      expect(l.toArray()).toEqual([3, 2])
      expect(l.insertAll(1, [7, 8])).toBe(true)
      expect(l.toArray()).toEqual([3, 7, 8, 2])
      expect(l.insertAll(0, [])).toBe(false)
    })

    it('removeIf passes (element, index, list) and replaceAll writes op results [006 S2-AC14] [006 S3-AC1]', () => {
      const l = make([1, 2, 3, 4])
      const lists: unknown[] = []
      l.removeIf((_e, i, list) => {
        lists.push(list)
        return i % 2 === 1
      })
      expect(lists.every((x) => x === ownerOf(l))).toBe(true)
      expect(l.toArray()).toEqual([1, 3])
      l.replaceAll((e, i) => (e as number) * 10 + i)
      expect(l.toArray()).toEqual([10, 31])
    })

    it('sort is stable, returns the list and invalidates iterators [006 S3-AC3] [006 S3-AC7]', () => {
      const l = make(['b2', 'a1', 'b1', 'a2'])
      const it = l[Symbol.iterator]()
      expect(l.sort((x, y) => (x as string).charCodeAt(0) - (y as string).charCodeAt(0))).toBe(l)
      expect(l.toArray()).toEqual(['a1', 'a2', 'b2', 'b1'])
      expect(() => it.next()).toThrow(ConcurrentModificationError)
      expect(make([3, 1, 2]).sort().toArray()).toEqual([1, 2, 3])
    })

    it('a failed sort leaves the list as it was [006 S3-AC5]', () => {
      const l = make([2, 1, 3])
      expect(() => l.sort(() => Number.NaN)).toThrow(TypeError)
      expect(() => make([1, null]).sort()).toThrow()
      expect(l.toArray()).toEqual([2, 1, 3])
    })

    it('list cursors move both ways and edit at their position [006 S4-AC3] [006 S4-AC5] [006 S4-AC6] [006 S4-AC9]', () => {
      const l = make(['a', 'b', 'c'])
      const c = l.listCursor(1)
      expect(c.previous()).toBe('a')
      c.set('A')
      expect(c.next()).toBe('A')
      c.insert('x')
      expect(c.next()).toBe('b')
      expect(c.previous()).toBe('b')
      c.remove()
      expect(c.nextIndex()).toBe(2)
      expect(l.toArray()).toEqual(['A', 'x', 'c'])
      expect(() => c.set('z')).toThrow(IllegalStateError)
      expect(() => l.listCursor(0).previous()).toThrow(NoSuchElementError)
      expect(() => l.listCursor(4)).toThrow(IndexOutOfBoundsError)
    })

    it('a change through a cursor invalidates other cursors and iterators [006 S4-AC8] [006 S4-AC10]', () => {
      const l = make([1, 2, 3])
      const a = l.listCursor()
      const b = l.listCursor()
      a.next()
      a.remove()
      expect(() => b.next()).toThrow(ConcurrentModificationError)
      expect(() => b.previous()).toThrow(ConcurrentModificationError)
      expect(b.hasNext()).toBe(true)
      expect(a.next()).toBe(2)
    })

    it('subList is a live window with checked bounds [006 S5-AC1] [006 S5-AC2] [006 S5-AC3]', () => {
      const l = make([0, 1, 2, 3, 4])
      const s = l.subList(1, 4)
      expect(s.toArray()).toEqual([1, 2, 3])
      s.removeAt(0)
      s.add(9)
      expect(l.toArray()).toEqual([0, 2, 3, 9, 4])
      expect(() => l.subList(3, 2)).toThrow(IllegalArgumentError)
      expect(() => l.subList(0, 9)).toThrow(IndexOutOfBoundsError)
    })

    it('a sub-list goes stale when the list changes other than through it [006 S5-AC5]', () => {
      const l = make([0, 1, 2])
      const s = l.subList(0, 2)
      l.add(3)
      expect(() => s.size).toThrow(ConcurrentModificationError)
    })
  })
}

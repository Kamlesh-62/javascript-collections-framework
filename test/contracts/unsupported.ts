// The contract every read-only collection keeps: every mutator — on the collection, its cursors
// and its entries — throws `UnsupportedOperationError` before it looks at its arguments, reads an
// iterable or calls a callback, and leaves the contents and `revision` as they were.

import { describe, expect, it } from 'vitest'
import {
  type Collection as AnyCollection,
  type List as AnyList,
  type ListCursor as AnyListCursor,
  type MapCollection,
  type MapEntry,
  type ReadonlyCollection,
  type ReadonlyMapCollection,
  type SequencedCollection,
  type SequencedMap,
  type SortedSet,
  UnsupportedOperationError,
} from '../../src/index'
import { caught } from './readonly-collection'

/** Which table of mutators applies. */
export type MutatorFamily =
  | 'list'
  | 'set'
  | 'values'
  | 'map'
  | 'sequenced'
  | 'sequenced-set'
  | 'sorted-set'
  | 'sequenced-map'
  | 'sorted-map'

/** Records whether any argument was used: a callback called or an iterable read. */
class Spies {
  used = false

  get callback(): (...args: unknown[]) => unknown {
    return () => {
      this.used = true
      return true
    }
  }

  get iterable(): Iterable<unknown> {
    return {
      [Symbol.iterator]: () => {
        this.used = true
        return [1][Symbol.iterator]()
      },
    }
  }
}

type Call = readonly [method: string, call: (target: never, spies: Spies) => unknown]

type Collection = AnyCollection<unknown>
type List = AnyList<unknown>
type AnyMap = MapCollection<unknown, unknown>
type ListCursor = AnyListCursor<unknown>
type Sequenced = SequencedCollection<unknown>
type Sorted = SortedSet<unknown>
type SequencedAnyMap = SequencedMap<unknown, unknown>

const COLLECTION_CALLS: readonly Call[] = [
  ['add', (c: Collection) => c.add(1)],
  ['add', (c: Collection) => c.add(undefined)],
  ['addAll', (c: Collection) => c.addAll([1])],
  ['addAll', (c: Collection) => c.addAll([])],
  ['addAll', (c: Collection, s: Spies) => c.addAll(s.iterable)],
  ['addAll', (c: Collection) => c.addAll(5 as never)],
  ['delete', (c: Collection) => c.delete(1)],
  ['delete', (c: Collection) => c.delete(Symbol('absent'))],
  ['removeAll', (c: Collection) => c.removeAll([1])],
  ['removeAll', (c: Collection, s: Spies) => c.removeAll(s.iterable)],
  ['removeAll', (c: Collection) => c.removeAll(null as never)],
  ['retainAll', (c: Collection) => c.retainAll([])],
  ['retainAll', (c: Collection) => c.retainAll({} as never)],
  ['removeIf', (c: Collection, s: Spies) => c.removeIf(s.callback)],
  ['removeIf', (c: Collection) => c.removeIf(5 as never)],
  ['clear', (c: Collection) => c.clear()],
]

const LIST_CALLS: readonly Call[] = [
  ['addFirst', (l: List) => l.addFirst(1)],
  ['addLast', (l: List) => l.addLast(1)],
  ['removeFirst', (l: List) => l.removeFirst()],
  ['removeLast', (l: List) => l.removeLast()],
  ['set', (l: List) => l.set(0, 1)],
  ['set', (l: List) => l.set(99, 1)],
  ['insert', (l: List) => l.insert(0, 1)],
  ['insert', (l: List) => l.insert(-5, 1)],
  ['insertAll', (l: List) => l.insertAll(0, [1])],
  ['insertAll', (l: List, s: Spies) => l.insertAll(99, s.iterable)],
  ['removeAt', (l: List) => l.removeAt(0)],
  ['removeAt', (l: List) => l.removeAt(99)],
  ['replaceAll', (l: List, s: Spies) => l.replaceAll(s.callback)],
  ['replaceAll', (l: List) => l.replaceAll(5 as never)],
  ['sort', (l: List) => l.sort()],
  ['sort', (l: List, s: Spies) => l.sort(s.callback as never)],
  ['sort', (l: List) => l.sort('x' as never)],
]

const ENDS_CALLS: readonly Call[] = [
  ['addFirst', (c: Sequenced) => c.addFirst(1)],
  ['addLast', (c: Sequenced) => c.addLast(1)],
  ['removeFirst', (c: Sequenced) => c.removeFirst()],
  ['removeLast', (c: Sequenced) => c.removeLast()],
]

const POLL_CALLS: readonly Call[] = [
  ['pollFirst', (s: Sorted) => s.pollFirst()],
  ['pollLast', (s: Sorted) => s.pollLast()],
]

const SEQUENCED_MAP_CALLS: readonly Call[] = [
  ['pollFirstEntry', (m: SequencedAnyMap) => m.pollFirstEntry()],
  ['pollLastEntry', (m: SequencedAnyMap) => m.pollLastEntry()],
  ['putFirst', (m: SequencedAnyMap) => m.putFirst('k', 1)],
  ['putLast', (m: SequencedAnyMap) => m.putLast('k', 1)],
]

const MAP_CALLS: readonly Call[] = [
  ['set', (m: AnyMap) => m.set('k', 1)],
  ['put', (m: AnyMap) => m.put('k', 1)],
  ['putAll', (m: AnyMap) => m.putAll([['k', 1]])],
  ['putAll', (m: AnyMap) => m.putAll([])],
  ['putAll', (m: AnyMap, s: Spies) => m.putAll(s.iterable as never)],
  ['putAll', (m: AnyMap) => m.putAll(5 as never)],
  ['delete', (m: AnyMap) => m.delete('k')],
  ['remove', (m: AnyMap) => m.remove('k')],
  ['replace', (m: AnyMap) => m.replace('k', 1)],
  ['replaceAll', (m: AnyMap, s: Spies) => m.replaceAll(s.callback)],
  ['replaceAll', (m: AnyMap) => m.replaceAll(5 as never)],
  ['getOrInsert', (m: AnyMap) => m.getOrInsert('k', 1)],
  ['getOrInsertComputed', (m: AnyMap, s: Spies) => m.getOrInsertComputed('k', s.callback)],
  ['getOrInsertComputed', (m: AnyMap) => m.getOrInsertComputed('k', 5 as never)],
  ['compute', (m: AnyMap, s: Spies) => m.compute('k', s.callback)],
  ['computeIfPresent', (m: AnyMap, s: Spies) => m.computeIfPresent('k', s.callback)],
  ['merge', (m: AnyMap, s: Spies) => m.merge('k', 1, s.callback)],
  ['merge', (m: AnyMap) => m.merge('k', 1, 5 as never)],
  ['clear', (m: AnyMap) => m.clear()],
]

function expectRefused(error: unknown, where: string): void {
  expect(error).toBeInstanceOf(UnsupportedOperationError)
  expect((error as Error).message).toBe(`${where}: the collection cannot be changed`)
}

/** What a target looks like, to check that a refused call left it as it was. */
function snapshot(target: ReadonlyCollection<unknown> | ReadonlyMapCollection<unknown, unknown>) {
  return { size: target.size, contents: [...target], revision: target.revision }
}

/**
 * Runs the refusal contract. `name` is the tag errors start with; `make` builds the read-only
 * collection or map to refuse changes to, holding at least one element when the cursor and entry
 * rows should also run after `next()`.
 */
export function describeUnsupportedMutators(
  name: string,
  make: () => ReadonlyCollection<unknown> | ReadonlyMapCollection<unknown, unknown>,
  family: MutatorFamily,
): void {
  const tables: Record<MutatorFamily, ReadonlyArray<readonly Call[]>> = {
    list: [COLLECTION_CALLS, LIST_CALLS],
    set: [COLLECTION_CALLS],
    values: [COLLECTION_CALLS],
    map: [MAP_CALLS],
    sequenced: [COLLECTION_CALLS, ENDS_CALLS],
    'sequenced-set': [COLLECTION_CALLS, ENDS_CALLS],
    'sorted-set': [COLLECTION_CALLS, ENDS_CALLS, POLL_CALLS],
    'sequenced-map': [MAP_CALLS, SEQUENCED_MAP_CALLS],
    'sorted-map': [MAP_CALLS, SEQUENCED_MAP_CALLS],
  }
  const calls = tables[family].flat()
  const isMap = family === 'map' || family === 'sequenced-map' || family === 'sorted-map'

  describe(`${name} — refuses every change`, () => {
    it('throws UnsupportedOperationError first from every mutator and changes nothing [018 S4-AC1] [018 S4-AC5] [018 S4-AC6] [018 S6-AC3]', () => {
      for (const [method, call] of calls) {
        const target = make()
        const before = snapshot(target)
        const spies = new Spies()
        expectRefused(
          caught(() => call(target as never, spies)),
          `${name}.${method}`,
        )
        expect(spies.used, `${method} used its argument`).toBe(false)
        expect(snapshot(target), method).toEqual(before)
      }
    })

    if (!isMap) {
      it('refuses changes through cursors, before and after next() [018 S4-AC2] [018 S4-AC6] [018 S6-AC3]', () => {
        const cursors: Array<[string, (c: ReadonlyCollection<unknown>) => ListCursor]> = [
          ['cursor', (c) => c.cursor() as ListCursor],
        ]
        if (family === 'list') {
          cursors.push(['listCursor', (c) => (c as List).listCursor(0)])
        }
        const methods = family === 'list' ? ['remove', 'set', 'insert'] : ['remove']
        for (const [kind, open] of cursors) {
          for (const method of methods) {
            const target = make() as ReadonlyCollection<unknown>
            const before = snapshot(target)
            const cursor = open(target)
            const act = (): void => {
              if (method === 'remove') cursor.remove()
              else if (method === 'set') cursor.set(9)
              else cursor.insert(9)
            }
            expectRefused(caught(act), `${name}.${kind}.${method}`)
            if (cursor.hasNext()) {
              cursor.next()
              expectRefused(caught(act), `${name}.${kind}.${method}`)
            }
            expect(snapshot(target)).toEqual(before)
          }
        }
      })
    } else {
      it('refuses setValue on its entries [018 S4-AC2] [018 S6-AC3]', () => {
        const map = make() as ReadonlyMapCollection<unknown, unknown>
        const before = snapshot(map)
        for (const entry of map.entrySet() as Iterable<MapEntry<unknown, unknown>>) {
          const value = entry.value
          expectRefused(
            caught(() => entry.setValue('changed')),
            'MapEntry.setValue',
          )
          expect(entry.value).toBe(value)
        }
        expect(snapshot(map)).toEqual(before)
      })
    }
  })
}

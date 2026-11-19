import { describe, expect, it } from 'vitest'
import {
  ArrayDeque,
  ArrayList,
  copyOfList,
  copyOfMap,
  copyOfSet,
  HashMap,
  HashSet,
  isCollection,
  isMapCollection,
  LinkedHashMap,
  LinkedHashSet,
  LinkedList,
  listOf,
  mapOf,
  PriorityQueue,
  setOf,
  TreeMap,
  TreeSet,
  unmodifiableCollection,
  unmodifiableList,
  unmodifiableMap,
  unmodifiableSequencedCollection,
  unmodifiableSequencedMap,
  unmodifiableSequencedSet,
  unmodifiableSet,
  unmodifiableSortedMap,
  unmodifiableSortedSet,
} from '../src/index'

// Methods that change what a read-only object reads, on a collection, a map, a cursor, an entry
// or the storage behind them.
const MUTATORS = [
  'add',
  'insertAt',
  'insert',
  'push',
  'set',
  'setValue',
  'remove',
  'delete',
  'clear',
]

function isWritableHandle(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  if (isCollection(value) || isMapCollection(value)) return true
  const handle = value as Record<string, unknown>
  return MUTATORS.some((name) => typeof handle[name] === 'function')
}

// Every object reachable from `root` through string-keyed own properties: what ordinary property
// access, spread and `Object.assign` can reach.
function reachable(root: object): [string, unknown][] {
  const found: [string, unknown][] = []
  const seen = new Set<unknown>([root])
  const queue: [string, object][] = [['', root]]
  while (queue.length > 0) {
    const [path, from] = queue.shift() as [string, object]
    for (const key of Object.getOwnPropertyNames(from)) {
      const value = (from as Record<string, unknown>)[key]
      if (typeof value !== 'object' || value === null || seen.has(value)) continue
      seen.add(value)
      found.push([`${path}.${key}`, value])
      queue.push([`${path}.${key}`, value])
    }
  }
  return found
}

function expectSourceHidden(name: string, wrapper: object): void {
  expect('source' in wrapper, `${name}: 'source' in`).toBe(false)
  for (const [path, value] of reachable(wrapper)) {
    expect(isWritableHandle(value), `${name}${path}`).toBe(false)
  }
  for (const copy of [{ ...wrapper }, Object.assign({}, wrapper)]) {
    for (const key of Reflect.ownKeys(copy)) {
      const value = (copy as Record<PropertyKey, unknown>)[key]
      expect(isWritableHandle(value), `${name} copied ${String(key)}`).toBe(false)
    }
  }
}

const list = () => new ArrayList([3, 1, 2])
const tree = () => new TreeSet([3, 1, 2])
const treeMap = () =>
  new TreeMap([
    ['b', 2],
    ['a', 1],
  ])
const linkedMap = () => new LinkedHashMap([['a', 1]])

const views: [string, () => object][] = [
  ['listOf', () => listOf(1, 2, 3)],
  ['copyOfList', () => copyOfList([1, 2])],
  ['setOf', () => setOf(1, 2)],
  ['copyOfSet', () => copyOfSet([1, 2])],
  ['mapOf', () => mapOf(['a', 1])],
  ['copyOfMap', () => copyOfMap([['a', 1]])],
  ['unmodifiableCollection', () => unmodifiableCollection(new HashSet([1]))],
  ['unmodifiableSequencedCollection', () => unmodifiableSequencedCollection(list())],
  ['unmodifiableList', () => unmodifiableList(list())],
  ['unmodifiableSet', () => unmodifiableSet(new HashSet([1]))],
  ['unmodifiableSequencedSet', () => unmodifiableSequencedSet(new LinkedHashSet([1]))],
  ['unmodifiableSortedSet', () => unmodifiableSortedSet(tree())],
  ['unmodifiableMap', () => unmodifiableMap(new HashMap([['a', 1]]))],
  ['unmodifiableSequencedMap', () => unmodifiableSequencedMap(linkedMap())],
  ['unmodifiableSortedMap', () => unmodifiableSortedMap(treeMap())],
  [
    'unmodifiableCollection over PriorityQueue',
    () => unmodifiableCollection(new PriorityQueue([2, 1])),
  ],
  ['unmodifiableCollection over LinkedList', () => unmodifiableCollection(new LinkedList([1, 2]))],
  ['unmodifiableCollection over ArrayDeque', () => unmodifiableCollection(new ArrayDeque([1, 2]))],
  ['unmodifiableSortedSet over TreeSet', () => unmodifiableSortedSet(new TreeSet([2, 1]))],
  ['listOf subList', () => listOf(1, 2, 3).subList(0, 2)],
  ['listOf reversed', () => listOf(1, 2).reversed()],
  ['unmodifiableSortedSet headSet', () => unmodifiableSortedSet(tree()).headSet(3)],
  ['unmodifiableSortedSet reversed', () => unmodifiableSortedSet(tree()).reversed()],
  ['mapOf keySet', () => mapOf(['a', 1]).keySet()],
  ['mapOf entrySet', () => mapOf(['a', 1]).entrySet()],
  ['mapOf valueCollection', () => mapOf(['a', 1]).valueCollection()],
  ['unmodifiableSortedMap headMap', () => unmodifiableSortedMap(treeMap()).headMap('b')],
  ['unmodifiableSequencedMap reversed', () => unmodifiableSequencedMap(linkedMap()).reversed()],
  ['listOf cursor', () => listOf(1, 2).cursor()],
  ['listOf listCursor', () => listOf(1, 2).listCursor()],
  ['setOf cursor', () => setOf(1, 2).cursor()],
  ['mapOf entry', () => [...mapOf(['a', 1]).entrySet()][0] as object],
  [
    'unmodifiableSortedMap firstEntry',
    () => unmodifiableSortedMap(treeMap()).firstEntry() as object,
  ],
]

type Iterating = {
  [Symbol.iterator](): Iterator<unknown>
  keys?: () => Iterator<unknown>
  values?: () => Iterator<unknown>
  entries?: () => Iterator<unknown>
}

const iterators: [string, () => object][] = []
for (const [name, make] of views) {
  const probe = make() as Partial<Iterating>
  if (typeof probe[Symbol.iterator] !== 'function' || 'hasNext' in probe) continue
  iterators.push([`${name} [Symbol.iterator]()`, () => (make() as Iterating)[Symbol.iterator]()])
  for (const method of ['keys', 'values', 'entries'] as const) {
    if (typeof probe[method] === 'function') {
      iterators.push([`${name} ${method}()`, () => (make() as Required<Iterating>)[method]()])
    }
  }
}

describe('read-only collections keep their source out of reach of ordinary property access', () => {
  for (const [name, make] of [...views, ...iterators]) {
    it(`${name} exposes no source through its properties, spread or Object.assign`, () => {
      expectSourceHidden(name, make())
    })
  }

  it('works inside a proxy whose get trap wraps every object it returns', () => {
    const wrap = <T extends object>(target: T): T =>
      new Proxy(target, {
        get(t, key, receiver) {
          const value = Reflect.get(t, key, receiver)
          return typeof value === 'object' && value !== null ? wrap(value) : value
        },
      })
    const source = list()
    const view = wrap(unmodifiableList(source))
    source.add(4)
    expect(view.size).toBe(4)
    expect(view.get(0)).toBe(3)
    expect(view.toArray()).toEqual([3, 1, 2, 4])
    expect([...view]).toEqual([3, 1, 2, 4])
    const cursor = view.cursor()
    expect(cursor.next()).toBe(3)
    const map = wrap(unmodifiableSortedMap(treeMap()))
    expect([...map.keys()]).toEqual(['a', 'b'])
    expect(map.firstEntry()?.value).toBe(1)
  })

  it('still refuses changes and reads the source after the source is hidden', () => {
    const source = list()
    const view = unmodifiableList(source)
    source.add(4)
    expect(view.toArray()).toEqual([3, 1, 2, 4])
    expect(() => (view as unknown as ArrayList<number>).add(5)).toThrow(
      'UnmodifiableList.add: the collection cannot be changed',
    )
  })
})

describe('user callbacks called by equals never receive a writable entry of a read-only map', () => {
  const maps: [string, () => { get(key: string): unknown } & object][] = [
    ['mapOf', () => mapOf(['a', 1])],
    ['unmodifiableMap over HashMap', () => unmodifiableMap(new HashMap([['a', 1]]))],
    ['unmodifiableSequencedMap over LinkedHashMap', () => unmodifiableSequencedMap(linkedMap())],
    ['unmodifiableSortedMap over TreeMap', () => unmodifiableSortedMap(new TreeMap([['a', 1]]))],
  ]

  // Tries to write through every entry it is given; reports whether one write got through.
  const tryWrite = (entry: unknown): void => {
    const writable = entry as { setValue?: (value: number) => unknown }
    try {
      writable.setValue?.(99)
    } catch {
      // A read-only entry refuses the write.
    }
  }

  for (const [name, make] of maps) {
    it(`${name}: equals against a map whose entry set inspects the entries`, () => {
      const map = make()
      const real = new HashMap([['a', 1]])
      const spy = new Proxy(real, {
        get(target, key, receiver) {
          if (key !== 'entrySet') return Reflect.get(target, key, receiver)
          return () => {
            const entries = target.entrySet()
            return new Proxy(entries, {
              get(t, k, r) {
                if (k !== 'has') return Reflect.get(t, k, r)
                return (entry: unknown) => {
                  tryWrite(entry)
                  return t.has(entry as never)
                }
              },
            })
          }
        },
      })
      ;(map as unknown as { equals(other: unknown): boolean }).equals(spy)
      expect(map.get('a')).toBe(1)
    })

    it(`${name}: entrySet().equals against a set whose key function inspects the entries`, () => {
      const map = make()
      const entries = (
        map as unknown as { entrySet(): { equals(other: unknown): boolean } }
      ).entrySet()
      entries.equals(
        new HashSet<unknown>([], {
          key: (entry) => {
            tryWrite(entry)
            return 'x'
          },
        }),
      )
      entries.equals(
        new HashSet<unknown>([['a', 1]], {
          key: (entry) => {
            tryWrite(entry)
            return 'x'
          },
        }),
      )
      expect(map.get('a')).toBe(1)
    })

    it(`${name}: equality results are unchanged`, () => {
      const map = make() as unknown as { equals(other: unknown): boolean }
      expect(map.equals(new HashMap([['a', 1]]))).toBe(true)
      expect(map.equals(new HashMap([['a', 2]]))).toBe(false)
      expect(map.equals(new HashMap([['b', 1]]))).toBe(false)
      expect(map.equals(new HashSet(['a']))).toBe(false)
      expect(new HashMap([['a', 1]]).equals(map)).toBe(true)
    })
  }
})

describe('read-only map equality with cycles', () => {
  it('ends when a view is compared with a map that contains itself', () => {
    const source = new HashMap<string, unknown>()
    const view = unmodifiableMap(source)
    source.set('self', view)
    const other = new HashMap<string, unknown>()
    other.set('self', other)
    expect(view.equals(other)).toBe(false)
    expect(view.equals(unmodifiableMap(source))).toBe(true)
  })
})

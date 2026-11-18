import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import {
  ArrayList,
  equalsSymbol,
  HashMap,
  HashSet,
  hashCode,
  isCollection,
  NoSuchElementError,
  type ReadonlyList,
  TreeSet,
  unmodifiableCollection,
  unmodifiableList,
  unmodifiableMap,
  unmodifiableSortedSet,
} from '../../src/index'
import {
  ReadOnlyCollection,
  ReadOnlySequencedCollection,
} from '../../src/internal/views/read-only/read-only-collection'
import { ReadOnlyList } from '../../src/internal/views/read-only/read-only-list'
import { ReadOnlyMap } from '../../src/internal/views/read-only/read-only-map'
import { ReadOnlySet, ReadOnlySortedSet } from '../../src/internal/views/read-only/read-only-set'
import { readOnlyParts } from '../../src/internal/views/read-only/registry'
import { type ReadOnlyTags, UNMODIFIABLE_TAGS } from '../../src/internal/views/read-only/tags'
import { describeReadonlyCollection } from '../contracts/readonly-collection'
import { describeReadonlyList } from '../contracts/readonly-list'
import { describeReadonlyMap } from '../contracts/readonly-map'
import { describeReadonlySet } from '../contracts/readonly-set'
import { describeUnsupportedMutators } from '../contracts/unsupported'
import { combine } from '../fixtures/structural-list'
import { FUNCTIONS, type Kind, type ViewFunction, views } from '../support/read-only-views'

const TAGS: ReadOnlyTags = {
  collection: 'TestCollection',
  sequencedCollection: 'TestSequencedCollection',
  list: 'TestList',
  subList: 'TestSubList',
  reversedList: 'TestReversedList',
  set: 'TestSet',
  sequencedSet: 'TestSequencedSet',
  sortedSet: 'TestSortedSet',
  map: 'TestMap',
  sequencedMap: 'TestSequencedMap',
  sortedMap: 'TestSortedMap',
  keySet: 'TestMapKeySet',
  entrySet: 'TestMapEntrySet',
  values: 'TestMapValues',
}
const sumOf = (elements: unknown[], hash: (value: unknown) => number) =>
  elements.reduce<number>((h, e) => (h + hash(e)) | 0, 0)

const list = (initial?: Iterable<unknown>) =>
  new ReadOnlyList(new ArrayList<unknown>(initial), TAGS)
const set = (initial?: Iterable<unknown>) =>
  new ReadOnlySet(new HashSet<unknown>(initial), 'TestSet')
const map = (initial?: Iterable<readonly [unknown, unknown]>) =>
  new ReadOnlyMap(new HashMap<unknown, unknown>(initial), TAGS)

describe('read-only list', () => {
  describeReadonlyCollection('TestList', list, {
    brackets: 'list',
    minusZero: 'kept',
    structural: { expectedHash: combine },
    peers: [(initial) => new ArrayList<unknown>(initial)],
  })
  describeReadonlyList('TestList', list, [(initial) => new ArrayList<unknown>(initial)])
  describeUnsupportedMutators('TestList', () => list([1, 2, 3]), 'list')
  describeUnsupportedMutators('TestList', () => list(), 'list')
  describeUnsupportedMutators('TestSubList', () => list([0, 1, 2, 3]).subList(1, 3), 'list')
  describeUnsupportedMutators('TestReversedList', () => list([1, 2]).reversed(), 'list')

  it('checks indexes under its own name and walks with its own cursors', () => {
    const l = list(['a', 'b'])
    expect(() => l.get(2)).toThrow('TestList.get: index 2 is out of bounds for size 2')
    expect(() => l.listCursor(3)).toThrow(/^TestList\.listCursor: /)
    expect(() => l.subList(2, 1)).toThrow(/^TestList\.subList: /)
    expect(() => list().getFirst()).toThrow('TestList.getFirst: the list is empty')
    const cursor = l.listCursor(2)
    expect(cursor.previous()).toBe('b')
    expect(cursor.previousIndex()).toBe(0)
    expect(cursor.previous()).toBe('a')
    expect(() => cursor.previous()).toThrow(NoSuchElementError)
    expect(() => l.subList(0, 0).cursor().next()).toThrow(NoSuchElementError)
    expect(String(l.subList(0, 1))).toBe("TestSubList(1) ['a']")
    expect(String(l.reversed())).toBe("TestReversedList(2) ['b', 'a']")
    expect(String(l.reversed().subList(0, 1))).toBe("TestSubList(1) ['b']")
  })

  it('passes itself, not its source, to forEach callbacks', () => {
    const l = list([1])
    l.forEach((_e, _i, owner) => {
      expect(owner).toBe(l)
    })
  })
})

describe('read-only set', () => {
  describeReadonlyCollection('TestSet', set, {
    brackets: 'set',
    structural: { expectedHash: sumOf },
    peers: [(initial) => new HashSet<unknown>(initial)],
  })
  describeReadonlySet('TestSet', set)
  describeUnsupportedMutators('TestSet', () => set([1, 2]), 'set')
  describeUnsupportedMutators('TestSet', () => set(), 'set')

  it('passes itself to forEach callbacks and equals its source both ways', () => {
    const source = new HashSet<unknown>([1, 2])
    const s = new ReadOnlySet(source, 'TestSet')
    s.forEach((_a, _b, owner) => {
      expect(owner).toBe(s)
    })
    expect(s.equals(source)).toBe(true)
    expect(source.equals(s)).toBe(true)
  })
})

describe('read-only map', () => {
  describeReadonlyMap('TestMap', map)
  describeReadonlySet('TestMapKeySet', (initial) =>
    map([...(initial ?? [])].map((e) => [e, e])).keySet(),
  )
  describeUnsupportedMutators('TestMap', () => map([['a', 1]]), 'map')
  describeUnsupportedMutators('TestMap', () => map(), 'map')
  describeUnsupportedMutators('TestMapKeySet', () => map([['a', 1]]).keySet(), 'set')
  describeUnsupportedMutators('TestMapEntrySet', () => map([['a', 1]]).entrySet(), 'set')
  describeUnsupportedMutators('TestMapValues', () => map([['a', 1]]).valueCollection(), 'values')
  describeReadonlyCollection(
    'TestMapValues',
    (initial) => map([...(initial ?? [])].map((e, i) => [`k${i}`, e])).valueCollection(),
    { brackets: 'list' },
  )

  it('hands out read-only entries that read and equal the source entries', () => {
    const source = new HashMap<unknown, unknown>([['a', 1]])
    const m = new ReadOnlyMap(source, TAGS)
    const [entry] = [...m.entrySet()]
    const [sourceEntry] = [...source.entrySet()]
    expect(entry).not.toBe(sourceEntry)
    expect(entry?.equals(sourceEntry)).toBe(true)
    expect(sourceEntry?.equals(entry)).toBe(true)
    expect(m.entrySet().has(sourceEntry as never)).toBe(true)
    expect(String(m.entrySet())).toBe("TestMapEntrySet(1) {'a' => 1}")
    expect(JSON.stringify(m.entrySet())).toBe('[["a",1]]')
  })

  it('passes itself to forEach, compares with its source both ways and prints with its tag', () => {
    const source = new HashMap<unknown, unknown>([['a', 1]])
    const m = new ReadOnlyMap(source, TAGS)
    m.forEach((_v, _k, owner) => {
      expect(owner).toBe(m)
    })
    expect(m.equals(source)).toBe(true)
    expect(source.equals(m)).toBe(true)
    expect(String(m)).toBe("TestMap(1) {'a' => 1}")
    expect(String(m.keySet())).toBe("TestMapKeySet(1) {'a'}")
    expect(String(m.valueCollection())).toBe('TestMapValues(1) [1]')
    expect(m.valueCollection().equals(m.valueCollection())).toBe(false)
    expect(isCollection(m)).toBe(false)
  })

  it('makes value views compare by identity', () => {
    const values = new ReadOnlyCollection(new ArrayList<unknown>([1]), 'TestValues')
    expect(values.equals(values)).toBe(true)
    expect(values.equals(new ArrayList<unknown>([1]))).toBe(false)
  })
})

describe('read-only details', () => {
  it('refuses the index operations the list skeleton would otherwise call', () => {
    const l = list([1])
    for (const call of [
      () => l.setAt(0, 1),
      () => l.insertAt(0, 1),
      () => l.insertItems(0, [1]),
      () => l.removeAtIndex(0),
      () => l.removeRange(0, 1),
    ]) {
      expect(call).toThrow(/^TestList\.\w+: the collection cannot be changed$/)
    }
  })

  it('read-only entries compare, hash, iterate and print like map entries', () => {
    const [entry] = [...map([['a', 1]]).entrySet()]
    if (entry === undefined) throw new Error('no entry')
    expect(entry.equals(entry)).toBe(true)
    expect(entry.equals(['a', 1])).toBe(false)
    expect(entry[equalsSymbol]([...new HashMap([['a', 1]]).entrySet()][0])).toBe(true)
    expect(hashCode(entry)).toBe(hashCode([...new HashMap([['a', 1]]).entrySet()][0]))
    expect([...entry]).toEqual(['a', 1])
    expect(String(entry)).toBe("'a' => 1")
    expect(inspect(entry)).toBe("'a' => 1")
    expect(JSON.stringify(entry)).toBe('["a",1]')
  })

  it('list cursors report their indexes; maps answer the equality protocol', () => {
    const cursor = list([1, 2]).listCursor(1)
    expect(cursor.nextIndex()).toBe(1)
    expect(cursor.hasPrevious()).toBe(true)
    expect(list([1]).listCursor().nextIndex()).toBe(0)
    const m = map([['a', 1]])
    expect(m[equalsSymbol](new HashMap([['a', 1]]))).toBe(true)
  })
})

describe('read-only view registry', () => {
  it('records each read-only view with its source, kind, name and reveal after construction [036 S1-AC8]', () => {
    const source = new HashMap<string, number>([['a', 1]])
    const view = map([['a', 1]])
    expect(readOnlyParts(view)).toMatchObject({ kind: 'map', printed: 'TestMap' })
    const entries = new ReadOnlyMap(source, UNMODIFIABLE_TAGS).entrySet()
    const parts = readOnlyParts(entries)
    expect(parts).toMatchObject({ kind: 'set', printed: 'UnmodifiableSet', unmodifiable: true })
    expect(parts?.reveal).toBeTypeOf('function')
    expect(readOnlyParts(new ReadOnlySortedSet(new TreeSet([1]), 'X'))).toMatchObject({
      kind: 'sorted-set',
      unmodifiable: false,
    })
    expect(
      readOnlyParts(new ReadOnlySequencedCollection(new ArrayList([1]), 'UnmodifiableX')),
    ).toMatchObject({ kind: 'sequenced-collection', unmodifiable: true })
    expect(readOnlyParts(list([1]))).toMatchObject({ kind: 'list', unmodifiable: false })
    expect(
      readOnlyParts(new ReadOnlyList(new ArrayList([1]), UNMODIFIABLE_TAGS))?.unmodifiable,
    ).toBe(true)
  })

  it('has no record for an object made from a view prototype or for a proxy of a view [036 S1-AC8]', () => {
    const view = set([1])
    expect(readOnlyParts(view)?.source).toBeInstanceOf(HashSet)
    expect(readOnlyParts(Object.create(ReadOnlySet.prototype))).toBeUndefined()
    expect(readOnlyParts(new Proxy(view, {}))).toBeUndefined()
    expect(readOnlyParts(new HashSet())).toBeUndefined()
    expect(readOnlyParts(1)).toBeUndefined()
    expect(readOnlyParts(null)).toBeUndefined()
  })

  it('hands members out through reveal in iteration, forEach, toArray, the ends and cursors [036 S1-AC8]', () => {
    const reveal = (n: number) => n * 10
    const view = new ReadOnlySequencedCollection(
      new ArrayList([1, 2]),
      'TestSequencedCollection',
      reveal,
    )
    expect([...view]).toEqual([10, 20])
    expect(view.toArray()).toEqual([10, 20])
    const seen: number[] = []
    view.forEach((n) => {
      seen.push(n)
    })
    expect(seen).toEqual([10, 20])
    expect([view.getFirst(), view.getLast()]).toEqual([10, 20])
    expect([...view.reversed()]).toEqual([20, 10])
    const cursor = view.cursor()
    expect(cursor.next()).toBe(10)
    const plain = new ReadOnlyCollection(new ArrayList([1]), 'TestCollection')
    expect([...plain]).toEqual([1])
  })

  it("records a wrap of another read-only view over that view's source, one level deep [036 S1-AC8]", () => {
    for (const { label, view, kind, unmodifiable } of views().cases) {
      for (const f of FUNCTIONS) {
        if (!f.accepts.includes(kind) || (unmodifiable && f.kind === kind)) continue
        const parts = readOnlyParts(f.wrap(view as never))
        expect(parts?.kind, `${f.name} of ${label}`).toBe(f.kind)
        expect(parts?.source).toBe(readOnlyParts(view)?.source)
        expect(readOnlyParts(parts?.source), `${f.name} of ${label}`).toBeUndefined()
      }
    }
    const tree = new TreeSet([1, 2, 3])
    expect(readOnlyParts(unmodifiableCollection(unmodifiableSortedSet(tree)))?.source).toBe(tree)
  })

  it('records a wrap of a spoofed or proxied view over the object it was given [036 S1-AC8]', () => {
    const view = unmodifiableList(new ArrayList([1, 2]))
    const spoof = Object.create(Object.getPrototypeOf(view)) as ReadonlyList<number>
    expect(readOnlyParts(unmodifiableList(spoof))?.source === spoof).toBe(true)
    const proxy = new Proxy(view, {})
    expect(readOnlyParts(unmodifiableList(proxy))?.source).toBe(proxy)
  })

  it('never records an instance of a subclass the library did not define, so it is wrapped [036 S1-AC8]', () => {
    class SubList extends ReadOnlyList<number> {}
    class SubSet extends ReadOnlySortedSet<number> {}
    class SubMap extends ReadOnlyMap<string, number> {}
    class SubCollection extends ReadOnlyCollection<number> {}
    const subList = new SubList(new ArrayList([7]), UNMODIFIABLE_TAGS)
    const subSet = new SubSet(new TreeSet([7]), 'UnmodifiableSortedSet')
    const subMap = new SubMap(new HashMap([['a', 7]]), UNMODIFIABLE_TAGS)
    const subCollection = new SubCollection(new ArrayList([7]), 'UnmodifiableCollection')
    for (const sub of [subList, subSet, subMap, subCollection])
      expect(readOnlyParts(sub)).toBeUndefined()
    const wrapped = unmodifiableList(subList)
    expect(wrapped).not.toBe(subList)
    expect(readOnlyParts(wrapped)?.source).toBe(subList)
    expect(unmodifiableSortedSet(subSet)).not.toBe(subSet)
    expect(unmodifiableMap(subMap)).not.toBe(subMap)
    expect(unmodifiableCollection(subCollection)).not.toBe(subCollection)
    expect(wrapped.toArray()).toEqual([7])
  })

  it('stays one level deep through 10,000 wraps of alternating kinds [036 S1-AC8]', () => {
    const tree = new TreeSet([1, 2, 3])
    const chain = FUNCTIONS.filter(
      (fn) => fn.accepts.includes('sorted-set') && !fn.kind.endsWith('map'),
    )
    let sortedView: unknown = unmodifiableSortedSet(tree)
    let current: unknown = sortedView
    for (let i = 0; i < 10_000; i++) {
      const fn = chain[i % chain.length] as ViewFunction
      const kind = readOnlyParts(current)?.kind as Kind
      current = fn.wrap((fn.accepts.includes(kind) ? current : sortedView) as never)
      if (fn.kind === 'sorted-set') sortedView = current
      expect(readOnlyParts(current)?.source).toBe(tree)
    }
  })
})

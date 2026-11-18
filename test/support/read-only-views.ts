// Every kind of read-only view the package builds, and the unmodifiable-view functions with the
// kinds they build and accept, for the tests of wrapping read-only collections.

import {
  ArrayDeque,
  ArrayList,
  HashMap,
  HashSet,
  LinkedHashMap,
  LinkedHashSet,
  listOf,
  type MapEntry,
  mapOf,
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
} from '../../src/index'

export type Kind =
  | 'collection'
  | 'sequenced-collection'
  | 'list'
  | 'set'
  | 'sequenced-set'
  | 'sorted-set'
  | 'map'
  | 'sequenced-map'
  | 'sorted-map'

export type Wrap = (value: never) => unknown

export interface ViewFunction {
  /** The name the function's views print. */
  readonly name: string
  readonly wrap: Wrap
  readonly kind: Kind
  /** The kinds its family check accepts. */
  readonly accepts: readonly Kind[]
}

const COLLECTIONS: Kind[] = [
  'collection',
  'sequenced-collection',
  'list',
  'set',
  'sequenced-set',
  'sorted-set',
]

export const FUNCTIONS: readonly ViewFunction[] = [
  {
    name: 'UnmodifiableCollection',
    wrap: unmodifiableCollection,
    kind: 'collection',
    accepts: COLLECTIONS,
  },
  {
    name: 'UnmodifiableSequencedCollection',
    wrap: unmodifiableSequencedCollection,
    kind: 'sequenced-collection',
    accepts: ['sequenced-collection', 'list', 'sequenced-set', 'sorted-set'],
  },
  { name: 'UnmodifiableList', wrap: unmodifiableList, kind: 'list', accepts: ['list'] },
  {
    name: 'UnmodifiableSet',
    wrap: unmodifiableSet,
    kind: 'set',
    accepts: ['set', 'sequenced-set', 'sorted-set'],
  },
  {
    name: 'UnmodifiableSequencedSet',
    wrap: unmodifiableSequencedSet,
    kind: 'sequenced-set',
    accepts: ['sequenced-set', 'sorted-set'],
  },
  {
    name: 'UnmodifiableSortedSet',
    wrap: unmodifiableSortedSet,
    kind: 'sorted-set',
    accepts: ['sorted-set'],
  },
  {
    name: 'UnmodifiableMap',
    wrap: unmodifiableMap,
    kind: 'map',
    accepts: ['map', 'sequenced-map', 'sorted-map'],
  },
  {
    name: 'UnmodifiableSequencedMap',
    wrap: unmodifiableSequencedMap,
    kind: 'sequenced-map',
    accepts: ['sequenced-map', 'sorted-map'],
  },
  {
    name: 'UnmodifiableSortedMap',
    wrap: unmodifiableSortedMap,
    kind: 'sorted-map',
    accepts: ['sorted-map'],
  },
]

export type Any = Iterable<unknown> & { readonly [Symbol.toStringTag]?: string }

export interface ViewCase {
  readonly label: string
  readonly view: Any
  readonly kind: Kind
  readonly unmodifiable: boolean
}

/**
 * Every read-only view the package builds, over fresh owners, and `change`, which changes every
 * owner so that each unmodifiable view shows something new.
 */
export function views(): { cases: ViewCase[]; change: () => void } {
  const list = new ArrayList([1, 2, 3])
  const ul = unmodifiableList(list)
  const tree = new TreeSet([1, 2, 3])
  const us = unmodifiableSortedSet(tree)
  const linkedSet = new LinkedHashSet([1, 2, 3])
  const lhs = unmodifiableSequencedSet(linkedSet)
  const deque = new ArrayDeque([1, 2, 3])
  const usc = unmodifiableSequencedCollection(deque)
  const hashSet = new HashSet([1])
  const collectionDeque = new ArrayDeque([1])
  const hashMap = new HashMap([['a', 1]])
  const um = unmodifiableMap(hashMap)
  const linkedMap = new LinkedHashMap([['a', 1]])
  const usm = unmodifiableSequencedMap(linkedMap)
  const treeMap = new TreeMap([
    ['a', 1],
    ['b', 2],
  ])
  const usortm = unmodifiableSortedMap(treeMap)
  const il = listOf(1, 2, 3)
  const im = mapOf(['a', 1])
  const map = (view: unknown) => view as Any
  const cases: ViewCase[] = [
    {
      label: 'unmodifiable collection',
      view: unmodifiableCollection(collectionDeque),
      kind: 'collection',
      unmodifiable: true,
    },
    {
      label: 'unmodifiable sequenced collection',
      view: usc,
      kind: 'sequenced-collection',
      unmodifiable: true,
    },
    {
      label: 'its reversed view',
      view: usc.reversed(),
      kind: 'sequenced-collection',
      unmodifiable: true,
    },
    { label: 'unmodifiable list', view: ul, kind: 'list', unmodifiable: true },
    { label: 'its sub-list', view: ul.subList(0, 2), kind: 'list', unmodifiable: true },
    { label: 'its reversed view', view: ul.reversed(), kind: 'list', unmodifiable: true },
    { label: 'unmodifiable set', view: unmodifiableSet(hashSet), kind: 'set', unmodifiable: true },
    { label: 'unmodifiable sequenced set', view: lhs, kind: 'sequenced-set', unmodifiable: true },
    { label: 'its reversed view', view: lhs.reversed(), kind: 'sequenced-set', unmodifiable: true },
    { label: 'unmodifiable sorted set', view: us, kind: 'sorted-set', unmodifiable: true },
    { label: 'its range', view: us.subSet(1, 3), kind: 'sorted-set', unmodifiable: true },
    { label: 'its head range', view: us.headSet(3), kind: 'sorted-set', unmodifiable: true },
    { label: 'its tail range', view: us.tailSet(1), kind: 'sorted-set', unmodifiable: true },
    { label: 'its reversed view', view: us.reversed(), kind: 'sorted-set', unmodifiable: true },
    { label: 'unmodifiable map', view: map(um), kind: 'map', unmodifiable: true },
    { label: 'its key set', view: um.keySet(), kind: 'set', unmodifiable: true },
    { label: 'its entry set', view: um.entrySet(), kind: 'set', unmodifiable: true },
    { label: 'its values', view: um.valueCollection(), kind: 'collection', unmodifiable: true },
    {
      label: 'unmodifiable sequenced map',
      view: map(usm),
      kind: 'sequenced-map',
      unmodifiable: true,
    },
    {
      label: 'its reversed view',
      view: map(usm.reversed()),
      kind: 'sequenced-map',
      unmodifiable: true,
    },
    { label: 'its key set', view: usm.keySet(), kind: 'sequenced-set', unmodifiable: true },
    { label: 'its entry set', view: usm.entrySet(), kind: 'sequenced-set', unmodifiable: true },
    {
      label: 'its values',
      view: usm.valueCollection(),
      kind: 'sequenced-collection',
      unmodifiable: true,
    },
    { label: 'unmodifiable sorted map', view: map(usortm), kind: 'sorted-map', unmodifiable: true },
    {
      label: 'its range',
      view: map(usortm.subMap('a', 'b')),
      kind: 'sorted-map',
      unmodifiable: true,
    },
    {
      label: 'its head range',
      view: map(usortm.headMap('b')),
      kind: 'sorted-map',
      unmodifiable: true,
    },
    {
      label: 'its tail range',
      view: map(usortm.tailMap('a')),
      kind: 'sorted-map',
      unmodifiable: true,
    },
    {
      label: 'its reversed view',
      view: map(usortm.reversed()),
      kind: 'sorted-map',
      unmodifiable: true,
    },
    { label: 'its key set', view: usortm.keySet(), kind: 'sorted-set', unmodifiable: true },
    { label: 'its entry set', view: usortm.entrySet(), kind: 'sequenced-set', unmodifiable: true },
    {
      label: 'its values',
      view: usortm.valueCollection(),
      kind: 'sequenced-collection',
      unmodifiable: true,
    },
    { label: 'immutable list', view: il, kind: 'list', unmodifiable: false },
    { label: 'its sub-list', view: il.subList(0, 2), kind: 'list', unmodifiable: false },
    { label: 'its reversed view', view: il.reversed(), kind: 'list', unmodifiable: false },
    { label: 'immutable set', view: setOf(1, 2), kind: 'set', unmodifiable: false },
    { label: 'immutable map', view: map(im), kind: 'map', unmodifiable: false },
    { label: 'its key set', view: im.keySet(), kind: 'set', unmodifiable: false },
    { label: 'its entry set', view: im.entrySet(), kind: 'set', unmodifiable: false },
    { label: 'its values', view: im.valueCollection(), kind: 'collection', unmodifiable: false },
  ]
  const change = () => {
    list.set(0, 10)
    tree.add(1.5)
    linkedSet.add(4)
    deque.addFirst(0)
    hashSet.add(2)
    collectionDeque.add(2)
    hashMap.set('a', 9)
    linkedMap.set('a', 9)
    treeMap.set('a', 9)
  }
  return { cases, change }
}

/** The contents of a collection or map, entries as pairs. */
export function contents(value: Any): unknown[] {
  return [...value].map((e) =>
    e !== null && typeof e === 'object' && 'key' in e
      ? [(e as MapEntry<unknown, unknown>).key, (e as MapEntry<unknown, unknown>).value]
      : e,
  )
}

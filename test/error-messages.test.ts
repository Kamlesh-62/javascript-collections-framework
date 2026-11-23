// Pins the type and exact message of the errors thrown on the collections' most used paths. The
// messages are part of the public behaviour (the error names the API and the problem).

import { describe, expect, it } from 'vitest'
import * as lib from '../src/index'

// biome-ignore lint/suspicious/noExplicitAny: the cases call the public API dynamically
const L = lib as any
const {
  ArrayList,
  LinkedList,
  ArrayDeque,
  PriorityQueue,
  HashMap,
  HashSet,
  LinkedHashMap,
  LinkedHashSet,
  TreeMap,
  TreeSet,
} = L
const nanCmp = () => Number.NaN

// biome-ignore lint/suspicious/noExplicitAny: the cases reach any collection's methods
type Any = any

/** Iterates `c`, changing it on the first step. */
const cmeIter = (c: Any, change: (c: Any) => void) => () => {
  for (const _ of c) change(c)
}
const list = () => new ArrayList([1, 2, 3])

const CASES: Array<[string, () => unknown, string, string]> = [
  [
    'PriorityQueue.poll NaN comparator',
    () => {
      let bad = false
      const q = new PriorityQueue({
        comparator: (a: number, b: number) => (bad ? Number.NaN : a - b),
      })
      q.add(1).add(2).add(3)
      bad = true
      q.poll()
    },
    'TypeError',
    'PriorityQueue.poll: comparator returned NaN',
  ],
  [
    'ArrayDeque.reversed addFirst undefined',
    () => new ArrayDeque([1]).reversed().addFirst(undefined),
    'NullElementError',
    'ReversedDeque.addFirst: undefined is not allowed as an element',
  ],
  [
    'ArrayList.get out of bounds',
    () => list().get(5),
    'IndexOutOfBoundsError',
    'ArrayList.get: index 5 is out of bounds for size 3',
  ],
  [
    'ArrayList.get non-integer',
    () => list().get(1.5),
    'IndexOutOfBoundsError',
    'ArrayList.get: index 1.5 is out of bounds for size 3',
  ],
  [
    'ArrayList.set out of bounds',
    () => list().set(3, 0),
    'IndexOutOfBoundsError',
    'ArrayList.set: index 3 is out of bounds for size 3',
  ],
  [
    'ArrayList.insert out of bounds',
    () => list().insert(4, 0),
    'IndexOutOfBoundsError',
    'ArrayList.insert: position 4 is out of bounds for size 3',
  ],
  [
    'ArrayList.removeAt out of bounds',
    () => list().removeAt(-1),
    'IndexOutOfBoundsError',
    'ArrayList.removeAt: index -1 is out of bounds for size 3',
  ],
  [
    'ArrayList.subList from out of bounds',
    () => list().subList(-1, 2),
    'IndexOutOfBoundsError',
    'ArrayList.subList: from -1 is out of bounds for size 3',
  ],
  [
    'ArrayList.subList to out of bounds',
    () => list().subList(0, 4),
    'IndexOutOfBoundsError',
    'ArrayList.subList: to 4 is out of bounds for size 3',
  ],
  [
    'ArrayList.subList bad range',
    () => list().subList(2, 1),
    'IllegalArgumentError',
    'ArrayList.subList: from 2 is greater than to 1 for size 3',
  ],
  [
    'ArrayList iteration after add',
    cmeIter(list(), (c: Any) => c.add(9)),
    'ConcurrentModificationError',
    'ArrayList[Symbol.iterator]().next: the collection was changed during iteration',
  ],
  [
    'ArrayList.forEach non-function',
    () => list().forEach(42),
    'TypeError',
    'ArrayList.forEach: action is not a function',
  ],
  [
    'LinkedList.getLast empty',
    () => new LinkedList().getLast(),
    'NoSuchElementError',
    'LinkedList.getLast: the list is empty',
  ],
  [
    'LinkedList iteration after push',
    cmeIter(new LinkedList([1, 2]), (c: Any) => c.push(9)),
    'ConcurrentModificationError',
    'LinkedList[Symbol.iterator]().next: the collection was changed during iteration',
  ],
  [
    'ArrayDeque.add undefined',
    () => new ArrayDeque().add(undefined),
    'NullElementError',
    'ArrayDeque.add: undefined is not allowed as an element',
  ],
  [
    'ArrayDeque.push null',
    () => new ArrayDeque().push(null),
    'NullElementError',
    'ArrayDeque.push: null is not allowed as an element',
  ],
  [
    'ArrayDeque.addFirst undefined',
    () => new ArrayDeque().addFirst(undefined),
    'NullElementError',
    'ArrayDeque.addFirst: undefined is not allowed as an element',
  ],
  [
    'ArrayDeque iteration after push',
    cmeIter(new ArrayDeque([1, 2]), (c: Any) => c.push(9)),
    'ConcurrentModificationError',
    'ArrayDeque[Symbol.iterator]().next: the collection was changed during iteration',
  ],
  [
    'ArrayDeque.getFirst empty',
    () => new ArrayDeque().getFirst(),
    'NoSuchElementError',
    'ArrayDeque.getFirst: the deque is empty',
  ],
  [
    'PriorityQueue.add undefined',
    () => new PriorityQueue().add(undefined),
    'NullElementError',
    'PriorityQueue.add: undefined is not allowed as an element',
  ],
  [
    'PriorityQueue.add mixed kinds',
    () => new PriorityQueue([1]).add('a'),
    'ClassCastError',
    'PriorityQueue.add: string and number cannot be compared',
  ],
  [
    'PriorityQueue.add NaN comparator',
    () => new PriorityQueue({ comparator: nanCmp }).add(1).add(2),
    'TypeError',
    'PriorityQueue.add: comparator returned NaN',
  ],
  [
    'PriorityQueue iteration after add',
    cmeIter(new PriorityQueue([1, 2]), (c: Any) => c.add(9)),
    'ConcurrentModificationError',
    'PriorityQueue[Symbol.iterator]().next: the collection was changed during iteration',
  ],
  [
    'HashMap.forEach non-function',
    () => new HashMap().forEach(1),
    'TypeError',
    'HashMap.forEach: action is not a function',
  ],
  [
    'HashMap key option changes map',
    () => {
      let once = true
      const m = new HashMap({
        key: (k: unknown) => {
          if (once) {
            once = false
            m.set('x', 0)
          }
          return k
        },
      })
      m.get(1)
    },
    'ConcurrentModificationError',
    'HashMap.get: the map was changed by a key, equals or hash function',
  ],
  [
    'HashMap.compute callback non-function',
    () => new HashMap().compute(1, 5),
    'TypeError',
    'HashMap.compute: fn is not a function',
  ],
  [
    'HashSet.forEach non-function',
    () => new HashSet().forEach('x'),
    'TypeError',
    'HashSet.forEach: action is not a function',
  ],
  [
    'HashSet key option changes set',
    () => {
      let once = true
      const s = new HashSet({
        key: (k: unknown) => {
          if (once) {
            once = false
            s.add('y')
          }
          return k
        },
      })
      s.has(1)
    },
    'ConcurrentModificationError',
    'HashSet.has: the set was changed by a key, equals or hash function',
  ],
  [
    'LinkedHashMap.keySet().removeFirst empty',
    () => new LinkedHashMap().keySet().removeFirst(),
    'NoSuchElementError',
    'LinkedHashMapKeySet.removeFirst: the set is empty',
  ],
  [
    'LinkedHashMap.forEach non-function',
    () => new LinkedHashMap().forEach(null),
    'TypeError',
    'LinkedHashMap.forEach: action is not a function',
  ],
  [
    'LinkedHashSet.removeFirst empty',
    () => new LinkedHashSet().removeFirst(),
    'NoSuchElementError',
    'LinkedHashSet.removeFirst: the set is empty',
  ],
  [
    'LinkedHashSet.forEach non-function',
    () => new LinkedHashSet().forEach(0),
    'TypeError',
    'LinkedHashSet.forEach: action is not a function',
  ],
  [
    'TreeMap.set null key',
    () => new TreeMap().set(null, 1),
    'NullElementError',
    'TreeMap.set: null is not allowed as a key',
  ],
  [
    'TreeMap.set mixed kinds',
    () => new TreeMap([[1, 1]]).set('a', 1),
    'ClassCastError',
    'TreeMap.set: string and number cannot be compared',
  ],
  [
    'TreeMap.set NaN comparator',
    () => new TreeMap({ comparator: nanCmp }).set(1, 1).set(2, 2),
    'TypeError',
    'TreeMap.set: comparator returned NaN',
  ],
  [
    'TreeMap.set comparator changes map',
    () => {
      let armed = false
      const m = new TreeMap({
        comparator: (a: number, b: number) => {
          if (armed) {
            armed = false
            m.delete(1)
          }
          return a - b
        },
      })
      m.set(1, 1)
      armed = true
      m.set(2, 2)
    },
    'ConcurrentModificationError',
    'TreeMap.set: the map was changed by the comparator',
  ],
  [
    'TreeMap.firstEntry via keySet getFirst empty',
    () => new TreeMap().keySet().getFirst(),
    'NoSuchElementError',
    'TreeMapKeySet.getFirst: the set is empty',
  ],
  [
    'TreeMap.compute callback changes map',
    () => {
      const m = new TreeMap([[1, 1]])
      m.compute(1, () => {
        m.set(2, 2)
        return 3
      })
    },
    'ConcurrentModificationError',
    'TreeMap.compute: the map was changed by the callback',
  ],
  [
    'TreeMap.floorEntry undefined',
    () => new TreeMap([[1, 1]]).floorEntry(undefined),
    'NullElementError',
    'TreeMap.floorEntry: undefined is not allowed as a key',
  ],
  [
    'TreeMap iteration after set',
    cmeIter(
      new TreeMap([
        [1, 1],
        [2, 2],
      ]),
      (c: Any) => c.set(9, 9),
    ),
    'ConcurrentModificationError',
    'TreeMap.entries: the collection was changed during iteration',
  ],
  [
    'TreeSet.add undefined',
    () => new TreeSet().add(undefined),
    'NullElementError',
    'TreeSet.add: undefined is not allowed as an element',
  ],
  [
    'TreeSet.add mixed kinds',
    () => new TreeSet(['a']).add(1),
    'ClassCastError',
    'TreeSet.add: number and string cannot be compared',
  ],
  [
    'TreeSet.add date and number',
    () => new TreeSet([new Date(0)]).add(1),
    'ClassCastError',
    'TreeSet.add: number and date cannot be compared',
  ],
  [
    'TreeSet.ceiling mixed kinds',
    () => new TreeSet([1]).ceiling('a'),
    'ClassCastError',
    'TreeSet.ceiling: string and number cannot be compared',
  ],
  [
    'TreeSet.getFirst empty',
    () => new TreeSet().getFirst(),
    'NoSuchElementError',
    'TreeSet.getFirst: the set is empty',
  ],
  [
    'TreeSet iteration after add',
    cmeIter(new TreeSet([1, 2]), (c: Any) => c.add(9)),
    'ConcurrentModificationError',
    'TreeSet[Symbol.iterator]().next: the collection was changed during iteration',
  ],
  [
    'TreeSet.add NaN comparator',
    () => new TreeSet({ comparator: nanCmp }).add(1).add(2),
    'TypeError',
    'TreeSet.add: comparator returned NaN',
  ],
]

/** A list and a node handle of the given kind: one of another list, removed, or not a handle. */
const nodeArgs: Array<[string, () => [Any, unknown]]> = [
  ['a node of another list', () => [new LinkedList([1]), new LinkedList().addLastNode(7)]],
  [
    'a removed node',
    () => {
      const l = new LinkedList([1])
      const n = l.addLastNode(2)
      l.removeNode(n)
      return [l, n]
    },
  ],
  ['a plain object', () => [new LinkedList([1]), { value: 1 }]],
  [
    'an object made from a node prototype',
    () => {
      const l = new LinkedList([1])
      return [l, Object.create(Object.getPrototypeOf(l.addLastNode(2)))]
    },
  ],
]

/** A keyed collection whose key function, once armed, runs `change` on the collection. */
const keyedChange = (Cls: Any, method: string, args: unknown[], change: (c: Any) => void) => () => {
  let armed = false
  const c = new Cls({
    key: (k: unknown) => {
      if (armed) {
        armed = false
        change(c)
      }
      return k
    },
  })
  if (typeof c.set === 'function') c.set(1, 1)
  else c.add(1)
  armed = true
  c[method](...args)
}
const keyedObject = (Cls: Any, method: string, args: unknown[]) => () =>
  new Cls({ key: (k: unknown) => ({ k }) })[method](...args)

const writeArgs = (method: string) => (method === 'set' || method === 'put' ? [2, 2] : [2])

const SLOW_PATH_CASES: Array<[string, () => unknown, string, string]> = [
  [
    'LinkedListNode.value set on a removed node',
    () => {
      const l = new LinkedList([1])
      const n = l.addLastNode(2)
      l.removeNode(n)
      n.value = 3
    },
    'IllegalStateError',
    'LinkedListNode.value: the node has been removed from its list',
  ],
  ...['insertBefore', 'insertAfter', 'removeNode'].flatMap((method) =>
    nodeArgs.map(([kind, make]): [string, () => unknown, string, string] => [
      `LinkedList.${method} with ${kind}`,
      () => {
        const [l, n] = make()
        if (method === 'removeNode') l.removeNode(n)
        else l[method](n, 5)
      },
      'IllegalArgumentError',
      `LinkedList.${method}: node is not a node of this list (object)`,
    ]),
  ),
  ...['get', 'has', 'set', 'delete'].flatMap(
    (method): Array<[string, () => unknown, string, string]> => [
      [
        `HashMap.${method} key function returning an object`,
        keyedObject(HashMap, method, writeArgs(method)),
        'TypeError',
        `HashMap.${method}: key function returned object`,
      ],
      [
        `HashMap.${method} key function adding a mapping`,
        keyedChange(HashMap, method, writeArgs(method), (m) => m.set('z', 0)),
        'ConcurrentModificationError',
        `HashMap.${method}: the map was changed by a key, equals or hash function`,
      ],
      [
        `HashMap.${method} key function removing a mapping`,
        keyedChange(HashMap, method, writeArgs(method), (m) => m.delete(1)),
        'ConcurrentModificationError',
        `HashMap.${method}: the map was changed by a key, equals or hash function`,
      ],
    ],
  ),
  ...['get', 'has', 'set', 'put', 'delete'].map(
    (method): [string, () => unknown, string, string] => [
      `LinkedHashMap.${method} key function adding a mapping`,
      keyedChange(LinkedHashMap, method, writeArgs(method), (m) => m.set('z', 0)),
      'ConcurrentModificationError',
      `LinkedHashMap.${method}: the map was changed by a key, equals or hash function`,
    ],
  ),
  [
    'LinkedHashMap.set key function removing a mapping',
    keyedChange(LinkedHashMap, 'set', [2, 2], (m) => m.delete(1)),
    'ConcurrentModificationError',
    'LinkedHashMap.set: the map was changed by a key, equals or hash function',
  ],
  [
    'LinkedHashMap.set key function returning an object',
    keyedObject(LinkedHashMap, 'set', [2, 2]),
    'TypeError',
    'LinkedHashMap.set: key function returned object',
  ],
  ...['add', 'addFirst', 'addLast', 'has', 'delete'].map(
    (method): [string, () => unknown, string, string] => [
      `LinkedHashSet.${method} key function adding an element`,
      keyedChange(LinkedHashSet, method, [2], (t) => t.add('z')),
      'ConcurrentModificationError',
      `LinkedHashSet.${method}: the set was changed by a key, equals or hash function`,
    ],
  ),
  [
    'LinkedHashSet.add key function removing an element',
    keyedChange(LinkedHashSet, 'add', [2], (t) => t.delete(1)),
    'ConcurrentModificationError',
    'LinkedHashSet.add: the set was changed by a key, equals or hash function',
  ],
  [
    'LinkedHashSet.add key function returning an object',
    keyedObject(LinkedHashSet, 'add', [2]),
    'TypeError',
    'LinkedHashSet.add: key function returned object',
  ],
  [
    'ArrayList constructor with a number',
    () => new ArrayList(5),
    'TypeError',
    'ArrayList: elements is not iterable (5)',
  ],
  [
    'ArrayList constructor with an array-like',
    () => new ArrayList({ length: 2, 0: 1, 1: 2 }),
    'TypeError',
    'ArrayList: elements is not iterable (object)',
  ],
  [
    'ArrayList.from with a number',
    () => ArrayList.from(5),
    'TypeError',
    'ArrayList.from: elements is not iterable (5)',
  ],
  [
    'ArrayList.from with an array-like',
    () => ArrayList.from({ length: 1, 0: 1 }),
    'TypeError',
    'ArrayList.from: elements is not iterable (object)',
  ],
  [
    'ArrayList.from with an array-like and a mapping function',
    () => ArrayList.from({ length: 1, 0: 1 }, (x: unknown) => x),
    'TypeError',
    'ArrayList.from: elements is not iterable (object)',
  ],
  ...(
    [
      ['a fractional index', 0.5, 3],
      ['a negative index', -1, 3],
      ['a NaN index', Number.NaN, 3],
      ['an infinite index', Number.POSITIVE_INFINITY, 3],
      ['the index equal to the size', 3, 3],
      ['index 0 on an empty list', 0, 0],
    ] as const
  ).map(([kind, index, size]): [string, () => unknown, string, string] => [
    `ArrayList.get with ${kind}`,
    () => new ArrayList([1, 2, 3].slice(0, size)).get(index),
    'IndexOutOfBoundsError',
    `ArrayList.get: index ${String(index)} is out of bounds for size ${size}`,
  ]),
]

describe('error messages', () => {
  it.each(CASES)(
    '%s throws the same error type and message [043 S1-AC4]',
    (_label, call, type, message) => {
      let thrown: unknown
      try {
        call()
      } catch (error) {
        thrown = error
      }
      expect(thrown).toBeInstanceOf(Error)
      expect((thrown as Error).name).toBe(type)
      expect((thrown as Error).message).toBe(message)
    },
  )

  it.each(SLOW_PATH_CASES)(
    '%s throws the same error type and message [044 S8-AC1] [044 S2-AC2] [044 S7-AC1]',
    (_label, call, type, message) => {
      let thrown: unknown
      try {
        call()
      } catch (error) {
        thrown = error
      }
      expect(thrown).toBeInstanceOf(Error)
      expect((thrown as Error).name).toBe(type)
      expect((thrown as Error).message).toBe(message)
    },
  )
})

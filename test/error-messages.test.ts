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
})

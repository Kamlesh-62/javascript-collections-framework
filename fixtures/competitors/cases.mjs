// The comparison cases: each structure of this library against its counterparts in other
// collection libraries, on the same seeded input. This module imports none of those libraries:
// the runner passes their modules in, so the cases can be read and checked without them.
//
// A side's `run` does one pass of work and returns an order-sensitive checksum of the values it
// polled, read or iterated, mixed with the collection's final size; every side of a case returns
// the same checksum, which the runner checks at every size before timing anything.
//
// A pass is either over all n elements (build, insert, iterate, poll all) or a fixed number of
// operations on a collection that keeps its size (lookups, add-then-take pairs), so the rate is per
// element or per operation and a collection stays the same size for every sample.
//
// Every side's `run` is its own function literal with its own loop, written out in full: a shared
// helper, or closures made by one factory, would share the engine's type feedback between sides
// and slow whichever side runs second.

import { shuffled } from '../../bench/lib/harness.mjs'
import { THIS } from '../../bench/lib/compare.mjs'

export { THIS }

/** The sizes every case runs at. */
export const SIZES = [1_000, 100_000, 1_000_000]

/** Operations per pass for steady-state updates. */
export const OPS = 1_000

/** Keys per pass for lookups: `min(n, LOOKUPS)` distinct present keys. */
export const LOOKUPS = 10_000

/**
 * The other libraries, in the order their sides are timed after this library's, with the
 * packages each is installed as.
 */
export const LIBRARIES = [
  { name: 'js-sdsl', packages: ['js-sdsl'] },
  { name: 'mnemonist', packages: ['mnemonist'] },
  {
    name: '@datastructures-js',
    packages: [
      '@datastructures-js/priority-queue',
      '@datastructures-js/deque',
      '@datastructures-js/linked-list',
    ],
  },
]

/**
 * @typedef {object} Counterpart
 * @property {string} library - One of {@link LIBRARIES}.
 * @property {string} package - The package it is imported from.
 * @property {string} export - The class used.
 * @property {'default' | '(a, b) => a - b'} comparator - The order it is given.
 */

/**
 * @typedef {object} CaseInfo
 * @property {string} name
 * @property {{ export: string, options: string | null }} ours - This library's class and the
 *   options the case gives it (`null`: its defaults).
 * @property {string[]} operations
 * @property {Counterpart[]} others
 * @property {string[]} noCounterpart - Libraries with no counterpart in this case.
 */

/** What each case compares. @type {CaseInfo[]} */
export const CASES = [
  {
    name: 'Sorted map',
    ours: { export: 'TreeMap', options: null },
    operations: [
      'insert',
      'get',
      'nearest key at or below',
      'iterate in order',
      'delete and insert again',
    ],
    others: [
      { library: 'js-sdsl', package: 'js-sdsl', export: 'OrderedMap', comparator: 'default' },
    ],
    noCounterpart: ['mnemonist', '@datastructures-js'],
  },
  {
    name: 'Priority queue',
    ours: { export: 'PriorityQueue', options: null },
    operations: ['build from an array', 'push', 'poll all'],
    others: [
      {
        library: 'js-sdsl',
        package: 'js-sdsl',
        export: 'PriorityQueue',
        comparator: '(a, b) => a - b',
      },
      { library: 'mnemonist', package: 'mnemonist', export: 'Heap', comparator: 'default' },
      {
        library: '@datastructures-js',
        package: '@datastructures-js/priority-queue',
        export: 'MinPriorityQueue',
        comparator: 'default',
      },
    ],
    noCounterpart: [],
  },
  {
    name: 'Deque',
    ours: { export: 'ArrayDeque', options: null },
    operations: ['add at the end, take from the front', 'add at the front, take from the end'],
    others: [
      { library: 'js-sdsl', package: 'js-sdsl', export: 'Deque', comparator: 'default' },
      {
        library: '@datastructures-js',
        package: '@datastructures-js/deque',
        export: 'Deque',
        comparator: 'default',
      },
    ],
    noCounterpart: ['mnemonist'],
  },
  {
    name: 'LRU map',
    ours: { export: 'LinkedHashMap', options: '{ accessOrder: true, maxSize: n }' },
    operations: ['set 2n keys, evicting n', 'get present keys'],
    others: [{ library: 'mnemonist', package: 'mnemonist', export: 'LRUMap', comparator: 'default' }],
    noCounterpart: ['js-sdsl', '@datastructures-js'],
  },
  {
    name: 'Linked list',
    ours: { export: 'LinkedList', options: null },
    operations: ['add at the end', 'add at the end, take from the front'],
    others: [
      { library: 'js-sdsl', package: 'js-sdsl', export: 'LinkList', comparator: 'default' },
      {
        library: '@datastructures-js',
        package: '@datastructures-js/linked-list',
        export: 'DoublyLinkedList',
        comparator: 'default',
      },
    ],
    noCounterpart: ['mnemonist'],
  },
]

/**
 * @typedef {object} Side
 * @property {string} library
 * @property {string} name - The class measured.
 * @property {() => any} setup - Builds the state, outside the timed work.
 * @property {(state: any) => number} run - One pass; returns a checksum.
 */

/**
 * @typedef {object} CompareCase
 * @property {string} case
 * @property {string} operation
 * @property {number} size - Elements in the collection.
 * @property {number} ops - Elements or operations in one pass.
 * @property {Side[]} sides - This library's side first, then the others in {@link LIBRARIES} order.
 */

/**
 * Every case at `size`, with input drawn from `seed`.
 * @param {Record<string, any>} lib - This library's exports.
 * @param {Record<string, any>} others - Each compared package's module, by package name.
 * @param {number} size
 * @param {number} [seed]
 * @returns {CompareCase[]}
 */
export function compareCases(lib, others, size, seed = 47) {
  const { ArrayDeque, LinkedHashMap, LinkedList, PriorityQueue, TreeMap } = lib
  const sdsl = others['js-sdsl']
  const { Heap, LRUMap } = others.mnemonist
  const { MinPriorityQueue } = others['@datastructures-js/priority-queue']
  const DsDeque = others['@datastructures-js/deque'].Deque
  const { DoublyLinkedList } = others['@datastructures-js/linked-list']

  const n = size
  // Keys are 0..n-1 in a seeded order. Lookups read min(n, LOOKUPS) distinct present keys;
  // updates use the first OPS of them.
  const keys = shuffled(n, seed)
  const lookups = shuffled(n, seed + 1).slice(0, Math.min(LOOKUPS, n))
  const reads = lookups.length
  const queries = lookups.slice(0, Math.min(OPS, n))
  const ops = queries.length
  // Sorted keys are even numbers so that odd queries fall between them.
  const evens = keys.map((k) => k * 2)
  const odd = lookups.map((q) => q * 2 + 1)
  // The LRU map is fed 2n keys; the last n set are the ones present when it is full.
  const twice = shuffled(2 * n, seed + 2)
  const present = twice.slice(n)
  const recent = shuffled(n, seed + 3)
    .slice(0, Math.min(LOOKUPS, n))
    .map((i) => /** @type {number} */ (present[i]))

  /** @type {CompareCase[]} */
  const cases = []
  /**
   * @param {string} name
   * @param {string} operation
   * @param {number} count
   * @param {Side[]} sides
   */
  const add = (name, operation, count, sides) => {
    cases.push({ case: name, operation, size, ops: count, sides })
  }
  const none = () => undefined

  // Sorted map: TreeMap against js-sdsl OrderedMap.
  add('Sorted map', 'insert', n, [
    {
      library: THIS,
      name: 'TreeMap',
      setup: none,
      run: () => {
        const m = new TreeMap()
        for (const k of evens) m.set(k, k + 1)
        return m.size
      },
    },
    {
      library: 'js-sdsl',
      name: 'OrderedMap',
      setup: none,
      run: () => {
        const m = new sdsl.OrderedMap()
        for (const k of evens) m.setElement(k, k + 1)
        return m.size()
      },
    },
  ])
  add('Sorted map', 'get', reads, [
    {
      library: THIS,
      name: 'TreeMap',
      setup: () => {
        const m = new TreeMap()
        for (const k of evens) m.set(k, k + 1)
        return m
      },
      run: (m) => {
        let h = 0
        for (const q of lookups) h = (Math.imul(h, 31) + m.get(q * 2)) | 0
        return (Math.imul(h, 31) + m.size) | 0
      },
    },
    {
      library: 'js-sdsl',
      name: 'OrderedMap',
      setup: () => {
        const m = new sdsl.OrderedMap()
        for (const k of evens) m.setElement(k, k + 1)
        return m
      },
      run: (m) => {
        let h = 0
        for (const q of lookups) h = (Math.imul(h, 31) + m.getElementByKey(q * 2)) | 0
        return (Math.imul(h, 31) + m.size()) | 0
      },
    },
  ])
  add('Sorted map', 'nearest key at or below', reads, [
    {
      library: THIS,
      name: 'TreeMap',
      setup: () => {
        const m = new TreeMap()
        for (const k of evens) m.set(k, k + 1)
        return m
      },
      run: (m) => {
        let h = 0
        for (const q of odd) h = (Math.imul(h, 31) + m.floorEntry(q).key) | 0
        return (Math.imul(h, 31) + m.size) | 0
      },
    },
    {
      library: 'js-sdsl',
      name: 'OrderedMap',
      setup: () => {
        const m = new sdsl.OrderedMap()
        for (const k of evens) m.setElement(k, k + 1)
        return m
      },
      run: (m) => {
        let h = 0
        for (const q of odd) h = (Math.imul(h, 31) + m.reverseLowerBound(q).pointer[0]) | 0
        return (Math.imul(h, 31) + m.size()) | 0
      },
    },
  ])
  add('Sorted map', 'iterate in order', n, [
    {
      library: THIS,
      name: 'TreeMap',
      setup: () => {
        const m = new TreeMap()
        for (const k of evens) m.set(k, k + 1)
        return m
      },
      run: (m) => {
        let h = 0
        for (const [k] of m) h = (Math.imul(h, 31) + k) | 0
        return (Math.imul(h, 31) + m.size) | 0
      },
    },
    {
      library: 'js-sdsl',
      name: 'OrderedMap',
      setup: () => {
        const m = new sdsl.OrderedMap()
        for (const k of evens) m.setElement(k, k + 1)
        return m
      },
      run: (m) => {
        let h = 0
        for (const [k] of m) h = (Math.imul(h, 31) + k) | 0
        return (Math.imul(h, 31) + m.size()) | 0
      },
    },
  ])
  add('Sorted map', 'delete and insert again', ops, [
    {
      library: THIS,
      name: 'TreeMap',
      setup: () => {
        const m = new TreeMap()
        for (const k of evens) m.set(k, k + 1)
        return m
      },
      run: (m) => {
        let h = 0
        for (const q of queries) {
          const k = q * 2
          h = (Math.imul(h, 31) + (m.delete(k) ? 1 : 0)) | 0
          m.set(k, k + 1)
        }
        return (Math.imul(h, 31) + m.size) | 0
      },
    },
    {
      library: 'js-sdsl',
      name: 'OrderedMap',
      setup: () => {
        const m = new sdsl.OrderedMap()
        for (const k of evens) m.setElement(k, k + 1)
        return m
      },
      run: (m) => {
        let h = 0
        for (const q of queries) {
          const k = q * 2
          h = (Math.imul(h, 31) + (m.eraseElementByKey(k) ? 1 : 0)) | 0
          m.setElement(k, k + 1)
        }
        return (Math.imul(h, 31) + m.size()) | 0
      },
    },
  ])

  // Priority queue: PriorityQueue against js-sdsl PriorityQueue, mnemonist Heap and
  // @datastructures-js MinPriorityQueue, all least first.
  add('Priority queue', 'build from an array', n, [
    {
      library: THIS,
      name: 'PriorityQueue',
      setup: none,
      // The constructor copies the array.
      run: () => {
        const q = new PriorityQueue(keys)
        return (Math.imul(q.peek(), 31) + q.size) | 0
      },
    },
    {
      library: 'js-sdsl',
      name: 'PriorityQueue',
      setup: none,
      // The constructor copies the array (its `copy` argument defaults to true).
      run: () => {
        const q = new sdsl.PriorityQueue(keys, (/** @type {number} */ a, /** @type {number} */ b) => a - b)
        return (Math.imul(q.top(), 31) + q.size()) | 0
      },
    },
    {
      library: 'mnemonist',
      name: 'Heap',
      setup: none,
      // Heap.from copies the array.
      run: () => {
        const q = Heap.from(keys)
        return (Math.imul(q.peek(), 31) + q.size) | 0
      },
    },
    {
      library: '@datastructures-js',
      name: 'MinPriorityQueue',
      setup: none,
      // fromArray orders the array it is given in place, so it is given a copy.
      run: () => {
        const q = MinPriorityQueue.fromArray(keys.slice())
        return (Math.imul(q.front(), 31) + q.size()) | 0
      },
    },
  ])
  add('Priority queue', 'push', n, [
    {
      library: THIS,
      name: 'PriorityQueue',
      setup: none,
      run: () => {
        const q = new PriorityQueue()
        for (const k of keys) q.add(k)
        return (Math.imul(q.peek(), 31) + q.size) | 0
      },
    },
    {
      library: 'js-sdsl',
      name: 'PriorityQueue',
      setup: none,
      run: () => {
        const q = new sdsl.PriorityQueue([], (/** @type {number} */ a, /** @type {number} */ b) => a - b)
        for (const k of keys) q.push(k)
        return (Math.imul(q.top(), 31) + q.size()) | 0
      },
    },
    {
      library: 'mnemonist',
      name: 'Heap',
      setup: none,
      run: () => {
        const q = new Heap()
        for (const k of keys) q.push(k)
        return (Math.imul(q.peek(), 31) + q.size) | 0
      },
    },
    {
      library: '@datastructures-js',
      name: 'MinPriorityQueue',
      setup: none,
      run: () => {
        const q = new MinPriorityQueue()
        for (const k of keys) q.enqueue(k)
        return (Math.imul(q.front(), 31) + q.size()) | 0
      },
    },
  ])
  add('Priority queue', 'poll all', n, [
    {
      library: THIS,
      name: 'PriorityQueue',
      setup: none,
      run: () => {
        const q = new PriorityQueue(keys)
        let h = 0
        for (let i = 0; i < n; i++) h = (Math.imul(h, 31) + q.poll()) | 0
        return (Math.imul(h, 31) + q.size) | 0
      },
    },
    {
      library: 'js-sdsl',
      name: 'PriorityQueue',
      setup: none,
      run: () => {
        const q = new sdsl.PriorityQueue(keys, (/** @type {number} */ a, /** @type {number} */ b) => a - b)
        let h = 0
        for (let i = 0; i < n; i++) h = (Math.imul(h, 31) + q.pop()) | 0
        return (Math.imul(h, 31) + q.size()) | 0
      },
    },
    {
      library: 'mnemonist',
      name: 'Heap',
      setup: none,
      run: () => {
        const q = Heap.from(keys)
        let h = 0
        for (let i = 0; i < n; i++) h = (Math.imul(h, 31) + q.pop()) | 0
        return (Math.imul(h, 31) + q.size) | 0
      },
    },
    {
      library: '@datastructures-js',
      name: 'MinPriorityQueue',
      setup: none,
      run: () => {
        const q = MinPriorityQueue.fromArray(keys.slice())
        let h = 0
        for (let i = 0; i < n; i++) h = (Math.imul(h, 31) + q.dequeue()) | 0
        return (Math.imul(h, 31) + q.size()) | 0
      },
    },
  ])

  // Deque: ArrayDeque against js-sdsl Deque and @datastructures-js Deque.
  add('Deque', 'add at the end, take from the front', ops, [
    {
      library: THIS,
      name: 'ArrayDeque',
      setup: () => new ArrayDeque(keys),
      run: (d) => {
        let h = 0
        for (const q of queries) {
          d.push(q)
          h = (Math.imul(h, 31) + d.poll()) | 0
        }
        return (Math.imul(h, 31) + d.size) | 0
      },
    },
    {
      library: 'js-sdsl',
      name: 'Deque',
      setup: () => new sdsl.Deque(keys),
      run: (d) => {
        let h = 0
        for (const q of queries) {
          d.pushBack(q)
          h = (Math.imul(h, 31) + d.popFront()) | 0
        }
        return (Math.imul(h, 31) + d.size()) | 0
      },
    },
    {
      library: '@datastructures-js',
      name: 'Deque',
      // The constructor keeps the array it is given, so it is given a copy.
      setup: () => new DsDeque(keys.slice()),
      run: (d) => {
        let h = 0
        for (const q of queries) {
          d.pushBack(q)
          h = (Math.imul(h, 31) + d.popFront()) | 0
        }
        return (Math.imul(h, 31) + d.size()) | 0
      },
    },
  ])
  add('Deque', 'add at the front, take from the end', ops, [
    {
      library: THIS,
      name: 'ArrayDeque',
      setup: () => new ArrayDeque(keys),
      run: (d) => {
        let h = 0
        for (const q of queries) {
          d.addFirst(q)
          h = (Math.imul(h, 31) + d.pop()) | 0
        }
        return (Math.imul(h, 31) + d.size) | 0
      },
    },
    {
      library: 'js-sdsl',
      name: 'Deque',
      setup: () => new sdsl.Deque(keys),
      run: (d) => {
        let h = 0
        for (const q of queries) {
          d.pushFront(q)
          h = (Math.imul(h, 31) + d.popBack()) | 0
        }
        return (Math.imul(h, 31) + d.size()) | 0
      },
    },
    {
      library: '@datastructures-js',
      name: 'Deque',
      setup: () => new DsDeque(keys.slice()),
      run: (d) => {
        let h = 0
        for (const q of queries) {
          d.pushFront(q)
          h = (Math.imul(h, 31) + d.popBack()) | 0
        }
        return (Math.imul(h, 31) + d.size()) | 0
      },
    },
  ])

  // LRU map: LinkedHashMap in access order with maxSize n against mnemonist LRUMap with capacity n.
  add('LRU map', 'set 2n keys, evicting n', 2 * n, [
    {
      library: THIS,
      name: 'LinkedHashMap',
      setup: none,
      run: () => {
        const m = new LinkedHashMap({ accessOrder: true, maxSize: n })
        for (const k of twice) m.set(k, k + 1)
        // The first key set has been evicted.
        return (Math.imul(m.get(twice[0]) ?? -1, 31) + m.size) | 0
      },
    },
    {
      library: 'mnemonist',
      name: 'LRUMap',
      setup: none,
      run: () => {
        const m = new LRUMap(n)
        for (const k of twice) m.set(k, k + 1)
        return (Math.imul(m.get(twice[0]) ?? -1, 31) + m.size) | 0
      },
    },
  ])
  add('LRU map', 'get present keys', recent.length, [
    {
      library: THIS,
      name: 'LinkedHashMap',
      setup: () => {
        const m = new LinkedHashMap({ accessOrder: true, maxSize: n })
        for (const k of twice) m.set(k, k + 1)
        return m
      },
      run: (m) => {
        let h = 0
        for (const k of recent) h = (Math.imul(h, 31) + m.get(k)) | 0
        return (Math.imul(h, 31) + m.size) | 0
      },
    },
    {
      library: 'mnemonist',
      name: 'LRUMap',
      setup: () => {
        const m = new LRUMap(n)
        for (const k of twice) m.set(k, k + 1)
        return m
      },
      run: (m) => {
        let h = 0
        for (const k of recent) h = (Math.imul(h, 31) + m.get(k)) | 0
        return (Math.imul(h, 31) + m.size) | 0
      },
    },
  ])

  // Linked list: LinkedList against js-sdsl LinkList and @datastructures-js DoublyLinkedList.
  add('Linked list', 'add at the end', n, [
    {
      library: THIS,
      name: 'LinkedList',
      setup: none,
      run: () => {
        const l = new LinkedList()
        for (const k of keys) l.push(k)
        return l.size
      },
    },
    {
      library: 'js-sdsl',
      name: 'LinkList',
      setup: none,
      run: () => {
        const l = new sdsl.LinkList()
        for (const k of keys) l.pushBack(k)
        return l.size()
      },
    },
    {
      library: '@datastructures-js',
      name: 'DoublyLinkedList',
      setup: none,
      run: () => {
        const l = new DoublyLinkedList()
        for (const k of keys) l.insertLast(k)
        return l.count()
      },
    },
  ])
  add('Linked list', 'add at the end, take from the front', ops, [
    {
      library: THIS,
      name: 'LinkedList',
      setup: () => new LinkedList(keys),
      run: (l) => {
        let h = 0
        for (const q of queries) {
          l.push(q)
          h = (Math.imul(h, 31) + l.poll()) | 0
        }
        return (Math.imul(h, 31) + l.size) | 0
      },
    },
    {
      library: 'js-sdsl',
      name: 'LinkList',
      setup: () => new sdsl.LinkList(keys),
      run: (l) => {
        let h = 0
        for (const q of queries) {
          l.pushBack(q)
          h = (Math.imul(h, 31) + l.popFront()) | 0
        }
        return (Math.imul(h, 31) + l.size()) | 0
      },
    },
    {
      library: '@datastructures-js',
      name: 'DoublyLinkedList',
      setup: () => {
        const l = new DoublyLinkedList()
        for (const k of keys) l.insertLast(k)
        return l
      },
      run: (l) => {
        let h = 0
        for (const q of queries) {
          l.insertLast(q)
          h = (Math.imul(h, 31) + l.removeFirst().getValue()) | 0
        }
        return (Math.imul(h, 31) + l.count()) | 0
      },
    },
  ])
  return cases
}

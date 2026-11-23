// The benchmark cases: each collection against the closest native structure, on the same seeded
// input. A case's `run` does one pass of work and returns a checksum; the library and native sides
// of a case return the same checksum, which the tests check on small sizes.
//
// A pass is either over all n elements (build, iterate) or a fixed number of operations on a
// collection that keeps its size (lookups, remove-then-add pairs), so the rate is per element or
// per operation and a collection stays the same size for every sample.
//
// Every side's `run` is its own function literal with its own loop, written out in full: a shared
// helper, or closures made by one factory, would share the engine's type feedback between cases
// and slow whichever side runs second.

import { shuffled } from './harness.mjs'

/** The sizes every case runs at. */
export const SIZES = [1_000, 100_000, 1_000_000]

/** Operations per pass for steady-state updates. */
export const OPS = 1_000

/** Keys per pass for lookups: `min(n, LOOKUPS)` distinct present keys. */
export const LOOKUPS = 10_000

/** Native baselines that cost O(n) per operation run only up to this size. */
export const LINEAR_LIMIT = 100_000

/**
 * @typedef {object} Side
 * @property {() => unknown} setup - Builds the state, outside the timed work.
 * @property {(state: any) => number} run - One pass; returns a checksum.
 */

/**
 * @typedef {object} BenchCase
 * @property {string} collection - The library class.
 * @property {string} operation - What one pass does.
 * @property {number} size - Elements in the collection.
 * @property {number} ops - Elements or operations in one pass.
 * @property {Side & { name: string }} native - The native baseline and its name.
 * @property {Side} library
 */

/**
 * Every case at `size`, with input drawn from `seed`.
 * @param {Record<string, any>} lib - The package's exports.
 * @param {number} size
 * @param {number} [seed]
 * @returns {BenchCase[]}
 */
export function benchCases(lib, size, seed = 41) {
  const {
    ArrayDeque,
    ArrayList,
    HashMap,
    HashSet,
    LinkedHashMap,
    LinkedHashSet,
    LinkedList,
    PriorityQueue,
    TreeMap,
    TreeSet,
  } = lib
  const n = size
  const linear = n <= LINEAR_LIMIT
  // Keys are 0..n-1 in a seeded order. Lookups read min(n, LOOKUPS) distinct keys drawn from the
  // same range; updates use the first OPS of them.
  const keys = shuffled(n, seed)
  const lookups = lookupKeys(n, seed + 1)
  const reads = lookups.length
  const queries = lookups.slice(0, Math.min(OPS, n))
  const ops = queries.length
  const entries = keys.map((k) => /** @type {[number, number]} */ ([k, k + 1]))
  // Sorted keys are even numbers so that odd queries fall between them.
  const evens = keys.map((k) => k * 2)
  const sortedEvens = Array.from({ length: n }, (_, i) => i * 2)
  const odd = lookups.map((q) => q * 2 + 1)

  /** @type {BenchCase[]} */
  const cases = []
  /**
   * @param {string} collection
   * @param {string} operation
   * @param {number} count
   * @param {string} nativeName
   * @param {Side} native
   * @param {Side} library
   * @param {boolean} [enabled]
   */
  const add = (collection, operation, count, nativeName, native, library, enabled = true) => {
    if (enabled)
      cases.push({
        collection,
        operation,
        size,
        ops: count,
        native: { name: nativeName, ...native },
        library,
      })
  }
  const none = () => undefined

  // ArrayList and Array.
  add(
    'ArrayList',
    'build from an array',
    n,
    'Array.from',
    { setup: none, run: () => Array.from(keys).length },
    { setup: none, run: () => new ArrayList(keys).size },
  )
  add(
    'ArrayList',
    'add at the end',
    n,
    'Array push',
    {
      setup: none,
      run: () => {
        const a = []
        for (const k of keys) a.push(k)
        return a.length
      },
    },
    {
      setup: none,
      run: () => {
        const l = new ArrayList()
        for (const k of keys) l.add(k)
        return l.size
      },
    },
  )
  add(
    'ArrayList',
    'get by index',
    reads,
    'Array index',
    {
      setup: () => keys.slice(),
      run: (a) => {
        let s = 0
        for (const q of lookups) s += a[q]
        return s
      },
    },
    {
      setup: () => new ArrayList(keys),
      run: (l) => {
        let s = 0
        for (const q of lookups) s += l.get(q)
        return s
      },
    },
  )
  add(
    'ArrayList',
    'iterate',
    n,
    'Array for…of',
    {
      setup: () => keys.slice(),
      run: (a) => {
        let s = 0
        for (const v of a) s += v
        return s
      },
    },
    {
      setup: () => new ArrayList(keys),
      run: (c) => {
        let s = 0
        for (const v of c) s += v
        return s
      },
    },
  )
  add(
    'ArrayList',
    'remove first, add last',
    ops,
    'Array shift and push',
    {
      setup: () => keys.slice(),
      run: (a) => {
        let s = 0
        for (let i = 0; i < ops; i++) {
          const v = a.shift()
          s += v
          a.push(v)
        }
        return s
      },
    },
    {
      setup: () => new ArrayList(keys),
      run: (l) => {
        let s = 0
        for (let i = 0; i < ops; i++) {
          const v = l.removeAt(0)
          s += v
          l.add(v)
        }
        return s
      },
    },
    linear,
  )

  // LinkedList and ArrayDeque against Array used as a queue.
  add(
    'LinkedList',
    'add at the end',
    n,
    'Array push',
    {
      setup: none,
      run: () => {
        const a = []
        for (const k of keys) a.push(k)
        return a.length
      },
    },
    {
      setup: none,
      run: () => {
        const d = new LinkedList()
        for (const k of keys) d.push(k)
        return d.size
      },
    },
  )
  add(
    'LinkedList',
    'take from the front, add at the end',
    ops,
    'Array shift and push',
    {
      setup: () => keys.slice(),
      run: (a) => {
        let s = 0
        for (let i = 0; i < ops; i++) {
          const v = a.shift()
          s += v
          a.push(v)
        }
        return s
      },
    },
    {
      setup: () => new LinkedList(keys),
      run: (d) => {
        let s = 0
        for (let i = 0; i < ops; i++) {
          const v = d.poll()
          s += v
          d.push(v)
        }
        return s
      },
    },
    linear,
  )
  add(
    'LinkedList',
    'add at the front, take from the end',
    ops,
    'Array unshift and pop',
    {
      setup: () => keys.slice(),
      run: (a) => {
        let s = 0
        for (let i = 0; i < ops; i++) {
          const v = a.pop()
          s += v
          a.unshift(v)
        }
        return s
      },
    },
    {
      setup: () => new LinkedList(keys),
      run: (d) => {
        let s = 0
        for (let i = 0; i < ops; i++) {
          const v = d.pop()
          s += v
          d.addFirst(v)
        }
        return s
      },
    },
    linear,
  )
  add(
    'LinkedList',
    'iterate',
    n,
    'Array for…of',
    {
      setup: () => keys.slice(),
      run: (a) => {
        let s = 0
        for (const v of a) s += v
        return s
      },
    },
    {
      setup: () => new LinkedList(keys),
      run: (c) => {
        let s = 0
        for (const v of c) s += v
        return s
      },
    },
  )
  add(
    'ArrayDeque',
    'add at the end',
    n,
    'Array push',
    {
      setup: none,
      run: () => {
        const a = []
        for (const k of keys) a.push(k)
        return a.length
      },
    },
    {
      setup: none,
      run: () => {
        const d = new ArrayDeque()
        for (const k of keys) d.push(k)
        return d.size
      },
    },
  )
  add(
    'ArrayDeque',
    'take from the front, add at the end',
    ops,
    'Array shift and push',
    {
      setup: () => keys.slice(),
      run: (a) => {
        let s = 0
        for (let i = 0; i < ops; i++) {
          const v = a.shift()
          s += v
          a.push(v)
        }
        return s
      },
    },
    {
      setup: () => new ArrayDeque(keys),
      run: (d) => {
        let s = 0
        for (let i = 0; i < ops; i++) {
          const v = d.poll()
          s += v
          d.push(v)
        }
        return s
      },
    },
    linear,
  )
  add(
    'ArrayDeque',
    'add at the front, take from the end',
    ops,
    'Array unshift and pop',
    {
      setup: () => keys.slice(),
      run: (a) => {
        let s = 0
        for (let i = 0; i < ops; i++) {
          const v = a.pop()
          s += v
          a.unshift(v)
        }
        return s
      },
    },
    {
      setup: () => new ArrayDeque(keys),
      run: (d) => {
        let s = 0
        for (let i = 0; i < ops; i++) {
          const v = d.pop()
          s += v
          d.addFirst(v)
        }
        return s
      },
    },
    linear,
  )
  add(
    'ArrayDeque',
    'iterate',
    n,
    'Array for…of',
    {
      setup: () => keys.slice(),
      run: (a) => {
        let s = 0
        for (const v of a) s += v
        return s
      },
    },
    {
      setup: () => new ArrayDeque(keys),
      run: (c) => {
        let s = 0
        for (const v of c) s += v
        return s
      },
    },
  )

  // PriorityQueue against a sorted Array.
  add(
    'PriorityQueue',
    'build from an array',
    n,
    'Array copy and sort',
    {
      setup: none,
      run: () => keys.slice().sort((a, b) => a - b)[0] ?? 0,
    },
    { setup: none, run: () => new PriorityQueue(keys).peek() ?? 0 },
  )
  // The value added back is larger than every value held, so the queue keeps its size and the
  // sorted array keeps its order; both sides see the same values on every pass.
  add(
    'PriorityQueue',
    'take the least, add one',
    ops,
    'sorted Array shift and insert',
    {
      setup: () => keys.slice().sort((a, b) => a - b),
      run: (a) => {
        let s = 0
        for (let i = 0; i < ops; i++) {
          const v = a.shift()
          s += v
          a.splice(lowerBound(a, v + n), 0, v + n)
        }
        return s
      },
    },
    {
      setup: () => new PriorityQueue(keys),
      run: (q) => {
        let s = 0
        for (let i = 0; i < ops; i++) {
          const v = q.poll()
          s += v
          q.add(v + n)
        }
        return s
      },
    },
    linear,
  )

  // HashMap and Map.
  add(
    'HashMap',
    'build from entries',
    n,
    'new Map',
    { setup: none, run: () => new Map(entries).size },
    { setup: none, run: () => new HashMap(entries).size },
  )
  add(
    'HashMap',
    'get',
    reads,
    'Map get',
    {
      setup: () => new Map(entries),
      run: (m) => {
        let s = 0
        for (const q of lookups) s += m.get(q)
        return s
      },
    },
    {
      setup: () => new HashMap(entries),
      run: (m) => {
        let s = 0
        for (const q of lookups) s += m.get(q)
        return s
      },
    },
  )
  add(
    'HashMap',
    'set an existing key',
    ops,
    'Map set',
    {
      setup: () => new Map(entries),
      run: (m) => {
        for (const q of queries) m.set(q, q + 1)
        return m.size
      },
    },
    {
      setup: () => new HashMap(entries),
      run: (m) => {
        for (const q of queries) m.set(q, q + 1)
        return m.size
      },
    },
  )
  add(
    'HashMap',
    'delete and set again',
    ops,
    'Map delete and set',
    {
      setup: () => new Map(entries),
      run: (m) => {
        let s = 0
        for (const q of queries) {
          if (m.delete(q)) s++
          m.set(q, q + 1)
        }
        return s
      },
    },
    {
      setup: () => new HashMap(entries),
      run: (m) => {
        let s = 0
        for (const q of queries) {
          if (m.delete(q)) s++
          m.set(q, q + 1)
        }
        return s
      },
    },
  )
  add(
    'HashMap',
    'iterate',
    n,
    'Map for…of',
    {
      setup: () => new Map(entries),
      run: (m) => {
        let s = 0
        for (const [k] of m) s += k
        return s
      },
    },
    {
      setup: () => new HashMap(entries),
      run: (m) => {
        let s = 0
        for (const [k] of m) s += k
        return s
      },
    },
  )
  const records = lookups.map((id) => ({ id }))
  add(
    'HashMap',
    'get by value with the key option',
    reads,
    'Map get by id',
    {
      setup: () => new Map(entries),
      run: (m) => {
        let s = 0
        for (const r of records) s += m.get(r.id)
        return s
      },
    },
    {
      setup: () =>
        new HashMap(
          keys.map((k) => [{ id: k }, k + 1]),
          { key: (/** @type {{ id: number }} */ r) => r.id },
        ),
      run: (m) => {
        let s = 0
        for (const r of records) s += m.get(r)
        return s
      },
    },
  )

  // HashSet and LinkedHashSet against Set.
  add(
    'HashSet',
    'build from an array',
    n,
    'new Set',
    { setup: none, run: () => new Set(keys).size },
    { setup: none, run: () => new HashSet(keys).size },
  )
  add(
    'HashSet',
    'has',
    reads,
    'Set has',
    {
      setup: () => new Set(keys),
      run: (s) => {
        let c = 0
        for (const q of lookups) if (s.has(q)) c++
        return c
      },
    },
    {
      setup: () => new HashSet(keys),
      run: (s) => {
        let c = 0
        for (const q of lookups) if (s.has(q)) c++
        return c
      },
    },
  )
  add(
    'HashSet',
    'delete and add again',
    ops,
    'Set delete and add',
    {
      setup: () => new Set(keys),
      run: (s) => {
        let c = 0
        for (const q of queries) {
          if (s.delete(q)) c++
          s.add(q)
        }
        return c
      },
    },
    {
      setup: () => new HashSet(keys),
      run: (s) => {
        let c = 0
        for (const q of queries) {
          if (s.delete(q)) c++
          s.add(q)
        }
        return c
      },
    },
  )
  add(
    'HashSet',
    'iterate',
    n,
    'Set for…of',
    {
      setup: () => new Set(keys),
      run: (t) => {
        let s = 0
        for (const v of t) s += v
        return s
      },
    },
    {
      setup: () => new HashSet(keys),
      run: (t) => {
        let s = 0
        for (const v of t) s += v
        return s
      },
    },
  )
  add(
    'LinkedHashSet',
    'build from an array',
    n,
    'new Set',
    { setup: none, run: () => new Set(keys).size },
    { setup: none, run: () => new LinkedHashSet(keys).size },
  )
  add(
    'LinkedHashSet',
    'has',
    reads,
    'Set has',
    {
      setup: () => new Set(keys),
      run: (s) => {
        let c = 0
        for (const q of lookups) if (s.has(q)) c++
        return c
      },
    },
    {
      setup: () => new LinkedHashSet(keys),
      run: (s) => {
        let c = 0
        for (const q of lookups) if (s.has(q)) c++
        return c
      },
    },
  )
  add(
    'LinkedHashSet',
    'delete and add again',
    ops,
    'Set delete and add',
    {
      setup: () => new Set(keys),
      run: (s) => {
        let c = 0
        for (const q of queries) {
          if (s.delete(q)) c++
          s.add(q)
        }
        return c
      },
    },
    {
      setup: () => new LinkedHashSet(keys),
      run: (s) => {
        let c = 0
        for (const q of queries) {
          if (s.delete(q)) c++
          s.add(q)
        }
        return c
      },
    },
  )
  add(
    'LinkedHashSet',
    'iterate',
    n,
    'Set for…of',
    {
      setup: () => new Set(keys),
      run: (t) => {
        let s = 0
        for (const v of t) s += v
        return s
      },
    },
    {
      setup: () => new LinkedHashSet(keys),
      run: (t) => {
        let s = 0
        for (const v of t) s += v
        return s
      },
    },
  )

  // LinkedHashMap against Map.
  add(
    'LinkedHashMap',
    'build from entries',
    n,
    'new Map',
    { setup: none, run: () => new Map(entries).size },
    { setup: none, run: () => new LinkedHashMap(entries).size },
  )
  add(
    'LinkedHashMap',
    'get',
    reads,
    'Map get',
    {
      setup: () => new Map(entries),
      run: (m) => {
        let s = 0
        for (const q of lookups) s += m.get(q)
        return s
      },
    },
    {
      setup: () => new LinkedHashMap(entries),
      run: (m) => {
        let s = 0
        for (const q of lookups) s += m.get(q)
        return s
      },
    },
  )
  add(
    'LinkedHashMap',
    'get in access order (LRU)',
    reads,
    'Map get, delete and set',
    {
      setup: () => new Map(entries),
      run: (m) => {
        let s = 0
        for (const q of lookups) {
          const v = m.get(q)
          if (v !== undefined) {
            m.delete(q)
            m.set(q, v)
            s += v
          }
        }
        return s
      },
    },
    {
      setup: () => new LinkedHashMap(entries, { accessOrder: true }),
      run: (m) => {
        let s = 0
        for (const q of lookups) s += m.get(q) ?? 0
        return s
      },
    },
  )
  add(
    'LinkedHashMap',
    'iterate',
    n,
    'Map for…of',
    {
      setup: () => new Map(entries),
      run: (m) => {
        let s = 0
        for (const [k] of m) s += k
        return s
      },
    },
    {
      setup: () => new LinkedHashMap(entries),
      run: (m) => {
        let s = 0
        for (const [k] of m) s += k
        return s
      },
    },
  )

  // TreeMap and TreeSet against a sorted Array (and Map or Set for exact lookups).
  const evenEntries = evens.map((k) => /** @type {[number, number]} */ ([k, k + 1]))
  add(
    'TreeMap',
    'build from entries',
    n,
    'Array copy and sort',
    {
      setup: none,
      run: () => evenEntries.slice().sort((a, b) => a[0] - b[0]).length,
    },
    { setup: none, run: () => new TreeMap(evenEntries).size },
  )
  add(
    'TreeMap',
    'get',
    reads,
    'Map get',
    {
      setup: () => new Map(evenEntries),
      run: (m) => {
        let s = 0
        for (const q of lookups) s += m.get(q * 2)
        return s
      },
    },
    {
      setup: () => new TreeMap(evenEntries),
      run: (m) => {
        let s = 0
        for (const q of lookups) s += m.get(q * 2)
        return s
      },
    },
  )
  add(
    'TreeMap',
    'floor entry',
    reads,
    'sorted Array bisection',
    {
      setup: () => sortedEvens.slice(),
      run: (a) => {
        let s = 0
        for (const q of odd) s += a[lowerBound(a, q) - 1]
        return s
      },
    },
    {
      setup: () => new TreeMap(evenEntries),
      run: (m) => {
        let s = 0
        for (const q of odd) s += m.floorEntry(q).key
        return s
      },
    },
  )
  add(
    'TreeMap',
    'delete and set again',
    ops,
    'sorted Array splice',
    {
      setup: () => sortedEvens.slice(),
      run: (a) => {
        let s = 0
        for (const q of queries) {
          const k = q * 2
          const at = lowerBound(a, k)
          if (a[at] === k) {
            a.splice(at, 1)
            s++
          }
          a.splice(lowerBound(a, k), 0, k)
        }
        return s
      },
    },
    {
      setup: () => new TreeMap(evenEntries),
      run: (m) => {
        let s = 0
        for (const q of queries) {
          const k = q * 2
          if (m.delete(k)) s++
          m.set(k, k + 1)
        }
        return s
      },
    },
    linear,
  )
  add(
    'TreeMap',
    'iterate',
    n,
    'sorted Array for…of',
    {
      setup: () => sortedEvens.slice(),
      run: (a) => {
        let s = 0
        for (const v of a) s += v
        return s
      },
    },
    {
      setup: () => new TreeMap(evenEntries),
      run: (m) => {
        let s = 0
        for (const [k] of m) s += k
        return s
      },
    },
  )

  add(
    'TreeSet',
    'build from an array',
    n,
    'Array copy and sort',
    {
      setup: none,
      run: () => evens.slice().sort((a, b) => a - b).length,
    },
    { setup: none, run: () => new TreeSet(evens).size },
  )
  add(
    'TreeSet',
    'has',
    reads,
    'Set has',
    {
      setup: () => new Set(evens),
      run: (s) => {
        let c = 0
        for (const q of lookups) if (s.has(q * 2)) c++
        return c
      },
    },
    {
      setup: () => new TreeSet(evens),
      run: (s) => {
        let c = 0
        for (const q of lookups) if (s.has(q * 2)) c++
        return c
      },
    },
  )
  add(
    'TreeSet',
    'ceiling',
    reads,
    'sorted Array bisection',
    {
      setup: () => sortedEvens.slice(),
      run: (a) => {
        let s = 0
        for (const q of odd) s += a[lowerBound(a, q)] ?? -1
        return s
      },
    },
    {
      setup: () => new TreeSet(evens),
      run: (t) => {
        let s = 0
        for (const q of odd) s += t.ceiling(q) ?? -1
        return s
      },
    },
  )
  add(
    'TreeSet',
    'delete and add again',
    ops,
    'sorted Array splice',
    {
      setup: () => sortedEvens.slice(),
      run: (a) => {
        let c = 0
        for (const q of queries) {
          const k = q * 2
          const at = lowerBound(a, k)
          if (a[at] === k) {
            a.splice(at, 1)
            c++
          }
          a.splice(lowerBound(a, k), 0, k)
        }
        return c
      },
    },
    {
      setup: () => new TreeSet(evens),
      run: (t) => {
        let c = 0
        for (const q of queries) {
          const k = q * 2
          if (t.delete(k)) c++
          t.add(k)
        }
        return c
      },
    },
    linear,
  )
  add(
    'TreeSet',
    'iterate',
    n,
    'sorted Array for…of',
    {
      setup: () => sortedEvens.slice(),
      run: (a) => {
        let s = 0
        for (const v of a) s += v
        return s
      },
    },
    {
      setup: () => new TreeSet(evens),
      run: (t) => {
        let s = 0
        for (const v of t) s += v
        return s
      },
    },
  )

  // Further cases: adding one by one, the other lookups and updates.
  add(
    'PriorityQueue',
    'add one by one',
    n,
    'Array push, then sort',
    {
      setup: none,
      run: () => {
        const a = []
        for (const k of keys) a.push(k)
        return a.sort((x, y) => x - y)[0] ?? -1
      },
    },
    {
      setup: none,
      run: () => {
        const q = new PriorityQueue()
        for (const k of keys) q.add(k)
        return q.peek() ?? -1
      },
    },
  )
  add(
    'HashMap',
    'has',
    reads,
    'Map has',
    {
      setup: () => new Map(entries),
      run: (m) => {
        let c = 0
        for (const q of lookups) if (m.has(q)) c++
        return c
      },
    },
    {
      setup: () => new HashMap(entries),
      run: (m) => {
        let c = 0
        for (const q of lookups) if (m.has(q)) c++
        return c
      },
    },
  )
  add(
    'HashMap',
    'set new keys one by one',
    n,
    'Map set',
    {
      setup: none,
      run: () => {
        const m = new Map()
        for (const k of keys) m.set(k, k)
        return m.size
      },
    },
    {
      setup: none,
      run: () => {
        const m = new HashMap()
        for (const k of keys) m.set(k, k)
        return m.size
      },
    },
  )
  add(
    'LinkedHashMap',
    'set new keys one by one',
    n,
    'Map set',
    {
      setup: none,
      run: () => {
        const m = new Map()
        for (const k of keys) m.set(k, k)
        return m.size
      },
    },
    {
      setup: none,
      run: () => {
        const m = new LinkedHashMap()
        for (const k of keys) m.set(k, k)
        return m.size
      },
    },
  )
  add(
    'LinkedHashMap',
    'set an existing key',
    ops,
    'Map set',
    {
      setup: () => new Map(entries),
      run: (m) => {
        for (const q of queries) m.set(q, q + 1)
        return m.size
      },
    },
    {
      setup: () => new LinkedHashMap(entries),
      run: (m) => {
        for (const q of queries) m.set(q, q + 1)
        return m.size
      },
    },
  )
  add(
    'LinkedHashMap',
    'delete and set again',
    ops,
    'Map delete and set',
    {
      setup: () => new Map(entries),
      run: (m) => {
        let c = 0
        for (const q of queries) {
          if (m.delete(q)) c++
          m.set(q, q + 1)
        }
        return c
      },
    },
    {
      setup: () => new LinkedHashMap(entries),
      run: (m) => {
        let c = 0
        for (const q of queries) {
          if (m.delete(q)) c++
          m.set(q, q + 1)
        }
        return c
      },
    },
  )
  // Front reads take one native iterator per map or set and keep it, as a queue does; a fresh
  // `keys()` per read would skip every deleted slot at the front of the native table each time.
  add(
    'LinkedHashMap',
    'take the first entry',
    ops,
    'Map keys().next() and delete',
    {
      setup: () => {
        const m = new Map(entries)
        return { m, first: m.keys(), next: n }
      },
      run: (t) => {
        let c = 0
        for (let i = 0; i < ops; i++) {
          const k = t.first.next().value
          t.m.delete(k)
          c += k
          t.m.set(t.next, t.next)
          t.next++
        }
        return c
      },
    },
    {
      setup: () => ({ m: new LinkedHashMap(entries), next: n }),
      run: (t) => {
        let c = 0
        for (let i = 0; i < ops; i++) {
          c += t.m.pollFirstEntry().key
          t.m.set(t.next, t.next)
          t.next++
        }
        return c
      },
    },
  )
  add(
    'LinkedHashMap',
    'set new keys with maxSize',
    n,
    'Map set and delete the first key',
    {
      setup: none,
      run: () => {
        const m = new Map()
        const first = m.keys()
        const cap = Math.max(1, n >> 1)
        for (const k of keys) {
          m.set(k, k)
          if (m.size > cap) m.delete(first.next().value)
        }
        return m.size
      },
    },
    {
      setup: none,
      run: () => {
        const m = new LinkedHashMap({ maxSize: Math.max(1, n >> 1) })
        for (const k of keys) m.set(k, k)
        return m.size
      },
    },
  )
  add(
    'HashSet',
    'add one by one',
    n,
    'Set add',
    {
      setup: none,
      run: () => {
        const t = new Set()
        for (const k of keys) t.add(k)
        return t.size
      },
    },
    {
      setup: none,
      run: () => {
        const t = new HashSet()
        for (const k of keys) t.add(k)
        return t.size
      },
    },
  )
  add(
    'LinkedHashSet',
    'add one by one',
    n,
    'Set add',
    {
      setup: none,
      run: () => {
        const t = new Set()
        for (const k of keys) t.add(k)
        return t.size
      },
    },
    {
      setup: none,
      run: () => {
        const t = new LinkedHashSet()
        for (const k of keys) t.add(k)
        return t.size
      },
    },
  )
  add(
    'LinkedHashSet',
    'take the first',
    ops,
    'Set values().next() and delete',
    {
      setup: () => {
        const s = new Set(keys)
        return { s, first: s.values(), next: n }
      },
      run: (t) => {
        let c = 0
        for (let i = 0; i < ops; i++) {
          const v = t.first.next().value
          t.s.delete(v)
          c += v
          t.s.add(t.next)
          t.next++
        }
        return c
      },
    },
    {
      setup: () => ({ s: new LinkedHashSet(keys), next: n }),
      run: (t) => {
        let c = 0
        for (let i = 0; i < ops; i++) {
          c += t.s.removeFirst()
          t.s.add(t.next)
          t.next++
        }
        return c
      },
    },
  )
  add(
    'TreeMap',
    'set new keys in seeded order',
    n,
    'sorted Array insert',
    {
      setup: none,
      run: () => {
        /** @type {number[]} */
        const a = []
        for (const k of evens) a.splice(lowerBound(a, k), 0, k)
        return a.length
      },
    },
    {
      setup: none,
      run: () => {
        const m = new TreeMap()
        for (const k of evens) m.set(k, k + 1)
        return m.size
      },
    },
    linear,
  )
  add(
    'TreeMap',
    'ceiling entry',
    reads,
    'sorted Array bisection',
    {
      setup: () => sortedEvens.slice(),
      run: (a) => {
        let s = 0
        for (const q of odd) s += a[lowerBound(a, q)] ?? -1
        return s
      },
    },
    {
      setup: () => new TreeMap(evenEntries),
      run: (m) => {
        let s = 0
        for (const q of odd) s += m.ceilingEntry(q)?.key ?? -1
        return s
      },
    },
  )
  add(
    'TreeSet',
    'add one by one',
    n,
    'sorted Array insert',
    {
      setup: none,
      run: () => {
        /** @type {number[]} */
        const a = []
        for (const k of evens) a.splice(lowerBound(a, k), 0, k)
        return a.length
      },
    },
    {
      setup: none,
      run: () => {
        const t = new TreeSet()
        for (const k of evens) t.add(k)
        return t.size
      },
    },
    linear,
  )
  add(
    'TreeSet',
    'floor',
    reads,
    'sorted Array bisection',
    {
      setup: () => sortedEvens.slice(),
      run: (a) => {
        let s = 0
        for (const q of odd) s += a[lowerBound(a, q) - 1] ?? -1
        return s
      },
    },
    {
      setup: () => new TreeSet(evens),
      run: (t) => {
        let s = 0
        for (const q of odd) s += t.floor(q) ?? -1
        return s
      },
    },
  )

  return cases
}

/**
 * The keys a lookup case reads: `min(n, LOOKUPS)` distinct keys of 0..n-1 in a seeded order.
 * @param {number} n
 * @param {number} seed
 * @returns {number[]}
 */
export function lookupKeys(n, seed) {
  return shuffled(n, seed).slice(0, Math.min(LOOKUPS, n))
}

/**
 * The first index of sorted `a` whose value is not less than `x`.
 * @param {readonly number[]} a
 * @param {number} x
 * @returns {number}
 */
export function lowerBound(a, x) {
  let lo = 0
  let hi = a.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (/** @type {number} */ (a[mid]) < x) lo = mid + 1
    else hi = mid
  }
  return lo
}

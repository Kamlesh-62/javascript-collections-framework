// The benchmark cases: each collection against the closest native structure, on the same seeded
// input. A case's `run` does one pass of work and returns a checksum; the library and native sides
// of a case return the same checksum, which the tests check on small sizes.
//
// A pass is either over all n elements (build, iterate) or a fixed number of operations on a
// collection that keeps its size (lookups, remove-then-add pairs), so the rate is per element or
// per operation and a collection stays the same size for every sample.

import { shuffled } from './harness.mjs'

/** The sizes every case runs at. */
export const SIZES = [1_000, 100_000, 1_000_000]

/** Operations per pass for lookups and steady-state updates. */
export const OPS = 1_000

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
  // Keys are 0..n-1 in a seeded order; queries are OPS keys drawn from the same range.
  const keys = shuffled(n, seed)
  const queries = shuffled(n, seed + 1).slice(0, Math.min(OPS, n))
  const ops = queries.length
  const entries = keys.map((k) => /** @type {[number, number]} */ ([k, k + 1]))
  // Sorted keys are even numbers so that odd queries fall between them.
  const evens = keys.map((k) => k * 2)
  const sortedEvens = Array.from({ length: n }, (_, i) => i * 2)
  const odd = queries.map((q) => q * 2 + 1)

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
  /** @param {Iterable<number>} it */
  const sum = (it) => {
    let s = 0
    for (const v of it) s += v
    return s
  }

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
    ops,
    'Array index',
    {
      setup: () => keys.slice(),
      run: (a) => {
        let s = 0
        for (const q of queries) s += a[q]
        return s
      },
    },
    {
      setup: () => new ArrayList(keys),
      run: (l) => {
        let s = 0
        for (const q of queries) s += l.get(q)
        return s
      },
    },
  )
  add(
    'ArrayList',
    'iterate',
    n,
    'Array for…of',
    { setup: () => keys.slice(), run: sum },
    { setup: () => new ArrayList(keys), run: sum },
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
  for (const [name, Deque] of /** @type {const} */ ([
    ['LinkedList', LinkedList],
    ['ArrayDeque', ArrayDeque],
  ])) {
    add(
      name,
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
          const d = new Deque()
          for (const k of keys) d.push(k)
          return d.size
        },
      },
    )
    add(
      name,
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
        setup: () => new Deque(keys),
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
      name,
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
        setup: () => new Deque(keys),
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
      name,
      'iterate',
      n,
      'Array for…of',
      { setup: () => keys.slice(), run: sum },
      { setup: () => new Deque(keys), run: sum },
    )
  }

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
    ops,
    'Map get',
    {
      setup: () => new Map(entries),
      run: (m) => {
        let s = 0
        for (const q of queries) s += m.get(q)
        return s
      },
    },
    {
      setup: () => new HashMap(entries),
      run: (m) => {
        let s = 0
        for (const q of queries) s += m.get(q)
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
  const records = queries.map((id) => ({ id }))
  add(
    'HashMap',
    'get by value with the key option',
    ops,
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
  for (const [name, SetClass] of /** @type {const} */ ([
    ['HashSet', HashSet],
    ['LinkedHashSet', LinkedHashSet],
  ])) {
    add(
      name,
      'build from an array',
      n,
      'new Set',
      { setup: none, run: () => new Set(keys).size },
      { setup: none, run: () => new SetClass(keys).size },
    )
    add(
      name,
      'has',
      ops,
      'Set has',
      {
        setup: () => new Set(keys),
        run: (s) => {
          let c = 0
          for (const q of queries) if (s.has(q)) c++
          return c
        },
      },
      {
        setup: () => new SetClass(keys),
        run: (s) => {
          let c = 0
          for (const q of queries) if (s.has(q)) c++
          return c
        },
      },
    )
    add(
      name,
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
        setup: () => new SetClass(keys),
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
      name,
      'iterate',
      n,
      'Set for…of',
      { setup: () => new Set(keys), run: sum },
      { setup: () => new SetClass(keys), run: sum },
    )
  }

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
    ops,
    'Map get',
    {
      setup: () => new Map(entries),
      run: (m) => {
        let s = 0
        for (const q of queries) s += m.get(q)
        return s
      },
    },
    {
      setup: () => new LinkedHashMap(entries),
      run: (m) => {
        let s = 0
        for (const q of queries) s += m.get(q)
        return s
      },
    },
  )
  add(
    'LinkedHashMap',
    'get in access order (LRU)',
    ops,
    'Map get, delete and set',
    {
      setup: () => new Map(entries),
      run: (m) => {
        let s = 0
        for (const q of queries) {
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
        for (const q of queries) s += m.get(q) ?? 0
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
    ops,
    'Map get',
    {
      setup: () => new Map(evenEntries),
      run: (m) => {
        let s = 0
        for (const q of queries) s += m.get(q * 2)
        return s
      },
    },
    {
      setup: () => new TreeMap(evenEntries),
      run: (m) => {
        let s = 0
        for (const q of queries) s += m.get(q * 2)
        return s
      },
    },
  )
  add(
    'TreeMap',
    'floor entry',
    ops,
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
      run: sum,
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
    ops,
    'Set has',
    {
      setup: () => new Set(evens),
      run: (s) => {
        let c = 0
        for (const q of queries) if (s.has(q * 2)) c++
        return c
      },
    },
    {
      setup: () => new TreeSet(evens),
      run: (s) => {
        let c = 0
        for (const q of queries) if (s.has(q * 2)) c++
        return c
      },
    },
  )
  add(
    'TreeSet',
    'ceiling',
    ops,
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
    { setup: () => sortedEvens.slice(), run: sum },
    { setup: () => new TreeSet(evens), run: sum },
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
    ops,
    'Map has',
    {
      setup: () => new Map(entries),
      run: (m) => {
        let c = 0
        for (const q of queries) if (m.has(q)) c++
        return c
      },
    },
    {
      setup: () => new HashMap(entries),
      run: (m) => {
        let c = 0
        for (const q of queries) if (m.has(q)) c++
        return c
      },
    },
  )
  for (const [name, MapClass] of /** @type {const} */ ([
    ['HashMap', HashMap],
    ['LinkedHashMap', LinkedHashMap],
  ])) {
    add(
      name,
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
          const m = new MapClass()
          for (const k of keys) m.set(k, k)
          return m.size
        },
      },
    )
  }
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
  for (const [name, SetClass] of /** @type {const} */ ([
    ['HashSet', HashSet],
    ['LinkedHashSet', LinkedHashSet],
  ])) {
    add(
      name,
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
          const t = new SetClass()
          for (const k of keys) t.add(k)
          return t.size
        },
      },
    )
  }
  /** Inserts every key of `evens` into a sorted array by bisection. */
  const sortedInsert = () => {
    /** @type {number[]} */
    const a = []
    for (const k of evens) a.splice(lowerBound(a, k), 0, k)
    return a.length
  }
  add(
    'TreeMap',
    'set new keys in seeded order',
    n,
    'sorted Array insert',
    { setup: none, run: sortedInsert },
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
    ops,
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
    { setup: none, run: sortedInsert },
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
    ops,
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

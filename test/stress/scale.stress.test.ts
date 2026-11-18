import { assert, describe, expect, it } from 'vitest'
import {
  ArrayDeque,
  ArrayList,
  asList,
  HashMap,
  HashSet,
  LinkedHashMap,
  LinkedHashSet,
  LinkedList,
  newSetFromMap,
  PriorityQueue,
  TreeMap,
  TreeSet,
} from '../../src/index'
import type { Collection } from '../../src/interfaces/collection'
import type { MapCollection } from '../../src/interfaces/map'
import { integer, seeded } from '../support/random'
import { expectSameSequence } from '../support/sequence'
import { SCALE } from './config'

const N = SCALE.elements

/** The i-th value of a fixed permutation of 0 … N − 1, so inserts arrive out of order. */
const scrambled = (i: number): number => (i * 7_919) % N

/** A cheap check for loops over a million elements: fails with both values. */
function same(actual: unknown, expected: unknown, at: string): void {
  if (!Object.is(actual, expected)) assert.fail(`${at}: got ${actual}, reference has ${expected}`)
}

interface SequenceSubject {
  /** Builds the empty collection. */
  make: () => Collection<number> & {
    cursor(): { hasNext(): boolean; next(): number; remove(): void }
  }
  /** Reads by index (lists), or `undefined` for deques, which are queried with `has`. */
  get?: (c: never, index: number) => number
  /** Whether a removal in the middle shifts elements (array-backed). */
  shifts: boolean
  /** Removes at the ends; `front` is `undefined` where removing at the front shifts everything. */
  ends: {
    front?: (c: never) => number | undefined
    back: (c: never) => number | undefined
  }
}

/** Fill, query, iterate, `removeIf`, a cursor pass, end removals and a drain, against an array. */
function checkSequence(name: string, subject: SequenceSubject): void {
  const random = seeded(1)
  const c = subject.make()
  let reference: number[] = []
  for (let i = 0; i < N; i++) {
    const x = scrambled(i)
    c.add(x)
    reference.push(x)
  }
  expect(c.size, name).toBe(N)

  const get = subject.get
  if (get !== undefined) {
    for (let q = 0; q < SCALE.queries; q++) {
      const i = integer(random, 0, reference.length - 1)
      same(get(c as never, i), reference[i], `${name} get(${i})`)
    }
  } else {
    for (let q = 0; q < SCALE.linearQueries; q++) {
      const x = integer(random, 0, 2 * N)
      same(c.has(x), x < N, `${name} has(${x})`)
    }
  }
  expectSameSequence([...c], reference, `${name} iteration`)

  expect(
    c.removeIf((x) => x % 10 === 0),
    name,
  ).toBe(true)
  reference = reference.filter((x) => x % 10 !== 0)
  expectSameSequence(c.toArray(), reference, `${name} after removeIf`)

  // A cursor pass: array-backed collections remove only near the end, so the pass stays linear.
  const from = subject.shifts ? reference.length - SCALE.queries : 0
  const cursor = c.cursor()
  let index = 0
  while (cursor.hasNext()) {
    const x = cursor.next()
    if (index >= from && x % 7 === 0) cursor.remove()
    index++
  }
  reference = reference.filter((x, i) => i < from || x % 7 !== 0)
  expectSameSequence(c.toArray(), reference, `${name} after the cursor pass`)

  for (let q = 0; q < SCALE.queries; q++) {
    same(subject.ends.back(c as never), reference.pop(), `${name} back removal ${q}`)
    const front = subject.ends.front
    if (front !== undefined) same(front(c as never), reference.shift(), `${name} front ${q}`)
  }
  expectSameSequence(c.toArray(), reference, `${name} after end removals`)

  while (reference.length > 0) same(subject.ends.back(c as never), reference.pop(), `${name} drain`)
  expect(c.size, name).toBe(0)
  expect(c.isEmpty(), name).toBe(true)
}

interface SetSubject {
  make: () => Collection<number>
  /** Iteration follows insertion (`insertion`) or ascending order (`sorted`). */
  order: 'insertion' | 'sorted'
  ends?: { first: (c: never) => number | undefined; last: (c: never) => number | undefined }
}

function checkSet(name: string, subject: SetSubject): void {
  const random = seeded(2)
  const c = subject.make()
  const members = new Set<number>()
  for (let i = 0; i < N; i++) {
    const x = scrambled(i)
    c.add(x)
    members.add(x)
  }
  let reference = subject.order === 'insertion' ? [...members] : [...members].sort((a, b) => a - b)
  expect(c.size, name).toBe(N)
  for (let q = 0; q < SCALE.queries; q++) {
    const x = integer(random, 0, 2 * N)
    same(c.has(x), members.has(x), `${name} has(${x})`)
  }
  expectSameSequence([...c], reference, `${name} iteration`)

  expect(
    c.removeIf((x) => x % 10 === 0),
    name,
  ).toBe(true)
  reference = reference.filter((x) => x % 10 !== 0)
  expectSameSequence(c.toArray(), reference, `${name} after removeIf`)

  const cursor = c.cursor()
  while (cursor.hasNext()) if (cursor.next() % 7 === 0) cursor.remove()
  reference = reference.filter((x) => x % 7 !== 0)
  expectSameSequence(c.toArray(), reference, `${name} after the cursor pass`)

  const ends = subject.ends
  if (ends !== undefined) {
    for (let q = 0; q < SCALE.queries; q++) {
      same(ends.first(c as never), reference.shift(), `${name} first ${q}`)
      same(ends.last(c as never), reference.pop(), `${name} last ${q}`)
    }
    expectSameSequence(c.toArray(), reference, `${name} after end removals`)
  }

  for (const x of reference) same(c.delete(x), true, `${name} drain delete(${x})`)
  expect(c.size, name).toBe(0)
  expect([...c], name).toEqual([])
}

interface MapSubject {
  make: () => MapCollection<number, number>
  order: 'insertion' | 'sorted'
  ends?: {
    first: (m: never) => { key: number; value: number } | undefined
    last: (m: never) => { key: number; value: number } | undefined
  }
}

function checkMap(name: string, subject: MapSubject): void {
  const random = seeded(3)
  const m = subject.make()
  for (let i = 0; i < N; i++) m.set(scrambled(i), scrambled(i) * 2)
  let keys = Array.from({ length: N }, (_, i) => scrambled(i))
  if (subject.order === 'sorted') keys.sort((a, b) => a - b)
  const pairs = () => keys.map((k) => [k, k * 2])
  expect(m.size, name).toBe(N)
  for (let q = 0; q < SCALE.queries; q++) {
    const x = integer(random, 0, 2 * N)
    same(m.get(x), x < N ? x * 2 : undefined, `${name} get(${x})`)
  }
  expectSameSequence([...m.entries()], pairs(), `${name} iteration`)

  expect(
    m.keySet().removeIf((k) => k % 10 === 0),
    name,
  ).toBe(true)
  keys = keys.filter((k) => k % 10 !== 0)
  expectSameSequence([...m.entries()], pairs(), `${name} after removeIf`)

  const cursor = m.keySet().cursor()
  while (cursor.hasNext()) if (cursor.next() % 7 === 0) cursor.remove()
  keys = keys.filter((k) => k % 7 !== 0)
  expectSameSequence([...m.entries()], pairs(), `${name} after the cursor pass`)

  const ends = subject.ends
  if (ends !== undefined) {
    for (let q = 0; q < SCALE.queries; q++) {
      same(ends.first(m as never)?.key, keys.shift(), `${name} first ${q}`)
      same(ends.last(m as never)?.key, keys.pop(), `${name} last ${q}`)
    }
    expectSameSequence([...m.keys()], keys, `${name} after end removals`)
  }

  for (const k of keys) same(m.delete(k), true, `${name} drain delete(${k})`)
  expect(m.size, name).toBe(0)
  expect([...m.entries()], name).toEqual([])
}

// One test per class, so each million-element collection can be collected before the next.
describe('a million elements', () => {
  const title = (name: string) =>
    `${name}: fills, queries, iterates, removes and drains a million elements as the reference does [033 S1-AC1]`

  it(title('ArrayList'), () => {
    checkSequence('ArrayList', {
      make: () => new ArrayList<number>(),
      get: (c: ArrayList<number>, i) => c.get(i),
      shifts: true,
      ends: { back: (c: ArrayList<number>) => c.removeLast() },
    })
  })

  it(title('asList'), () => {
    checkSequence('asList', {
      make: () => asList<number>([]) as never,
      get: (c: ArrayList<number>, i) => c.get(i),
      shifts: true,
      ends: { back: (c: ArrayList<number>) => c.removeLast() },
    })
  })

  it(title('LinkedList'), () => {
    checkSequence('LinkedList', {
      make: () => new LinkedList<number>(),
      shifts: false,
      ends: {
        front: (c: LinkedList<number>) => c.removeFirst(),
        back: (c: LinkedList<number>) => c.removeLast(),
      },
    })
  })

  it(title('ArrayDeque'), () => {
    checkSequence('ArrayDeque', {
      make: () => new ArrayDeque<number>(),
      shifts: true,
      ends: {
        front: (c: ArrayDeque<number>) => c.poll(),
        back: (c: ArrayDeque<number>) => c.pop(),
      },
    })
  })

  it(title('PriorityQueue'), () => {
    const random = seeded(4)
    const q = new PriorityQueue<number>()
    for (let i = 0; i < N; i++) q.add(scrambled(i))
    expect(q.size).toBe(N)
    // The reference is the ascending order the queue must drain in.
    let reference = Array.from({ length: N }, (_, i) => i)
    for (let k = 0; k < SCALE.queries; k++) {
      const x = integer(random, 0, 2 * N)
      if (k < SCALE.linearQueries) same(q.has(x), x < N, `PriorityQueue has(${x})`)
      same(q.peek(), 0, 'PriorityQueue peek')
    }
    expectSameSequence(
      [...q].sort((a, b) => a - b),
      reference,
      'PriorityQueue iteration as a multiset',
    )
    expect(q.removeIf((x) => x % 10 === 0)).toBe(true)
    reference = reference.filter((x) => x % 10 !== 0)
    const cursor = q.cursor()
    while (cursor.hasNext()) if (cursor.next() % 7 === 0) cursor.remove()
    reference = reference.filter((x) => x % 7 !== 0)
    expect(q.size).toBe(reference.length)
    for (const expected of reference) same(q.poll(), expected, 'PriorityQueue drain')
    expect(q.poll()).toBeUndefined()
    expect(q.size).toBe(0)
  })

  it(title('HashSet'), () => {
    checkSet('HashSet', { make: () => new HashSet<number>(), order: 'insertion' })
  })

  it(title('LinkedHashSet'), () => {
    checkSet('LinkedHashSet', {
      make: () => new LinkedHashSet<number>(),
      order: 'insertion',
      ends: {
        first: (c: LinkedHashSet<number>) => c.removeFirst(),
        last: (c: LinkedHashSet<number>) => c.removeLast(),
      },
    })
  })

  it(title('TreeSet'), () => {
    checkSet('TreeSet', {
      make: () => new TreeSet<number>(),
      order: 'sorted',
      ends: {
        first: (c: TreeSet<number>) => c.pollFirst(),
        last: (c: TreeSet<number>) => c.pollLast(),
      },
    })
  })

  it(title('newSetFromMap'), () => {
    checkSet('newSetFromMap', {
      make: () => newSetFromMap(new LinkedHashMap<number, boolean>()),
      order: 'insertion',
    })
  })

  it(title('HashMap'), () => {
    checkMap('HashMap', { make: () => new HashMap<number, number>(), order: 'insertion' })
  })

  it(title('LinkedHashMap'), () => {
    checkMap('LinkedHashMap', {
      make: () => new LinkedHashMap<number, number>(),
      order: 'insertion',
      ends: {
        first: (m: LinkedHashMap<number, number>) => m.pollFirstEntry(),
        last: (m: LinkedHashMap<number, number>) => m.pollLastEntry(),
      },
    })
  })

  it(title('TreeMap'), () => {
    checkMap('TreeMap', {
      make: () => new TreeMap<number, number>(),
      order: 'sorted',
      ends: {
        first: (m: TreeMap<number, number>) => m.pollFirstEntry(),
        last: (m: TreeMap<number, number>) => m.pollLastEntry(),
      },
    })
  })
})

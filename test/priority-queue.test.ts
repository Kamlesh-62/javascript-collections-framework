import { readFileSync } from 'node:fs'
import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import { ArrayDeque } from '../src/collections/array-deque'
import { PriorityQueue } from '../src/collections/priority-queue'
import {
  ClassCastError,
  type Comparator,
  ConcurrentModificationError,
  compareSymbol,
  equalsSymbol,
  hashCode,
  NullElementError,
} from '../src/index'
import { describeCollection } from './contracts/collection'
import { describeQueue } from './contracts/queue'
import { integer, seeded } from './support/random'
import { runPriorityQueueReferenceModel } from './support/reference-model'

function caught(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  return undefined
}

function messageOf(fn: () => unknown): string {
  return (caught(fn) as Error).message
}

/** Removes every element with `poll` and returns them in the order polled. */
function drain<E>(queue: PriorityQueue<E>): E[] {
  const out: E[] = []
  while (!queue.isEmpty()) out.push(queue.poll() as E)
  return out
}

const ascending = (a: number, b: number): number => a - b

/** A comparator that counts its calls. */
function counting<T>(compare: Comparator<T>): { comparator: Comparator<T>; calls: () => number } {
  let calls = 0
  return {
    comparator: (a, b) => {
      calls++
      return compare(a, b)
    },
    calls: () => calls,
  }
}

/** A value ordered by `[compareSymbol]`, counting every call made through the protocol. */
class Ranked {
  static calls = 0
  constructor(readonly rank: number) {}
  [compareSymbol](other: Ranked): number {
    Ranked.calls++
    return this.rank - other.rank
  }
}

/** The floor of the base-2 logarithm of a positive integer. */
function log2(n: number): number {
  return Math.floor(Math.log2(n))
}

/** Sorted, reverse-sorted and seeded random sequences of `n` distinct numbers. */
function sequences(n: number, seed: number): Array<[string, number[]]> {
  const sorted = Array.from({ length: n }, (_, i) => i)
  const random = seeded(seed)
  const shuffled = sorted.slice()
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = integer(random, 0, i)
    const t = shuffled[i] as number
    shuffled[i] = shuffled[j] as number
    shuffled[j] = t
  }
  return [
    ['sorted', sorted],
    ['reverse', sorted.slice().reverse()],
    ['random', shuffled],
  ]
}

/** Counts the occurrences of each value. */
function multiset<T>(values: Iterable<T>): Map<T, number> {
  const counts = new Map<T, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return counts
}

describe('PriorityQueue — least element first', () => {
  it('polls elements added in any order in non-decreasing order [010 S1-AC1]', () => {
    const random = seeded(7)
    const values = Array.from({ length: 300 }, () => integer(random, -50, 50))
    const natural = new PriorityQueue<number>()
    const reversed = new PriorityQueue<number>({ comparator: (a, b) => b - a })
    for (const v of values) {
      natural.add(v)
      reversed.add(v)
    }
    expect(drain(natural)).toEqual(values.slice().sort(ascending))
    expect(drain(reversed)).toEqual(values.slice().sort((a, b) => b - a))
    const words = new PriorityQueue(['pear', 'apple', 'fig'])
    expect(drain(words)).toEqual(['apple', 'fig', 'pear'])
  })

  it('peek returns the element the next poll returns, without removing it [010 S1-AC2]', () => {
    const queue = new PriorityQueue([4, 2, 9, 1])
    while (!queue.isEmpty()) {
      const size = queue.size
      const next = queue.peek()
      expect(queue.size).toBe(size)
      expect(queue.poll()).toBe(next)
    }
    expect(queue.peek()).toBeUndefined()
  })

  it('poll on an empty queue returns undefined and changes nothing [010 S1-AC3]', () => {
    const queue = new PriorityQueue<number>()
    const revision = queue.revision
    expect(queue.poll()).toBeUndefined()
    expect(queue.size).toBe(0)
    expect(queue.revision).toBe(revision)
  })

  it('orders by the comparator option, otherwise by natural order [010 S1-AC4]', () => {
    const byLength = new PriorityQueue(['ccc', 'a', 'bb'], {
      comparator: (a, b) => a.length - b.length,
    })
    expect(drain(byLength)).toEqual(['a', 'bb', 'ccc'])
    const dates = new PriorityQueue([new Date(3), new Date(1), new Date(2)])
    expect(drain(dates).map((d) => d.getTime())).toEqual([1, 2, 3])
    const ranked = new PriorityQueue([new Ranked(3), new Ranked(1), new Ranked(2)])
    expect(drain(ranked).map((r) => r.rank)).toEqual([1, 2, 3])
  })

  it('comparator() returns the comparator given, or undefined for natural order [010 S1-AC5]', () => {
    const comparator = (a: number, b: number) => b - a
    expect(new PriorityQueue({ comparator }).comparator()).toBe(comparator)
    expect(new PriorityQueue([1], { comparator }).comparator()).toBe(comparator)
    expect(new PriorityQueue().comparator()).toBeUndefined()
    expect(new PriorityQueue([1]).comparator()).toBeUndefined()
    expect(new PriorityQueue({}).comparator()).toBeUndefined()
  })

  it('delete removes one SameValueZero-equal element and keeps later polls in order; has finds it [010 S1-AC6]', () => {
    const queue = new PriorityQueue<number>([5, Number.NaN, 1, 3, 3, -0, 8])
    expect(queue.has(Number.NaN)).toBe(true)
    expect(queue.has(0)).toBe(true)
    expect(queue.has(4)).toBe(false)
    expect(queue.delete(Number.NaN)).toBe(true)
    expect(queue.has(Number.NaN)).toBe(false)
    expect(queue.delete(3)).toBe(true)
    expect(queue.has(3)).toBe(true)
    expect(queue.delete(0)).toBe(true)
    expect(queue.delete(4)).toBe(false)
    expect(queue.size).toBe(4)
    expect(drain(queue)).toEqual([1, 3, 5, 8])

    const a = { rank: 1 }
    const b = { rank: 1 }
    const objects = new PriorityQueue([a, b], { comparator: (x, y) => x.rank - y.rank })
    expect(objects.delete({ rank: 1 })).toBe(false)
    expect(objects.delete(b)).toBe(true)
    expect(objects.toArray()).toEqual([a])
    expect(objects.toArray()[0]).toBe(a)

    const random = seeded(11)
    const values = Array.from({ length: 200 }, () => integer(random, 0, 60))
    const big = new PriorityQueue(values)
    const model = values.slice()
    for (let i = 0; i < 80; i++) {
      const v = integer(random, 0, 60)
      const index = model.indexOf(v)
      expect(big.delete(v)).toBe(index >= 0)
      if (index >= 0) model.splice(index, 1)
    }
    expect(drain(big)).toEqual(model.sort(ascending))
  })

  it('add returns the queue, so calls chain [010 S1-AC7]', () => {
    const queue = new PriorityQueue<number>()
    expect(queue.add(3)).toBe(queue)
    queue.add(1).add(2)
    expect(drain(queue)).toEqual([1, 2, 3])
  })
})

describe('PriorityQueue — bad values and bad comparators', () => {
  it('rejects null and undefined before changing anything [010 S2-AC1]', () => {
    const queue = new PriorityQueue<number | null | undefined>([2, 1])
    const revision = queue.revision
    expect(() => queue.add(null)).toThrow(NullElementError)
    expect(() => queue.add(undefined)).toThrow(NullElementError)
    expect(() => queue.addAll([0, 5, null, 6])).toThrow(NullElementError)
    expect(queue.revision).toBe(revision)
    expect(drain(queue)).toEqual([1, 2])
    expect(() => new PriorityQueue([1, null])).toThrow(NullElementError)
    expect(() => PriorityQueue.from([undefined, 1])).toThrow(NullElementError)
    expect(messageOf(() => new PriorityQueue<unknown>().add(null))).toBe(
      'PriorityQueue.add: null is not allowed as an element',
    )
    expect(messageOf(() => new PriorityQueue<unknown>().addAll([1, undefined]))).toBe(
      'PriorityQueue.addAll: undefined is not allowed as an element',
    )
    expect(messageOf(() => new PriorityQueue([null]))).toBe(
      'PriorityQueue: null is not allowed as an element',
    )
    expect(messageOf(() => PriorityQueue.from([null]))).toBe(
      'PriorityQueue.from: null is not allowed as an element',
    )
  })

  it('throws ClassCastError and inserts nothing when an element is not comparable with the others [010 S2-AC2]', () => {
    const queue = new PriorityQueue<unknown>([1, 2, 3])
    const revision = queue.revision
    expect(() => queue.add('a')).toThrow(ClassCastError)
    expect(() => queue.add(1n)).toThrow(ClassCastError)
    expect(queue.size).toBe(3)
    expect(queue.revision).toBe(revision)
    expect(messageOf(() => queue.add('a'))).toMatch(
      /^PriorityQueue\.add: (string and number|number and string) cannot be compared$/,
    )
    expect(drain(queue)).toEqual([1, 2, 3])
  })

  it('checks natural comparability on every way in, even for a single element [010 S2-AC3]', () => {
    expect(() => new PriorityQueue<unknown>().add({})).toThrow(ClassCastError)
    expect(() => new PriorityQueue<unknown>().add(Symbol('s'))).toThrow(ClassCastError)
    expect(() => new PriorityQueue<unknown>().addAll([() => 1])).toThrow(ClassCastError)
    expect(() => new PriorityQueue<unknown>([{}])).toThrow(ClassCastError)
    expect(() => PriorityQueue.from<unknown>([{}])).toThrow(ClassCastError)
    expect(() => new PriorityQueue<unknown>([1, {}, 2])).toThrow(ClassCastError)
    expect(() => new PriorityQueue<unknown>(['a', 1])).toThrow(ClassCastError)
    const empty = new PriorityQueue<unknown>()
    caught(() => empty.add({}))
    expect(empty.size).toBe(0)
    expect(messageOf(() => empty.add({}))).toBe('PriorityQueue.add: object cannot be compared')
    // With a comparator, any value the comparator accepts may enter.
    const anything = new PriorityQueue<unknown>({ comparator: () => 0 })
    anything.add({})
    expect(anything.size).toBe(1)
    Ranked.calls = 0
    new PriorityQueue<Ranked>().add(new Ranked(1))
    expect(Ranked.calls).toBe(1)
  })

  it('leaves the queue, revision and open iterators as they were when a comparison fails [010 S2-AC4]', () => {
    const failure = new Error('comparator failed')
    let budget = Number.POSITIVE_INFINITY
    let used = 0
    let invalid = false
    const comparator = (a: number, b: number): number => {
      used++
      if (budget-- <= 0) {
        if (invalid) return Number.NaN
        throw failure
      }
      return a - b
    }
    const operations: Array<[string, (q: PriorityQueue<number>) => () => unknown]> = [
      ['add', (q) => () => q.add(-1)],
      ['poll', (q) => () => q.poll()],
      ['delete', (q) => () => q.delete(3)],
      [
        'cursor',
        (q) => {
          const cursor = q.cursor()
          cursor.next()
          return () => cursor.remove()
        },
      ],
      ['removeIf', (q) => () => q.removeIf((n) => n % 4 === 0)],
      ['removeAll', (q) => () => q.removeAll([4, 8])],
      ['retainAll', (q) => () => q.retainAll([1, 2, 3, 5, 6, 7, 9])],
    ]
    const make = () => new PriorityQueue([9, 2, 7, 1, 8, 3, 6, 4, 5], { comparator })
    for (const [name, prepare] of operations) {
      budget = Number.POSITIVE_INFINITY
      const probe = make()
      const run = prepare(probe)
      used = 0
      run()
      const needed = used
      expect(needed, name).toBeGreaterThan(0)
      for (const mode of ['throw', 'nan'] as const) {
        for (let k = 0; k < needed; k++) {
          budget = Number.POSITIVE_INFINITY
          invalid = mode === 'nan'
          const queue = make()
          const before = queue.toArray()
          const revision = queue.revision
          const operation = prepare(queue)
          const iterator = queue[Symbol.iterator]()
          iterator.next()
          budget = k
          const error = caught(operation)
          budget = Number.POSITIVE_INFINITY
          if (mode === 'throw') expect(error, `${name} ${k}`).toBe(failure)
          else {
            expect(error, `${name} ${k}`).toBeInstanceOf(TypeError)
            expect((error as Error).message).toBe(`PriorityQueue.${name}: comparator returned NaN`)
          }
          expect(queue.toArray(), `${name} ${k}`).toEqual(before)
          expect(queue.size).toBe(9)
          expect(queue.revision).toBe(revision)
          expect(iterator.next().done).toBe(false)
          expect(drain(queue)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
        }
      }
    }
    // A [compareSymbol] method that throws is treated the same way.
    class Fragile {
      constructor(readonly rank: number) {}
      [compareSymbol](other: Fragile): number {
        if (this.rank === 0 || other.rank === 0) throw failure
        return this.rank - other.rank
      }
    }
    const fragile = new PriorityQueue([new Fragile(2), new Fragile(1), new Fragile(3)])
    const before = fragile.toArray()
    expect(caught(() => fragile.add(new Fragile(0)))).toBe(failure)
    expect(fragile.toArray()).toEqual(before)
  })

  it('throws ConcurrentModificationError when the comparator changes the queue; the callback change stays [010 S2-AC6]', () => {
    let target: PriorityQueue<number> | undefined
    let change: ((q: PriorityQueue<number>) => unknown) | undefined
    const comparator = (a: number, b: number): number => {
      const pending = change
      if (pending !== undefined && target !== undefined) {
        change = undefined
        pending(target)
      }
      return a - b
    }
    const make = () => {
      const queue = new PriorityQueue([5, 3, 8, 1, 9], { comparator })
      target = queue
      return queue
    }

    let queue = make()
    change = (q) => q.add(100)
    expect(() => queue.add(0)).toThrow(ConcurrentModificationError)
    expect(drain(queue)).toEqual([1, 3, 5, 8, 9, 100])

    queue = make()
    change = (q) => q.poll()
    expect(() => queue.poll()).toThrow(ConcurrentModificationError)
    expect(drain(queue)).toEqual([3, 5, 8, 9])

    queue = make()
    change = (q) => q.add(100)
    expect(() => queue.delete(3)).toThrow(ConcurrentModificationError)
    expect(drain(queue)).toEqual([1, 3, 5, 8, 9, 100])

    queue = make()
    change = (q) => q.add(100)
    expect(() => queue.removeIf((n) => n === 3)).toThrow(ConcurrentModificationError)
    expect(drain(queue)).toEqual([1, 3, 5, 8, 9, 100])

    queue = make()
    const cursor = queue.cursor()
    cursor.next()
    change = (q) => q.add(100)
    expect(() => cursor.remove()).toThrow(ConcurrentModificationError)
    expect(drain(queue)).toEqual([1, 3, 5, 8, 9, 100])

    queue = make()
    let added = 0
    const twice = new PriorityQueue<number>({
      comparator: (a, b) => {
        if (++added === 1) twice.add(50)
        return a - b
      },
    })
    expect(() => twice.addAll([7, 6, 4])).toThrow(ConcurrentModificationError)
    expect(drain(twice)).toEqual([7, 50])
    expect(
      messageOf(() => {
        change = (q) => q.add(1)
        queue.add(2)
      }),
    ).toBe('PriorityQueue.add: the queue was changed by the comparator')

    // A [compareSymbol] method that changes the queue is detected the same way.
    let host: PriorityQueue<Meddler> | undefined
    class Meddler {
      constructor(readonly rank: number) {}
      [compareSymbol](other: Meddler): number {
        if (this.rank === 0 && host !== undefined) {
          const h = host
          host = undefined
          h.add(new Meddler(99))
        }
        return this.rank - other.rank
      }
    }
    const meddled = new PriorityQueue([new Meddler(2), new Meddler(1)])
    host = meddled
    expect(() => meddled.add(new Meddler(0))).toThrow(ConcurrentModificationError)
    expect(drain(meddled).map((m) => m.rank)).toEqual([1, 2, 99])
  })

  it('has, delete, removeAll and retainAll treat null and undefined as matching nothing [010 S2-AC7]', () => {
    const { comparator, calls } = counting(ascending)
    const queue = new PriorityQueue<number | null | undefined>([2, 1], {
      comparator: comparator as Comparator<number | null | undefined>,
    })
    const before = calls()
    expect(queue.has(null)).toBe(false)
    expect(queue.has(undefined)).toBe(false)
    expect(queue.delete(null)).toBe(false)
    expect(queue.delete(undefined)).toBe(false)
    expect(calls()).toBe(before)
    expect(queue.removeAll([null, undefined])).toBe(false)
    expect(queue.size).toBe(2)
    expect(queue.retainAll([null])).toBe(true)
    expect(queue.size).toBe(0)
  })

  it('leaves contents, revision and open iterators unchanged on calls that change nothing [010 S2-AC11]', () => {
    const { comparator, calls } = counting(ascending)
    const empty = new PriorityQueue<number>({ comparator })
    const emptyIterator = empty[Symbol.iterator]()
    const emptyRevision = empty.revision
    empty.poll()
    empty.peek()
    empty.clear()
    empty.addAll([])
    expect(empty.addAll([])).toBe(false)
    expect(empty.revision).toBe(emptyRevision)
    expect(emptyIterator.next().done).toBe(true)

    const queue = new PriorityQueue([3, 1, 2], { comparator })
    const iterator = queue[Symbol.iterator]()
    const revision = queue.revision
    const before = calls()
    expect(queue.delete(9)).toBe(false)
    expect(queue.removeIf(() => false)).toBe(false)
    expect(queue.removeAll([7, 8])).toBe(false)
    expect(queue.retainAll([1, 2, 3])).toBe(false)
    expect(calls()).toBe(before)
    expect(() => queue.add(null as never)).toThrow(NullElementError)
    expect(() => queue.add(Number.NaN)).toThrow(TypeError) // the comparator returns NaN
    expect(queue.revision).toBe(revision)
    expect(queue.size).toBe(3)
    expect(iterator.next().done).toBe(false)
    const natural = new PriorityQueue<unknown>([1])
    const naturalIterator = natural[Symbol.iterator]()
    const naturalRevision = natural.revision
    expect(() => natural.add('x')).toThrow(ClassCastError)
    expect(natural.revision).toBe(naturalRevision)
    expect(naturalIterator.next()).toEqual({ done: false, value: 1 })
  })

  it('loses and duplicates nothing under a random comparator [010 S2-AC12]', () => {
    for (const seed of [1, 2, 3]) {
      const random = seeded(seed)
      const chaos = (): number => integer(random, -1, 1)
      const queue = new PriorityQueue<number>({ comparator: chaos })
      const model = new Map<number, number>()
      let size = 0
      const take = (value: number) => {
        const count = model.get(value) ?? 0
        expect(count, `seed ${seed}`).toBeGreaterThan(0)
        if (count === 1) model.delete(value)
        else model.set(value, count - 1)
        size--
      }
      for (let step = 0; step < 1000; step++) {
        const op = integer(random, 0, 9)
        const v = integer(random, 0, 30)
        if (op < 5) {
          queue.add(v)
          model.set(v, (model.get(v) ?? 0) + 1)
          size++
        } else if (op < 7) {
          const polled = queue.poll()
          if (polled === undefined) expect(size).toBe(0)
          else take(polled)
        } else if (op < 9) {
          if (queue.delete(v)) take(v)
          else expect(model.has(v)).toBe(false)
        } else {
          const present = multiset(queue)
          const cursor = queue.cursor()
          const seen: number[] = []
          while (cursor.hasNext()) {
            const value = cursor.next()
            seen.push(value)
            if (integer(random, 0, 3) === 0) {
              cursor.remove()
              take(value)
            }
          }
          expect(multiset(seen)).toEqual(present)
        }
        expect(queue.size, `seed ${seed} step ${step}`).toBe(size)
        expect(multiset(queue)).toEqual(model)
      }
      const drained = drain(queue)
      expect(drained.length).toBe(size)
      for (const value of drained) take(value)
      expect(model.size).toBe(0)
    }
  })
})

describe('PriorityQueue — cost', () => {
  /** Checks the add and poll bounds for one sequence, counting through `calls`. */
  function checkAddAndPoll<T>(
    label: string,
    queue: PriorityQueue<T>,
    values: T[],
    calls: () => number,
  ): void {
    for (const value of values) {
      const before = calls()
      queue.add(value)
      expect(calls() - before, `${label} add`).toBeLessThanOrEqual(log2(queue.size) + 1)
    }
    while (!queue.isEmpty()) {
      const n = queue.size
      const before = calls()
      queue.poll()
      expect(calls() - before, `${label} poll`).toBeLessThanOrEqual(2 * log2(n))
    }
  }

  it('add makes at most floor(log2 n) + 1 comparisons and poll at most 2 floor(log2 n) [010 S3-AC1]', () => {
    for (const n of [1, 2, 3, 7, 8, 1023, 1024, 10000]) {
      for (const [kind, values] of sequences(n, n)) {
        const { comparator, calls } = counting(ascending)
        checkAddAndPoll(`comparator ${kind} ${n}`, new PriorityQueue({ comparator }), values, calls)
        Ranked.calls = 0
        checkAddAndPoll(
          `natural ${kind} ${n}`,
          new PriorityQueue<Ranked>(),
          values.map((v) => new Ranked(v)),
          () => Ranked.calls,
        )
      }
    }
  })

  it('peek makes no comparison [010 S3-AC2]', () => {
    const { comparator, calls } = counting(ascending)
    const queue = new PriorityQueue([5, 2, 8], { comparator })
    const before = calls()
    for (let i = 0; i < 10; i++) expect(queue.peek()).toBe(2)
    expect(calls()).toBe(before)
  })

  it('delete and a cursor remove repair the heap with at most 2 floor(log2 n) + 1 comparisons [010 S3-AC5]', () => {
    for (const n of [1, 2, 3, 7, 8, 1023, 1024]) {
      for (const [kind, values] of sequences(n, n + 1)) {
        const { comparator, calls } = counting(ascending)
        const queue = new PriorityQueue(values, { comparator })
        const random = seeded(n)
        while (!queue.isEmpty()) {
          const size = queue.size
          const before = calls()
          if (integer(random, 0, 1) === 0) {
            const array = queue.toArray()
            queue.delete(array[integer(random, 0, array.length - 1)] as number)
          } else {
            const cursor = queue.cursor()
            const steps = integer(random, 1, size)
            for (let i = 0; i < steps; i++) cursor.next()
            cursor.remove()
          }
          expect(calls() - before, `${kind} ${n}`).toBeLessThanOrEqual(2 * log2(size) + 1)
        }
        Ranked.calls = 0
        const ranked = new PriorityQueue(values.map((v) => new Ranked(v)))
        while (!ranked.isEmpty()) {
          const size = ranked.size
          const before = Ranked.calls
          const array = ranked.toArray()
          ranked.delete(array[integer(random, 0, array.length - 1)] as Ranked)
          expect(Ranked.calls - before).toBeLessThanOrEqual(2 * log2(size) + 1)
        }
      }
    }
  })
})

describe('PriorityQueue — iteration and output', () => {
  it('yields every element exactly once from every way of reading it [010 S4-AC1]', () => {
    const random = seeded(5)
    const values = Array.from({ length: 50 }, () => integer(random, 0, 20))
    const queue = new PriorityQueue(values)
    const expected = multiset(values)
    const viaForEach: number[] = []
    queue.forEach((n) => {
      viaForEach.push(n)
    })
    expect(multiset(queue)).toEqual(expected)
    expect(multiset(viaForEach)).toEqual(expected)
    expect(multiset(queue.toArray())).toEqual(expected)
    expect(multiset(queue.toJSON())).toEqual(expected)
    expect(multiset(JSON.parse(JSON.stringify(queue)) as number[])).toEqual(expected)
    const printed = String(queue)
    const inside = printed.slice(printed.indexOf('[') + 1, -1)
    expect(multiset(inside.split(', ').map(Number))).toEqual(expected)
    // Heap order is not sorted in general.
    const unsorted = new PriorityQueue([1, 5, 2, 6, 7, 3])
    expect(unsorted.toArray()).not.toEqual([1, 2, 3, 5, 6, 7])
  })

  it('the user guide says iteration is not sorted and shows draining with poll for sorted output [010 S4-AC1]', () => {
    const guide = readFileSync(new URL('../docs/priority-queues.md', import.meta.url), 'utf8')
    expect(guide).toContain('## Iteration is not sorted')
    expect(guide).toContain('while (!queue.isEmpty()) sorted.push(queue.poll()!)')
    // The printed example in the guide is what the queue prints.
    const printed = String(new PriorityQueue([5, 1, 4, 2, 3]))
    expect(guide).toContain(`String(queue) // '${printed}'`)
  })

  it('a cursor removes the element last returned and still yields every other element once [010 S4-AC2]', () => {
    // A valid heap, kept as given: removing 12 moves the last element, 4, above the cursor.
    const queue = new PriorityQueue([1, 10, 2, 11, 12, 3, 4])
    expect(queue.toArray()).toEqual([1, 10, 2, 11, 12, 3, 4])
    const cursor = queue.cursor()
    const seen: number[] = []
    while (cursor.hasNext()) {
      const n = cursor.next()
      seen.push(n)
      if (n === 12 || n === 4) cursor.remove()
    }
    expect(seen.slice().sort(ascending)).toEqual([1, 2, 3, 4, 10, 11, 12])
    expect(seen.at(-1)).toBe(4) // returned after the walk, as it rose behind the cursor
    expect(drain(queue)).toEqual([1, 2, 3, 10, 11])

    for (let seed = 1; seed <= 200; seed++) {
      const random = seeded(seed)
      const values = Array.from({ length: integer(random, 1, 40) }, () => integer(random, 0, 30))
      const q = new PriorityQueue(values)
      const walk = q.cursor()
      const visited: number[] = []
      const removed: number[] = []
      while (walk.hasNext()) {
        const n = walk.next()
        visited.push(n)
        if (integer(random, 0, 2) === 0) {
          walk.remove()
          removed.push(n)
        }
      }
      expect(multiset(visited), `seed ${seed}`).toEqual(multiset(values))
      const kept = values.slice()
      for (const r of removed) kept.splice(kept.indexOf(r), 1)
      expect(drain(q), `seed ${seed}`).toEqual(kept.sort(ascending))
    }
  })

  it('fails fast when changed other than through the open cursor or iterator [010 S4-AC3]', () => {
    const changes: Array<[string, (q: PriorityQueue<number>) => unknown]> = [
      ['add', (q) => q.add(0)],
      ['addAll', (q) => q.addAll([0])],
      ['poll', (q) => q.poll()],
      ['delete', (q) => q.delete(3)],
      ['removeIf', (q) => q.removeIf((n) => n === 3)],
      ['removeAll', (q) => q.removeAll([3])],
      ['retainAll', (q) => q.retainAll([1])],
      ['clear', (q) => q.clear()],
      [
        'other cursor',
        (q) => {
          const other = q.cursor()
          other.next()
          other.remove()
        },
      ],
    ]
    for (const [name, change] of changes) {
      const queue = new PriorityQueue([1, 2, 3, 4])
      const iterator = queue[Symbol.iterator]()
      const cursor = queue.cursor()
      iterator.next()
      cursor.next()
      change(queue)
      expect(() => iterator.next(), name).toThrow(ConcurrentModificationError)
      expect(() => cursor.next(), name).toThrow(ConcurrentModificationError)
      expect(() => cursor.remove(), name).toThrow(ConcurrentModificationError)
      const looped = new PriorityQueue([1, 2, 3, 4])
      expect(() => {
        for (const _ of looped) change(looped)
      }, name).toThrow(ConcurrentModificationError)
      const visited = new PriorityQueue([1, 2, 3, 4])
      expect(
        () =>
          visited.forEach(() => {
            change(visited)
          }),
        name,
      ).toThrow(ConcurrentModificationError)
    }
    expect(
      messageOf(() => {
        const queue = new PriorityQueue([1, 2])
        for (const _ of queue) queue.add(3)
      }),
    ).toBe('PriorityQueue[Symbol.iterator]().next: the collection was changed during iteration')
  })

  it('prints PriorityQueue(n) [...] and uses one order for every output [010 S4-AC6]', () => {
    const queue = new PriorityQueue([5, 1, 4, 2, 3, 9, 0])
    queue.poll()
    queue.add(7)
    const order = [...queue]
    const viaForEach: number[] = []
    queue.forEach((n) => {
      viaForEach.push(n)
    })
    const viaCursor: number[] = []
    const cursor = queue.cursor()
    while (cursor.hasNext()) viaCursor.push(cursor.next())
    expect(viaForEach).toEqual(order)
    expect(viaCursor).toEqual(order)
    expect(queue.toArray()).toEqual(order)
    expect(queue.toJSON()).toEqual(order)
    expect(String(queue)).toBe(`PriorityQueue(7) [${order.join(', ')}]`)
    expect(inspect(queue)).toBe(`PriorityQueue(7) [ ${order.join(', ')} ]`)
    expect(String(new PriorityQueue())).toBe('PriorityQueue(0) []')
    expect(String(new PriorityQueue([1, 3, 2]))).toBe('PriorityQueue(3) [1, 3, 2]')
    expect(Object.prototype.toString.call(queue)).toBe('[object PriorityQueue]')
  })

  it('changes revision on every change to the contents [010 S5-AC3]', () => {
    const queue = new PriorityQueue([5, 1, 4, 2, 3, 8, 6, 7])
    const seen = new Set([queue.revision])
    const changed = (what: string) => {
      expect(seen.has(queue.revision), what).toBe(false)
      seen.add(queue.revision)
    }
    queue.add(0)
    changed('add')
    queue.poll()
    changed('poll')
    queue.delete(4)
    changed('delete')
    queue.removeIf((n) => n === 5)
    changed('removeIf')
    queue.removeAll([6])
    changed('removeAll')
    queue.retainAll([1, 2, 3, 7])
    changed('retainAll')
    queue.addAll([9, 10])
    changed('addAll')
    const cursor = queue.cursor()
    cursor.next()
    cursor.remove()
    changed('cursor remove')
    queue.clear()
    changed('clear')
    const before = queue.revision
    queue.clear()
    queue.has(1)
    queue.peek()
    String(queue)
    expect(queue.revision).toBe(before)
  })
})

describe('PriorityQueue — construction, copies and equality', () => {
  it('never takes the comparator from a source queue, except through copy() [010 S1-AC4]', () => {
    const descending = (a: number, b: number) => b - a
    const source = new PriorityQueue([1, 3, 2], { comparator: descending })
    expect(source.peek()).toBe(3)
    const rebuilt = new PriorityQueue(source)
    expect(rebuilt.comparator()).toBeUndefined()
    expect(drain(rebuilt)).toEqual([1, 2, 3])
    const fromSource = PriorityQueue.from(source)
    expect(fromSource.comparator()).toBeUndefined()
    expect(fromSource.peek()).toBe(1)
    const withOptions = new PriorityQueue(source, { comparator: ascending })
    expect(withOptions.comparator()).toBe(ascending)
    expect(source.copy().comparator()).toBe(descending)
    expect(drain(source.copy())).toEqual([3, 2, 1])
  })

  it('addAll keeps the elements added before a failing comparison and not the failing one [010 S2-AC5]', () => {
    const failure = new Error('cannot compare 3')
    const comparator = (a: number, b: number) => {
      if (a === 3 || b === 3) throw failure
      return a - b
    }
    const queue = new PriorityQueue([10], { comparator })
    const revision = queue.revision
    expect(caught(() => queue.addAll([1, 2, 3, 4]))).toBe(failure)
    expect(queue.revision).not.toBe(revision)
    expect(drain(queue)).toEqual([1, 2, 10])
    expect(caught(() => new PriorityQueue([1, 2, 3, 4], { comparator }))).toBe(failure)
    expect(caught(() => PriorityQueue.from([1, 3], { comparator }))).toBe(failure)
    const natural = new PriorityQueue<unknown>([5])
    expect(() => natural.addAll([1, 'x', 2])).toThrow(ClassCastError)
    expect(drain(natural)).toEqual([1, 5])
  })

  it('reads one argument as elements when iterable and as options when another object [010 S2-AC8]', () => {
    const comparator = (a: number, b: number) => b - a
    expect(new PriorityQueue().size).toBe(0)
    expect(new PriorityQueue(undefined).size).toBe(0)
    expect(new PriorityQueue(null).size).toBe(0)
    expect(drain(new PriorityQueue('cab'))).toEqual(['a', 'b', 'c'])
    expect(drain(new PriorityQueue(new Set([2, 1])))).toEqual([1, 2])
    expect(new PriorityQueue({ comparator }).comparator()).toBe(comparator)
    expect(new PriorityQueue({ comparator } as never, undefined).comparator()).toBe(comparator)
    expect(new PriorityQueue([2, 1], undefined).peek()).toBe(1)
    for (const bad of [5, true, 1n, Symbol('s')]) {
      expect(() => new PriorityQueue(bad as never)).toThrow(TypeError)
    }
    expect(messageOf(() => new PriorityQueue(5 as never))).toBe(
      'PriorityQueue: elements is not iterable (5)',
    )
    expect(messageOf(() => new PriorityQueue(comparator as never))).toBe(
      'PriorityQueue: elements is not iterable (function); pass the comparator as { comparator }',
    )
  })

  it('with a second argument, requires iterable elements and an options object [010 S2-AC9]', () => {
    const comparator = (a: number, b: number) => a - b
    expect(new PriorityQueue(null, { comparator }).comparator()).toBe(comparator)
    expect(new PriorityQueue(undefined, {}).size).toBe(0)
    expect(() => new PriorityQueue({} as never, {})).toThrow(TypeError)
    expect(messageOf(() => new PriorityQueue(5 as never, {}))).toBe(
      'PriorityQueue: elements is not iterable (5)',
    )
    expect(messageOf(() => new PriorityQueue([1], null as never))).toBe(
      'PriorityQueue: options is not an object (null)',
    )
    expect(messageOf(() => new PriorityQueue([1], comparator as never))).toBe(
      'PriorityQueue: options is not an object (function)',
    )
    expect(() => new PriorityQueue([1], 5 as never)).toThrow(TypeError)
    expect(messageOf(() => PriorityQueue.from(null as never))).toBe(
      'PriorityQueue.from: elements is not iterable (null)',
    )
    expect(() => PriorityQueue.from(undefined as never)).toThrow(TypeError)
    expect(() => PriorityQueue.from({ length: 1 } as never)).toThrow(TypeError)
    expect(messageOf(() => PriorityQueue.from(comparator as never))).toBe(
      'PriorityQueue.from: elements is not iterable (function); pass the comparator as { comparator }',
    )
    expect(messageOf(() => PriorityQueue.from([1], null as never))).toBe(
      'PriorityQueue.from: options is not an object (null)',
    )
    expect(messageOf(() => PriorityQueue.from([1], comparator as never))).toBe(
      'PriorityQueue.from: options is not an object (function)',
    )
    expect(PriorityQueue.from([2, 1], { comparator }).comparator()).toBe(comparator)
    expect(PriorityQueue.from([2, 1]).comparator()).toBeUndefined()
  })

  it('reads comparator once, ignores other keys and rejects a comparator that is not a function [010 S2-AC10]', () => {
    let reads = 0
    const comparator = (a: number, b: number) => b - a
    const options = {
      get comparator() {
        reads++
        return comparator
      },
      capacity: 100,
      other: 'ignored',
    }
    const queue = new PriorityQueue([1, 2, 3], options as never)
    expect(reads).toBe(1)
    queue.add(4)
    queue.poll()
    queue.copy()
    expect(reads).toBe(1)
    expect(queue.comparator()).toBe(comparator)
    PriorityQueue.from([1], options as never)
    expect(reads).toBe(2)
    expect(new PriorityQueue({ comparator: undefined }).comparator()).toBeUndefined()
    for (const bad of [5, null, 'a', {}]) {
      expect(() => new PriorityQueue({ comparator: bad as never })).toThrow(TypeError)
      expect(() => PriorityQueue.from([], { comparator: bad as never })).toThrow(TypeError)
    }
    expect(messageOf(() => new PriorityQueue({ comparator: 5 as never }))).toBe(
      'PriorityQueue: comparator is not a function (5)',
    )
    expect(messageOf(() => PriorityQueue.from([], { comparator: null as never }))).toBe(
      'PriorityQueue.from: comparator is not a function (null)',
    )
  })

  it('builds from n elements with at most 2n comparisons; copy makes none [010 S3-AC3]', () => {
    for (const n of [1, 2, 3, 7, 8, 1023, 1024, 10000]) {
      for (const [kind, values] of sequences(n, 3 * n)) {
        const { comparator, calls } = counting(ascending)
        const built = new PriorityQueue(values, { comparator })
        expect(calls(), `constructor ${kind} ${n}`).toBeLessThanOrEqual(2 * n)
        const fromCalls = calls()
        PriorityQueue.from(values, { comparator })
        expect(calls() - fromCalls, `from ${kind} ${n}`).toBeLessThanOrEqual(2 * n)
        const copyCalls = calls()
        const copy = built.copy()
        expect(calls()).toBe(copyCalls)
        expect(copy.size).toBe(n)
        Ranked.calls = 0
        new PriorityQueue(values.map((v) => new Ranked(v)))
        expect(Ranked.calls, `natural ${kind} ${n}`).toBeLessThanOrEqual(2 * n)
      }
    }
  })

  it('equals only itself; hash values follow identity and there is no hashCode method [010 S4-AC4]', () => {
    const queue = new PriorityQueue([1, 2])
    expect(queue.equals(queue)).toBe(true)
    expect(queue[equalsSymbol](queue)).toBe(true)
    expect(queue.equals(new PriorityQueue([1, 2]))).toBe(false)
    expect(queue.equals(queue.copy())).toBe(false)
    expect(queue.equals([1, 2])).toBe(false)
    expect(queue.equals(null)).toBe(false)
    expect(hashCode(queue)).toBe(hashCode(queue))
    expect('hashCode' in queue).toBe(false)
  })

  it('copy is an independent queue with the same elements and comparator [010 S4-AC5]', () => {
    const comparator = (a: number, b: number) => b - a
    const queue = new PriorityQueue([4, 1, 3], { comparator })
    const copy = queue.copy()
    expect(copy).toBeInstanceOf(PriorityQueue)
    expect(copy).not.toBe(queue)
    expect(copy.comparator()).toBe(comparator)
    expect(copy.toArray()).toEqual(queue.toArray())
    copy.poll()
    copy.add(10)
    expect(drain(queue)).toEqual([4, 3, 1])
    expect(drain(copy)).toEqual([10, 3, 1])
    expect(new PriorityQueue<number>().copy().size).toBe(0)
  })

  it('builds and drains 200,000 elements without deep recursion', () => {
    const n = 200000
    const values = Array.from({ length: n }, (_, i) => (i * 7919) % n)
    const queue = new PriorityQueue(values)
    expect(queue.size).toBe(n)
    let previous = -1
    let count = 0
    while (!queue.isEmpty()) {
      const next = queue.poll() as number
      expect(next >= previous).toBe(true)
      previous = next
      count++
    }
    expect(count).toBe(n)
    // Generous: instrumented coverage runs are many times slower than plain ones.
  }, 60000)
})

/** Kinds in the order the contract comparator puts them. */
const KINDS = ['number', 'bigint', 'string', 'boolean', 'symbol', 'function', 'object', 'undefined']

/**
 * A total order over any values, for the contract suite, which adds strings, objects and the
 * queue itself next to numbers: by kind, then by value; symbols, functions and objects in the
 * order first seen.
 */
function mixedComparator(): Comparator<unknown> {
  const ids = new Map<unknown, number>()
  const idOf = (value: unknown): number => {
    let id = ids.get(value)
    if (id === undefined) {
      id = ids.size
      ids.set(value, id)
    }
    return id
  }
  return (a, b) => {
    const kinds = KINDS.indexOf(typeof a) - KINDS.indexOf(typeof b)
    if (kinds !== 0) return kinds
    switch (typeof a) {
      case 'number': {
        const x = a as number
        const y = b as number
        if (Number.isNaN(x) || Number.isNaN(y))
          return Number(Number.isNaN(x)) - Number(Number.isNaN(y))
        return x < y ? -1 : x > y ? 1 : 0
      }
      case 'bigint':
      case 'string':
      case 'boolean': {
        const x = a as string
        const y = b as string
        return x < y ? -1 : x > y ? 1 : 0
      }
      default:
        return idOf(a) - idOf(b)
    }
  }
}

describe('PriorityQueue — shared contracts', () => {
  it('orders mixed values totally, so the shared contract suites can run on it [010 S5-AC1]', () => {
    // The suites below are registered at module level; this test pins the factory they use.
    const queue = new PriorityQueue<unknown>([2, 'b', 1, 'a'], { comparator: mixedComparator() })
    expect(drain(queue)).toEqual([1, 2, 'a', 'b'])
  })
})

describeCollection(
  'PriorityQueue',
  (initial) => new PriorityQueue<unknown>(initial, { comparator: mixedComparator() }),
  {
    iteration: 'fail-fast',
    brackets: 'list',
    nullElements: 'reject',
    order: 'unspecified',
    peers: [(initial?: Iterable<unknown>) => new ArrayDeque<unknown>(initial)],
    withFailingAdd: (rejects, failure) => {
      const order = mixedComparator()
      return new PriorityQueue<unknown>({
        comparator: (a, b) => {
          if (rejects(a) || rejects(b)) throw failure
          return order(a, b)
        },
      })
    },
  },
)
describeQueue('PriorityQueue', (initial) => new PriorityQueue<number>(initial))

describe('PriorityQueue — reference model', () => {
  it('matches a sorted native array under seeded random operations [010 S5-AC2]', () => {
    const descending = (a: number, b: number) => b - a
    for (const seed of [1, 2, 3, 4]) {
      runPriorityQueueReferenceModel({
        seed,
        steps: 600,
        make: () => new PriorityQueue<number>(),
        compare: ascending,
      })
      runPriorityQueueReferenceModel({
        seed,
        steps: 600,
        make: () => new PriorityQueue<number>({ comparator: descending }),
        compare: descending,
      })
    }
  })
})

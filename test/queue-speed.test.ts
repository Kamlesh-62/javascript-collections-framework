import { describe, expect, it } from 'vitest'
import {
  ClassCastError,
  type Comparator,
  ConcurrentModificationError,
  compareSymbol,
  NullElementError,
  PriorityQueue,
} from '../src/index'
import { SHAPES, shaped } from './support/complexity'
import { integer, pick, seeded } from './support/random'

// The behaviour of `PriorityQueue` that its internal fast paths must keep: what a failing or
// meddling comparator leaves, when `revision` changes, where fail-fast iteration throws, how a
// queue moves between kinds of values, and how many comparisons each operation makes.

function caught(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  return undefined
}

/** `<name>: <message>` of what `fn` throws, or `'none'`. */
function thrown(fn: () => unknown): string {
  const error = caught(fn)
  return error === undefined ? 'none' : `${(error as Error).name}: ${(error as Error).message}`
}

/** Removes every element with `poll` and returns them in the order polled. */
function drain<E>(queue: PriorityQueue<E>): E[] {
  const out: E[] = []
  while (!queue.isEmpty()) out.push(queue.poll() as E)
  return out
}

/** The elements sorted, so contents compare whatever the heap order. */
function sorted(queue: PriorityQueue<number>): number[] {
  return queue.toArray().sort((a, b) => a - b)
}

function log2(n: number): number {
  return Math.floor(Math.log2(n))
}

/** A value ordered by `rank` through `[compareSymbol]`, with an optional hook run on each call. */
class Ranked {
  static hook: ((self: Ranked, other: Ranked) => void) | undefined
  static calls = 0
  constructor(readonly rank: number) {}
  [compareSymbol](other: Ranked): number {
    Ranked.calls++
    const hook = Ranked.hook
    if (hook !== undefined) hook(this, other)
    return this.rank - other.rank
  }
  toString(): string {
    return `r${this.rank}`
  }
}

describe('PriorityQueue — failing and meddling comparisons', () => {
  const failure = new Error('comparison failed')
  /** A comparator armed to throw, or to run `change` once, on its next call. */
  function controlled(): {
    comparator: Comparator<number>
    arm: (mode: 'throw' | ((q: PriorityQueue<number>) => void)) => void
    target: (q: PriorityQueue<number>) => void
  } {
    let mode: 'throw' | ((q: PriorityQueue<number>) => void) | undefined
    let queue: PriorityQueue<number> | undefined
    return {
      comparator: (a, b) => {
        const armed = mode
        if (armed === 'throw') throw failure
        if (armed !== undefined && queue !== undefined) {
          mode = undefined
          armed(queue)
        }
        return a - b
      },
      arm: (m) => {
        mode = m
      },
      target: (q) => {
        queue = q
      },
    }
  }

  const calls: Array<[string, (q: PriorityQueue<number>) => unknown]> = [
    ['add', (q) => q.add(0)],
    ['poll', (q) => q.poll()],
    ['delete', (q) => q.delete(3)],
    ['removeAll', (q) => q.removeAll([3])],
    ['retainAll', (q) => q.retainAll([1, 5, 8, 9])],
    ['removeIf', (q) => q.removeIf((n) => n === 3)],
    [
      'a cursor remove',
      (q) => {
        const cursor = q.cursor()
        cursor.next()
        return cursor.remove()
      },
    ],
  ]

  for (const [name, call] of calls) {
    it(`a comparator that throws during ${name} leaves the elements, size and revision as before [050 S1-AC1]`, () => {
      const c = controlled()
      const queue = new PriorityQueue([5, 3, 8, 1, 9], { comparator: c.comparator })
      c.target(queue)
      const before = sorted(queue)
      const revision = queue.revision
      c.arm('throw')
      expect(caught(() => call(queue))).toBe(failure)
      expect(sorted(queue)).toEqual(before)
      expect(queue.size).toBe(5)
      expect(queue.revision).toBe(revision)
    })

    it(`a comparator that adds to the queue during ${name} throws ConcurrentModificationError; only its own change stays [050 S1-AC1]`, () => {
      const c = controlled()
      const queue = new PriorityQueue([5, 3, 8, 1, 9], { comparator: c.comparator })
      c.target(queue)
      let inner = Number.NaN
      c.arm((q) => {
        q.add(100)
        inner = q.revision
      })
      expect(caught(() => call(queue))).toBeInstanceOf(ConcurrentModificationError)
      expect(sorted(queue)).toEqual([1, 3, 5, 8, 9, 100])
      expect(queue.revision).toBe(inner)
    })
  }

  it('a comparator that removes from the queue during add throws, and the removal stays [050 S1-AC1]', () => {
    const c = controlled()
    const queue = new PriorityQueue([5, 3, 8, 1, 9], { comparator: c.comparator })
    c.target(queue)
    c.arm((q) => {
      q.poll()
    })
    expect(thrown(() => queue.add(0))).toBe(
      'ConcurrentModificationError: PriorityQueue.add: the queue was changed by the comparator',
    )
    expect(sorted(queue)).toEqual([3, 5, 8, 9])
  })

  it('addAll keeps the elements added before a failing comparison and adds nothing after it [050 S1-AC1]', () => {
    const queue = new PriorityQueue<number>([10, 20], {
      comparator: (a, b) => {
        if (a === 6 || b === 6) throw failure
        return a - b
      },
    })
    const revision = queue.revision
    expect(caught(() => queue.addAll([7, 6, 4]))).toBe(failure)
    expect(sorted(queue)).toEqual([7, 10, 20])
    expect(queue.revision).not.toBe(revision)
  })

  it('a [compareSymbol] method that throws or adds leaves the queue as its own change left it [050 S1-AC1]', () => {
    const queue = new PriorityQueue([new Ranked(2), new Ranked(1), new Ranked(3)])
    const revision = queue.revision
    Ranked.hook = () => {
      throw failure
    }
    try {
      expect(caught(() => queue.add(new Ranked(0)))).toBe(failure)
      expect(caught(() => queue.poll())).toBe(failure)
    } finally {
      Ranked.hook = undefined
    }
    expect(queue.size).toBe(3)
    expect(queue.revision).toBe(revision)
    let once = true
    Ranked.hook = () => {
      if (once) {
        once = false
        queue.add(new Ranked(99))
      }
    }
    try {
      expect(caught(() => queue.add(new Ranked(0)))).toBeInstanceOf(ConcurrentModificationError)
    } finally {
      Ranked.hook = undefined
    }
    expect(drain(queue).map((r) => r.rank)).toEqual([1, 2, 3, 99])
  })

  it('a removeIf predicate that throws removes nothing; one that changes the queue throws, and only its change stays [050 S1-AC1]', () => {
    for (const queue of [new PriorityQueue([5, 3, 8, 1, 9]), new PriorityQueue(['e', 'c', 'h'])]) {
      const before = queue.toArray().sort()
      const revision = queue.revision
      expect(
        caught(() =>
          queue.removeIf(() => {
            throw failure
          }),
        ),
      ).toBe(failure)
      expect(queue.toArray().sort()).toEqual(before)
      expect(queue.revision).toBe(revision)
    }
    const queue = new PriorityQueue([5, 3, 8, 1, 9])
    let inner = Number.NaN
    expect(
      thrown(() =>
        queue.removeIf((n) => {
          if (n === 1) {
            queue.add(0)
            inner = queue.revision
          }
          return true
        }),
      ),
    ).toBe(
      'ConcurrentModificationError: PriorityQueue.removeIf: the collection was changed while deciding',
    )
    expect(sorted(queue)).toEqual([0, 1, 3, 5, 8, 9])
    expect(queue.revision).toBe(inner)
  })

  it('the constructor and from throw on a failing comparison and return no queue [050 S1-AC1]', () => {
    const comparator = (a: number, b: number): number => {
      if (a === 2 || b === 2) throw failure
      return a - b
    }
    expect(caught(() => new PriorityQueue([1, 2, 3], { comparator }))).toBe(failure)
    expect(caught(() => PriorityQueue.from([1, 2, 3], { comparator }))).toBe(failure)
    expect(thrown(() => new PriorityQueue<unknown>([1, 'a']))).toBe(
      'ClassCastError: PriorityQueue: string and number cannot be compared',
    )
    expect(thrown(() => PriorityQueue.from<unknown>([1, 'a']))).toBe(
      'ClassCastError: PriorityQueue.from: string and number cannot be compared',
    )
  })
})

describe('PriorityQueue — revision', () => {
  const kinds: Array<[string, () => PriorityQueue<unknown>, unknown, unknown]> = [
    ['numbers', () => new PriorityQueue<unknown>([5, 3, 8]), 4, 99],
    ['strings', () => new PriorityQueue<unknown>(['e', 'c', 'h']), 'd', 'zz'],
    [
      'a comparator',
      () =>
        new PriorityQueue<unknown>([5, 3, 8], {
          comparator: (a, b) => (a as number) - (b as number),
        }),
      4,
      99,
    ],
  ]
  for (const [name, make, present, absent] of kinds) {
    it(`changes on each call that adds or removes, and on no other call, for ${name} [050 S1-AC4]`, () => {
      const changes = (call: (q: PriorityQueue<unknown>) => unknown, q = make()): boolean => {
        const before = q.revision
        call(q)
        return q.revision !== before
      }
      expect(changes((q) => q.add(present))).toBe(true)
      expect(changes((q) => q.addAll([present, present]))).toBe(true)
      expect(changes((q) => q.poll())).toBe(true)
      expect(changes((q) => q.delete(q.peek()))).toBe(true)
      expect(changes((q) => q.removeIf(() => true))).toBe(true)
      expect(changes((q) => q.removeAll([q.peek()]))).toBe(true)
      expect(changes((q) => q.retainAll([]))).toBe(true)
      expect(changes((q) => q.clear())).toBe(true)
      // Calls that read or change nothing.
      expect(changes((q) => q.peek())).toBe(false)
      expect(changes((q) => q.has(present))).toBe(false)
      expect(changes((q) => q.toArray())).toBe(false)
      expect(changes((q) => [...q])).toBe(false)
      expect(changes((q) => q.forEach(() => {}))).toBe(false)
      expect(changes((q) => q.toString())).toBe(false)
      expect(changes((q) => q.toJSON())).toBe(false)
      expect(changes((q) => q.equals(q))).toBe(false)
      expect(changes((q) => q.copy())).toBe(false)
      expect(changes((q) => q.addAll([]))).toBe(false)
      expect(changes((q) => q.delete(absent))).toBe(false)
      expect(changes((q) => q.removeIf(() => false))).toBe(false)
      expect(changes((q) => q.removeAll([absent]))).toBe(false)
      expect(changes((q) => q.retainAll([...q]))).toBe(false)
      const empty = make()
      empty.clear()
      expect(changes((q) => q.poll(), empty)).toBe(false)
      expect(changes((q) => q.clear(), empty)).toBe(false)
    })
  }

  it('leaves revision unchanged on a failed call, and changes it by the elements addAll added before the failure [050 S1-AC4]', () => {
    const queue = new PriorityQueue<unknown>([1, 2, 3])
    const revision = queue.revision
    expect(caught(() => queue.add('x'))).toBeInstanceOf(ClassCastError)
    expect(caught(() => queue.add(undefined))).toBeInstanceOf(NullElementError)
    expect(queue.revision).toBe(revision)
    expect(caught(() => queue.addAll([4, 'x']))).toBeInstanceOf(ClassCastError)
    expect(queue.revision).not.toBe(revision)
    expect(queue.toArray().sort()).toEqual([1, 2, 3, 4])
  })
})

describe('PriorityQueue — fail-fast iteration', () => {
  const changedDuring =
    'ConcurrentModificationError: PriorityQueue[Symbol.iterator]().next: the collection was changed during iteration'
  const changedOutside =
    'ConcurrentModificationError: PriorityQueue.cursor: the collection was changed other than through this cursor'
  const changedByCallback =
    'ConcurrentModificationError: PriorityQueue.forEach: the collection was changed by the callback'

  for (const [name, make, extra] of [
    ['numbers', () => new PriorityQueue<unknown>([1, 2, 3]), 4],
    ['strings', () => new PriorityQueue<unknown>(['a', 'b', 'c']), 'd'],
  ] as Array<[string, () => PriorityQueue<unknown>, unknown]>) {
    it(`an iterator throws on its next next() after an add or a poll, for ${name} [050 S1-AC5]`, () => {
      for (const change of [
        (q: PriorityQueue<unknown>) => q.add(extra),
        (q: PriorityQueue<unknown>) => q.poll(),
      ]) {
        const queue = make()
        const iterator = queue[Symbol.iterator]()
        iterator.next()
        change(queue)
        expect(thrown(() => iterator.next())).toBe(changedDuring)
      }
    })

    it(`a cursor throws on next() and remove(), not hasNext(), after a change other than through it, for ${name} [050 S1-AC5]`, () => {
      const queue = make()
      const cursor = queue.cursor()
      cursor.next()
      queue.add(extra)
      expect(thrown(() => cursor.hasNext())).toBe('none')
      expect(thrown(() => cursor.next())).toBe(changedOutside)
      expect(thrown(() => cursor.remove())).toBe(changedOutside)
      // Removing through the cursor itself is not a change other than through it.
      const own = make()
      const walk = own.cursor()
      walk.next()
      walk.remove()
      expect(thrown(() => walk.next())).toBe('none')
    })

    it(`forEach throws as soon as the callback that changed the queue returns, even on the last element, for ${name} [050 S1-AC5]`, () => {
      const queue = make()
      let seen = 0
      expect(
        thrown(() =>
          queue.forEach(() => {
            seen++
            queue.add(extra)
          }),
        ),
      ).toBe(changedByCallback)
      expect(seen).toBe(1)
      const last = make()
      let count = 0
      expect(
        thrown(() =>
          last.forEach(() => {
            if (++count === 3) last.poll()
          }),
        ),
      ).toBe(changedByCallback)
    })
  }
})

describe('PriorityQueue — kinds of values in natural order', () => {
  const empties: Array<[string, (q: PriorityQueue<unknown>) => void]> = [
    [
      'poll',
      (q) => {
        while (!q.isEmpty()) q.poll()
      },
    ],
    ['clear', (q) => q.clear()],
    [
      'delete',
      (q) => {
        for (const v of q.toArray()) q.delete(v)
      },
    ],
    ['removeAll', (q) => q.removeAll(q.toArray())],
    ['removeIf', (q) => q.removeIf(() => true)],
    ['retainAll', (q) => q.retainAll([])],
    [
      'a cursor remove',
      (q) => {
        const cursor = q.cursor()
        while (cursor.hasNext()) {
          cursor.next()
          cursor.remove()
        }
      },
    ],
  ]
  for (const [name, empty] of empties) {
    it(`a queue emptied by ${name} accepts a value of another kind [050 S1-AC7]`, () => {
      const numbers = new PriorityQueue<unknown>([3, 1, 2])
      empty(numbers)
      expect(numbers.size).toBe(0)
      numbers.add('b').add('a')
      expect(drain(numbers)).toEqual(['a', 'b'])
      const strings = new PriorityQueue<unknown>(['c', 'a'])
      empty(strings)
      strings.add(2).add(1)
      expect(drain(strings)).toEqual([1, 2])
      const dates = new PriorityQueue<unknown>([1])
      empty(dates)
      dates.add(new Date(5)).add(new Date(1))
      expect(drain(dates).map((d) => (d as Date).getTime())).toEqual([1, 5])
    })
  }

  it('refuses a value with no natural order on an empty queue, with the same ClassCastError, and stays empty [050 S1-AC7]', () => {
    for (const [value, message] of [
      [{}, 'ClassCastError: PriorityQueue.add: object cannot be compared'],
      [Symbol('s'), 'ClassCastError: PriorityQueue.add: symbol cannot be compared'],
      [() => 1, 'ClassCastError: PriorityQueue.add: function cannot be compared'],
    ] as Array<[unknown, string]>) {
      const queue = new PriorityQueue<unknown>()
      const revision = queue.revision
      expect(thrown(() => queue.add(value))).toBe(message)
      expect(queue.size).toBe(0)
      expect(queue.revision).toBe(revision)
      // A queue emptied after holding numbers refuses it the same way.
      const emptied = new PriorityQueue<unknown>([1])
      emptied.poll()
      expect(thrown(() => emptied.add(value))).toBe(message)
    }
  })

  it('refuses a value of another kind with the new element first in the message, leaving the queue unchanged by it [050 S1-AC7]', () => {
    const cases: Array<[unknown[], unknown, string]> = [
      [[1, 2, 3], 'x', 'ClassCastError: PriorityQueue.add: string and number cannot be compared'],
      [[3], 'x', 'ClassCastError: PriorityQueue.add: string and number cannot be compared'],
      [['a'], 1, 'ClassCastError: PriorityQueue.add: number and string cannot be compared'],
      [
        ['b', 'a', 'c', 'd'],
        7,
        'ClassCastError: PriorityQueue.add: number and string cannot be compared',
      ],
      [
        [1, 2],
        new Date(0),
        'ClassCastError: PriorityQueue.add: date and number cannot be compared',
      ],
      [[1, 2], 2n, 'ClassCastError: PriorityQueue.add: bigint and number cannot be compared'],
      [['a'], {}, 'ClassCastError: PriorityQueue.add: object cannot be compared'],
      [
        [1],
        new Ranked(1),
        'ClassCastError: PriorityQueue.add: object and number cannot be compared',
      ],
    ]
    for (const [start, value, message] of cases) {
      const queue = new PriorityQueue<unknown>(start)
      const revision = queue.revision
      expect(
        thrown(() => queue.add(value)),
        String(value),
      ).toBe(message)
      expect(queue.toArray().sort(), String(value)).toEqual(start.slice().sort())
      expect(queue.revision).toBe(revision)
    }
    const queue = new PriorityQueue<unknown>([1, 2])
    expect(thrown(() => queue.addAll([4, 'x', 5]))).toBe(
      'ClassCastError: PriorityQueue.addAll: string and number cannot be compared',
    )
    expect(queue.toArray().sort()).toEqual([1, 2, 4])
  })

  it('keeps NaN after every other number and -0 equal to 0 [050 S1-AC7]', () => {
    const values = [3, Number.NaN, -1, 0, Number.NaN, -0, 2, -Infinity, Infinity, 0.5]
    const expected = [-Infinity, -1, 0, 0, 0.5, 2, 3, Infinity, Number.NaN, Number.NaN]
    const built = drain(new PriorityQueue(values))
    const added = new PriorityQueue<number>()
    for (const v of values) added.add(v)
    for (const out of [built, drain(added)]) {
      // -0 and 0 compare equal, so either may come first; compare them as 0.
      expect(out.map((z) => (z === 0 ? 0 : z))).toEqual(expected)
      // -0 and 0 are equal: both zeros come out together, between -1 and 0.5.
      expect(out.slice(2, 4).every((z) => z === 0)).toBe(true)
    }
    const zeros = new PriorityQueue([0, -0, 0, -0])
    expect(drain(zeros).filter((z) => Object.is(z, -0))).toHaveLength(2)
  })

  it('polls numbers and strings in the same order as values compared through [compareSymbol] [050 S1-AC2]', () => {
    for (const shape of [...SHAPES, 'random'] as const) {
      const values = shaped(shape, 500, 0x50)
      const plain = new PriorityQueue(values)
      const wrapped = new PriorityQueue(values.map((v) => new Ranked(v)))
      expect(drain(plain), shape).toEqual(drain(wrapped).map((r) => r.rank))
      const words = values.map((v) => `w${String(v).padStart(4, '0')}`)
      const stringQueue = new PriorityQueue<string>()
      for (const w of words) stringQueue.add(w)
      expect(drain(stringQueue), shape).toEqual(words.slice().sort())
    }
  })
})

describe('PriorityQueue — comparison counts and arguments', () => {
  const inputs = (n: number): Array<[string, number[]]> => [
    ...SHAPES.map((s): [string, number[]] => [s, shaped(s, n, 0x51)]),
    ['random', shaped('random', n, 0x52)],
  ]

  /** A comparator that counts its calls and checks its receiver and arguments. */
  function checking(allowed: Set<number>): { comparator: Comparator<number>; calls: () => number } {
    let calls = 0
    return {
      comparator: function (this: unknown, ...args: unknown[]): number {
        calls++
        if (this !== undefined) throw new Error('the comparator was called with a receiver')
        if (args.length !== 2) throw new Error(`the comparator was given ${args.length} arguments`)
        for (const arg of args) {
          if (typeof arg !== 'number' || !allowed.has(arg)) {
            throw new Error(`the comparator was given ${String(arg)}`)
          }
        }
        return (args[0] as number) - (args[1] as number)
      } as Comparator<number>,
      calls: () => calls,
    }
  }

  it('builds a queue of m elements with at most 2m comparisons [050 S2-AC1]', () => {
    for (const m of [1, 2, 3, 7, 64, 1000, 4097]) {
      for (const [shape, values] of inputs(m)) {
        const c = checking(new Set(values))
        new PriorityQueue(values, { comparator: c.comparator })
        expect(c.calls(), `${shape} ${m}`).toBeLessThanOrEqual(2 * m)
        Ranked.calls = 0
        new PriorityQueue(values.map((v) => new Ranked(v)))
        expect(Ranked.calls, `${shape} ${m}`).toBeLessThanOrEqual(2 * m)
      }
    }
  })

  it('adds with at most ⌊log2 n⌋ + 1 comparisons, n the size after the add [050 S2-AC2]', () => {
    for (const [shape, values] of inputs(2000)) {
      const c = checking(new Set(values))
      const queue = new PriorityQueue<number>({ comparator: c.comparator })
      const ranked = new PriorityQueue<Ranked>()
      for (const v of values) {
        const before = c.calls()
        queue.add(v)
        expect(c.calls() - before, shape).toBeLessThanOrEqual(log2(queue.size) + 1)
        Ranked.calls = 0
        ranked.add(new Ranked(v))
        expect(Ranked.calls, shape).toBeLessThanOrEqual(log2(ranked.size) + 1)
      }
    }
  })

  it('polls with at most 2⌊log2 n⌋ comparisons, n the size before the poll [050 S2-AC3]', () => {
    for (const [shape, values] of inputs(2000)) {
      const c = checking(new Set(values))
      const queue = new PriorityQueue(values, { comparator: c.comparator })
      const ranked = new PriorityQueue(values.map((v) => new Ranked(v)))
      while (!queue.isEmpty()) {
        const n = queue.size
        const before = c.calls()
        queue.poll()
        expect(c.calls() - before, shape).toBeLessThanOrEqual(2 * log2(n))
        Ranked.calls = 0
        ranked.poll()
        expect(Ranked.calls, shape).toBeLessThanOrEqual(2 * log2(n))
      }
    }
  })

  it('calls the comparator with this undefined and two arguments, each an element or the one being added [050 S2-AC4]', () => {
    const random = seeded(0x54)
    const pool = Array.from({ length: 200 }, (_, i) => i * 3)
    const c = checking(new Set(pool))
    const queue = new PriorityQueue(pool.slice(0, 50), { comparator: c.comparator })
    for (let step = 0; step < 5000; step++) {
      const op = integer(random, 0, 5)
      if (op <= 2) queue.add(pick(random, pool))
      else if (op === 3) queue.poll()
      else if (op === 4) queue.delete(pick(random, pool))
      else queue.removeIf((v) => v % 7 === step % 7)
    }
    queue.addAll(pool.slice(0, 20))
    queue.retainAll(pool.slice(0, 100))
    queue.removeAll(pool.slice(0, 10))
    const cursor = queue.cursor()
    while (cursor.hasNext()) if ((cursor.next() as number) % 2 === 0) cursor.remove()
    expect(c.calls()).toBeGreaterThan(0)
  })
})

// ── Seeded model ──

/** How a model run orders its values: natural order of one kind, a mix, or a comparator. */
interface Mode {
  readonly name: string
  /** Builds an empty queue. */
  make(): PriorityQueue<unknown>
  /** Builds a queue of `values`, by the constructor or by `from`. */
  build(values: unknown[], viaFrom: boolean): PriorityQueue<unknown>
  /** A value to add, drawn from `random`. */
  value(random: () => number): unknown
  /** The model's order: negative, zero or positive; throws as the queue would. */
  compare(a: unknown, b: unknown): number
  /** Whether `value` may join a queue holding `held` (natural order refuses mixed kinds). */
  accepts(value: unknown, held: readonly unknown[]): boolean
}

function kindOf(value: unknown): string {
  if (value instanceof Date) return 'date'
  if (value instanceof Ranked) return 'ranked'
  return typeof value
}

function naturalCompare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') {
    if (a < b) return -1
    if (a > b) return 1
    if (a === b) return 0
    if (Number.isNaN(a)) return Number.isNaN(b) ? 0 : 1
    return -1
  }
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0
  if (a instanceof Date && b instanceof Date) return naturalCompare(a.getTime(), b.getTime())
  return (a as Ranked).rank - (b as Ranked).rank
}

const sameKind = (value: unknown, held: readonly unknown[]): boolean =>
  held.length === 0 || kindOf(held[0]) === kindOf(value)

const DATES = Array.from({ length: 12 }, (_, i) => new Date(i * 1000))
const RANKS = Array.from({ length: 12 }, (_, i) => new Ranked(i % 6))

const MODES: Mode[] = [
  {
    name: 'numbers',
    make: () => new PriorityQueue<unknown>(),
    build: (values, viaFrom) =>
      viaFrom ? PriorityQueue.from<unknown>(values) : new PriorityQueue<unknown>(values),
    value: (random) => pick(random, [0, -0, 1, 2, 3, 5, 8, 13, -4, 0.5, Number.NaN, Infinity]),
    compare: naturalCompare,
    accepts: sameKind,
  },
  {
    name: 'strings',
    make: () => new PriorityQueue<unknown>(),
    build: (values, viaFrom) =>
      viaFrom ? PriorityQueue.from<unknown>(values) : new PriorityQueue<unknown>(values),
    value: (random) => pick(random, ['', 'a', 'b', 'ab', 'B', 'z', 'é', '\u{1f600}', 'aa', 'm']),
    compare: naturalCompare,
    accepts: sameKind,
  },
  {
    name: 'dates',
    make: () => new PriorityQueue<unknown>(),
    build: (values, viaFrom) =>
      viaFrom ? PriorityQueue.from<unknown>(values) : new PriorityQueue<unknown>(values),
    value: (random) => pick(random, DATES),
    compare: naturalCompare,
    accepts: sameKind,
  },
  {
    name: '[compareSymbol] objects',
    make: () => new PriorityQueue<unknown>(),
    build: (values, viaFrom) =>
      viaFrom ? PriorityQueue.from<unknown>(values) : new PriorityQueue<unknown>(values),
    value: (random) => pick(random, RANKS),
    compare: naturalCompare,
    accepts: sameKind,
  },
  {
    name: 'a mix natural order rejects',
    make: () => new PriorityQueue<unknown>(),
    build: (values, viaFrom) =>
      viaFrom ? PriorityQueue.from<unknown>(values) : new PriorityQueue<unknown>(values),
    value: (random) => pick(random, [1, 2, 3, 7, 'a', 'b', 'q']),
    compare: naturalCompare,
    accepts: sameKind,
  },
  {
    name: 'a comparator with ties',
    make: () =>
      new PriorityQueue<unknown>({
        comparator: (a, b) => ((a as number) % 4) - ((b as number) % 4),
      }),
    build: (values, viaFrom) => {
      const comparator = (a: unknown, b: unknown) => ((a as number) % 4) - ((b as number) % 4)
      return viaFrom
        ? PriorityQueue.from<unknown>(values, { comparator })
        : new PriorityQueue<unknown>(values, { comparator })
    },
    value: (random) => integer(random, 0, 15),
    compare: (a, b) => ((a as number) % 4) - ((b as number) % 4),
    accepts: () => true,
  },
]

/** The text of one element as the queue prints it: from a queue holding only that element. */
function printed(value: unknown): string {
  const text = new PriorityQueue([value]).toString()
  return text.slice(text.indexOf('[') + 1, -1)
}

function sameValue(a: unknown, b: unknown): boolean {
  return a === b || Object.is(a, b)
}

function multisetOf(values: readonly unknown[]): string[] {
  return values.map((v) => `${kindOf(v)}:${Object.is(v, -0) ? '0' : printed(v)}`).sort()
}

function runQueueModel(mode: Mode, seed: number, steps: number): void {
  const random = seeded(seed)
  let queue = mode.make()
  const model: unknown[] = []
  const label = `${mode.name} seed ${seed}`
  let held: { iterator: Iterator<unknown>; stale: boolean; finished: boolean } | undefined
  const least = (): unknown => {
    let best = model[0]
    for (const v of model) if (mode.compare(v, best) < 0) best = v
    return best
  }
  const remove = (value: unknown): void => {
    const i = model.findIndex((v) => sameValue(v, value))
    if (i < 0) throw new Error(`${label}: ${String(value)} is not in the model`)
    model.splice(i, 1)
  }
  const expectError = (
    fn: () => unknown,
    type: abstract new (...args: never[]) => unknown,
    method: string,
    at: string,
  ): void => {
    const error = caught(fn)
    expect(error, at).toBeInstanceOf(type)
    expect((error as Error).message.startsWith(`PriorityQueue.${method}:`), at).toBe(true)
  }
  const ops = [
    'add',
    'add',
    'add',
    'add',
    'addAll',
    'poll',
    'poll',
    'peek',
    'has',
    'delete',
    'removeAll',
    'retainAll',
    'removeIf',
    'clear',
    'read',
    'equals',
    'copy',
    'forEach',
    'cursor',
    'hold',
    'advance',
    'null',
    'rebuild',
  ]
  for (let step = 0; step < steps; step++) {
    const op = model.length > 40 ? pick(random, ['poll', 'delete', 'removeIf']) : pick(random, ops)
    const at = `${label} step ${step} ${op}`
    let revision = queue.revision
    let structural = false
    switch (op) {
      case 'rebuild': {
        // The queue is replaced by one built from the model's elements in a shuffled order.
        const values = model.slice()
        for (let i = values.length - 1; i > 0; i--) {
          const j = integer(random, 0, i)
          const t = values[i]
          values[i] = values[j]
          values[j] = t
        }
        queue = mode.build(values, random() < 0.5)
        revision = queue.revision
        held = undefined
        expect(multisetOf(queue.toArray()), at).toEqual(multisetOf(model))
        break
      }
      case 'add': {
        const v = mode.value(random)
        if (mode.accepts(v, model)) {
          expect(queue.add(v), at).toBe(queue)
          model.push(v)
          structural = true
        } else expectError(() => queue.add(v), ClassCastError, 'add', at)
        break
      }
      case 'addAll': {
        const values = Array.from({ length: integer(random, 0, 3) }, () => mode.value(random))
        let accepted = 0
        const trial = model.slice()
        while (accepted < values.length && mode.accepts(values[accepted], trial)) {
          trial.push(values[accepted])
          accepted++
        }
        if (accepted === values.length) expect(queue.addAll(values), at).toBe(values.length > 0)
        else expectError(() => queue.addAll(values), ClassCastError, 'addAll', at)
        for (let i = 0; i < accepted; i++) model.push(values[i])
        structural = accepted > 0
        break
      }
      case 'poll': {
        const out = queue.poll()
        if (model.length === 0) expect(out, at).toBeUndefined()
        else {
          expect(mode.compare(out, least()), at).toBe(0)
          remove(out)
          structural = true
        }
        break
      }
      case 'peek': {
        const top = queue.peek()
        if (model.length === 0) expect(top, at).toBeUndefined()
        else {
          expect(mode.compare(top, least()), at).toBe(0)
          expect(
            model.some((v) => sameValue(v, top)),
            at,
          ).toBe(true)
        }
        break
      }
      case 'has': {
        const v = mode.value(random)
        expect(queue.has(v), at).toBe(model.some((m) => sameValue(m, v)))
        break
      }
      case 'delete': {
        const v = mode.value(random)
        const present = model.some((m) => sameValue(m, v))
        expect(queue.delete(v), at).toBe(present)
        if (present) {
          remove(v)
          structural = true
        }
        break
      }
      case 'removeAll':
      case 'retainAll': {
        const values = Array.from({ length: integer(random, 0, 3) }, () => mode.value(random))
        const listed = (m: unknown) => values.some((v) => sameValue(v, m))
        const keep = model.filter((m) => (op === 'removeAll' ? !listed(m) : listed(m)))
        const result = op === 'removeAll' ? queue.removeAll(values) : queue.retainAll(values)
        expect(result, at).toBe(keep.length < model.length)
        structural = keep.length < model.length
        model.length = 0
        model.push(...keep)
        break
      }
      case 'removeIf': {
        const v = mode.value(random)
        const doomed = (m: unknown) => mode.compare(m, v) === 0
        const keep = model.filter((m) => !doomed(m))
        expect(queue.removeIf(doomed), at).toBe(keep.length < model.length)
        structural = keep.length < model.length
        model.length = 0
        model.push(...keep)
        break
      }
      case 'clear':
        if (random() < 0.3) {
          queue.clear()
          structural = model.length > 0
          model.length = 0
        }
        break
      case 'read': {
        expect(queue.size, at).toBe(model.length)
        expect(queue.isEmpty(), at).toBe(model.length === 0)
        expect(multisetOf(queue.toArray()), at).toEqual(multisetOf(model))
        expect(multisetOf([...queue]), at).toEqual(multisetOf(model))
        const text = queue.toString()
        expect(text.startsWith(`PriorityQueue(${model.length}) [`), at).toBe(true)
        expect(text, at).toBe(
          `PriorityQueue(${model.length}) [${queue.toArray().map(printed).join(', ')}]`,
        )
        expect(JSON.stringify(queue.toJSON()), at).toBe(JSON.stringify(queue.toArray()))
        break
      }
      case 'equals':
        expect(queue.equals(queue), at).toBe(true)
        expect(queue.equals(queue.copy()), at).toBe(false)
        break
      case 'copy': {
        const copy = queue.copy()
        expect(multisetOf(copy.toArray()), at).toEqual(multisetOf(model))
        const order = drain(copy)
        for (let i = 1; i < order.length; i++)
          expect(mode.compare(order[i - 1], order[i]), at).toBeLessThanOrEqual(0)
        break
      }
      case 'forEach': {
        const seen: unknown[] = []
        queue.forEach((v) => {
          seen.push(v)
        })
        expect(multisetOf(seen), at).toEqual(multisetOf(model))
        break
      }
      case 'cursor': {
        const v = mode.value(random)
        const cursor = queue.cursor()
        const seen: unknown[] = []
        let removed = 0
        while (cursor.hasNext()) {
          const x = cursor.next()
          seen.push(x)
          if (mode.compare(x, v) < 0) {
            cursor.remove()
            removed++
          }
        }
        expect(multisetOf(seen), at).toEqual(multisetOf(model))
        const keep = model.filter((m) => !(mode.compare(m, v) < 0))
        expect(removed, at).toBe(model.length - keep.length)
        structural = removed > 0
        model.length = 0
        model.push(...keep)
        break
      }
      case 'hold':
        held = { iterator: queue[Symbol.iterator](), stale: false, finished: false }
        break
      case 'advance':
        if (held !== undefined) {
          const h = held
          if (h.finished) {
            // Once done, an iterator stays done.
            expect(h.iterator.next().done, at).toBe(true)
          } else if (h.stale) {
            expect(
              caught(() => h.iterator.next()),
              at,
            ).toBeInstanceOf(ConcurrentModificationError)
            held = undefined
          } else {
            const step = h.iterator.next()
            if (step.done) h.finished = true
            else
              expect(
                model.some((m) => sameValue(m, step.value)),
                at,
              ).toBe(true)
          }
        }
        break
      case 'null':
        expectError(() => queue.add(random() < 0.5 ? null : undefined), NullElementError, 'add', at)
        break
    }
    expect(queue.revision !== revision, at).toBe(structural)
    if (structural && held !== undefined) held.stale = true
    expect(queue.size, at).toBe(model.length)
  }
  // Drained, the queue gives the model in order.
  const out = drain(queue)
  expect(multisetOf(out), label).toEqual(multisetOf(model))
  for (let i = 1; i < out.length; i++)
    expect(mode.compare(out[i - 1], out[i]), label).toBeLessThanOrEqual(0)
}

describe('PriorityQueue — seeded model', () => {
  for (const mode of MODES) {
    it(`matches a sorted-array model over 10 seeded runs of 10,000 calls, ${mode.name} [050 S1-AC2]`, () => {
      for (let run = 0; run < 10; run++)
        runQueueModel(mode, 0x5000 + run * 31 + mode.name.length, 10_000)
    })
  }
})

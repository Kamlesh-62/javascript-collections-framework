import { describe, expect, it } from 'vitest'
import {
  type Comparator,
  ConcurrentModificationError,
  compareSymbol,
  type MapEntry,
  naturalOrder,
  TreeMap,
  TreeSet,
} from '../src/index'
import { integer, pick, seeded } from './support/random'

// The behaviour of `TreeMap` and `TreeSet` that their internal fast paths must keep: what a failing
// or meddling comparator leaves, which keys natural order refuses and with what message, how a
// collection moves between kinds of keys, when `revision` changes, where fail-fast iteration
// throws, how many comparisons each lookup makes, and what every public method returns, checked
// against a model built on a sorted native array.

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

/** A value ordered by `rank` through `[compareSymbol]`, with an optional hook run on each call. */
class Ranked {
  static hook: ((self: Ranked, other: unknown) => void) | undefined
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

// ── Failing and meddling comparisons ──

describe('a failing or meddling comparison', () => {
  it('leaves the map unchanged when its comparator throws, returns an invalid result or changes it [051 S1-AC4]', () => {
    let map: TreeMap<number, number>
    let mode = 'ok'
    const comparator: Comparator<number> = (a, b) => {
      if (mode === 'throw' && (a === 99 || b === 99)) throw new RangeError('boom')
      if (mode === 'invalid' && (a === 99 || b === 99)) return 'x' as unknown as number
      if (mode === 'meddle' && (a === 99 || b === 99)) {
        mode = 'ok'
        map.set(500, 5)
      }
      return a - b
    }
    map = new TreeMap<number, number>(
      [
        [1, 1],
        [2, 2],
        [3, 3],
      ],
      { comparator },
    )
    const cases: Array<[string, string, () => unknown]> = [
      ['throw', 'RangeError: boom', () => map.set(99, 1)],
      ['throw', 'RangeError: boom', () => map.get(99)],
      ['throw', 'RangeError: boom', () => map.has(99)],
      ['throw', 'RangeError: boom', () => map.delete(99)],
      ['invalid', 'TypeError: TreeMap.set: comparator returned "x"', () => map.set(99, 1)],
      ['invalid', 'TypeError: TreeMap.get: comparator returned "x"', () => map.get(99)],
      ['invalid', 'TypeError: TreeMap.has: comparator returned "x"', () => map.has(99)],
      ['invalid', 'TypeError: TreeMap.delete: comparator returned "x"', () => map.delete(99)],
    ]
    for (const [m, message, call] of cases) {
      mode = m
      const revision = map.revision
      expect(thrown(call)).toBe(message)
      expect(map.toJSON()).toEqual([
        [1, 1],
        [2, 2],
        [3, 3],
      ])
      expect(map.revision).toBe(revision)
    }
    mode = 'meddle'
    expect(thrown(() => map.set(99, 1))).toBe(
      'ConcurrentModificationError: TreeMap.set: the map was changed by the comparator',
    )
    // The comparator's own change stays; the call itself added nothing.
    expect(map.toJSON()).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
      [500, 5],
    ])
  })

  it('leaves the set unchanged when a key compare method throws or changes it [051 S1-AC4]', () => {
    const set = new TreeSet([new Ranked(1), new Ranked(2), new Ranked(3)])
    const revision = set.revision
    Ranked.hook = () => {
      throw new RangeError('rank')
    }
    try {
      for (const call of [
        () => set.add(new Ranked(9)),
        () => set.has(new Ranked(9)),
        () => set.delete(new Ranked(2)),
      ]) {
        expect(thrown(call)).toBe('RangeError: rank')
      }
      Ranked.hook = (self) => {
        if (self.rank === 9) {
          Ranked.hook = undefined
          set.add(new Ranked(50))
        }
      }
      expect(thrown(() => set.add(new Ranked(9)))).toBe(
        'ConcurrentModificationError: TreeSet.add: the set was changed by the comparator',
      )
    } finally {
      Ranked.hook = undefined
    }
    expect(set.toArray().map(String)).toEqual(['r1', 'r2', 'r3', 'r50'])
    expect(set.revision).not.toBe(revision)
  })

  it('leaves the map unchanged when its comparator changes it during a lookup [051 S1-AC4]', () => {
    let map: TreeMap<number, number>
    let meddle = false
    const comparator: Comparator<number> = (a, b) => {
      if (meddle) {
        meddle = false
        map.set(500, 5)
      }
      return a - b
    }
    map = new TreeMap<number, number>(
      [
        [1, 1],
        [2, 2],
      ],
      { comparator },
    )
    for (const [method, call] of [
      ['get', () => map.get(2)],
      ['has', () => map.has(2)],
      ['delete', () => map.delete(2)],
    ] as const) {
      map.delete(500)
      meddle = true
      expect(thrown(call)).toBe(
        `ConcurrentModificationError: TreeMap.${method}: the map was changed by the comparator`,
      )
      expect(map.toJSON()).toEqual([
        [1, 1],
        [2, 2],
        [500, 5],
      ])
    }
  })

  it('leaves the map unchanged when a key compare method throws, returns an invalid result or changes it [051 S1-AC4]', () => {
    const map = new TreeMap<Ranked, number>([
      [new Ranked(1), 1],
      [new Ranked(2), 2],
      [new Ranked(3), 3],
    ])
    const contents = () => map.toJSON().map(([k, v]) => `${k}:${v}`)
    const start = contents()
    const revision = map.revision
    try {
      Ranked.hook = () => {
        throw new RangeError('rank')
      }
      for (const call of [
        () => map.set(new Ranked(9), 9),
        () => map.get(new Ranked(2)),
        () => map.has(new Ranked(2)),
        () => map.delete(new Ranked(2)),
      ]) {
        expect(thrown(call)).toBe('RangeError: rank')
      }
      Ranked.hook = undefined
      const odd = { [compareSymbol]: () => 'x', toString: () => 'odd' } as unknown as Ranked
      for (const [method, call] of [
        ['set', () => map.set(odd, 0)],
        ['get', () => map.get(odd)],
        ['has', () => map.has(odd)],
        ['delete', () => map.delete(odd)],
      ] as const) {
        const error = caught(call) as Error
        expect(error).toBeInstanceOf(TypeError)
        expect(error.message.startsWith(`TreeMap.${method}:`)).toBe(true)
      }
      expect(contents()).toEqual(start)
      expect(map.revision).toBe(revision)
      for (const [method, call] of [
        ['get', () => map.get(new Ranked(2))],
        ['has', () => map.has(new Ranked(2))],
        ['delete', () => map.delete(new Ranked(2))],
      ] as const) {
        let once = true
        Ranked.hook = () => {
          if (once) {
            once = false
            map.set(new Ranked(50 + map.size), 0)
          }
        }
        expect(thrown(call)).toBe(
          `ConcurrentModificationError: TreeMap.${method}: the map was changed by the comparator`,
        )
        Ranked.hook = undefined
      }
    } finally {
      Ranked.hook = undefined
    }
    // Only the compare method's own additions stay.
    expect(contents().slice(0, 3)).toEqual(start)
  })

  it('keeps what putAll, addAll and replaceAll changed before a failure [051 S1-AC4]', () => {
    let fail = false
    const comparator: Comparator<number> = (a, b) => {
      if (fail && (a === 7 || b === 7)) throw new RangeError('seven')
      return a - b
    }
    const map = new TreeMap<number, number>([[1, 1]], { comparator })
    fail = true
    const before = map.revision
    expect(
      thrown(() =>
        map.putAll([
          [2, 2],
          [7, 7],
          [3, 3],
        ]),
      ),
    ).toBe('RangeError: seven')
    expect(map.toJSON()).toEqual([
      [1, 1],
      [2, 2],
    ])
    expect(map.revision).not.toBe(before)

    const set = new TreeSet([3])
    const setBefore = set.revision
    expect(thrown(() => set.addAll([4, 'x' as unknown as number, 5]))).toBe(
      'ClassCastError: TreeSet.addAll: string and number cannot be compared',
    )
    expect(set.toArray()).toEqual([3, 4])
    expect(set.revision).not.toBe(setBefore)

    const values = new TreeMap<number, number>([
      [1, 1],
      [2, 2],
      [3, 3],
    ])
    expect(
      thrown(() =>
        values.replaceAll((v) => {
          if (v === 3) throw new RangeError('three')
          return v * 10
        }),
      ),
    ).toBe('RangeError: three')
    expect(values.toJSON()).toEqual([
      [1, 10],
      [2, 20],
      [3, 3],
    ])
  })
})

// ── Natural order ──

describe('natural order', () => {
  it('refuses null and undefined keys with NullElementError [051 S1-AC5]', () => {
    const map = new TreeMap<number, number>([[1, 1]])
    const set = new TreeSet<number>([1])
    for (const missing of [null, undefined]) {
      expect(thrown(() => map.set(missing as unknown as number, 1))).toBe(
        `NullElementError: TreeMap.set: ${missing} is not allowed as a key`,
      )
      expect(thrown(() => set.add(missing as unknown as number))).toBe(
        `NullElementError: TreeSet.add: ${missing} is not allowed as an element`,
      )
      expect(map.get(missing as unknown as number)).toBe(undefined)
      expect(map.has(missing as unknown as number)).toBe(false)
      expect(map.delete(missing as unknown as number)).toBe(false)
      expect(set.has(missing as unknown as number)).toBe(false)
      expect(set.delete(missing as unknown as number)).toBe(false)
    }
    expect(map.toJSON()).toEqual([[1, 1]])
    expect(set.toArray()).toEqual([1])
  })

  it('refuses keys with no natural order or of another kind with ClassCastError [051 S1-AC5]', () => {
    const numbers = new TreeMap<unknown, number>([[1, 1]])
    const strings = new TreeMap<unknown, number>([['a', 1]])
    const set = new TreeSet<unknown>([1])
    const revisions = [numbers.revision, strings.revision, set.revision]
    expect(thrown(() => numbers.set('x', 1))).toBe(
      'ClassCastError: TreeMap.set: string and number cannot be compared',
    )
    expect(thrown(() => strings.set(1, 1))).toBe(
      'ClassCastError: TreeMap.set: number and string cannot be compared',
    )
    expect(thrown(() => numbers.set({}, 1))).toBe(
      'ClassCastError: TreeMap.set: object cannot be compared',
    )
    expect(thrown(() => numbers.set(Symbol('s'), 1))).toBe(
      'ClassCastError: TreeMap.set: symbol cannot be compared',
    )
    expect(thrown(() => numbers.set(new Date(1), 1))).toBe(
      'ClassCastError: TreeMap.set: date and number cannot be compared',
    )
    expect(thrown(() => new TreeMap<unknown, number>().set({}, 1))).toBe(
      'ClassCastError: TreeMap.set: object cannot be compared',
    )
    expect(thrown(() => set.add('x'))).toBe(
      'ClassCastError: TreeSet.add: string and number cannot be compared',
    )
    expect(thrown(() => new TreeSet<unknown>().add({}))).toBe(
      'ClassCastError: TreeSet.add: object cannot be compared',
    )
    for (const key of ['x', {}, new Date(1), 1n]) {
      expect(numbers.get(key)).toBe(undefined)
      expect(numbers.has(key)).toBe(false)
      expect(numbers.delete(key)).toBe(false)
      expect(set.has(key)).toBe(false)
      expect(set.delete(key)).toBe(false)
    }
    expect(strings.get(1)).toBe(undefined)
    expect([numbers.revision, strings.revision, set.revision]).toEqual(revisions)
    expect(numbers.toJSON()).toEqual([[1, 1]])
  })

  it('keeps NaN last and equal to itself and stores -0 as 0 [051 S1-AC5]', () => {
    const map = new TreeMap<number, string>([
      [3, 't'],
      [Number.NaN, 'n'],
      [-1, 'm'],
    ])
    map.set(-0, 'z')
    expect(map.toJSON()).toEqual([
      [-1, 'm'],
      [0, 'z'],
      [3, 't'],
      [Number.NaN, 'n'],
    ])
    expect(Object.is(map.firstEntry()?.key, -1)).toBe(true)
    expect(Object.is([...map.keys()][1], 0)).toBe(true)
    expect(map.get(0)).toBe('z')
    expect(map.get(-0)).toBe('z')
    expect(map.get(Number.NaN)).toBe('n')
    map.set(Number.NaN, 'N')
    expect(map.size).toBe(4)
    expect(map.lastEntry()?.value).toBe('N')
    expect(map.delete(-0)).toBe(true)
    expect(map.delete(Number.NaN)).toBe(true)
    expect(map.toJSON()).toEqual([
      [-1, 'm'],
      [3, 't'],
    ])
    const set = new TreeSet<number>([Number.NaN, 2])
    set.add(-0)
    expect(Object.is(set.getFirst(), 0)).toBe(true)
    expect(set.has(0)).toBe(true)
    expect(set.getLast()).toBeNaN()
  })

  it('accepts a key of another kind once the map becomes empty, by every removing path [051 S1-AC6]', () => {
    const empties: Array<[string, (m: TreeMap<unknown, number>) => void]> = [
      ['delete', (m) => m.delete(1) && m.delete(2)],
      [
        'remove',
        (m) => {
          m.remove(1)
          m.remove(2)
        },
      ],
      ['clear', (m) => m.clear()],
      [
        'pollFirstEntry',
        (m) => {
          m.pollFirstEntry()
          m.pollFirstEntry()
        },
      ],
      [
        'pollLastEntry',
        (m) => {
          m.pollLastEntry()
          m.pollLastEntry()
        },
      ],
      [
        'compute',
        (m) => {
          m.compute(1, () => undefined)
          m.compute(2, () => undefined)
        },
      ],
      [
        'computeIfPresent',
        (m) => {
          m.computeIfPresent(1, () => undefined)
          m.computeIfPresent(2, () => undefined)
        },
      ],
      [
        'merge',
        (m) => {
          m.merge(1, 0, () => undefined)
          m.merge(2, 0, () => undefined)
        },
      ],
      ['keySet().removeIf', (m) => m.keySet().removeIf(() => true)],
      ['keySet().removeAll', (m) => m.keySet().removeAll([1, 2])],
      ['keySet().retainAll', (m) => m.keySet().retainAll([])],
      [
        'keySet().removeFirst',
        (m) => {
          m.keySet().removeFirst()
          m.keySet().removeLast()
        },
      ],
      [
        'keySet().pollFirst',
        (m) => {
          m.keySet().pollFirst()
          m.keySet().pollLast()
        },
      ],
      [
        'keySet().cursor',
        (m) => {
          const c = m.keySet().cursor()
          while (c.hasNext()) {
            c.next()
            c.remove()
          }
        },
      ],
      ['entrySet().removeIf', (m) => m.entrySet().removeIf(() => true)],
      ['entrySet().clear', (m) => m.entrySet().clear()],
      ['valueCollection().removeIf', (m) => m.valueCollection().removeIf(() => true)],
      ['valueCollection().clear', (m) => m.valueCollection().clear()],
      ['reversed().clear', (m) => m.reversed().clear()],
      ['subMap().clear', (m) => m.subMap(0, 10).clear()],
      [
        'headMap().pollFirstEntry',
        (m) => {
          m.headMap(5).pollFirstEntry()
          m.headMap(5).pollFirstEntry()
        },
      ],
    ]
    for (const [name, empty] of empties) {
      const map = new TreeMap<unknown, number>([
        [1, 1],
        [2, 2],
      ])
      empty(map)
      expect(map.size, name).toBe(0)
      map.set('a', 1)
      map.set('b', 2)
      expect(map.toJSON(), name).toEqual([
        ['a', 1],
        ['b', 2],
      ])
      expect(map.get('a'), name).toBe(1)
      expect(map.get(1), name).toBe(undefined)
      expect(
        thrown(() => map.set(3, 3)),
        name,
      ).toBe('ClassCastError: TreeMap.set: number and string cannot be compared')
    }
  })

  it('accepts an element of another kind once the set becomes empty, by every removing path [051 S1-AC6]', () => {
    const empties: Array<[string, (s: TreeSet<unknown>) => void]> = [
      [
        'delete',
        (s) => {
          s.delete(1)
          s.delete(2)
        },
      ],
      ['clear', (s) => s.clear()],
      [
        'pollFirst',
        (s) => {
          s.pollFirst()
          s.pollLast()
        },
      ],
      [
        'removeFirst',
        (s) => {
          s.removeFirst()
          s.removeLast()
        },
      ],
      ['removeIf', (s) => s.removeIf(() => true)],
      ['removeAll', (s) => s.removeAll([1, 2])],
      ['retainAll', (s) => s.retainAll([])],
      [
        'cursor',
        (s) => {
          const c = s.cursor()
          while (c.hasNext()) {
            c.next()
            c.remove()
          }
        },
      ],
      ['reversed().clear', (s) => s.reversed().clear()],
      ['subSet().clear', (s) => s.subSet(0, 10).clear()],
      ['tailSet().removeIf', (s) => s.tailSet(0).removeIf(() => true)],
    ]
    for (const [name, empty] of empties) {
      const set = new TreeSet<unknown>([1, 2])
      empty(set)
      expect(set.size, name).toBe(0)
      set.add('b')
      set.add('a')
      expect(set.toArray(), name).toEqual(['a', 'b'])
      expect(
        thrown(() => set.add(3)),
        name,
      ).toBe('ClassCastError: TreeSet.add: number and string cannot be compared')
    }
  })
})

// ── Comparison counts ──

function ceilLog2(n: number): number {
  return Math.ceil(Math.log2(n + 1))
}

describe('comparison counts', () => {
  it('makes at most 2⌈log2(n + 1)⌉ comparisons per get, has and delete and two more per set [051 S2-AC1]', () => {
    for (const ordered of [false, true]) {
      for (const n of [1, 2, 3, 7, 64, 100, 1_000, 4_096]) {
        const random = seeded(n * 31 + (ordered ? 1 : 0))
        const keys = Array.from({ length: n }, (_, i) => i * 2)
        if (!ordered) {
          for (let i = keys.length - 1; i > 0; i--) {
            const j = integer(random, 0, i)
            ;[keys[i], keys[j]] = [keys[j] as number, keys[i] as number]
          }
        }
        let calls = 0
        const map = new TreeMap<number, number>({
          comparator: (a, b) => {
            calls++
            return a - b
          },
        })
        let size = 0
        for (const k of keys) {
          calls = 0
          map.set(k, k)
          size++
          expect(calls).toBeLessThanOrEqual(2 * ceilLog2(size - 1) + 2)
        }
        for (let q = 0; q < 200; q++) {
          const k = integer(random, -1, 2 * n)
          for (const call of [() => map.get(k), () => map.has(k)]) {
            calls = 0
            call()
            expect(calls).toBeLessThanOrEqual(2 * ceilLog2(map.size))
          }
          let before = map.size
          calls = 0
          map.set(k, k)
          expect(calls).toBeLessThanOrEqual(2 * ceilLog2(before) + 2)
          before = map.size
          calls = 0
          map.delete(integer(random, -1, 2 * n))
          expect(calls).toBeLessThanOrEqual(2 * ceilLog2(before))
        }
      }
    }
  })

  it('counts compare-method calls of keys within the same bounds [051 S2-AC1]', () => {
    for (const n of [1, 5, 100, 1_000]) {
      const random = seeded(n)
      const map = new TreeMap<Ranked, number>()
      for (let i = 0; i < n; i++) {
        Ranked.calls = 0
        map.set(new Ranked(integer(random, 0, 4 * n)), i)
        // On an empty map, natural order compares the key with itself first.
        expect(Ranked.calls).toBeLessThanOrEqual(2 * ceilLog2(map.size) + 2)
      }
      for (let q = 0; q < 100; q++) {
        const key = new Ranked(integer(random, 0, 4 * n))
        for (const call of [() => map.get(key), () => map.has(key), () => map.delete(key)]) {
          const size = map.size
          Ranked.calls = 0
          call()
          expect(Ranked.calls).toBeLessThanOrEqual(2 * ceilLog2(size))
        }
      }
    }
  })

  it('calls the comparator with this undefined and two arguments, each the given or a stored key [051 S2-AC2]', () => {
    const stored = new Set<unknown>()
    let given: unknown
    let bad = 0
    const map = new TreeMap<number | undefined, number>({
      comparator: function (this: unknown, ...args: Array<number | undefined>) {
        const [a, b] = args
        if (this !== undefined || args.length !== 2) bad++
        for (const x of [a, b]) if (x !== given && !stored.has(x)) bad++
        return (a ?? -1) - (b ?? -1)
      },
    })
    const random = seeded(5)
    for (let i = 0; i < 2_000; i++) {
      const k = random() < 0.02 ? undefined : integer(random, 0, 300)
      given = k
      switch (integer(random, 0, 3)) {
        case 0:
          map.set(k, 1)
          stored.add(k)
          break
        case 1:
          map.get(k)
          break
        case 2:
          map.has(k)
          break
        default:
          if (map.delete(k)) stored.delete(k)
      }
    }
    expect(bad).toBe(0)
  })
})

// ── The seeded model ──

type Mode = 'numbers' | 'strings' | 'dates' | 'ranked' | 'mix' | 'comparator'
const MODES: readonly Mode[] = ['numbers', 'strings', 'dates', 'ranked', 'mix', 'comparator']

/** A key generator per mode; `mix` draws mostly numbers, some strings and some refused keys. */
function keyMaker(mode: Mode, random: () => number): () => unknown {
  const n = () => integer(random, 0, 40)
  switch (mode) {
    case 'numbers':
      return () => {
        const r = random()
        if (r < 0.03) return Number.NaN
        if (r < 0.06) return -0
        return n()
      }
    case 'strings':
      return () => `k${n()}`
    case 'dates':
      return () => new Date(n())
    case 'ranked':
      return () => new Ranked(n())
    case 'comparator':
      return n
    default:
      return () => {
        const r = random()
        if (r < 0.04) return null
        if (r < 0.07) return {}
        if (r < 0.2) return `k${n()}`
        return n()
      }
  }
}

const natural: Comparator<unknown> = naturalOrder()
const byNumber: Comparator<unknown> = (a, b) => (a as number) - (b as number)

/** The order the model sorts by, or `undefined` when the two keys cannot be compared. */
function modelCompare(mode: Mode, a: unknown, b: unknown): number | undefined {
  if (mode === 'comparator') return byNumber(a, b)
  try {
    return natural(a, b)
  } catch {
    return undefined
  }
}

interface MapCell {
  k: unknown
  v: number
  removed: boolean
}

interface Held {
  it: Iterator<unknown>
  items: unknown[]
  pos: number
  stale: boolean
  done: boolean
}

/** Expected `<name>` of the error `fn` should throw in natural order, or `undefined`. */
function refusal(mode: Mode, key: unknown, stored: unknown | undefined): string | undefined {
  if (mode === 'comparator') return undefined
  if (key === null || key === undefined) return 'NullElementError'
  if (modelCompare(mode, key, stored === undefined ? key : stored) === undefined)
    return 'ClassCastError'
  return undefined
}

function errorName(fn: () => unknown): string {
  const error = caught(fn)
  return error === undefined ? 'none' : (error as Error).name
}

function runMapModel(mode: Mode, seed: number, steps: number): void {
  const random = seeded(seed)
  const key = keyMaker(mode, random)
  const options = mode === 'comparator' ? { comparator: byNumber } : undefined
  const cmp = (a: unknown, b: unknown) => modelCompare(mode, a, b) as number
  let model: MapCell[] = []
  const find = (k: unknown): MapCell | undefined =>
    model.find((c) => modelCompare(mode, k, c.k) === 0)
  /** Sets `k` in the model; an equal stored key keeps its key object. */
  const put = (k: unknown, v: number): void => {
    const normal = k === 0 ? 0 : k
    const found = find(normal)
    if (found !== undefined) found.v = v
    else {
      model.push({ k: normal, v, removed: false })
      model.sort((a, b) => cmp(a.k, b.k))
    }
  }

  // Construction: of several equal keys the first key object is kept with the last value.
  const pairs: Array<[unknown, number]> = Array.from({ length: integer(random, 0, 25) }, (_, i) => [
    key(),
    i,
  ])
  let map: TreeMap<unknown, number>
  const build = (): TreeMap<unknown, number> => {
    switch (integer(random, 0, 4)) {
      case 0: {
        const m = new TreeMap<unknown, number>(null, options)
        for (const [k, v] of pairs) m.set(k, v)
        return m
      }
      case 1:
        return new TreeMap<unknown, number>(pairs, options)
      case 2:
        return TreeMap.from(pairs, options)
      case 3:
        return new TreeMap<unknown, number>(new TreeMap<unknown, number>(pairs, options), options)
      default:
        return new TreeMap<unknown, number>(pairs, options).copy()
    }
  }
  const refusedPair = pairs.findIndex(([k], i) => {
    if (refusal(mode, k, undefined) !== undefined) return true
    return pairs.slice(0, i).some(([other]) => modelCompare(mode, k, other) === undefined)
  })
  if (refusedPair >= 0) {
    expect(caught(build)).toBeInstanceOf(Error)
    map = new TreeMap<unknown, number>(null, options)
  } else {
    map = build()
    for (const [k, v] of pairs) put(k, v)
  }
  // Construction kept the first key object of several equal keys.
  for (const cell of model) expect(map.firstEntry() === undefined || map.has(cell.k)).toBe(true)

  const iterators: Held[] = []
  const entries: Array<{ entry: MapEntry<unknown, number>; cell: MapCell; last: number }> = []
  const stale = () => {
    for (const i of iterators) i.stale = true
  }
  const remove = (cell: MapCell) => {
    cell.removed = true
    model.splice(model.indexOf(cell), 1)
  }
  // biome-ignore lint/suspicious/noSelfCompare: `x !== x` is true only for NaN.
  const sameKey = (a: unknown, b: unknown) => a === b || (a !== a && b !== b)

  for (let step = 0; step < steps; step++) {
    const context = `map ${mode} seed ${seed} step ${step}`
    const revision = map.revision
    let changed = false
    let structural = false
    const stored = model.length === 0 ? undefined : (model[0] as MapCell).k
    const op = integer(random, 0, 27)
    switch (op) {
      case 0:
      case 1:
      case 2: {
        const k = key()
        const v = integer(random, 0, 999)
        const refused = refusal(mode, k, stored)
        if (refused !== undefined) {
          expect(
            errorName(() => map.set(k, v)),
            context,
          ).toBe(refused)
        } else {
          const found = find(k)
          if (op === 2) expect(map.put(k, v), context).toBe(found?.v)
          else expect(map.set(k, v), context).toBe(map)
          structural = found === undefined
          put(k, v)
          changed = true
        }
        break
      }
      case 3:
      case 4: {
        const k = key()
        const found = refusal(mode, k, stored) === undefined ? find(k) : undefined
        expect(map.get(k), context).toBe(found?.v)
        expect(map.has(k), context).toBe(found !== undefined)
        expect(map.getOrDefault(k, -1), context).toBe(found === undefined ? -1 : found.v)
        break
      }
      case 5:
      case 6: {
        const k = key()
        const found = refusal(mode, k, stored) === undefined ? find(k) : undefined
        if (op === 5) expect(map.delete(k), context).toBe(found !== undefined)
        else expect(map.remove(k), context).toBe(found?.v)
        if (found !== undefined) {
          remove(found)
          changed = structural = true
        }
        break
      }
      case 7: {
        const batch: Array<[unknown, number]> = Array.from(
          { length: integer(random, 0, 3) },
          () => [key(), integer(random, 0, 999)],
        )
        const common = stored ?? batch[0]?.[0]
        const refused =
          mode === 'comparator'
            ? undefined
            : batch.some(([k]) => k === null || k === undefined)
              ? 'NullElementError'
              : batch.some(([k]) => modelCompare(mode, k, common) === undefined)
                ? 'ClassCastError'
                : undefined
        if (refused !== undefined) {
          expect(
            errorName(() => map.putAll(batch)),
            context,
          ).toBe(refused)
        } else {
          map.putAll(batch)
          for (const [k, v] of batch) {
            structural ||= find(k) === undefined
            put(k, v)
          }
          changed = batch.length > 0
        }
        break
      }
      case 8:
        if (random() < 0.2) {
          map.clear()
          changed = structural = model.length > 0
          for (const c of model) c.removed = true
          model = []
        }
        break
      case 9: {
        const method = pick(random, [
          'firstEntry',
          'lastEntry',
          'pollFirstEntry',
          'pollLastEntry',
        ] as const)
        const cell =
          method.endsWith('FirstEntry') || method === 'firstEntry'
            ? model[0]
            : model[model.length - 1]
        const entry = map[method]()
        if (cell === undefined) expect(entry, context).toBe(undefined)
        else {
          expect(entry?.key, context).toBe(cell.k)
          expect(entry?.value, context).toBe(cell.v)
          if (method.startsWith('poll')) {
            remove(cell)
            changed = structural = true
          } else if (entries.length < 6)
            entries.push({ entry: entry as MapEntry<unknown, number>, cell, last: cell.v })
        }
        break
      }
      case 10: {
        const k = key()
        const method = pick(random, [
          'floorEntry',
          'ceilingEntry',
          'lowerEntry',
          'higherEntry',
        ] as const)
        const refused = refusal(mode, k, stored)
        if (refused !== undefined && model.length > 0) {
          expect(
            errorName(() => map[method](k)),
            context,
          ).toBe(refused)
          break
        }
        if (refused === 'NullElementError') {
          expect(
            errorName(() => map[method](k)),
            context,
          ).toBe(refused)
          break
        }
        if (refused !== undefined) break
        const pickCell = (): MapCell | undefined => {
          const c = (x: MapCell) => cmp(k, x.k)
          if (method === 'floorEntry') return model.filter((x) => c(x) >= 0).pop()
          if (method === 'lowerEntry') return model.filter((x) => c(x) > 0).pop()
          if (method === 'ceilingEntry') return model.find((x) => c(x) <= 0)
          return model.find((x) => c(x) < 0)
        }
        const cell = pickCell()
        const entry = map[method](k)
        expect(entry?.key, context).toBe(cell?.k)
        expect(entry?.value, context).toBe(cell?.v)
        break
      }
      case 11: {
        const k = key()
        if (refusal(mode, k, stored) !== undefined) break
        const found = find(k)
        const remove1 = random() < 0.5
        const method = pick(random, ['compute', 'computeIfPresent', 'merge'] as const)
        const next = remove1 ? undefined : integer(random, 0, 999)
        if (method === 'compute') map.compute(k, () => next)
        else if (method === 'computeIfPresent') map.computeIfPresent(k, () => next)
        else map.merge(k, 5, () => next)
        if (found !== undefined) {
          if (next === undefined) {
            remove(found)
            changed = structural = true
          } else {
            found.v = next
            changed = true
          }
        } else if (method === 'compute' && next !== undefined) {
          put(k, next)
          changed = structural = true
        } else if (method === 'merge') {
          put(k, 5)
          changed = structural = true
        }
        break
      }
      case 12: {
        const m = integer(random, 2, 4)
        const doomed = model.filter((c) => c.v % m === 0)
        const view = pick(random, ['keySet', 'entrySet', 'valueCollection'] as const)
        const result =
          view === 'keySet'
            ? map.keySet().removeIf((k) => (find(k) as MapCell).v % m === 0)
            : view === 'entrySet'
              ? map.entrySet().removeIf((e) => e.value % m === 0)
              : map.valueCollection().removeIf((v) => v % m === 0)
        expect(result, context).toBe(doomed.length > 0)
        for (const c of doomed) remove(c)
        changed = structural = doomed.length > 0
        break
      }
      case 13: {
        const view = map.keySet()
        const first = random() < 0.5
        const cell = first ? model[0] : model[model.length - 1]
        const method = first ? 'pollFirst' : 'pollLast'
        expect(view[method](), context).toBe(cell?.k)
        if (cell !== undefined) {
          remove(cell)
          changed = structural = true
        }
        break
      }
      case 14: {
        const keys = model.map((c) => c.k)
        const values = model.map((c) => c.v)
        expect([...map.keys()], context).toEqual(keys)
        expect([...map.values()], context).toEqual(values)
        expect([...map.reversed().keys()], context).toEqual(keys.slice().reverse())
        expect(map.size, context).toBe(model.length)
        expect(map.toString(), context).toBe(
          new TreeMap<unknown, number>(
            model.map((c) => [c.k, c.v]),
            options,
          ).toString(),
        )
        expect(JSON.stringify(map), context).toBe(JSON.stringify(model.map((c) => [c.k, c.v])))
        expect(
          map.equals(
            new TreeMap<unknown, number>(
              model.map((c) => [c.k, c.v]),
              options,
            ),
          ),
          context,
        ).toBe(true)
        const seen: unknown[] = []
        map.forEach((v, k) => {
          seen.push(k, v)
        })
        expect(seen, context).toEqual(model.flatMap((c) => [c.k, c.v]))
        break
      }
      case 15:
      case 16: {
        // Range views over the current kind of key.
        if (model.length === 0 || (mode === 'mix' && typeof stored !== 'number')) break
        const a = (model[integer(random, 0, model.length - 1)] as MapCell).k
        const b = (model[integer(random, 0, model.length - 1)] as MapCell).k
        const [low, high] = cmp(a, b) <= 0 ? [a, b] : [b, a]
        const inRange = (k: unknown) => cmp(k, low) >= 0 && cmp(k, high) < 0
        const view = map.subMap(low, high)
        const inside = model.filter((c) => inRange(c.k))
        expect([...view.keys()], context).toEqual(inside.map((c) => c.k))
        if (op === 16 && inside.length > 0) {
          const cell = inside[integer(random, 0, inside.length - 1)] as MapCell
          expect(view.delete(cell.k), context).toBe(true)
          remove(cell)
          changed = structural = true
        }
        const head = map.headMap(high)
        expect(head.size, context).toBe(model.filter((c) => cmp(c.k, high) < 0).length)
        const tail = map.tailMap(low)
        expect(tail.firstEntry()?.key, context).toBe(model.find((c) => cmp(c.k, low) >= 0)?.k)
        break
      }
      case 17:
      case 18: {
        if (iterators.length < 4) {
          const source = pick(random, ['keys', 'values', 'entries', 'reversed'] as const)
          const it =
            source === 'keys'
              ? map.keys()
              : source === 'values'
                ? map.values()
                : source === 'entries'
                  ? (map.entries() as Iterator<unknown>)
                  : map.reversed().keys()
          const items =
            source === 'keys'
              ? model.map((c) => c.k)
              : source === 'values'
                ? model.map((c) => c)
                : source === 'entries'
                  ? model.map((c) => c)
                  : model.map((c) => c.k).reverse()
          iterators.push({
            it,
            items: source === 'entries' ? items.map((c) => ['entry', c]) : items,
            pos: 0,
            stale: false,
            done: false,
          })
        }
        break
      }
      case 19:
      case 20: {
        const open = iterators.length === 0 ? undefined : pick(random, iterators)
        if (open === undefined) break
        if (open.done) {
          expect(open.it.next(), context).toEqual({ done: true, value: undefined })
        } else if (open.stale) {
          expect(
            caught(() => open.it.next()),
            context,
          ).toBeInstanceOf(ConcurrentModificationError)
          iterators.splice(iterators.indexOf(open), 1)
        } else if (open.pos < open.items.length) {
          const step1 = open.it.next()
          const item = open.items[open.pos++]
          expect(step1.done, context).toBe(false)
          if (Array.isArray(item)) {
            const cell = item[1] as MapCell
            const [k, v] = step1.value as [unknown, number]
            expect(k, context).toBe(cell.k)
            expect(v, context).toBe(cell.v)
          } else if (item !== null && typeof item === 'object' && 'removed' in (item as object)) {
            expect(step1.value, context).toBe((item as MapCell).v)
          } else {
            expect(sameKey(step1.value, item), context).toBe(true)
          }
        } else {
          expect(open.it.next(), context).toEqual({ done: true, value: undefined })
          open.done = true
        }
        break
      }
      case 21:
      case 22: {
        const held = entries.length === 0 ? undefined : pick(random, entries)
        if (held === undefined) break
        // An entry reads its key's current mapping, or the last value it saw while the key is absent.
        const { entry, cell } = held
        const live = find(cell.k)
        if (live !== undefined) held.last = live.v
        expect(entry.key, context).toBe(cell.k)
        expect(entry.value, context).toBe(held.last)
        expect(entry.toJSON(), context).toEqual([cell.k, held.last])
        if (op === 22) {
          const v = integer(random, 0, 999)
          if (live === undefined) {
            expect(
              thrown(() => entry.setValue(v)),
              context,
            ).toBe('IllegalStateError: MapEntry.setValue: the mapping was removed from the map')
          } else {
            expect(entry.setValue(v), context).toBe(live.v)
            live.v = v
            held.last = v
            changed = true
          }
        }
        break
      }
      case 23: {
        // Setting a key equal to a stored one keeps the stored key object.
        if (model.length === 0 || mode === 'comparator') break
        const cell = model[integer(random, 0, model.length - 1)] as MapCell
        const twin =
          cell.k instanceof Ranked
            ? new Ranked(cell.k.rank)
            : cell.k instanceof Date
              ? new Date(cell.k.getTime())
              : cell.k
        map.set(twin, 7)
        cell.v = 7
        changed = true
        expect(
          [...map.keys()].some((k) => sameKey(k, cell.k)),
          context,
        ).toBe(true)
        break
      }
      case 24: {
        const copy = map.copy()
        expect(copy.toJSON(), context).toEqual(map.toJSON())
        break
      }
      default: {
        const c = map.keySet().cursor()
        let i = 0
        const m = integer(random, 2, 5)
        while (c.hasNext()) {
          const k = c.next()
          expect(sameKey(k, (model[i] as MapCell).k), context).toBe(true)
          if (i % m === 0) {
            c.remove()
            remove(model[i] as MapCell)
            changed = structural = true
          } else i++
        }
      }
    }
    if (structural) stale()
    if (changed) expect(map.revision, context).not.toBe(revision)
    else expect(map.revision, context).toBe(revision)
    if (step % 50 === 0) expect(map.toJSON(), context).toEqual(model.map((c) => [c.k, c.v]))
  }
  expect(map.toJSON()).toEqual(model.map((c) => [c.k, c.v]))
}

function runSetModel(mode: Mode, seed: number, steps: number): void {
  const random = seeded(seed)
  const key = keyMaker(mode, random)
  const options = mode === 'comparator' ? { comparator: byNumber } : undefined
  const cmp = (a: unknown, b: unknown) => modelCompare(mode, a, b) as number
  let model: unknown[] = []
  const find = (k: unknown) => model.findIndex((x) => modelCompare(mode, k, x) === 0)
  const insert = (k: unknown) => {
    model.push(k === 0 ? 0 : k)
    model.sort(cmp)
  }
  const items = Array.from({ length: integer(random, 0, 25) }, key)
  const refusedAt = items.findIndex(
    (k, i) =>
      refusal(mode, k, undefined) !== undefined ||
      items.slice(0, i).some((other) => modelCompare(mode, k, other) === undefined),
  )
  let set: TreeSet<unknown>
  const build = (): TreeSet<unknown> => {
    switch (integer(random, 0, 3)) {
      case 0:
        return new TreeSet<unknown>(items, options)
      case 1:
        return TreeSet.from(items, options)
      case 2: {
        const s = new TreeSet<unknown>(null, options)
        for (const x of items) s.add(x)
        return s
      }
      default:
        return new TreeSet<unknown>(items, options).copy()
    }
  }
  if (refusedAt >= 0) {
    expect(caught(build)).toBeInstanceOf(Error)
    set = new TreeSet<unknown>(null, options)
  } else {
    set = build()
    for (const x of items) if (find(x) < 0) insert(x)
  }
  const iterators: Held[] = []
  // biome-ignore lint/suspicious/noSelfCompare: `x !== x` is true only for NaN.
  const sameKey = (a: unknown, b: unknown) => a === b || (a !== a && b !== b)

  for (let step = 0; step < steps; step++) {
    const context = `set ${mode} seed ${seed} step ${step}`
    const revision = set.revision
    let changed = false
    const stored = model[0]
    const viewed = random() < 0.2
    const target = viewed ? set.reversed() : set
    const ordered = () => (viewed ? model.slice().reverse() : model.slice())
    const op = integer(random, 0, 19)
    switch (op) {
      case 0:
      case 1:
      case 2: {
        const k = key()
        const refused = refusal(mode, k, stored)
        if (refused !== undefined) {
          expect(
            errorName(() => target.add(k)),
            context,
          ).toBe(refused)
        } else {
          const absent = find(k) < 0
          expect(target.add(k), context).toBe(target)
          if (absent) {
            insert(k)
            changed = true
          }
        }
        break
      }
      case 3: {
        const k = key()
        expect(target.has(k), context).toBe(refusal(mode, k, stored) === undefined && find(k) >= 0)
        break
      }
      case 4: {
        const k = key()
        const at = refusal(mode, k, stored) === undefined ? find(k) : -1
        expect(target.delete(k), context).toBe(at >= 0)
        if (at >= 0) {
          model.splice(at, 1)
          changed = true
        }
        break
      }
      case 5: {
        const batch = Array.from({ length: integer(random, 0, 3) }, key)
        if (mode !== 'comparator' && batch.some((k) => k === null || k === undefined)) {
          // Every element is checked for null before any is added.
          expect(
            errorName(() => target.addAll(batch)),
            context,
          ).toBe('NullElementError')
          break
        }
        // Elements are added one by one; those added before a refused one stay.
        const before = model.slice()
        let error: string | undefined
        let any = false
        for (const k of batch) {
          const refused = refusal(mode, k, model[0])
          if (refused !== undefined) {
            error = refused
            break
          }
          if (find(k) < 0) {
            insert(k)
            any = true
          }
        }
        const after = model
        model = before
        let added = false
        const outcome = errorName(() => {
          added = target.addAll(batch)
        })
        model = after
        expect(outcome, context).toBe(error ?? 'none')
        if (error === undefined) expect(added, context).toBe(any)
        changed = any
        break
      }
      case 6: {
        const method = pick(random, ['pollFirst', 'pollLast', 'removeFirst', 'removeLast'] as const)
        const list = ordered()
        const x = method.endsWith('First') ? list[0] : list[list.length - 1]
        if (model.length === 0) {
          if (method.startsWith('poll')) expect(target[method](), context).toBe(undefined)
          else
            expect(
              errorName(() => target[method]()),
              context,
            ).toBe('NoSuchElementError')
        } else {
          expect(sameKey(target[method](), x), context).toBe(true)
          model.splice(model.indexOf(x), 1)
          changed = true
        }
        break
      }
      case 7: {
        const k = key()
        const refused = refusal(mode, k, stored)
        const method = pick(random, ['lower', 'floor', 'ceiling', 'higher'] as const)
        if (refused !== undefined) {
          if (refused === 'NullElementError' || model.length > 0) {
            expect(
              errorName(() => target[method](k)),
              context,
            ).toBe(refused)
          }
          break
        }
        const sign = viewed ? -1 : 1
        const c = (x: unknown) => sign * cmp(k, x)
        const list = ordered()
        const expected =
          method === 'floor'
            ? list.filter((x) => c(x) >= 0).pop()
            : method === 'lower'
              ? list.filter((x) => c(x) > 0).pop()
              : method === 'ceiling'
                ? list.find((x) => c(x) <= 0)
                : list.find((x) => c(x) < 0)
        expect(sameKey(target[method](k), expected), context).toBe(true)
        break
      }
      case 8: {
        const m = integer(random, 2, 4)
        const hit = (x: unknown) =>
          typeof x === 'number'
            ? x % m === 0
            : x instanceof Ranked
              ? x.rank % m === 0
              : String(x).length % m === 0
        const doomed = model.filter(hit)
        expect(target.removeIf(hit), context).toBe(doomed.length > 0)
        model = model.filter((x) => !hit(x))
        changed = doomed.length > 0
        break
      }
      case 9: {
        const list = ordered()
        expect([...target], context).toEqual(list)
        expect(target.toArray(), context).toEqual(list)
        expect(target.size, context).toBe(model.length)
        expect(set.toString(), context).toBe(new TreeSet<unknown>(model, options).toString())
        expect(JSON.stringify(set), context).toBe(JSON.stringify(model))
        expect(set.equals(new TreeSet<unknown>(model, options)), context).toBe(true)
        break
      }
      case 10:
        if (random() < 0.2) {
          target.clear()
          changed = model.length > 0
          model = []
        }
        break
      case 11:
      case 12: {
        if (model.length === 0 || (mode === 'mix' && typeof stored !== 'number')) break
        const a = model[integer(random, 0, model.length - 1)]
        const b = model[integer(random, 0, model.length - 1)]
        const [low, high] = cmp(a, b) <= 0 ? [a, b] : [b, a]
        const view = set.subSet(low, high)
        const inside = model.filter((x) => cmp(x, low) >= 0 && cmp(x, high) < 0)
        expect(view.toArray(), context).toEqual(inside)
        if (op === 12 && inside.length > 0) {
          const x = inside[0]
          expect(view.delete(x), context).toBe(true)
          model.splice(model.indexOf(x), 1)
          changed = true
        }
        expect(set.headSet(high).size, context).toBe(model.filter((x) => cmp(x, high) < 0).length)
        expect(
          sameKey(
            set.tailSet(low).getFirst(),
            model.find((x) => cmp(x, low) >= 0),
          ),
          context,
        ).toBe(true)
        break
      }
      case 13:
      case 14: {
        if (iterators.length < 4)
          iterators.push({
            it: target[Symbol.iterator](),
            items: ordered(),
            pos: 0,
            stale: false,
            done: false,
          })
        break
      }
      case 15:
      case 16: {
        const open = iterators.length === 0 ? undefined : pick(random, iterators)
        if (open === undefined) break
        if (open.done) {
          expect(open.it.next(), context).toEqual({ done: true, value: undefined })
        } else if (open.stale) {
          expect(
            caught(() => open.it.next()),
            context,
          ).toBeInstanceOf(ConcurrentModificationError)
          iterators.splice(iterators.indexOf(open), 1)
        } else if (open.pos < open.items.length) {
          const s = open.it.next()
          expect(sameKey(s.value, open.items[open.pos++]), context).toBe(true)
        } else {
          expect(open.it.next(), context).toEqual({ done: true, value: undefined })
          open.done = true
        }
        break
      }
      case 17: {
        const xs = Array.from({ length: integer(random, 0, 3) }, key)
        const retain = random() < 0.5
        const inXs = (x: unknown) => xs.some((y) => modelCompare(mode, x, y) === 0)
        const doomed = model.filter((x) => (retain ? !inXs(x) : inXs(x)))
        expect(retain ? target.retainAll(xs) : target.removeAll(xs), context).toBe(
          doomed.length > 0,
        )
        model = model.filter((x) => !doomed.includes(x))
        changed = doomed.length > 0
        break
      }
      case 18: {
        const c = target.cursor()
        const list = ordered()
        let i = 0
        while (c.hasNext()) {
          const x = c.next()
          expect(sameKey(x, list[i]), context).toBe(true)
          if (i % 3 === 0) {
            c.remove()
            model.splice(model.indexOf(list[i]), 1)
            changed = true
          }
          i++
        }
        break
      }
      default: {
        const copy = set.copy()
        expect(copy.toArray(), context).toEqual(set.toArray())
      }
    }
    if (changed) {
      for (const i of iterators) i.stale = true
      expect(set.revision, context).not.toBe(revision)
    } else {
      expect(set.revision, context).toBe(revision)
    }
  }
  expect(set.toArray()).toEqual(model)
}

describe('TreeMap and TreeSet against a sorted-array model', () => {
  for (const mode of MODES) {
    for (let seed = 1; seed <= 10; seed++) {
      it(`TreeMap with ${mode} matches the model over 10,000 seeded calls, seed ${seed} [051 S1-AC8]`, () => {
        runMapModel(mode, seed * 104_729 + MODES.indexOf(mode), 10_000)
      })
      it(`TreeSet with ${mode} matches the model over 10,000 seeded calls, seed ${seed} [051 S1-AC8]`, () => {
        runSetModel(mode, seed * 15_485_863 + MODES.indexOf(mode), 10_000)
      })
    }
  }

  it('keeps an open iterator valid across a value write and fails on the next step after a structural change [051 S1-AC8]', () => {
    const map = new TreeMap([
      [1, 'a'],
      [2, 'b'],
      [3, 'c'],
    ])
    const keys = map.keys()
    expect(keys.next().value).toBe(1)
    map.set(2, 'B')
    ;(map.firstEntry() as MapEntry<number, string>).setValue('A')
    expect(keys.next().value).toBe(2)
    map.set(4, 'd')
    expect(caught(() => keys.next())).toBeInstanceOf(ConcurrentModificationError)
    const done = map.keys()
    for (let i = 0; i < 5; i++) done.next()
    map.delete(1)
    expect(done.next()).toEqual({ done: true, value: undefined })
  })

  it('keeps the first of several equal keys with the last value when built [051 S1-AC8]', () => {
    const first = new Ranked(1)
    const second = new Ranked(1)
    for (const map of [
      new TreeMap<Ranked, string>([
        [first, 'a'],
        [second, 'b'],
      ]),
      TreeMap.from<Ranked, string>([
        [first, 'a'],
        [second, 'b'],
      ]),
    ]) {
      expect(map.size).toBe(1)
      expect(map.firstEntry()?.key).toBe(first)
      expect(map.get(second)).toBe('b')
      map.set(second, 'c')
      expect(map.firstEntry()?.key).toBe(first)
    }
  })
})

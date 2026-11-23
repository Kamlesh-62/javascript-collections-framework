import { describe, expect, it } from 'vitest'
import {
  ConcurrentModificationError,
  equalsSymbol,
  hashCode,
  hashCodeSymbol,
  IllegalStateError,
  LinkedHashMap,
  LinkedHashSet,
  type MapEntry,
} from '../src/index'
import type { Cursor } from '../src/interfaces/collection'
import type { SequencedMap } from '../src/interfaces/sequenced-map'
import type { SequencedSet } from '../src/interfaces/sequenced-set'
import { integer, pick, seeded } from './support/random'

// A default `LinkedHashMap` or `LinkedHashSet` may keep its contents in a native `Map` or `Set`
// until a call needs linked order (an end other than the front, a front insertion, a reversed view,
// a view call). These tests pin what every caller sees, whatever the layout: iterators, cursors,
// `forEach`, entries and callbacks left open across such a call, and long seeded runs against
// reference models.

type Pair = [number, number]

/** Whether the collection's contents are held in the native layout (an internal detail). */
function isNative(collection: object): boolean {
  const engine = (collection as { engine?: { state?: { flat?: unknown } } }).engine
  return engine?.state?.flat !== undefined
}

function pairsMap(): LinkedHashMap<number, number> {
  return new LinkedHashMap<number, number>([
    [1, 10],
    [2, 20],
    [3, 30],
    [4, 40],
    [5, 50],
  ])
}

/** A change made with an iteration open: a call that needs linked order, then a change. */
interface MapRow {
  readonly name: string
  readonly act: (map: LinkedHashMap<number, number>) => void
  /** The pairs the iteration returns after the first two. */
  readonly rest: Pair[]
}

const MAP_ROWS: MapRow[] = [
  {
    name: 'lastEntry, nothing else',
    act: (m) => void m.lastEntry(),
    rest: [
      [3, 30],
      [4, 40],
      [5, 50],
    ],
  },
  {
    name: 'pollLastEntry',
    act: (m) => void m.pollLastEntry(),
    rest: [
      [3, 30],
      [4, 40],
    ],
  },
  {
    name: 'putFirst of a key ahead',
    act: (m) => void m.putFirst(3, 33),
    rest: [
      [4, 40],
      [5, 50],
    ],
  },
  {
    name: 'putLast of a key behind',
    act: (m) => void m.putLast(1, 11),
    rest: [
      [3, 30],
      [4, 40],
      [5, 50],
      [1, 11],
    ],
  },
  {
    name: 'putLast of a key ahead',
    act: (m) => void m.putLast(4, 44),
    rest: [
      [3, 30],
      [5, 50],
      [4, 44],
    ],
  },
  {
    name: 'putFirst of the key last returned',
    act: (m) => void m.putFirst(2, 22),
    rest: [
      [3, 30],
      [4, 40],
      [5, 50],
    ],
  },
  {
    name: 'a reversed read, then a delete ahead',
    act: (m) => {
      void m.reversed().size
      m.delete(4)
    },
    rest: [
      [3, 30],
      [5, 50],
    ],
  },
  {
    name: 'a reversed end, then a delete behind',
    act: (m) => {
      m.reversed().firstEntry()
      m.delete(1)
    },
    rest: [
      [3, 30],
      [4, 40],
      [5, 50],
    ],
  },
  {
    name: 'a key view call, then a re-insert of a key ahead',
    act: (m) => {
      m.keySet().getFirst()
      m.delete(3)
      m.set(3, 33)
    },
    rest: [
      [4, 40],
      [5, 50],
      [3, 33],
    ],
  },
  {
    name: 'lastEntry, then a front insertion',
    act: (m) => {
      m.lastEntry()
      m.putFirst(9, 90)
    },
    rest: [
      [3, 30],
      [4, 40],
      [5, 50],
    ],
  },
  {
    name: 'lastEntry, then clear and an append',
    act: (m) => {
      m.lastEntry()
      m.clear()
      m.set(7, 70)
    },
    rest: [[7, 70]],
  },
  {
    name: 'lastEntry, then clear, a front insertion and an append',
    act: (m) => {
      m.lastEntry()
      m.clear()
      m.putFirst(8, 80)
      m.set(7, 70)
    },
    rest: [[7, 70]],
  },
  {
    name: 'a value view call, then an append',
    act: (m) => {
      m.valueCollection().getLast()
      m.set(6, 60)
    },
    rest: [
      [3, 30],
      [4, 40],
      [5, 50],
      [6, 60],
    ],
  },
  {
    name: 'an entry view call, then a write of a key ahead',
    act: (m) => {
      m.entrySet().toArray()
      m.set(3, 300)
    },
    rest: [
      [3, 300],
      [4, 40],
      [5, 50],
    ],
  },
  {
    name: 'an append, a delete ahead, then putLast of a key ahead',
    act: (m) => {
      m.set(6, 60)
      m.delete(3)
      m.putLast(4, 41)
    },
    rest: [
      [5, 50],
      [6, 60],
      [4, 41],
    ],
  },
]

type MapWalk = (map: LinkedHashMap<number, number>, act: () => void) => unknown[]

/** Each way of walking a map: two steps, `act`, then the rest; returns what came after `act`. */
const MAP_WALKS: Array<[string, MapWalk, (p: Pair) => unknown]> = [
  [
    'for…of',
    (map, act) => {
      const out: unknown[] = []
      let n = 0
      for (const pair of map) {
        if (n >= 2) out.push(pair)
        if (++n === 2) act()
      }
      return out
    },
    (p) => p,
  ],
  [
    'keys',
    (map, act) => {
      const it = map.keys()
      it.next()
      it.next()
      act()
      return [...it]
    },
    (p) => p[0],
  ],
  [
    'values',
    (map, act) => {
      const it = map.values()
      it.next()
      it.next()
      act()
      return [...it]
    },
    (p) => p[1],
  ],
  [
    'entries',
    (map, act) => {
      const it = map.entries()
      it.next()
      it.next()
      act()
      return [...it]
    },
    (p) => p,
  ],
  [
    'forEach',
    (map, act) => {
      const out: unknown[] = []
      let n = 0
      map.forEach((value, key) => {
        if (n >= 2) out.push([key, value])
        if (++n === 2) act()
      })
      return out
    },
    (p) => p,
  ],
]

interface SetRow {
  readonly name: string
  readonly act: (set: LinkedHashSet<number>) => void
  readonly rest: number[]
}

const SET_ROWS: SetRow[] = [
  { name: 'getLast, nothing else', act: (s) => void s.getLast(), rest: [3, 4, 5] },
  { name: 'removeLast', act: (s) => void s.removeLast(), rest: [3, 4] },
  { name: 'addFirst of a member ahead', act: (s) => void s.addFirst(3), rest: [4, 5] },
  { name: 'addLast of a member behind', act: (s) => void s.addLast(1), rest: [3, 4, 5, 1] },
  { name: 'addLast of a member ahead', act: (s) => void s.addLast(4), rest: [3, 5, 4] },
  { name: 'addFirst of the member last returned', act: (s) => void s.addFirst(2), rest: [3, 4, 5] },
  {
    name: 'a reversed read, then a delete ahead',
    act: (s) => {
      void s.reversed().size
      s.delete(4)
    },
    rest: [3, 5],
  },
  {
    name: 'a reversed end, then a delete behind',
    act: (s) => {
      s.reversed().getFirst()
      s.delete(1)
    },
    rest: [3, 4, 5],
  },
  {
    name: 'getLast, then a re-insert of a member ahead',
    act: (s) => {
      s.getLast()
      s.delete(3)
      s.add(3)
    },
    rest: [4, 5, 3],
  },
  {
    name: 'getLast, then a front insertion',
    act: (s) => {
      s.getLast()
      s.addFirst(9)
    },
    rest: [3, 4, 5],
  },
  {
    name: 'getLast, then clear and an add',
    act: (s) => {
      s.getLast()
      s.clear()
      s.add(7)
    },
    rest: [7],
  },
  {
    name: 'getLast, then clear, a front insertion and an add',
    act: (s) => {
      s.getLast()
      s.clear()
      s.addFirst(8)
      s.add(7)
    },
    rest: [7],
  },
  {
    name: 'an add, a delete ahead, then addLast of a member ahead',
    act: (s) => {
      s.add(6)
      s.delete(3)
      s.addLast(4)
    },
    rest: [5, 6, 4],
  },
]

type SetWalk = (set: LinkedHashSet<number>, act: () => void) => unknown[]

const SET_WALKS: Array<[string, SetWalk, (e: number) => unknown]> = [
  [
    'for…of',
    (set, act) => {
      const out: unknown[] = []
      let n = 0
      for (const e of set) {
        if (n >= 2) out.push(e)
        if (++n === 2) act()
      }
      return out
    },
    (e) => e,
  ],
  [
    'keys',
    (set, act) => {
      const it = set.keys()
      it.next()
      it.next()
      act()
      return [...it]
    },
    (e) => e,
  ],
  [
    'values',
    (set, act) => {
      const it = set.values()
      it.next()
      it.next()
      act()
      return [...it]
    },
    (e) => e,
  ],
  [
    'entries',
    (set, act) => {
      const it = set.entries()
      it.next()
      it.next()
      act()
      return [...it]
    },
    (e) => [e, e],
  ],
  [
    'forEach',
    (set, act) => {
      const out: unknown[] = []
      let n = 0
      set.forEach((e) => {
        if (n >= 2) out.push(e)
        if (++n === 2) act()
      })
      return out
    },
    (e) => e,
  ],
  [
    'cursor',
    (set, act) => {
      const cursor = set.cursor()
      cursor.next()
      cursor.next()
      act()
      const out: unknown[] = []
      while (cursor.hasNext()) out.push(cursor.next())
      return out
    },
    (e) => e,
  ],
]

describe('iterations open while a linked hash map or set changes layout', () => {
  it('return, after the change, exactly what an iteration over linked records returns, for every way of walking a map [045 S1-AC1]', () => {
    for (const row of MAP_ROWS) {
      for (const [walkName, walk, project] of MAP_WALKS) {
        const map = pairsMap()
        expect(
          walk(map, () => row.act(map)),
          `${row.name} — ${walkName}`,
        ).toEqual(row.rest.map(project))
      }
    }
  })

  it('return, after the change, exactly what an iteration over linked records returns, for every way of walking a set [045 S1-AC1]', () => {
    for (const row of SET_ROWS) {
      for (const [walkName, walk, project] of SET_WALKS) {
        const set = new LinkedHashSet([1, 2, 3, 4, 5])
        expect(
          walk(set, () => row.act(set)),
          `${row.name} — ${walkName}`,
        ).toEqual(row.rest.map(project))
      }
    }
  })

  it('keep an iteration that had finished finished, and let a cursor remove what it returned [045 S1-AC1]', () => {
    const map = pairsMap()
    const keys = map.keys()
    expect([...keys]).toEqual([1, 2, 3, 4, 5])
    map.lastEntry()
    map.set(6, 60)
    expect(keys.next()).toEqual({ done: true, value: undefined })
    const set = new LinkedHashSet([1, 2, 3])
    const values = set.values()
    expect([...values]).toEqual([1, 2, 3])
    set.getLast()
    set.add(4)
    expect(values.next()).toEqual({ done: true, value: undefined })

    const cursorSet = new LinkedHashSet([1, 2, 3, 4])
    const cursor = cursorSet.cursor()
    cursor.next()
    expect(cursor.next()).toBe(2)
    cursorSet.getLast()
    cursor.remove()
    expect([...cursorSet]).toEqual([1, 3, 4])
    expect(cursor.next()).toBe(3)
    // A cursor that looked ahead keeps the member it saw.
    expect(cursor.hasNext()).toBe(true)
    cursorSet.removeLast()
    expect(cursor.next()).toBe(4)
    expect(cursor.hasNext()).toBe(false)
  })

  it('walk the views and the reversed map from the switch on, as linked records [045 S1-AC1]', () => {
    const map = pairsMap()
    const keys = map.keys()
    keys.next()
    const reversed = map.reversed()
    const back = reversed.keys()
    expect(back.next()).toEqual({ done: false, value: 5 })
    map.putFirst(0, 0)
    map.set(6, 60)
    expect([...back]).toEqual([4, 3, 2, 1, 0])
    expect([...keys]).toEqual([2, 3, 4, 5, 6])
    const view = map.keySet().cursor()
    expect(view.next()).toBe(0)
    view.remove()
    expect(map.toJSON()).toEqual([
      [1, 10],
      [2, 20],
      [3, 30],
      [4, 40],
      [5, 50],
      [6, 60],
    ])
  })
})

describe('map entries held across a change of layout', () => {
  it('read, set and compare as on a map that always kept linked records [045 S1-AC2]', () => {
    const map = new LinkedHashMap<number, number>([
      [1, 10],
      [2, 20],
      [3, 30],
    ])
    const first = map.firstEntry() as MapEntry<number, number>
    const polled = map.pollFirstEntry() as MapEntry<number, number>
    const second = map.firstEntry() as MapEntry<number, number>
    map.lastEntry()
    expect(first.key).toBe(1)
    expect(first.value).toBe(10)
    expect(polled.value).toBe(10)
    expect(() => first.setValue(5)).toThrow(IllegalStateError)
    expect(() => first.setValue(5)).toThrow(
      'MapEntry.setValue: the mapping was removed from the map',
    )
    expect(second.setValue(22)).toBe(20)
    expect(map.get(2)).toBe(22)
    expect(second.value).toBe(22)
    expect(second.toString()).toBe('2 => 22')
    expect(second.toJSON()).toEqual([2, 22])
    expect([...second]).toEqual([2, 22])
    map.set(1, 11)
    expect(first.value).toBe(11)
    expect(polled.value).toBe(11)
    expect(polled.setValue(12)).toBe(11)
    expect(map.toJSON()).toEqual([
      [2, 22],
      [3, 30],
      [1, 12],
    ])
    expect(first.equals(polled)).toBe(true)
    expect(second.equals(map.firstEntry())).toBe(true)
    map.putFirst(1, 13)
    expect(first.value).toBe(13)
    map.delete(1)
    expect(first.value).toBe(13)
    expect(second.equals(polled)).toBe(false)
  })

  it('read the mapping by key when the entry was taken in one layout and the key moved in the other [045 S1-AC2]', () => {
    const map = new LinkedHashMap<number, number>([
      [1, 10],
      [2, 20],
    ])
    const entry = map.firstEntry() as MapEntry<number, number>
    map.putLast(1, 11)
    expect(entry.value).toBe(11)
    expect(entry.setValue(12)).toBe(11)
    expect(map.toJSON()).toEqual([
      [2, 20],
      [1, 12],
    ])
  })
})

/** A value whose equality protocol makes a call that needs linked order on `map`. */
class Probe {
  readonly n: number
  readonly map: { lastEntry(): unknown } | { getLast(): unknown } | undefined
  constructor(n: number, map?: { lastEntry(): unknown } | { getLast(): unknown }) {
    this.n = n
    this.map = map
  }
  [equalsSymbol](other: unknown): boolean {
    const map = this.map
    if (map !== undefined) {
      if ('lastEntry' in map) map.lastEntry()
      else map.getLast()
    }
    return other instanceof Probe && other.n === this.n
  }
  [hashCodeSymbol](): number {
    return this.n
  }
  toString(): string {
    const map = this.map
    if (map !== undefined) {
      if ('lastEntry' in map) map.lastEntry()
      else map.getLast()
    }
    return `Probe(${this.n})`
  }
}

describe('callbacks that change the layout', () => {
  const three = (): LinkedHashMap<number, number> =>
    new LinkedHashMap<number, number>([
      [1, 10],
      [2, 20],
      [3, 30],
    ])

  it('give the same results and errors as before for compute, merge, replaceAll and the rest [045 S1-AC3]', () => {
    const outcome = (body: () => unknown): unknown => {
      try {
        return { result: body() }
      } catch (error) {
        return { error: (error as Error).name, message: (error as Error).message }
      }
    }
    const rows: Array<[string, (m: LinkedHashMap<number, number>) => unknown, unknown, Pair[]]> = [
      [
        'compute, reading the last entry',
        (m) =>
          m.compute(2, (v) => {
            m.lastEntry()
            return (v as number) + 1
          }),
        { result: 21 },
        [
          [1, 10],
          [2, 21],
          [3, 30],
        ],
      ],
      [
        'compute, moving a mapping',
        (m) =>
          m.compute(2, (v) => {
            m.putFirst(3, 30)
            return (v as number) + 1
          }),
        {
          error: 'ConcurrentModificationError',
          message: 'LinkedHashMap.compute: the map was changed by the callback',
        },
        [
          [3, 30],
          [1, 10],
          [2, 20],
        ],
      ],
      [
        'compute of an absent key, through the reversed view',
        (m) =>
          m.compute(4, () => {
            void m.reversed().size
            return 40
          }),
        { result: 40 },
        [
          [1, 10],
          [2, 20],
          [3, 30],
          [4, 40],
        ],
      ],
      [
        'computeIfPresent, removing',
        (m) =>
          m.computeIfPresent(1, () => {
            m.lastEntry()
            return undefined
          }),
        { result: undefined },
        [
          [2, 20],
          [3, 30],
        ],
      ],
      [
        'merge',
        (m) =>
          m.merge(1, 1, (old, v) => {
            m.keySet().getLast()
            return old + v
          }),
        { result: 11 },
        [
          [1, 11],
          [2, 20],
          [3, 30],
        ],
      ],
      [
        'merge, deleting another key',
        (m) =>
          m.merge(1, 1, (old, v) => {
            m.lastEntry()
            m.delete(3)
            return old + v
          }),
        {
          error: 'ConcurrentModificationError',
          message: 'LinkedHashMap.merge: the map was changed by the callback',
        },
        [
          [1, 10],
          [2, 20],
        ],
      ],
      [
        'getOrInsertComputed',
        (m) =>
          m.getOrInsertComputed(9, () => {
            m.lastEntry()
            return 90
          }),
        { result: 90 },
        [
          [1, 10],
          [2, 20],
          [3, 30],
          [9, 90],
        ],
      ],
      [
        'getOrInsertComputed, inserting the key at the front',
        (m) =>
          m.getOrInsertComputed(9, () => {
            m.putFirst(9, 1)
            return 90
          }),
        { result: 90 },
        [
          [9, 90],
          [1, 10],
          [2, 20],
          [3, 30],
        ],
      ],
      [
        'replaceAll',
        (m) =>
          m.replaceAll((v, k) => {
            if (k === 1) m.lastEntry()
            return v * 2
          }),
        { result: undefined },
        [
          [1, 20],
          [2, 40],
          [3, 60],
        ],
      ],
      [
        'replaceAll, moving a mapping',
        (m) =>
          m.replaceAll((v, k) => {
            if (k === 2) m.putLast(1, 5)
            return v * 2
          }),
        {
          error: 'ConcurrentModificationError',
          message: 'LinkedHashMap.replaceAll: the map was changed by the callback',
        },
        [
          [2, 20],
          [3, 30],
          [1, 5],
        ],
      ],
      [
        'forEach, moving a visited mapping to the back',
        (m) => {
          const seen: Pair[] = []
          m.forEach((v, k) => {
            if (k === 1 && v === 10) m.putLast(1, 11)
            seen.push([k, v])
          })
          return seen
        },
        {
          result: [
            [1, 10],
            [2, 20],
            [3, 30],
            [1, 11],
          ],
        },
        [
          [2, 20],
          [3, 30],
          [1, 11],
        ],
      ],
    ]
    for (const [name, run, expected, after] of rows) {
      const map = three()
      expect(
        outcome(() => run(map)),
        name,
      ).toEqual(expected)
      expect(map.toJSON(), name).toEqual(after)
    }
  })

  it('give the same results and errors as before for removeIf on a set [045 S1-AC3]', () => {
    const set = new LinkedHashSet([1, 2, 3, 4])
    expect(
      set.removeIf((e) => {
        set.getLast()
        return e % 2 === 0
      }),
    ).toBe(true)
    expect([...set]).toEqual([1, 3])
    const other = new LinkedHashSet([1, 2, 3, 4])
    expect(() =>
      other.removeIf((e) => {
        if (e === 1) other.addFirst(3)
        return false
      }),
    ).toThrow(ConcurrentModificationError)
    expect([...other]).toEqual([3, 1, 2, 4])
    const message = new LinkedHashSet([1, 2])
    expect(() =>
      message.removeIf(() => {
        message.addFirst(2)
        return false
      }),
    ).toThrow('LinkedHashSet.removeIf: the collection was changed while deciding')
    const each: number[] = []
    const walked = new LinkedHashSet([1, 2, 3])
    walked.forEach((e) => {
      if (e === 1) walked.addLast(1)
      each.push(e)
    })
    expect(each).toEqual([1, 2, 3, 1])
  })

  it('deliver evictions as before when onEvict changes the layout [045 S1-AC3]', () => {
    const log: Array<[number, number]> = []
    const map: LinkedHashMap<number, number> = new LinkedHashMap<number, number>({
      maxSize: 2,
      onEvict: (value, key) => {
        log.push([key, value])
        const first = map.firstEntry()
        if (first !== undefined) map.putLast(first.key, first.value + 1)
      },
    })
    map.set(1, 10).set(2, 20).set(3, 30)
    expect(map.toJSON()).toEqual([
      [3, 30],
      [2, 21],
    ])
    map.set(4, 40)
    expect(log).toEqual([
      [1, 10],
      [3, 30],
    ])
    expect(map.toJSON()).toEqual([
      [4, 40],
      [2, 22],
    ])
    const quiet: Array<[number, number]> = []
    const small = new LinkedHashMap<number, number>({
      maxSize: 2,
      onEvict: (value, key) => {
        quiet.push([key, value])
        small.lastEntry()
      },
    })
    small.set(1, 10).set(2, 20).set(3, 30)
    expect(quiet).toEqual([[1, 10]])
    expect(small.toJSON()).toEqual([
      [2, 20],
      [3, 30],
    ])
  })

  it('compare, find and print values whose equality or toString changes the layout as before [045 S1-AC3]', () => {
    const map = new LinkedHashMap<number, Probe>()
    map.set(1, new Probe(1, map)).set(2, new Probe(2, map))
    const same = new LinkedHashMap<number, Probe>([
      [1, new Probe(1)],
      [2, new Probe(2)],
    ])
    expect(map.equals(same)).toBe(true)
    expect(same.equals(map)).toBe(true)
    const fresh = new LinkedHashMap<number, Probe>()
    fresh.set(1, new Probe(1, fresh)).set(2, new Probe(2, fresh))
    expect(fresh.entrySet().has(same.firstEntry() as MapEntry<number, Probe>)).toBe(true)
    const printed = new LinkedHashMap<number, Probe>()
    printed.set(1, new Probe(1, printed)).set(2, new Probe(2, printed))
    expect(printed.toString()).toBe('LinkedHashMap(2) {1 => Probe(1), 2 => Probe(2)}')
    const set = new LinkedHashSet<Probe>()
    set.add(new Probe(1, set)).add(new Probe(2, set))
    expect(set.toString()).toBe('LinkedHashSet(2) {Probe(1), Probe(2)}')
    expect(set.equals(new LinkedHashSet([new Probe(1), new Probe(2)]))).toBe(false)
  })
})

describe('hashing a map whose keys change the layout', () => {
  it('gives the hash of an equal map when a key’s hash switches the layout mid-walk [045 S1-AC3]', () => {
    class Key {
      readonly n: number
      map: { lastEntry(): unknown } | undefined
      constructor(n: number) {
        this.n = n
      }
      [equalsSymbol](other: unknown): boolean {
        return other instanceof Key && other.n === this.n
      }
      [hashCodeSymbol](): number {
        this.map?.lastEntry()
        return this.n
      }
    }
    const keys = [new Key(1), new Key(2), new Key(3)]
    const map = new LinkedHashMap<Key, number>(keys.map((k): [Key, number] => [k, k.n * 10]))
    const plain = new LinkedHashMap<Key, number>(keys.map((k): [Key, number] => [k, k.n * 10]))
    const expected = hashCode(plain)
    for (const key of keys) key.map = map
    expect(hashCode(map)).toBe(expected)
    expect(map.toJSON().map(([k, v]) => [k.n, v])).toEqual([
      [1, 10],
      [2, 20],
      [3, 30],
    ])
  })
})

describe('revision across layouts', () => {
  it('changes on the same calls as before, in either layout [045 S1-AC6]', () => {
    const map = new LinkedHashMap<number, number>()
    const mapCalls: Array<[string, () => unknown, boolean]> = [
      ['set new', () => map.set(1, 10), true],
      ['set new', () => map.set(2, 20), true],
      ['set present, same value', () => map.set(1, 10), true],
      ['get', () => map.get(1), false],
      ['delete absent', () => map.delete(9), false],
      ['put present', () => map.put(2, 21), true],
      ['replace absent', () => map.replace(9, 1), false],
      ['firstEntry', () => map.firstEntry(), false],
      ['putLast absent', () => map.putLast(3, 30), true],
      ['lastEntry', () => map.lastEntry(), false],
      ['putFirst present, not first', () => map.putFirst(3, 31), true],
      ['putFirst present, first', () => map.putFirst(3, 32), true],
      ['set new', () => map.set(4, 40), true],
      ['delete present', () => map.delete(4), true],
      ['pollFirstEntry', () => map.pollFirstEntry(), true],
      ['clear', () => map.clear(), true],
      ['clear empty', () => map.clear(), false],
      ['pollFirstEntry empty', () => map.pollFirstEntry(), false],
    ]
    for (const [name, call, changes] of mapCalls) {
      const before = map.revision
      call()
      expect(map.revision !== before, `map ${name}`).toBe(changes)
    }
    const native = new LinkedHashMap<number, number>([[1, 10]])
    for (const [name, call, changes] of [
      ['set present', () => native.set(1, 11), true],
      ['remove absent', () => native.remove(5), false],
      ['remove present', () => native.remove(1), true],
      ['clear empty', () => native.clear(), false],
    ] as Array<[string, () => unknown, boolean]>) {
      const before = native.revision
      call()
      expect(native.revision !== before, `native map ${name}`).toBe(changes)
    }

    const set = new LinkedHashSet<number>()
    const setCalls: Array<[string, () => unknown, boolean]> = [
      ['add new', () => set.add(1), true],
      ['add new', () => set.add(2), true],
      ['add member', () => set.add(1), false],
      ['has', () => set.has(1), false],
      ['delete absent', () => set.delete(9), false],
      ['addLast absent', () => set.addLast(3), true],
      ['getFirst', () => set.getFirst(), false],
      ['getLast', () => set.getLast(), false],
      ['addFirst member, first', () => set.addFirst(1), false],
      ['addFirst member, not first', () => set.addFirst(3), true],
      ['removeFirst', () => set.removeFirst(), true],
      ['clear', () => set.clear(), true],
      ['clear empty', () => set.clear(), false],
    ]
    for (const [name, call, changes] of setCalls) {
      const before = set.revision
      call()
      expect(set.revision !== before, `set ${name}`).toBe(changes)
    }
  })

  it('changes on the same callback and bulk calls as before, in either layout [045 S1-AC6]', () => {
    for (const switched of [false, true]) {
      const map = new LinkedHashMap<number, number>([
        [1, 10],
        [2, 20],
      ])
      if (switched) map.lastEntry()
      const mapCalls: Array<[string, () => unknown, boolean]> = [
        ['compute, same value', () => map.compute(1, (_k, v) => v), true],
        ['compute, new value', () => map.compute(1, (_k, v) => (v ?? 0) + 1), true],
        ['compute absent to undefined', () => map.compute(9, () => undefined), false],
        ['compute absent to a value', () => map.compute(3, () => 30), true],
        ['compute present to undefined', () => map.compute(3, () => undefined), true],
        ['computeIfPresent absent', () => map.computeIfPresent(9, () => 1), false],
        ['computeIfPresent, same value', () => map.computeIfPresent(1, (v) => v), true],
        ['computeIfPresent, new value', () => map.computeIfPresent(1, (v) => v + 1), true],
        ['merge present', () => map.merge(1, 5, (a, b) => a + b), true],
        ['merge absent', () => map.merge(4, 40, (a) => a), true],
        ['merge to undefined', () => map.merge(4, 0, () => undefined), true],
        ['getOrInsert present', () => map.getOrInsert(1, 0), false],
        ['getOrInsert absent', () => map.getOrInsert(5, 50), true],
        ['getOrInsertComputed present', () => map.getOrInsertComputed(5, () => 0), false],
        ['getOrInsertComputed absent', () => map.getOrInsertComputed(6, () => 60), true],
        ['replaceAll', () => map.replaceAll((v) => v), true],
        ['putAll empty', () => map.putAll([]), false],
        ['putAll present', () => map.putAll([[1, 1]]), true],
        ['putAll absent', () => map.putAll([[7, 70]]), true],
      ]
      for (const [name, call, changes] of mapCalls) {
        const before = map.revision
        call()
        expect(map.revision !== before, `map ${name}, switched ${switched}`).toBe(changes)
      }

      const set = new LinkedHashSet<number>([1, 2, 3, 4])
      if (switched) set.getLast()
      const setCalls: Array<[string, () => unknown, boolean]> = [
        ['addAll empty', () => set.addAll([]), false],
        ['addAll members', () => set.addAll([1, 2]), false],
        ['addAll a new element', () => set.addAll([2, 5]), true],
        ['removeAll empty', () => set.removeAll([]), false],
        ['removeAll absent', () => set.removeAll([9]), false],
        ['removeAll members', () => set.removeAll([5, 4, 9]), true],
        ['retainAll every member', () => set.retainAll([1, 2, 3]), false],
        ['retainAll some', () => set.retainAll([1, 2]), true],
        ['removeIf none', () => set.removeIf(() => false), false],
        ['removeIf one', () => set.removeIf((e) => e === 2), true],
      ]
      for (const [name, call, changes] of setCalls) {
        const before = set.revision
        call()
        expect(set.revision !== before, `set ${name}, switched ${switched}`).toBe(changes)
      }
    }
  })
})

// ── Seeded reference models ──

/** A mapping of the model, stamped with its place in the order. */
interface ModelRecord {
  readonly key: number
  value: number
  readonly seq: number
}

/** An open iteration of a model: the stamp of what it last returned, in its own direction. */
interface ModelWalk {
  readonly fromBack: boolean
  boundary: number
  done: boolean
}

/** The order of a linked map or set written as an array of stamped records. */
class OrderModel {
  records: ModelRecord[] = []
  low = 0
  high = 0
  readonly walks: ModelWalk[] = []

  indexOf(key: number): number {
    const k = key === 0 ? 0 : key
    return this.records.findIndex((r) => r.key === k)
  }

  link(key: number, value: number, front: boolean): ModelRecord {
    const k = key === 0 ? 0 : key
    const record = { key: k, value, seq: front ? --this.low : ++this.high }
    if (front) this.records.unshift(record)
    else this.records.push(record)
    return record
  }

  /** Moves a present record to an end: a removal and an insertion; false when already there. */
  move(index: number, front: boolean, value: number): boolean {
    const record = this.records[index] as ModelRecord
    if (index === (front ? 0 : this.records.length - 1)) {
      record.value = value
      return false
    }
    this.records.splice(index, 1)
    this.link(record.key, value, front)
    return true
  }

  clear(): void {
    if (this.records.length === 0) return
    this.records = []
    for (const walk of this.walks) {
      if (walk.done) continue
      walk.boundary = walk.fromBack ? this.high + 1 : this.low - 1
    }
  }

  open(fromBack: boolean): ModelWalk {
    const walk = { fromBack, boundary: fromBack ? this.high + 1 : this.low - 1, done: false }
    this.walks.push(walk)
    return walk
  }

  advance(walk: ModelWalk): ModelRecord | undefined {
    if (walk.done) return undefined
    const records = this.records
    let found: ModelRecord | undefined
    if (walk.fromBack) {
      for (let i = records.length - 1; i >= 0 && found === undefined; i--) {
        if ((records[i] as ModelRecord).seq < walk.boundary) found = records[i]
      }
    } else {
      found = records.find((r) => r.seq > walk.boundary)
    }
    if (found === undefined) {
      walk.done = true
      return undefined
    }
    walk.boundary = found.seq
    return found
  }
}

/** An error with the given name, thrown by a model where the collection throws that error. */
function named(name: string): Error {
  const error = new Error(name)
  error.name = name
  return error
}

/** The result of a call, or the name of the error it threw. */
function outcomeOf(body: () => unknown): unknown {
  try {
    return { ok: body() }
  } catch (error) {
    return { threw: (error as Error).name }
  }
}

const STEPS = 10_000
const PREFIX = 2_000

/**
 * One seeded run on a `LinkedHashMap`: the first `PREFIX` calls only from those that keep the
 * native layout, holding iterators and entries open, then every method of the map and its views.
 * Returns the call number of the first change of layout, or -1.
 */
function runMapModel(seed: number, maxSize: number | undefined, withEvict: boolean): number {
  const random = seeded(seed)
  const reported: Array<[number, number]> = []
  const evicted: Array<[number, number]> = []
  const map = new LinkedHashMap<number, number>({
    maxSize,
    onEvict: withEvict ? (value, key) => void reported.push([key, value]) : undefined,
  })
  const model = new OrderModel()
  const top = 11
  const iterators: Array<{
    ours: Iterator<unknown>
    walk: ModelWalk
    read: (r: ModelRecord) => unknown
  }> = []
  const entries: Array<{ ours: MapEntry<number, number>; key: number; last: number }> = []
  const cursors: Array<{
    ours: Cursor<number>
    walk: ModelWalk
    looked: ModelRecord | 'done' | undefined
    last: ModelRecord | undefined
  }> = []
  let switched = isNative(map) ? -1 : 0

  const insert = (key: number, value: number, front: boolean): void => {
    const made = model.link(key, value, front)
    if (maxSize === undefined) return
    while (model.records.length > maxSize) {
      const index = model.records[0] === made ? 1 : 0
      const victim = model.records.splice(index, 1)[0] as ModelRecord
      if (withEvict) evicted.push([victim.key, victim.value])
    }
  }
  const write = (key: number, value: number, front: boolean): number | undefined => {
    const index = model.indexOf(key)
    if (index < 0) {
      insert(key, value, front)
      return undefined
    }
    const record = model.records[index] as ModelRecord
    const old = record.value
    record.value = value
    return old
  }
  const valueFor = (key: number): number | undefined => {
    const index = model.indexOf(key)
    return index < 0 ? undefined : (model.records[index] as ModelRecord).value
  }
  const removeAt = (index: number): ModelRecord => model.records.splice(index, 1)[0] as ModelRecord
  const removeKey = (key: number): number | undefined => {
    const index = model.indexOf(key)
    return index < 0 ? undefined : removeAt(index).value
  }
  const end = (back: boolean): ModelRecord | undefined =>
    back ? model.records[model.records.length - 1] : model.records[0]
  const pairs = (): Pair[] => model.records.map((r) => [r.key, r.value])
  const entryPair = (e: MapEntry<number, number> | undefined): unknown =>
    e === undefined ? undefined : [e.key, e.value]
  const hold = (e: MapEntry<number, number> | undefined, record: ModelRecord | undefined) => {
    if (e === undefined || record === undefined) return
    entries.push({ ours: e, key: record.key, last: record.value })
    if (entries.length > 6) entries.shift()
  }
  const computeFn = (value: number | undefined): number | undefined =>
    value === undefined ? 7 : value % 3 === 0 ? undefined : value + 1

  const nativeOps = [
    'set',
    'set',
    'set',
    'put',
    'get',
    'getOrDefault',
    'has',
    'containsValue',
    'delete',
    'remove',
    'replace',
    'replaceAll',
    'getOrInsert',
    'getOrInsertComputed',
    'compute',
    'computeIfPresent',
    'merge',
    'putAll',
    'putLastAbsent',
    'clear',
    'firstEntry',
    'pollFirstEntry',
    'iterate',
    'step',
    'step',
    'step',
    'forEach',
    'copy',
    'readEntry',
    'setEntry',
    'viewLookup',
  ]
  const allOps = [
    ...nativeOps,
    'putFirst',
    'putLast',
    'lastEntry',
    'pollLastEntry',
    'reversedWrite',
    'reversedEnds',
    'iterateView',
    'keyView',
    'entryView',
    'valueView',
    'cursor',
    'look',
    'next',
    'cursorRemove',
  ]

  for (let step = 0; step < STEPS; step++) {
    const op = pick(random, step < PREFIX ? nativeOps : allOps)
    const at = `map seed ${seed} step ${step} op ${op}`
    const k = random() < 0.05 ? -0 : integer(random, 0, top)
    const v = integer(random, 0, 99)
    const same = (ours: () => unknown, expected: () => unknown) => {
      const got = outcomeOf(ours)
      const want = outcomeOf(expected)
      if (JSON.stringify(got) !== JSON.stringify(want)) expect(got, at).toEqual(want)
    }
    switch (op) {
      case 'set':
        same(
          () => map.set(k, v) === map,
          () => {
            write(k, v, false)
            return true
          },
        )
        break
      case 'put':
        same(
          () => map.put(k, v),
          () => write(k, v, false),
        )
        break
      case 'get':
        same(
          () => map.get(k),
          () => valueFor(k),
        )
        break
      case 'getOrDefault':
        same(
          () => map.getOrDefault(k, -1),
          () => valueFor(k) ?? -1,
        )
        break
      case 'has':
        same(
          () => map.has(k),
          () => model.indexOf(k) >= 0,
        )
        break
      case 'containsValue':
        same(
          () => map.containsValue(v),
          () => model.records.some((r) => r.value === v),
        )
        break
      case 'delete':
        same(
          () => map.delete(k),
          () => removeKey(k) !== undefined,
        )
        break
      case 'remove':
        same(
          () => map.remove(k),
          () => removeKey(k),
        )
        break
      case 'replace':
        same(
          () => map.replace(k, v),
          () => (model.indexOf(k) >= 0 ? write(k, v, false) : undefined),
        )
        break
      case 'replaceAll':
        same(
          () => map.replaceAll((value, key) => (value + key) % 100),
          () => {
            for (const r of model.records) r.value = (r.value + r.key) % 100
          },
        )
        break
      case 'getOrInsert':
        same(
          () => map.getOrInsert(k, v),
          () => {
            const value = valueFor(k)
            if (value !== undefined) return value
            insert(k, v, false)
            return v
          },
        )
        break
      case 'getOrInsertComputed':
        same(
          () => map.getOrInsertComputed(k, (key) => key + v),
          () => {
            const value = valueFor(k)
            if (value !== undefined) return value
            insert(k, k + v, false)
            return k + v
          },
        )
        break
      case 'compute':
      case 'computeIfPresent':
        same(
          () => (op === 'compute' ? map.compute(k, computeFn) : map.computeIfPresent(k, computeFn)),
          () => {
            const index = model.indexOf(k)
            if (index < 0) {
              if (op === 'computeIfPresent') return undefined
              insert(k, 7, false)
              return 7
            }
            const result = computeFn((model.records[index] as ModelRecord).value)
            if (result === undefined) removeAt(index)
            else (model.records[index] as ModelRecord).value = result
            return result
          },
        )
        break
      case 'merge': {
        const fn = (old: number, value: number) => (old > 60 ? undefined : old + value)
        same(
          () => map.merge(k, v, fn),
          () => {
            const index = model.indexOf(k)
            if (index < 0) {
              insert(k, v, false)
              return v
            }
            const result = fn((model.records[index] as ModelRecord).value, v)
            if (result === undefined) removeAt(index)
            else (model.records[index] as ModelRecord).value = result
            return result
          },
        )
        break
      }
      case 'putAll': {
        const w = integer(random, 0, top)
        same(
          () =>
            map.putAll([
              [k, v],
              [w, v + 1],
            ]),
          () => {
            write(k, v, false)
            write(w, v + 1, false)
          },
        )
        break
      }
      case 'putLastAbsent': {
        let key = -1
        for (let c = 0; c <= top; c++) if (model.indexOf(c) < 0) key = c
        if (key < 0) break
        same(
          () => map.putLast(key, v) === map,
          () => {
            insert(key, v, false)
            return true
          },
        )
        break
      }
      case 'clear':
        if (random() < 0.8) break
        same(
          () => map.clear(),
          () => model.clear(),
        )
        break
      case 'firstEntry': {
        const e = map.firstEntry()
        const record = end(false)
        expect(entryPair(e), at).toEqual(
          record === undefined ? undefined : [record.key, record.value],
        )
        hold(e, record)
        break
      }
      case 'pollFirstEntry': {
        const e = map.pollFirstEntry()
        const record = end(false)
        expect(entryPair(e), at).toEqual(
          record === undefined ? undefined : [record.key, record.value],
        )
        if (record !== undefined) removeAt(0)
        hold(e, record)
        break
      }
      case 'iterate': {
        const kind = integer(random, 0, 3)
        const ours: Iterator<unknown> =
          kind === 0
            ? map.keys()
            : kind === 1
              ? map.values()
              : kind === 2
                ? map.entries()
                : map[Symbol.iterator]()
        const read =
          kind === 0
            ? (r: ModelRecord) => r.key
            : kind === 1
              ? (r: ModelRecord) => r.value
              : (r: ModelRecord) => [r.key, r.value]
        iterators.push({ ours, walk: model.open(false), read })
        if (iterators.length > 8) iterators.shift()
        break
      }
      case 'iterateView': {
        const fromBack = random() < 0.5
        const source: SequencedMap<number, number> = fromBack ? map.reversed() : map
        const kind = integer(random, 0, 3)
        const raw: Iterator<unknown> =
          kind === 0
            ? source.keySet()[Symbol.iterator]()
            : kind === 1
              ? source.valueCollection()[Symbol.iterator]()
              : kind === 2
                ? source.entrySet()[Symbol.iterator]()
                : source.keys()
        const ours: Iterator<unknown> =
          kind === 2
            ? {
                next: () => {
                  const r = raw.next() as IteratorResult<MapEntry<number, number>>
                  return r.done === true ? r : { done: false, value: [r.value.key, r.value.value] }
                },
              }
            : raw
        const read =
          kind === 1
            ? (r: ModelRecord) => r.value
            : kind === 2
              ? (r: ModelRecord) => [r.key, r.value]
              : (r: ModelRecord) => r.key
        iterators.push({ ours, walk: model.open(fromBack), read })
        if (iterators.length > 8) iterators.shift()
        break
      }
      case 'step': {
        if (iterators.length === 0) break
        const it = pick(random, iterators)
        const record = model.advance(it.walk)
        expect(it.ours.next(), at).toEqual(
          record === undefined
            ? { done: true, value: undefined }
            : { done: false, value: it.read(record) },
        )
        break
      }
      case 'forEach': {
        const seen: Pair[] = []
        map.forEach((value, key) => void seen.push([key, value]))
        expect(seen, at).toEqual(pairs())
        break
      }
      case 'copy': {
        const copy = map.copy()
        expect(copy.toJSON(), at).toEqual(pairs())
        expect(copy.equals(map), at).toBe(true)
        break
      }
      case 'readEntry': {
        if (entries.length === 0) break
        const held = pick(random, entries)
        const current = valueFor(held.key)
        if (current !== undefined) held.last = current
        expect(held.ours.value, at).toBe(held.last)
        break
      }
      case 'setEntry': {
        if (entries.length === 0) break
        const held = pick(random, entries)
        same(
          () => held.ours.setValue(v),
          () => {
            const index = model.indexOf(held.key)
            if (index < 0) throw named('IllegalStateError')
            const record = model.records[index] as ModelRecord
            const old = record.value
            record.value = v
            held.last = v
            return old
          },
        )
        break
      }
      case 'viewLookup': {
        const which = integer(random, 0, 2)
        const present = model.indexOf(k) >= 0
        if (which === 0) {
          expect(map.keySet().has(k), at).toBe(present)
          expect(map.keySet().size, at).toBe(model.records.length)
        } else if (which === 1) {
          const probe = new LinkedHashMap([[k, v]]).firstEntry() as MapEntry<number, number>
          expect(map.entrySet().has(probe), at).toBe(present && valueFor(k) === v)
          expect(map.entrySet().isEmpty(), at).toBe(model.records.length === 0)
        } else {
          expect(map.valueCollection().has(v), at).toBe(model.records.some((r) => r.value === v))
          expect(map.valueCollection().size, at).toBe(model.records.length)
        }
        break
      }
      case 'putFirst':
      case 'putLast': {
        const front = op === 'putFirst'
        same(
          () => (front ? map.putFirst(k, v) : map.putLast(k, v)) === map,
          () => {
            const index = model.indexOf(k)
            if (index < 0) insert(k, v, front)
            else model.move(index, front, v)
            return true
          },
        )
        break
      }
      case 'lastEntry': {
        const e = map.lastEntry()
        const record = end(true)
        expect(entryPair(e), at).toEqual(
          record === undefined ? undefined : [record.key, record.value],
        )
        hold(e, record)
        break
      }
      case 'pollLastEntry': {
        const e = map.pollLastEntry()
        const record = end(true)
        expect(entryPair(e), at).toEqual(
          record === undefined ? undefined : [record.key, record.value],
        )
        if (record !== undefined) removeAt(model.records.length - 1)
        hold(e, record)
        break
      }
      case 'reversedWrite': {
        const reversed = map.reversed()
        const which = integer(random, 0, 4)
        if (which === 0) {
          same(
            () => reversed.set(k, v) === reversed,
            () => {
              write(k, v, true)
              return true
            },
          )
        } else if (which === 1) {
          same(
            () => reversed.putFirst(k, v) === reversed,
            () => {
              const index = model.indexOf(k)
              if (index < 0) insert(k, v, false)
              else model.move(index, false, v)
              return true
            },
          )
        } else if (which === 2) {
          same(
            () => reversed.putLast(k, v) === reversed,
            () => {
              const index = model.indexOf(k)
              if (index < 0) insert(k, v, true)
              else model.move(index, true, v)
              return true
            },
          )
        } else if (which === 3) {
          same(
            () => reversed.delete(k),
            () => removeKey(k) !== undefined,
          )
        } else {
          same(
            () => reversed.compute(k, computeFn),
            () => {
              const index = model.indexOf(k)
              if (index < 0) {
                insert(k, 7, true)
                return 7
              }
              const result = computeFn((model.records[index] as ModelRecord).value)
              if (result === undefined) removeAt(index)
              else (model.records[index] as ModelRecord).value = result
              return result
            },
          )
        }
        break
      }
      case 'reversedEnds': {
        const reversed = map.reversed()
        const which = integer(random, 0, 3)
        const back = which % 2 === 1
        const record = end(!back)
        const e =
          which === 0
            ? reversed.firstEntry()
            : which === 1
              ? reversed.lastEntry()
              : which === 2
                ? reversed.pollFirstEntry()
                : reversed.pollLastEntry()
        expect(entryPair(e), at).toEqual(
          record === undefined ? undefined : [record.key, record.value],
        )
        if (which >= 2 && record !== undefined) removeAt(model.records.indexOf(record))
        hold(e, record)
        break
      }
      case 'keyView': {
        const fromBack = random() < 0.3
        const keys: SequencedSet<number> = (fromBack ? map.reversed() : map).keySet()
        const which = integer(random, 0, 8)
        const first = (back: boolean) => end(back !== fromBack)
        if (which === 0) {
          same(
            () => keys.delete(k),
            () => removeKey(k) !== undefined,
          )
        } else if (which === 1 || which === 2) {
          const back = which === 2
          same(
            () => (back ? keys.getLast() : keys.getFirst()),
            () => {
              const record = first(back)
              if (record === undefined) throw named('NoSuchElementError')
              return record.key
            },
          )
        } else if (which === 3 || which === 4) {
          const back = which === 4
          same(
            () => (back ? keys.removeLast() : keys.removeFirst()),
            () => {
              const record = first(back)
              if (record === undefined) throw named('NoSuchElementError')
              removeAt(model.records.indexOf(record))
              return record.key
            },
          )
        } else if (which === 5) {
          same(
            () => keys.removeIf((key) => key % 4 === k % 4),
            () => {
              const before = model.records.length
              model.records = model.records.filter((r) => r.key % 4 !== k % 4)
              return model.records.length !== before
            },
          )
        } else if (which === 6) {
          same(
            () => keys.retainAll([k, (k + 1) % 12, (k + 2) % 12, (k + 3) % 12, (k + 5) % 12]),
            () => {
              const keep = new Set([k, (k + 1) % 12, (k + 2) % 12, (k + 3) % 12, (k + 5) % 12])
              const before = model.records.length
              model.records = model.records.filter((r) => keep.has(r.key))
              return model.records.length !== before
            },
          )
        } else if (which === 7) {
          same(
            () => keys.toArray(),
            () => {
              const out = model.records.map((r) => r.key)
              return fromBack ? out.reverse() : out
            },
          )
        } else {
          same(
            () => keys.add(k),
            () => {
              throw named('UnsupportedOperationError')
            },
          )
        }
        break
      }
      case 'entryView': {
        const fromBack = random() < 0.3
        const view = (fromBack ? map.reversed() : map).entrySet()
        const which = integer(random, 0, 3)
        if (which === 0) {
          const probe = new LinkedHashMap([[k, v]]).firstEntry() as MapEntry<number, number>
          same(
            () => view.delete(probe),
            () => valueFor(k) === v && removeKey(k) !== undefined,
          )
        } else if (which === 1) {
          same(
            () => entryPair(view.removeFirst()),
            () => {
              const record = end(fromBack)
              if (record === undefined) throw named('NoSuchElementError')
              removeAt(model.records.indexOf(record))
              return [record.key, record.value]
            },
          )
        } else if (which === 2) {
          same(
            () => entryPair(view.getLast()),
            () => {
              const record = end(!fromBack)
              if (record === undefined) throw named('NoSuchElementError')
              return [record.key, record.value]
            },
          )
        } else {
          same(
            () => view.toArray().map((e) => [e.key, e.value]),
            () => (fromBack ? pairs().reverse() : pairs()),
          )
        }
        break
      }
      case 'valueView': {
        const fromBack = random() < 0.3
        const values = (fromBack ? map.reversed() : map).valueCollection()
        const which = integer(random, 0, 4)
        if (which === 0) {
          same(
            () => values.delete(v % 20),
            () => {
              const order = fromBack ? model.records.slice().reverse() : model.records
              const record = order.find((r) => r.value === v % 20)
              if (record === undefined) return false
              removeAt(model.records.indexOf(record))
              return true
            },
          )
        } else if (which === 1) {
          same(
            () => values.removeLast(),
            () => {
              const record = end(!fromBack)
              if (record === undefined) throw named('NoSuchElementError')
              removeAt(model.records.indexOf(record))
              return record.value
            },
          )
        } else if (which === 2) {
          same(
            () => values.getFirst(),
            () => {
              const record = end(fromBack)
              if (record === undefined) throw named('NoSuchElementError')
              return record.value
            },
          )
        } else if (which === 3) {
          same(
            () => values.removeIf((value) => value % 5 === 0),
            () => {
              const before = model.records.length
              model.records = model.records.filter((r) => r.value % 5 !== 0)
              return model.records.length !== before
            },
          )
        } else {
          same(
            () => values.clear(),
            () => model.clear(),
          )
        }
        break
      }
      case 'cursor': {
        const fromBack = random() < 0.5
        cursors.push({
          ours: (fromBack ? map.reversed() : map).keySet().cursor(),
          walk: model.open(fromBack),
          looked: undefined,
          last: undefined,
        })
        if (cursors.length > 4) cursors.shift()
        break
      }
      case 'look':
      case 'next': {
        if (cursors.length === 0) break
        const cursor = pick(random, cursors)
        if (cursor.looked === undefined) cursor.looked = model.advance(cursor.walk) ?? 'done'
        if (op === 'look') {
          expect(cursor.ours.hasNext(), at).toBe(cursor.looked !== 'done')
        } else if (cursor.looked === 'done') {
          expect(
            outcomeOf(() => cursor.ours.next()),
            at,
          ).toEqual({ threw: 'NoSuchElementError' })
        } else {
          expect(cursor.ours.next(), at).toBe(cursor.looked.key)
          cursor.last = cursor.looked
          cursor.looked = undefined
        }
        break
      }
      case 'cursorRemove': {
        if (cursors.length === 0) break
        const cursor = pick(random, cursors)
        same(
          () => cursor.ours.remove(),
          () => {
            if (cursor.last === undefined) throw named('IllegalStateError')
            removeKey(cursor.last.key)
            cursor.last = undefined
          },
        )
        break
      }
    }
    if (switched < 0 && !isNative(map)) switched = step
    const expected = pairs()
    const text = `LinkedHashMap(${expected.length}) {${expected.map(([a, b]) => `${a} => ${b}`).join(', ')}}`
    const agrees =
      map.size === expected.length &&
      JSON.stringify(map.toJSON()) === JSON.stringify(expected) &&
      map.toString() === text &&
      map.equals(LinkedHashMap.from(expected)) &&
      JSON.stringify(reported) === JSON.stringify(evicted)
    if (!agrees) {
      expect(map.size, at).toBe(expected.length)
      expect(map.toJSON(), at).toEqual(expected)
      expect(map.toString(), at).toBe(text)
      expect(map.equals(LinkedHashMap.from(expected)), at).toBe(true)
      expect(reported, at).toEqual(evicted)
    }
  }
  return switched
}

/** One seeded run on a `LinkedHashSet`, as `runMapModel`. */
function runSetModel(seed: number): number {
  const random = seeded(seed)
  const set = new LinkedHashSet<number>()
  const model = new OrderModel()
  const top = 11
  const iterators: Array<{
    ours: Iterator<unknown>
    walk: ModelWalk
    read: (r: ModelRecord) => unknown
  }> = []
  const cursors: Array<{
    ours: Cursor<number>
    walk: ModelWalk
    looked: ModelRecord | 'done' | undefined
    last: ModelRecord | undefined
  }> = []
  let switched = isNative(set) ? -1 : 0
  const members = (): number[] => model.records.map((r) => r.key)
  const add = (e: number, front: boolean): boolean => {
    if (model.indexOf(e) >= 0) return false
    model.link(e, 0, front)
    return true
  }
  const remove = (e: number): boolean => {
    const index = model.indexOf(e)
    if (index < 0) return false
    model.records.splice(index, 1)
    return true
  }
  const end = (back: boolean): ModelRecord | undefined =>
    back ? model.records[model.records.length - 1] : model.records[0]

  const nativeOps = [
    'add',
    'add',
    'add',
    'addLastAbsent',
    'has',
    'delete',
    'addAll',
    'removeAll',
    'retainAll',
    'removeIf',
    'clear',
    'getFirst',
    'removeFirst',
    'iterate',
    'step',
    'step',
    'step',
    'cursor',
    'look',
    'next',
    'next',
    'cursorRemove',
    'forEach',
    'toArray',
    'copy',
  ]
  const allOps = [
    ...nativeOps,
    'addFirst',
    'addLast',
    'getLast',
    'removeLast',
    'reversed',
    'reversed',
    'reversedIterate',
    'reversedCursor',
  ]
  for (let step = 0; step < STEPS; step++) {
    const op = pick(random, step < PREFIX ? nativeOps : allOps)
    const at = `set seed ${seed} step ${step} op ${op}`
    const e = random() < 0.05 ? -0 : integer(random, 0, top)
    const same = (ours: () => unknown, expected: () => unknown) => {
      const got = outcomeOf(ours)
      const want = outcomeOf(expected)
      if (JSON.stringify(got) !== JSON.stringify(want)) expect(got, at).toEqual(want)
    }
    switch (op) {
      case 'add':
        same(
          () => set.add(e) === set,
          () => {
            add(e, false)
            return true
          },
        )
        break
      case 'addLastAbsent': {
        let member = -1
        for (let c = 0; c <= top; c++) if (model.indexOf(c) < 0) member = c
        if (member < 0) break
        same(
          () => set.addLast(member) === set,
          () => {
            add(member, false)
            return true
          },
        )
        break
      }
      case 'has':
        same(
          () => set.has(e),
          () => model.indexOf(e) >= 0,
        )
        break
      case 'delete':
        same(
          () => set.delete(e),
          () => remove(e),
        )
        break
      case 'addAll': {
        const items = [e, (e + 3) % 12, (e + 7) % 12]
        same(
          () => set.addAll(items),
          () => items.map((x) => add(x, false)).some(Boolean),
        )
        break
      }
      case 'removeAll':
      case 'retainAll': {
        const items = [e, (e + 1) % 12, (e + 4) % 12, (e + 6) % 12, (e + 9) % 12]
        same(
          () => (op === 'removeAll' ? set.removeAll(items) : set.retainAll(items)),
          () => {
            const before = model.records.length
            const inItems = new Set(items.map((x) => (x === 0 ? 0 : x)))
            model.records = model.records.filter((r) => inItems.has(r.key) !== (op === 'removeAll'))
            return model.records.length !== before
          },
        )
        break
      }
      case 'removeIf':
        same(
          () => set.removeIf((x) => x % 3 === e % 3),
          () => {
            const before = model.records.length
            model.records = model.records.filter((r) => r.key % 3 !== e % 3)
            return model.records.length !== before
          },
        )
        break
      case 'clear':
        if (random() < 0.8) break
        same(
          () => set.clear(),
          () => model.clear(),
        )
        break
      case 'getFirst':
      case 'getLast':
      case 'removeFirst':
      case 'removeLast': {
        const back = op === 'getLast' || op === 'removeLast'
        const removing = op.startsWith('remove')
        same(
          () =>
            op === 'getFirst'
              ? set.getFirst()
              : op === 'getLast'
                ? set.getLast()
                : op === 'removeFirst'
                  ? set.removeFirst()
                  : set.removeLast(),
          () => {
            const record = end(back)
            if (record === undefined) throw named('NoSuchElementError')
            if (removing) model.records.splice(model.records.indexOf(record), 1)
            return record.key
          },
        )
        break
      }
      case 'addFirst':
      case 'addLast': {
        const front = op === 'addFirst'
        same(
          () => (front ? set.addFirst(e) : set.addLast(e)) === set,
          () => {
            const index = model.indexOf(e)
            if (index < 0) model.link(e, 0, front)
            else model.move(index, front, 0)
            return true
          },
        )
        break
      }
      case 'reversed': {
        const reversed = set.reversed()
        const which = integer(random, 0, 5)
        if (which === 0) {
          same(
            () => reversed.add(e) === reversed,
            () => {
              add(e, true)
              return true
            },
          )
        } else if (which === 1) {
          same(
            () => reversed.addFirst(e) === reversed,
            () => {
              const index = model.indexOf(e)
              if (index < 0) model.link(e, 0, false)
              else model.move(index, false, 0)
              return true
            },
          )
        } else if (which === 2) {
          same(
            () => reversed.removeFirst(),
            () => {
              const record = end(true)
              if (record === undefined) throw named('NoSuchElementError')
              model.records.pop()
              return record.key
            },
          )
        } else if (which === 3) {
          same(
            () => reversed.getLast(),
            () => {
              const record = end(false)
              if (record === undefined) throw named('NoSuchElementError')
              return record.key
            },
          )
        } else if (which === 4) {
          same(
            () => reversed.delete(e),
            () => remove(e),
          )
        } else {
          same(
            () => reversed.toArray(),
            () => members().reverse(),
          )
        }
        break
      }
      case 'iterate':
      case 'reversedIterate': {
        const fromBack = op === 'reversedIterate'
        const source: SequencedSet<number> = fromBack ? set.reversed() : set
        const kind = integer(random, 0, 3)
        const ours: Iterator<unknown> =
          kind === 0
            ? source.keys()
            : kind === 1
              ? source.values()
              : kind === 2
                ? source.entries()
                : source[Symbol.iterator]()
        const read = kind === 2 ? (r: ModelRecord) => [r.key, r.key] : (r: ModelRecord) => r.key
        iterators.push({ ours, walk: model.open(fromBack), read })
        if (iterators.length > 8) iterators.shift()
        break
      }
      case 'step': {
        if (iterators.length === 0) break
        const it = pick(random, iterators)
        const record = model.advance(it.walk)
        expect(it.ours.next(), at).toEqual(
          record === undefined
            ? { done: true, value: undefined }
            : { done: false, value: it.read(record) },
        )
        break
      }
      case 'cursor':
      case 'reversedCursor': {
        const fromBack = op === 'reversedCursor'
        cursors.push({
          ours: (fromBack ? set.reversed() : set).cursor(),
          walk: model.open(fromBack),
          looked: undefined,
          last: undefined,
        })
        if (cursors.length > 4) cursors.shift()
        break
      }
      case 'look':
      case 'next': {
        if (cursors.length === 0) break
        const cursor = pick(random, cursors)
        if (cursor.looked === undefined) cursor.looked = model.advance(cursor.walk) ?? 'done'
        if (op === 'look') {
          expect(cursor.ours.hasNext(), at).toBe(cursor.looked !== 'done')
        } else if (cursor.looked === 'done') {
          expect(
            outcomeOf(() => cursor.ours.next()),
            at,
          ).toEqual({ threw: 'NoSuchElementError' })
        } else {
          expect(cursor.ours.next(), at).toBe(cursor.looked.key)
          cursor.last = cursor.looked
          cursor.looked = undefined
        }
        break
      }
      case 'cursorRemove': {
        if (cursors.length === 0) break
        const cursor = pick(random, cursors)
        same(
          () => cursor.ours.remove(),
          () => {
            if (cursor.last === undefined) throw named('IllegalStateError')
            remove(cursor.last.key)
            cursor.last = undefined
          },
        )
        break
      }
      case 'forEach': {
        const seen: number[] = []
        set.forEach((x, y) => {
          expect(y, at).toBe(x)
          seen.push(x)
        })
        expect(seen, at).toEqual(members())
        break
      }
      case 'toArray':
        expect(set.toArray(), at).toEqual(members())
        break
      case 'copy': {
        const copy = set.copy()
        expect([...copy], at).toEqual(members())
        expect(copy.equals(set), at).toBe(true)
        break
      }
    }
    if (switched < 0 && !isNative(set)) switched = step
    const expected = members()
    const text = `LinkedHashSet(${expected.length}) {${expected.join(', ')}}`
    const agrees =
      set.size === expected.length &&
      JSON.stringify(set.toJSON()) === JSON.stringify(expected) &&
      set.toString() === text &&
      set.equals(LinkedHashSet.from(expected))
    if (!agrees) {
      expect(set.size, at).toBe(expected.length)
      expect(set.toJSON(), at).toEqual(expected)
      expect(set.toString(), at).toBe(text)
      expect(set.equals(LinkedHashSet.from(expected)), at).toBe(true)
    }
  }
  return switched
}

describe('seeded runs against reference models', () => {
  it('give a LinkedHashMap, with and without maxSize and onEvict, the results of a model at every step [045 S1-AC4]', () => {
    for (let run = 0; run < 10; run++) {
      const maxSize = run < 4 ? undefined : 6
      const withEvict = run >= 7
      const switched = runMapModel(0x45a0 + run, maxSize, withEvict)
      // The run moved to linked records on one of its later calls, never in the prefix.
      expect(switched, `map run ${run}`).toBeGreaterThanOrEqual(PREFIX)
      expect(switched, `map run ${run}`).toBeLessThan(PREFIX + 100)
    }
  }, 120_000)

  it('give a LinkedHashSet the results of a model at every step [045 S1-AC5]', () => {
    for (let run = 0; run < 10; run++) {
      const switched = runSetModel(0x45b0 + run)
      expect(switched, `set run ${run}`).toBeGreaterThanOrEqual(PREFIX)
      expect(switched, `set run ${run}`).toBeLessThan(PREFIX + 100)
    }
  }, 120_000)
})

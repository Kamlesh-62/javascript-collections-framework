import { describe, expect, it } from 'vitest'
import { ConcurrentModificationError, LinkedHashMap } from '../src/index'
import { integer, pick, seeded } from './support/random'
import { runSequencedMapReferenceModel } from './support/reference-model'

// The behaviour of a `LinkedHashMap` with `accessOrder: true` that its internal fast paths must
// keep: results, eviction order and `onEvict` calls, when `revision` changes, live iteration that
// never returns a mapping twice, and the cost of `get` and `set`.

function caught(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  return undefined
}

/** Wraps `Map.prototype` reads and writes with a counter while `work` runs. */
function nativeCalls(work: () => void): number {
  let calls = 0
  const saved: Array<[string, unknown]> = []
  for (const name of ['get', 'has', 'set', 'delete']) {
    const original = Reflect.get(Map.prototype, name) as (...args: unknown[]) => unknown
    saved.push([name, original])
    Reflect.set(Map.prototype, name, function (this: unknown, ...args: unknown[]) {
      calls++
      return Reflect.apply(original, this, args)
    })
  }
  try {
    work()
  } finally {
    for (const [name, original] of saved) Reflect.set(Map.prototype, name, original)
  }
  return calls
}

const keysOf = (map: LinkedHashMap<number, number>): number[] => [...map.keys()]

describe('LinkedHashMap in access order — seeded models', () => {
  const modes: Array<[string, number | undefined]> = [
    ['unbounded', undefined],
    ['maxSize 8 with onEvict', 8],
    ['maxSize 1 with onEvict', 1],
  ]
  for (const [mode, maxSize] of modes) {
    it(`matches the linked-map model with open iterators, cursors and the reversed view, ${mode}, over 10 runs of 10,000 calls [050 S1-AC3]`, () => {
      for (let run = 0; run < 10; run++) {
        runSequencedMapReferenceModel({
          seed: 0x5050 + run,
          steps: 10_000,
          accessOrder: true,
          maxSize,
          make: (onEvict) =>
            new LinkedHashMap<unknown, number>({
              accessOrder: true,
              maxSize,
              onEvict: maxSize === undefined ? undefined : onEvict,
            }),
        })
      }
    }, 120_000)
  }

  for (const [mode, maxSize, evicts] of [
    ['unbounded', undefined, false],
    ['maxSize 6 without onEvict', 6, false],
    ['maxSize 6 with re-entrant and throwing onEvict', 6, true],
    ['maxSize 2 with re-entrant and throwing onEvict', 2, true],
  ] as Array<[string, number | undefined, boolean]>) {
    it(`matches a Map and array model with views and revision, ${mode}, over 10 runs of 10,000 calls [050 S1-AC3] [050 S1-AC4]`, () => {
      for (let run = 0; run < 10; run++) runLruModel(0x5100 + run, 10_000, maxSize, evicts)
    }, 120_000)

    it(`matches the model through direct calls only before the first walk, ${mode}, over 10 runs of 10,000 calls [050 S1-AC3] [050 S1-AC4]`, () => {
      for (let run = 0; run < 10; run++) runLruModel(0x5200 + run, 10_000, maxSize, evicts, true)
    }, 120_000)
  }
})

/**
 * A model of an access-ordered map: `order` holds the keys least recently used first and `values`
 * their values. An `onEvict` callback reacts to each eviction with a call chosen by the eviction's
 * number (read, write, delete, clear, or throw), and the model replays the same reactions in the
 * same order after the call, as the map delivers them. Reading calls (`toString`, `toJSON`,
 * `equals`, iteration) are made only in the second half of a run, so the first half runs on a map
 * that has never been walked; with `direct`, it also makes only the calls such a map answers
 * without its records (`get`, `set`, `has`, `delete`, `clear`, and `put` when no `onEvict` is set),
 * so the first half runs on the slots of an access-ordered map.
 */
function runLruModel(
  seed: number,
  steps: number,
  maxSize: number | undefined,
  evicts: boolean,
  direct = false,
): void {
  const random = seeded(seed)
  const label = `LRU model seed ${seed}`
  const order: number[] = []
  const values = new Map<number, number>()
  const pending: Array<[number, number]> = []
  const delivered: Array<[number, number, unknown]> = []
  const failure = new Error('onEvict failed')
  let evictions = 0
  let expectedDelivered: Array<[number, number]> = []
  const reaction = (n: number): 'none' | 'get' | 'set' | 'delete' | 'clear' | 'throw' => {
    if (!evicts) return 'none'
    const r = n % 23
    return r === 1
      ? 'get'
      : r === 2
        ? 'set'
        : r === 3
          ? 'delete'
          : r === 4
            ? 'throw'
            : n % 97 === 5
              ? 'clear'
              : 'none'
  }
  // The map's reactions, run inside `onEvict`.
  let eventsSeen = 0
  const map: LinkedHashMap<number, number> = new LinkedHashMap<number, number>({
    accessOrder: true,
    maxSize,
    onEvict: !evicts
      ? undefined
      : function (this: unknown, value, key, owner) {
          delivered.push([key, value, this])
          expect(owner).toBe(map)
          const what = reaction(eventsSeen++)
          if (what === 'get') map.get(key + 1)
          else if (what === 'set') map.set(key + 50, value)
          else if (what === 'delete') map.delete(key + 2)
          else if (what === 'clear') map.clear()
          else if (what === 'throw') throw failure
        },
  })
  // The model's own operations.
  let changed = false
  const touch = (k: number): void => {
    const i = order.indexOf(k)
    if (i < 0 || i === order.length - 1) return
    order.splice(i, 1)
    order.push(k)
    changed = true
  }
  const write = (k: number, v: number): void => {
    changed = true
    if (values.has(k)) {
      values.set(k, v)
      touch(k)
      return
    }
    values.set(k, v)
    order.push(k)
    if (maxSize !== undefined) {
      while (order.length > maxSize) {
        const victim = order.shift() as number
        if (evicts) pending.push([victim, values.get(victim) as number])
        values.delete(victim)
      }
    }
  }
  const remove = (k: number): boolean => {
    const i = order.indexOf(k)
    if (i < 0) return false
    order.splice(i, 1)
    values.delete(k)
    changed = true
    return true
  }
  const clearAll = (): void => {
    if (order.length > 0) changed = true
    order.length = 0
    values.clear()
  }
  /** Delivers the model's pending evictions; returns the error the call ends with, if any. */
  const deliver = (): unknown => {
    let error: unknown
    while (pending.length > 0) {
      const [key, value] = pending.shift() as [number, number]
      expectedDelivered.push([key, value])
      const what = reaction(evictions++)
      if (what === 'get') touch(key + 1)
      else if (what === 'set') write(key + 50, value)
      else if (what === 'delete') remove(key + 2)
      else if (what === 'clear') clearAll()
      else if (what === 'throw') {
        error = failure
        pending.length = 0
      }
    }
    return error
  }
  const top = 24
  for (let step = 0; step < steps; step++) {
    const late = step >= steps / 2
    // With `direct`, the first half makes only calls a never-walked map answers without its
    // records: no view, no callback, no reversed view.
    const ops =
      direct && !late
        ? ['get', 'get', 'get', 'set', 'set', 'has', 'delete', ...(evicts ? [] : ['put'])]
        : [
            'get',
            'get',
            'get',
            'set',
            'set',
            'set',
            'put',
            'getOrDefault',
            'has',
            'delete',
            'getOrInsert',
            'compute',
            'merge',
            'keySet',
            'ends',
            'reversedGet',
          ]
    // Calls that walk the map come only in the second half.
    if (late) ops.push('read', 'iterate', 'equals', 'values')
    if (random() < 0.002) ops.push('clear')
    const op = pick(random, ops)
    const k = integer(random, 0, top)
    const v = integer(random, 0, 999)
    const at = `${label} step ${step} ${op} ${k}`
    const revision = map.revision
    changed = false
    let result: unknown
    let expected: unknown
    const call = (fn: () => unknown): void => {
      try {
        result = fn()
      } catch (error) {
        result = error
      }
    }
    switch (op) {
      case 'get':
        expected = values.get(k)
        touch(k)
        call(() => map.get(k))
        break
      case 'reversedGet':
        expected = values.get(k)
        touch(k)
        call(() => map.reversed().get(k))
        break
      case 'getOrDefault':
        expected = values.has(k) ? values.get(k) : -1
        touch(k)
        call(() => map.getOrDefault(k, -1))
        break
      case 'has':
        expected = values.has(k)
        call(() => map.has(k))
        break
      case 'set':
        expected = map
        write(k, v)
        call(() => map.set(k, v))
        break
      case 'put':
        expected = values.get(k)
        write(k, v)
        call(() => map.put(k, v))
        break
      case 'delete':
        expected = remove(k)
        call(() => map.delete(k))
        break
      case 'getOrInsert':
        if (values.has(k)) {
          expected = values.get(k)
          touch(k)
        } else {
          expected = v
          write(k, v)
        }
        call(() => map.getOrInsert(k, v))
        break
      case 'compute': {
        const old = values.get(k)
        if (v % 3 === 0) {
          expected = undefined
          remove(k)
        } else {
          expected = (old ?? 0) + v
          write(k, expected as number)
        }
        call(() => map.compute(k, (value) => (v % 3 === 0 ? undefined : (value ?? 0) + v)))
        break
      }
      case 'merge': {
        const old = values.get(k)
        expected = old === undefined ? v : old + v
        write(k, expected as number)
        call(() => map.merge(k, v, (a, b) => a + b))
        break
      }
      case 'keySet':
        if (v % 2 === 0) {
          expected = values.has(k)
          call(() => map.keySet().has(k))
        } else {
          expected = remove(k)
          call(() => map.keySet().delete(k))
        }
        break
      case 'values':
        expected = [...values.values()].includes(v % 50)
        call(() => map.valueCollection().has(v % 50))
        break
      case 'ends': {
        const first = order[0]
        const last = order[order.length - 1]
        expected = [
          first === undefined ? undefined : [first, values.get(first)],
          last === undefined ? undefined : [last, values.get(last)],
          last === undefined ? undefined : [last, values.get(last)],
        ]
        call(() => {
          const f = map.firstEntry()
          const l = map.lastEntry()
          const r = map.reversed().firstEntry()
          return [f && [f.key, f.value], l && [l.key, l.value], r && [r.key, r.value]]
        })
        break
      }
      case 'clear':
        expected = undefined
        clearAll()
        call(() => map.clear())
        break
      case 'read':
        expected = [
          `LinkedHashMap(${order.length}) {${order.map((key) => `${key} => ${values.get(key)}`).join(', ')}}`,
          JSON.stringify(order.map((key) => [key, values.get(key)])),
        ]
        call(() => [map.toString(), JSON.stringify(map.toJSON())])
        break
      case 'iterate':
        expected = order.map((key) => [key, values.get(key)])
        call(() => [...map])
        break
      case 'equals':
        expected = true
        call(() =>
          map.equals(
            new LinkedHashMap(
              order.map((key): [number, number] => [key, values.get(key) as number]),
            ),
          ),
        )
        break
    }
    const error = deliver()
    if (error !== undefined) {
      expect(result, at).toBe(error)
    } else if (expected === map) {
      // By identity: a deep comparison would iterate the map.
      expect(result === map, at).toBe(true)
    } else {
      expect(result, at).toEqual(expected)
    }
    expect(map.size, at).toBe(order.length)
    // A copy is made without walking the map, so the first half stays on a never-walked map.
    expect(late ? keysOf(map) : keysOf(map.copy()), at).toEqual(order)
    expect(map.revision !== revision, at).toBe(changed)
    expect(
      delivered.map(([key, value]) => [key, value]),
      at,
    ).toEqual(expectedDelivered)
    for (const [, , receiver] of delivered) expect(receiver, at).toBeUndefined()
    if (step === steps / 2 - 1 && order.length >= 2) {
      // Never walked so far: a move by access relinks the record and makes one native call.
      const first = order[0] as number
      expect(
        nativeCalls(() => map.get(first)),
        `${at}: not walked`,
      ).toBe(1)
      changed = false
      touch(first)
    }
    delivered.length = 0
    expectedDelivered = []
  }
}

describe('LinkedHashMap in access order — revision', () => {
  const make = () =>
    new LinkedHashMap<number, number>(
      [
        [1, 10],
        [2, 20],
        [3, 30],
      ],
      { accessOrder: true },
    )
  const changes = (call: (m: LinkedHashMap<number, number>) => unknown): boolean => {
    const map = make()
    const before = map.revision
    call(map)
    return map.revision !== before
  }

  it('changes on writes, insertions, removals and moves by access [050 S1-AC4]', () => {
    expect(changes((m) => m.set(4, 40))).toBe(true)
    expect(changes((m) => m.set(3, 30))).toBe(true)
    expect(changes((m) => m.set(1, 10))).toBe(true)
    expect(changes((m) => m.put(2, 21))).toBe(true)
    expect(changes((m) => m.get(1))).toBe(true)
    expect(changes((m) => m.getOrDefault(2, 0))).toBe(true)
    expect(changes((m) => m.getOrInsert(1, 0))).toBe(true)
    expect(changes((m) => m.getOrInsert(9, 0))).toBe(true)
    expect(changes((m) => m.reversed().get(1))).toBe(true)
    expect(changes((m) => m.delete(2))).toBe(true)
    expect(changes((m) => m.pollFirstEntry())).toBe(true)
    expect(changes((m) => m.keySet().delete(1))).toBe(true)
    expect(changes((m) => m.clear())).toBe(true)
  })

  it('stays the same on calls that change nothing, through the map and the reversed view [050 S1-AC4]', () => {
    const none: Array<[string, (m: LinkedHashMap<number, number>) => unknown]> = [
      ['has', (m) => m.has(1)],
      ['get of an absent key', (m) => m.get(9)],
      ['getOrDefault of an absent key', (m) => m.getOrDefault(9, 0)],
      ['get of the most recently used key', (m) => m.get(3)],
      ['getOrDefault of the most recently used key', (m) => m.getOrDefault(3, 0)],
      ['getOrInsert of the most recently used key', (m) => m.getOrInsert(3, 0)],
      ['reversed get of the most recently used key', (m) => m.reversed().get(3)],
      ['delete of an absent key', (m) => m.delete(9)],
      ['compute returning undefined for an absent key', (m) => m.compute(9, () => undefined)],
      ['removeIf removing nothing', (m) => m.keySet().removeIf(() => false)],
      ['removeAll removing nothing', (m) => m.keySet().removeAll([9])],
      ['retainAll removing nothing', (m) => m.keySet().retainAll([1, 2, 3])],
      ['iteration', (m) => [...m, ...m.keys(), ...m.values(), ...m.entries()]],
      ['forEach', (m) => m.forEach(() => {})],
      [
        'reading the views',
        (m) => [
          m.keySet().has(1),
          m.entrySet().size,
          m.valueCollection().has(10),
          [...m.reversed()],
        ],
      ],
      ['the ends', (m) => [m.firstEntry(), m.lastEntry(), m.reversed().firstEntry()]],
      ['containsValue', (m) => m.containsValue(10)],
      ['equals', (m) => m.equals(m.copy())],
      ['printing', (m) => [m.toString(), m.toJSON()]],
    ]
    for (const [name, call] of none) expect(changes(call), name).toBe(false)
    const empty = new LinkedHashMap<number, number>({ accessOrder: true })
    const revision = empty.revision
    empty.clear()
    expect(empty.revision).toBe(revision)
  })
})

describe('LinkedHashMap in access order — live iteration', () => {
  const make = (maxSize?: number) =>
    new LinkedHashMap<string, number>(
      [
        ['a', 1],
        ['b', 2],
        ['c', 3],
        ['d', 4],
      ],
      { accessOrder: true, maxSize },
    )

  it('reading every key during a forward loop ends, with each key once [050 S1-AC6]', () => {
    for (const map of [make(), make(10)]) {
      const seen: string[] = []
      for (const key of map.keys()) {
        seen.push(key)
        map.get(key)
        map.get('a')
      }
      expect(seen).toEqual(['a', 'b', 'c', 'd'])
      const entries: string[] = []
      map.forEach((_value, key) => {
        entries.push(key)
        map.get(key)
      })
      expect(entries).toHaveLength(4)
      expect(new Set(entries).size).toBe(4)
    }
  })

  it('a forward loop returns a mapping moved by access once, at its new place; a reversed loop skips it [050 S1-AC6]', () => {
    const forward = make()
    const iterator = forward.keys()
    expect(iterator.next().value).toBe('a')
    forward.get('b')
    expect([...iterator]).toEqual(['c', 'd', 'b'])
    const backward = make()
    const reversed = backward.reversed().keySet()[Symbol.iterator]()
    expect(reversed.next().value).toBe('d')
    backward.get('b')
    backward.set('a', 10)
    expect([...reversed]).toEqual(['c'])
  })

  it('putLast, putFirst and delete then set act as a removal and a new insertion for an open loop [050 S1-AC6]', () => {
    const map = make()
    const iterator = map.keys()
    iterator.next()
    iterator.next()
    map.putLast('a', 10)
    map.delete('c')
    map.set('c', 30)
    expect([...iterator]).toEqual(['d', 'a', 'c'])
  })

  it('a cursor whose hasNext fetched a mapping returns it next at its old place, with the value it held when moved [050 S1-AC6]', () => {
    const map = make()
    const cursor = map.valueCollection().cursor()
    expect(cursor.next()).toBe(1)
    expect(cursor.hasNext()).toBe(true)
    map.get('b')
    map.set('b', 20)
    expect(cursor.next()).toBe(2)
    expect(cursor.next()).toBe(3)
  })

  it('reads and writes of present keys inside map callbacks raise no ConcurrentModificationError [050 S1-AC6]', () => {
    const calls: Array<[string, (m: LinkedHashMap<string, number>) => unknown]> = [
      ['compute', (m) => m.compute('a', (v) => (m.get('b') ?? 0) + (v ?? 0))],
      ['merge', (m) => m.merge('a', 1, (x, y) => (m.get('c') ?? 0) + x + y)],
      ['computeIfPresent', (m) => m.computeIfPresent('a', (v) => v + (m.get('d') ?? 0))],
      ['getOrInsertComputed', (m) => m.getOrInsertComputed('z', () => m.get('a') ?? 0)],
      [
        'replaceAll',
        (m) =>
          m.replaceAll((v, k) => {
            m.set('a', 1)
            return (m.get(k) ?? 0) + v
          }),
      ],
      [
        'forEach',
        (m) =>
          m.forEach((_v, k) => {
            m.get(k === 'a' ? 'b' : 'a')
          }),
      ],
    ]
    for (const [name, call] of calls) {
      const map = make()
      expect(
        caught(() => call(map)),
        name,
      ).toBeUndefined()
    }
    const map = make()
    expect(
      caught(() =>
        map.compute('a', () => {
          map.set('new', 0)
          return 1
        }),
      ),
    ).toBeInstanceOf(ConcurrentModificationError)
  })
})

describe('LinkedHashMap in access order — a callback that inserts into a full map', () => {
  const calls: Array<
    [string, (m: LinkedHashMap<string, number>, insert: () => void) => unknown, string]
  > = [
    [
      'compute',
      (m, insert) =>
        m.compute('a', () => {
          insert()
          return 5
        }),
      'LinkedHashMap.compute: the map was changed by the callback',
    ],
    [
      'merge',
      (m, insert) =>
        m.merge('a', 1, () => {
          insert()
          return 5
        }),
      'LinkedHashMap.merge: the map was changed by the callback',
    ],
    [
      'computeIfPresent',
      (m, insert) =>
        m.computeIfPresent('a', () => {
          insert()
          return 5
        }),
      'LinkedHashMap.computeIfPresent: the map was changed by the callback',
    ],
    [
      'replaceAll',
      (m, insert) =>
        m.replaceAll((v) => {
          insert()
          return v + 100
        }),
      'LinkedHashMap.replaceAll: the map was changed by the callback',
    ],
    [
      'removeIf',
      (m, insert) =>
        m.keySet().removeIf(() => {
          insert()
          return true
        }),
      'LinkedHashMap.keySet().removeIf: the collection was changed while deciding',
    ],
  ]
  for (const [name, call, message] of calls) {
    it(`${name} throws ConcurrentModificationError when its callback evicts the mapping it holds, and only the callback's insertion stays [050 S1-AC3] [050 S1-AC6]`, () => {
      const evicted: Array<[string, number]> = []
      const map = new LinkedHashMap<string, number>(
        [
          ['a', 1],
          ['b', 2],
          ['c', 3],
        ],
        {
          accessOrder: true,
          maxSize: 3,
          onEvict: (value, key) => {
            evicted.push([key, value])
          },
        },
      )
      const revision = map.revision
      let inserted = false
      const insert = () => {
        if (inserted) return
        inserted = true
        // The map is full and has never been iterated: 'a', the least recently used, is evicted.
        map.set('new', 9)
      }
      const error = caught(() => call(map, insert))
      expect(error).toBeInstanceOf(ConcurrentModificationError)
      expect((error as Error).message).toMatch(new RegExp(`${message.split(':')[1]?.trim()}$`))
      expect(map.revision).not.toBe(revision)
      expect(evicted).toEqual([['a', 1]])
      expect(map.has('a')).toBe(false)
      expect(map.get('new')).toBe(9)
      expect([...map]).toEqual([
        ['b', 2],
        ['c', 3],
        ['new', 9],
      ])
    })
  }
})

describe('LinkedHashMap in access order — bounds', () => {
  it('get moves a present key to the most recently used end and has does not, before and after a loop [050 S3-AC2]', () => {
    for (const walked of [false, true]) {
      const map = new LinkedHashMap<number, number>(
        [
          [1, 1],
          [2, 2],
          [3, 3],
        ],
        { accessOrder: true },
      )
      if (walked) expect([...map.keys()]).toEqual([1, 2, 3])
      expect(map.has(1)).toBe(true)
      expect(keysOf(map)).toEqual([1, 2, 3])
      expect(map.get(1)).toBe(1)
      expect(keysOf(map)).toEqual([2, 3, 1])
      expect(map.get(9)).toBeUndefined()
      expect(keysOf(map)).toEqual([2, 3, 1])
    }
  })

  it('reads and writes with a constant number of native calls, whatever the size [050 S3-AC1]', () => {
    const seen: string[] = []
    for (const evict of [false, true]) {
      for (const n of [10, 1_000, 50_000]) {
        let evicted = 0
        const map = new LinkedHashMap<number, number>({
          accessOrder: true,
          maxSize: n,
          onEvict: evict
            ? () => {
                evicted++
              }
            : undefined,
        })
        for (let i = 0; i < n; i++) map.set(i, i)
        const label = `n ${n}${evict ? ' with onEvict' : ''}`
        const counts = [
          nativeCalls(() => map.get(n >> 1)),
          nativeCalls(() => map.get(-1)),
          nativeCalls(() => map.has(3)),
          nativeCalls(() => map.set(n >> 2, 0)),
          nativeCalls(() => map.set(n + 1, 0)),
          nativeCalls(() => map.delete(n + 1)),
        ]
        // get and set of a present key: a read, plus at most one write for the move; a new key:
        // a read, a write and a removal for the eviction; has: one; delete: two.
        const limits = [2, 1, 1, 2, 3, 2]
        for (let i = 0; i < counts.length; i++) {
          expect(counts[i], `call ${i} ${label}`).toBeLessThanOrEqual(limits[i] as number)
        }
        seen.push(counts.join(','))
        expect(evicted).toBe(evict ? 1 : 0)
      }
    }
    // The same counts at every size.
    expect(new Set(seen.slice(0, 3)).size).toBe(1)
    expect(new Set(seen.slice(3)).size).toBe(1)
  })
})

import { assert, describe, expect, it } from 'vitest'
import {
  ArrayDeque,
  ArrayList,
  asList,
  ConcurrentModificationError,
  compareSymbol,
  copyOfMap,
  copyOfSet,
  equals,
  equalsSymbol,
  HashMap,
  HashSet,
  hashCode,
  hashCodeSymbol,
  LinkedHashMap,
  LinkedHashSet,
  LinkedList,
  mapOf,
  PriorityQueue,
  shuffle,
  TreeMap,
  TreeSet,
  UnsupportedOperationError,
  valueEquivalence,
} from '../src/index'
import { REASONS, ROWS } from './support/complexity'
import {
  attempt,
  type Box,
  EXPECTATIONS,
  type Expectation,
  FAMILIES,
  FAMILY_NAMES,
  type Form,
  type HostileValue,
  keyBox,
  MEMBERSHIP,
  NOT_COLLECTIONS,
  OUTPUT_METHODS,
  outcome,
  READ_ONLY,
  type Rejection,
  SITUATIONS,
  type Situation,
  VALUES,
  type ValueFamily,
  VIEW_METHODS,
  valueBox,
  valueOfCalls,
} from './support/hostile-values'
import { readRuntimeExports } from './support/tsdoc-bounds'

/** Members whose `equals` is by identity, whatever their family. */
const IDENTITY_EQUALS = new Set(['HashMap.valueCollection'])

type Kind = 'element' | 'key' | 'value'

/** The element's own text inside a one-element collection's `toString`. */
function printedElement(text: string, kind: Kind): string {
  const match = /^\S*\(1\) [[{]([\s\S]*)[\]}]$/.exec(text)
  if (match === null) return `unexpected: ${text.slice(0, 80)}`
  const inner = match[1] as string
  if (kind === 'key') return inner.slice(0, -" => 'v'".length)
  if (kind === 'value') return inner.slice("'k' => ".length)
  return inner
}

/** The element's own text inside a one-element collection's JSON. */
function jsonElement(text: string, kind: Kind): string {
  if (kind === 'key') return text.slice(2, -',"v"]]'.length)
  if (kind === 'value') return text.slice('[["k",'.length, -2)
  return text.slice(1, -1)
}

function form(body: () => string): Form {
  const result = attempt(body)
  return typeof result === 'string' ? result : result
}

/** Compares without printing a 1 MB string in the failure message. */
function sameForm(actual: Form, expected: Form, at: string): void {
  if (typeof actual === 'string' && typeof expected === 'string') {
    if (actual !== expected) {
      assert.fail(`${at}: got ${actual.slice(0, 120)}, expected ${expected.slice(0, 120)}`)
    }
  } else {
    expect(actual, at).toEqual(expected)
  }
}

function sameResult(actual: unknown, expected: unknown, at: string): void {
  const got =
    typeof actual === 'object' && actual !== null ? (actual as { error: string }).error : actual
  if (!Object.is(got, expected))
    assert.fail(`${at}: got ${String(got)}, expected ${String(expected)}`)
}

/** Every value through one member: each situation, then lookups, output and equality. */
function checkMember(
  member: string,
  family: ValueFamily | 'map value',
  make: () => Box,
  kind: Kind,
  values: readonly HostileValue[],
): void {
  for (const value of values) {
    const table = EXPECTATIONS[value.name]
    if (table === undefined) assert.fail(`no expectation for the value ${value.name}`)
    const cell: Expectation = table.families[family]
    for (const situation of Object.keys(SITUATIONS) as Situation[]) {
      const at = `${member} ${value.name} (${situation})`
      const expected: true | Rejection = cell[situation] ?? cell.empty
      const box = make()
      const companions = SITUATIONS[situation]
      for (const c of companions) box.add(c)
      const v = value.make()
      const added = outcome(() => box.add(v))
      if (expected !== true) {
        sameResult(added, expected[0], `${at} add`)
        sameResult(box.size, companions.length, `${at} size after the rejection`)
        sameResult(
          attempt(() => box.has(v)),
          expected[1],
          `${at} has after the rejection`,
        )
        continue
      }
      sameResult(added, true, `${at} add`)
      sameResult(box.size, companions.length + 1, `${at} size`)
      sameResult(box.has(v), true, `${at} has`)
      if (situation === 'empty') {
        sameResult(
          attempt(() => box.has(value.make())),
          cell.fresh,
          `${at} has a fresh value`,
        )
        for (const other of VALUES) {
          if (other === value) continue
          // Hashing the 1 MB string costs tens of milliseconds; one other string probes it.
          if (other.name === 'long string' && value.name !== 'empty string') continue
          const result = attempt(() => box.has(other.make()))
          const equal: boolean = table.same?.includes(other.name) === true
          if ((result === true) !== equal) {
            assert.fail(`${at} has ${other.name}: got ${String(result)}, equal: ${equal}`)
          }
        }
        const printed = table.printedIn?.[family] ?? table.printed
        sameForm(
          form(() => printedElement(String(box.target.toString()), kind)),
          printed,
          `${at} toString`,
        )
        sameForm(
          form(() => jsonElement(JSON.stringify(box.target) as string, kind)),
          table.json,
          `${at} JSON`,
        )
        const second = make()
        second.add(value.make())
        if (IDENTITY_EQUALS.has(member)) {
          sameResult(equals(box.target, box.target), true, `${at} equals itself`)
          sameResult(equals(box.target, second.target), false, `${at} equals`)
          sameResult(
            outcome(() => hashCode(box.target)),
            true,
            `${at} hashCode`,
          )
        } else {
          sameResult(
            attempt(() => equals(box.target, second.target)),
            cell.equals,
            `${at} equals`,
          )
          sameResult(
            outcome(() => hashCode(box.target)),
            cell.hash,
            `${at} hashCode`,
          )
        }
      }
      sameResult(box.delete(v), true, `${at} delete`)
      sameResult(box.size, companions.length, `${at} size after delete`)
      sameResult(
        attempt(() => box.has(v)),
        false,
        `${at} has after delete`,
      )
    }
  }
}

describe('unusual and hostile values', () => {
  it('has an expectation for every value and every family [035 S2-AC2]', () => {
    expect(Object.keys(EXPECTATIONS).sort()).toEqual(VALUES.map((v) => v.name).sort())
    for (const value of VALUES) {
      const families = Object.keys((EXPECTATIONS[value.name] as { families: object }).families)
      expect(families.sort(), value.name).toEqual([...FAMILY_NAMES, 'map value'].sort())
    }
  })

  // The very long string runs in tests of its own: hashing it takes tens of milliseconds.
  const long = VALUES.filter((v) => v.name === 'long string')
  const others = VALUES.filter((v) => v.name !== 'long string')
  const parts: Array<[string, readonly HostileValue[]]> = [
    ['every value', others],
    ['the very long string', long],
  ]
  for (const family of FAMILY_NAMES) {
    const { elements, maps } = FAMILIES[family]
    for (const [which, values] of parts) {
      for (const [member, make] of Object.entries(elements)) {
        it(`${member} gives the recorded result for ${which} as an element [035 S2-AC1]`, () => {
          checkMember(member, family, make, 'element', values)
        })
      }
      for (const [member, make] of Object.entries(maps)) {
        it(`${member} gives the recorded result for ${which} as a key [035 S2-AC1]`, () => {
          checkMember(member, family, () => keyBox(make()), 'key', values)
        })
        it(`${member} gives the recorded result for ${which} as a map value [035 S2-AC1]`, () => {
          checkMember(member, 'map value', () => valueBox(make()), 'value', values)
        })
      }
    }
  }

  it('never calls valueOf on a value [035 S2-AC1]', () => {
    for (const family of FAMILY_NAMES) {
      for (const make of Object.values(FAMILIES[family].elements)) {
        // A string has no `valueOf` to count, so the very long string is left out.
        for (const value of others) {
          const box = make()
          outcome(() => box.add(value.make()))
          outcome(() => box.has(value.make()))
          outcome(() => String(box.target))
          outcome(() => JSON.stringify(box.target))
          outcome(() => hashCode(box.target))
        }
      }
    }
    expect(valueOfCalls.count).toBe(0)
  })

  for (const [member, overlay] of Object.entries(READ_ONLY)) {
    it(`${member} looks values up as its source family does and refuses every change [035 S2-AC1]`, () => {
      const kind: Kind = overlay.kind === 'map' ? 'key' : 'element'
      for (const value of VALUES) {
        const table = EXPECTATIONS[value.name] as (typeof EXPECTATIONS)[string]
        const cell = table.families[overlay.family]
        const v = value.make()
        const at = `${member} ${value.name}`
        const made = attempt(() => overlay.make(v))
        if (cell.empty !== true) {
          // Immutable collections are built by the same rules; the views wrap a source that
          // refused the value already.
          sameResult(made, cell.empty[0], `${at} create`)
          continue
        }
        if ('error' in made) assert.fail(`${at} create: ${made.error}`)
        const target = made as {
          has(v: unknown): boolean
          readonly size: number
          [key: string]: unknown
        }
        sameResult(target.size, 1, `${at} size`)
        sameResult(target.has(v), true, `${at} has`)
        sameResult(
          attempt(() => target.has(value.make())),
          cell.fresh,
          `${at} has a fresh value`,
        )
        const printed = table.printedIn?.[overlay.family] ?? table.printed
        sameForm(
          form(() => printedElement(String(target), kind)),
          printed,
          `${at} toString`,
        )
        sameForm(
          form(() => jsonElement(JSON.stringify(target) as string, kind)),
          table.json,
          `${at} JSON`,
        )
        const mutators =
          overlay.kind === 'map'
            ? [
                ['set', v, 1],
                ['put', v, 1],
                ['delete', v],
                ['remove', v],
                ['clear'],
                ['putAll', [[v, 1]]],
                ['replaceAll', (x: unknown) => x],
                ['getOrInsert', v, 1],
                ['merge', v, 1, (x: unknown) => x],
              ]
            : [
                ['add', v],
                ['delete', v],
                ['clear'],
                ['addAll', [v]],
                ['removeAll', [v]],
                ['retainAll', []],
                ['removeIf', () => true],
              ]
        for (const [name, ...args] of mutators) {
          const method = target[name as string] as ((...a: unknown[]) => unknown) | undefined
          if (typeof method !== 'function') assert.fail(`${at} has no ${String(name)}`)
          expect(() => method.apply(target, args), `${at} ${String(name)}`).toThrow(
            UnsupportedOperationError,
          )
        }
        sameResult(target.size, 1, `${at} size after the refusals`)
        if (overlay.identityEquals === true) {
          sameResult(equals(target, target), true, `${at} equals itself`)
          sameResult(equals(target, overlay.make(value.make())), false, `${at} equals another`)
        }
      }
    })
  }

  describe('family membership', () => {
    const exports = readRuntimeExports().map((e) => e.name)
    const viewRows = ROWS.filter((row) => row.reason === REASONS.views && row.member.includes('.'))

    it('gives every exported class and factory a family or the read-only overlay [035 S2-AC2]', () => {
      for (const name of exports) {
        const mapped = name in MEMBERSHIP
        const excluded = NOT_COLLECTIONS.includes(name)
        if (mapped === excluded) {
          assert.fail(
            `${name} must have a family or be listed as holding no values, not ${mapped ? 'both' : 'neither'}`,
          )
        }
      }
      for (const name of NOT_COLLECTIONS) expect(exports, name).toContain(name)
    })

    it('gives every collection a member of the bound table returns a family [035 S2-AC2]', () => {
      for (const row of viewRows) {
        const method = row.member.slice(row.member.indexOf('.') + 1)
        if (VIEW_METHODS.includes(method)) {
          expect(MEMBERSHIP, `${row.member} has no family`).toHaveProperty([row.member])
        } else if (!OUTPUT_METHODS.includes(method)) {
          assert.fail(`${row.member} returns something not known to be a collection or an output`)
        }
      }
    })

    it('has no stale entry, and runs each family member in the family it is mapped to [035 S2-AC2]', () => {
      const views = new Set(viewRows.map((row) => row.member))
      for (const name of Object.keys(MEMBERSHIP)) {
        const slash = name.indexOf('/')
        const known =
          exports.includes(name) ||
          views.has(name) ||
          (slash > 0 &&
            exports.includes(name.slice(0, slash)) &&
            ['key', 'equivalence', 'comparator'].includes(name.slice(slash + 1)))
        if (!known) assert.fail(`${name} is neither an export, a view nor an option path`)
      }
      for (const family of FAMILY_NAMES) {
        const { elements, maps } = FAMILIES[family]
        for (const member of [...Object.keys(elements), ...Object.keys(maps)]) {
          expect(MEMBERSHIP[member], member).toBe(family)
        }
      }
      for (const [member, overlay] of Object.entries(READ_ONLY)) {
        const base = member.split('/')[0] as string
        expect(MEMBERSHIP[base], member).toBe('read-only')
        expect(FAMILY_NAMES, member).toContain(overlay.family)
      }
    })
  })
})

describe('malformed map input', () => {
  const ITEMS: Array<[string, unknown]> = [
    ['a number', 1],
    ['a string', 'ab'],
    ['a one-element array', [1]],
    ['a three-element array', [1, 2, 3]],
    ['null', null],
    ['undefined', undefined],
    ['a plain object with key and value', { key: 1, value: 2 }],
    ['a native Map', new Map([[1, 2]])],
  ]
  const BUILDERS: Array<[string, (items: unknown[]) => unknown]> = [
    ['HashMap', (items) => new HashMap(items as never)],
    ['HashMap.from', (items) => HashMap.from(items as never)],
    ['LinkedHashMap', (items) => new LinkedHashMap(items as never)],
    ['LinkedHashMap.from', (items) => LinkedHashMap.from(items as never)],
    ['TreeMap', (items) => new TreeMap(items as never)],
    ['TreeMap.from', (items) => TreeMap.from(items as never)],
    ['mapOf', (items) => mapOf(...(items as never[]))],
    ['copyOfMap', (items) => copyOfMap(items as never)],
  ]

  it('rejects an item that is not a pair or an entry with a TypeError naming the API and the item [035 S2-AC3]', () => {
    for (const [api, build] of BUILDERS) {
      for (const [what, item] of ITEMS) {
        expect(() => build([[0, 0], item]), `${api} with ${what}`).toThrow(TypeError)
        expect(() => build([[0, 0], item]), `${api} with ${what}`).toThrow(
          new RegExp(
            `^${api.replace('.', '\\.')}: item 1 is not a \\[key, value\\] pair or a map entry \\(`,
          ),
        )
      }
    }
  })

  it('rejects input that is not iterable, and from treats null and undefined as not iterable [035 S2-AC3]', () => {
    for (const bad of [5, true, Symbol('s')]) {
      for (const [api, build] of BUILDERS.filter(([n]) => n !== 'mapOf')) {
        expect(() => build(bad as never), `${api} with ${String(bad)}`).toThrow(
          new RegExp(`^${api.replace('.', '\\.')}: entries is not iterable`),
        )
      }
    }
    for (const bad of [null, undefined]) {
      for (const api of ['HashMap.from', 'LinkedHashMap.from', 'TreeMap.from', 'copyOfMap']) {
        const build = (BUILDERS.find(([n]) => n === api) as [string, (i: unknown) => unknown])[1]
        expect(() => build(bad), `${api} with ${String(bad)}`).toThrow(TypeError)
      }
      // A constructor reads `null` and `undefined` as no entries.
      expect(new HashMap(bad).size).toBe(0)
      expect(new LinkedHashMap(bad).size).toBe(0)
      expect(new TreeMap(bad).size).toBe(0)
    }
  })

  it('leaves the map, its size and its revision unchanged when putAll meets a bad item [035 S2-AC3]', () => {
    const makers: Array<
      [
        string,
        () =>
          | HashMap<unknown, unknown>
          | LinkedHashMap<unknown, unknown>
          | TreeMap<unknown, unknown>,
      ]
    > = [
      ['HashMap', () => new HashMap<unknown, unknown>([[5, 5]])],
      ['LinkedHashMap', () => new LinkedHashMap<unknown, unknown>([[5, 5]])],
      ['TreeMap', () => new TreeMap<unknown, unknown>([[5, 5]])],
    ]
    for (const [name, make] of makers) {
      for (const [what, item] of [...ITEMS, ['a non-iterable', 7] as [string, unknown]]) {
        const map = make()
        const revision = map.revision
        const input = what === 'a non-iterable' ? item : [[1, 1], item]
        expect(() => map.putAll(input as never), `${name} ${what}`).toThrow(
          new RegExp(`^${name}\\.putAll: `),
        )
        expect(map.size, `${name} ${what}`).toBe(1)
        expect(map.revision, `${name} ${what}`).toBe(revision)
        expect([...map], `${name} ${what}`).toEqual([[5, 5]])
      }
    }
  })
})

describe('keys named after built-in properties', () => {
  const NAMES = ['__proto__', 'constructor', 'prototype', 'hasOwnProperty'] as const
  const TEXT = '{"__proto__":1,"constructor":2,"prototype":3,"hasOwnProperty":4}'

  it('stores them as ordinary keys read from JSON, and round-trips them through JSON and from [035 S2-AC5]', () => {
    const builtIns = Object.getOwnPropertyNames(Object.prototype).sort()
    const parsed = JSON.parse(TEXT) as object
    expect(Object.keys(parsed)).toEqual([...NAMES])
    const builders: Array<
      [
        string,
        (e: Array<[string, number]>) => {
          get(k: string): unknown
          has(k: string): boolean
          readonly size: number
        },
      ]
    > = [
      ['HashMap', (e) => HashMap.from(e)],
      ['LinkedHashMap', (e) => LinkedHashMap.from(e)],
      ['TreeMap', (e) => TreeMap.from(e)],
      ['copyOfMap', (e) => copyOfMap(e)],
    ]
    for (const [name, build] of builders) {
      const map = build(Object.entries(parsed) as Array<[string, number]>)
      expect(map.size, name).toBe(4)
      NAMES.forEach((key, i) => {
        expect(map.has(key), `${name} ${key}`).toBe(true)
        expect(map.get(key), `${name} ${key}`).toBe(i + 1)
      })
      expect(map.has('toString'), `${name} toString`).toBe(false)
      expect(map.get('valueOf'), `${name} valueOf`).toBeUndefined()
      const again = build(JSON.parse(JSON.stringify(map)) as Array<[string, number]>)
      expect(equals(again, map), name).toBe(true)
      // Nothing was written to the prototype of plain objects.
      expect(Object.getOwnPropertyNames(Object.prototype).sort(), name).toEqual(builtIns)
    }
  })

  it('stores them as set members and as keys of nested maps [035 S2-AC5]', () => {
    const set = new HashSet<string>(NAMES)
    const sorted = new TreeSet<string>(NAMES)
    for (const key of NAMES) {
      expect(set.has(key)).toBe(true)
      expect(sorted.has(key)).toBe(true)
    }
    const nested = new HashMap<string, HashMap<string, number>>([
      [
        '__proto__',
        HashMap.from(Object.entries(JSON.parse(TEXT) as object) as Array<[string, number]>),
      ],
    ])
    const text = JSON.stringify(nested)
    const rebuilt = HashMap.from(
      (JSON.parse(text) as Array<[string, Array<[string, number]>]>).map(
        ([k, v]) => [k, HashMap.from(v)] as const,
      ),
    )
    expect(equals(rebuilt, nested)).toBe(true)
    expect(rebuilt.get('__proto__')?.get('__proto__')).toBe(1)
  })
})

describe('inherited options', () => {
  const inherit = <T extends object>(options: T): T => Object.create(options) as T

  it('reads comparator, key, equivalence, maxSize and onEvict from the prototype, as native option objects are read [035 S2-AC6]', () => {
    const descending = (a: number, b: number) => b - a
    expect([...new TreeSet<number>([1, 3, 2], inherit({ comparator: descending }))]).toEqual([
      3, 2, 1,
    ])
    expect([
      ...new TreeMap<number, number>(inherit({ comparator: descending }))
        .set(1, 1)
        .set(2, 2)
        .keys(),
    ]).toEqual([2, 1])
    const queue = new PriorityQueue<number>([1, 3, 2], inherit({ comparator: descending }))
    expect(queue.poll()).toBe(3)

    const lower = (s: string) => s.toLowerCase()
    expect(new HashSet<string>(['A', 'a'], inherit({ key: lower })).size).toBe(1)
    expect(new LinkedHashSet<string>(['A', 'a'], inherit({ key: lower })).size).toBe(1)
    expect(
      new HashMap<string, number>(
        [
          ['A', 1],
          ['a', 2],
        ],
        inherit({ key: lower }),
      ).size,
    ).toBe(1)
    expect(copyOfSet(['A', 'a'], inherit({ key: lower })).size).toBe(1)

    const pair = () => new ArrayList([1, 2])
    expect(new HashSet([pair(), pair()], inherit({ equivalence: valueEquivalence })).size).toBe(1)
    expect(
      new LinkedHashMap(
        [
          [pair(), 1],
          [pair(), 2],
        ],
        inherit({ equivalence: valueEquivalence }),
      ).size,
    ).toBe(1)

    const evicted: string[] = []
    const lru = new LinkedHashMap<string, number>(
      inherit({
        accessOrder: true,
        maxSize: 2,
        onEvict: (_v: number, k: string) => evicted.push(k),
      }),
    )
    lru.set('a', 1).set('b', 2)
    lru.get('a')
    lru.set('c', 3)
    expect([...lru.keys()]).toEqual(['a', 'c'])
    expect(evicted).toEqual(['b'])
  })
})

describe('callbacks that throw or change the collection', () => {
  class Boom extends Error {
    constructor() {
      super('callback failed')
      this.name = 'Boom'
    }
  }
  const boom = (): never => {
    throw new Boom()
  }

  /** Size, iteration and lookups match the reference contents. */
  function expectContents(
    c: Iterable<unknown> & { readonly size: number; has(v: never): boolean },
    expected: readonly unknown[],
    at: string,
  ): void {
    expect([...c], at).toEqual(expected)
    expect(c.size, at).toBe(expected.length)
    for (const e of expected) expect(c.has(e as never), `${at} has ${String(e)}`).toBe(true)
  }
  function expectMap(
    m: Iterable<[unknown, unknown]> & { readonly size: number; get(k: never): unknown },
    expected: ReadonlyArray<[unknown, unknown]>,
    at: string,
  ): void {
    expect([...m], at).toEqual(expected)
    expect(m.size, at).toBe(expected.length)
    for (const [k, v] of expected) expect(m.get(k as never), `${at} get ${String(k)}`).toBe(v)
  }

  it('a comparator that throws leaves a sorted collection or queue unchanged; addAll keeps what it added before [035 S2-AC4]', () => {
    const cmp = (a: number, b: number) => (a === 9 || b === 9 ? boom() : a - b)
    const set = new TreeSet<number>([1, 2, 3], { comparator: cmp })
    expect(() => set.add(9)).toThrow(Boom)
    expectContents(set, [1, 2, 3], 'TreeSet.add')
    expect(() => set.addAll([4, 9, 5])).toThrow(Boom)
    expectContents(set, [1, 2, 3, 4], 'TreeSet.addAll')
    const map = new TreeMap<number, string>([[1, 'a']], { comparator: cmp })
    expect(() => map.set(9, 'z')).toThrow(Boom)
    expectMap(map, [[1, 'a']], 'TreeMap.set')
    const queue = new PriorityQueue<number>([1, 2, 3], { comparator: cmp })
    expect(() => queue.add(9)).toThrow(Boom)
    expect(queue.toArray().sort()).toEqual([1, 2, 3])
    const list = new ArrayList([3, 1, 2])
    expect(() => list.sort(cmp as never)).not.toThrow()
    expect(() => list.add(9).sort(cmp)).toThrow(Boom)
    expectContents(list, [1, 2, 3, 9], 'ArrayList.sort')
  })

  it('a comparator that changes the collection makes the call throw ConcurrentModificationError, keeping the comparator’s change and making none of its own [035 S2-AC4]', () => {
    const set: TreeSet<number> = new TreeSet<number>([1, 2, 3], {
      comparator: (a, b) => {
        if (a === 9 || b === 9) set.delete(1)
        return a - b
      },
    })
    expect(() => set.add(9)).toThrow(ConcurrentModificationError)
    expectContents(set, [2, 3], 'TreeSet')
    const queue: PriorityQueue<number> = new PriorityQueue<number>([1, 2, 3], {
      comparator: (a, b) => {
        if (a === 9 || b === 9) queue.poll()
        return a - b
      },
    })
    expect(() => queue.add(9)).toThrow(ConcurrentModificationError)
    expect(queue.toArray().sort()).toEqual([2, 3])
    const list = new ArrayList([3, 1, 2])
    expect(() =>
      list.sort((a, b) => {
        if (list.size < 4) list.add(7)
        return a - b
      }),
    ).toThrow(ConcurrentModificationError)
    expectContents(list, [3, 1, 2, 7], 'ArrayList.sort')
    const array = [3, 1, 2]
    const view = asList(array)
    expect(() =>
      view.sort((a, b) => {
        if (array.length < 4) array.push(7)
        return a - b
      }),
    ).toThrow(ConcurrentModificationError)
    expect(array).toEqual([3, 1, 2, 7])
  })

  it('a key, equals or hash function that throws leaves the set or map unchanged; one that changes it makes the call throw ConcurrentModificationError and keeps its change [035 S2-AC4]', () => {
    const throwingKey = (v: number) => (v === 9 ? boom() : v)
    const keyed = new HashSet<number>([1, 2], { key: throwingKey })
    expect(() => keyed.add(9)).toThrow(Boom)
    expectContents(keyed, [1, 2], 'HashSet key')
    expect(() => keyed.addAll([3, 9, 4])).toThrow(Boom)
    expectContents(keyed, [1, 2, 3], 'HashSet key addAll')
    const hashing = new LinkedHashSet<number>([1, 2], {
      equivalence: { equals: (a, b) => a === b, hash: (v) => (v === 9 ? boom() : v) },
    })
    expect(() => hashing.add(9)).toThrow(Boom)
    expectContents(hashing, [1, 2], 'LinkedHashSet hash')
    const comparing = new HashMap<number, string>(
      [
        [1, 'a'],
        [2, 'b'],
      ],
      {
        equivalence: { equals: (a, b) => (a === 9 || b === 9 ? boom() : a === b), hash: () => 0 },
      },
    )
    expect(() => comparing.set(9, 'z')).toThrow(Boom)
    expectMap(
      comparing,
      [
        [1, 'a'],
        [2, 'b'],
      ],
      'HashMap equals',
    )

    const changing: LinkedHashMap<number, string> = new LinkedHashMap<number, string>(
      [
        [1, 'a'],
        [2, 'b'],
      ],
      {
        key: (v) => {
          if (v === 9) changing.delete(1)
          return v
        },
      },
    )
    expect(() => changing.set(9, 'z')).toThrow(ConcurrentModificationError)
    expectMap(changing, [[2, 'b']], 'LinkedHashMap key')
    const growing: HashSet<number> = new HashSet<number>([1, 2], {
      equivalence: {
        equals: (a, b) => a === b,
        hash: (v) => {
          if (v === 9) growing.add(5)
          return v
        },
      },
    })
    expect(() => growing.add(9)).toThrow(ConcurrentModificationError)
    expectContents(growing, [1, 2, 5], 'HashSet hash')
  })

  it('a protocol method that throws propagates and leaves the collection unchanged [035 S2-AC4]', () => {
    class Item {
      constructor(
        readonly id: number,
        readonly fails = false,
      ) {}
      [equalsSymbol](other: unknown): boolean {
        if (this.fails || (other as Item).fails) boom()
        return (other as Item).id === this.id
      }
      [hashCodeSymbol](): number {
        return 0
      }
      [compareSymbol](other: Item): number {
        if (this.fails || other.fails) boom()
        return this.id - other.id
      }
    }
    const one = new Item(1)
    const two = new Item(2)
    const set = new HashSet<Item>([one, two], { equivalence: valueEquivalence })
    expect(() => set.add(new Item(3, true))).toThrow(Boom)
    expectContents(set, [one, two], 'HashSet with valueEquivalence')
    const sorted = new TreeSet<Item>([one, two])
    expect(() => sorted.add(new Item(3, true))).toThrow(Boom)
    expectContents(sorted, [one, two], 'TreeSet in natural order')
  })

  it('compute, computeIfPresent, merge and getOrInsertComputed insert nothing when the callback throws, keeping the callback’s own changes [035 S2-AC4]', () => {
    const makers: Array<
      () => HashMap<number, number> | LinkedHashMap<number, number> | TreeMap<number, number>
    > = [
      () => new HashMap([[1, 1]]),
      () => new LinkedHashMap([[1, 1]]),
      () => new TreeMap([[1, 1]]),
    ]
    for (const make of makers) {
      const name = make()[Symbol.toStringTag]
      const calls: Array<[string, (m: ReturnType<typeof make>, fn: () => number) => unknown]> = [
        ['compute', (m, fn) => m.compute(1, fn)],
        ['computeIfPresent', (m, fn) => m.computeIfPresent(1, fn)],
        ['merge', (m, fn) => m.merge(1, 5, fn)],
        ['getOrInsertComputed', (m, fn) => m.getOrInsertComputed(2, fn)],
      ]
      for (const [method, call] of calls) {
        const at = `${name}.${method}`
        const thrown = make()
        expect(() => call(thrown, () => boom()), at).toThrow(Boom)
        expectMap(thrown, [[1, 1]], `${at} throws`)
        const changedThenThrown = make()
        expect(() =>
          call(changedThenThrown, () => {
            changedThenThrown.set(9, 9)
            return boom()
          }),
        ).toThrow(Boom)
        expect(changedThenThrown.get(9), at).toBe(9)
        expect(changedThenThrown.get(1), at).toBe(1)
        expect(changedThenThrown.has(2), at).toBe(false)
        expect(changedThenThrown.size, at).toBe(2)
        const changed = make()
        const result = attempt(() =>
          call(changed, () => {
            changed.set(9, 9)
            return 7
          }),
        )
        if (method === 'getOrInsertComputed') {
          // The callback may change the map; its result is still inserted.
          expect(result, at).toBe(7)
          expect(changed.get(2), at).toBe(7)
          expect(changed.size, at).toBe(3)
        } else {
          expect(result, at).toEqual({ error: 'ConcurrentModificationError' })
          expect(changed.get(1), at).toBe(1)
          expect(changed.get(9), at).toBe(9)
          expect(changed.size, at).toBe(2)
        }
      }
    }
  })

  it('replaceAll keeps the values replaced before the callback throws or changes the map [035 S2-AC4]', () => {
    for (const make of [
      () => new HashMap<number, number>(),
      () => new LinkedHashMap<number, number>(),
      () => new TreeMap<number, number>(),
    ]) {
      const thrown = make().set(1, 1).set(2, 2).set(3, 3)
      expect(() => thrown.replaceAll((v) => (v === 2 ? boom() : v * 10))).toThrow(Boom)
      expectMap(
        thrown,
        [
          [1, 10],
          [2, 2],
          [3, 3],
        ],
        `${thrown[Symbol.toStringTag]} throws`,
      )
      const changed = make().set(1, 1).set(2, 2).set(3, 3)
      expect(() =>
        changed.replaceAll((v) => {
          if (v === 2) changed.set(9, 9)
          return v * 10
        }),
      ).toThrow(ConcurrentModificationError)
      expectMap(
        changed,
        [
          [1, 10],
          [2, 2],
          [3, 3],
          [9, 9],
        ],
        `${changed[Symbol.toStringTag]} changes`,
      )
    }
    const list = new ArrayList([1, 2, 3])
    expect(() => list.replaceAll((v) => (v === 2 ? boom() : v * 10))).toThrow(Boom)
    expectContents(list, [10, 2, 3], 'ArrayList')
  })

  it('forEach propagates the action’s error; a fail-fast collection throws right after the call that changed it, the last call included, and keeps the change [035 S2-AC4]', () => {
    const failFast: Array<
      () => {
        add(v: number): unknown
        forEach(f: (v: number) => void): void
        readonly size: number
      } & Iterable<number>
    > = [
      () => new ArrayList([1, 2, 3]),
      () => new LinkedList([1, 2, 3]),
      () => new ArrayDeque([1, 2, 3]),
      () => new PriorityQueue([1, 2, 3]),
      () => new TreeSet([1, 2, 3]),
    ]
    for (const make of failFast) {
      const name = String(make()).split('(')[0] as string
      const thrown = make()
      expect(
        () =>
          thrown.forEach((v) => {
            if (v === 2) boom()
          }),
        name,
      ).toThrow(Boom)
      expect(thrown.size, name).toBe(3)
      for (const at of [2, 3]) {
        const changed = make()
        const seen: number[] = []
        expect(() =>
          changed.forEach((v) => {
            seen.push(v)
            if (seen.length === at) changed.add(8)
          }),
        ).toThrow(ConcurrentModificationError)
        expect(seen, `${name} changed at call ${at}`).toEqual([1, 2, 3].slice(0, at))
        expect([...changed].sort(), name).toEqual([1, 2, 3, 8])
      }
    }
    const tree = new TreeMap([
      [1, 1],
      [2, 2],
      [3, 3],
    ])
    expect(() =>
      tree.forEach((v) => {
        if (v === 3) tree.delete(1)
      }),
    ).toThrow(ConcurrentModificationError)
    expectMap(
      tree,
      [
        [2, 2],
        [3, 3],
      ],
      'TreeMap',
    )
    // Live collections behave as native Map and Set: no error, added elements are visited.
    const live = new HashSet([1, 2, 3])
    const seen: number[] = []
    live.forEach((v) => {
      seen.push(v)
      if (v === 2) live.add(9)
    })
    expect(seen).toEqual([1, 2, 3, 9])
    const liveMap = new LinkedHashMap([
      [1, 1],
      [2, 2],
      [3, 3],
    ])
    liveMap.forEach((v) => {
      if (v === 3) liveMap.delete(1)
    })
    expectMap(
      liveMap,
      [
        [2, 2],
        [3, 3],
      ],
      'LinkedHashMap',
    )
  })

  it('removeIf removes nothing when the predicate throws or changes the collection, and keeps the predicate’s change [035 S2-AC4]', () => {
    const makers: Array<
      () => {
        add(v: number): unknown
        removeIf(p: (v: number) => unknown): boolean
        readonly size: number
      } & Iterable<number>
    > = [
      () => new ArrayList([1, 2, 3]),
      () => new LinkedList([1, 2, 3]),
      () => new ArrayDeque([1, 2, 3]),
      () => new PriorityQueue([1, 2, 3]),
      () => new HashSet([1, 2, 3]),
      () => new LinkedHashSet([1, 2, 3]),
      () => new TreeSet([1, 2, 3]),
      () => asList([1, 2, 3]),
    ]
    for (const make of makers) {
      const name = String(make()).split('(')[0] as string
      const thrown = make()
      expect(() => thrown.removeIf((v) => (v === 2 ? boom() : v === 1)), name).toThrow(Boom)
      expect([...thrown].sort(), name).toEqual([1, 2, 3])
      const changed = make()
      expect(() =>
        changed.removeIf((v) => {
          if (v === 2) changed.add(9)
          return v === 1
        }),
      ).toThrow(ConcurrentModificationError)
      expect([...changed].sort(), name).toEqual([1, 2, 3, 9])
    }
  })

  it('a throwing onEvict drops the rest of the queue after the call’s changes; one that changes the map keeps its change [035 S2-AC4]', () => {
    const evicted: number[] = []
    const lru = new LinkedHashMap<number, number>({
      maxSize: 2,
      onEvict: (_v, k) => {
        evicted.push(k)
        if (k === 1) boom()
      },
    })
    lru.set(1, 1).set(2, 2)
    expect(() =>
      lru.putAll([
        [3, 3],
        [4, 4],
      ]),
    ).toThrow(Boom)
    expect(evicted).toEqual([1])
    expectMap(
      lru,
      [
        [3, 3],
        [4, 4],
      ],
      'after the throw',
    )
    lru.set(5, 5)
    expect(evicted).toEqual([1, 3])

    const told: number[] = []
    const changing: LinkedHashMap<number, number> = new LinkedHashMap<number, number>({
      maxSize: 3,
      onEvict: (_v, k) => {
        told.push(k)
        changing.delete(3)
      },
    })
    changing.set(1, 1).set(2, 2).set(3, 3).set(4, 4)
    expect(told).toEqual([1])
    expectMap(
      changing,
      [
        [2, 2],
        [4, 4],
      ],
      'onEvict deleting',
    )
  })

  it('from propagates an error from mapFn and returns nothing, reading its source live [035 S2-AC4]', () => {
    type From = (source: number[], mapFn: (v: number) => number) => Iterable<number>
    const builders: Array<[string, From]> = [
      ['ArrayList', (s, f) => ArrayList.from(s, f)],
      ['LinkedList', (s, f) => LinkedList.from(s, f)],
      ['ArrayDeque', (s, f) => ArrayDeque.from(s, f)],
    ]
    for (const [name, from] of builders) {
      expect(() => from([1, 2, 3], (v: number) => (v === 2 ? boom() : v)), name).toThrow(Boom)
      const source = [1, 2, 3]
      const built = from(source, (v: number) => {
        if (v === 1) source.push(4)
        return v * 10
      })
      expect([...built], name).toEqual([10, 20, 30, 40])
    }
  })

  it('shuffle keeps the swaps made before random throws, and throws ConcurrentModificationError when random changes the list [035 S2-AC4]', () => {
    const list = new ArrayList([1, 2, 3, 4, 5])
    let calls = 0
    expect(() =>
      shuffle(list, () => {
        if (++calls === 3) boom()
        return 0
      }),
    ).toThrow(Boom)
    // Two swaps with index 0 were made: 5 ↔ 1, then 4 ↔ 5.
    expectContents(list, [4, 2, 3, 5, 1], 'shuffle')
    const changing = new ArrayList([1, 2, 3])
    expect(() =>
      shuffle(changing, () => {
        changing.add(4)
        return 0
      }),
    ).toThrow(ConcurrentModificationError)
    expectContents(changing, [1, 2, 3, 4], 'shuffle changed')
  })

  it('asList detects a change of the array’s length made by a callback, but not a same-length write [035 S2-AC4]', () => {
    const pushed = [1, 2, 3]
    expect(() =>
      asList(pushed).forEach((v) => {
        if (v === 2) pushed.push(9)
      }),
    ).toThrow(ConcurrentModificationError)
    expect(pushed).toEqual([1, 2, 3, 9])
    const replaced = [1, 2, 3]
    expect(() =>
      asList(replaced).replaceAll((v) => {
        if (v === 2) replaced.push(9)
        return v * 10
      }),
    ).toThrow(ConcurrentModificationError)
    expect(replaced).toEqual([10, 2, 3, 9])
    const written = [3, 1, 2]
    asList(written).sort((a, b) => {
      written[0] = 100
      return a - b
    })
    // The sort writes its result over the callback's writes.
    expect(written).toEqual([1, 2, 3])
  })
})

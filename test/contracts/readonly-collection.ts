// The reading half of the collection contract: what every collection, mutable or not, keeps
// without being changed. `describeCollection` runs it first; read-only collections run it alone.

import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import {
  equalsSymbol,
  hashCode,
  hashCodeSymbol,
  isCollection,
  NoSuchElementError,
  NullElementError,
  type ReadonlyCollection,
} from '../../src/index'

export interface ReadonlyCollectionContractOptions {
  /** How `toString` encloses the elements: `[...]` or `{...}`. */
  brackets: 'list' | 'set'
  /** Collections of other kinds, to check that `equals` is symmetric across kinds. */
  peers?: ReadonlyArray<ReadonlyCollectionFactory>
  /**
   * Structural equality: `expectedHash(elements, hash)` is the fixed combination of member hashes.
   * Omitted for collections that compare by identity.
   */
  structural?: { expectedHash: (elements: unknown[], hash: (value: unknown) => number) => number }
  /**
   * Whether `null` and `undefined` can be elements (`'store'`, the default) or are refused with
   * `NullElementError` (`'reject'`, as deques do).
   */
  nullElements?: 'store' | 'reject'
  /**
   * The iteration order: the order elements were given in (`'insertion'`, the default) or one the
   * collection chooses (`'unspecified'`, as a heap does). With `'unspecified'`, assertions about
   * order compare sorted copies, so they check which elements are present and how many times.
   */
  order?: 'insertion' | 'unspecified'
  /**
   * Whether `-0` is stored as `0` (`'zero'`, the default for sets, as native `Set` does) or kept
   * (`'kept'`, the default for lists, and for sets that compare with a user comparator).
   */
  minusZero?: 'zero' | 'kept'
  /**
   * Whether to check the Node.js `inspect` output (the default). A run outside Node.js turns it
   * off; every other check runs the same.
   */
  inspect?: boolean
}

/** Builds a new collection holding `initial`, in order. */
export type ReadonlyCollectionFactory = (initial?: Iterable<unknown>) => ReadonlyCollection<unknown>

export const iteratorPrototype = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()))

export function caught(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  return undefined
}

const KIND_RANK = ['number', 'bigint', 'string', 'boolean', 'symbol', 'function', 'object']

/** A total order on the primitive values the order-neutral assertions compare. */
export function byKindThenValue(a: unknown, b: unknown): number {
  const kinds = KIND_RANK.indexOf(typeof a) - KIND_RANK.indexOf(typeof b)
  if (kinds !== 0) return kinds
  const x = a as number
  const y = b as number
  return x < y ? -1 : x > y ? 1 : 0
}

/** The assertion helpers both halves of the contract share. */
export function orderHelpers(order: 'insertion' | 'unspecified' | undefined) {
  const unordered = order === 'unspecified'
  /** The values in the order the assertions compare: as given, or sorted when order is free. */
  const ordered = (values: Iterable<unknown>): unknown[] =>
    unordered ? [...values].sort(byKindThenValue) : [...values]
  /** Asserts that `c` iterates `expected`, in that order unless the order is unspecified. */
  const expectElements = (c: Iterable<unknown>, expected: unknown[]): void => {
    expect(ordered(c)).toEqual(ordered(expected))
  }
  /**
   * The expected printed elements, joined with `separator`: `rendered` gives each element's text,
   * in the order added; when the order is unspecified, the texts follow `c`'s iteration order.
   */
  const printedElements = (
    c: Iterable<unknown>,
    rendered: ReadonlyArray<readonly [unknown, string]>,
    separator = ', ',
  ): string => {
    if (!unordered) return rendered.map(([, text]) => text).join(separator)
    return [...c]
      .map((element) => {
        const match = rendered.find(([value]) => Object.is(value, element))
        return match === undefined ? '?' : match[1]
      })
      .join(separator)
  }
  return { unordered, ordered, expectElements, printedElements }
}

/** Runs the reading half of the collection contract against `make`. */
export function describeReadonlyCollection(
  name: string,
  make: ReadonlyCollectionFactory,
  options: ReadonlyCollectionContractOptions,
): void {
  const [open, close] = options.brackets === 'set' ? ['{', '}'] : ['[', ']']
  const { ordered, printedElements } = orderHelpers(options.order)

  describe(`${name} — collection contract`, () => {
    describe('query', () => {
      it('reports size and emptiness [004 S1-AC1]', () => {
        expect(make().size).toBe(0)
        expect(make().isEmpty()).toBe(true)
        const c = make([1, 2, 3])
        expect(c.size).toBe(3)
        expect(c.isEmpty()).toBe(false)
      })

      it('has(e) uses the collection equality, SameValueZero by default [004 S1-AC2]', () => {
        const object = {}
        const c = make([1, 'a', Number.NaN, -0, object])
        expect(c.has(1)).toBe(true)
        expect(c.has('a')).toBe(true)
        expect(c.has(Number.NaN)).toBe(true)
        expect(c.has(0)).toBe(true)
        expect(c.has(object)).toBe(true)
        expect(c.has({})).toBe(false)
        expect(c.has('1')).toBe(false)
      })

      it('toArray returns a new array in iteration order that does not change the collection [004 S1-AC3]', () => {
        const c = make([1, 2, 3])
        const array = c.toArray()
        expect(array).toEqual([...c])
        array.push(4)
        expect(c.size).toBe(3)
        expect(c.toArray()).not.toBe(c.toArray())
      })

      it('forEach calls the action once per element in order, with thisArg [004 S1-AC4]', () => {
        const c = make([1, 2, 3])
        const seen: unknown[] = []
        const receivers: unknown[] = []
        const self = { tag: 'this' }
        c.forEach(function (this: unknown, element) {
          seen.push(element)
          receivers.push(this)
        }, self)
        expect(seen).toEqual([...c])
        expect(receivers).toEqual([self, self, self])
      })
    })

    describe('iteration', () => {
      it('returns iterators that are iterable and reach %IteratorPrototype% [004 S3-AC2]', () => {
        const it = make([1])[Symbol.iterator]()
        expect(it[Symbol.iterator]()).toBe(it)
        expect(Object.prototype.isPrototypeOf.call(iteratorPrototype, it)).toBe(true)
      })

      it('lets ES2025 iterator helpers work on its iterators where present [004 S3-AC3]', () => {
        const it = make([1, 2, 3, 4])[Symbol.iterator]() as unknown as {
          filter?: (f: (n: number) => boolean) => { toArray(): number[] }
        }
        if (typeof it.filter !== 'function') return
        expect(ordered(it.filter((n) => n % 2 === 0).toArray())).toEqual([2, 4])
      })
    })

    describe('cursor', () => {
      it('hasNext and next walk the elements in iteration order [004 S4-AC1]', () => {
        const c = make([1, 2, 3])
        const cursor = c.cursor()
        const seen: unknown[] = []
        while (cursor.hasNext()) seen.push(cursor.next())
        expect(seen).toEqual([...c])
      })

      it('next past the end throws NoSuchElementError [004 S4-AC2]', () => {
        const cursor = make([1]).cursor()
        cursor.next()
        expect(() => cursor.next()).toThrow(NoSuchElementError)
        expect(() => make().cursor().next()).toThrow(NoSuchElementError)
      })

      it('a cursor is not a JavaScript iterator [004 S4-AC9]', () => {
        const cursor = make([1]).cursor() as unknown as { [Symbol.iterator]?: unknown }
        expect(cursor[Symbol.iterator]).toBeUndefined()
        expect(() => {
          for (const _ of cursor as unknown as Iterable<unknown>) {
            // not iterable
          }
        }).toThrow(TypeError)
        const typed = make([1]).cursor()
        expect(() => {
          // @ts-expect-error a cursor is not iterable, so for…of over it does not compile
          for (const _ of typed) {
            // not iterable
          }
        }).toThrow(TypeError)
      })
    })

    describe('equality and hashing', () => {
      it('equals itself and never null, undefined or a non-collection [004 S5-AC1]', () => {
        const c = make([1, 2])
        expect(c.equals(c)).toBe(true)
        expect(c.equals(null)).toBe(false)
        expect(c.equals(undefined)).toBe(false)
        expect(c.equals([1, 2])).toBe(false)
        expect(c.equals(new Set([1, 2]))).toBe(false)
      })

      if (!options.structural) {
        it('compares and hashes by identity by default [004 S5-AC2]', () => {
          const a = make([1, 2])
          const b = make([1, 2])
          expect(a.equals(b)).toBe(false)
          expect(hashCode(a)).toBe(hashCode(a))
          expect(a[hashCodeSymbol](() => 7)).toBe(a[hashCodeSymbol](() => 8)) // ignores the hash function
        })
      }

      it('[equalsSymbol] delegates to equals and [hashCodeSymbol] agrees with it [004 S5-AC3]', () => {
        const c = make([1, 2])
        expect(c[equalsSymbol](c)).toBe(true)
        expect(c[equalsSymbol](null)).toBe(false)
        expect(hashCode(c)).toBe(hashCode(c))
        expect(typeof c[hashCodeSymbol](hashCode)).toBe('number')
      })

      it.skipIf(!options.structural)(
        'equal collections of a value-equality family hash alike through the given hash [004 S5-AC3]',
        () => {
          const structural = options.structural
          if (!structural) return
          const standIn = (v: unknown) => (typeof v === 'number' ? v : 1000)
          const a = make([1, 2, 3])
          const b = make([1, 2, 3])
          expect(a.equals(b)).toBe(true)
          expect(a[equalsSymbol](b)).toBe(true)
          expect(a[hashCodeSymbol](standIn)).toBe(b[hashCodeSymbol](standIn))
          expect(a[hashCodeSymbol](standIn)).toBe(structural.expectedHash([1, 2, 3], standIn))
        },
      )

      it('equals is symmetric within one kind of collection [004 S5-AC4]', () => {
        const mine = [make(), make([1, 2])]
        for (const a of mine) {
          for (const b of mine) expect(a.equals(b)).toBe(b.equals(a))
        }
      })

      it.skipIf(!options.peers?.length)(
        'equals is symmetric across kinds of collection [004 S5-AC4]',
        () => {
          const mine = [make(), make([1, 2])]
          const others = (options.peers ?? []).flatMap((peer) => [peer(), peer([1, 2])])
          expect(others.length).toBeGreaterThan(0)
          for (const a of mine) {
            for (const b of others) expect(a.equals(b)).toBe(b.equals(a))
          }
        },
      )

      it('has no public hashCode() method [004 S5-AC6]', () => {
        expect('hashCode' in make([1])).toBe(false)
      })
    })

    describe('printing', () => {
      it('prints the class name, size and elements in the family brackets [004 S6-AC1]', () => {
        const tag = name
        const c = make([1, 2, 'a'])
        const elements = printedElements(c, [
          [1, '1'],
          [2, '2'],
          ['a', "'a'"],
        ])
        expect(String(c)).toBe(`${tag}(3) ${open}${elements}${close}`)
        expect(String(make())).toBe(`${tag}(0) ${open}${close}`)
      })

      it('renders each kind of element per the rules [004 S6-AC3]', () => {
        const tag = name
        function named() {}
        const date = new Date(0)
        const storesNull = options.nullElements !== 'reject'
        const nulls = storesNull ? [null, undefined] : []
        const symbol = Symbol("a'b")
        const nested = [1, [2]]
        const anonymous = (
          () => () =>
            1
        )() // no name is inferred for a returned function
        const c = make(["it's\n", -0, 5n, symbol, ...nulls, nested, named, anonymous, date])
        const printed = String(c)
        // A set stores -0 as 0, as native Set does, unless it compares with a user comparator;
        // a list keeps -0 and prints it.
        const storesZero =
          options.minusZero === undefined
            ? options.brackets === 'set'
            : options.minusZero === 'zero'
        const minusZero = storesZero ? '0' : '-0'
        const shownNulls: Array<readonly [unknown, string]> = storesNull
          ? [
              [null, 'null'],
              [undefined, 'undefined'],
            ]
          : []
        const elements = printedElements(c, [
          ["it's\n", "'it\\'s\\n'"],
          [-0, minusZero],
          [5n, '5n'],
          [symbol, "Symbol(a\\'b)"],
          ...shownNulls,
          [nested, '[1, [2]]'],
          [named, '[Function: named]'],
          [anonymous, '[Function (anonymous)]'],
          [date, String(date)],
        ])
        expect(printed).toBe(`${tag}(${storesNull ? 10 : 8}) ${open}${elements}${close}`)
        if (!storesNull) {
          expect(() => make([null])).toThrow(NullElementError)
          expect(() => make([undefined])).toThrow(NullElementError)
        }
        expect(() => String(make([Object.create(null)]))).toThrow(TypeError)
        let getterRan = false
        const sneaky = Object.defineProperty(() => 1, 'name', {
          get() {
            getterRan = true
            return 'sneaky'
          },
        })
        const flags = make([true, false, sneaky])
        const flagElements = printedElements(flags, [
          [true, 'true'],
          [false, 'false'],
          [sneaky, '[Function (anonymous)]'],
        ])
        expect(String(flags)).toBe(`${tag}(3) ${open}${flagElements}${close}`)
        expect(getterRan).toBe(false)
        expect(String(make(['a\\b']))).toBe(`${tag}(1) ${open}'a\\\\b'${close}`)
        const failure = new Error('cannot print')
        const throwing = {
          toString(): string {
            throw failure
          },
        }
        expect(caught(() => String(make([throwing])))).toBe(failure)
      })

      it('toJSON returns a new array of the elements [004 S6-AC4]', () => {
        const c = make([1, 'a'])
        expect(JSON.stringify(c)).toBe(JSON.stringify(c.toArray()))
        expect(c.toJSON()).not.toBe(c.toJSON())
      })

      it('reports its class name through Symbol.toStringTag [004 S6-AC6]', () => {
        const c = make()
        expect(Object.prototype.toString.call(c)).toBe(`[object ${name}]`)
      })

      it.skipIf(options.inspect === false)(
        'shows class, size and elements in Node inspect, honouring depth [004 S6-AC7]',
        () => {
          const tag = name
          const pair = make([1, 'a'])
          const pairElements = printedElements(pair, [
            [1, '1'],
            ['a', "'a'"],
          ])
          expect(inspect(pair)).toBe(`${tag}(2) ${open} ${pairElements} ${close}`)
          expect(inspect(make())).toBe(`${tag}(0) ${open}${close}`)
          expect(inspect({ inner: make([{ deep: { deeper: 1 } }]) }, { depth: 0 })).toBe(
            `{ inner: [${tag}] }`,
          )
          expect(inspect(make([{ a: { b: { c: { d: 1 } } } }]), { depth: null })).toContain('d: 1')
          // Nested, a collection shows its elements exactly as deep as an array in its place would.
          const deep = { a: { b: { c: 1 } } }
          const viaArray = inspect({ x: { y: [deep] } }, { depth: 2 })
          const viaCollection = inspect({ x: { y: make([deep]) } }, { depth: 2 })
          expect(viaCollection).toBe(
            viaArray.replace('[ ', `${name}(1) ${open} `).replace(' ]', ` ${close}`),
          )
        },
      )
    })

    describe('recognition', () => {
      it('is recognised by isCollection [004 S7-AC1]', () => {
        expect(isCollection(make())).toBe(true)
      })
    })
  })
}

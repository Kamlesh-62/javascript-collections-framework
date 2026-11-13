// The contract every collection keeps. Each implementation's test file runs it through
// `describeCollection`, so swapping an engine must keep every one of these tests passing.

import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import {
  type Collection,
  ConcurrentModificationError,
  equalsSymbol,
  hashCode,
  hashCodeSymbol,
  IllegalStateError,
  isCollection,
  NoSuchElementError,
  NullElementError,
} from '../../src/index'

export interface CollectionContractOptions {
  /** How the collection reacts to a change during iteration. */
  iteration: 'fail-fast' | 'live'
  /** How `toString` encloses the elements: `[...]` or `{...}`. */
  brackets: 'list' | 'set'
  /** Replaces the element at a position in place, for fail-fast collections that can. */
  replace?: (collection: Collection<unknown>, index: number, value: unknown) => void
  /** Builds a collection whose element equality calls `equality` (user code during decisions). */
  withEquality?: (
    initial: Iterable<unknown>,
    equality: (a: unknown, b: unknown) => boolean,
  ) => Collection<unknown>
  /** Builds a collection whose `add` throws `failure` for elements `rejects` accepts. */
  withFailingAdd?: (rejects: (element: unknown) => boolean, failure: Error) => Collection<unknown>
  /** Collections of other kinds, to check that `equals` is symmetric across kinds. */
  peers?: ReadonlyArray<CollectionFactory>
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
}

/** Builds a new collection holding `initial`, in order. */
export type CollectionFactory = (initial?: Iterable<unknown>) => Collection<unknown>

const iteratorPrototype = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()))

function caught(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  return undefined
}

/** Runs the collection contract against `make`. */
export function describeCollection(
  name: string,
  make: CollectionFactory,
  options: CollectionContractOptions,
): void {
  const failFast = options.iteration === 'fail-fast'
  const [open, close] = options.brackets === 'set' ? ['{', '}'] : ['[', ']']

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

      it('rejects a non-function or non-iterable argument before changing anything [004 S1-AC5]', () => {
        const c = make([1, 2])
        const revision = c.revision
        const tag = name
        expect(() => c.forEach(1 as never)).toThrow(TypeError)
        expect(() => c.addAll(5 as never)).toThrow(TypeError)
        expect(() => c.removeAll(null as never)).toThrow(TypeError)
        expect(() => c.retainAll({} as never)).toThrow(TypeError)
        expect(() => c.removeIf('x' as never)).toThrow(TypeError)
        expect(c.revision).toBe(revision)
        expect(c.size).toBe(2)
        const calls: Array<[string, () => unknown]> = [
          ['forEach', () => c.forEach(1 as never)],
          ['addAll', () => c.addAll(5 as never)],
          ['removeAll', () => c.removeAll(null as never)],
          ['retainAll', () => c.retainAll({} as never)],
          ['removeIf', () => c.removeIf('x' as never)],
        ]
        for (const [method, call] of calls) {
          expect((caught(call) as Error).message.startsWith(`${tag}.${method}: `), method).toBe(
            true,
          )
        }
      })
    })

    describe('change', () => {
      it('add returns the collection, so calls chain [004 S2-AC1]', () => {
        const c = make()
        expect(c.add(1)).toBe(c)
        c.add(2).add(3)
        expect(c.has(3)).toBe(true)
        if (options.brackets === 'set') {
          const d = make([1])
          d.add(1).add(1)
          expect(d.size).toBe(1)
        }
      })

      it('delete removes one equal element and reports whether it did [004 S2-AC2]', () => {
        const c = make([1, 2, 3])
        expect(c.delete(2)).toBe(true)
        expect(c.has(2)).toBe(false)
        expect(c.size).toBe(2)
        expect(c.delete(9)).toBe(false)
        if (options.brackets === 'list') {
          const d = make([1, 2, 1])
          expect(d.delete(1)).toBe(true)
          expect([...d]).toEqual([2, 1]) // only the first equal element
        }
      })

      it('addAll adds in order and reports whether anything was added [004 S2-AC3]', () => {
        const c = make([1])
        expect(c.addAll([2, 3])).toBe(true)
        expect([...c].slice(-2)).toEqual([2, 3])
        expect(c.addAll([])).toBe(false)
        if (options.brackets === 'set') expect(c.addAll([1, 2])).toBe(false)
      })

      it('removeAll removes every element equal to one in the argument [004 S2-AC4]', () => {
        const c = make([1, 2, 3, 4])
        expect(c.removeAll([2, 4, 9])).toBe(true)
        expect([...c]).toEqual([1, 3])
        expect(c.removeAll([9])).toBe(false)
      })

      it('retainAll removes every element not equal to one in the argument [004 S2-AC5]', () => {
        const c = make([1, 2, 3, 4])
        expect(c.retainAll([2, 4, 9])).toBe(true)
        expect([...c]).toEqual([2, 4])
        expect(c.retainAll([2, 4])).toBe(false)
      })

      it('reads the whole argument first: self is safe and a throwing iterable changes nothing [004 S2-AC6]', () => {
        const c = make([1, 2])
        if (options.brackets === 'list') {
          c.addAll(c)
          expect([...c]).toEqual([1, 2, 1, 2])
        } else {
          expect(c.addAll(c)).toBe(false)
        }
        const d = make([1, 2, 3])
        expect(d.removeAll(d)).toBe(true)
        expect(d.size).toBe(0)
        const e = make([1, 2, 3])
        const failure = new Error('stop')
        const throwing = {
          *[Symbol.iterator]() {
            yield 9
            throw failure
          },
        }
        const revision = e.revision
        expect(caught(() => e.addAll(throwing))).toBe(failure)
        expect(caught(() => e.removeAll(throwing))).toBe(failure)
        expect(caught(() => e.retainAll(throwing))).toBe(failure)
        expect([...e]).toEqual([1, 2, 3])
        expect(e.revision).toBe(revision)
      })

      it('removeIf decides on the unchanged collection, then removes the matches [004 S2-AC7]', () => {
        const c = make([1, 2, 3, 4])
        const sizes: number[] = []
        expect(
          c.removeIf((element) => {
            sizes.push(c.size)
            return (element as number) % 2 === 0
          }),
        ).toBe(true)
        expect(sizes).toEqual([4, 4, 4, 4])
        expect([...c]).toEqual([1, 3])
        expect(c.removeIf(() => false)).toBe(false)
      })

      it('removeIf leaves the collection unchanged when the predicate throws [004 S2-AC8]', () => {
        const c = make([1, 2, 3])
        const failure = new Error('predicate failed')
        let calls = 0
        expect(
          caught(() =>
            c.removeIf(() => {
              if (++calls === 3) throw failure
              return true
            }),
          ),
        ).toBe(failure)
        expect([...c]).toEqual([1, 2, 3])
      })

      it('removeIf throws ConcurrentModificationError and removes nothing if the predicate changes the structure [004 S2-AC9]', () => {
        const c = make([1, 2, 3])
        expect(() =>
          c.removeIf((element) => {
            if (element === 2) c.add(99)
            return true
          }),
        ).toThrow(ConcurrentModificationError)
        expect(c.has(1)).toBe(true)
        expect(c.has(3)).toBe(true)
        expect(c.has(99)).toBe(true)
      })

      it('clear removes every element [004 S2-AC10]', () => {
        const c = make([1, 2, 3])
        c.clear()
        expect(c.size).toBe(0)
        expect([...c]).toEqual([])
      })

      it('revision changes on every change to contents and never on a read [004 S2-AC11]', () => {
        const c = make([1, 2])
        const seen = new Set([c.revision])
        const changed = () => {
          expect(seen.has(c.revision)).toBe(false)
          seen.add(c.revision)
        }
        c.add(3)
        changed()
        c.delete(1)
        changed()
        c.removeIf((e) => e === 2)
        changed()
        const before = c.revision
        c.has(3)
        c.toArray()
        c.forEach(() => {})
        String(c)
        c.equals(c)
        for (const _ of c) {
          // reading only
        }
        expect(c.revision).toBe(before)
        c.clear()
        changed()
      })

      it.skipIf(!options.replace)(
        'revision changes when an element is replaced in place [004 S2-AC11]',
        () => {
          if (!options.replace) return
          const c = make([1, 2])
          const before = c.revision
          options.replace(c, 0, 'replaced')
          expect(c.revision).not.toBe(before)
          expect(c.size).toBe(2)
        },
      )

      it.skipIf(!options.withEquality)(
        'removeAll and retainAll decide first: an error while deciding removes nothing [004 S2-AC12]',
        () => {
          if (!options.withEquality) return
          const failure = new Error('equality failed')
          let calls = 0
          const c = options.withEquality([1, 2, 3], (a, b) => {
            if (++calls === 4) throw failure
            return a === b
          })
          expect(caught(() => c.removeAll([2, 3]))).toBe(failure)
          expect([...c]).toEqual([1, 2, 3])
          calls = 0
          expect(caught(() => c.retainAll([2, 3]))).toBe(failure)
          expect([...c]).toEqual([1, 2, 3])
        },
      )

      it.skipIf(!options.withFailingAdd)(
        'addAll keeps elements added before an error, with revision changed [004 S2-AC13]',
        () => {
          if (!options.withFailingAdd) return
          const failure = new Error('cannot add')
          const c = options.withFailingAdd((e) => e === 3, failure)
          const revision = c.revision
          expect(caught(() => c.addAll([1, 2, 3, 4]))).toBe(failure)
          expect([...c]).toEqual([1, 2])
          expect(c.revision).not.toBe(revision)
        },
      )

      it.skipIf(!options.withEquality)(
        'removeAll and retainAll throw and remove nothing if the structure changes while deciding [004 S2-AC14]',
        () => {
          if (!options.withEquality) return
          let c: Collection<unknown> | undefined
          let armed = true
          let fresh = 100
          c = options.withEquality([1, 2, 3], (a, b) => {
            if (armed && c !== undefined) {
              armed = false
              c.add(fresh++) // a new value, so even a set changes structure
            }
            return a === b
          })
          expect(() => c?.removeAll([1, 2])).toThrow(ConcurrentModificationError)
          expect(c.has(1)).toBe(true)
          expect(c.has(2)).toBe(true)
          armed = true
          expect(() => c?.retainAll([1])).toThrow(ConcurrentModificationError)
          expect(c.has(3)).toBe(true)
        },
      )
    })

    describe('iteration', () => {
      it('yields every element once, then done forever; a finished iterator never throws [004 S3-AC1]', () => {
        const c = make([1, 2, 3])
        const it = c[Symbol.iterator]()
        expect([it.next().value, it.next().value, it.next().value]).toEqual([...c])
        expect(it.next()).toEqual({ done: true, value: undefined })
        c.add(4)
        expect(it.next()).toEqual({ done: true, value: undefined })
      })

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
        expect(it.filter((n) => n % 2 === 0).toArray()).toEqual([2, 4])
      })

      if (failFast) {
        it('throws ConcurrentModificationError from next() after an outside structural change [004 S3-AC4]', () => {
          const c = make([1, 2, 3])
          const it = c[Symbol.iterator]()
          it.next()
          c.add(4)
          expect(() => it.next()).toThrow(ConcurrentModificationError)
        })

        it('throws after a forEach callback changes the structure, even on the last element [004 S3-AC5]', () => {
          const c = make([1, 2, 3])
          expect(() =>
            c.forEach((e) => {
              if (e === 3) c.add(4)
            }),
          ).toThrow(ConcurrentModificationError)
        })

        it.skipIf(!options.replace)(
          'does not throw when an element is replaced in place during iteration [004 S3-AC7]',
          () => {
            const replace = options.replace
            if (!replace) return
            const c = make([1, 2, 3])
            const seen: unknown[] = []
            for (const e of c) {
              seen.push(e)
              if (e === 1) replace(c, 2, 'three')
            }
            expect(seen).toEqual([1, 2, 'three'])
          },
        )
      } else {
        it('iterates live like native Set: no throw, deleted skipped, added visited, re-added visited again [004 S3-AC6]', () => {
          const c = make([1, 2, 3])
          const seen: unknown[] = []
          let changed = false
          for (const e of c) {
            seen.push(e)
            if (e === 1 && !changed) {
              changed = true
              c.delete(2)
              c.add(4)
              c.delete(1)
              c.add(1)
            }
          }
          const native = new Set([1, 2, 3])
          const nativeSeen: unknown[] = []
          let nativeChanged = false
          for (const e of native) {
            nativeSeen.push(e)
            if (e === 1 && !nativeChanged) {
              nativeChanged = true
              native.delete(2)
              native.add(4)
              native.delete(1)
              native.add(1)
            }
          }
          expect(seen).toEqual(nativeSeen)

          const d = make([1, 2])
          const after: unknown[] = []
          d.forEach((e) => {
            after.push(e)
            if (e === 1 && d.size === 2) {
              d.clear()
              d.add(5)
            }
          })
          expect(after).toEqual([1, 5])
        })
      }

      it('lets an abandoned iterator have no effect on later operations [004 S3-AC8]', () => {
        const c = make([1, 2, 3])
        for (const e of c) {
          if (e === 1) break
        }
        c.add(9)
        expect(c.delete(2)).toBe(true)
        expect(c.has(9)).toBe(true)
      })

      it('keeps one fixed iteration mode for its class [004 S3-AC9]', () => {
        // The mode is observed by behaviour: whether adding during a loop makes the loop throw.
        const throwsOnChange = (target: Collection<unknown>): boolean => {
          let added = false
          try {
            for (const _ of target) {
              if (!added) {
                added = true
                target.add({}) // a new value, so even a set changes structure
              }
            }
            return false
          } catch (error) {
            if (error instanceof ConcurrentModificationError) return true
            throw error
          }
        }
        const expected = options.iteration === 'fail-fast'
        const c = make([1, 2])
        expect(throwsOnChange(c)).toBe(expected)
        c.add(3)
        c.clear()
        c.add(4)
        expect(throwsOnChange(c)).toBe(expected)
        expect(throwsOnChange(make([5]))).toBe(expected)
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

      it('remove deletes the element next returned and the cursor continues [004 S4-AC3]', () => {
        const c = make([1, 2, 3, 4])
        const cursor = c.cursor()
        const seen: unknown[] = []
        while (cursor.hasNext()) {
          const e = cursor.next()
          seen.push(e)
          if ((e as number) % 2 === 0) cursor.remove()
        }
        expect(seen).toEqual([1, 2, 3, 4])
        expect([...c]).toEqual([1, 3])
      })

      it('remove before next, or twice, throws IllegalStateError [004 S4-AC4]', () => {
        const c = make([1, 2])
        const cursor = c.cursor()
        expect(() => cursor.remove()).toThrow(IllegalStateError)
        expect((caught(() => cursor.remove()) as Error).message).toBe(
          `${name}.cursor: remove() called before next()`,
        )
        cursor.next()
        cursor.remove()
        expect(() => cursor.remove()).toThrow(IllegalStateError)
      })

      if (failFast) {
        it('a change through one cursor keeps it valid and invalidates other cursors and iterators [004 S4-AC5]', () => {
          const c = make([1, 2, 3])
          const a = c.cursor()
          const b = c.cursor()
          const it = c[Symbol.iterator]()
          b.next()
          a.next()
          a.remove()
          expect(a.next()).toBe([...c][0])
          expect(() => b.next()).toThrow(ConcurrentModificationError)
          expect(() => b.remove()).toThrow(ConcurrentModificationError)
          expect(() => it.next()).toThrow(ConcurrentModificationError)
        })

        it('an outside structural change makes next and remove throw [004 S4-AC6]', () => {
          const c = make([1, 2, 3])
          const cursor = c.cursor()
          cursor.next()
          c.add(4)
          expect(() => cursor.next()).toThrow(ConcurrentModificationError)
          expect(() => cursor.remove()).toThrow(ConcurrentModificationError)
        })
      } else {
        it('a live cursor removes by value, follows the collection, and stays finished [004 S4-AC7]', () => {
          const c = make([1, 2, 3])
          const cursor = c.cursor()
          expect(cursor.next()).toBe(1)
          c.delete(1)
          expect(() => cursor.remove()).not.toThrow() // already gone: no error
          expect(cursor.hasNext()).toBe(true) // looks at 2: counts as reached
          c.delete(2)
          expect(cursor.next()).toBe(2) // returned although deleted since
          c.delete(3)
          c.add(3) // re-added before reached: yielded once, at its new place
          expect(cursor.next()).toBe(3)
          expect(cursor.hasNext()).toBe(false)
          c.add(9)
          expect(cursor.hasNext()).toBe(false) // finished for good
          expect(() => cursor.next()).toThrow(NoSuchElementError)
        })
      }

      it('hasNext never throws [004 S4-AC8]', () => {
        const c = make([1, 2])
        const cursor = c.cursor()
        cursor.next()
        c.add(3)
        expect(() => cursor.hasNext()).not.toThrow()
        expect(() => make().cursor().hasNext()).not.toThrow()
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

      it('handles a collection that contains itself without unbounded recursion [004 S5-AC5]', () => {
        const a = make([1])
        a.add(a)
        expect(a.equals(a)).toBe(true)
        expect(typeof hashCode(a)).toBe('number')
        expect(String(a)).toContain('[Circular]')
        expect(inspect(a, { depth: null })).toContain('[Circular]')
        expect(inspect(a)).toContain('[Circular]')
        const b = make([1])
        b.add(b)
        expect(() => a.equals(b)).not.toThrow()
        expect(a.equals(b)).toBe(b.equals(a))
      })

      it('has no public hashCode() method [004 S5-AC6]', () => {
        expect('hashCode' in make([1])).toBe(false)
      })
    })

    describe('printing', () => {
      it('prints the class name, size and elements in the family brackets [004 S6-AC1]', () => {
        const tag = name
        expect(String(make([1, 2, 'a']))).toBe(`${tag}(3) ${open}1, 2, 'a'${close}`)
        expect(String(make())).toBe(`${tag}(0) ${open}${close}`)
      })

      it('prints [Circular] for a collection already being printed [004 S6-AC2]', () => {
        const c = make([1])
        c.add(c)
        expect(String(c)).toContain('[Circular]')
        const array: unknown[] = [1]
        array.push(array)
        expect(String(make([array]))).toContain('[1, [Circular]]')
        const d = make([1])
        d.add({ toString: () => String(d) })
        expect(String(d)).toContain('[Circular]')
      })

      it('renders each kind of element per the rules [004 S6-AC3]', () => {
        const tag = name
        function named() {}
        const date = new Date(0)
        const storesNull = options.nullElements !== 'reject'
        const nulls = storesNull ? [null, undefined] : []
        const c = make(["it's\n", -0, 5n, Symbol("a'b"), ...nulls, [1, [2]], named, () => 1, date])
        const printed = String(c)
        // A set stores -0 as 0, as native Set does; a list keeps -0 and prints it.
        const minusZero = options.brackets === 'set' ? '0' : '-0'
        const shownNulls = storesNull ? ' null, undefined,' : ''
        expect(printed).toBe(
          `${tag}(${storesNull ? 10 : 8}) ${open}'it\\'s\\n', ${minusZero}, 5n, Symbol(a\\'b),${shownNulls} [1, [2]], [Function: named], [Function: ], ${String(date)}${close}`.replace(
            '[Function: ]',
            '[Function (anonymous)]',
          ),
        )
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
        expect(String(make([true, false, sneaky]))).toBe(
          `${tag}(3) ${open}true, false, [Function (anonymous)]${close}`,
        )
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

      it('lets JSON.stringify of a self-containing collection fail instead of running forever [004 S6-AC5]', () => {
        const c = make([1])
        c.add(c)
        expect(() => JSON.stringify(c)).toThrow()
      })

      it('reports its class name through Symbol.toStringTag [004 S6-AC6]', () => {
        const c = make()
        expect(Object.prototype.toString.call(c)).toBe(`[object ${name}]`)
      })

      it('shows class, size and elements in Node inspect, honouring depth [004 S6-AC7]', () => {
        const tag = name
        expect(inspect(make([1, 'a']))).toBe(`${tag}(2) ${open} 1, 'a' ${close}`)
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
      })
    })

    describe('recognition', () => {
      it('is recognised by isCollection [004 S7-AC1]', () => {
        expect(isCollection(make())).toBe(true)
      })
    })
  })
}

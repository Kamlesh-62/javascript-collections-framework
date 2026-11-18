// The contract every collection keeps. Each implementation's test file runs it through
// `describeCollection`, so swapping an engine must keep every one of these tests passing.

import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import {
  type Collection,
  ConcurrentModificationError,
  hashCode,
  IllegalStateError,
  NoSuchElementError,
  UnsupportedOperationError,
} from '../../src/index'
import {
  caught,
  describeReadonlyCollection,
  orderHelpers,
  type ReadonlyCollectionContractOptions,
} from './readonly-collection'

export type { ReadonlyCollectionFactory } from './readonly-collection'

export interface CollectionContractOptions extends ReadonlyCollectionContractOptions {
  /** How the collection reacts to a change during iteration. */
  iteration: 'fail-fast' | 'live'
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
   * Puts an element into the collection some other way than `add`, for a view that cannot add (a
   * map's key or value view, filled through its map). With it, `add` and `addAll` of new elements
   * must throw `UnsupportedOperationError` and change nothing; the default is `add`.
   */
  insert?: (collection: Collection<unknown>, element: unknown) => void
  /**
   * The name cursor state errors start with, for a collection whose cursor comes from another
   * collection it wraps; the collection's own name by default.
   */
  cursorName?: string
}

/** Builds a new collection holding `initial`, in order. */
export type CollectionFactory = (initial?: Iterable<unknown>) => Collection<unknown>

/** Runs the collection contract against `make`. */
export function describeCollection(
  name: string,
  make: CollectionFactory,
  options: CollectionContractOptions,
): void {
  const failFast = options.iteration === 'fail-fast'
  const unordered = options.order === 'unspecified'
  const insert = options.insert
  /** Puts `element` into `c`: through `add`, or through the `insert` option. */
  const put = (c: Collection<unknown>, element: unknown): void => {
    if (insert) insert(c, element)
    else c.add(element)
  }
  const { ordered, expectElements } = orderHelpers(options.order)

  describeReadonlyCollection(name, make, options)

  describe(`${name} — collection contract`, () => {
    describe('query', () => {
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
      it.skipIf(!insert)(
        'add and addAll of a new element throw UnsupportedOperationError and change nothing [004 S2-AC1]',
        () => {
          const c = make([1])
          const revision = c.revision
          expect(() => c.add(2)).toThrow(UnsupportedOperationError)
          expect(() => c.addAll([2])).toThrow(UnsupportedOperationError)
          expect(() => c.addAll(c)).toThrow(UnsupportedOperationError)
          expect(c.addAll([])).toBe(false)
          expectElements(c, [1])
          expect(c.revision).toBe(revision)
        },
      )

      it.skipIf(!!insert)('add returns the collection, so calls chain [004 S2-AC1]', () => {
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
          expectElements(d, [2, 1]) // only the first equal element
        }
      })

      it.skipIf(!!insert)(
        'addAll adds in order and reports whether anything was added [004 S2-AC3]',
        () => {
          const c = make([1])
          expect(c.addAll([2, 3])).toBe(true)
          if (unordered) expectElements(c, [1, 2, 3])
          else expect([...c].slice(-2)).toEqual([2, 3])
          expect(c.addAll([])).toBe(false)
          if (options.brackets === 'set') expect(c.addAll([1, 2])).toBe(false)
        },
      )

      it('removeAll removes every element equal to one in the argument [004 S2-AC4]', () => {
        const c = make([1, 2, 3, 4])
        expect(c.removeAll([2, 4, 9])).toBe(true)
        expectElements(c, [1, 3])
        expect(c.removeAll([9])).toBe(false)
      })

      it('retainAll removes every element not equal to one in the argument [004 S2-AC5]', () => {
        const c = make([1, 2, 3, 4])
        expect(c.retainAll([2, 4, 9])).toBe(true)
        expectElements(c, [2, 4])
        expect(c.retainAll([2, 4])).toBe(false)
      })

      it('reads the whole argument first: self is safe and a throwing iterable changes nothing [004 S2-AC6]', () => {
        const c = make([1, 2])
        if (insert) {
          // covered by the UnsupportedOperationError case
        } else if (options.brackets === 'list') {
          c.addAll(c)
          expectElements(c, [1, 2, 1, 2])
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
        expectElements(e, [1, 2, 3])
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
        expectElements(c, [1, 3])
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
        expectElements(c, [1, 2, 3])
      })

      it('removeIf throws ConcurrentModificationError and removes nothing if the predicate changes the structure [004 S2-AC9]', () => {
        const c = make([1, 2, 3])
        expect(() =>
          c.removeIf((element) => {
            if (element === 2) put(c, 99)
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
        put(c, 3)
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
          expectElements(c, [1, 2, 3])
          calls = 0
          expect(caught(() => c.retainAll([2, 3]))).toBe(failure)
          expectElements(c, [1, 2, 3])
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
          expectElements(c, [1, 2])
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
              put(c, fresh++) // a new value, so even a set changes structure
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
        put(c, 4)
        expect(it.next()).toEqual({ done: true, value: undefined })
      })

      if (failFast) {
        it('throws ConcurrentModificationError from next() after an outside structural change [004 S3-AC4]', () => {
          const c = make([1, 2, 3])
          const it = c[Symbol.iterator]()
          it.next()
          put(c, 4)
          expect(() => it.next()).toThrow(ConcurrentModificationError)
        })

        it('throws after a forEach callback changes the structure, even on the last element [004 S3-AC5]', () => {
          const c = make([1, 2, 3])
          expect(() =>
            c.forEach((e) => {
              if (e === 3) put(c, 4)
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
              put(c, 4)
              c.delete(1)
              put(c, 1)
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
              put(d, 5)
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
        put(c, 9)
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
                put(target, {}) // a new value, so even a set changes structure
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
        put(c, 3)
        c.clear()
        put(c, 4)
        expect(throwsOnChange(c)).toBe(expected)
        expect(throwsOnChange(make([5]))).toBe(expected)
      })
    })

    describe('cursor', () => {
      it('remove deletes the element next returned and the cursor continues [004 S4-AC3]', () => {
        const c = make([1, 2, 3, 4])
        const cursor = c.cursor()
        const seen: unknown[] = []
        while (cursor.hasNext()) {
          const e = cursor.next()
          seen.push(e)
          if ((e as number) % 2 === 0) cursor.remove()
        }
        expect(ordered(seen)).toEqual([1, 2, 3, 4])
        expectElements(c, [1, 3])
      })

      it('remove before next, or twice, throws IllegalStateError [004 S4-AC4]', () => {
        const c = make([1, 2])
        const cursor = c.cursor()
        expect(() => cursor.remove()).toThrow(IllegalStateError)
        expect((caught(() => cursor.remove()) as Error).message).toBe(
          `${options.cursorName === undefined ? name : options.cursorName}.cursor: remove() called before next()`,
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
          put(c, 4)
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
          put(c, 3) // re-added before reached: yielded once, at its new place
          expect(cursor.next()).toBe(3)
          expect(cursor.hasNext()).toBe(false)
          put(c, 9)
          expect(cursor.hasNext()).toBe(false) // finished for good
          expect(() => cursor.next()).toThrow(NoSuchElementError)
        })
      }

      it('hasNext never throws [004 S4-AC8]', () => {
        const c = make([1, 2])
        const cursor = c.cursor()
        cursor.next()
        put(c, 3)
        expect(() => cursor.hasNext()).not.toThrow()
        expect(() => make().cursor().hasNext()).not.toThrow()
      })
    })

    describe('equality and hashing', () => {
      it('handles a collection that contains itself without unbounded recursion [004 S5-AC5]', () => {
        const a = make([1])
        put(a, a)
        expect(a.equals(a)).toBe(true)
        expect(typeof hashCode(a)).toBe('number')
        expect(String(a)).toContain('[Circular]')
        expect(inspect(a, { depth: null })).toContain('[Circular]')
        expect(inspect(a)).toContain('[Circular]')
        const b = make([1])
        put(b, b)
        expect(() => a.equals(b)).not.toThrow()
        expect(a.equals(b)).toBe(b.equals(a))
      })
    })

    describe('printing', () => {
      it('prints [Circular] for a collection already being printed [004 S6-AC2]', () => {
        const c = make([1])
        put(c, c)
        expect(String(c)).toContain('[Circular]')
        const array: unknown[] = [1]
        array.push(array)
        expect(String(make([array]))).toContain('[1, [Circular]]')
        const d = make([1])
        put(d, { toString: () => String(d) })
        expect(String(d)).toContain('[Circular]')
      })

      it('lets JSON.stringify of a self-containing collection fail instead of running forever [004 S6-AC5]', () => {
        const c = make([1])
        put(c, c)
        expect(() => JSON.stringify(c)).toThrow()
      })
    })
  })
}

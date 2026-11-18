import { describe, expect, it } from 'vitest'
import { type Collection, hashCode } from '../src/index'
import { describeCollection } from './contracts/collection'
import { FailFastList } from './fixtures/fail-fast-list'
import { LiveSet } from './fixtures/live-set'
import { combine, StructuralList } from './fixtures/structural-list'
import { fixHashSeed } from './support/hash-seed'
import { runReferenceModel } from './support/reference-model'

fixHashSeed()

/** A FailFastList whose element equality calls user code. */
class EqualityList<E> extends FailFastList<E> {
  private readonly equality: (a: E, b: E) => boolean
  constructor(initial: Iterable<E>, equality: (a: E, b: E) => boolean) {
    super(initial)
    this.equality = equality
  }
  protected override elementEquals(a: E, b: E): boolean {
    return this.equality(a, b)
  }
}

/** A LiveSet whose element equality (used by removeAll/retainAll decisions) calls user code. */
class EqualitySet<E> extends LiveSet<E> {
  private readonly equality: (a: E, b: E) => boolean
  constructor(initial: Iterable<E>, equality: (a: E, b: E) => boolean) {
    super(initial)
    this.equality = equality
  }
  protected override elementEquals(a: E, b: E): boolean {
    return this.equality(a, b)
  }
}

/** A FailFastList whose add throws for some elements. */
class FailingList<E> extends FailFastList<E> {
  private readonly rejects: (element: E) => boolean
  private readonly failure: Error
  constructor(rejects: (element: E) => boolean, failure: Error) {
    super()
    this.rejects = rejects
    this.failure = failure
  }
  override add(element: E): this {
    if (this.rejects(element)) throw this.failure
    return super.add(element)
  }
}

const list = (initial?: Iterable<unknown>) => new FailFastList(initial) as Collection<unknown>
const set = (initial?: Iterable<unknown>) => new LiveSet(initial) as Collection<unknown>
const structural = (initial?: Iterable<unknown>) =>
  new StructuralList(initial) as Collection<unknown>

describe('collection core', () => {
  describeCollection('FailFastList', list, {
    iteration: 'fail-fast',
    brackets: 'list',
    replace: (c, index, value) => (c as FailFastList<unknown>).set(index, value),
    withEquality: (initial, equality) => new EqualityList(initial, equality),
    withFailingAdd: (rejects, failure) => new FailingList(rejects, failure),
    peers: [set, structural],
  })
  describeCollection('LiveSet', set, {
    iteration: 'live',
    brackets: 'set',
    withEquality: (initial, equality) => new EqualitySet(initial, equality),
    peers: [list, structural],
  })
  describeCollection('StructuralList', structural, {
    iteration: 'fail-fast',
    brackets: 'list',
    replace: (c, index, value) => (c as StructuralList<unknown>).set(index, value),
    peers: [list, set],
    structural: { expectedHash: combine },
  })

  it('gives real results when an element compares or hashes its collection while it prints [004 S5-AC5]', () => {
    let compared: boolean | undefined
    let hashed: number | undefined
    const a = new StructuralList<unknown>()
    const b = new StructuralList<unknown>()
    const element = {
      toString(): string {
        compared = a.equals(b)
        hashed = hashCode(a)
        return 'element'
      },
    }
    a.add(element)
    b.add(element)
    expect(String(a)).toBe('StructuralList(1) [element]')
    expect(compared).toBe(true)
    expect(hashed).toBe(hashCode(b))
  })
})

describe('isCollection', () => {
  it('recognises collections from another loaded copy of the package [004 S7-AC1]', async () => {
    const { isCollection } = await import('../src/index')
    const { vi } = await import('vitest')
    vi.resetModules()
    const other = await import('./fixtures/fail-fast-list')
    expect(isCollection(new other.FailFastList([1]))).toBe(true)
    expect(isCollection(new LiveSet())).toBe(true)
  })

  it('rejects maps, arrays, native Set and Map, primitives, null and undefined [004 S7-AC2]', async () => {
    const { isCollection } = await import('../src/index')
    for (const value of [
      [],
      [1],
      new Set([1]),
      new Map(),
      1,
      'x',
      true,
      1n,
      Symbol('s'),
      null,
      undefined,
      {},
    ]) {
      expect(isCollection(value)).toBe(false)
    }
    // A map-like library value without the collection brand is not a collection either.
    expect(isCollection({ size: 0, has: () => false, get: () => undefined })).toBe(false)
  })
})

describe('shared harnesses', () => {
  it('the contract suites carry a tagged test for every rule that applies to a collection [004 S8-AC1]', async () => {
    const { readFileSync } = await import('node:fs')
    const text = ['./contracts/collection.ts', './contracts/readonly-collection.ts']
      .map((file) => readFileSync(new URL(file, import.meta.url), 'utf8'))
      .join('\n')
    const counts: Record<number, number> = { 1: 5, 2: 14, 3: 9, 4: 9, 5: 6, 6: 7, 7: 1 }
    for (const [story, count] of Object.entries(counts)) {
      for (let ac = 1; ac <= count; ac++) expect(text).toContain(`[004 S${story}-AC${ac}]`)
    }
  })

  it('runs seeded operation sequences against a native model, with open iterators and cursors in live mode [004 S8-AC2]', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      runReferenceModel({ seed, steps: 400, make: () => new LiveSet<number>(), model: 'set' })
      runReferenceModel({
        seed,
        steps: 400,
        make: () => new FailFastList<number>(),
        model: 'array',
      })
    }
  })

  it('names the seed of a failing run so it can be replayed [004 S8-AC3]', () => {
    class Broken extends LiveSet<number> {
      override has(): boolean {
        return false
      }
    }
    let message = ''
    try {
      runReferenceModel({ seed: 42, steps: 200, make: () => new Broken(), model: 'set' })
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain('seed 42')
  })
})

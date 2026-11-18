import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SCALE } from './config'

type Library = typeof import('../../src/index')

const N = SCALE.twoCopiesElements

/** Both builds, loaded as two separate copies of the package in one process. */
async function loadBoth(): Promise<{ esm: Library; cjs: Library }> {
  const esmFile = fileURLToPath(new URL('../../dist/index.js', import.meta.url))
  const cjsFile = fileURLToPath(new URL('../../dist/index.cjs', import.meta.url))
  const esm = (await import(pathToFileURL(esmFile).href)) as Library
  const cjs = createRequire(import.meta.url)(cjsFile) as Library
  return { esm, cjs }
}

/**
 * Everything the check observes when collections built by `a` meet the functions and collections
 * of `b`. Run with one copy for both, it is the expected result.
 */
function observe(a: Library, b: Library): Record<string, unknown> {
  const numbers = Array.from({ length: N }, (_, i) => (i * 7_919) % N)
  const listA = new a.ArrayList(numbers)
  const listB = new b.ArrayList(numbers)
  const setA = new a.HashSet(numbers)
  const mapA = new a.HashMap(numbers.map((n) => [n, n * 2] as [number, number]))
  const treeA = new a.TreeSet(numbers)
  const dequeA = new a.ArrayDeque(numbers)

  const added = new b.ArrayList<number>()
  const addedChanged = added.addAll(listA)

  const keyed = new b.HashMap<unknown, number>(undefined, { equivalence: b.valueEquivalence })
  for (let i = 0; i < N; i++) keyed.set(new a.ArrayList([i, i + 1]), i)
  let found = 0
  for (let i = 0; i < N; i++) if (keyed.get(new b.ArrayList([i, i + 1])) === i) found++
  let missed = 0
  for (let i = 0; i < 1_000; i++) if (keyed.get(new b.ArrayList([i + 1, i])) !== undefined) missed++

  const copiedList = b.copyOfList(listA)
  const copiedSet = b.copyOfSet(setA)
  const copiedMap = b.copyOfMap(mapA)

  return {
    'equals a→b': b.equals(listA, listB),
    'equals b→a': a.equals(listB, listA),
    'method equals a→b': listA.equals(listB),
    'method equals b→a': listB.equals(listA),
    // Hash values differ between loaded copies; one copy hashes equal lists alike.
    'hash codes agree': b.hashCode(listA) === b.hashCode(listB),
    'unequal lists': b.equals(listA, new b.ArrayList(numbers.slice(1))),
    'set equals': b.equals(setA, new b.HashSet(numbers.slice().reverse())),
    'map equals': b.equals(
      mapA,
      new b.HashMap(numbers.map((n) => [n, n * 2] as [number, number]).reverse()),
    ),
    'addAll changed': addedChanged,
    'addAll size': added.size,
    'addAll equals': b.equals(added, listA),
    'keys found': found,
    'keys missed': missed,
    'copyOfList equals': b.equals(copiedList, listA),
    'copyOfList size': copiedList.size,
    'copyOfSet equals': b.equals(copiedSet, setA),
    'copyOfSet size': copiedSet.size,
    'copyOfMap equals': b.equals(copiedMap, mapA),
    'copyOfMap value': copiedMap.get(numbers[N - 1] as number),
    guards: [
      b.isCollection(listA),
      b.isList(listA),
      b.isSetCollection(setA),
      b.isMapCollection(mapA),
      b.isSortedSet(treeA),
      b.isQueue(dequeA),
      b.isDeque(dequeA),
      b.isSequencedCollection(listA),
      b.isList(setA),
      b.isMapCollection(listA),
    ],
  }
}

describe('two loaded copies at scale', () => {
  it('collections from the ESM and CommonJS builds work together at scale as collections from one copy do [033 S3-AC3]', async () => {
    const { esm, cjs } = await loadBoth()
    expect(esm.ArrayList).not.toBe(cjs.ArrayList)
    const expected = observe(esm, esm)
    expect(observe(cjs, cjs)).toEqual(expected)
    expect(observe(esm, cjs)).toEqual(expected)
    expect(observe(cjs, esm)).toEqual(expected)
    expect(expected['keys found']).toBe(N)
    expect(expected['equals a→b']).toBe(true)
  })
})

// The shared contract pairs in each browser, against the built package, without the Node.js
// `inspect` checks.

import * as lib from 'javascript-collections-framework'
import { describe, expect, it } from 'vitest'
import * as suitesLibrary from '../../../src/index'
import { CONTRACT_PAIRS } from '../../../test/contracts/pairs'

describe('contract pairs in the browser', () => {
  it('are the eight pairs, run against the built package that the suites also import [039 S1-AC2]', () => {
    expect(CONTRACT_PAIRS.map((pair) => pair.name)).toEqual([
      'ArrayList',
      'HashSet',
      'HashMap',
      'LinkedHashMap',
      'TreeSet',
      'TreeMap',
      'ArrayDeque',
      'PriorityQueue',
    ])
    // The suites' own imports of the source resolve to the same built module.
    expect(suitesLibrary).toBe(lib)
  })
})

for (const pair of CONTRACT_PAIRS) pair.run(lib as never, { inspect: false })

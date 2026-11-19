// A least-recently-used cache (`LinkedHashMap` with `accessOrder` and `maxSize`) replaying a
// skewed access trace, against a reference LRU over an array of keys, most recent last.

import { LinkedHashMap } from '../../src/index'
import type { WorkloadSizes } from '../stress/config'
import { accessTrace } from '../support/data/trace'
import { same, sameSequence } from './check'

/** Full-order comparisons per run. */
const ORDER_CHECKS = 50

export function run(sizes: WorkloadSizes, seed: number): void {
  const capacity = sizes.cacheSize
  const trace = accessTrace(sizes.trace, capacity * 4, seed)
  const evicted: string[] = []
  const cache = new LinkedHashMap<string, string>({
    accessOrder: true,
    maxSize: capacity,
    onEvict: (value, key) => {
      same(value, `value of ${key}`, 'evicted value')
      evicted.push(key)
    },
  })
  const lru: string[] = []
  let hits = 0
  let misses = 0
  let referenceHits = 0
  let referenceMisses = 0
  const every = Math.max(1, Math.floor(trace.length / ORDER_CHECKS))

  for (let step = 0; step < trace.length; step++) {
    const { op, key } = trace[step] as (typeof trace)[number]
    const at = `step ${step} ${op} ${key}`
    const index = lru.indexOf(key)
    const expectedEvictions: string[] = []
    if (op === 'get') {
      const value = cache.get(key)
      if (value !== undefined) {
        hits++
      } else {
        misses++
        cache.set(key, `value of ${key}`)
      }
      if (index >= 0) {
        referenceHits++
        lru.splice(index, 1)
        lru.push(key)
      } else {
        referenceMisses++
        lru.push(key)
        if (lru.length > capacity) expectedEvictions.push(lru.shift() as string)
      }
    } else if (op === 'has') {
      // `has` never moves a key, so it never changes which key is evicted next.
      same(cache.has(key), index >= 0, `${at} result`)
    } else {
      same(cache.delete(key), index >= 0, `${at} result`)
      if (index >= 0) lru.splice(index, 1)
    }
    same(hits, referenceHits, `${at} hits`)
    same(misses, referenceMisses, `${at} misses`)
    sameSequence(evicted, expectedEvictions, `${at} evictions`)
    evicted.length = 0
    same(cache.size, lru.length, `${at} size`)
    if (step % every === 0) sameSequence(cache.keys(), lru, `${at} order`)
  }
  sameSequence(cache.keys(), lru, 'final order')
}

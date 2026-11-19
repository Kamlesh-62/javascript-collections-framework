// The realistic workloads at the sizes `pnpm test` runs; `pnpm test:stress` runs them at full size.

import { describe, it } from 'vitest'
import * as eventLog from './scenarios/event-log'
import * as lruCache from './scenarios/lru-cache'
import * as records from './scenarios/records'
import * as scheduler from './scenarios/scheduler'
import * as shuffle from './scenarios/shuffle'
import * as slidingWindow from './scenarios/sliding-window'
import * as sortedSearch from './scenarios/sorted-search'
import * as wordCount from './scenarios/word-count'
import { WORKLOADS, type WorkloadSizes } from './stress/config'

const WORKLOADS_RUN: Array<[string, (sizes: WorkloadSizes, seed: number) => void]> = [
  [
    'counts the words of a multilingual text as a native Map and a code-unit sort do [035 S1-AC1]',
    wordCount.run,
  ],
  [
    'replays a skewed access trace through an LRU cache with the hits, misses and evictions of a reference LRU [035 S1-AC2]',
    lruCache.run,
  ],
  [
    'answers range and nearest-match queries on an event log keyed by milliseconds and by Date as a sorted array does [035 S1-AC3]',
    eventLog.run,
  ],
  [
    'dispatches a scheduler with ties and re-scheduling in time and then sequence order [035 S1-AC4]',
    scheduler.run,
  ],
  [
    'de-duplicates, groups and round-trips records with their own equality as a canonical-JSON Map does [035 S1-AC5]',
    records.run,
  ],
  [
    'keeps a sliding window in a deque and a linked list equal to an array slice [035 S1-AC6]',
    slidingWindow.run,
  ],
  [
    'searches, rotates and reverses a sorted array through asList as array-based references do [035 S1-AC7]',
    sortedSearch.run,
  ],
  [
    'shuffles into a repeatable permutation with one random call per element after the first [035 S1-AC8]',
    shuffle.run,
  ],
]

describe('realistic workloads', () => {
  for (const [title, run] of WORKLOADS_RUN) {
    for (let seed = 1; seed <= WORKLOADS.fast.seeds; seed++) {
      it(`${title} seed ${seed}`, () => run(WORKLOADS.fast, seed))
    }
  }
})

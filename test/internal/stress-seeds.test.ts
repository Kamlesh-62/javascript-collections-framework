import { describe, expect, it } from 'vitest'
import { hashCode } from '../../src/index'
import { BucketTable } from '../../src/internal/engines/hash-table'
import { withSeeds } from '../stress/target'

describe('replaying a stress run', () => {
  it('fixes the hash seed and the bucket seed source from the run seed while a run replays [033 S2-AC2]', async () => {
    const observe = () => [
      hashCode('replayed key'),
      new BucketTable<number>().seed,
      new BucketTable<number>().seed,
    ]
    const first = await withSeeds(7, observe)
    const again = await withSeeds(7, observe)
    const other = await withSeeds(8, observe)
    expect(again).toEqual(first)
    expect(other[0]).not.toBe(first[0])
    expect([other[1], other[2]]).not.toEqual([first[1], first[2]])
  })
})

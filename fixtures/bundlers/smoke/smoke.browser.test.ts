// The smoke check in each browser: once from an ES module bundle, once from the IIFE build loaded
// by a script tag and read through `window.JCF`.

import { describe, expect, it } from 'vitest'

type Result = { collections: number; errors: number } | { error: string }

/** Opens `page` in a frame and returns what its smoke check reported. */
async function run(page: string): Promise<Result> {
  const frame = document.createElement('iframe')
  frame.src = new URL(`/smoke/${page}`, location.origin).href
  document.body.append(frame)
  try {
    await expect
      .poll(() => (frame.contentWindow as { smokeResult?: Result } | null)?.smokeResult, {
        timeout: 15_000,
      })
      .toBeDefined()
    return (frame.contentWindow as unknown as { smokeResult: Result }).smokeResult
  } finally {
    frame.remove()
  }
}

describe('browser smoke check', () => {
  it('builds, reads, iterates and writes JSON with each collection class from an ES module bundle [039 S1-AC1]', async () => {
    expect(await run('esm.html')).toEqual({ collections: 10, errors: 8 })
  })

  it('does the same from the IIFE build through a script tag and window.JCF [039 S1-AC1]', async () => {
    expect(await run('iife.html')).toEqual({ collections: 10, errors: 8 })
  })
})

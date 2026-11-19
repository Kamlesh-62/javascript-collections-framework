// Each bundler builds a fixture that imports one named collection, in production mode; the output
// runs in Node.js (server output) or in Chromium through Playwright (client output) and must
// report the result of one operation.

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { type Browser, chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  esbuildBuild,
  FIXTURES,
  nextBuild,
  nextCli,
  rollupBuild,
  rspackBuild,
  viteBuild,
  viteSsrBuild,
  webpackBuild,
} from './scripts/build.mjs'
import { freePort, serveFolder, startServer } from './scripts/serve.mjs'

const EXPECTED = 'TreeMap 1,2,3'

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
})
afterAll(async () => {
  await browser?.close()
})

/** Opens `page` of `folder` in Chromium and returns what the bundle reported. */
async function inBrowser(folder: string, page: string): Promise<unknown> {
  const server = await serveFolder(folder)
  const tab = await browser.newPage()
  try {
    await tab.goto(`${server.url}/${page}`)
    await tab.waitForFunction(() => 'fixtureResult' in globalThis, undefined, { timeout: 15_000 })
    return await tab.evaluate(() => (globalThis as { fixtureResult?: unknown }).fixtureResult)
  } finally {
    await tab.close()
    await server.close()
  }
}

/** Writes a page that loads a classic script bundle `main.js` and returns its folder. */
function scriptPage(folder: string): string {
  writeFileSync(join(folder, 'index.html'), '<!doctype html><script src="main.js"></script>\n')
  return folder
}

const client: Array<[string, (entry: string, out: string, mode: 'app') => Promise<string>]> = [
  ['webpack', webpackBuild],
  ['rspack', rspackBuild],
  ['esbuild', esbuildBuild],
  ['rollup', rollupBuild],
]

describe('bundler fixtures', () => {
  for (const [name, build] of client) {
    it(`${name} builds the client fixture in production mode, and the bundle reports the result in a browser [039 S2-AC1]`, async () => {
      const out = join(FIXTURES, name, '.out')
      await build(join(FIXTURES, name, 'entry.js'), out, 'app')
      expect(await inBrowser(scriptPage(out), 'index.html')).toBe(EXPECTED)
    })
  }

  it('Vite builds the client page in production mode, and the page reports the result in a browser [039 S2-AC1]', async () => {
    const out = await viteBuild(join(FIXTURES, 'vite', 'index.html'), join(FIXTURES, 'vite', '.out'), 'app')
    expect(await inBrowser(out, 'index.html')).toBe(EXPECTED)
  })

  it('Vite builds the server entry with the library bundled in, and Node.js runs it [039 S2-AC1]', async () => {
    const file = await viteSsrBuild(join(FIXTURES, 'vite-ssr', 'entry.js'), join(FIXTURES, 'vite-ssr', '.out'))
    const code = readFileSync(file, 'utf8')
    expect(code).not.toMatch(/(from|import|require)\s*\(?\s*["']javascript-collections-framework["']/)
    const { render } = (await import(pathToFileURL(file).href)) as { render: () => string }
    expect(render()).toBe(`<p>${EXPECTED}</p>`)
  })

  it('Next.js builds the app router fixture; the server component renders on the server and the client component runs in the browser [039 S2-AC1]', async () => {
    const dir = join(FIXTURES, 'next')
    await nextBuild(dir)
    const port = await freePort()
    const url = `http://127.0.0.1:${port}/`
    const stop = await startServer(
      process.execPath,
      [nextCli(), 'start', '--port', String(port), '--hostname', '127.0.0.1'],
      dir,
      url,
    )
    try {
      const html = await (await fetch(url)).text()
      expect(html).toContain(`server ${EXPECTED}`)
      expect(html).not.toContain(`client ${EXPECTED}`)
      const tab = await browser.newPage()
      try {
        await tab.goto(url)
        await expect
          .poll(() => tab.textContent('#client'), { timeout: 15_000 })
          .toBe(`client ${EXPECTED}`)
      } finally {
        await tab.close()
      }
    } finally {
      stop()
    }
  })
})

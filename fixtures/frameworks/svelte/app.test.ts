// Svelte 5: a component keeps `revision` in `$state` and refreshes it after a change, so it updates.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ArrayList } from 'javascript-collections-framework'
import { flushSync, mount, unmount } from 'svelte'
import { compile } from 'svelte/compiler'
import { describe, expect, it } from 'vitest'

/** Compiles `Items.svelte` for the client and loads it. */
async function loadItems() {
  const here = dirname(fileURLToPath(import.meta.url))
  const source = readFileSync(join(here, 'Items.svelte'), 'utf8')
  const { js } = compile(source, { generate: 'client', filename: 'Items.svelte' })
  const dir = join(here, '..', '.compiled')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'Items.js')
  writeFileSync(file, js.code)
  return (await import(/* @vite-ignore */ pathToFileURL(file).href)).default
}

describe('Svelte recipe', () => {
  it('updates after a change when revision-driven state is refreshed [021 S2-AC3]', async () => {
    const Items = await loadItems()
    const list = new ArrayList(['a'])
    const target = document.createElement('div')
    const component = mount(Items, { target, props: { list } }) as { refresh(): void }
    flushSync()
    expect(target.textContent).toBe('a')
    list.add('b')
    flushSync()
    expect(target.textContent).toBe('a') // nothing told Svelte
    component.refresh()
    flushSync()
    expect(target.textContent).toBe('a,b')
    unmount(component)
  })
})

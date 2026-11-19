import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readPageBlocks } from './support/doc-examples'

const ROOT = join(import.meta.dirname, '..')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')
const PAGE = 'docs/coming-from-native.md'

const SECTIONS = [
  '`Array` and `ArrayList`',
  '`Map`/`Set` and `HashMap`/`HashSet`',
  'A sorted array and `TreeSet`/`TreeMap`',
  'An array as a queue and `ArrayDeque`',
  'A hand-written heap and `PriorityQueue`',
  'The `Map` LRU trick and `LinkedHashMap`',
]

describe('the page for developers coming from native JavaScript', () => {
  const page = read(PAGE)
  const sections = page.split('\n## ').slice(1)

  it('is linked from the README and the documentation index [042 S6-AC1]', () => {
    expect(read('README.md')).toContain('(docs/coming-from-native.md)')
    expect(read('docs/README.md')).toContain('(coming-from-native.md)')
  })

  it('has one section for each native pattern, in order, and no other [042 S6-AC1]', () => {
    expect(sections.map((s) => s.slice(0, s.indexOf('\n')))).toEqual(SECTIONS)
    expect(sections[1]).toContain('key:')
    expect(sections[2]).toContain('splice')
    expect(sections[3]).toContain('shift')
    expect(sections[5]).toContain('accessOrder')
    expect(sections[5]).toContain('maxSize')
  })

  it('shows native code, library code, the cost that differs and when to keep the native one [042 S6-AC2]', () => {
    for (const section of sections) {
      const title = section.slice(0, section.indexOf('\n'))
      const blocks = readPageBlocks(PAGE, `## ${section}`)
      expect(blocks.length, title).toBeGreaterThanOrEqual(2)
      expect(blocks[0]?.code, title).not.toContain("from 'javascript-collections-framework'")
      expect(blocks[1]?.code, title).toContain("from 'javascript-collections-framework'")
      const cost = /\*\*Complexity:\*\* ([^\n]+)/.exec(section)?.[1] ?? ''
      expect(cost, title).toMatch(/O\(|the same/)
      expect(section, title).toMatch(/\*\*Keep (the|a|`)[^*]*\*\* when /)
    }
  })

  it('runs every block with the documentation runner, none skipped [042 S6-AC3]', () => {
    const blocks = readPageBlocks(PAGE, page)
    expect(blocks.length).toBeGreaterThanOrEqual(12)
    expect(blocks.filter((b) => b.skip !== undefined)).toEqual([])
    expect(page).not.toContain('example: not run')
  })
})

import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const exists = (path: string) => existsSync(new URL(`../${path}`, import.meta.url))

/** The GitHub anchor of a heading: lower case, punctuation dropped, spaces as hyphens. */
const anchorOf = (heading: string) =>
  heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-')

/** The anchors of every `##` and `###` heading of a page. */
const anchorsOf = (page: string) =>
  read(page)
    .split('\n')
    .filter((line) => /^#{1,3} /.test(line))
    .map((line) => anchorOf(line.replace(/^#+ /, '')))

/** The topics of the behaviour notes, one `##` heading each, in order. */
const TOPICS = [
  '`undefined` for absence, and where reads throw',
  '`delete(e)` and `removeAt(i)`; map `delete(k)` and `remove(k)`',
  '`set` and `put`; `list.set` returns the old element',
  'Live and fail-fast iteration',
  'A priority queue iterates in heap order',
  'Sorted collections decide sameness by their comparator',
  '`values()` and `valueCollection()`',
  'Collections that compare by identity',
  'Views and `asList` follow their source',
  "A deque's `push` returns the deque",
  '`sort()` uses natural order',
]

describe('the behaviour notes', () => {
  const page = exists('docs/behaviour-notes.md') ? read('docs/behaviour-notes.md') : ''

  it('exist and are linked from the README and the documentation index [038 S2-AC1]', () => {
    expect(page).not.toBe('')
    expect(read('README.md')).toContain('(docs/behaviour-notes.md)')
    expect(read('docs/README.md')).toContain('(behaviour-notes.md)')
  })

  it('have one section for each topic, in order, and no other [038 S2-AC1]', () => {
    const headings = page
      .split('\n')
      .filter((line) => line.startsWith('## '))
      .map((line) => line.slice(3))
    expect(headings).toEqual(TOPICS)
  })

  it('link each section to an existing page and heading that covers it in full [038 S2-AC1]', () => {
    const sections = page.split('\n## ').slice(1)
    expect(sections.length).toBe(TOPICS.length)
    for (const section of sections) {
      const title = section.slice(0, section.indexOf('\n'))
      const links = [...section.matchAll(/\]\(([a-z-]+\.md)(?:#([a-z0-9-]+))?\)/g)]
      expect(links.length, title).toBeGreaterThan(0)
      for (const [, target, anchor] of links) {
        expect(exists(`docs/${target}`), `${title} → ${target}`).toBe(true)
        if (anchor !== undefined)
          expect(anchorsOf(`docs/${target}`), `${title} → ${target}#${anchor}`).toContain(anchor)
      }
    }
  })

  it('are written in the library’s own voice [038 S2-AC1]', () => {
    expect(page).not.toMatch(/\[\d{3} S\d+-AC\d+\]/)
    expect(page).not.toMatch(/\b(I|we|our)\b/)
    for (const line of page.split('\n')) expect(line.length, line).toBeLessThanOrEqual(100)
  })
})

const REPO = 'https://github.com/Kamlesh-62/javascript-collections-framework'
const SITE = 'https://kamlesh-62.github.io/javascript-collections-framework/'

describe('the README badges', () => {
  const readme = read('README.md')
  /** The badges right under the title: `[![alt](image)](link)` lines before the first paragraph. */
  const badges = [
    ...readme
      .slice(readme.indexOf('\n') + 1, readme.indexOf('\n\n', readme.indexOf('[![')))
      .matchAll(/\[!\[([^\]]+)\]\(([^)]+)\)\]\(([^)]+)\)/g),
  ].map(([, alt, image, link]) => ({ alt, image, link }))

  it('show the CI result for main and the coverage, at the top, with absolute URLs [038 S2-AC3]', () => {
    expect(readme.indexOf('[![')).toBeLessThan(readme.indexOf('\n## '))
    expect(badges).toEqual([
      {
        alt: 'CI',
        image: `${REPO}/actions/workflows/ci.yml/badge.svg?branch=main`,
        link: `${REPO}/actions/workflows/ci.yml?query=branch%3Amain`,
      },
      {
        alt: 'coverage',
        image: `${SITE}coverage/badge.svg`,
        link: `${SITE}coverage/report/`,
      },
    ])
  })

  it('point where the site job publishes the badge and the report [038 S2-AC3]', () => {
    const scripts = JSON.parse(read('package.json')).scripts as Record<string, string>
    expect(scripts['docs:site']).toContain(' site/coverage')
    expect(read('typedoc.json')).toContain('"out": "site"')
    expect(read('docs/README.md')).toContain(`(${SITE})`)
    expect(readme).toContain(`(${SITE})`)
  })
})

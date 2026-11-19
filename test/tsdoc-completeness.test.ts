import { describe, expect, it } from 'vitest'
import { ROWS } from './support/complexity'
import { readExportDocs, readMemberSummaries, summaryOf } from './support/tsdoc-bounds'

const exportDocs = readExportDocs()

describe('TSDoc completeness', () => {
  it('reads every export of the package, types and interfaces included [038 S1-AC1]', () => {
    const kinds = new Set(exportDocs.map((d) => d.kind))
    for (const kind of ['class', 'function', 'const', 'interface', 'type'] as const) {
      expect(kinds.has(kind), kind).toBe(true)
    }
    expect(exportDocs.map((d) => d.name)).toContain('TreeSetOptions')
    expect(exportDocs.map((d) => d.name)).toContain('Comparator')
  })

  it('gives every export of the package a summary and an example [038 S1-AC1]', () => {
    const missingSummary = exportDocs.filter((d) => d.summary === '').map((d) => d.name)
    const missingExample = exportDocs.filter((d) => !d.hasExample).map((d) => d.name)
    expect(missingSummary, 'exports without a summary').toEqual([])
    expect(missingExample, 'exports without an @example').toEqual([])
  })

  it('gives every member of the bound table a summary [038 S1-AC1]', () => {
    const summaries = new Map(readMemberSummaries().map((m) => [m.key, m.summary]))
    const members = [...new Set(ROWS.map((row) => row.member))].sort()
    expect(members.length).toBeGreaterThan(400)
    const unknown = members.filter((member) => !summaries.has(member))
    const missing = members.filter((member) => summaries.get(member) === '')
    expect(unknown, 'bound-table members not found in the package').toEqual([])
    expect(missing, 'bound-table members without a summary').toEqual([])
  })

  it('takes the first paragraph of a comment as its summary [038 S1-AC1]', () => {
    expect(summaryOf('Returns the\n  element.\n\nTime: O(1).')).toBe('Returns the element.')
    expect(summaryOf('')).toBe('')
    expect(summaryOf('\n\n  Only line. ')).toBe('Only line.')
  })
})

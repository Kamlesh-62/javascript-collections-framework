// Adds the coverage figure to the documentation site: a badge, a JSON summary and the HTML
// report.
//
//   node scripts/site-coverage.mjs <coverage-summary.json> <coverage html dir> <out dir>
//
// writes <out>/badge.svg, <out>/coverage.json ({ "lines": 99.9 }) and <out>/report/ (a copy of
// the HTML report, without the JSON and XML reports beside it). The figure is the line coverage,
// rounded down to one decimal place, so the badge never shows more than the tests cover.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The line coverage `pct` rounded down to one decimal place. The summary gives two decimals; they
 * are fixed first so that binary floating point cannot round a figure such as 4.35 down to 4.3.
 *
 * @param {number} pct
 * @returns {number}
 */
export function floorPct(pct) {
  return Math.floor(Math.round(pct * 100) / 10) / 10
}

/**
 * The colour of a badge for a floored figure: green from 95, yellow from 90, red below.
 *
 * @param {number} pct
 * @returns {string}
 */
export function badgeColour(pct) {
  if (pct >= 95) return '#2e7d32'
  if (pct >= 90) return '#9a6700'
  return '#c62828'
}

/** The approximate width of `text` in 11px Verdana, the badge font. */
function textWidth(/** @type {string} */ text) {
  let width = 0
  for (const c of text) width += c === '.' || c === ' ' ? 3.5 : c === '%' ? 9.5 : 7
  return Math.ceil(width)
}

/**
 * A flat two-part SVG badge: "coverage" and the line coverage, rounded down to one decimal place.
 *
 * @param {number} linesPct - `total.lines.pct` of a coverage summary.
 * @returns {string}
 */
export function badgeSvg(linesPct) {
  if (typeof linesPct !== 'number' || !(linesPct >= 0 && linesPct <= 100))
    throw new RangeError(`site-coverage: line coverage ${linesPct} is not a percentage`)
  const value = `${floorPct(linesPct)}%`
  const label = 'coverage'
  const left = textWidth(label) + 10
  const right = textWidth(value) + 10
  const width = left + right
  const colour = badgeColour(floorPct(linesPct))
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${label}: ${value}">`,
    `<title>${label}: ${value}</title>`,
    `<rect width="${left}" height="20" fill="#555555"/>`,
    `<rect x="${left}" width="${right}" height="20" fill="${colour}"/>`,
    '<g fill="#ffffff" text-anchor="middle" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11">',
    `<text x="${left / 2}" y="14">${label}</text>`,
    `<text x="${left + right / 2}" y="14">${value}</text>`,
    '</g>',
    '</svg>',
    '',
  ].join('\n')
}

/**
 * Writes the badge, the JSON summary and a copy of the HTML report under `outDir`.
 *
 * @param {string} summaryPath - A `coverage-summary.json` file.
 * @param {string} reportDir - The HTML coverage report.
 * @param {string} outDir - Where to write; replaced if it exists.
 * @returns {{ lines: number }}
 */
export function writeSiteCoverage(summaryPath, reportDir, outDir) {
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'))
  const pct = summary?.total?.lines?.pct
  const svg = badgeSvg(pct)
  if (!existsSync(path.join(reportDir, 'index.html')))
    throw new Error(`site-coverage: ${reportDir} has no index.html`)
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })
  writeFileSync(path.join(outDir, 'badge.svg'), svg)
  const lines = floorPct(pct)
  writeFileSync(path.join(outDir, 'coverage.json'), `${JSON.stringify({ lines })}\n`)
  // The HTML report shares its directory with the machine-readable reports, which stay out.
  cpSync(reportDir, path.join(outDir, 'report'), {
    recursive: true,
    filter: (source) => !/\.(json|xml)$/.test(source),
  })
  return { lines }
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [summaryPath, reportDir, outDir] = process.argv.slice(2)
  if (summaryPath === undefined || reportDir === undefined || outDir === undefined) {
    console.error(
      'usage: node scripts/site-coverage.mjs <coverage-summary.json> <html dir> <out dir>',
    )
    process.exit(2)
  }
  const { lines } = writeSiteCoverage(summaryPath, reportDir, outDir)
  console.log(`site coverage: lines ${lines}% → ${outDir}`)
}

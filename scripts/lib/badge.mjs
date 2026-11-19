// Flat two-part SVG badges for the documentation site: a grey label and a coloured value, drawn
// without any external service.

/**
 * The approximate width of `text` in 11px Verdana, the badge font.
 *
 * @param {string} text
 * @returns {number}
 */
export function textWidth(text) {
  let width = 0
  for (const c of text) width += c === '.' || c === ' ' ? 3.5 : c === '%' ? 9.5 : 7
  return Math.ceil(width)
}

/**
 * A flat two-part SVG badge.
 *
 * @param {string} label - The grey left part.
 * @param {string} value - The coloured right part.
 * @param {string} colour - The right part's fill, such as `#2e7d32`.
 * @returns {string}
 */
export function flatBadge(label, value, colour) {
  const left = textWidth(label) + 10
  const right = textWidth(value) + 10
  const width = left + right
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
 * A byte count in kilobytes (1 kB = 1000 bytes), rounded up to one decimal place so a figure
 * never shows less than the real size: 33698 → `33.7 kB`, 6000 → `6.0 kB`.
 *
 * @param {number} bytes - A non-negative integer.
 * @returns {string}
 */
export function formatKb(bytes) {
  if (!Number.isInteger(bytes) || bytes < 0)
    throw new RangeError(`badge: ${bytes} is not a byte count`)
  return `${(Math.ceil(bytes / 100) / 10).toFixed(1)} kB`
}

// Printing collections: `toString` and Node's inspect hook.

import { isBranded } from './brand'
import { createGuard } from './cycle'

/** What printing needs from a collection. @internal */
export interface Printable {
  readonly size: number
  readonly [Symbol.toStringTag]: string
  [Symbol.iterator](): Iterator<unknown>
}

// The shared brand every collection carries, from `Symbol.for`, so any loaded copy recognises it.
export const COLLECTION_BRAND: unique symbol = /*#__PURE__*/ Symbol.for(
  'javascript-collections-framework/1/Collection',
)

// Node's custom inspect key, from `Symbol.for`, so no platform module is imported.
export const INSPECT: unique symbol = /*#__PURE__*/ Symbol.for(
  'nodejs.util.inspect.custom',
) as never

const CIRCULAR = () => '[Circular]'

/** The guard shared by printing and inspecting; other operations have their own. */
const printGuard = /*#__PURE__*/ createGuard()

/** Escapes text for single-quoted output: quotes, backslashes and control characters. */
function escapeText(text: string): string {
  // split/join rather than a regular expression: no pattern runs on user text.
  return JSON.stringify(text).slice(1, -1).split('\\"').join('"').split("'").join("\\'")
}

function functionName(fn: (...args: never[]) => unknown): string {
  const descriptor = Object.getOwnPropertyDescriptor(fn, 'name')
  const name = descriptor !== undefined && 'value' in descriptor ? descriptor.value : undefined
  return typeof name === 'string' && name !== '' ? `[Function: ${name}]` : '[Function (anonymous)]'
}

/**
 * Renders one element for `toString`: strings in single quotes, escaped; numbers with `String`
 * except `-0`; bigints with `n`; symbols as `Symbol(description)` with the description escaped;
 * `null`/`undefined` as written; library collections and arrays recursively, cycle-safe;
 * functions as `[Function: name]`; any other object with `String(value)`, as
 * `Array.prototype.join` does (its own `toString` runs; its errors propagate).
 *
 * @internal
 */
export function renderElement(value: unknown): string {
  switch (typeof value) {
    case 'string':
      return `'${escapeText(value)}'`
    case 'number':
      return value === 0 && 1 / value < 0 ? '-0' : String(value)
    case 'bigint':
      return `${String(value)}n`
    case 'symbol': {
      const text = String(value)
      return `Symbol(${escapeText(text.slice(7, -1))})`
    }
    case 'undefined':
      return 'undefined'
    case 'function':
      return functionName(value as (...args: never[]) => unknown)
    default:
      if (value === null) return 'null'
      if (typeof value !== 'object') return String(value)
      if (isBranded(value, COLLECTION_BRAND)) return String(value)
      if (Array.isArray(value)) {
        // An index loop, not `value.map`: an array subclass or an own `map` cannot take over.
        const array = value as unknown[]
        return printGuard(array, CIRCULAR, () => {
          const parts: string[] = []
          for (let i = 0; i < array.length; i++) parts.push(renderElement(array[i]))
          return `[${parts.join(', ')}]`
        })
      }
      return String(value)
  }
}

/**
 * Renders a collection: `ClassName(size) [a, b]` (or with braces for sets), `[Circular]` when it
 * is already being printed. Parts are collected and joined once, so the cost is linear in the
 * output for flat contents; each level of nested arrays or collections copies its text once more.
 *
 * @internal
 */
export function collectionToString(collection: Printable, open: string, close: string): string {
  return printGuard(collection, CIRCULAR, () => {
    const parts: string[] = []
    for (const element of collection as Iterable<unknown>) parts.push(renderElement(element))
    return `${collection[Symbol.toStringTag]}(${collection.size}) ${open}${parts.join(', ')}${close}`
  })
}

/** The options object Node passes to a custom inspect function (only what is used here). @internal */
export interface InspectOptions {
  depth?: number | null
}

/**
 * Node's custom inspect hook body: `ClassName(size) [ a, b ]` (braces for sets), each element
 * formatted by Node's own `inspect` one level deeper than the remaining `depth` Node passed in;
 * `[ClassName]` beyond the depth limit; `[Circular]` for a collection already being inspected.
 * The `inspect` function is the one Node passes in, so nothing platform-specific is imported.
 *
 * @internal
 */
export function inspectCollection(
  collection: Printable,
  depth: number | null,
  options: InspectOptions,
  inspect: (value: unknown, options: InspectOptions) => string,
  open: string,
  close: string,
): string {
  const tag = collection[Symbol.toStringTag]
  if (depth !== null && depth < 0) return `[${tag}]`
  return printGuard(collection, CIRCULAR, () => {
    const childOptions = Object.assign({}, options, { depth: depth === null ? null : depth - 1 })
    const parts: string[] = []
    for (const element of collection as Iterable<unknown>)
      parts.push(inspect(element, childOptions))
    const body = parts.length === 0 ? `${open}${close}` : `${open} ${parts.join(', ')} ${close}`
    return `${tag}(${collection.size}) ${body}`
  })
}

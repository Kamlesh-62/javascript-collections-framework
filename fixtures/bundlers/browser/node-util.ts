// Stands in for `node:util` in browsers. The contract suites call `inspect` only when their
// `inspect` option is on, which it never is there.
export function inspect(): never {
  throw new Error('inspect is available only in Node.js')
}

// Checks that two loaded copies of the package accept each other's values, and that values from
// another major version are refused. Works on two module namespaces, so it runs on the built ESM and
// CommonJS files (scripts/two-copies.mjs) and on two loads of the source in tests.

const BRAND_PREFIX = 'javascript-collections-framework/'

/** Guards whose subject the package cannot create yet, with the reason printed instead. */
export const WAITING = {
  isCollection: 'no exported collection to check across copies',
}

/** The minimum the check must find, so a broken discovery cannot pass by finding nothing. */
export const MINIMUM_CLASSES = 8
export const REQUIRED_GUARDS = ['isCollection']

/** @typedef {Record<string, unknown>} Namespace */
/** @typedef {new (...args: unknown[]) => object} Constructor */
/** @typedef {(value: unknown) => boolean} Guard */

/**
 * A value carrying the brand `javascript-collections-framework/<major>/<name>`.
 * @param {number} major
 * @param {string} name
 * @returns {object}
 */
export function brandedValue(major, name) {
  const proto = {}
  Object.defineProperty(proto, Symbol.for(`${BRAND_PREFIX}${major}/${name}`), {
    get: () => true,
  })
  return Object.create(proto)
}

/**
 * Classes recognised across copies: exported functions with their own `Symbol.hasInstance`.
 * @param {Namespace} copy
 * @returns {string[]}
 */
export function brandedClasses(copy) {
  return Object.keys(copy)
    .filter(
      (name) => typeof copy[name] === 'function' && Object.hasOwn(copy[name], Symbol.hasInstance),
    )
    .sort()
}

/**
 * Guards: exported functions named `is…`.
 * @param {Namespace} copy
 * @returns {string[]}
 */
export function guards(copy) {
  return Object.keys(copy)
    .filter((name) => /^is[A-Z]/.test(name) && typeof copy[name] === 'function')
    .sort()
}

/**
 * Runs the checks on copies `a` and `b` of the package.
 * @param {Namespace} a
 * @param {Namespace} b
 * @param {Record<string, (copy: Namespace) => unknown>} [samples] guard name → a value from a copy
 * @returns {{ ok: boolean, lines: string[], failures: string[] }}
 */
export function checkTwoCopies(a, b, samples = {}) {
  /** @type {string[]} */
  const lines = []
  /** @type {string[]} */
  const failures = []
  const expect = (/** @type {boolean} */ condition, /** @type {string} */ what) => {
    if (!condition) failures.push(what)
  }

  const classes = brandedClasses(a)
  const found = guards(a)
  expect(
    classes.length >= MINIMUM_CLASSES,
    `found ${classes.length} classes recognised across copies; expected at least ${MINIMUM_CLASSES}`,
  )
  for (const name of REQUIRED_GUARDS) expect(found.includes(name), `guard ${name} not found`)

  for (const name of classes) {
    const A = /** @type {Constructor} */ (a[name])
    const B = /** @type {Constructor | undefined} */ (b[name])
    if (B === undefined) {
      failures.push(`${name} is missing from the second copy`)
      continue
    }
    expect(A !== B, `${name}: both copies returned the same class — not two copies`)
    expect(
      new A() instanceof B,
      `${name}: an instance from copy A is not instanceof copy B's class`,
    )
    expect(
      new B() instanceof A,
      `${name}: an instance from copy B is not instanceof copy A's class`,
    )
    for (const other of classes) {
      if (other === name) continue
      const Other = /** @type {Constructor} */ (b[other])
      expect(!(new A() instanceof Other), `${name}: an instance is accepted by ${other}`)
    }
    expect(brandedValue(1, name) instanceof A, `${name}: a same-major value is refused`)
    expect(!(brandedValue(2, name) instanceof A), `${name}: a major-2 value is accepted (copy A)`)
    expect(!(brandedValue(2, name) instanceof B), `${name}: a major-2 value is accepted (copy B)`)
    lines.push(`${name}: recognised across copies; major 2 refused`)
  }

  for (const name of found) {
    const guardA = /** @type {Guard} */ (a[name])
    const guardB = /** @type {Guard | undefined} */ (b[name])
    if (guardB === undefined) {
      failures.push(`${name} is missing from the second copy`)
      continue
    }
    const subject = name.slice(2)
    expect(guardA(brandedValue(1, subject)), `${name}: a same-major value is refused`)
    expect(!guardA(brandedValue(2, subject)), `${name}: a major-2 value is accepted (copy A)`)
    expect(!guardB(brandedValue(2, subject)), `${name}: a major-2 value is accepted (copy B)`)
    const sample = samples[name]
    if (sample !== undefined) {
      expect(guardB(sample(a)), `${name}: copy B refuses a value from copy A`)
      expect(guardA(sample(b)), `${name}: copy A refuses a value from copy B`)
      lines.push(`${name}: recognised across copies; major 2 refused`)
    } else if (Object.hasOwn(WAITING, name)) {
      const reason = WAITING[/** @type {keyof typeof WAITING} */ (name)]
      lines.push(`${name}: major 2 refused; cross-copy ${reason}`)
    } else {
      failures.push(`${name}: no sample value to check across copies — add one`)
    }
  }

  lines.push(
    `two copies: ${classes.length} classes, ${found.length} guards — ${failures.length === 0 ? 'ok' : `${failures.length} failed`}`,
  )
  return { ok: failures.length === 0, lines, failures }
}

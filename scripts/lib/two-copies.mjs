// Checks that two loaded copies of the package accept each other's values, and that values from
// another major version are refused. Works on two module namespaces, so it runs on the built ESM and
// CommonJS files (scripts/two-copies.mjs) and on two loads of the source in tests.

const BRAND_PREFIX = 'javascript-collections-framework/'

/** The minimum the check must find, so a broken discovery cannot pass by finding nothing. */
export const MINIMUM_CLASSES = 14
export const REQUIRED_GUARDS = [
  'isCollection',
  'isSequencedCollection',
  'isList',
  'isQueue',
  'isDeque',
  'isSetCollection',
  'isSortedSet',
]

/**
 * Values made by one copy that every guard of the other copy must accept: an `ArrayList`, one of
 * its sub-lists and its reversed view.
 * @param {Namespace} copy
 * @returns {unknown[]}
 */
function lists(copy) {
  const ArrayList = /** @type {new (elements?: Iterable<unknown>) => any} */ (copy.ArrayList)
  const list = new ArrayList([1, 2, 3])
  return [list, list.subList(0, 2), list.reversed()]
}

/**
 * An `ArrayDeque` made by one copy and its reversed view.
 * @param {Namespace} copy
 * @returns {unknown[]}
 */
function deques(copy) {
  const ArrayDeque = /** @type {new (elements?: Iterable<unknown>) => any} */ (copy.ArrayDeque)
  const deque = new ArrayDeque([1, 2, 3])
  return [deque, deque.reversed()]
}

/**
 * A `LinkedList` made by one copy and its reversed view.
 * @param {Namespace} copy
 * @returns {unknown[]}
 */
function linkedLists(copy) {
  const LinkedList = /** @type {new (elements?: Iterable<unknown>) => any} */ (copy.LinkedList)
  const list = new LinkedList([1, 2, 3])
  return [list, list.reversed()]
}

/**
 * Every deque made by a copy: an `ArrayDeque`, a `LinkedList` and their reversed views.
 * @param {Namespace} copy
 * @returns {unknown[]}
 */
function allDeques(copy) {
  return [...deques(copy), ...linkedLists(copy)]
}

/**
 * A `HashSet` made by one copy on each of its three paths: default, `key` and `equivalence`.
 * @param {Namespace} copy
 * @returns {unknown[]}
 */
function hashSets(copy) {
  const HashSet = /** @type {new (elements?: Iterable<unknown>, options?: object) => any} */ (
    copy.HashSet
  )
  return [
    new HashSet([1, 2, 3]),
    new HashSet([1, 2, 3], { key: (/** @type {unknown} */ value) => value }),
    new HashSet([1, 2, 3], { equivalence: copy.valueEquivalence }),
  ]
}

/**
 * A `PriorityQueue` made by one copy.
 * @param {Namespace} copy
 * @returns {unknown[]}
 */
function priorityQueues(copy) {
  const PriorityQueue = /** @type {new (elements?: Iterable<unknown>) => any} */ (
    copy.PriorityQueue
  )
  return [new PriorityQueue([3, 1, 2])]
}

/**
 * A `TreeSet` made by one copy, one of its range views and its reversed view.
 * @param {Namespace} copy
 * @returns {unknown[]}
 */
function treeSets(copy) {
  const TreeSet = /** @type {new (elements?: Iterable<unknown>) => any} */ (copy.TreeSet)
  const set = new TreeSet([1, 2, 3])
  return [set, set.subSet(1, 3), set.reversed()]
}

/** Guard name → the values from a copy that the other copy's guard must accept. */
export const SAMPLES = {
  isCollection: (/** @type {Namespace} */ copy) => [
    ...lists(copy),
    ...allDeques(copy),
    ...hashSets(copy),
    ...priorityQueues(copy),
    ...treeSets(copy),
  ],
  isSequencedCollection: (/** @type {Namespace} */ copy) => [
    ...lists(copy),
    ...allDeques(copy),
    ...treeSets(copy),
  ],
  isList: lists,
  isQueue: (/** @type {Namespace} */ copy) => [...allDeques(copy), ...priorityQueues(copy)],
  isDeque: allDeques,
  isSetCollection: (/** @type {Namespace} */ copy) => [...hashSets(copy), ...treeSets(copy)],
  isSortedSet: treeSets,
}

/**
 * Whether a list of copy `to` refuses a node handle of a list of copy `from`, changing nothing.
 * @param {Namespace} from
 * @param {Namespace} to
 * @returns {boolean}
 */
function refusesForeignHandle(from, to) {
  const From = /** @type {new (elements?: Iterable<unknown>) => any} */ (from.LinkedList)
  const To = /** @type {new (elements?: Iterable<unknown>) => any} */ (to.LinkedList)
  const IllegalArgumentError = /** @type {Constructor} */ (to.IllegalArgumentError)
  const handle = new From([1]).firstNode()
  const list = new To([1, 2])
  for (const call of [
    () => list.insertBefore(handle, 0),
    () => list.insertAfter(handle, 0),
    () => list.removeNode(handle),
  ]) {
    try {
      call()
      return false
    } catch (error) {
      if (!(error instanceof IllegalArgumentError)) return false
    }
  }
  return list.size === 2
}

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
 * @param {Record<string, (copy: Namespace) => unknown[]>} [samples] guard name → values from a copy
 * @returns {{ ok: boolean, lines: string[], failures: string[] }}
 */
export function checkTwoCopies(a, b, samples = SAMPLES) {
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
    const sample = Object.hasOwn(samples, name) ? samples[name] : undefined
    if (sample !== undefined) {
      /** @type {[unknown[], unknown[]]} */
      let values
      try {
        values = [sample(a), sample(b)]
      } catch (error) {
        failures.push(`${name}: could not build sample values (${String(error)})`)
        continue
      }
      for (const value of values[0]) {
        expect(guardB(value), `${name}: copy B refuses a value from copy A (${String(value)})`)
      }
      for (const value of values[1]) {
        expect(guardA(value), `${name}: copy A refuses a value from copy B (${String(value)})`)
      }
      lines.push(`${name}: recognised across copies; major 2 refused`)
    } else {
      failures.push(`${name}: no sample value to check across copies — add one`)
    }
  }

  if (a.LinkedList !== undefined && b.LinkedList !== undefined) {
    expect(refusesForeignHandle(a, b), 'LinkedList: copy B accepts a node handle from copy A')
    expect(refusesForeignHandle(b, a), 'LinkedList: copy A accepts a node handle from copy B')
    lines.push('LinkedList: node handles refused across copies')
  }

  lines.push(
    `two copies: ${classes.length} classes, ${found.length} guards — ${failures.length === 0 ? 'ok' : `${failures.length} failed`}`,
  )
  return { ok: failures.length === 0, lines, failures }
}

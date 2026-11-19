// The browser smoke check: every collection class is built, filled, read, iterated and written as
// JSON, and every error class is constructed and checked against itself and its native parent. It
// uses no Node.js API, so the same function runs in Node.js, from an ES module bundle and from the
// IIFE build's `window.JCF`.

/** The collection classes the check builds, by name. */
export const COLLECTIONS = [
  'ArrayList',
  'LinkedList',
  'ArrayDeque',
  'PriorityQueue',
  'HashSet',
  'LinkedHashSet',
  'TreeSet',
  'HashMap',
  'LinkedHashMap',
  'TreeMap',
]

const NATIVE_ERRORS = [Error, TypeError, RangeError, SyntaxError, ReferenceError, EvalError, URIError]

function check(condition, message) {
  if (!condition) throw new Error(`smoke: ${message}`)
}

function same(actual, expected, message) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  check(a === e, `${message}: expected ${e}, got ${a}`)
}

/** What each class is built from, and how its contents read back. */
const CHECKS = {
  ArrayList: (C) => {
    const list = new C([3, 1])
    list.add(2)
    same(list.get(2), 2, 'ArrayList.get')
    return list
  },
  LinkedList: (C) => {
    const list = new C([3, 1])
    list.add(2)
    same(list.getLast(), 2, 'LinkedList.getLast')
    return list
  },
  ArrayDeque: (C) => {
    const deque = new C([3, 1])
    deque.push(2)
    same(deque.getFirst(), 3, 'ArrayDeque.getFirst')
    return deque
  },
  PriorityQueue: (C) => {
    const queue = new C([3, 2])
    queue.add(1)
    same(queue.peek(), 1, 'PriorityQueue.peek')
    return queue
  },
  HashSet: (C) => {
    const set = new C([3, 1])
    set.add(2).add(1)
    check(set.has(2) && !set.has(4), 'HashSet.has')
    return set
  },
  LinkedHashSet: (C) => {
    const set = new C([3, 1])
    set.add(2).add(1)
    check(set.has(2) && !set.has(4), 'LinkedHashSet.has')
    return set
  },
  TreeSet: (C) => {
    const set = new C([3, 1])
    set.add(2).add(1)
    same(set.getFirst(), 1, 'TreeSet.getFirst')
    return set
  },
  HashMap: (C) => {
    const map = new C([[3, 'c']])
    map.set(1, 'a').set(2, 'b')
    same(map.get(2), 'b', 'HashMap.get')
    return map
  },
  LinkedHashMap: (C) => {
    const map = new C([[3, 'c']])
    map.set(1, 'a').set(2, 'b')
    same(map.get(2), 'b', 'LinkedHashMap.get')
    return map
  },
  TreeMap: (C) => {
    const map = new C([[3, 'c']])
    map.set(1, 'a').set(2, 'b')
    same(map.get(2), 'b', 'TreeMap.get')
    return map
  },
}

/** The contents each class iterates and writes as JSON after its check. */
const CONTENTS = {
  ArrayList: [3, 1, 2],
  LinkedList: [3, 1, 2],
  ArrayDeque: [3, 1, 2],
  PriorityQueue: [1, 2, 3], // heap order is unspecified: compared sorted
  HashSet: [3, 1, 2],
  LinkedHashSet: [3, 1, 2],
  TreeSet: [1, 2, 3],
  HashMap: [
    [3, 'c'],
    [1, 'a'],
    [2, 'b'],
  ],
  LinkedHashMap: [
    [3, 'c'],
    [1, 'a'],
    [2, 'b'],
  ],
  TreeMap: [
    [1, 'a'],
    [2, 'b'],
    [3, 'c'],
  ],
}

/**
 * Runs the smoke check on the library's exports; returns how many collection and error classes it
 * checked. Throws on the first failure, and when the library exports a collection or error class
 * the check does not cover.
 */
export function smoke(lib) {
  for (const name of COLLECTIONS) {
    const C = lib[name]
    check(typeof C === 'function', `${name} is not exported`)
    const collection = CHECKS[name](C)
    let items = [...collection]
    let json = JSON.parse(JSON.stringify(collection))
    if (name === 'PriorityQueue') {
      items = items.sort((a, b) => a - b)
      json = json.sort((a, b) => a - b)
    }
    same(items, CONTENTS[name], `${name} iteration`)
    same(json, CONTENTS[name], `${name} JSON`)
    check(collection instanceof C, `${name} instanceof`)
  }

  const errors = Object.keys(lib).filter((name) => name.endsWith('Error'))
  for (const name of errors) {
    const E = lib[name]
    const parent = Object.getPrototypeOf(E)
    check(NATIVE_ERRORS.includes(parent), `${name} does not extend a native error class`)
    const error = new E('message')
    check(error instanceof E, `${name}: instanceof itself`)
    check(error instanceof parent, `${name}: instanceof ${parent.name}`)
    check(error instanceof Error, `${name}: instanceof Error`)
    same(error.message, 'message', `${name} message`)
  }

  const classes = Object.keys(lib).filter(
    (name) => /^[A-Z]/.test(name) && typeof lib[name] === 'function' && !name.endsWith('Error'),
  )
  check(
    classes.length === COLLECTIONS.length,
    `${classes.length} collection classes are exported, the check covers ${COLLECTIONS.length}: ${classes.join(', ')}`,
  )
  check(errors.length > 0, 'no error class is exported')
  return { collections: COLLECTIONS.length, errors: errors.length }
}

// A B+ tree sorted map, built only to compare with the balanced binary tree behind `TreeMap`. It is
// never exported from the package. It does the same per-operation bookkeeping as the library's
// tree, so the comparison measures the shape of the tree and not missing checks: every comparison
// result is checked, every search finishes before anything is written, every structural change
// counts as a modification, and iterators fail when the map changes under them.

/** Keys per node; a node below half of it borrows from or merges with a sibling. */
const MAX = 32
const MIN = MAX >> 1

/** @template K, V */
class Leaf {
  constructor() {
    /** @type {K[]} */ this.keys = []
    /** @type {V[]} */ this.values = []
    /** @type {Leaf<K, V> | null} */ this.next = null
    /** @type {Leaf<K, V> | null} */ this.prev = null
  }
}

/** @template K, V */
class Inner {
  constructor() {
    /** Separator `keys[i]` is greater than every key under `children[i]` and at most every key under `children[i + 1]`. @type {K[]} */
    this.keys = []
    /** @type {Array<Leaf<K, V> | Inner<K, V>>} */ this.children = []
  }
}

/**
 * The natural order of numbers and strings.
 * @param {unknown} a
 * @param {unknown} b
 * @returns {number}
 */
function natural(a, b) {
  // @ts-expect-error: compared as the language compares them.
  return a < b ? -1 : a > b ? 1 : 0
}

/** @template K, V */
export class BPlusTreeMap {
  /**
   * @param {Iterable<readonly [K, V]>} [entries]
   * @param {{ comparator?: (a: K, b: K) => number }} [options]
   */
  constructor(entries, options = {}) {
    /** @type {(a: K, b: K) => number} */
    this.comparator = options.comparator ?? natural
    /** @type {Leaf<K, V> | Inner<K, V>} */
    this.root = new Leaf()
    /** @type {Leaf<K, V>} */
    this.head = /** @type {Leaf<K, V>} */ (this.root)
    this.size = 0
    this.revision = 0
    if (entries !== undefined) for (const [k, v] of entries) this.set(k, v)
  }

  /**
   * -1, 0 or 1, checked: a comparator that returns anything else throws before anything changes.
   * @param {K} a
   * @param {K} b
   */
  compare(a, b) {
    const r = this.comparator(a, b)
    if (typeof r !== 'number' || Number.isNaN(r))
      throw new TypeError('BPlusTreeMap: the comparator returned a non-number')
    return r < 0 ? -1 : r > 0 ? 1 : 0
  }

  /** First index whose key is not less than `key`. @param {K[]} keys @param {K} key */
  lower(keys, key) {
    let lo = 0
    let hi = keys.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (this.compare(/** @type {K} */ (keys[mid]), key) < 0) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  /** First index whose key is greater than `key`. @param {K[]} keys @param {K} key */
  upper(keys, key) {
    let lo = 0
    let hi = keys.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (this.compare(/** @type {K} */ (keys[mid]), key) <= 0) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  /**
   * The leaf where `key` belongs, and the inner nodes above it with the child index taken.
   * @param {K} key
   * @returns {{ leaf: Leaf<K, V>, path: Array<[Inner<K, V>, number]> }}
   */
  descend(key) {
    /** @type {Array<[Inner<K, V>, number]>} */
    const path = []
    let node = this.root
    while (node instanceof Inner) {
      const i = this.upper(node.keys, key)
      path.push([node, i])
      node = /** @type {Leaf<K, V> | Inner<K, V>} */ (node.children[i])
    }
    return { leaf: node, path }
  }

  /** @param {K} key @returns {V | undefined} */
  get(key) {
    const { leaf } = this.descend(key)
    const i = this.lower(leaf.keys, key)
    return i < leaf.keys.length && this.compare(/** @type {K} */ (leaf.keys[i]), key) === 0
      ? leaf.values[i]
      : undefined
  }

  /** @param {K} key */
  has(key) {
    const { leaf } = this.descend(key)
    const i = this.lower(leaf.keys, key)
    return i < leaf.keys.length && this.compare(/** @type {K} */ (leaf.keys[i]), key) === 0
  }

  /** @param {K} key @param {V} value */
  set(key, value) {
    const { leaf, path } = this.descend(key)
    const i = this.lower(leaf.keys, key)
    if (i < leaf.keys.length && this.compare(/** @type {K} */ (leaf.keys[i]), key) === 0) {
      leaf.values[i] = value
      return this
    }
    leaf.keys.splice(i, 0, key)
    leaf.values.splice(i, 0, value)
    this.size++
    this.revision++
    if (leaf.keys.length > MAX) this.split(leaf, path)
    return this
  }

  /** @param {Leaf<K, V>} leaf @param {Array<[Inner<K, V>, number]>} path */
  split(leaf, path) {
    const right = /** @type {Leaf<K, V>} */ (new Leaf())
    const half = leaf.keys.length >> 1
    right.keys = leaf.keys.splice(half)
    right.values = leaf.values.splice(half)
    right.next = leaf.next
    if (right.next !== null) right.next.prev = right
    right.prev = leaf
    leaf.next = right
    /** @type {K} */
    let separator = /** @type {K} */ (right.keys[0])
    /** @type {Leaf<K, V> | Inner<K, V>} */
    let added = right
    for (;;) {
      const top = path.pop()
      if (top === undefined) {
        const root = /** @type {Inner<K, V>} */ (new Inner())
        root.keys = [separator]
        root.children = [this.root, added]
        this.root = root
        return
      }
      const [parent, at] = top
      parent.keys.splice(at, 0, separator)
      parent.children.splice(at + 1, 0, added)
      if (parent.keys.length <= MAX) return
      const mid = parent.keys.length >> 1
      const sibling = /** @type {Inner<K, V>} */ (new Inner())
      separator = /** @type {K} */ (parent.keys[mid])
      sibling.keys = parent.keys.splice(mid + 1)
      parent.keys.length = mid
      sibling.children = parent.children.splice(mid + 1)
      added = sibling
    }
  }

  /** @param {K} key */
  delete(key) {
    const { leaf, path } = this.descend(key)
    const i = this.lower(leaf.keys, key)
    if (i >= leaf.keys.length || this.compare(/** @type {K} */ (leaf.keys[i]), key) !== 0)
      return false
    leaf.keys.splice(i, 1)
    leaf.values.splice(i, 1)
    this.size--
    this.revision++
    this.rebalance(leaf, path)
    return true
  }

  /** @param {Leaf<K, V> | Inner<K, V>} start @param {Array<[Inner<K, V>, number]>} path */
  rebalance(start, path) {
    let node = start
    for (;;) {
      const top = path.pop()
      if (top === undefined) {
        if (node instanceof Inner && node.children.length === 1)
          this.root = /** @type {Leaf<K, V> | Inner<K, V>} */ (node.children[0])
        return
      }
      if (node.keys.length >= MIN) return
      const [parent, i] = top
      const left = i > 0 ? parent.children[i - 1] : undefined
      const right = parent.children[i + 1]
      if (node instanceof Leaf) {
        const l = /** @type {Leaf<K, V> | undefined} */ (left)
        const r = /** @type {Leaf<K, V> | undefined} */ (right)
        if (l !== undefined && l.keys.length > MIN) {
          node.keys.unshift(/** @type {K} */ (l.keys.pop()))
          node.values.unshift(/** @type {V} */ (l.values.pop()))
          parent.keys[i - 1] = /** @type {K} */ (node.keys[0])
          return
        }
        if (r !== undefined && r.keys.length > MIN) {
          node.keys.push(/** @type {K} */ (r.keys.shift()))
          node.values.push(/** @type {V} */ (r.values.shift()))
          parent.keys[i] = /** @type {K} */ (r.keys[0])
          return
        }
        if (l !== undefined) {
          l.keys.push(...node.keys)
          l.values.push(...node.values)
          l.next = node.next
          if (node.next !== null) node.next.prev = l
          parent.keys.splice(i - 1, 1)
          parent.children.splice(i, 1)
        } else if (r !== undefined) {
          node.keys.push(...r.keys)
          node.values.push(...r.values)
          node.next = r.next
          if (r.next !== null) r.next.prev = node
          parent.keys.splice(i, 1)
          parent.children.splice(i + 1, 1)
        }
      } else {
        const l = /** @type {Inner<K, V> | undefined} */ (left)
        const r = /** @type {Inner<K, V> | undefined} */ (right)
        if (l !== undefined && l.keys.length > MIN) {
          node.keys.unshift(/** @type {K} */ (parent.keys[i - 1]))
          node.children.unshift(/** @type {Leaf<K, V> | Inner<K, V>} */ (l.children.pop()))
          parent.keys[i - 1] = /** @type {K} */ (l.keys.pop())
          return
        }
        if (r !== undefined && r.keys.length > MIN) {
          node.keys.push(/** @type {K} */ (parent.keys[i]))
          node.children.push(/** @type {Leaf<K, V> | Inner<K, V>} */ (r.children.shift()))
          parent.keys[i] = /** @type {K} */ (r.keys.shift())
          return
        }
        if (l !== undefined) {
          l.keys.push(/** @type {K} */ (parent.keys[i - 1]), ...node.keys)
          l.children.push(...node.children)
          parent.keys.splice(i - 1, 1)
          parent.children.splice(i, 1)
        } else if (r !== undefined) {
          node.keys.push(/** @type {K} */ (parent.keys[i]), ...r.keys)
          node.children.push(...r.children)
          parent.keys.splice(i, 1)
          parent.children.splice(i + 1, 1)
        }
      }
      node = parent
    }
  }

  /** The greatest key at or below `key`. @param {K} key @returns {K | undefined} */
  floorKey(key) {
    const { leaf } = this.descend(key)
    const i = this.upper(leaf.keys, key) - 1
    if (i >= 0) return leaf.keys[i]
    const prev = leaf.prev
    return prev === null ? undefined : prev.keys[prev.keys.length - 1]
  }

  /** The least key at or above `key`. @param {K} key @returns {K | undefined} */
  ceilingKey(key) {
    const { leaf } = this.descend(key)
    const i = this.lower(leaf.keys, key)
    if (i < leaf.keys.length) return leaf.keys[i]
    return leaf.next === null ? undefined : leaf.next.keys[0]
  }

  /** @returns {K | undefined} */
  firstKey() {
    return this.head.keys[0]
  }

  /** @returns {Iterator<[K, V]>} */
  [Symbol.iterator]() {
    return new EntryIterator(this)
  }
}

/** @template K, V */
class EntryIterator {
  /** @param {BPlusTreeMap<K, V>} map */
  constructor(map) {
    this.map = map
    this.expected = map.revision
    /** @type {Leaf<K, V> | null} */
    this.leaf = map.head
    this.index = 0
  }

  /** @returns {IteratorResult<[K, V]>} */
  next() {
    if (this.map.revision !== this.expected)
      throw new Error('BPlusTreeMap: changed during iteration')
    while (this.leaf !== null && this.index >= this.leaf.keys.length) {
      this.leaf = this.leaf.next
      this.index = 0
    }
    if (this.leaf === null) return { done: true, value: undefined }
    const i = this.index++
    return {
      done: false,
      value: [/** @type {K} */ (this.leaf.keys[i]), /** @type {V} */ (this.leaf.values[i])],
    }
  }

  [Symbol.iterator]() {
    return this
  }
}

// The ordered tree behind `TreeSet` and `TreeMap`: an iterative red-black tree with parent pointers. Nothing here
// recurses, so the depth of the call stack never grows with the size of the tree.
//
// Every operation finds first and writes after: a descent from the root makes all the comparisons
// an operation needs, and only then is a node linked or unlinked. Rebalancing (rotations and
// recolouring) and removal never compare, so a comparator that throws, returns an invalid result
// or changes the tree leaves it exactly as it was. Removal moves nodes rather than values, so a
// node keeps its value for as long as it is in the tree and cursors can hold on to nodes.

import { ConcurrentModificationError } from '../../errors/errors'
import type { Comparator } from '../../functions/comparators'
import type { Cursor } from '../../interfaces/collection'
import { guardedCompare } from '../compare'
import { done, FailFastCursor, FailFastIterator } from '../iteration'
import { compareNatural, compareNaturalOrAbsent } from '../natural-order'
import type { ChangeCounter } from '../revision'

/** What a lenient comparison returns when, in natural order, the values cannot be compared. */
export const ABSENT = 2

/** -1, 0 or 1, or `ABSENT`. */
export type Comparison = -1 | 0 | 1 | typeof ABSENT

/**
 * Where a value belongs in the tree: the node that compares equal to it, or else the parent a new
 * node hangs from (`null` for the root) and on which side.
 *
 * @internal
 */
export interface Place<E> {
  readonly node: TreeNode<E> | null
  readonly parent: TreeNode<E> | null
  readonly left: boolean
}

/**
 * Returns a function that orders values in the reverse of `order` (natural order when
 * `undefined`).
 *
 * @internal
 */
export function reversing<E>(order: Comparator<E> | undefined): Comparator<E> {
  return order === undefined
    ? (a: E, b: E) => compareNatural(b, a, 'naturalOrder')
    : (a: E, b: E) => order(b, a)
}

/**
 * A node of the tree.
 *
 * @internal
 */
export class TreeNode<E> {
  value: E
  left: TreeNode<E> | null = null
  right: TreeNode<E> | null = null
  parent: TreeNode<E> | null = null
  red = true

  constructor(value: E) {
    this.value = value
  }
}

function isRed<E>(node: TreeNode<E> | null): boolean {
  return node === null ? false : node.red
}

/** The leftmost node under `node`. */
function leftmost<E>(node: TreeNode<E>): TreeNode<E> {
  let n = node
  while (n.left !== null) n = n.left
  return n
}

/** The rightmost node under `node`. */
function rightmost<E>(node: TreeNode<E>): TreeNode<E> {
  let n = node
  while (n.right !== null) n = n.right
  return n
}

/**
 * The node after `node` in ascending order, or `null`.
 *
 * @internal
 */
export function successor<E>(node: TreeNode<E>): TreeNode<E> | null {
  if (node.right !== null) return leftmost(node.right)
  let child = node
  let parent = node.parent
  while (parent !== null && child === parent.right) {
    child = parent
    parent = parent.parent
  }
  return parent
}

/**
 * The node before `node` in ascending order, or `null`.
 *
 * @internal
 */
export function predecessor<E>(node: TreeNode<E>): TreeNode<E> | null {
  if (node.left !== null) return rightmost(node.left)
  let child = node
  let parent = node.parent
  while (parent !== null && child === parent.left) {
    child = parent
    parent = parent.parent
  }
  return parent
}

/** The level whose nodes are red when `size` sorted values are built into a balanced tree. */
function redLevel(size: number): number {
  let level = 0
  for (let m = size - 1; m >= 0; m = Math.floor(m / 2) - 1) level++
  return level
}

/** A pending piece of the bottom-up build: values `lo..hi` hang under `parent` on one side. */
interface BuildFrame<E> {
  readonly lo: number
  readonly hi: number
  readonly level: number
  readonly parent: TreeNode<E> | null
  readonly left: boolean
}

/** A pending piece of a copy: `source`'s subtree is cloned under `parent` on one side. */
interface CopyFrame<E> {
  readonly source: TreeNode<E>
  readonly parent: TreeNode<E> | null
  readonly left: boolean
}

/**
 * A red-black tree of distinct values (distinct under its order) with parent pointers. It records
 * no changes itself: the collections that use it record each change in `changes` after it is made.
 *
 * @internal
 */
export class OrderedTree<E> {
  root: TreeNode<E> | null = null
  /** The number of nodes. */
  count = 0
  /** The comparator, or `undefined` for natural order. */
  readonly order: Comparator<E> | undefined
  /** The change counter of the collection the tree belongs to, shared with its views. */
  readonly changes: ChangeCounter
  /** What the collection is called in messages: `set` or `map`. */
  private readonly noun: string

  constructor(order: Comparator<E> | undefined, changes: ChangeCounter, noun = 'set') {
    this.order = order
    this.changes = changes
    this.noun = noun
  }

  // ── Comparing ──

  /**
   * Compares `a` with `b` under the tree's order, then checks that the call did not add or remove
   * members: `expected` is the structure count when the outer operation started.
   */
  compare(a: E, b: E, where: string, expected: number): -1 | 0 | 1 {
    const result =
      this.order === undefined
        ? compareNatural(a, b, where)
        : guardedCompare(this.order, a, b, where)
    this.checkStructure(where, expected)
    return result
  }

  /**
   * As `compare`, but in natural order a value that cannot be compared (`null`, `undefined`, no
   * natural order, another kind) gives `ABSENT` instead of an error. Errors from a comparator or a
   * `[compareSymbol]` method still propagate.
   */
  compareLenient(a: E, b: E, where: string, expected: number): Comparison {
    if (this.order !== undefined) return this.compare(a, b, where, expected)
    const result = compareNaturalOrAbsent(a, b, where)
    this.checkStructure(where, expected)
    return result === undefined ? ABSENT : result
  }

  private checkStructure(where: string, expected: number): void {
    if (this.changes.structure !== expected) {
      throw new ConcurrentModificationError(
        `${where}: the ${this.noun} was changed by the comparator`,
      )
    }
  }

  /**
   * Compares `value` with a member (or with itself when the tree is empty), so in natural order a
   * value that cannot join the tree is refused before anything changes.
   */
  checkNatural(value: E, where: string, expected: number): void {
    const other = this.root === null ? value : this.root.value
    this.compare(value, other, where, expected)
  }

  // ── Finding ──

  /** The least node, or `null`. No comparisons. */
  first(): TreeNode<E> | null {
    return this.root === null ? null : leftmost(this.root)
  }

  /** The greatest node, or `null`. No comparisons. */
  last(): TreeNode<E> | null {
    return this.root === null ? null : rightmost(this.root)
  }

  /**
   * The node whose value compares equal to `value`, or `null`; one comparison per level. With
   * `lenient`, a value natural order cannot compare is not found instead of refused.
   */
  find(value: E, where: string, expected: number, lenient: boolean): TreeNode<E> | null {
    let node = this.root
    while (node !== null) {
      const c = lenient
        ? this.compareLenient(value, node.value, where, expected)
        : this.compare(value, node.value, where, expected)
      if (c === ABSENT) return null
      if (c === 0) return node
      node = c < 0 ? node.left : node.right
    }
    return null
  }

  /**
   * The greatest node before `value` (`below`) or the least node after it, counting a node equal to
   * `value` when `inclusive`; one comparison per level.
   */
  nearest(
    value: E,
    below: boolean,
    inclusive: boolean,
    where: string,
    expected: number,
  ): TreeNode<E> | null {
    let node = this.root
    let best: TreeNode<E> | null = null
    while (node !== null) {
      const c = this.compare(value, node.value, where, expected)
      if (c === 0 && inclusive) return node
      if (below) {
        if (c > 0) {
          best = node
          node = node.right
        } else {
          node = node.left
        }
      } else if (c < 0) {
        best = node
        node = node.left
      } else {
        node = node.right
      }
    }
    return best
  }

  // ── Adding ──

  /**
   * Adds `value` unless a node compares equal to it; returns whether it was added. In natural
   * order, a value added to an empty tree is compared with itself first.
   */
  insert(value: E, where: string, expected: number): boolean {
    const place = this.locate(value, where, expected)
    if (place.node !== null) return false
    this.link(new TreeNode(value), place)
    return true
  }

  /**
   * Finds where `value` belongs, making every comparison an insertion needs: the node equal to it,
   * or where a new node would hang. In natural order, a value meeting an empty tree is compared
   * with itself.
   */
  locate(value: E, where: string, expected: number): Place<E> {
    let parent: TreeNode<E> | null = null
    let c: -1 | 0 | 1 = 0
    let node = this.root
    if (node === null && this.order === undefined) this.compare(value, value, where, expected)
    while (node !== null) {
      c = this.compare(value, node.value, where, expected)
      if (c === 0) return { node, parent: null, left: false }
      parent = node
      node = c < 0 ? node.left : node.right
    }
    return { node: null, parent, left: c < 0 }
  }

  /**
   * Links the new node `added` at `place` (found by `locate` with no change since) and
   * rebalances. No comparisons, so nothing here can fail.
   */
  link(added: TreeNode<E>, place: Place<E>): void {
    const parent = place.parent
    added.parent = parent
    if (parent === null) this.root = added
    else if (place.left) parent.left = added
    else parent.right = added
    this.count++
    this.fixAfterInsert(added)
  }

  /**
   * Fills an empty tree with `values`, which must be in strictly ascending order, as a balanced
   * tree. No comparisons. `make(index)` makes the node of `values[index]`; a plain node by
   * default.
   */
  buildSorted(values: readonly E[], make?: (index: number) => TreeNode<E>): void {
    const size = values.length
    if (size === 0) return
    const red = redLevel(size)
    const stack: BuildFrame<E>[] = [{ lo: 0, hi: size - 1, level: 0, parent: null, left: false }]
    while (stack.length > 0) {
      const frame = stack.pop() as BuildFrame<E>
      if (frame.hi < frame.lo) continue
      const mid = (frame.lo + frame.hi) >>> 1
      const node = make === undefined ? new TreeNode(values[mid] as E) : make(mid)
      node.red = frame.level === red
      node.parent = frame.parent
      if (frame.parent === null) this.root = node
      else if (frame.left) frame.parent.left = node
      else frame.parent.right = node
      const level = frame.level + 1
      stack.push({ lo: frame.lo, hi: mid - 1, level, parent: node, left: true })
      stack.push({ lo: mid + 1, hi: frame.hi, level, parent: node, left: false })
    }
    this.count = size
  }

  /**
   * Fills an empty tree with a node-for-node copy of `source`'s tree. No comparisons.
   * `clone(node)` makes the copy of a node; a plain node with the same value by default.
   */
  copyFrom(source: OrderedTree<E>, clone?: (node: TreeNode<E>) => TreeNode<E>): void {
    if (source.root === null) return
    const stack: CopyFrame<E>[] = [{ source: source.root, parent: null, left: false }]
    while (stack.length > 0) {
      const frame = stack.pop() as CopyFrame<E>
      const from = frame.source
      const node = clone === undefined ? new TreeNode(from.value) : clone(from)
      node.red = from.red
      node.parent = frame.parent
      if (frame.parent === null) this.root = node
      else if (frame.left) frame.parent.left = node
      else frame.parent.right = node
      if (from.left !== null) stack.push({ source: from.left, parent: node, left: true })
      if (from.right !== null) stack.push({ source: from.right, parent: node, left: false })
    }
    this.count = source.count
  }

  // ── Removing ──

  /** Removes every node. */
  clear(): void {
    this.root = null
    this.count = 0
  }

  /**
   * Unlinks `node` and rebalances. No comparisons. A node with two children is replaced by its
   * successor node, which moves with its value, so every other node keeps its value.
   */
  remove(node: TreeNode<E>): void {
    let removedRed = node.red
    let child: TreeNode<E> | null
    let childParent: TreeNode<E> | null
    if (node.left === null) {
      child = node.right
      childParent = node.parent
      this.transplant(node, node.right)
    } else if (node.right === null) {
      child = node.left
      childParent = node.parent
      this.transplant(node, node.left)
    } else {
      const next = leftmost(node.right)
      removedRed = next.red
      child = next.right
      if (next.parent === node) {
        childParent = next
      } else {
        childParent = next.parent
        this.transplant(next, next.right)
        next.right = node.right
        next.right.parent = next
      }
      this.transplant(node, next)
      next.left = node.left
      next.left.parent = next
      next.red = node.red
    }
    node.left = null
    node.right = null
    node.parent = null
    this.count--
    if (!removedRed) this.fixAfterRemove(child, childParent)
  }

  // ── Rebalancing (no comparisons) ──

  /** Puts `replacement` where `node` hangs from its parent. */
  private transplant(node: TreeNode<E>, replacement: TreeNode<E> | null): void {
    const parent = node.parent
    if (parent === null) this.root = replacement
    else if (node === parent.left) parent.left = replacement
    else parent.right = replacement
    if (replacement !== null) replacement.parent = parent
  }

  private rotateLeft(node: TreeNode<E>): void {
    const pivot = node.right as TreeNode<E>
    node.right = pivot.left
    if (pivot.left !== null) pivot.left.parent = node
    this.transplant(node, pivot)
    pivot.left = node
    node.parent = pivot
  }

  private rotateRight(node: TreeNode<E>): void {
    const pivot = node.left as TreeNode<E>
    node.left = pivot.right
    if (pivot.right !== null) pivot.right.parent = node
    this.transplant(node, pivot)
    pivot.right = node
    node.parent = pivot
  }

  private fixAfterInsert(added: TreeNode<E>): void {
    let node = added
    while (isRed(node.parent)) {
      let parent = node.parent as TreeNode<E>
      // A red parent is never the root, so the grandparent exists.
      const grand = parent.parent as TreeNode<E>
      if (parent === grand.left) {
        const uncle = grand.right
        if (isRed(uncle)) {
          parent.red = false
          ;(uncle as TreeNode<E>).red = false
          grand.red = true
          node = grand
        } else {
          if (node === parent.right) {
            node = parent
            this.rotateLeft(node)
            parent = node.parent as TreeNode<E>
          }
          parent.red = false
          grand.red = true
          this.rotateRight(grand)
        }
      } else {
        const uncle = grand.left
        if (isRed(uncle)) {
          parent.red = false
          ;(uncle as TreeNode<E>).red = false
          grand.red = true
          node = grand
        } else {
          if (node === parent.left) {
            node = parent
            this.rotateRight(node)
            parent = node.parent as TreeNode<E>
          }
          parent.red = false
          grand.red = true
          this.rotateLeft(grand)
        }
      }
    }
    ;(this.root as TreeNode<E>).red = false
  }

  /**
   * Restores the black heights after a black node was removed: `node` (possibly `null`) carries an
   * extra black and hangs under `parent`.
   */
  private fixAfterRemove(start: TreeNode<E> | null, startParent: TreeNode<E> | null): void {
    let node = start
    let parent = startParent
    while (node !== this.root && !isRed(node) && parent !== null) {
      if (node === parent.left) {
        // The sibling of a doubly black node always exists.
        let sibling = parent.right as TreeNode<E>
        if (sibling.red) {
          sibling.red = false
          parent.red = true
          this.rotateLeft(parent)
          sibling = parent.right as TreeNode<E>
        }
        if (!isRed(sibling.left) && !isRed(sibling.right)) {
          sibling.red = true
          node = parent
          parent = node.parent
        } else {
          if (!isRed(sibling.right)) {
            ;(sibling.left as TreeNode<E>).red = false
            sibling.red = true
            this.rotateRight(sibling)
            sibling = parent.right as TreeNode<E>
          }
          sibling.red = parent.red
          parent.red = false
          ;(sibling.right as TreeNode<E>).red = false
          this.rotateLeft(parent)
          node = this.root
          parent = null
        }
      } else {
        let sibling = parent.left as TreeNode<E>
        if (sibling.red) {
          sibling.red = false
          parent.red = true
          this.rotateRight(parent)
          sibling = parent.left as TreeNode<E>
        }
        if (!isRed(sibling.left) && !isRed(sibling.right)) {
          sibling.red = true
          node = parent
          parent = node.parent
        } else {
          if (!isRed(sibling.left)) {
            ;(sibling.right as TreeNode<E>).red = false
            sibling.red = true
            this.rotateLeft(sibling)
            sibling = parent.left as TreeNode<E>
          }
          sibling.red = parent.red
          parent.red = false
          ;(sibling.left as TreeNode<E>).red = false
          this.rotateRight(parent)
          node = this.root
          parent = null
        }
      }
    }
    if (node !== null) node.red = false
  }
}

/**
 * A fail-fast iterator over the nodes from `start` up to, but not including, `end`, in ascending
 * order or, when `descending`, in descending order. It yields `project(node)`: the node's value
 * by default.
 *
 * @internal
 */
export class TreeIterator<E, T = E> extends FailFastIterator<T> {
  private node: TreeNode<E> | null
  private readonly end: TreeNode<E> | null
  private readonly descending: boolean
  private readonly project: ((node: TreeNode<E>) => T) | undefined

  constructor(
    start: TreeNode<E> | null,
    end: TreeNode<E> | null,
    descending: boolean,
    changes: ChangeCounter,
    where: string,
    project?: (node: TreeNode<E>) => T,
  ) {
    super(changes, where)
    this.node = start
    this.end = end
    this.descending = descending
    this.project = project
  }

  protected step(): IteratorResult<T> {
    const node = this.node
    if (node === null || node === this.end) return done()
    this.node = this.descending ? predecessor(node) : successor(node)
    return {
      done: false,
      value: this.project === undefined ? (node.value as unknown as T) : this.project(node),
    }
  }
}

/**
 * A fail-fast cursor over the nodes from `start` up to, but not including, `end`; `remove()`
 * unlinks the node `next()` last returned. The next node is found before anything is removed, and
 * removal moves nodes rather than values, so the cursor carries on from where it was. It returns
 * `project(node)`: the node's value by default.
 *
 * @internal
 */
export class TreeCursor<E, T = E> extends FailFastCursor<T> implements Cursor<T> {
  private next_: TreeNode<E> | null
  private last: TreeNode<E> | null = null
  private readonly end: TreeNode<E> | null
  private readonly descending: boolean
  private readonly tree: OrderedTree<E>
  private readonly project: ((node: TreeNode<E>) => T) | undefined

  constructor(
    tree: OrderedTree<E>,
    start: TreeNode<E> | null,
    end: TreeNode<E> | null,
    descending: boolean,
    where: string,
    project?: (node: TreeNode<E>) => T,
  ) {
    super(tree.changes, where)
    this.tree = tree
    this.next_ = start
    this.end = end
    this.descending = descending
    this.project = project
  }

  protected hasMore(): boolean {
    return this.next_ !== null && this.next_ !== this.end
  }

  protected advance(): T {
    const node = this.next_ as TreeNode<E>
    this.last = node
    this.next_ = this.descending ? predecessor(node) : successor(node)
    return this.project === undefined ? (node.value as unknown as T) : this.project(node)
  }

  protected removeLast(): void {
    this.tree.remove(this.last as TreeNode<E>)
    this.last = null
    this.tree.changes.structural()
  }
}

// The engine behind `LinkedList`: a doubly linked list of internal nodes with plain fields. A
// node is handed out only through a `NodeHandle`, made the first time the node is returned and then
// reused. The public class holds one engine and delegates to it, so nothing here reaches the
// published types except through the `LinkedListNode` interface.

import { IllegalArgumentError, IllegalStateError } from '../../errors/errors'
import type { LinkedListNode } from '../../interfaces/linked-list-node'
import type { Deque } from '../../interfaces/queue'
import { describeValue } from '../checks'
import { defineProperty } from '../intrinsics'
import { INSPECT } from '../output'
import { AbstractDeque, type DequeWalker } from '../skeletons/abstract-deque'
import { ReversedDeque } from '../views/reversed-deque'

// Module-local key for a handle's internal node. It is not a registered symbol, so no other code
// can name it, and the property is non-enumerable, so `Object.keys`, `JSON.stringify`, `for…in`
// and spread never show it. Reflection (`Object.getOwnPropertySymbols`) still sees it; the state
// is hidden, not protected.
const NODE: unique symbol = Symbol('node')

const REMOVED = 'LinkedListNode.value: the node has been removed from its list'

/**
 * An element's place in a `LinkedListEngine`. Never handed out: `handleOf` wraps it. A removed
 * node keeps its value and its handle but no reference to its list or to other nodes.
 *
 * @internal
 */
class ListNode<E> {
  item: E
  next: ListNode<E> | undefined
  prev: ListNode<E> | undefined
  list: LinkedListEngine<E> | undefined
  handle: NodeHandle<E> | undefined

  constructor(
    item: E,
    prev: ListNode<E> | undefined,
    next: ListNode<E> | undefined,
    list: LinkedListEngine<E>,
  ) {
    this.item = item
    this.next = next
    this.prev = prev
    this.list = list
    this.handle = undefined
  }
}

/** Returns the handle of `node`, made on first use and then the same object; `undefined` for none. */
function handleOf<E>(node: ListNode<E> | undefined): NodeHandle<E> | undefined {
  if (node === undefined) return undefined
  let handle = node.handle
  if (handle === undefined) {
    handle = new NodeHandle(node)
    node.handle = handle
  }
  return handle
}

/**
 * The public face of a node of a `LinkedListEngine`, handed out as a `LinkedListNode`. Its only
 * own property is the internal node, non-enumerable. A handle of a removed node keeps its value
 * but answers `undefined` for its neighbours.
 *
 * @internal
 */
export class NodeHandle<E> implements LinkedListNode<E> {
  declare readonly [NODE]: ListNode<E>

  constructor(node: ListNode<E>) {
    defineProperty(this, NODE, { value: node })
  }

  get value(): E {
    // An object made from this prototype has no node: it reads `undefined` without throwing.
    const node = this[NODE] as ListNode<E> | undefined
    return node === undefined ? (undefined as E) : node.item
  }

  set value(value: E) {
    const node = this[NODE] as ListNode<E> | undefined
    const list = node === undefined ? undefined : node.list
    if (list === undefined) throw new IllegalStateError(REMOVED)
    ;(node as ListNode<E>).item = value
    list.changeCounter.replaced()
  }

  get next(): NodeHandle<E> | undefined {
    const node = this[NODE] as ListNode<E> | undefined
    return node === undefined ? undefined : handleOf(node.next)
  }

  get previous(): NodeHandle<E> | undefined {
    const node = this[NODE] as ListNode<E> | undefined
    return node === undefined ? undefined : handleOf(node.prev)
  }

  get [Symbol.toStringTag](): string {
    return 'LinkedListNode'
  }

  [INSPECT](
    _depth: number | null,
    options: object,
    inspect: (value: unknown, options: object) => string,
  ): string {
    return `LinkedListNode { value: ${inspect(this.value, options)} }`
  }
}

/** Walks the nodes of a `LinkedListEngine`, holding the node it returns next. */
class NodeWalker<E> implements DequeWalker<E> {
  private upcoming: ListNode<E> | undefined
  private last: ListNode<E> | undefined
  private readonly list: LinkedListEngine<E>
  private readonly fromBack: boolean

  constructor(list: LinkedListEngine<E>, fromBack: boolean) {
    this.list = list
    this.fromBack = fromBack
    this.upcoming = fromBack ? list.tailNode : list.headNode
  }

  hasNext(): boolean {
    return this.upcoming !== undefined
  }

  next(): E {
    const node = this.upcoming as ListNode<E>
    this.last = node
    this.upcoming = this.fromBack ? node.prev : node.next
    return node.item
  }

  remove(): void {
    this.list.unlink(this.last as ListNode<E>)
    this.last = undefined
  }
}

/**
 * A deque stored as a doubly linked list of nodes. A node leaving the list is cut loose: by
 * `detach` for a single node, and node by node in `clearAll`. No walk recurses.
 *
 * @internal
 */
export class LinkedListEngine<E> extends AbstractDeque<E> {
  private head: ListNode<E> | undefined = undefined
  private tail: ListNode<E> | undefined = undefined
  private length = 0
  private readonly facade: Deque<E>

  /** @param facade - The public list, for identity and callbacks. */
  constructor(facade: Deque<E>) {
    super()
    this.facade = facade
  }

  override get owner(): Deque<E> {
    return this.facade
  }

  override get storesEmpty(): boolean {
    return true
  }

  protected override get noun(): string {
    return 'list'
  }

  get [Symbol.toStringTag](): string {
    return 'LinkedList'
  }

  get size(): number {
    return this.length
  }

  peekFront(): E {
    return (this.head as ListNode<E>).item
  }

  peekBack(): E {
    return (this.tail as ListNode<E>).item
  }

  walker(fromBack: boolean): DequeWalker<E> {
    return new NodeWalker(this, fromBack)
  }

  ensureRoom(_count: number, _where: string): void {
    // No limit but memory.
  }

  insertFront(element: E): void {
    this.link(undefined, this.head, element)
  }

  insertBack(element: E): void {
    this.link(this.tail, undefined, element)
  }

  takeFront(): E {
    const node = this.head as ListNode<E>
    this.unlink(node)
    return node.item
  }

  takeBack(): E {
    const node = this.tail as ListNode<E>
    this.unlink(node)
    return node.item
  }

  compact(flags: readonly boolean[]): void {
    let node = this.head
    let index = 0
    while (node !== undefined) {
      const next = node.next
      if (flags[index++] === true) {
        this.detach(node)
        this.length--
      }
      node = next
    }
    this.changes.structural()
  }

  clearAll(): void {
    let node = this.head
    while (node !== undefined) {
      const next = node.next
      node.next = undefined
      node.prev = undefined
      node.list = undefined
      node = next
    }
    this.head = undefined
    this.tail = undefined
    this.length = 0
    this.changes.structural()
  }

  reversed(): Deque<E> {
    return new ReversedDeque(this)
  }

  // ── Handles ──

  /** The first internal node, for walkers. */
  get headNode(): ListNode<E> | undefined {
    return this.head
  }

  /** The last internal node, for walkers. */
  get tailNode(): ListNode<E> | undefined {
    return this.tail
  }

  firstNode(): NodeHandle<E> | undefined {
    return handleOf(this.head)
  }

  lastNode(): NodeHandle<E> | undefined {
    return handleOf(this.tail)
  }

  addFirstNode(element: E): NodeHandle<E> {
    return handleOf(this.link(undefined, this.head, element)) as NodeHandle<E>
  }

  addLastNode(element: E): NodeHandle<E> {
    return handleOf(this.link(this.tail, undefined, element)) as NodeHandle<E>
  }

  insertBefore(node: unknown, element: E): NodeHandle<E> {
    const at = this.requireNode(node, 'LinkedList.insertBefore')
    return handleOf(this.link(at.prev, at, element)) as NodeHandle<E>
  }

  insertAfter(node: unknown, element: E): NodeHandle<E> {
    const at = this.requireNode(node, 'LinkedList.insertAfter')
    return handleOf(this.link(at, at.next, element)) as NodeHandle<E>
  }

  removeNode(node: unknown): E {
    const at = this.requireNode(node, 'LinkedList.removeNode')
    this.unlink(at)
    return at.item
  }

  /** Removes `node`, a node of this list, as one structural change. */
  unlink(node: ListNode<E>): void {
    this.detach(node)
    this.length--
    this.changes.structural()
  }

  /** Returns the internal node of `node` when it is a handle of this list; otherwise throws, before any change. */
  private requireNode(node: unknown, where: string): ListNode<E> {
    const at = node instanceof NodeHandle ? (node[NODE] as ListNode<E> | undefined) : undefined
    if (at === undefined || at.list !== this) {
      throw new IllegalArgumentError(
        `${where}: node is not a node of this list (${describeValue(node)})`,
      )
    }
    return at
  }

  /** Adds a node for `element` between `prev` and `next` (neighbours, or `undefined` at an end). */
  private link(
    prev: ListNode<E> | undefined,
    next: ListNode<E> | undefined,
    element: E,
  ): ListNode<E> {
    const node = new ListNode(element, prev, next, this)
    if (prev === undefined) this.head = node
    else prev.next = node
    if (next === undefined) this.tail = node
    else next.prev = node
    this.length++
    this.changes.structural()
    return node
  }

  /** Takes `node` out of the chain and cuts it loose; the caller updates `length` and counts. */
  private detach(node: ListNode<E>): void {
    const prev = node.prev
    const next = node.next
    if (prev === undefined) this.head = next
    else prev.next = next
    if (next === undefined) this.tail = prev
    else next.prev = prev
    node.next = undefined
    node.prev = undefined
    node.list = undefined
  }
}

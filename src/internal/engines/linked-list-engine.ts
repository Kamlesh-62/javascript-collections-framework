// The engine behind `LinkedList`: a doubly linked list whose nodes are also the public handles.
// The public class holds one engine and delegates to it, so nothing here reaches the published
// types except through the `LinkedListNode` interface.

import { IllegalArgumentError, IllegalStateError } from '../../errors/errors'
import type { LinkedListNode } from '../../interfaces/linked-list-node'
import type { Deque } from '../../interfaces/queue'
import { describeValue } from '../checks'
import { INSPECT } from '../output'
import { AbstractDeque, type DequeWalker } from '../skeletons/abstract-deque'
import { ReversedDeque } from '../views/reversed-deque'

// Module-local keys for a node's state. They are not registered symbols, so no other code can name
// them, and the properties are non-enumerable, so `Object.keys`, `JSON.stringify`, `for…in` and
// spread never show the links or the list. Reflection (`Object.getOwnPropertySymbols`) still sees
// them; they are hidden, not protected.
const ITEM: unique symbol = Symbol('item')
const NEXT: unique symbol = Symbol('next')
const PREV: unique symbol = Symbol('previous')
const LIST: unique symbol = Symbol('list')

const REMOVED = 'LinkedListNode.value: the node has been removed from its list'

/**
 * A node of a `LinkedListEngine`, handed out as a `LinkedListNode`. A removed node keeps its value
 * but no reference to its list or to other nodes.
 *
 * @internal
 */
export class ListNode<E> implements LinkedListNode<E> {
  declare [ITEM]: E
  declare [NEXT]: ListNode<E> | undefined
  declare [PREV]: ListNode<E> | undefined
  declare [LIST]: LinkedListEngine<E> | undefined

  constructor(item: E, list: LinkedListEngine<E>) {
    Object.defineProperty(this, ITEM, { value: item, writable: true })
    Object.defineProperty(this, NEXT, { value: undefined, writable: true })
    Object.defineProperty(this, PREV, { value: undefined, writable: true })
    Object.defineProperty(this, LIST, { value: list, writable: true })
  }

  get value(): E {
    return this[ITEM]
  }

  set value(value: E) {
    const list = this[LIST]
    if (list === undefined) throw new IllegalStateError(REMOVED)
    this[ITEM] = value
    list.changeCounter.replaced()
  }

  get next(): ListNode<E> | undefined {
    return this[NEXT]
  }

  get previous(): ListNode<E> | undefined {
    return this[PREV]
  }

  get [Symbol.toStringTag](): string {
    return 'LinkedListNode'
  }

  [INSPECT](
    _depth: number | null,
    options: object,
    inspect: (value: unknown, options: object) => string,
  ): string {
    return `LinkedListNode { value: ${inspect(this[ITEM], options)} }`
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
    this.upcoming = fromBack ? list.lastNode() : list.firstNode()
  }

  hasNext(): boolean {
    return this.upcoming !== undefined
  }

  next(): E {
    const node = this.upcoming as ListNode<E>
    this.last = node
    this.upcoming = this.fromBack ? node[PREV] : node[NEXT]
    return node[ITEM]
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
    return (this.head as ListNode<E>)[ITEM]
  }

  peekBack(): E {
    return (this.tail as ListNode<E>)[ITEM]
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
    return node[ITEM]
  }

  takeBack(): E {
    const node = this.tail as ListNode<E>
    this.unlink(node)
    return node[ITEM]
  }

  compact(flags: readonly boolean[]): void {
    let node = this.head
    let index = 0
    while (node !== undefined) {
      const next = node[NEXT]
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
      const next = node[NEXT]
      node[NEXT] = undefined
      node[PREV] = undefined
      node[LIST] = undefined
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

  firstNode(): ListNode<E> | undefined {
    return this.head
  }

  lastNode(): ListNode<E> | undefined {
    return this.tail
  }

  addFirstNode(element: E): ListNode<E> {
    return this.link(undefined, this.head, element)
  }

  addLastNode(element: E): ListNode<E> {
    return this.link(this.tail, undefined, element)
  }

  insertBefore(node: unknown, element: E): ListNode<E> {
    const at = this.requireNode(node, 'LinkedList.insertBefore')
    return this.link(at[PREV], at, element)
  }

  insertAfter(node: unknown, element: E): ListNode<E> {
    const at = this.requireNode(node, 'LinkedList.insertAfter')
    return this.link(at, at[NEXT], element)
  }

  removeNode(node: unknown): E {
    const at = this.requireNode(node, 'LinkedList.removeNode')
    this.unlink(at)
    return at[ITEM]
  }

  /** Removes `node`, a node of this list, as one structural change. */
  unlink(node: ListNode<E>): void {
    this.detach(node)
    this.length--
    this.changes.structural()
  }

  /** Returns `node` when it is a node of this list; otherwise throws, before any change. */
  private requireNode(node: unknown, where: string): ListNode<E> {
    if (!(node instanceof ListNode) || node[LIST] !== this) {
      throw new IllegalArgumentError(
        `${where}: node is not a node of this list (${describeValue(node)})`,
      )
    }
    return node as ListNode<E>
  }

  /** Adds a node for `element` between `prev` and `next` (neighbours, or `undefined` at an end). */
  private link(
    prev: ListNode<E> | undefined,
    next: ListNode<E> | undefined,
    element: E,
  ): ListNode<E> {
    const node = new ListNode(element, this)
    node[PREV] = prev
    node[NEXT] = next
    if (prev === undefined) this.head = node
    else prev[NEXT] = node
    if (next === undefined) this.tail = node
    else next[PREV] = node
    this.length++
    this.changes.structural()
    return node
  }

  /** Takes `node` out of the chain and cuts it loose; the caller updates `length` and counts. */
  private detach(node: ListNode<E>): void {
    const prev = node[PREV]
    const next = node[NEXT]
    if (prev === undefined) this.head = next
    else prev[NEXT] = next
    if (next === undefined) this.tail = prev
    else next[PREV] = prev
    node[NEXT] = undefined
    node[PREV] = undefined
    node[LIST] = undefined
  }
}

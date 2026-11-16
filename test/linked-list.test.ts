import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import { ArrayDeque } from '../src/collections/array-deque'
import { ArrayList } from '../src/collections/array-list'
import { LinkedList } from '../src/collections/linked-list'
import {
  ConcurrentModificationError,
  IllegalArgumentError,
  IllegalStateError,
  isCollection,
  isDeque,
  isList,
  isQueue,
  isSequencedCollection,
  NoSuchElementError,
} from '../src/index'
import type { Collection } from '../src/interfaces/collection'
import type { LinkedListNode } from '../src/interfaces/linked-list-node'
import type { Deque } from '../src/interfaces/queue'
import { describeCollection } from './contracts/collection'
import { describeDeque } from './contracts/deque'
import { describeQueue } from './contracts/queue'
import { describeSequencedCollection } from './contracts/sequenced'
import { runDequeReferenceModel, runReferenceModel } from './support/reference-model'

function caught(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  return undefined
}

function messageOf(fn: () => unknown): string {
  return (caught(fn) as Error).message
}

/** The handles of `list`, front to back, walked through `next`. */
function handles<E>(list: LinkedList<E>): LinkedListNode<E>[] {
  const out: LinkedListNode<E>[] = []
  for (let node = list.firstNode(); node !== undefined; node = node.next) out.push(node)
  return out
}

describe('LinkedList — use as a deque', () => {
  it('works as a queue, a stack and from both ends, as ArrayDeque does [007 S1-AC2]', () => {
    const list = new LinkedList<number>()
    expect(list.add(1).addLast(2).push(3).addFirst(0)).toBe(list)
    expect(list.toArray()).toEqual([0, 1, 2, 3])
    expect(list.peek()).toBe(0)
    expect(list.peekLast()).toBe(3)
    expect(list.getFirst()).toBe(0)
    expect(list.getLast()).toBe(3)
    expect(list.poll()).toBe(0)
    expect(list.pop()).toBe(3)
    expect(list.removeFirst()).toBe(1)
    expect(list.removeLast()).toBe(2)
    expect(list.poll()).toBeUndefined()
    expect(list.pop()).toBeUndefined()
    expect(list.peek()).toBeUndefined()
    expect(list.peekLast()).toBeUndefined()
    expect(caught(() => list.removeFirst())).toBeInstanceOf(NoSuchElementError)
    expect(caught(() => list.removeLast())).toBeInstanceOf(NoSuchElementError)
    expect(caught(() => list.getFirst())).toBeInstanceOf(NoSuchElementError)
    expect(caught(() => list.getLast())).toBeInstanceOf(NoSuchElementError)
  })

  it('delete removes the first match from the front, the view the last [007 S1-AC2]', () => {
    const list = new LinkedList([1, 2, 1, 3])
    expect(list.delete(1)).toBe(true)
    expect(list.toArray()).toEqual([2, 1, 3])
    expect(list.reversed().delete(3)).toBe(true)
    list.add(1)
    expect(list.reversed().delete(1)).toBe(true)
    expect(list.toArray()).toEqual([2, 1])
    expect(list.delete(9)).toBe(false)
  })

  it('the reversed view swaps the ends and writes through [007 S1-AC2]', () => {
    const list = new LinkedList([1, 2, 3])
    const view = list.reversed()
    expect([...view]).toEqual([3, 2, 1])
    view.push(0)
    view.addFirst(4)
    expect(list.toArray()).toEqual([0, 1, 2, 3, 4])
    expect(view.poll()).toBe(4)
    expect(view.pop()).toBe(0)
    expect(view.reversed()).toBe(list)
  })

  it('a change through a handle or the view makes an open iterator or cursor throw [007 S1-AC3]', () => {
    const changes: Array<(list: LinkedList<number>) => unknown> = [
      (list) => list.addLastNode(9),
      (list) => list.insertAfter(list.firstNode() as LinkedListNode<number>, 9),
      (list) => list.removeNode(list.lastNode() as LinkedListNode<number>),
      (list) => list.reversed().push(9),
      (list) => list.reversed().poll(),
      (list) => list.add(9),
    ]
    for (const change of changes) {
      const list = new LinkedList([1, 2, 3])
      const iterator = list[Symbol.iterator]()
      iterator.next()
      const cursor = list.cursor()
      cursor.next()
      change(list)
      expect(caught(() => iterator.next())).toBeInstanceOf(ConcurrentModificationError)
      expect(caught(() => cursor.next())).toBeInstanceOf(ConcurrentModificationError)
      expect(caught(() => cursor.remove())).toBeInstanceOf(ConcurrentModificationError)
    }
  })

  it('a cursor keeps its hasNext answer after an outside change and throws on next [007 S1-AC3]', () => {
    // The cursor's next element is removed through its handle.
    const list = new LinkedList([1, 2, 3])
    const cursor = list.cursor()
    expect(cursor.next()).toBe(1)
    list.removeNode((list.firstNode() as LinkedListNode<number>).next as LinkedListNode<number>)
    expect(cursor.hasNext()).toBe(true)
    expect(caught(() => cursor.next())).toBeInstanceOf(ConcurrentModificationError)

    // The cursor's next element is the last one, removed through its handle.
    const pair = new LinkedList([1, 2])
    const tail = pair.cursor()
    expect(tail.next()).toBe(1)
    pair.removeNode(pair.lastNode() as LinkedListNode<number>)
    expect(tail.hasNext()).toBe(true)
    expect(caught(() => tail.next())).toBeInstanceOf(ConcurrentModificationError)

    // The element the cursor last returned is removed through its handle.
    const other = new LinkedList([1, 2, 3])
    const walk = other.cursor()
    walk.next()
    other.removeNode(other.firstNode() as LinkedListNode<number>)
    expect(walk.hasNext()).toBe(true)
    expect(caught(() => walk.next())).toBeInstanceOf(ConcurrentModificationError)

    // The cursor was at the end before an outside add.
    const ended = new LinkedList([1])
    const done = ended.cursor()
    done.next()
    expect(done.hasNext()).toBe(false)
    ended.add(2)
    expect(done.hasNext()).toBe(false)
  })

  it('an iterator that has finished stays finished after a change [007 S1-AC3]', () => {
    const list = new LinkedList([1])
    const iterator = list[Symbol.iterator]()
    iterator.next()
    expect(iterator.next().done).toBe(true)
    list.add(2)
    expect(iterator.next()).toEqual({ done: true, value: undefined })
  })

  it('cursor remove works forward and through the view, in O(1) steps [007 S1-AC2]', () => {
    const list = new LinkedList([1, -2, 3, -4])
    const cursor = list.cursor()
    while (cursor.hasNext()) if (cursor.next() < 0) cursor.remove()
    expect(list.toArray()).toEqual([1, 3])
    const back = list.reversed().cursor()
    expect(back.next()).toBe(3)
    back.remove()
    expect(list.toArray()).toEqual([1])
  })
})

describe('LinkedList — empty values are stored', () => {
  it('every insertion method stores null and undefined [007 S2-AC1]', () => {
    const list = new LinkedList<number | null | undefined>([null, undefined])
    list.add(null).addFirst(undefined).push(undefined).addLast(null)
    list.addAll([null, undefined])
    list.addFirstNode(null)
    list.addLastNode(undefined)
    list.insertBefore(list.firstNode() as LinkedListNode<number | null | undefined>, undefined)
    list.insertAfter(list.lastNode() as LinkedListNode<number | null | undefined>, null)
    list.reversed().push(null)
    list.reversed().addLast(undefined)
    expect(list.size).toBe(14)
    expect(list.toArray().every((e) => e === null || e === undefined)).toBe(true)
    expect(LinkedList.from([null, undefined]).toArray()).toEqual([null, undefined])
    expect(LinkedList.from([1], () => undefined).toArray()).toEqual([undefined])
  })

  it('has, delete, removeAll and retainAll match stored empty values [007 S2-AC1]', () => {
    const list = new LinkedList<number | null | undefined>([1, null, 2, undefined, null])
    expect(list.has(null)).toBe(true)
    expect(list.has(undefined)).toBe(true)
    expect(list.delete(undefined)).toBe(true)
    expect(list.has(undefined)).toBe(false)
    expect(list.toArray()).toEqual([1, null, 2, null])
    expect(list.removeAll([null])).toBe(true)
    expect(list.toArray()).toEqual([1, 2])
    list.add(undefined)
    expect(list.retainAll([undefined])).toBe(true)
    expect(list.toArray()).toEqual([undefined])
    expect(list.reversed().has(undefined)).toBe(true)
  })

  it('isEmpty tells a stored undefined from an empty list [007 S2-AC2]', () => {
    const list = new LinkedList<number | undefined>([undefined])
    expect(list.peek()).toBeUndefined()
    expect(list.isEmpty()).toBe(false)
    expect(list.peekLast()).toBeUndefined()
    expect(list.isEmpty()).toBe(false)
    expect(list.getFirst()).toBeUndefined()
    expect(list.getLast()).toBeUndefined()
    expect(list.isEmpty()).toBe(false)
    expect(list.poll()).toBeUndefined()
    expect(list.isEmpty()).toBe(true)
    expect(list.poll()).toBeUndefined()

    list.push(undefined).push(undefined)
    expect(list.pop()).toBeUndefined()
    expect(list.removeFirst()).toBeUndefined()
    expect(list.isEmpty()).toBe(true)
    expect(caught(() => list.removeFirst())).toBeInstanceOf(NoSuchElementError)
    expect(caught(() => list.removeLast())).toBeInstanceOf(NoSuchElementError)
    expect(caught(() => list.getFirst())).toBeInstanceOf(NoSuchElementError)
    expect(caught(() => list.getLast())).toBeInstanceOf(NoSuchElementError)
    list.add(undefined)
    expect(list.removeLast()).toBeUndefined()
  })
})

describe('LinkedList — node handles', () => {
  it('addFirstNode and addLastNode add at the ends and return the handle [007 S3-AC1]', () => {
    const list = new LinkedList([2])
    const first = list.addFirstNode(1)
    const last = list.addLastNode(3)
    expect(first.value).toBe(1)
    expect(last.value).toBe(3)
    expect(list.toArray()).toEqual([1, 2, 3])
  })

  it('firstNode and lastNode return the end handles, or undefined when empty [007 S3-AC2]', () => {
    const list = new LinkedList<number>()
    expect(list.firstNode()).toBeUndefined()
    expect(list.lastNode()).toBeUndefined()
    list.add(1).add(2)
    expect(list.firstNode()?.value).toBe(1)
    expect(list.lastNode()?.value).toBe(2)
  })

  it('next and previous are live, front to back, undefined at the ends, and never throw [007 S3-AC2]', () => {
    const list = new LinkedList([1, 3])
    const one = list.firstNode() as LinkedListNode<number>
    expect(one.previous).toBeUndefined()
    expect(one.next?.value).toBe(3)
    list.insertAfter(one, 2)
    expect(one.next?.value).toBe(2)
    list.poll()
    expect(list.firstNode()?.previous).toBeUndefined()
    const iterator = list[Symbol.iterator]()
    iterator.next()
    list.add(4)
    // Walking by handles after a change never throws.
    expect(handles(list).map((n) => n.value)).toEqual([2, 3, 4])
    const backwards: number[] = []
    for (let n = list.lastNode(); n !== undefined; n = n.previous) backwards.push(n.value)
    expect(backwards).toEqual([4, 3, 2])
  })

  it('removing while walking by handles works when next is read first [007 S3-AC2]', () => {
    const list = new LinkedList([1, -2, -3, 4])
    for (let node = list.firstNode(); node !== undefined; ) {
      const next = node.next
      if (node.value < 0) list.removeNode(node)
      node = next
    }
    expect(list.toArray()).toEqual([1, 4])
  })

  it('insertBefore and insertAfter insert next to the element and return the new handle [007 S3-AC3]', () => {
    const list = new LinkedList([2])
    const two = list.firstNode() as LinkedListNode<number>
    const one = list.insertBefore(two, 1)
    const three = list.insertAfter(two, 3)
    const half = list.insertAfter(one, 1.5)
    expect(list.toArray()).toEqual([1, 1.5, 2, 3])
    expect(one.value).toBe(1)
    expect(three.value).toBe(3)
    expect(half.previous).toBe(one)
    expect(list.firstNode()).toBe(one)
    expect(list.lastNode()).toBe(three)
  })

  it('removeNode removes the element and returns its value; the handle keeps only its value [007 S3-AC4]', () => {
    for (const at of [0, 1, 2]) {
      const list = new LinkedList(['a', 'b', 'c'])
      const node = handles(list)[at] as LinkedListNode<string>
      expect(list.removeNode(node)).toBe(['a', 'b', 'c'][at])
      expect(list.size).toBe(2)
      expect(node.next).toBeUndefined()
      expect(node.previous).toBeUndefined()
      expect(node.value).toBe(['a', 'b', 'c'][at])
      expect(handles(list).map((n) => n.value)).toEqual(['a', 'b', 'c'].filter((_, i) => i !== at))
    }
  })

  it('setting value replaces in place, changes revision, and keeps iterators valid [007 S3-AC5]', () => {
    const list = new LinkedList([1, 2, 3])
    const iterator = list[Symbol.iterator]()
    const cursor = list.cursor()
    expect(iterator.next().value).toBe(1)
    expect(cursor.next()).toBe(1)
    const last = list.lastNode() as LinkedListNode<number>
    let revision = list.revision
    last.value = 30
    expect(list.revision).not.toBe(revision)
    revision = list.revision
    last.value = 30
    expect(list.revision).not.toBe(revision)
    expect([iterator.next().value, iterator.next().value]).toEqual([2, 30])
    expect([cursor.next(), cursor.next()]).toEqual([2, 30])
    cursor.remove()
    expect(list.toArray()).toEqual([1, 2])
  })

  it('reading handles never changes revision [007 S3-AC5]', () => {
    const list = new LinkedList([1, 2])
    const revision = list.revision
    const first = list.firstNode() as LinkedListNode<number>
    void [first.value, first.next, first.previous, list.lastNode(), list.reversed().peek()]
    expect(list.revision).toBe(revision)
  })

  it('a handle keeps referring to its element through every other change [007 S3-AC6]', () => {
    const list = new LinkedList([1, 2, 3])
    const two = handles(list)[1] as LinkedListNode<number>
    list.addFirst(0)
    list.push(4)
    list.poll()
    list.pop()
    list.delete(1)
    list.removeIf((n) => n === 3)
    list.addAll([5, 6])
    list.reversed().push(-1)
    expect(two.value).toBe(2)
    expect(list.toArray()).toEqual([-1, 2, 5, 6])
    list.insertAfter(two, 2.5)
    expect(list.toArray()).toEqual([-1, 2, 2.5, 5, 6])
  })

  it('every element has one handle, whichever method added it [007 S3-AC9]', () => {
    const list = new LinkedList<number>()
    const a = list.addLastNode(1)
    expect(list.lastNode()).toBe(a)
    expect(list.firstNode()).toBe(a)
    list.add(2)
    const b = list.lastNode() as LinkedListNode<number>
    expect(a.next).toBe(b)
    expect(b.previous).toBe(a)
    expect(a.next?.previous).toBe(a)
    expect(list.lastNode()).toBe(b)
    const c = list.insertAfter(a, 1.5)
    expect(a.next).toBe(c)
    expect(b.previous).toBe(c)
    const seen = new Map(handles(list).map((n) => [n, n.value]))
    expect(seen.size).toBe(3)
    // Removed and added again: a new handle.
    const moved = list.addFirstNode(list.removeNode(b))
    expect(moved).not.toBe(b)
    expect(list.firstNode()).toBe(moved)
  })

  it('refuses removed handles, handles of other lists and non-handles, changing nothing [007 S3-AC7]', () => {
    const list = new LinkedList([1, 2, 3])
    const other = new LinkedList([1])
    const removedBy: Array<(l: LinkedList<number>, n: LinkedListNode<number>) => unknown> = [
      (l, n) => l.removeNode(n),
      (l) => l.clear(),
      (l) => l.poll(),
      (l) => l.delete(1),
      (l) => l.removeIf((e) => e === 1),
      (l) => {
        const c = l.cursor()
        c.next()
        c.remove()
      },
      (l) => l.reversed().pop(),
      (l) => l.reversed().delete(1),
    ]
    const stale = removedBy.map((remove) => {
      const l = new LinkedList([1, 2])
      const n = l.firstNode() as LinkedListNode<number>
      remove(l, n)
      l.addFirst(1)
      return [l, n] as const
    })
    for (const [l, n] of stale) {
      const before = l.toArray()
      const revision = l.revision
      expect(caught(() => l.insertBefore(n, 0))).toBeInstanceOf(IllegalArgumentError)
      expect(caught(() => l.insertAfter(n, 0))).toBeInstanceOf(IllegalArgumentError)
      expect(caught(() => l.removeNode(n))).toBeInstanceOf(IllegalArgumentError)
      expect(l.toArray()).toEqual(before)
      expect(l.revision).toBe(revision)
    }
    const foreign = other.firstNode() as LinkedListNode<number>
    const notHandles: unknown[] = [undefined, null, 1, {}, { value: 1, next: undefined }, foreign]
    const revision = list.revision
    for (const value of notHandles) {
      const node = value as LinkedListNode<number>
      expect(caught(() => list.insertBefore(node, 0))).toBeInstanceOf(IllegalArgumentError)
      expect(caught(() => list.insertAfter(node, 0))).toBeInstanceOf(IllegalArgumentError)
      expect(caught(() => list.removeNode(node))).toBeInstanceOf(IllegalArgumentError)
    }
    expect(list.toArray()).toEqual([1, 2, 3])
    expect(list.revision).toBe(revision)
    expect(other.toArray()).toEqual([1])
  })

  it('names the method and describes the value without running user code [007 S3-AC7]', () => {
    const list = new LinkedList<number>([1])
    const undef = undefined as unknown as LinkedListNode<number>
    expect(messageOf(() => list.insertBefore(undef, 0))).toBe(
      'LinkedList.insertBefore: node is not a node of this list (undefined)',
    )
    expect(messageOf(() => list.insertAfter(undef, 0))).toBe(
      'LinkedList.insertAfter: node is not a node of this list (undefined)',
    )
    expect(messageOf(() => list.removeNode(undef))).toBe(
      'LinkedList.removeNode: node is not a node of this list (undefined)',
    )
    let called = false
    const trap = {
      toString() {
        called = true
        return 'x'
      },
      get value() {
        called = true
        return 1
      },
    } as unknown as LinkedListNode<number>
    caught(() => list.removeNode(trap))
    expect(called).toBe(false)
  })

  it('setting the value of a removed handle throws and leaves it [007 S3-AC7]', () => {
    const list = new LinkedList([1])
    const node = list.firstNode() as LinkedListNode<number>
    list.clear()
    const error = caught(() => {
      node.value = 2
    })
    expect(error).toBeInstanceOf(IllegalStateError)
    expect((error as Error).message).toBe(
      'LinkedListNode.value: the node has been removed from its list',
    )
    expect(node.value).toBe(1)
  })

  it('handle insertions and removals are structural changes [007 S3-AC8]', () => {
    const list = new LinkedList([1, 2])
    const steps: Array<() => unknown> = [
      () => list.addFirstNode(0),
      () => list.addLastNode(3),
      () => list.insertBefore(list.lastNode() as LinkedListNode<number>, 2.5),
      () => list.insertAfter(list.firstNode() as LinkedListNode<number>, 0.5),
      () => list.removeNode(list.firstNode() as LinkedListNode<number>),
    ]
    for (const step of steps) {
      const revision = list.revision
      const iterator = list[Symbol.iterator]()
      step()
      expect(list.revision).not.toBe(revision)
      expect(caught(() => iterator.next())).toBeInstanceOf(ConcurrentModificationError)
    }
  })

  it('a handle prints only its value and shows nothing to JSON or Object.keys [007 S3-AC10]', () => {
    const list = new LinkedList([1, 'a'] as unknown[])
    const node = list.firstNode() as LinkedListNode<unknown>
    expect(inspect(node)).toBe('LinkedListNode { value: 1 }')
    expect(inspect(node.next)).toBe("LinkedListNode { value: 'a' }")
    expect(Object.prototype.toString.call(node)).toBe('[object LinkedListNode]')
    expect(String(node)).toBe('[object LinkedListNode]')
    expect(JSON.stringify(node)).toBe('{}')
    expect(Object.keys(node)).toEqual([])
    expect({ ...node }).toEqual({})
    const keys: string[] = []
    for (const key in node) keys.push(key)
    expect(keys).toEqual([])
    expect('toJSON' in node).toBe(false)
    list.removeNode(node)
    expect(inspect(node)).toBe('LinkedListNode { value: 1 }')
    expect(JSON.stringify(node)).toBe('{}')
  })

  it('a handle has no public string keys besides value, next, previous and constructor [007 S3-AC10]', () => {
    const node = new LinkedList([1]).firstNode() as LinkedListNode<number>
    const names = new Set<string>()
    for (
      let o: object | null = node;
      o !== null && o !== Object.prototype;
      o = Object.getPrototypeOf(o)
    ) {
      for (const name of Object.getOwnPropertyNames(o)) names.add(name)
    }
    expect([...names].sort()).toEqual(['constructor', 'next', 'previous', 'value'])
  })
})

describe('LinkedList — large lists', () => {
  it('walks, prints, copies, filters and clears 200,000 elements without throwing [007 S4-AC2]', () => {
    const n = 200_000
    const list = new LinkedList<number>()
    for (let i = 0; i < n; i++) list.add(i)
    let count = 0
    for (const _ of list) count++
    for (const _ of list.reversed()) count++
    expect(count).toBe(2 * n)
    expect(String(list).length).toBeGreaterThan(n)
    expect(list.toArray().length).toBe(n)
    const copy = list.copy()
    expect(copy.size).toBe(n)
    expect(list.removeIf((e) => e % 2 === 0)).toBe(true)
    expect(list.size).toBe(n / 2)
    list.clear()
    copy.clear()
    expect(list.size + copy.size).toBe(0)
  })
})

describe('LinkedList — equality and construction', () => {
  it('equals only itself [007 S5-AC1]', () => {
    const list = new LinkedList([1])
    expect(list.equals(list)).toBe(true)
    expect(list.equals(new LinkedList([1]))).toBe(false)
    expect(list.equals(list.reversed())).toBe(false)
    expect(list.reversed().equals(list.reversed())).toBe(false)
    expect(list.reversed().equals(list)).toBe(false)
    for (const other of [new ArrayDeque([1]), new ArrayList([1])] as Collection<number>[]) {
      expect(list.equals(other)).toBe(false)
      expect(other.equals(list)).toBe(false)
    }
    expect('hashCode' in list).toBe(false)
  })

  it('the constructor accepts nothing, undefined, null and iterables [007 S5-AC2]', () => {
    expect(new LinkedList().size).toBe(0)
    expect(new LinkedList(undefined).size).toBe(0)
    expect(new LinkedList(null).size).toBe(0)
    expect(new LinkedList(new Set([1, 2])).toArray()).toEqual([1, 2])
    expect(caught(() => new LinkedList(5 as never))).toBeInstanceOf(TypeError)
    expect(messageOf(() => new LinkedList({} as never))).toBe(
      'LinkedList: elements is not iterable (object)',
    )
  })

  it('from behaves as ArrayList.from [007 S5-AC2]', () => {
    expect(LinkedList.from([1, 2]).toArray()).toEqual([1, 2])
    const context = { k: 10 }
    expect(
      LinkedList.from(
        [1, 2],
        function (this: typeof context, n, i) {
          return n * this.k + i
        },
        context,
      ).toArray(),
    ).toEqual([10, 21])
    expect(caught(() => LinkedList.from(null as never))).toBeInstanceOf(TypeError)
    expect(caught(() => LinkedList.from({ length: 1 } as never))).toBeInstanceOf(TypeError)
    // mapFn is checked before the iterable.
    expect(messageOf(() => LinkedList.from(null as never, 1 as never))).toMatch(
      /^LinkedList\.from: mapFn is not a function/,
    )
    expect(LinkedList.from([1, 2]).toArray()).toEqual(ArrayList.from([1, 2]).toArray())
  })

  it('copy is independent and has new handles [007 S5-AC3]', () => {
    const list = new LinkedList([1, null, 3])
    const copy = list.copy()
    const ours = handles(list)
    for (const node of handles(copy)) expect(ours).not.toContain(node)
    expect(copy).toBeInstanceOf(LinkedList)
    expect(copy.toArray()).toEqual([1, null, 3])
    copy.poll()
    expect(list.size).toBe(3)
    const original = list.firstNode() as LinkedListNode<number | null>
    expect(caught(() => copy.removeNode(original))).toBeInstanceOf(IllegalArgumentError)
  })

  it('prints as LinkedList and names the list in messages; the view stays a deque [007 S5-AC4]', () => {
    const list = new LinkedList([1, undefined])
    expect(String(list)).toBe('LinkedList(2) [1, undefined]')
    expect(Object.prototype.toString.call(list)).toBe('[object LinkedList]')
    expect(inspect(list)).toBe('LinkedList(2) [ 1, undefined ]')
    expect(JSON.stringify(list)).toBe('[1,null]')
    expect(String(list.reversed())).toBe('ReversedDeque(2) [undefined, 1]')
    const empty = new LinkedList<number>()
    expect(messageOf(() => empty.getFirst())).toBe('LinkedList.getFirst: the list is empty')
    expect(messageOf(() => empty.removeLast())).toBe('LinkedList.removeLast: the list is empty')
    expect(messageOf(() => empty.reversed().getFirst())).toBe(
      'ReversedDeque.getFirst: the deque is empty',
    )
  })
})

describe('LinkedList — published shape', () => {
  it('is a collection, sequenced collection, queue and deque, with its view, and not a list [007 S6-AC1]', () => {
    const list = new LinkedList([1])
    for (const value of [list, list.reversed()]) {
      expect(isCollection(value)).toBe(true)
      expect(isSequencedCollection(value)).toBe(true)
      expect(isQueue(value)).toBe(true)
      expect(isDeque(value)).toBe(true)
      expect(isList(value)).toBe(false)
    }
  })

  it('instanceof recognises the list only [007 S6-AC2]', () => {
    const list = new LinkedList([1])
    expect(list instanceof LinkedList).toBe(true)
    expect(list.reversed() instanceof LinkedList).toBe(false)
    expect(list.firstNode() instanceof LinkedList).toBe(false)
    expect(new ArrayDeque([1]) instanceof LinkedList).toBe(false)
    expect((null as unknown) instanceof LinkedList).toBe(false)
  })
})

// Contract suites for the list and its reversed view.
function replaceAt(collection: Collection<unknown>, index: number, value: unknown): void {
  // Both the list and its view walk front to back through handles of the list.
  const list =
    collection instanceof LinkedList ? collection : (collection as Deque<unknown>).reversed()
  const nodes = handles(list as LinkedList<unknown>)
  const at = collection instanceof LinkedList ? index : nodes.length - 1 - index
  ;(nodes[at] as LinkedListNode<unknown>).value = value
}

const lists: ReadonlyArray<[string, (initial?: Iterable<number>) => Deque<number>]> = [
  ['LinkedList', (initial) => new LinkedList<number>(initial)],
  ['ReversedDeque', (initial) => new LinkedList<number>([...(initial ?? [])].reverse()).reversed()],
]
for (const [name, make] of lists) {
  describeCollection(name, make as never, {
    iteration: 'fail-fast',
    brackets: 'list',
    nullElements: 'store',
    replace: replaceAt,
    peers: [
      (initial?: Iterable<unknown>) => new ArrayList<unknown>(initial),
      (initial?: Iterable<unknown>) =>
        new ArrayDeque<unknown>([...(initial ?? [])].filter((e) => e != null)),
    ],
  })
  describeSequencedCollection(name, make as never)
  describeQueue(name, make)
  describeDeque(name, make)
}

describe('LinkedList — reference model', () => {
  it('matches a native array, null and undefined included, under seeded random operations [007 S1-AC1]', () => {
    const values = [0, 1, 2, 3, null, undefined]
    for (const seed of [1, 2, 3, 4]) {
      runDequeReferenceModel({ seed, steps: 600, make: () => new LinkedList(), values })
      runDequeReferenceModel({
        seed,
        steps: 600,
        make: () => new LinkedList<number | null | undefined>().reversed(),
        values,
      })
      runReferenceModel({ seed, steps: 300, make: () => new LinkedList<number>(), model: 'array' })
    }
  })
})

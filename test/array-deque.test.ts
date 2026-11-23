import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import { ArrayDeque } from '../src/collections/array-deque'
import { ArrayList } from '../src/collections/array-list'
import { LinkedList } from '../src/collections/linked-list'
import * as lib from '../src/index'
import {
  ConcurrentModificationError,
  hashCode,
  NoSuchElementError,
  NullElementError,
} from '../src/index'
import type { Deque } from '../src/interfaces/queue'
import { describeCollection } from './contracts/collection'
import { runContractPair } from './contracts/pairs'
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

describe('ArrayDeque — use as a queue', () => {
  it('add appends at the tail and returns the deque [008 S1-AC1]', () => {
    const deque = new ArrayDeque<number>()
    expect(deque.add(1)).toBe(deque)
    deque.add(2).add(3)
    expect(deque.toArray()).toEqual([1, 2, 3])
  })

  it('poll removes the head, or returns undefined when empty [008 S1-AC2]', () => {
    const deque = new ArrayDeque(['a', 'b'])
    expect(deque.poll()).toBe('a')
    expect(deque.poll()).toBe('b')
    expect(deque.poll()).toBeUndefined()
    expect(deque.size).toBe(0)
  })

  it('peek returns the head without removing it, or undefined [008 S1-AC3]', () => {
    const deque = new ArrayDeque([7, 8])
    expect(deque.peek()).toBe(7)
    expect(deque.size).toBe(2)
    expect(new ArrayDeque().peek()).toBeUndefined()
  })

  it('delete removes the first SameValueZero match from the head [008 S1-AC4]', () => {
    const deque = new ArrayDeque<unknown>([1, Number.NaN, 2, 1, -0])
    expect(deque.delete(1)).toBe(true)
    expect(deque.toArray()).toEqual([Number.NaN, 2, 1, -0])
    expect(deque.delete(Number.NaN)).toBe(true)
    expect(deque.delete(0)).toBe(true)
    expect(deque.delete(9)).toBe(false)
    expect(deque.toArray()).toEqual([2, 1])
  })
})

describe('ArrayDeque — both ends', () => {
  it('addFirst and addLast insert at the ends and return the deque [008 S2-AC1]', () => {
    const deque = new ArrayDeque([2])
    expect(deque.addFirst(1)).toBe(deque)
    expect(deque.addLast(3)).toBe(deque)
    expect(deque.toArray()).toEqual([1, 2, 3])
  })

  it('removeFirst and removeLast remove the ends, or throw when empty [008 S2-AC2]', () => {
    const deque = new ArrayDeque([1, 2, 3])
    expect(deque.removeFirst()).toBe(1)
    expect(deque.removeLast()).toBe(3)
    deque.clear()
    expect(() => deque.removeFirst()).toThrow(NoSuchElementError)
    expect(() => deque.removeLast()).toThrow(NoSuchElementError)
    expect(messageOf(() => deque.removeFirst())).toBe('ArrayDeque.removeFirst: the deque is empty')
  })

  it('getFirst and getLast return the ends, or throw when empty [008 S2-AC3]', () => {
    const deque = new ArrayDeque([4, 5])
    expect(deque.getFirst()).toBe(4)
    expect(deque.getLast()).toBe(5)
    expect(() => new ArrayDeque().getFirst()).toThrow(NoSuchElementError)
    expect(() => new ArrayDeque().getLast()).toThrow(NoSuchElementError)
  })

  it('peekLast returns the tail, or undefined when empty [008 S2-AC4]', () => {
    expect(new ArrayDeque([1, 2]).peekLast()).toBe(2)
    expect(new ArrayDeque().peekLast()).toBeUndefined()
  })
})

describe('ArrayDeque — use as a stack, like an array', () => {
  it('push adds at the tail and returns the deque [008 S3-AC1]', () => {
    const deque = new ArrayDeque([1])
    expect(deque.push(2)).toBe(deque)
    expect(deque.toArray()).toEqual([1, 2])
  })

  it('pop removes the tail, or returns undefined when empty, as Array.pop [008 S3-AC2]', () => {
    const deque = new ArrayDeque([1, 2])
    expect(deque.pop()).toBe(2)
    expect(deque.pop()).toBe(1)
    expect(deque.pop()).toBeUndefined()
    expect([].pop()).toBeUndefined()
  })

  it('pushed 1, 2, 3 iterate 1, 2, 3 and pop 3, 2, 1, as an array does [008 S3-AC3]', () => {
    const deque = new ArrayDeque<number>()
    const array: number[] = []
    for (const n of [1, 2, 3]) {
      deque.push(n)
      array.push(n)
    }
    expect([...deque]).toEqual(array)
    expect([deque.pop(), deque.pop(), deque.pop()]).toEqual([array.pop(), array.pop(), array.pop()])
  })
})

describe('ArrayDeque — iteration and the reversed view', () => {
  it('iterates head to tail, also after wrapping around [008 S4-AC1]', () => {
    const deque = new ArrayDeque<number>()
    for (let i = 0; i < 6; i++) deque.add(i)
    for (let i = 0; i < 4; i++) deque.poll()
    for (let i = 6; i < 12; i++) deque.add(i)
    deque.addFirst(3)
    const expected = [3, 4, 5, 6, 7, 8, 9, 10, 11]
    expect([...deque]).toEqual(expected)
    expect(deque.toArray()).toEqual(expected)
    const seen: number[] = []
    deque.forEach((n) => {
      seen.push(n)
    })
    expect(seen).toEqual(expected)
  })

  it('fails fast when changed other than through that cursor [008 S4-AC2]', () => {
    const changes: Array<(d: Deque<number>) => unknown> = [
      (d) => d.add(9),
      (d) => d.poll(),
      (d) => d.pop(),
      (d) => d.addFirst(0),
      (d) => d.reversed().push(5),
      (d) => {
        const other = d.cursor()
        other.next()
        other.remove()
      },
    ]
    for (const change of changes) {
      const deque = new ArrayDeque([1, 2, 3])
      const iterator = deque[Symbol.iterator]()
      const cursor = deque.cursor()
      iterator.next()
      cursor.next()
      change(deque)
      expect(() => iterator.next()).toThrow(ConcurrentModificationError)
      expect(() => cursor.next()).toThrow(ConcurrentModificationError)
    }
    const deque = new ArrayDeque([1, 2, 3])
    expect(() =>
      deque.forEach(() => {
        deque.poll()
      }),
    ).toThrow(ConcurrentModificationError)
    const other = new ArrayDeque([1, 2, 3])
    expect(() =>
      other.removeIf(() => {
        other.add(4)
        return true
      }),
    ).toThrow(ConcurrentModificationError)
    expect(other.toArray()).toEqual([1, 2, 3, 4])
    const own = new ArrayDeque([1, 2, 3])
    const cursor = own.cursor()
    cursor.next()
    cursor.remove()
    expect(cursor.next()).toBe(2)
  })

  it('reversed is a live view with the ends swapped [008 S4-AC3]', () => {
    const deque = new ArrayDeque([1, 2, 3])
    const view = deque.reversed()
    expect([...view]).toEqual([3, 2, 1])
    view.add(4)
    expect(deque.toArray()).toEqual([4, 1, 2, 3])
    view.push(5)
    view.addLast(6)
    expect(deque.toArray()).toEqual([6, 5, 4, 1, 2, 3])
    view.addFirst(7)
    expect(deque.getLast()).toBe(7)
    expect(view.poll()).toBe(7)
    expect(view.removeFirst()).toBe(3)
    expect(view.pop()).toBe(6)
    expect(view.removeLast()).toBe(5)
    expect(deque.toArray()).toEqual([4, 1, 2])
    expect([view.peek(), view.getFirst(), view.peekLast(), view.getLast()]).toEqual([2, 2, 4, 4])
    deque.add(9)
    expect(view.toArray()).toEqual([9, 2, 1, 4])
    const seen: number[] = []
    view.forEach((n) => {
      seen.push(n)
    })
    expect(seen).toEqual([9, 2, 1, 4])
    view.removeIf((n) => n === 2)
    expect(deque.toArray()).toEqual([4, 1, 9])
    expect(deque.reversed()).not.toBe(view)
  })

  it('reversing the view returns the deque itself [008 S4-AC4]', () => {
    const deque = new ArrayDeque([1])
    expect(deque.reversed().reversed()).toBe(deque)
  })

  it('reversed().cursor() walks tail to head and reversed().delete removes the last match [008 S4-AC5]', () => {
    const deque = new ArrayDeque([1, 2, 1, 3])
    const cursor = deque.reversed().cursor()
    const seen: number[] = []
    while (cursor.hasNext()) {
      const n = cursor.next()
      seen.push(n)
      if (n === 3) cursor.remove()
    }
    expect(seen).toEqual([3, 1, 2, 1])
    expect(deque.toArray()).toEqual([1, 2, 1])
    expect(deque.reversed().delete(1)).toBe(true)
    expect(deque.toArray()).toEqual([1, 2])
  })

  it('the view never goes stale, shares revision and has the ReversedDeque tag [008 S4-AC6]', () => {
    const deque = new ArrayDeque([1, 2])
    const view = deque.reversed()
    deque.add(3)
    deque.poll()
    deque.clear()
    deque.add(4)
    expect(view.toArray()).toEqual([4])
    expect(view.revision).toBe(deque.revision)
    expect(String(view)).toBe('ReversedDeque(1) [4]')
    expect(inspect(view)).toBe('ReversedDeque(1) [ 4 ]')
    expect(Object.prototype.toString.call(view)).toBe('[object ReversedDeque]')
    expect(messageOf(() => new ArrayDeque().reversed().getFirst())).toBe(
      'ReversedDeque.getFirst: the deque is empty',
    )
    expect(messageOf(() => view.push(null as never))).toBe(
      'ReversedDeque.push: null is not allowed as an element',
    )
  })
})

describe('ArrayDeque — null and undefined', () => {
  it('rejects null and undefined in every insertion method, leaving the deque unchanged [008 S5-AC1]', () => {
    const calls: Array<[string, (d: Deque<unknown>) => unknown]> = [
      ['add', (d) => d.add(null)],
      ['addFirst', (d) => d.addFirst(undefined)],
      ['addLast', (d) => d.addLast(null)],
      ['push', (d) => d.push(undefined)],
      ['addAll', (d) => d.addAll([null])],
      ['reversed().add', (d) => d.reversed().add(undefined)],
      ['reversed().addFirst', (d) => d.reversed().addFirst(null)],
    ]
    for (const [name, call] of calls) {
      const deque = new ArrayDeque<unknown>([1, 2])
      const revision = deque.revision
      expect(() => call(deque), name).toThrow(NullElementError)
      expect(deque.toArray()).toEqual([1, 2])
      expect(deque.revision).toBe(revision)
    }
    expect(() => new ArrayDeque([1, null])).toThrow(NullElementError)
    expect(() => ArrayDeque.from([1, undefined])).toThrow(NullElementError)
    expect(() => ArrayDeque.from([1, 2], (n) => (n === 2 ? undefined : n))).toThrow(
      NullElementError,
    )
    expect(messageOf(() => new ArrayDeque<unknown>().add(null))).toBe(
      'ArrayDeque.add: null is not allowed as an element',
    )
  })

  it('addAll checks every element before adding any [008 S5-AC2]', () => {
    const deque = new ArrayDeque<unknown>([1])
    expect(() => deque.addAll([2, 3, undefined, 4])).toThrow(NullElementError)
    expect(deque.toArray()).toEqual([1])
  })

  it('has, delete, removeAll and retainAll treat null and undefined as matching nothing [008 S5-AC3]', () => {
    const deque = new ArrayDeque<unknown>([1, 2])
    expect(deque.has(null)).toBe(false)
    expect(deque.has(undefined)).toBe(false)
    expect(deque.delete(null)).toBe(false)
    expect(deque.delete(undefined)).toBe(false)
    expect(deque.removeAll([null, undefined])).toBe(false)
    expect(deque.toArray()).toEqual([1, 2])
    expect(deque.retainAll([null])).toBe(true)
    expect(deque.size).toBe(0)
  })

  it('calls that throw or change nothing keep open iterators valid [008 S5-AC4]', () => {
    const empty = new ArrayDeque<number>()
    const emptyIterator = empty[Symbol.iterator]()
    empty.poll()
    empty.pop()
    empty.peek()
    empty.clear()
    empty.addAll([])
    expect(emptyIterator.next().done).toBe(true)
    const deque = new ArrayDeque([1, 2])
    const iterator = deque[Symbol.iterator]()
    const revision = deque.revision
    deque.delete(9)
    caught(() => deque.add(null as never))
    expect(deque.revision).toBe(revision)
    expect(iterator.next().value).toBe(1)
  })
})

describe('ArrayDeque — equality and construction', () => {
  it('equals only itself; lists and copies are not equal [008 S6-AC2]', () => {
    const deque = new ArrayDeque([1, 2])
    expect(deque.equals(deque)).toBe(true)
    expect(deque.equals(new ArrayDeque([1, 2]))).toBe(false)
    expect(deque.equals(deque.copy())).toBe(false)
    expect(deque.reversed().equals(deque.reversed())).toBe(false)
    const view = deque.reversed()
    expect(view.equals(view)).toBe(true)
    const list = new ArrayList([1, 2])
    expect(deque.equals(list)).toBe(false)
    expect(list.equals(deque)).toBe(false)
    expect(hashCode(deque)).toBe(hashCode(deque))
    expect('hashCode' in deque).toBe(false)
  })

  it('builds from nothing, null or any iterable, and from() takes mapFn [008 S6-AC3]', () => {
    expect(new ArrayDeque().size).toBe(0)
    expect(new ArrayDeque(undefined).size).toBe(0)
    expect(new ArrayDeque(null).size).toBe(0)
    expect(new ArrayDeque('abc').toArray()).toEqual(['a', 'b', 'c'])
    expect(() => new ArrayDeque(5 as never)).toThrow(TypeError)
    expect(messageOf(() => new ArrayDeque(5 as never))).toBe(
      'ArrayDeque: elements is not iterable (5)',
    )
    expect(() => ArrayDeque.from(null as never)).toThrow(TypeError)
    expect(() => ArrayDeque.from({ length: 1 } as never)).toThrow(TypeError)
    const receiver = { k: 10 }
    expect(
      ArrayDeque.from(
        new Set([1, 2]),
        function (this: typeof receiver, n, i) {
          return n * this.k + i
        },
        receiver,
      ).toArray(),
    ).toEqual([10, 21])
    let read = false
    const tracking = {
      [Symbol.iterator]() {
        read = true
        return [1][Symbol.iterator]()
      },
    }
    expect(() => ArrayDeque.from(tracking, 1 as never)).toThrow(TypeError)
    expect(read).toBe(false)
  })

  it('copy is independent and keeps the order [008 S6-AC4]', () => {
    const deque = new ArrayDeque([1, 2, 3])
    deque.poll()
    deque.add(4)
    const copy = deque.copy()
    expect(copy).toBeInstanceOf(ArrayDeque)
    expect(copy.toArray()).toEqual([2, 3, 4])
    copy.pop()
    expect(deque.toArray()).toEqual([2, 3, 4])
  })

  it('prints in Node style', () => {
    const deque = new ArrayDeque<unknown>([1, 'a'])
    expect(String(deque)).toBe("ArrayDeque(2) [1, 'a']")
    expect(inspect(deque)).toBe("ArrayDeque(2) [ 1, 'a' ]")
    expect(JSON.stringify(deque)).toBe('[1,"a"]')
    expect(Object.prototype.toString.call(deque)).toBe('[object ArrayDeque]')
  })

  it('instanceof is true for deques and false for the reversed view [008 S7-AC2]', () => {
    const deque = new ArrayDeque([1])
    expect(deque instanceof ArrayDeque).toBe(true)
    expect(deque.reversed() instanceof ArrayDeque).toBe(false)
    expect([] instanceof ArrayDeque).toBe(false)
    expect(new ArrayList() instanceof ArrayDeque).toBe(false)
  })
})

// Contract suites for the deque and its reversed view.
const deques: ReadonlyArray<[string, (initial?: Iterable<number>) => Deque<number>]> = [
  ['ArrayDeque', (initial) => new ArrayDeque<number>(initial)],
  ['ReversedDeque', (initial) => new ArrayDeque<number>([...(initial ?? [])].reverse()).reversed()],
]
for (const [name, make] of deques) {
  describeCollection(name, make as never, {
    iteration: 'fail-fast',
    brackets: 'list',
    nullElements: 'reject',
    peers: [(initial?: Iterable<unknown>) => new ArrayList<unknown>(initial)],
  })
  describeSequencedCollection(name, make as never)
  describeQueue(name, make)
}
runContractPair('ArrayDeque', lib)

describe('ArrayDeque — reference model', () => {
  it('matches a native array under seeded random operations [008 S6-AC5]', () => {
    for (const seed of [1, 2, 3]) {
      runDequeReferenceModel({ seed, steps: 500, make: () => new ArrayDeque<number>() })
      runDequeReferenceModel({ seed, steps: 500, make: () => new ArrayDeque<number>().reversed() })
      runReferenceModel({ seed, steps: 300, make: () => new ArrayDeque<number>(), model: 'array' })
    }
  })
})

describe('clear on an empty deque', () => {
  it('changes no revision on an empty ArrayDeque, its reversed view or a LinkedList [036 S2-AC3]', () => {
    for (const make of [() => new ArrayDeque<number>(), () => new LinkedList<number>()]) {
      const deque = make()
      for (let i = 0; i < 100; i++) deque.add(i)
      while (deque.size > 0) deque.poll()
      const revision = deque.revision
      const iterator = deque[Symbol.iterator]()
      deque.clear()
      deque.reversed().clear()
      expect(deque.revision).toBe(revision)
      expect(iterator.next().done).toBe(true)
      deque.add(1)
      expect([...deque]).toEqual([1])
      deque.reversed().clear()
      expect(deque.size).toBe(0)
      expect(deque.revision).toBeGreaterThan(revision)
    }
  })
})

describe('ArrayDeque — growth', () => {
  /** A deque whose front sits `offset` places into its storage, holding `size` elements. */
  function shifted(offset: number, size: number): { deque: ArrayDeque<number>; model: number[] } {
    const deque = new ArrayDeque<number>()
    for (let i = 0; i < offset; i++) deque.add(-1)
    for (let i = 0; i < offset; i++) deque.poll()
    const model: number[] = []
    for (let i = 0; i < size; i++) {
      deque.add(i)
      model.push(i)
    }
    return { deque, model }
  }

  it('keeps the order when adds at the back grow a wrapped or unwrapped deque [044 S5-AC4]', () => {
    for (const offset of [0, 3, 7]) {
      const { deque, model } = shifted(offset, 8)
      for (let i = 8; i < 70; i++) {
        deque.add(i)
        model.push(i)
        expect(deque.size).toBe(model.length)
      }
      expect([...deque]).toEqual(model)
      expect([...deque.reversed()]).toEqual(model.slice().reverse())
    }
  })

  it('keeps the order when adds at the front grow a wrapped or unwrapped deque [044 S5-AC4]', () => {
    for (const offset of [0, 3, 7]) {
      const { deque, model } = shifted(offset, 8)
      for (let i = 0; i < 70; i++) {
        deque.addFirst(-i - 1)
        model.unshift(-i - 1)
      }
      expect(deque.size).toBe(model.length)
      expect([...deque]).toEqual(model)
      expect(deque.peek()).toBe(-70)
      expect(deque.peekLast()).toBe(7)
    }
  })

  it('keeps the order when addAll and from double the deque several times [044 S5-AC4]', () => {
    const source = Array.from({ length: 1000 }, (_, i) => i * 3)
    expect([...ArrayDeque.from(source)]).toEqual(source)
    expect([...new ArrayDeque(source)]).toEqual(source)
    const { deque, model } = shifted(5, 6)
    expect(deque.addAll(source)).toBe(true)
    expect([...deque]).toEqual(model.concat(source))
    deque.addFirst(-1)
    expect(deque.peek()).toBe(-1)
    expect(deque.size).toBe(1007)
  })

  it('grows again after clear, keeping the order [044 S5-AC4]', () => {
    const deque = new ArrayDeque<number>()
    for (let i = 0; i < 100; i++) deque.add(i)
    deque.clear()
    for (let i = 0; i < 4; i++) deque.add(i)
    for (let i = 0; i < 3; i++) deque.poll()
    const model = [3]
    for (let i = 0; i < 40; i++) {
      if (i % 2 === 0) {
        deque.add(i + 100)
        model.push(i + 100)
      } else {
        deque.addFirst(-i)
        model.unshift(-i)
      }
    }
    expect([...deque]).toEqual(model)
    expect(deque.size).toBe(41)
  })
})

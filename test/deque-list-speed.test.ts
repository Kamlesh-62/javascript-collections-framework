import { describe, expect, it } from 'vitest'
import {
  ArrayDeque,
  ConcurrentModificationError,
  type Deque,
  LinkedList,
  type LinkedListNode,
  NullElementError,
} from '../src/index'
import { integer, pick, seeded } from './support/random'

// The behaviour of `ArrayDeque` and `LinkedList` that their internal fast paths must keep: which
// elements are refused and with what message, what is stored, when `revision` changes, where
// fail-fast iteration throws, and what every public method returns, checked against a model built
// on a native array.

function caught(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  return undefined
}

/** `<name>: <message>` of what `fn` throws, or `'none'`. */
function thrown(fn: () => unknown): string {
  const error = caught(fn)
  return error === undefined ? 'none' : `${(error as Error).name}: ${(error as Error).message}`
}

const ADDERS = ['add', 'push', 'addLast', 'addFirst'] as const

describe('ArrayDeque refuses null and undefined', () => {
  it('throws NullElementError from every adder of the deque and its reversed view, changing nothing [051 S1-AC1]', () => {
    for (const missing of [null, undefined]) {
      const deque = new ArrayDeque<number>([1, 2, 3])
      const revision = deque.revision
      for (const method of ADDERS) {
        expect(thrown(() => deque[method](missing as unknown as number))).toBe(
          `NullElementError: ArrayDeque.${method}: ${missing} is not allowed as an element`,
        )
        expect(thrown(() => deque.reversed()[method](missing as unknown as number))).toBe(
          `NullElementError: ReversedDeque.${method}: ${missing} is not allowed as an element`,
        )
      }
      expect(deque.toArray()).toEqual([1, 2, 3])
      expect(deque.size).toBe(3)
      expect(deque.revision).toBe(revision)
    }
  })

  it('throws NullElementError from addAll, the constructor and from, adding nothing [051 S1-AC1]', () => {
    const deque = new ArrayDeque<number>([1, 2])
    const revision = deque.revision
    expect(thrown(() => deque.addAll([3, null as unknown as number, 4]))).toBe(
      'NullElementError: ArrayDeque.addAll: null is not allowed as an element',
    )
    expect(thrown(() => deque.reversed().addAll([3, undefined as unknown as number]))).toBe(
      'NullElementError: ReversedDeque.addAll: undefined is not allowed as an element',
    )
    expect(deque.toArray()).toEqual([1, 2])
    expect(deque.revision).toBe(revision)
    expect(thrown(() => new ArrayDeque([1, null]))).toBe(
      'NullElementError: ArrayDeque: null is not allowed as an element',
    )
    expect(thrown(() => ArrayDeque.from([1, undefined]))).toBe(
      'NullElementError: ArrayDeque.from: undefined is not allowed as an element',
    )
    expect(thrown(() => ArrayDeque.from([1, 2], (x) => (x === 2 ? null : x)))).toBe(
      'NullElementError: ArrayDeque.from: null is not allowed as an element',
    )
  })
})

describe('LinkedList stores null and undefined', () => {
  it('stores them through every adder and returns them from every remover and reader [051 S1-AC3]', () => {
    for (const method of ADDERS) {
      const list = new LinkedList<number | null | undefined>()
      list[method](null)
      list[method](undefined)
      expect(list.size).toBe(2)
      expect(list.has(null)).toBe(true)
      expect(list.has(undefined)).toBe(true)
    }
    const list = new LinkedList<number | null | undefined>([null, 1, undefined])
    expect(list.peek()).toBe(null)
    expect(list.peekLast()).toBe(undefined)
    expect(list.poll()).toBe(null)
    expect(list.pop()).toBe(undefined)
    list.push(undefined)
    list.addFirst(null)
    expect(list.removeFirst()).toBe(null)
    expect(list.removeLast()).toBe(undefined)
    expect(list.toArray()).toEqual([1])
    expect(list.toString()).toBe('LinkedList(1) [1]')
    expect(String(new LinkedList([null, undefined]))).toBe('LinkedList(2) [null, undefined]')
  })
})

// ── The seeded model ──

type Value = number | null | undefined

/** One stored element of the model; a list node handle stands for exactly one cell. */
interface Cell {
  v: Value
  removed: boolean
}

interface OpenIterator {
  it: Iterator<Value>
  cells: Cell[]
  pos: number
  stale: boolean
  done: boolean
}

interface OpenCursor {
  c: { hasNext(): boolean; next(): Value; remove(): void }
  idx: number
  last: boolean
  stale: boolean
}

type Kind = 'ArrayDeque' | 'LinkedList'

/** A deque that can also be copied, as both classes are. */
type Copyable = Deque<Value> & { copy(): Copyable }

const NOUN: Record<Kind, string> = { ArrayDeque: 'deque', LinkedList: 'list' }

function format(tag: string, values: readonly Value[]): string {
  return `${tag}(${values.length}) [${values.map((v) => String(v)).join(', ')}]`
}

/**
 * Runs `steps` random calls on a collection of `kind` against an array model and checks every
 * result, error, size, iteration and `revision` change.
 */
function runModel(kind: Kind, seed: number, steps: number): void {
  const random = seeded(seed)
  const Class = (kind === 'ArrayDeque' ? ArrayDeque : LinkedList) as unknown as {
    new (items?: Iterable<Value>): Copyable
    from(items: Iterable<Value>, mapFn?: (x: Value, i: number) => Value): Copyable
  }
  const storesEmpty = kind === 'LinkedList'
  const value = (): Value => {
    const r = random()
    if (r < 0.03) return null
    if (r < 0.06) return undefined
    return integer(random, 0, 12)
  }
  const plain = (): number => integer(random, 0, 12)

  // Construction.
  const start: number[] = Array.from({ length: integer(random, 0, 20) }, plain)
  let col: Copyable
  switch (integer(random, 0, 4)) {
    case 0:
      col = new Class()
      for (const x of start) col.push(x)
      break
    case 1:
      col = new Class(start)
      break
    case 2:
      col = Class.from(start)
      break
    case 3:
      col = Class.from(
        start.map((x) => x - 1),
        (x) => (x as number) + 1,
      )
      break
    default:
      col = new Class(start).copy()
  }
  let model: Cell[] = start.map((v) => ({ v, removed: false }))
  const handles = new Map<LinkedListNode<Value>, Cell>()
  const foreign = new LinkedList<Value>([1, 2])
  const iterators: OpenIterator[] = []
  const cursors: OpenCursor[] = []

  const values = (): Value[] => model.map((c) => c.v)
  const label = (viewed: boolean): string => (viewed ? 'ReversedDeque' : kind)
  const empty = (viewed: boolean, method: string): string =>
    `NoSuchElementError: ${label(viewed)}.${method}: the ${viewed ? 'deque' : NOUN[kind]} is empty`
  const refused = (viewed: boolean, method: string, x: Value): string =>
    `NullElementError: ${label(viewed)}.${method}: ${x} is not allowed as an element`
  const structural = (keep?: OpenCursor): void => {
    for (const i of iterators) i.stale = true
    for (const c of cursors) if (c !== keep) c.stale = true
  }
  const remove = (cell: Cell): void => {
    cell.removed = true
    model.splice(model.indexOf(cell), 1)
  }
  const cellOf = (handle: LinkedListNode<Value> | undefined, expected: Cell | undefined): void => {
    if (expected === undefined) {
      expect(handle).toBe(undefined)
      return
    }
    expect(handle).not.toBe(undefined)
    const known = handles.get(handle as LinkedListNode<Value>)
    if (known === undefined) handles.set(handle as LinkedListNode<Value>, expected)
    else expect(known).toBe(expected)
  }

  for (let step = 0; step < steps; step++) {
    const context = `${kind} seed ${seed} step ${step}`
    const viewed = random() < 0.25
    const target = viewed ? (col.reversed() as Deque<Value>) : col
    // The model seen from `target`: the view runs back to front.
    const ordered = (): Cell[] => (viewed ? model.slice().reverse() : model.slice())
    const front = (): Cell | undefined => (viewed ? model[model.length - 1] : model[0])
    const back = (): Cell | undefined => (viewed ? model[0] : model[model.length - 1])
    const pushFront = (cell: Cell): void => {
      if (viewed) model.push(cell)
      else model.unshift(cell)
    }
    const pushBack = (cell: Cell): void => {
      if (viewed) model.unshift(cell)
      else model.push(cell)
    }
    const revision = col.revision
    let changed = false
    const op = integer(random, 0, kind === 'LinkedList' ? 33 : 25)
    switch (op) {
      case 0:
      case 1:
      case 2:
      case 3: {
        const method = ADDERS[op] as (typeof ADDERS)[number]
        const x = value()
        if (!storesEmpty && (x === null || x === undefined)) {
          expect(
            thrown(() => target[method](x)),
            context,
          ).toBe(refused(viewed, method, x))
        } else {
          expect(target[method](x), context).toBe(target)
          const cell = { v: x, removed: false }
          if (method === 'addFirst') pushFront(cell)
          else pushBack(cell)
          changed = true
        }
        break
      }
      case 4:
      case 5: {
        const method = op === 4 ? 'poll' : 'pop'
        const cell = op === 4 ? front() : back()
        expect(target[method](), context).toBe(cell?.v)
        if (cell !== undefined) {
          remove(cell)
          changed = true
        }
        break
      }
      case 6:
      case 7: {
        const method = op === 6 ? 'removeFirst' : 'removeLast'
        const cell = op === 6 ? front() : back()
        if (cell === undefined) {
          expect(
            thrown(() => target[method]()),
            context,
          ).toBe(empty(viewed, method))
        } else {
          expect(target[method](), context).toBe(cell.v)
          remove(cell)
          changed = true
        }
        break
      }
      case 8:
        expect(target.peek(), context).toBe(front()?.v)
        expect(target.peekLast(), context).toBe(back()?.v)
        break
      case 9: {
        const method = random() < 0.5 ? 'getFirst' : 'getLast'
        const cell = method === 'getFirst' ? front() : back()
        if (cell === undefined)
          expect(
            thrown(() => target[method]()),
            context,
          ).toBe(empty(viewed, method))
        else expect(target[method](), context).toBe(cell.v)
        break
      }
      case 10: {
        const x = value()
        expect(target.has(x), context).toBe(model.some((c) => Object.is(c.v, x) || c.v === x))
        break
      }
      case 11: {
        const x = value()
        const cell = ordered().find((c) => Object.is(c.v, x) || c.v === x)
        expect(target.delete(x), context).toBe(cell !== undefined)
        if (cell !== undefined) {
          remove(cell)
          changed = true
        }
        break
      }
      case 12:
      case 13: {
        const xs = Array.from({ length: integer(random, 0, 3) }, value)
        const hit = (c: Cell) => xs.some((x) => Object.is(c.v, x) || c.v === x)
        const doomed = model.filter((c) => (op === 12 ? hit(c) : !hit(c)))
        const result = op === 12 ? target.removeAll(xs) : target.retainAll(xs)
        expect(result, context).toBe(doomed.length > 0)
        for (const c of doomed) remove(c)
        changed = doomed.length > 0
        break
      }
      case 14: {
        const m = integer(random, 2, 4)
        const doomed = model.filter((c) => typeof c.v === 'number' && c.v % m === 0)
        expect(
          target.removeIf((x) => typeof x === 'number' && x % m === 0),
          context,
        ).toBe(doomed.length > 0)
        for (const c of doomed) remove(c)
        changed = doomed.length > 0
        break
      }
      case 15: {
        const xs = Array.from({ length: integer(random, 0, 4) }, value)
        const refusedAt = storesEmpty ? -1 : xs.findIndex((x) => x === null || x === undefined)
        if (refusedAt >= 0) {
          expect(
            thrown(() => target.addAll(xs)),
            context,
          ).toBe(refused(viewed, 'addAll', xs[refusedAt]))
        } else {
          expect(target.addAll(xs), context).toBe(xs.length > 0)
          for (const x of xs) pushBack({ v: x, removed: false })
          changed = xs.length > 0
        }
        break
      }
      case 16:
        if (random() < 0.3) {
          target.clear()
          changed = model.length > 0
          for (const c of model) c.removed = true
          model = []
        }
        break
      case 17: {
        const view = ordered().map((c) => c.v)
        expect(target.toArray(), context).toEqual(view)
        expect([...target], context).toEqual(view)
        expect(target.size, context).toBe(model.length)
        expect(target.isEmpty(), context).toBe(model.length === 0)
        expect(target.toString(), context).toBe(format(label(viewed), view))
        expect(JSON.stringify(target), context).toBe(JSON.stringify(view))
        const seen: Value[] = []
        target.forEach((x) => {
          seen.push(x)
        })
        expect(seen, context).toEqual(view)
        break
      }
      case 18:
        expect(col.equals(col), context).toBe(true)
        expect(col.equals(col.copy()), context).toBe(false)
        expect(col.copy().toArray(), context).toEqual(values())
        break
      case 19:
      case 20: {
        if (iterators.length < 4) {
          iterators.push({
            it: target[Symbol.iterator](),
            cells: ordered(),
            pos: 0,
            stale: false,
            done: false,
          })
        }
        break
      }
      case 21:
      case 22: {
        const open = iterators.length === 0 ? undefined : pick(random, iterators)
        if (open === undefined) break
        if (open.done) {
          expect(open.it.next(), context).toEqual({ done: true, value: undefined })
        } else if (open.stale) {
          expect(
            caught(() => open.it.next()),
            context,
          ).toBeInstanceOf(ConcurrentModificationError)
          iterators.splice(iterators.indexOf(open), 1)
        } else if (open.pos < open.cells.length) {
          expect(open.it.next(), context).toEqual({
            done: false,
            value: (open.cells[open.pos++] as Cell).v,
          })
        } else {
          expect(open.it.next(), context).toEqual({ done: true, value: undefined })
          open.done = true
        }
        break
      }
      case 23: {
        if (cursors.length < 3) cursors.push({ c: col.cursor(), idx: 0, last: false, stale: false })
        break
      }
      case 24:
      case 25: {
        const open = cursors.length === 0 ? undefined : pick(random, cursors)
        if (open === undefined) break
        const action = integer(random, 0, 2)
        if (open.stale) {
          if (action === 0) break // A stale cursor's hasNext() is not modelled.
          const call = action === 1 ? () => open.c.next() : () => open.c.remove()
          expect(caught(call), context).toBeInstanceOf(ConcurrentModificationError)
          cursors.splice(cursors.indexOf(open), 1)
        } else if (action === 0) {
          expect(open.c.hasNext(), context).toBe(open.idx < model.length)
        } else if (action === 1) {
          if (open.idx < model.length) {
            expect(open.c.next(), context).toBe((model[open.idx] as Cell).v)
            open.idx++
            open.last = true
          } else {
            expect((caught(() => open.c.next()) as Error).name, context).toBe('NoSuchElementError')
          }
        } else if (!open.last) {
          expect((caught(() => open.c.remove()) as Error).name, context).toBe('IllegalStateError')
        } else {
          open.c.remove()
          remove(model[open.idx - 1] as Cell)
          open.idx--
          open.last = false
          structural(open)
          changed = true
        }
        break
      }
      default: {
        // The node-handle API of a linked list.
        const list = col as unknown as LinkedList<Value>
        const known = [...handles.keys()]
        const any = (): LinkedListNode<Value> | undefined =>
          known.length === 0 ? undefined : pick(random, known)
        switch (op) {
          case 26:
            cellOf(list.firstNode(), model[0])
            cellOf(list.lastNode(), model[model.length - 1])
            break
          case 27: {
            const x = value()
            const first = random() < 0.5
            const cell = { v: x, removed: false }
            const handle = first ? list.addFirstNode(x) : list.addLastNode(x)
            if (first) model.unshift(cell)
            else model.push(cell)
            cellOf(handle, cell)
            changed = true
            break
          }
          case 28: {
            const handle = any()
            if (handle === undefined) break
            const cell = handles.get(handle) as Cell
            const before = random() < 0.5
            const method = before ? 'insertBefore' : 'insertAfter'
            const x = value()
            if (cell.removed) {
              expect(
                thrown(() => list[method](handle, x)),
                context,
              ).toBe(
                `IllegalArgumentError: LinkedList.${method}: node is not a node of this list (object)`,
              )
            } else {
              const added = { v: x, removed: false }
              const at = model.indexOf(cell)
              const made = list[method](handle, x)
              model.splice(before ? at : at + 1, 0, added)
              cellOf(made, added)
              changed = true
            }
            break
          }
          case 29: {
            const handle = any()
            if (handle === undefined) break
            const cell = handles.get(handle) as Cell
            if (cell.removed) {
              expect(
                thrown(() => list.removeNode(handle)),
                context,
              ).toBe(
                'IllegalArgumentError: LinkedList.removeNode: node is not a node of this list (object)',
              )
            } else {
              list.removeNode(handle)
              remove(cell)
              changed = true
            }
            break
          }
          case 30:
          case 31: {
            const handle = any()
            if (handle === undefined) break
            const cell = handles.get(handle) as Cell
            if (op === 30) {
              expect(handle.value, context).toBe(cell.v)
              const at = model.indexOf(cell)
              cellOf(handle.next, cell.removed ? undefined : model[at + 1])
              cellOf(handle.previous, cell.removed || at === 0 ? undefined : model[at - 1])
            } else if (cell.removed) {
              expect(
                thrown(() => {
                  handle.value = 1
                }),
                context,
              ).toBe(
                'IllegalStateError: LinkedListNode.value: the node has been removed from its list',
              )
            } else {
              const x = value()
              handle.value = x
              cell.v = x
              // A value write is not a structural change: open iterators stay valid.
              expect(col.revision, context).not.toBe(revision)
            }
            break
          }
          case 32: {
            const other = foreign.firstNode() as LinkedListNode<Value>
            expect(
              thrown(() => list.insertAfter(other, 1)),
              context,
            ).toBe(
              'IllegalArgumentError: LinkedList.insertAfter: node is not a node of this list (object)',
            )
            break
          }
          default:
            break
        }
      }
    }
    if (changed) structural()
    if (op === 31 && !changed) {
      // Checked above.
    } else if (changed) {
      expect(col.revision, context).not.toBe(revision)
    } else {
      expect(col.revision, context).toBe(revision)
    }
    if (step % 64 === 0) expect(col.toArray(), context).toEqual(values())
  }
  expect(col.toArray()).toEqual(values())
}

describe('ArrayDeque and LinkedList against an array model', () => {
  for (const kind of ['ArrayDeque', 'LinkedList'] as const) {
    for (let seed = 1; seed <= 10; seed++) {
      it(`${kind} matches the model over 10,000 seeded calls, seed ${seed} [051 S1-AC7]`, () => {
        runModel(kind, seed * 7919 + (kind === 'LinkedList' ? 1 : 0), 10_000)
      })
    }
  }

  it('keeps an open iterator valid across a value write on a list [051 S1-AC7]', () => {
    const list = new LinkedList([1, 2, 3])
    const iterator = list[Symbol.iterator]()
    expect(iterator.next().value).toBe(1)
    const revision = list.revision
    ;(list.firstNode() as LinkedListNode<number>).value = 9
    expect(list.revision).not.toBe(revision)
    expect(iterator.next().value).toBe(2)
    list.push(4)
    expect(caught(() => iterator.next())).toBeInstanceOf(ConcurrentModificationError)
  })

  it('leaves a finished iterator finished after a change [051 S1-AC7]', () => {
    for (const col of [new ArrayDeque([1]), new LinkedList([1])]) {
      const iterator = col[Symbol.iterator]()
      iterator.next()
      expect(iterator.next().done).toBe(true)
      col.push(2)
      expect(iterator.next()).toEqual({ done: true, value: undefined })
    }
  })

  it('keeps a large deque and list exact through 100,000 alternating front and back calls [051 S2-AC3]', () => {
    // The constant bound itself is checked on the engine in the internal test, and for the list
    // below by the nodes each call leaves untouched.
    for (const col of [new ArrayDeque<number>(), new LinkedList<number>()]) {
      for (let i = 0; i < 100_000; i++) col.push(i)
      for (let i = 0; i < 100_000; i++) {
        col.addFirst(-i)
        expect(col.pop()).toBe(99_999 - i)
      }
      expect(col.size).toBe(100_000)
      expect(col.peek()).toBe(-99_999)
      expect(col.poll()).toBe(-99_999)
      expect(col.size).toBe(99_999)
    }
  })

  it('touches only the end nodes of a list on each add and remove at the ends [051 S2-AC3]', () => {
    const list = new LinkedList<number>(Array.from({ length: 1_000 }, (_, i) => i))
    const first = list.firstNode() as LinkedListNode<number>
    const second = first.next as LinkedListNode<number>
    const last = list.lastNode() as LinkedListNode<number>
    const middle = second.next as LinkedListNode<number>
    const before = [middle.previous, middle.next]
    list.push(1_000)
    list.addFirst(-1)
    list.add(1_001)
    list.addLast(1_002)
    expect(list.pop()).toBe(1_002)
    expect(list.poll()).toBe(-1)
    expect(list.removeFirst()).toBe(0)
    expect(list.removeLast()).toBe(1_001)
    // Every node away from the ends keeps its neighbours, whatever the length.
    expect([middle.previous, middle.next]).toEqual(before)
    expect(second.previous).toBe(undefined)
    expect(list.firstNode()).toBe(second)
    expect(last.next).toBe(list.lastNode())
  })

  it('reports refused elements as NullElementError [051 S1-AC1]', () => {
    expect(
      caught(() => new ArrayDeque<number>().addFirst(null as unknown as number)),
    ).toBeInstanceOf(NullElementError)
  })
})

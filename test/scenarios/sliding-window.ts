// A sliding window over a seeded stream, kept in an `ArrayDeque` and in a `LinkedList` through
// node handles, against `Array.prototype.slice` after every step.

import { ArrayDeque, LinkedList, type LinkedListNode } from '../../src/index'
import type { WorkloadSizes } from '../stress/config'
import { integer, seeded } from '../support/random'
import { same, sameSequence } from './check'

export function run(sizes: WorkloadSizes, seed: number): void {
  const random = seeded(seed)
  const stream: number[] = new Array(sizes.stream)
  for (let i = 0; i < stream.length; i++) stream[i] = integer(random, -1_000, 1_000)
  const width = sizes.window

  const deque = new ArrayDeque<number>()
  const linked = new LinkedList<number>()
  const handles: Array<LinkedListNode<number>> = []
  let dequeSum = 0
  for (let i = 0; i < stream.length; i++) {
    const x = stream[i] as number
    deque.push(x)
    dequeSum += x
    handles.push(linked.addLastNode(x))
    if (deque.size > width) {
      const out = deque.poll() as number
      same(out, stream[i - width], `step ${i} poll`)
      dequeSum -= out
      const node = handles.shift() as LinkedListNode<number>
      same(linked.removeNode(node), stream[i - width], `step ${i} removeNode`)
    }
    const expected = stream.slice(Math.max(0, i + 1 - width), i + 1)
    sameSequence(deque, expected, `step ${i} ArrayDeque`)
    sameSequence(linked, expected, `step ${i} LinkedList`)
    same(deque.peek(), expected[0], `step ${i} peek`)
    same(linked.peekLast(), x, `step ${i} peekLast`)
    same(
      dequeSum,
      expected.reduce((a, b) => a + b, 0),
      `step ${i} sum`,
    )
  }
}

// Factories for every kind of list the contract suites run against: the array list itself and
// views over it (sub-list, reversed, and chains of both). Each holds exactly `initial`, in order.

import { ArrayList } from '../../src/collections/array-list'
import type { List } from '../../src/interfaces/list'

export type ListFactory = (initial?: Iterable<unknown>) => List<unknown>

export const arrayList: ListFactory = (initial) => new ArrayList<unknown>(initial)

export const subList: ListFactory = (initial) => {
  const items = [...(initial ?? [])]
  return new ArrayList<unknown>(['<', ...items, '>']).subList(1, 1 + items.length)
}

export const nestedSubList: ListFactory = (initial) => {
  const items = [...(initial ?? [])]
  return new ArrayList<unknown>(['<<', '<', ...items, '>', '>>'])
    .subList(1, 3 + items.length)
    .subList(1, 1 + items.length)
}

export const reversedList: ListFactory = (initial) =>
  new ArrayList<unknown>([...(initial ?? [])].reverse()).reversed()

export const reversedSubList: ListFactory = (initial) => {
  const items = [...(initial ?? [])].reverse()
  return new ArrayList<unknown>(['<', ...items, '>']).subList(1, 1 + items.length).reversed()
}

export const subListOfReversed: ListFactory = (initial) => {
  const items = [...(initial ?? [])].reverse()
  return new ArrayList<unknown>(['<', ...items, '>']).reversed().subList(1, 1 + items.length)
}

export const ALL_LISTS: ReadonlyArray<[string, ListFactory]> = [
  ['ArrayList', arrayList],
  ['SubList', subList],
  ['SubList', nestedSubList],
  ['ReversedList', reversedList],
  ['ReversedList', reversedSubList],
  ['SubList', subListOfReversed],
]

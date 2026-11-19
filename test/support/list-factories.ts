// Factories for every kind of list the contract suites run against: the array list itself and
// views over it (sub-list, reversed, and chains of both). Each holds exactly `initial`, in order.

import { ArrayList } from '../../src/index'
import type { List } from '../../src/interfaces/list'

export type ListFactory = (initial?: Iterable<unknown>) => List<unknown>

/** The array list and each kind of view over it, built from the given `ArrayList` class. */
export function listFactories(lib: {
  readonly ArrayList: typeof ArrayList
}): ReadonlyArray<[string, ListFactory]> {
  const Lists = lib.ArrayList

  const arrayList: ListFactory = (initial) => new Lists<unknown>(initial)

  const subList: ListFactory = (initial) => {
    const items = [...(initial ?? [])]
    return new Lists<unknown>(['<', ...items, '>']).subList(1, 1 + items.length)
  }

  const nestedSubList: ListFactory = (initial) => {
    const items = [...(initial ?? [])]
    return new Lists<unknown>(['<<', '<', ...items, '>', '>>'])
      .subList(1, 3 + items.length)
      .subList(1, 1 + items.length)
  }

  const reversedList: ListFactory = (initial) =>
    new Lists<unknown>([...(initial ?? [])].reverse()).reversed()

  const reversedSubList: ListFactory = (initial) => {
    const items = [...(initial ?? [])].reverse()
    return new Lists<unknown>(['<', ...items, '>']).subList(1, 1 + items.length).reversed()
  }

  const subListOfReversed: ListFactory = (initial) => {
    const items = [...(initial ?? [])].reverse()
    return new Lists<unknown>(['<', ...items, '>']).reversed().subList(1, 1 + items.length)
  }

  return [
    ['ArrayList', arrayList],
    ['SubList', subList],
    ['SubList', nestedSubList],
    ['ReversedList', reversedList],
    ['ReversedList', reversedSubList],
    ['SubList', subListOfReversed],
  ]
}

export const ALL_LISTS: ReadonlyArray<[string, ListFactory]> = listFactories({ ArrayList })

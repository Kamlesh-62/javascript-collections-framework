// The core of each framework recipe, without the framework: what a store, a ref or a rune sees.
// The same recipes run against the real frameworks in the nightly fixture.

import { describe, expect, it } from 'vitest'
import { ArrayList, TreeMap } from '../../src/index'

/** A minimal external store in the shape `useSyncExternalStore` expects. */
function store<T extends { readonly revision: number }>(collection: T) {
  const listeners = new Set<() => void>()
  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => collection.revision,
    change(update: (c: T) => void) {
      update(collection)
      for (const listener of listeners) listener()
    },
  }
}

describe('framework recipes, framework-free', () => {
  it('a revision snapshot changes after add and after an in-place set, as useSyncExternalStore needs [021 S2-AC1]', () => {
    const items = store(new ArrayList(['a']))
    const snapshots: number[] = []
    items.subscribe(() => snapshots.push(items.getSnapshot()))
    const first = items.getSnapshot()
    items.change((list) => list.add('b'))
    items.change((list) => list.set(0, 'z'))
    expect(snapshots).toHaveLength(2)
    expect(new Set([first, ...snapshots]).size).toBe(3)
    const copy = new ArrayList(['a'])
    expect(copy.copy()).not.toBe(copy) // copy-on-write gives a new reference
  })

  it('a shallow ref keeps the same reference across a change, while revision gives the change signal [021 S2-AC2]', () => {
    const ref = { value: new TreeMap([[1, 'a']]) }
    const reference = ref.value
    const before = ref.value.revision
    ref.value.set(2, 'b')
    expect(ref.value).toBe(reference) // nothing for a reference check to see: trigger explicitly
    expect(ref.value.revision).not.toBe(before) // or watch revision
    const sameValue = ref.value.revision
    ref.value.get(1)
    expect(ref.value.revision).toBe(sameValue) // reads do not trigger
  })

  it('a revision-driven state value changes whenever the collection does [021 S2-AC3]', () => {
    const list = new ArrayList<number>()
    let state = list.revision
    const sync = () => {
      const next = list.revision
      const changed = next !== state
      state = next
      return changed
    }
    list.add(1)
    expect(sync()).toBe(true)
    expect(sync()).toBe(false)
    list.set(0, 2)
    expect(sync()).toBe(true)
  })
})

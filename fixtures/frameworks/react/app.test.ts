// React: a component reads a collection through useSyncExternalStore with `revision` as the
// snapshot, so it re-renders after `add` and after an in-place `set`.

import { ArrayList } from 'javascript-collections-framework'
import { act, createElement, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** The recipe: a collection plus listeners, exposing `revision` as the snapshot. */
function collectionStore<T extends { readonly revision: number }>(collection: T) {
  const listeners = new Set<() => void>()
  return {
    collection,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => collection.revision,
    update(change: (c: T) => void) {
      change(collection)
      for (const listener of listeners) listener()
    },
  }
}

describe('React recipe', () => {
  it('re-renders after add and after an in-place set [021 S2-AC1]', () => {
    const store = collectionStore(new ArrayList(['a']))
    let renders = 0
    function Items() {
      useSyncExternalStore(store.subscribe, store.getSnapshot)
      renders++
      return createElement('p', null, store.collection.toArray().join(','))
    }
    const container = document.createElement('div')
    const root = createRoot(container)
    act(() => root.render(createElement(Items)))
    expect(container.textContent).toBe('a')
    act(() => store.update((list) => list.add('b')))
    expect(container.textContent).toBe('a,b')
    act(() => store.update((list) => list.set(0, 'z')))
    expect(container.textContent).toBe('z,b')
    expect(renders).toBe(3)
    act(() => root.unmount())
  })

  it('re-renders with copy-on-write state [021 S2-AC1]', () => {
    let setList: (next: ArrayList<string>) => void = () => {}
    function Items({ initial }: { initial: ArrayList<string> }) {
      const [list, set] = useState(initial)
      setList = set
      return createElement('p', null, list.toArray().join(','))
    }
    const container = document.createElement('div')
    const root = createRoot(container)
    let current = new ArrayList(['a'])
    act(() => root.render(createElement(Items, { initial: current })))
    act(() => {
      current.add('b')
      setList(current) // the same reference: React keeps the old render
    })
    expect(container.textContent).toBe('a')
    act(() => {
      current = current.copy()
      setList(current)
    })
    expect(container.textContent).toBe('a,b')
    act(() => root.unmount())
  })
})

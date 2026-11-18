// Vue 3: `reactive` leaves a library collection unwrapped, so an in-place change alone does not
// re-render; the shallowRef + triggerRef recipe does.

import { ArrayList } from 'javascript-collections-framework'
import { describe, expect, it } from 'vitest'
import { createApp, h, isReactive, nextTick, reactive, shallowRef, triggerRef } from 'vue'

describe('Vue recipe', () => {
  it('reactive() returns the collection unwrapped [021 S2-AC2]', () => {
    const list = new ArrayList([1])
    const state = reactive({ list })
    expect(isReactive(state.list)).toBe(false)
    expect(state.list).toBe(list)
  })

  it('an in-place change alone does not re-render; triggerRef does [021 S2-AC2]', async () => {
    const items = shallowRef(new ArrayList(['a']))
    const app = createApp({ render: () => h('p', items.value.toArray().join(',')) })
    const container = document.createElement('div')
    app.mount(container)
    expect(container.textContent).toBe('a')
    items.value.add('b')
    await nextTick()
    expect(container.textContent).toBe('a') // Vue did not see the change
    triggerRef(items)
    await nextTick()
    expect(container.textContent).toBe('a,b')
    app.unmount()
  })
})

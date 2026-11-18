// The collection a callback is expected to receive as its collection argument. Usually the one
// the test called; for a proxy registered here, the collection the proxy wraps, because the
// library's own classes hand callbacks the object they are, not a proxy of it.

const targets = new WeakMap<object, object>()

/** Records that `proxy` wraps `target`; returns `proxy`. */
export function registerProxy<T extends object>(proxy: T, target: object): T {
  targets.set(proxy, target)
  return proxy
}

/** The collection callbacks of `value` receive: its registered target, or `value` itself. */
export function ownerOf(value: object): object {
  return targets.get(value) ?? value
}

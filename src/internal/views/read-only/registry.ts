// The read-only views this copy of the library built. Each read-only constructor records its view
// here, so the unmodifiable-view functions can recognise one by identity: an object made from a
// view's prototype without running a constructor, a `Proxy` around a view, and a view from another
// loaded copy are all absent. Keys are held weakly, so views are collected as usual.

import { createWeakMap, stringSlice, weakMapGet, weakMapSet } from '../../intrinsics'

/** The family a read-only view belongs to. @internal */
export type ReadOnlyKind =
  | 'collection'
  | 'sequenced-collection'
  | 'list'
  | 'set'
  | 'sequenced-set'
  | 'sorted-set'
  | 'map'
  | 'sequenced-map'
  | 'sorted-map'

/** What a registered read-only view is made of. @internal */
export interface ReadOnlyParts {
  /** The collection or map the view reads. */
  readonly source: object
  readonly kind: ReadOnlyKind
  /** The name the view prints with. */
  readonly printed: string
  /** Whether the view is an unmodifiable view (`false` for an immutable collection). */
  readonly unmodifiable: boolean
  /** Maps each member before it is handed out, when the view does so. */
  readonly reveal: ((member: unknown) => unknown) | undefined
}

let registry: WeakMap<object, ReadOnlyParts> | undefined

/**
 * Records `view` as a read-only view of `kind` reading `source`, printed as `printed`. A view
 * whose `kind` is `undefined` (an instance of a class the library did not define) is not recorded.
 *
 * @internal
 */
export function registerReadOnly(
  view: object,
  kind: ReadOnlyKind | undefined,
  source: object,
  printed: string,
  reveal?: (member: never) => unknown,
): void {
  if (kind === undefined) return
  if (registry === undefined) registry = createWeakMap<object, ReadOnlyParts>()
  weakMapSet(registry, view, {
    source,
    kind,
    printed,
    unmodifiable: stringSlice(printed, 0, 12) === 'Unmodifiable',
    reveal: reveal as ((member: unknown) => unknown) | undefined,
  })
}

/** The parts of `value` when it is a read-only view this copy built, else `undefined`. @internal */
export function readOnlyParts(value: unknown): ReadOnlyParts | undefined {
  if (registry === undefined) return undefined
  if (typeof value !== 'object' || value === null) return undefined
  return weakMapGet(registry, value)
}

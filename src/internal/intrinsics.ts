// Built-ins the library relies on, captured when the module loads.
//
// Methods are captured already bound to their `this` argument (`method.call.bind(method)`), so a
// later replacement of the method, of its prototype, or of `Function.prototype.call` cannot run
// code inside the library. A built-in replaced before the library loads cannot be protected
// against. Every capture is a pure expression, so unused captures tree-shake away.

/**
 * Returns `method` as a function that takes its `this` value as the first argument, bound now so
 * that a later change to `Function.prototype.call` has no effect on it.
 *
 * @internal
 */
function uncurry<T, A extends unknown[], R>(
  method: (this: T, ...args: A) => R,
): (self: T, ...args: A) => R {
  const call = method.call as unknown as { bind(thisArg: unknown): (self: T, ...args: A) => R }
  return call.bind(method)
}

// The ES2016 library has no BigInt; declare only what is used, scoped to this module. `BigInt` is
// read only after a `typeof` check, so engines without bigint load the library normally.
// biome-ignore lint/suspicious/noShadowRestrictedNames: types the global for an ES2016 lib that lacks it
declare const BigInt:
  | (((value: never) => bigint) & { prototype: { toString(this: bigint, radix?: number): string } })
  | undefined

/** `String.prototype.charCodeAt(string, index)`. @internal */
export const charCodeAt: (self: string, index: number) => number = /*#__PURE__*/ (() =>
  uncurry(String.prototype.charCodeAt))()

/** `String.prototype.slice(string, start, end)`. @internal */
export const stringSlice: (self: string, start?: number, end?: number) => string =
  /*#__PURE__*/ (() => uncurry(String.prototype.slice))()

/** `JSON.stringify`, for quoting and escaping text in messages. @internal */
export const jsonStringify: (value: string) => string = /*#__PURE__*/ (() => JSON.stringify)()

/** `Date.prototype.getTime(date)`; throws for a value that is not a date. @internal */
export const getTime: (self: Date) => number = /*#__PURE__*/ (() =>
  uncurry(Date.prototype.getTime))()

/** `DataView.prototype.setFloat64(view, offset, value)`. @internal */
export const setFloat64: (self: DataView, offset: number, value: number) => void =
  /*#__PURE__*/ (() => uncurry(DataView.prototype.setFloat64))()

/** `DataView.prototype.getInt32(view, offset)`. @internal */
export const getInt32: (self: DataView, offset: number) => number = /*#__PURE__*/ (() =>
  uncurry(DataView.prototype.getInt32))()

/** `BigInt.prototype.toString(bigint, radix)`, or `undefined` on engines without bigint. @internal */
export const bigintToString: ((self: bigint, radix?: number) => string) | undefined =
  /*#__PURE__*/ (() =>
    typeof BigInt === 'function' ? uncurry(BigInt.prototype.toString) : undefined)()

/** `Math.imul`. @internal */
export const imul: (a: number, b: number) => number = /*#__PURE__*/ (() => Math.imul)()

/** `Math.random`. @internal */
export const random: () => number = /*#__PURE__*/ (() => Math.random)()

/** The `String` function, for converting a symbol to its description text. @internal */
export const toText: (value: symbol) => string = /*#__PURE__*/ (() => String)()

/** `Reflect.apply`, for calling user methods without looking up `Function.prototype.call`. @internal */
export const apply: (
  target: (...args: never[]) => unknown,
  thisArg: unknown,
  args: ArrayLike<unknown>,
) => unknown = /*#__PURE__*/ (() => Reflect.apply)()

/** A new 8-byte `DataView`, built with the constructors captured at load. @internal */
export const createScratchView: () => DataView = /*#__PURE__*/ (() => {
  const View = DataView
  const Bytes = ArrayBuffer
  return () => new View(new Bytes(8))
})()

/** A new `WeakMap`, built with the constructor captured at load. @internal */
export const createWeakMap: <K extends object, V>() => WeakMap<K, V> = /*#__PURE__*/ (() => {
  const Weak = WeakMap
  return <K extends object, V>() => new Weak<K, V>()
})()

/** `WeakMap.prototype.get(map, key)`. @internal */
export const weakMapGet: <K extends object, V>(self: WeakMap<K, V>, key: K) => V | undefined =
  /*#__PURE__*/ (() => uncurry(WeakMap.prototype.get))() as never

/** `WeakMap.prototype.set(map, key, value)`. @internal */
export const weakMapSet: <K extends object, V>(self: WeakMap<K, V>, key: K, value: V) => unknown =
  /*#__PURE__*/ (() => uncurry(WeakMap.prototype.set))() as never

/** A new `WeakSet`, built with the constructor captured at load. @internal */
export const createWeakSet: <T extends object>() => WeakSet<T> = /*#__PURE__*/ (() => {
  const Weak = WeakSet
  return <T extends object>() => new Weak<T>()
})()

/** `WeakSet.prototype.has(set, value)`. @internal */
export const weakSetHas: <T extends object>(self: WeakSet<T>, value: T) => boolean =
  /*#__PURE__*/ (() => uncurry(WeakSet.prototype.has))() as never

/** `WeakSet.prototype.add(set, value)`. @internal */
export const weakSetAdd: <T extends object>(self: WeakSet<T>, value: T) => unknown =
  /*#__PURE__*/ (() => uncurry(WeakSet.prototype.add))() as never

/** `WeakSet.prototype.delete(set, value)`. @internal */
export const weakSetDelete: <T extends object>(self: WeakSet<T>, value: T) => boolean =
  /*#__PURE__*/ (() => uncurry(WeakSet.prototype.delete))() as never

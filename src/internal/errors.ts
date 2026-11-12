/**
 * Shared construction steps for the library's error classes.
 *
 * @internal
 * @packageDocumentation
 */

type StackCapture = (target: object, constructorOpt?: object) => void

/**
 * Finishes constructing a library error.
 *
 * Restores the prototype chain when a transpiler broke it, defines `name` as a writable,
 * configurable, non-enumerable own property (so subclasses can reassign it and it stays out of
 * `Object.keys`, spread and JSON), and, where the runtime supports it, starts the stack trace at
 * the code that evaluated `new`, hiding the constructors of the class and of any subclass.
 *
 * Time: O(1) plus the runtime's stack capture.
 *
 * @param error - The error under construction (`this` in its constructor).
 * @param name - The class name, as a literal (never `constructor.name`, which minifiers rename).
 * @param newTarget - `new.target` of the constructor call.
 * @internal
 */
export function initError(error: Error, name: string, newTarget: { prototype: object }): void {
  const prototype = newTarget.prototype
  if (Object.getPrototypeOf(error) !== prototype) Object.setPrototypeOf(error, prototype)
  Object.defineProperty(error, 'name', { value: name, writable: true, configurable: true })
  const capture = (Error as { captureStackTrace?: StackCapture }).captureStackTrace
  if (typeof capture === 'function') capture(error, newTarget)
}

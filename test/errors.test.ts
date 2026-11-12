import { describe, expect, it } from 'vitest'
import {
  ClassCastError,
  ConcurrentModificationError,
  IllegalArgumentError,
  IllegalStateError,
  IndexOutOfBoundsError,
  NoSuchElementError,
  NullElementError,
  UnsupportedOperationError,
} from '../src/index'

type ErrorClass = new (message?: string) => Error

const ERRORS: ReadonlyArray<{ name: string; Class: ErrorClass; Base: ErrorClass }> = [
  { name: 'IndexOutOfBoundsError', Class: IndexOutOfBoundsError, Base: RangeError },
  { name: 'IllegalArgumentError', Class: IllegalArgumentError, Base: RangeError },
  { name: 'UnsupportedOperationError', Class: UnsupportedOperationError, Base: TypeError },
  { name: 'NullElementError', Class: NullElementError, Base: TypeError },
  { name: 'ClassCastError', Class: ClassCastError, Base: TypeError },
  { name: 'NoSuchElementError', Class: NoSuchElementError, Base: Error },
  { name: 'IllegalStateError', Class: IllegalStateError, Base: Error },
  { name: 'ConcurrentModificationError', Class: ConcurrentModificationError, Base: Error },
]

const byBase = (Base: ErrorClass) => ERRORS.filter((e) => e.Base === Base).map((e) => e.name)

describe('error class hierarchy', () => {
  it('exports the index and argument errors as RangeError subclasses [001 S1-AC1]', () => {
    expect(byBase(RangeError)).toEqual(['IndexOutOfBoundsError', 'IllegalArgumentError'])
    expect(Object.getPrototypeOf(IndexOutOfBoundsError)).toBe(RangeError)
    expect(Object.getPrototypeOf(IllegalArgumentError)).toBe(RangeError)
  })

  it('exports the unsupported, null and cast errors as TypeError subclasses [001 S1-AC2]', () => {
    expect(byBase(TypeError)).toEqual([
      'UnsupportedOperationError',
      'NullElementError',
      'ClassCastError',
    ])
    expect(Object.getPrototypeOf(UnsupportedOperationError)).toBe(TypeError)
    expect(Object.getPrototypeOf(NullElementError)).toBe(TypeError)
    expect(Object.getPrototypeOf(ClassCastError)).toBe(TypeError)
  })

  it('exports the element, state and modification errors as Error subclasses [001 S1-AC3]', () => {
    expect(byBase(Error)).toEqual([
      'NoSuchElementError',
      'IllegalStateError',
      'ConcurrentModificationError',
    ])
    expect(Object.getPrototypeOf(NoSuchElementError)).toBe(Error)
    expect(Object.getPrototypeOf(IllegalStateError)).toBe(Error)
    expect(Object.getPrototypeOf(ConcurrentModificationError)).toBe(Error)
  })
})

describe.each(ERRORS)('$name', ({ name, Class, Base }) => {
  it('sets name to the class name and message to the given text, or empty [001 S1-AC4]', () => {
    const error = new Class('Example.method: problem')
    expect(error.name).toBe(name)
    expect(error.message).toBe('Example.method: problem')
    expect(new Class().message).toBe('')
    expect(new Class().name).toBe(name)
  })

  it('is an instance of its own class, its native base and Error [001 S1-AC5]', () => {
    const error = new Class('x')
    expect(error instanceof Class).toBe(true)
    expect(error instanceof Base).toBe(true)
    expect(error instanceof Error).toBe(true)
  })

  it('converts to "name: message", or the name alone when the message is empty [001 S1-AC6]', () => {
    expect(String(new Class('Example.method: problem'))).toBe(`${name}: Example.method: problem`)
    expect(String(new Class())).toBe(name)
  })

  it('starts the stack at the code that called new, hiding class and subclass constructors [001 S1-AC7]', () => {
    const lines = (new Class('x').stack ?? '').split('\n')
    expect(lines[0]).toBe(`${name}: x`)
    expect(lines[1]).toContain('errors.test.ts')
    expect(lines[1]).not.toContain(`new ${name}`)

    class SubclassForStack extends Class {}
    const subLines = (new SubclassForStack('s').stack ?? '').split('\n')
    expect(subLines[1]).toContain('errors.test.ts')
    expect(subLines[1]).not.toContain('SubclassForStack')
    expect(subLines[1]).not.toContain(`new ${name}`)
  })

  it('keeps name out of Object.keys, object spread and JSON [001 S1-AC9]', () => {
    const error = new Class('x')
    expect(Object.keys(error)).toEqual([])
    expect({ ...error }).toEqual({})
    expect(JSON.stringify(error)).toBe('{}')
  })

  it('lets a subclass rename itself in its constructor or as a class field [001 S1-AC10]', () => {
    class Renamed extends Class {
      constructor(message?: string) {
        super(message)
        this.name = 'Renamed'
      }
    }
    class FieldRenamed extends Class {
      override name = 'FieldRenamed'
    }
    class Plain extends Class {}

    const renamed = new Renamed('r')
    expect(renamed.name).toBe('Renamed')
    expect(String(renamed)).toBe('Renamed: r')
    expect((renamed.stack ?? '').split('\n')[0]).toBe('Renamed: r')
    expect((renamed.stack ?? '').split('\n')[1]).toContain('errors.test.ts')

    const field = new FieldRenamed('f')
    expect(field.name).toBe('FieldRenamed')
    expect(String(field)).toBe('FieldRenamed: f')

    expect(new Plain('p').name).toBe(name)
  })
})

const brandKey = (major: number, name: string) =>
  Symbol.for(`javascript-collections-framework/${major}/${name}`)

describe.each(ERRORS)('$name recognition', ({ name, Class, Base }) => {
  it('is not an instance of another library error or an unrelated native error [001 S1-AC8]', () => {
    const error = new Class('x')
    for (const other of ERRORS) {
      if (other.Class !== Class) expect(error instanceof other.Class).toBe(false)
    }
    for (const Native of [RangeError, TypeError]) {
      if (Native !== Base) expect(error instanceof Native).toBe(false)
    }
  })

  it('does not recognise a value branded for another major version [001 S2-AC2]', () => {
    expect({ [brandKey(2, name)]: true } instanceof Class).toBe(false)
    expect({ [brandKey(0, name)]: true } instanceof Class).toBe(false)
  })

  it('returns false without throwing for primitives, null, undefined and unbranded objects [001 S2-AC3]', () => {
    for (const value of [0, 'x', true, 1n, Symbol('s'), null, undefined, {}, [], () => {}]) {
      expect(value instanceof Class).toBe(false)
    }
    expect(new Error('x') instanceof Class).toBe(false)
  })

  it('treats an object branded with true as an instance, and any other brand value as not [001 S2-AC4]', () => {
    expect({ [brandKey(1, name)]: true } instanceof Class).toBe(true)
    for (const other of [1, 'true', {}, false, null, undefined]) {
      expect({ [brandKey(1, name)]: other } instanceof Class).toBe(false)
    }
  })

  it('keeps the brand off the instance: no own symbols, keys, JSON or spread [001 S2-AC5]', () => {
    const error = new Class('x')
    expect(Object.getOwnPropertySymbols(error)).toEqual([])
    expect(Object.keys(error)).toEqual([])
    expect(JSON.stringify(error)).toBe('{}')
    expect(Object.getOwnPropertySymbols({ ...error })).toEqual([])
    expect(Object.getOwnPropertySymbols(Class.prototype)).toEqual([brandKey(1, name)])
  })

  it('lets an error thrown while reading the brand propagate unchanged [001 S2-AC6]', () => {
    const failure = new Error('getter failed')
    const getter = Object.defineProperty({}, brandKey(1, name), {
      get() {
        throw failure
      },
    })
    let caught: unknown
    try {
      void (getter instanceof Class)
    } catch (error) {
      caught = error
    }
    expect(caught).toBe(failure)

    const trapFailure = new Error('trap failed')
    const proxy = new Proxy(
      {},
      {
        get() {
          throw trapFailure
        },
      },
    )
    let trapCaught: unknown
    try {
      void (proxy instanceof Class)
    } catch (error) {
      trapCaught = error
    }
    expect(trapCaught).toBe(trapFailure)
  })

  it('uses the ordinary prototype check for a user subclass [001 S2-AC7]', () => {
    class UserError extends Class {}
    class OtherUserError extends Class {}
    const user = new UserError('u')
    expect(user instanceof UserError).toBe(true)
    expect(user instanceof Class).toBe(true)
    expect(new Class('x') instanceof UserError).toBe(false)
    expect(new OtherUserError('o') instanceof UserError).toBe(false)
    expect({ [brandKey(1, name)]: true } instanceof UserError).toBe(false)
    expect((5 as unknown) instanceof UserError).toBe(false)
  })
})

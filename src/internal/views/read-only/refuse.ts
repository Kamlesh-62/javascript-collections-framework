// The error every read-only collection, view, cursor and entry throws for a change.

import { NoSuchElementError, UnsupportedOperationError } from '../../../errors/errors'

/**
 * The error a refused change throws: `<where>: the collection cannot be changed`.
 *
 * @param where - The API to name: `ImmutableList.add`, `ImmutableList.cursor.remove`, ….
 * @internal
 */
export function refuse(where: string): UnsupportedOperationError {
  return new UnsupportedOperationError(`${where}: the collection cannot be changed`)
}

/**
 * The error a read-only view throws for an end of an empty collection: `<where>: the collection is
 * empty`.
 *
 * @param where - The API to name: `UnmodifiableSortedSet.getFirst`, ….
 * @internal
 */
export function empty(where: string): NoSuchElementError {
  return new NoSuchElementError(`${where}: the collection is empty`)
}

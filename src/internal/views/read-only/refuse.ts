// The error every read-only collection, view, cursor and entry throws for a change.

import { UnsupportedOperationError } from '../../../errors/errors'

/**
 * The error a refused change throws: `<where>: the collection cannot be changed`.
 *
 * @param where - The API to name: `ImmutableList.add`, `ImmutableList.cursor.remove`, ….
 * @internal
 */
export function refuse(where: string): UnsupportedOperationError {
  return new UnsupportedOperationError(`${where}: the collection cannot be changed`)
}

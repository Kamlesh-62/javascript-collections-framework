import type { B } from './type-cycle-b'

export interface A {
  readonly next?: B
}
export const a = 1

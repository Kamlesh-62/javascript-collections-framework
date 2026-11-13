import type { A } from './type-cycle-a'

export interface B {
  readonly next?: A
}
export const b = 2

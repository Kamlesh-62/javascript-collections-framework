// Seeded records with their own equality: a class implementing the equality protocol, whose
// fields JSON can carry, its canonical JSON form and the reviver that rebuilds it.

import {
  ArrayList,
  equals,
  equalsSymbol,
  type HashFunction,
  HashMap,
  hashCodeSymbol,
} from '../../../src/index'
import { integer, pick, seeded } from '../random'

/** A record compared by value: two records are equal when every field is. */
export class Rec {
  constructor(
    readonly name: string,
    readonly group: string,
    readonly score: number,
    readonly active: boolean,
    readonly note: string | null,
    readonly tags: ArrayList<string>,
    readonly attrs: HashMap<string, number | string | boolean | null>,
  ) {}

  [equalsSymbol](other: unknown): boolean {
    return (
      other instanceof Rec &&
      other.name === this.name &&
      other.group === this.group &&
      other.score === this.score &&
      other.active === this.active &&
      other.note === this.note &&
      equals(other.tags, this.tags) &&
      equals(other.attrs, this.attrs)
    )
  }

  [hashCodeSymbol](hash: HashFunction): number {
    let h = hash(this.name)
    h = (Math.imul(h, 31) + hash(this.group)) | 0
    h = (Math.imul(h, 31) + hash(this.score)) | 0
    h = (Math.imul(h, 31) + (this.active ? 1 : 2)) | 0
    h = (Math.imul(h, 31) + hash(this.note)) | 0
    h = (Math.imul(h, 31) + hash(this.tags)) | 0
    return (Math.imul(h, 31) + hash(this.attrs)) | 0
  }

  /** The tagged plain object `JSON.stringify` writes. */
  toJSON(): unknown {
    return {
      $rec: 1,
      name: this.name,
      group: this.group,
      score: this.score,
      active: this.active,
      note: this.note,
      tags: this.tags,
      attrs: this.attrs,
    }
  }
}

/** The canonical form: map entries sorted by key, list order kept. */
export function canonical(rec: Rec): string {
  const attrs = [...rec.attrs].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  return JSON.stringify([
    rec.name,
    rec.group,
    rec.score,
    rec.active,
    rec.note,
    rec.tags.toArray(),
    attrs,
  ])
}

/** A `JSON.parse` reviver that rebuilds each tagged object as a `Rec`. */
export function reviver(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === 'object' && (value as { $rec?: unknown }).$rec === 1) {
    const v = value as {
      name: string
      group: string
      score: number
      active: boolean
      note: string | null
      tags: string[]
      attrs: Array<[string, number | string | boolean | null]>
    }
    return new Rec(
      v.name,
      v.group,
      v.score,
      v.active,
      v.note,
      ArrayList.from(v.tags),
      HashMap.from(v.attrs),
    )
  }
  return value
}

const NAMES = ['ada', 'grace', 'alan', 'édith', 'Ωmega', '李', 'zoë', '__proto__', 'constructor']
const GROUPS = ['north', 'south', 'east', 'west', 'hasOwnProperty']
const TAGS = ['a', 'b', 'c', 'urgent', 'later', '']
const ATTRS = ['x', 'y', 'size', 'prototype', 'toString']

/** A seeded record drawn from small pools, so equal records are common. */
function record(random: () => number): Rec {
  const tags = new ArrayList<string>()
  for (let i = integer(random, 0, 2); i > 0; i--) tags.add(pick(random, TAGS))
  const attrs = new HashMap<string, number | string | boolean | null>()
  for (let i = integer(random, 0, 2); i > 0; i--) {
    const kind = integer(random, 0, 3)
    attrs.set(
      pick(random, ATTRS),
      kind === 0 ? integer(random, -3, 3) * 0.5 + 0 : kind === 1 ? 'v' : kind === 2 ? true : null,
    )
  }
  const score = integer(random, -2, 2) * 1.25 + 0
  return new Rec(
    pick(random, NAMES),
    pick(random, GROUPS),
    score,
    integer(random, 0, 1) === 1,
    integer(random, 0, 2) === 0 ? null : pick(random, TAGS),
    tags,
    attrs,
  )
}

/** `count` seeded records, each a new object. */
export function records(count: number, seed: number): Rec[] {
  const random = seeded(seed)
  const out: Rec[] = new Array(count)
  for (let i = 0; i < count; i++) out[i] = record(random)
  return out
}

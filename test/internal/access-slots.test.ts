import { describe, expect, it } from 'vitest'
import { AccessSlots } from '../../src/internal/engines/access-slots'
import type { EvictionQueue } from '../../src/internal/engines/eviction-queue'
import { readEquality } from '../../src/internal/engines/hash-support'
import type { LinkedHashTable } from '../../src/internal/engines/linked-hash-table'
import { integer, seeded } from '../support/random'

/** The keys of `table` front to back. */
function keysOf<K, V>(table: LinkedHashTable<K, V>): K[] {
  const out: K[] = []
  const head = table.head
  for (let record = head.next; record !== head; record = record.next) out.push(record.key)
  return out
}

/** Slots handed out so far, free or not: how much the layout has grown. */
function usedOf<K, V>(slots: AccessSlots<K, V>): number {
  return (slots as unknown as { used: number }).used
}

describe('AccessSlots', () => {
  it('matches an array model of least recently used order over seeded runs [050 S1-AC3]', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const random = seeded(seed)
      const slots = new AccessSlots<number, number>()
      // The model: [key, value] pairs, least recently used first.
      let model: Array<[number, number]> = []
      let peak = 0
      for (let step = 0; step < 5_000; step++) {
        const key = integer(random, 0, 60)
        const at = model.findIndex(([k]) => k === key)
        const slot = slots.find(key)
        expect(slot !== undefined, `seed ${seed} step ${step}`).toBe(at >= 0)
        switch (integer(random, 0, 5)) {
          case 0:
          case 1:
            if (slot === undefined) {
              slots.add(key, step)
              model.push([key, step])
            } else {
              expect(slots.valueAt(slot)).toBe((model[at] as [number, number])[1])
              expect(slots.access(slot)).toBe(at !== model.length - 1)
              model.push(...model.splice(at, 1))
            }
            break
          case 2:
            expect(slots.remove(key)).toBe(slot !== undefined)
            if (slot !== undefined) model.splice(at, 1)
            break
          case 3:
            if (slot === undefined && model.length > 0) {
              const queued: unknown[] = []
              slots.recycleFirst(key, -step, {
                push: (k: number, v: number) => queued.push(k, v),
              } as unknown as EvictionQueue<number, number>)
              expect(queued).toEqual(model[0])
              model.shift()
              model.push([key, -step])
            }
            break
          case 4:
            if (slot !== undefined) {
              expect(slots.write(slot, step)).toBe(at !== model.length - 1)
              ;(model[at] as [number, number])[1] = step
              model.push(...model.splice(at, 1))
            }
            break
          default:
            if (random() < 0.02) {
              slots.clear()
              model = []
            }
        }
        expect(slots.size).toBe(model.length)
        peak = Math.max(peak, model.length)
        // A freed slot is reused before a new one is handed out.
        expect(usedOf(slots)).toBeLessThanOrEqual(Math.max(peak, 1) + 1)
        if (step % 97 === 0) {
          const table = slots.toTable(readEquality<number>(undefined, 'test'))
          expect(keysOf(table)).toEqual(model.map(([k]) => k))
        }
      }
    }
  })

  it('forgets an evicted key and reuses its slot for the new one [050 S3-AC1]', () => {
    const slots = new AccessSlots<string, number>()
    slots.add('a', 1)
    slots.add('b', 2)
    const used = usedOf(slots)
    slots.recycleFirst('c', 3, undefined)
    expect(slots.find('a')).toBe(undefined)
    expect(slots.find('c')).not.toBe(undefined)
    expect(usedOf(slots)).toBe(used)
    expect(slots.size).toBe(2)
    expect(keysOf(slots.toTable(readEquality<string>(undefined, 'test')))).toEqual(['b', 'c'])
  })

  it('reuses freed slots, so a stable size never grows the layout [050 S3-AC1]', () => {
    const slots = new AccessSlots<number, number>()
    for (let i = 0; i < 100; i++) slots.add(i, i)
    const used = usedOf(slots)
    for (let i = 100; i < 100_000; i++) {
      slots.remove(i - 100)
      slots.add(i, i)
    }
    expect(usedOf(slots)).toBe(used)
    expect(slots.size).toBe(100)
  })

  it('grows past its first capacity and keeps every link [050 S1-AC3]', () => {
    const slots = new AccessSlots<number, number>()
    for (let i = 0; i < 10_000; i++) slots.add(i, i * 2)
    for (let i = 0; i < 10_000; i += 3) slots.access(slots.find(i) as number)
    const expected = [
      ...Array.from({ length: 10_000 }, (_, i) => i).filter((i) => i % 3 !== 0),
      ...Array.from({ length: 10_000 }, (_, i) => i).filter((i) => i % 3 === 0),
    ]
    const table = slots.toTable(readEquality<number>(undefined, 'test'))
    expect(keysOf(table)).toEqual(expected)
    expect(table.accessOrder).toBe(true)
    expect(table.findPlain(9_999)?.value).toBe(19_998)
  })

  it('makes a table that is independent of the slots [050 S1-AC3]', () => {
    const slots = new AccessSlots<number, number>()
    for (let i = 0; i < 20; i++) slots.add(i, i)
    const table = slots.toTable(readEquality<number>(undefined, 'test'))
    table.access(table.findPlain(0) as NonNullable<ReturnType<typeof table.findPlain>>)
    table.remove(table.findPlain(5) as NonNullable<ReturnType<typeof table.findPlain>>)
    slots.add(99, 99)
    expect(keysOf(table)).toEqual([
      ...Array.from({ length: 19 }, (_, i) => i + 1).filter((i) => i !== 5),
      0,
    ])
    expect(table.findPlain(99)).toBe(undefined)
    expect(keysOf(slots.toTable(readEquality<number>(undefined, 'test')))).toEqual([
      ...Array.from({ length: 20 }, (_, i) => i),
      99,
    ])
  })
})

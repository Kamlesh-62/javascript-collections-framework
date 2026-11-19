// Seeded records with their own equality: de-duplicated in a hash set, grouped in a hash map,
// written with `JSON.stringify`, parsed back with a reviver and rebuilt with `from`, against a
// native `Map` keyed by each record's canonical JSON.

import { ArrayList, equals, HashMap, HashSet, valueEquivalence } from '../../src/index'
import type { WorkloadSizes } from '../stress/config'
import { canonical, Rec, records, reviver } from '../support/data/records'
import { same, sameSequence } from './check'

export function run(sizes: WorkloadSizes, seed: number): void {
  const all = records(sizes.records, seed)

  // De-duplication: the first record of each canonical form is kept, in first-seen order.
  const set = new HashSet<Rec>(undefined, { equivalence: valueEquivalence })
  const reference = new Map<string, Rec>()
  for (const rec of all) {
    const key = canonical(rec)
    const added = !set.has(rec)
    same(added, !reference.has(key), `has ${key}`)
    set.add(rec)
    if (!reference.has(key)) reference.set(key, rec)
  }
  same(set.size, reference.size, 'distinct records')
  sameSequence(set, [...reference.values()], 'distinct records in order')
  for (const rec of all) same(set.has(rec), true, `has ${canonical(rec)}`)

  // Grouping by a string field, through `HashMap.from` of [group, records] pairs.
  const groups = new Map<string, Rec[]>()
  for (const rec of set) {
    const list = groups.get(rec.group)
    if (list === undefined) groups.set(rec.group, [rec])
    else list.push(rec)
  }
  const grouped = HashMap.from(
    [...groups].map(([group, list]) => [group, ArrayList.from(list)] as const),
  )
  same(grouped.size, groups.size, 'groups')
  for (const [group, list] of groups) {
    sameSequence(grouped.get(group) as ArrayList<Rec>, list, `group ${group}`)
  }

  // A JSON round trip, then a rebuild with `from`.
  const text = JSON.stringify({ records: set, groups: grouped })
  const parsed = JSON.parse(text, reviver) as {
    records: Rec[]
    groups: Array<[string, Rec[]]>
  }
  for (const rec of parsed.records) same(rec instanceof Rec, true, 'revived record')
  const rebuilt = HashSet.from<Rec>(parsed.records, { equivalence: valueEquivalence })
  same(rebuilt.size, set.size, 'rebuilt size')
  same(rebuilt.equals(set), true, 'rebuilt set equals the original')
  same(set.equals(rebuilt), true, 'original set equals the rebuilt one')
  sameSequence([...rebuilt].map(canonical), [...reference.keys()], 'rebuilt records in order')
  const regrouped = HashMap.from(
    parsed.groups.map(([group, list]) => [group, ArrayList.from(list)] as const),
  )
  same(equals(regrouped, grouped), true, 'rebuilt groups equal the original')
  for (const [group, list] of groups) {
    sameSequence(
      (regrouped.get(group) as ArrayList<Rec>).toArray().map(canonical),
      list.map(canonical),
      `rebuilt group ${group}`,
    )
  }
}

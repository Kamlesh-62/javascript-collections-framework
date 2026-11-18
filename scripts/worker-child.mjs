// The worker side of scripts/worker.mjs: rebuilds each collection from its JSON form with the
// built package and reports its contents and one lookup.

import { parentPort } from 'node:worker_threads'
import { ArrayList, HashSet, TreeMap } from 'javascript-collections-framework'

const port = parentPort
if (port === null) throw new Error('worker-child.mjs runs only as a worker thread')

port.once('message', (json) => {
  const list = ArrayList.from(json.list)
  const map = TreeMap.from(json.map)
  const set = HashSet.from(json.set, { key: (s) => s.toLowerCase() })
  port.postMessage({
    list: { contents: list.toArray(), lookup: list.has(null) },
    map: { contents: map.toJSON(), lookup: map.floorEntry(1.5)?.value === 'a' },
    set: { contents: set.toArray(), lookup: set.has('ANN') },
  })
})

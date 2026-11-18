// Sends collections to a worker thread as their `toJSON()` form, has the worker rebuild them with
// the built package, and checks the rebuilt collections equal the originals. Run after
// `pnpm build`.
//   node scripts/worker.mjs

import { Worker } from 'node:worker_threads'
import { ArrayList, HashSet, TreeMap } from 'javascript-collections-framework'

const caseless = { key: (s) => s.toLowerCase() }
const originals = {
  list: new ArrayList(['a', 1, null, true]),
  map: new TreeMap([
    [2, 'b'],
    [1, 'a'],
  ]),
  set: new HashSet(['Ann', 'Bo'], caseless),
}

const worker = new Worker(new URL('./worker-child.mjs', import.meta.url))
const failures = []
try {
  const reply = await new Promise((resolve, reject) => {
    worker.once('message', resolve)
    worker.once('error', reject)
    worker.once('exit', (code) =>
      reject(new Error(`the worker exited with code ${code} before replying`)),
    )
    worker.postMessage({
      list: originals.list.toJSON(),
      map: originals.map.toJSON(),
      set: originals.set.toJSON(),
    })
  })
  const expected = {
    list: originals.list.toArray(),
    map: originals.map.toJSON(),
    set: originals.set.toArray(),
  }
  for (const name of Object.keys(expected)) {
    if (JSON.stringify(reply[name].contents) !== JSON.stringify(expected[name])) {
      failures.push(`${name}: the worker rebuilt ${JSON.stringify(reply[name].contents)}`)
    }
    if (reply[name].lookup !== true) failures.push(`${name}: a lookup in the worker failed`)
  }
} finally {
  await worker.terminate()
}

if (failures.length > 0) {
  console.error(`worker check failed:\n  ${failures.join('\n  ')}`)
  process.exit(1)
}
console.log('worker check: collections rebuilt in a worker thread equal the originals')

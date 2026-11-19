// A server component and a client component, each using one named collection.
import { TreeMap } from 'javascript-collections-framework'
import { ClientResult } from './client-result'

export default function Page() {
  const map = new TreeMap([
    [2, 'b'],
    [3, 'c'],
    [1, 'a'],
  ])
  return (
    <main>
      <p id="server">{`server TreeMap ${[...map.keys()].join(',')}`}</p>
      <ClientResult />
    </main>
  )
}

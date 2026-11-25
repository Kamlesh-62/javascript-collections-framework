// Task: find the number of steps on the shortest path between two cells of a grid with walls,
// moving up, down, left or right.
// Uses: ArrayDeque as the breadth-first queue, and HashSet with a `key` option, so that two point
// objects with the same coordinates count as one visited cell.
// Time: O(rows × columns) on average: each cell is queued and visited at most once.
// With Array, Map and Set only: a Set of points compares objects by reference, so each point
// must be encoded as a string by hand at every lookup; an array queue's `shift` costs O(n).
import { ArrayDeque, HashSet } from 'javascript-collections-framework'

const grid = ['..#.#..', '.##.##.', '...#...', '.#...#.']
const moves = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
]

/**
 * The number of steps from `start` to `goal`, or -1 when the goal cannot be reached.
 * @param {{ x: number, y: number }} start
 * @param {{ x: number, y: number }} goal
 */
function shortestPath(start, goal) {
  const visited = new HashSet({ key: (p) => `${p.x},${p.y}` })
  const queue = new ArrayDeque([{ ...start, steps: 0 }])
  visited.add(start)
  while (!queue.isEmpty()) {
    const cell = queue.poll()
    if (cell.x === goal.x && cell.y === goal.y) return cell.steps
    for (const move of moves) {
      const next = { x: cell.x + move.x, y: cell.y + move.y, steps: cell.steps + 1 }
      if (grid[next.y]?.[next.x] !== '.' || visited.has(next)) continue
      visited.add(next)
      queue.push(next)
    }
  }
  return -1
}

console.log(shortestPath({ x: 0, y: 0 }, { x: 6, y: 0 })) // 12
console.log(shortestPath({ x: 0, y: 0 }, { x: 0, y: 3 })) // 3
console.log(shortestPath({ x: 0, y: 0 }, { x: 3, y: 0 })) // -1

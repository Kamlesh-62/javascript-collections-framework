'use client'

// Computes its text only in the browser, after hydration, so the page shows it only when the
// client bundle ran.
import { TreeMap } from 'javascript-collections-framework'
import { useEffect, useState } from 'react'

export function ClientResult() {
  const [text, setText] = useState('pending')
  useEffect(() => {
    const map = new TreeMap([
      [2, 'b'],
      [3, 'c'],
      [1, 'a'],
    ])
    setText(`client TreeMap ${[...map.keys()].join(',')}`)
  }, [])
  return <p id="client">{text}</p>
}

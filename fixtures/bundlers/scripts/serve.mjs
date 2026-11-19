// A static file server on 127.0.0.1 for the client bundles, and helpers to start and stop
// processes the tests need. Nothing leaves the machine.

import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' }

/**
 * Serves the files under `root`; resolves to the base URL and a function that stops the server.
 * @param {string} root
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export async function serveFolder(root) {
  const server = createServer(async (request, response) => {
    const path = normalize(decodeURIComponent(new URL(request.url ?? '/', 'http://x').pathname))
    try {
      const body = await readFile(join(root, path))
      response.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' })
      response.end(body)
    } catch {
      response.writeHead(404).end()
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)))
  const address = /** @type {import('node:net').AddressInfo} */ (server.address())
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}

/** A free port on 127.0.0.1. */
export async function freePort() {
  const server = createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)))
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address())
  await new Promise((resolve) => server.close(() => resolve(undefined)))
  return port
}

/**
 * Starts a long-running command and resolves once `url` answers; the result stops it.
 * @param {string} command @param {string[]} args @param {string} cwd @param {string} url
 */
export async function startServer(command, args, cwd, url) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', NODE_ENV: 'production' },
    stdio: 'ignore',
  })
  for (let attempt = 0; attempt < 300; attempt++) {
    try {
      const response = await fetch(url)
      if (response.ok) return () => child.kill()
    } catch {
      // not listening yet
    }
    if (child.exitCode !== null) break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  child.kill()
  throw new Error(`${args.join(' ')} did not answer at ${url}`)
}

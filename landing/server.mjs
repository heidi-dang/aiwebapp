import 'dotenv/config'
import dotenvExpand from 'dotenv-expand'
dotenvExpand.expand(dotenv.config({ path: '../.env' }))

import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname)
const port = Number(process.env.LANDING_PORT ?? 6868)

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.ico', 'image/x-icon']
])

function safeJoin(root, urlPath) {
  const withoutQuery = urlPath.split('?')[0] ?? '/'
  const normalized = path.posix.normalize(withoutQuery)
  if (normalized.includes('..')) return null
  const rel = normalized.startsWith('/') ? normalized.slice(1) : normalized
  return path.join(root, rel)
}

const server = http.createServer(async (req, res) => {
  const method = req.method ?? 'GET'
  if (method !== 'GET' && method !== 'HEAD') {
    res.statusCode = 405
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('Method Not Allowed')
    return
  }

  const requested = req.url ?? '/'
  const requestedPath = requested === '/' ? '/index.html' : requested
  const fullPath = safeJoin(rootDir, requestedPath)
  if (!fullPath) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('Bad Request')
    return
  }

  try {
    const stat = await fs.stat(fullPath)
    if (!stat.isFile()) throw new Error('not a file')
    const ext = path.extname(fullPath).toLowerCase()
    res.statusCode = 200
    res.setHeader('Content-Type', contentTypes.get(ext) ?? 'application/octet-stream')
    if (method === 'HEAD') {
      res.end()
      return
    }
    if (ext === '.html' && path.basename(fullPath).toLowerCase() === 'index.html') {
      const host = req.headers.host ?? ''
      const isLocal = host.includes('localhost') || host.includes('127.0.0.1')
      let html = await fs.readFile(fullPath, 'utf8')
      if (isLocal) {
        html = html
          .replaceAll('{{LANDING_URL}}', 'http://localhost:6868')
          .replaceAll('{{APP_URL}}', 'http://localhost:4000')
          .replaceAll('{{AUTH_URL}}', 'http://localhost:4003')
      } else {
        // For production, these should be set via environment variables or derived from host
        const baseUrl = `https://${host}`
        const appUrl = baseUrl.replace(/^https:\/\/([^.]+\.)?/, 'https://app.')
        const authUrl = baseUrl.replace(/^https:\/\/([^.]+\.)?/, 'https://auth.')
        html = html
          .replaceAll('{{LANDING_URL}}', baseUrl)
          .replaceAll('{{APP_URL}}', appUrl)
          .replaceAll('{{AUTH_URL}}', authUrl)
      }
      res.end(html, 'utf8')
      return
    }
    res.end(await fs.readFile(fullPath))
  } catch {
    res.statusCode = 404
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('Not Found')
  }
})

server.listen(port, () => {
  process.stdout.write(`landing: http://localhost:${port}\n`)
})

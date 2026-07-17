import { createServer, type Server } from 'node:http'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer, type WebSocket } from 'ws'
import { watchFile, type FileWatcher } from './watch.js'

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

// dist-server/server/server.js -> dist-server/server -> dist-server -> <pkg root> -> dist
const staticDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist')

export interface StartServerOptions {
  filePath: string
  port: number
}

export interface StartedServer {
  server: Server
  url: string
  close: () => Promise<void>
}

/**
 * Serves the built dashboard shell (`dist/`) and confirms the target
 * Markdown file is readable. The tool never writes to that file.
 */
export async function startServer({ filePath, port }: StartServerOptions): Promise<StartedServer> {
  await readFile(filePath, 'utf-8')

  if (!existsSync(join(staticDir, 'index.html'))) {
    throw new Error(`built assets not found at "${staticDir}" — run "npm run build" first`)
  }

  const server = createServer((req, res) => {
    const requestPath = req.url && req.url !== '/' ? req.url.split('?')[0] : '/index.html'
    const resolvedPath = join(staticDir, decodeURIComponent(requestPath))
    const safePath = resolvedPath.startsWith(staticDir) ? resolvedPath : join(staticDir, 'index.html')

    readFile(safePath)
      .then((body) => {
        res.writeHead(200, { 'Content-Type': MIME_TYPES[extname(safePath)] ?? 'application/octet-stream' })
        res.end(body)
      })
      .catch(() => {
        // Unknown paths fall back to the shell (single-page app).
        readFile(join(staticDir, 'index.html'))
          .then((body) => {
            res.writeHead(200, { 'Content-Type': MIME_TYPES['.html'] })
            res.end(body)
          })
          .catch(() => {
            res.writeHead(404)
            res.end('Not found')
          })
      })
  })

  const wss = new WebSocketServer({ server, path: '/ws' })
  const clients = new Set<WebSocket>()

  const send = (socket: WebSocket, content: string): void => {
    socket.send(JSON.stringify({ type: 'content', content }))
  }

  wss.on('connection', (socket) => {
    clients.add(socket)
    socket.on('close', () => clients.delete(socket))
    readFile(filePath, 'utf-8')
      .then((content) => send(socket, content))
      .catch((error: unknown) => console.error('md-dashboard: failed to send initial content:', error))
  })

  const fileWatcher: FileWatcher = watchFile(filePath, (content) => {
    for (const client of clients) {
      if (client.readyState === client.OPEN) send(client, content)
    }
  })

  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(port, resolvePromise)
  })

  return {
    server,
    url: `http://localhost:${port}`,
    close: async () => {
      await fileWatcher.close()
      await new Promise<void>((resolveClose) => wss.close(() => resolveClose()))
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()))
    },
  }
}

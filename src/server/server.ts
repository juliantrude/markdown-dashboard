import { createServer, type Server } from 'node:http'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer, type WebSocket } from 'ws'
import { parseDocument, type ParsedDocument } from '../parser/parse.js'
import type { DiscoveredFile } from './discover.js'
import { watchFiles, type FileWatcher } from './watch.js'

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
  /** One entry in single-file mode, or every discovered `.md` file in folder mode. */
  files: DiscoveredFile[]
  port: number
}

export interface StartedServer {
  server: Server
  url: string
  close: () => Promise<void>
}

/**
 * Serves the built dashboard shell (`dist/`) and confirms every target
 * Markdown file is readable. The tool never writes to those files. Single-
 * file mode is just folder mode with one file — the WS protocol and the
 * client both treat them identically; the sidebar only renders once there's
 * more than one file (see src/main.ts).
 */
export async function startServer({ files, port }: StartServerOptions): Promise<StartedServer> {
  for (const file of files) await readFile(file.absPath, 'utf-8')

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
  const idByAbsPath = new Map(files.map((file) => [file.absPath, file.id]))
  const fileIds = files.map((file) => file.id)

  const sendFileList = (socket: WebSocket): void => {
    socket.send(JSON.stringify({ type: 'files', files: fileIds }))
  }

  const sendContent = (socket: WebSocket, fileId: string, doc: ParsedDocument): void => {
    socket.send(JSON.stringify({ type: 'content', file: fileId, ...doc }))
  }

  // The Markdown file is user input edited outside this process — parsing it
  // is a system boundary, so a malformed edit (or one caught mid-save) must
  // never crash the server or the watcher. On failure, keep serving whatever
  // was last sent rather than pushing broken content.
  const safeParse = (content: string): ParsedDocument | null => {
    try {
      return parseDocument(content)
    } catch (error) {
      console.error('md-dashboard: failed to parse markdown, keeping last known content:', error)
      return null
    }
  }

  const loadAndSend = (socket: WebSocket, file: DiscoveredFile): void => {
    readFile(file.absPath, 'utf-8')
      .then((content) => {
        const doc = safeParse(content)
        if (doc) sendContent(socket, file.id, doc)
      })
      .catch((error: unknown) => console.error(`md-dashboard: failed to send initial content for ${file.id}:`, error))
  }

  wss.on('connection', (socket) => {
    clients.add(socket)
    socket.on('close', () => clients.delete(socket))
    sendFileList(socket)
    for (const file of files) loadAndSend(socket, file)
  })

  const fileWatcher: FileWatcher = watchFiles(
    files.map((file) => file.absPath),
    (absPath, content) => {
      const fileId = idByAbsPath.get(absPath)
      if (!fileId) return
      const doc = safeParse(content)
      if (!doc) return
      for (const client of clients) {
        if (client.readyState === client.OPEN) sendContent(client, fileId, doc)
      }
    },
  )

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

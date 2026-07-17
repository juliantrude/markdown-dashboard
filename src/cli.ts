import { existsSync, statSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { openBrowser } from './server/open-browser.js'
import { startServer } from './server/server.js'

interface CliOptions {
  filePath: string
  port: number
  open: boolean
}

const DEFAULT_PORT = 4173

function printUsageAndExit(message?: string): never {
  if (message) console.error(`md-dashboard: ${message}`)
  console.error('usage: md-dashboard <file.md> [--port <number>] [--no-open]')
  process.exit(1)
}

function parseArgs(argv: string[]): CliOptions {
  let fileArg: string | undefined
  let port = DEFAULT_PORT
  let open = true

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--port') {
      const value = argv[++i]
      const parsed = value ? Number(value) : NaN
      if (!Number.isInteger(parsed) || parsed <= 0) {
        printUsageAndExit(`invalid --port value: ${value ?? ''}`)
      }
      port = parsed
    } else if (arg === '--no-open') {
      open = false
    } else if (arg.startsWith('-')) {
      printUsageAndExit(`unknown option: ${arg}`)
    } else if (!fileArg) {
      fileArg = arg
    } else {
      printUsageAndExit(`unexpected argument: ${arg}`)
    }
  }

  if (!fileArg) printUsageAndExit('missing required <file.md> argument')

  return { filePath: resolve(process.cwd(), fileArg), port, open }
}

async function main(): Promise<void> {
  const { filePath, port, open } = parseArgs(process.argv.slice(2))

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    printUsageAndExit(`file not found: ${filePath}`)
  }
  if (extname(filePath) !== '.md') {
    printUsageAndExit(`expected a .md file, got: ${filePath}`)
  }

  const { url } = await startServer({ filePath, port })
  console.log(`md-dashboard: serving ${filePath}`)
  console.log(`md-dashboard: dashboard running at ${url}`)
  if (open) openBrowser(url)
}

main().catch((error: unknown) => {
  console.error('md-dashboard:', error instanceof Error ? error.message : error)
  process.exit(1)
})

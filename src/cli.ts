import { existsSync, statSync } from 'node:fs'
import { basename, extname, resolve } from 'node:path'
import { discoverMarkdownFiles, type DiscoveredFile } from './server/discover.js'
import { openBrowser } from './server/open-browser.js'
import { startServer } from './server/server.js'

interface CliOptions {
  targetPath: string
  port: number
  open: boolean
}

const DEFAULT_PORT = 4173

function printUsageAndExit(message?: string): never {
  if (message) console.error(`md-dashboard: ${message}`)
  console.error('usage: md-dashboard <file.md|folder> [--port <number>] [--no-open]')
  process.exit(1)
}

function parseArgs(argv: string[]): CliOptions {
  let targetArg: string | undefined
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
    } else if (!targetArg) {
      targetArg = arg
    } else {
      printUsageAndExit(`unexpected argument: ${arg}`)
    }
  }

  if (!targetArg) printUsageAndExit('missing required <file.md|folder> argument')

  return { targetPath: resolve(process.cwd(), targetArg), port, open }
}

async function main(): Promise<void> {
  const { targetPath, port, open } = parseArgs(process.argv.slice(2))

  if (!existsSync(targetPath)) {
    printUsageAndExit(`path not found: ${targetPath}`)
  }

  const stat = statSync(targetPath)
  let files: DiscoveredFile[]

  if (stat.isDirectory()) {
    files = discoverMarkdownFiles(targetPath)
    if (files.length === 0) printUsageAndExit(`no .md files found in directory: ${targetPath}`)
  } else {
    if (extname(targetPath) !== '.md') {
      printUsageAndExit(`expected a .md file or a folder, got: ${targetPath}`)
    }
    files = [{ id: basename(targetPath), absPath: targetPath }]
  }

  const { url } = await startServer({ files, port })
  console.log(`md-dashboard: serving ${files.length} file(s) from ${targetPath}`)
  console.log(`md-dashboard: dashboard running at ${url}`)
  if (open) openBrowser(url)
}

main().catch((error: unknown) => {
  console.error('md-dashboard:', error instanceof Error ? error.message : error)
  process.exit(1)
})

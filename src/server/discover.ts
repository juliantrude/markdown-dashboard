import { readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const IGNORED_DIRS = new Set(['node_modules', '.git'])

export interface DiscoveredFile {
  /** Relative path from the scanned root, forward-slashed — used as the file's id in the WS protocol and sidebar. */
  id: string
  absPath: string
}

/**
 * Recursively finds every `.md` file under `rootDir`, skipping dotfiles/dirs
 * (editor swap dirs, `.git`, etc.) and `node_modules`. Sorted by id so the
 * sidebar order is stable across restarts.
 */
export function discoverMarkdownFiles(rootDir: string): DiscoveredFile[] {
  const results: DiscoveredFile[] = []

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        results.push({ id: relative(rootDir, full).split(sep).join('/'), absPath: full })
      }
    }
  }

  walk(rootDir)
  results.sort((a, b) => a.id.localeCompare(b.id))
  return results
}

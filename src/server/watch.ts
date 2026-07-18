import { watch, type FSWatcher } from 'chokidar'
import { readFile } from 'node:fs/promises'

export interface FileWatcher {
  close: () => Promise<void>
}

/**
 * Watches a fixed set of Markdown files and invokes `onChange` with the
 * changed file's absolute path and fresh content whenever one is modified.
 * Uses `awaitWriteFinish` and listens to both `change` and `add` (editors
 * that save atomically via temp+rename emit `unlink`+`add` instead of
 * `change`) so saves are never missed. Files added to a watched folder after
 * startup are not picked up — the file set is fixed at CLI start (Increment
 * 13 scope).
 */
export function watchFiles(filePaths: string[], onChange: (filePath: string, content: string) => void): FileWatcher {
  const watcher: FSWatcher = watch(filePaths, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 20 },
  })

  const reload = (path: string): void => {
    readFile(path, 'utf-8')
      .then((content) => onChange(path, content))
      .catch((error: unknown) => {
        console.error('md-dashboard: failed to re-read file after change:', error)
      })
  }

  watcher.on('change', reload)
  watcher.on('add', reload)

  return {
    close: () => watcher.close(),
  }
}

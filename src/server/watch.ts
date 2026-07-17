import { watch, type FSWatcher } from 'chokidar'
import { readFile } from 'node:fs/promises'

export interface FileWatcher {
  close: () => Promise<void>
}

/**
 * Watches a single Markdown file and invokes `onChange` with its fresh
 * content whenever it's modified. Uses `awaitWriteFinish` and listens to
 * both `change` and `add` (editors that save atomically via temp+rename
 * emit `unlink`+`add` instead of `change`) so saves are never missed.
 */
export function watchFile(filePath: string, onChange: (content: string) => void): FileWatcher {
  const watcher: FSWatcher = watch(filePath, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 20 },
  })

  const reload = (): void => {
    readFile(filePath, 'utf-8')
      .then(onChange)
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

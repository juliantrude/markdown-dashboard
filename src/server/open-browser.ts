import { spawn } from 'node:child_process'

/**
 * Best-effort cross-platform "open the default browser" — failures (e.g. no
 * display, sandboxed CI) are swallowed since the URL is always printed too.
 */
export function openBrowser(url: string): void {
  const { platform } = process
  let command: string
  let args: string[]

  if (platform === 'darwin') {
    command = 'open'
    args = [url]
  } else if (platform === 'win32') {
    command = 'cmd'
    args = ['/c', 'start', '""', url]
  } else {
    command = 'xdg-open'
    args = [url]
  }

  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true })
    child.on('error', () => {
      console.warn(`md-dashboard: could not open browser automatically — visit ${url}`)
    })
    child.unref()
  } catch {
    console.warn(`md-dashboard: could not open browser automatically — visit ${url}`)
  }
}

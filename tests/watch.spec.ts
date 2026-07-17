import { test, expect } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 4320

let cliProcess: ChildProcess
let dir: string
let filePath: string

test.beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'md-dashboard-watch-'))
  filePath = join(dir, 'live.md')
  await writeFile(filePath, '# Watch Test\n\n## Status\n\nInitial content.\n')

  cliProcess = spawn(
    'node',
    ['bin/md-dashboard.js', filePath, '--port', String(PORT), '--no-open'],
    { stdio: 'pipe' },
  )

  await new Promise<void>((resolveStart, reject) => {
    const timeout = setTimeout(() => reject(new Error('CLI did not start in time')), 10_000)
    cliProcess.stdout?.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('dashboard running at')) {
        clearTimeout(timeout)
        resolveStart()
      }
    })
    cliProcess.on('error', reject)
  })
})

test.afterAll(async () => {
  cliProcess.kill()
  await rm(dir, { recursive: true, force: true })
})

test('editing the watched file updates the dashboard live with no manual reload', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}`)
  await expect(page.locator('#content')).toContainText('Initial content.')

  await writeFile(filePath, '# Watch Test\n\n## Status\n\nUpdated content.\n')

  await expect(page.locator('#content')).toContainText('Updated content.', { timeout: 2_000 })
})

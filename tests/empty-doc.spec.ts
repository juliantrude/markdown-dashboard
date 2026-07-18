import { test, expect } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'

const PORT = 4328

let cliProcess: ChildProcess

test.beforeAll(async () => {
  cliProcess = spawn(
    'node',
    ['bin/md-dashboard.js', 'tests/fixtures/empty.md', '--port', String(PORT), '--no-open'],
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

test.afterAll(() => {
  cliProcess.kill()
})

test('a document with no ## sections shows a friendly empty state, not a blank grid', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}`)
  await expect(page.locator('#doc-title')).toHaveText('Empty Dashboard')
  await expect(page.locator('.card')).toHaveCount(0)
  await expect(page.locator('.empty-state')).toBeVisible()
  await expect(page.locator('.empty-state')).toContainText('No sections found')
})

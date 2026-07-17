import { test, expect } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'

// Both tests share one spawned CLI process (see beforeAll/afterAll below);
// force them into the same worker so `fullyParallel` doesn't spawn a second
// CLI on the same port.
test.describe.configure({ mode: 'serial' })

const PORT = 4321

let cliProcess: ChildProcess

test.beforeAll(async () => {
  cliProcess = spawn(
    'node',
    ['bin/md-dashboard.js', 'tests/fixtures/elements.md', '--port', String(PORT), '--no-open'],
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

test('`##` boundaries produce cards and the `#` heading becomes the title', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}`)

  await expect(page.locator('#doc-title')).toHaveText('Elements Fixture')
  await expect(page.locator('.card')).toHaveCount(3)
  await expect(page.locator('.card-heading')).toHaveText(['Prose', 'Quotes and code', 'Media and breaks'])

  // Content before the first `##` boundary is dropped.
  await expect(page.locator('#content')).not.toContainText('lives before the first')
})

test('prose, sub-headings, blockquote, code, image, and horizontal rule all render', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}`)

  const proseCard = page.locator('.card', { hasText: 'Prose' })
  await expect(proseCard.locator('p strong')).toHaveText('bold')
  await expect(proseCard.locator('p em')).toHaveText('italic')
  await expect(proseCard.locator('h3')).toHaveText('A subheading')

  const quoteCard = page.locator('.card', { hasText: 'Quotes and code' })
  await expect(quoteCard.locator('blockquote')).toContainText('A blockquote worth reading.')
  await expect(quoteCard.locator('pre code')).toContainText('plain code block')

  const mediaCard = page.locator('.card', { hasText: 'Media and breaks' })
  await expect(mediaCard.locator('img')).toHaveAttribute('src', 'https://example.com/image.png')
  await expect(mediaCard.locator('img')).toHaveAttribute('alt', 'alt text')
  await expect(mediaCard.locator('hr')).toHaveCount(1)
})

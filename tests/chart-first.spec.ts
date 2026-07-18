import { test, expect } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'

// All tests share one spawned CLI process; force them into the same worker so
// `fullyParallel` doesn't spawn a second CLI on the same port (same fix as
// table.spec.ts / tasklist.spec.ts).
test.describe.configure({ mode: 'serial' })

const PORT = 4331

let cliProcess: ChildProcess

test.beforeAll(async () => {
  cliProcess = spawn(
    'node',
    ['bin/md-dashboard.js', 'tests/fixtures/chart-first.md', '--port', String(PORT), '--no-open'],
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

test('prose beside a table becomes a clamped caption under the chart', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}`)

  const card = page.locator('.card', { hasText: 'Revenue' })

  // The chart leads; the prose is demoted to a caption beneath it.
  await expect(card.locator('canvas')).toHaveCount(1)
  const caption = card.locator('.card-caption')
  await expect(caption).toBeVisible()
  await expect(caption).toContainText('explains the revenue table')

  // Long enough to overflow two lines, so the control is revealed...
  const readMore = caption.locator('.read-more')
  await expect(readMore).toBeVisible()
  await expect(readMore).toHaveText('Read more')

  // ...and expands the text inline rather than navigating away.
  const clampedHeight = await caption.locator('.clamp-body').evaluate((el) => el.clientHeight)
  await readMore.click()
  await expect(readMore).toHaveText('Read less')
  const expandedHeight = await caption.locator('.clamp-body').evaluate((el) => el.clientHeight)
  expect(expandedHeight).toBeGreaterThan(clampedHeight)
})

test('a prose-only section stays visible but de-emphasised', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}`)

  // Content is never silently dropped: the section still gets a card.
  const card = page.locator('.card', { hasText: 'Long note' })
  await expect(card).toHaveClass(/card-prose/)
  await expect(card.locator('canvas')).toHaveCount(0)
  await expect(card).toContainText('no chartable content')

  // And it carries the same Read more affordance as a caption.
  await expect(card.locator('.read-more')).toBeVisible()
})

test('short text gets no pointless Read more control', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}`)

  const card = page.locator('.card', { hasText: 'Short note' })
  await expect(card).toContainText('Brief.')
  // The control is only revealed for text that actually overflows the clamp.
  await expect(card.locator('.read-more')).toBeHidden()
})

test('the global toggle shows the whole original document, then returns', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}`)

  await expect(page.locator('.dashboard-grid')).toBeVisible()

  await page.locator('#markdown-toggle').click()

  // Second transparency tier: the entire source at once, not card by card.
  const document = page.locator('.dashboard-document')
  await expect(document).toBeVisible()
  await expect(document).toContainText('explains the revenue table')
  await expect(document).toContainText('no chartable content')
  await expect(page.locator('.card')).toHaveCount(0)

  await page.locator('#markdown-toggle').click()
  await expect(page.locator('.dashboard-grid')).toBeVisible()
  await expect(page.locator('.card').first()).toBeVisible()
})

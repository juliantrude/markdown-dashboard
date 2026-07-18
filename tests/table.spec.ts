import { test, expect } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'

// All tests share one spawned CLI process; force them into the same worker
// so `fullyParallel` doesn't spawn a second CLI on the same port (see
// parser.spec.ts / widgets.spec.ts for the same fix).
test.describe.configure({ mode: 'serial' })

const PORT = 4323

let cliProcess: ChildProcess

test.beforeAll(async () => {
  cliProcess = spawn(
    'node',
    ['bin/md-dashboard.js', 'tests/fixtures/tables.md', '--port', String(PORT), '--no-open'],
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

test('a single-series table renders as Bar and switches to Pie', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}`)

  const card = page.locator('.card', { hasText: 'Fruit Counts' })

  // Default view is the plain table (ELEMENTS.md: default widget for Table is Table itself).
  await expect(card.locator('table')).toBeVisible()
  await expect(card.locator('canvas')).toHaveCount(0)

  await card.locator('.toggle-btn[data-view="bar"]').click()
  await expect(card.locator('canvas')).toHaveCount(1)
  await expect(card.locator('.toggle-btn[data-view="bar"]')).toHaveAttribute('aria-pressed', 'true')

  await card.locator('.toggle-btn[data-view="pie"]').click()
  await expect(card.locator('canvas')).toHaveCount(1)
  await expect(card.locator('.toggle-btn[data-view="pie"]')).toHaveAttribute('aria-pressed', 'true')

  // Single-series shape: donut/line/area/radar all valid too; grouped/stacked bar and scatter need 2+ series.
  await expect(card.locator('.toggle-btn[data-view="donut"]')).toHaveCount(1)
  await expect(card.locator('.toggle-btn[data-view="bar-grouped"]')).toHaveCount(0)
  await expect(card.locator('.toggle-btn[data-view="scatter"]')).toHaveCount(0)
})

test('a two-series table offers grouped/stacked bar and scatter but not plain Bar or Pie', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}`)

  const card = page.locator('.card', { hasText: 'Monthly Sales' })

  await expect(card.locator('.toggle-btn[data-view="bar-grouped"]')).toHaveCount(1)
  await expect(card.locator('.toggle-btn[data-view="bar-stacked"]')).toHaveCount(1)
  await expect(card.locator('.toggle-btn[data-view="scatter"]')).toHaveCount(1)
  await expect(card.locator('.toggle-btn[data-view="bar"]')).toHaveCount(0)
  await expect(card.locator('.toggle-btn[data-view="pie"]')).toHaveCount(0)

  await card.locator('.toggle-btn[data-view="bar-stacked"]').click()
  await expect(card.locator('canvas')).toHaveCount(1)

  await card.locator('.toggle-btn[data-view="scatter"]').click()
  await expect(card.locator('canvas')).toHaveCount(1)
})

test('a card with no table offers no chart toggles', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}`)

  const card = page.locator('.card', { hasText: 'Notes' })
  await expect(card.locator('.toggle-btn')).toHaveCount(2) // default + markdown only
})

test('chart choice survives a reload', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}`)

  const card = page.locator('.card', { hasText: 'Fruit Counts' })
  await card.locator('.toggle-btn[data-view="pie"]').click()
  await expect(card.locator('canvas')).toHaveCount(1)

  await page.reload()

  const reloadedCard = page.locator('.card', { hasText: 'Fruit Counts' })
  await expect(reloadedCard.locator('.toggle-btn[data-view="pie"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(reloadedCard.locator('canvas')).toHaveCount(1)
})

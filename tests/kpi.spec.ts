import { test, expect } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'

// All tests share one spawned CLI process; force them into the same worker
// so `fullyParallel` doesn't spawn a second CLI on the same port (see
// parser.spec.ts / widgets.spec.ts / table.spec.ts / tasklist.spec.ts for the
// same fix).
test.describe.configure({ mode: 'serial' })

const PORT = 4325

let cliProcess: ChildProcess

test.beforeAll(async () => {
  cliProcess = spawn(
    'node',
    ['bin/md-dashboard.js', 'tests/fixtures/kpi.md', '--port', String(PORT), '--no-open'],
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

test('a numeric list defaults to KPI tiles, with the plain list as an alternative', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}`)

  const card = page.locator('.card', { hasText: 'Quarterly Metrics' })

  // Chart-first (ELEMENTS.md v2): stat tiles are the default now, not the list.
  const tiles = card.locator('.kpi-tile')
  await expect(tiles).toHaveCount(3)
  await expect(tiles.nth(0)).toContainText('120')
  await expect(tiles.nth(0)).toContainText('Revenue')
  await expect(tiles.nth(2)).toContainText('Headcount')

  await expect(card.locator('.toggle-btn[data-view="kpi-bar"]')).toHaveCount(1)
  await expect(card.locator('.toggle-btn[data-view="kpi-pie"]')).toHaveCount(1)

  // The plain list has swapped places with the tiles — it is the alternative.
  await card.locator('.toggle-btn[data-view="kpi-list"]').click()
  await expect(card.locator('.kpi-tile')).toHaveCount(0)
  await expect(card.locator('.card-body')).toContainText('Revenue: 120')
})

test('the KPI Bar and Pie views mount a chart', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}`)

  const card = page.locator('.card', { hasText: 'Quarterly Metrics' })

  await card.locator('.toggle-btn[data-view="kpi-bar"]').click()
  await expect(card.locator('canvas')).toHaveCount(1)

  await card.locator('.toggle-btn[data-view="kpi-pie"]').click()
  await expect(card.locator('canvas')).toHaveCount(1)
})

test('a lone Metric: value line defaults to a stat tile and offers a Gauge toggle', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}`)

  const card = page.locator('.card', { hasText: 'Uptime' })

  await expect(card.locator('.kpi-tile-single')).toHaveCount(1)
  await expect(card.locator('.kpi-tile-single')).toContainText('99.9%')
  await expect(card.locator('.kpi-tile-single')).toContainText('Metric')

  await expect(card.locator('.toggle-btn[data-view="gauge"]')).toHaveCount(1)
  await card.locator('.toggle-btn[data-view="gauge"]').click()
  await expect(card.locator('canvas')).toHaveCount(1)
})

test('a card with no numbers offers no KPI or Gauge toggles', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}`)

  const card = page.locator('.card', { hasText: 'Notes' })
  await expect(card.locator('.toggle-btn')).toHaveCount(2) // default + markdown only
})

test('KPI view choice survives a reload', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}`)

  const card = page.locator('.card', { hasText: 'Quarterly Metrics' })
  await card.locator('.toggle-btn[data-view="kpi-tiles"]').click()
  await expect(card.locator('.kpi-tile')).toHaveCount(3)

  await page.reload()

  const reloadedCard = page.locator('.card', { hasText: 'Quarterly Metrics' })
  await expect(reloadedCard.locator('.toggle-btn[data-view="kpi-tiles"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(reloadedCard.locator('.kpi-tile')).toHaveCount(3)
})

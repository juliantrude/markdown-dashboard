import { test, expect } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'

// All tests share one spawned CLI process; force them into the same worker
// so `fullyParallel` doesn't spawn a second CLI on the same port (see
// parser.spec.ts / widgets.spec.ts / table.spec.ts for the same fix).
test.describe.configure({ mode: 'serial' })

const PORT = 4324

let cliProcess: ChildProcess

test.beforeAll(async () => {
  cliProcess = spawn(
    'node',
    ['bin/md-dashboard.js', 'tests/fixtures/tasklist.md', '--port', String(PORT), '--no-open'],
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

test('a mixed task list renders as a progress bar with correct percentage and per-item status', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}`)

  const card = page.locator('.card', { hasText: 'Milestones' })

  // Default view is still the plain list text (ELEMENTS.md default widget: Checklist — Increment 6 covered the raw toggle mechanism, not this widget).
  await expect(card.locator('.toggle-btn[data-view="progress-bar"]')).toHaveCount(1)
  await expect(card.locator('.toggle-btn[data-view="progress-donut"]')).toHaveCount(1)

  await card.locator('.toggle-btn[data-view="progress-bar"]').click()

  // 2 of 4 done = 50%.
  await expect(card.locator('.progress-label')).toHaveText('50% complete (2/4)')
  await expect(card.locator('.progress-bar-fill')).toHaveCSS('width', /.+/)

  // Every milestone's individual done/open state stays visible alongside the aggregate.
  const items = card.locator('.task-item')
  await expect(items).toHaveCount(4)
  const checkboxes = card.locator('.task-item input[type="checkbox"]')
  await expect(checkboxes.nth(0)).toBeChecked()
  await expect(checkboxes.nth(1)).toBeChecked()
  await expect(checkboxes.nth(2)).not.toBeChecked()
  await expect(checkboxes.nth(3)).not.toBeChecked()
  await expect(items.nth(2)).toContainText('Backfill data')
})

test('the progress donut view shows a chart plus the same per-item checklist', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}`)

  const card = page.locator('.card', { hasText: 'Milestones' })
  await card.locator('.toggle-btn[data-view="progress-donut"]').click()

  await expect(card.locator('canvas')).toHaveCount(1)
  await expect(card.locator('.task-item')).toHaveCount(4)
})

test('a card with no task list offers no progress toggles', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}`)

  const card = page.locator('.card', { hasText: 'Notes' })
  await expect(card.locator('.toggle-btn')).toHaveCount(2) // default + markdown only
})

test('progress view choice survives a reload', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}`)

  const card = page.locator('.card', { hasText: 'Milestones' })
  await card.locator('.toggle-btn[data-view="progress-donut"]').click()
  await expect(card.locator('canvas')).toHaveCount(1)

  await page.reload()

  const reloadedCard = page.locator('.card', { hasText: 'Milestones' })
  await expect(reloadedCard.locator('.toggle-btn[data-view="progress-donut"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(reloadedCard.locator('canvas')).toHaveCount(1)
})

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

test('a task list defaults to a segmented bar with one segment per item', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}`)

  const card = page.locator('.card', { hasText: 'Milestones' })

  // Chart-first: the segmented bar is the default view — no click needed.
  await expect(card.locator('.progress-label')).toHaveText('50% complete (2/4)')

  // The defining v2 change: one segment per item, not a two-slice Done/Open
  // aggregate. Each milestone's state is visible *in the chart itself*.
  await expect(card.locator('.task-segment')).toHaveCount(4)
  await expect(card.locator('.task-segment-done')).toHaveCount(2)
  await expect(card.locator('.task-segment-open')).toHaveCount(2)

  // Below the disclosure threshold the chart stands alone — no text list beside it.
  await expect(card.locator('.task-item')).toHaveCount(0)
})

test('a segment reveals its item text on hover and on tap', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}`)

  const card = page.locator('.card', { hasText: 'Milestones' })
  const tooltip = card.locator('.segment-tooltip')

  await expect(tooltip).toBeHidden()

  // Desktop path: hover.
  await card.locator('.task-segment').nth(2).hover()
  await expect(tooltip).toBeVisible()
  await expect(tooltip).toHaveText('Backfill data')

  // Touch path: a tap must reach the same tooltip, since hover doesn't exist there.
  await card.locator('.task-segment').nth(0).click()
  await expect(tooltip).toBeVisible()
  await expect(tooltip).toHaveText('Design schema')
})

test('the progress donut renders one slice per item, without a separate checklist', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}`)

  const card = page.locator('.card', { hasText: 'Milestones' })
  await card.locator('.toggle-btn[data-view="progress-donut"]').click()

  await expect(card.locator('canvas')).toHaveCount(1)
  await expect(card.locator('.task-item')).toHaveCount(0)
})

test('the Checklist alternative still shows every item and its state', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}`)

  const card = page.locator('.card', { hasText: 'Milestones' })
  await card.locator('.toggle-btn[data-view="checklist"]').click()

  const items = card.locator('.task-item')
  await expect(items).toHaveCount(4)
  const checkboxes = card.locator('.task-item input[type="checkbox"]')
  await expect(checkboxes.nth(0)).toBeChecked()
  await expect(checkboxes.nth(1)).toBeChecked()
  await expect(checkboxes.nth(2)).not.toBeChecked()
  await expect(items.nth(2)).toContainText('Backfill data')
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

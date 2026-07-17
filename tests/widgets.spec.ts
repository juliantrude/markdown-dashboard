import { test, expect } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'

// Both tests share one spawned CLI process (see beforeAll/afterAll below);
// force them into the same worker so `fullyParallel` doesn't spawn a second
// CLI on the same port (see parser.spec.ts for the same fix).
test.describe.configure({ mode: 'serial' })

const PORT = 4322

let cliProcess: ChildProcess

test.beforeAll(async () => {
  cliProcess = spawn(
    'node',
    ['bin/md-dashboard.js', 'tests/fixtures/widgets.md', '--port', String(PORT), '--no-open'],
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

test('toggle switches between the default widget and the faithful Markdown raw-render mode', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}`)

  const card = page.locator('.card', { hasText: 'Tasks' })

  // Default view: no widget-specific task-list rendering yet (Increment 8) — plain list text.
  await expect(card.locator('input[type="checkbox"]')).toHaveCount(0)
  await expect(card.locator('.card-body')).toContainText('[ ] Buy milk')

  await card.locator('.toggle-btn[data-view="markdown"]').click()

  // Markdown raw-render mode: real, disabled checkboxes reflecting done/open state.
  const checkboxes = card.locator('input[type="checkbox"]')
  await expect(checkboxes).toHaveCount(2)
  await expect(checkboxes.nth(0)).toBeDisabled()
  await expect(checkboxes.nth(0)).not.toBeChecked()
  await expect(checkboxes.nth(1)).toBeChecked()
  await expect(card.locator('.card-body')).toContainText('Buy milk')
  await expect(card.locator('.card-body')).not.toContainText('[ ] Buy milk')
})

test('toggle choice persists in localStorage and survives a reload', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}`)

  const card = page.locator('.card', { hasText: 'Tasks' })
  await card.locator('.toggle-btn[data-view="markdown"]').click()
  await expect(card.locator('.toggle-btn[data-view="markdown"]')).toHaveAttribute('aria-pressed', 'true')

  await page.reload()

  const reloadedCard = page.locator('.card', { hasText: 'Tasks' })
  await expect(reloadedCard.locator('.toggle-btn[data-view="markdown"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(reloadedCard.locator('input[type="checkbox"]')).toHaveCount(2)
})

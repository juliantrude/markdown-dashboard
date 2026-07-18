import { test, expect } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'

// Same fix as parser.spec.ts / widgets.spec.ts / table.spec.ts / tasklist.spec.ts:
// force all tests onto one worker so `fullyParallel` doesn't spawn a second
// CLI on the same port.
test.describe.configure({ mode: 'serial' })

const PORT = 4326

let cliProcess: ChildProcess

test.beforeAll(async () => {
  cliProcess = spawn(
    'node',
    ['bin/md-dashboard.js', 'tests/fixtures/diagrams.md', '--port', String(PORT), '--no-open'],
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

test('a mermaid fence renders as a diagram by default and offers no chart alternatives', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}`)

  const card = page.locator('.card', { hasText: 'Flowchart' })
  await expect(card.locator('.mermaid-container svg')).toBeVisible()
  await expect(card.locator('.toggle-btn')).toHaveCount(2) // default + markdown only

  await card.locator('.toggle-btn[data-view="markdown"]').click()
  await expect(card.locator('pre code')).toContainText('graph TD')
  await expect(card.locator('svg')).toHaveCount(0)
})

test('an invalid mermaid diagram shows an inline error instead of crashing', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}`)

  const card = page.locator('.card', { hasText: 'Broken Diagram' })
  await expect(card.locator('.mermaid-error')).toBeVisible()

  // mermaid.render() stages a `#d<id>` div on <body> and normally removes it
  // itself, but only on the success path — a parse error must not leave that
  // staging element (with mermaid's own big error-diagram SVG) floating
  // outside the card layout.
  await expect(page.locator('body > div[id^="dmermaid"]')).toHaveCount(0)
})

test('a ```chart fence renders its default type as a chart and offers shape-valid alternatives', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}`)

  const card = page.locator('.card', { hasText: 'Explicit Chart' })

  // Default view is already the explicit chart (the fence's declared "bar" type), not raw config text.
  await expect(card.locator('canvas')).toHaveCount(1)
  await expect(card.locator('.toggle-btn[data-view="default"]')).toHaveAttribute('aria-pressed', 'true')

  // 3 categories / 1 series: line, area, pie, donut, radar are the shape-valid alternatives (bar is the default, not repeated).
  await expect(card.locator('.toggle-btn[data-view="fence-line"]')).toHaveCount(1)
  await expect(card.locator('.toggle-btn[data-view="fence-pie"]')).toHaveCount(1)
  await expect(card.locator('.toggle-btn[data-view="fence-radar"]')).toHaveCount(1)

  await card.locator('.toggle-btn[data-view="fence-pie"]').click()
  await expect(card.locator('canvas')).toHaveCount(1)
  await expect(card.locator('.toggle-btn[data-view="fence-pie"]')).toHaveAttribute('aria-pressed', 'true')

  await card.locator('.toggle-btn[data-view="markdown"]').click()
  await expect(card.locator('pre code')).toContainText('"type": "bar"')
})

test('a card with no fence offers no diagram/chart toggles', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}`)

  const card = page.locator('.card', { hasText: 'Notes' })
  await expect(card.locator('.toggle-btn')).toHaveCount(2) // default + markdown only
})

test('chart fence view choice survives a reload', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}`)

  const card = page.locator('.card', { hasText: 'Explicit Chart' })
  await card.locator('.toggle-btn[data-view="fence-donut"]').click()
  await expect(card.locator('canvas')).toHaveCount(1)

  await page.reload()

  const reloadedCard = page.locator('.card', { hasText: 'Explicit Chart' })
  await expect(reloadedCard.locator('.toggle-btn[data-view="fence-donut"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(reloadedCard.locator('canvas')).toHaveCount(1)
})

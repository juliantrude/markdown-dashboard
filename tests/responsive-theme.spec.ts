import { test, expect } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'

// All tests share one spawned CLI process; force them into the same worker
// so `fullyParallel` doesn't spawn a second CLI on the same port (see
// parser.spec.ts and friends for the same fix).
test.describe.configure({ mode: 'serial' })

const PORT = 4327

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

test('theme defaults to the browser color scheme (dark)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto(`http://localhost:${PORT}`)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('theme defaults to the browser color scheme (light)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto(`http://localhost:${PORT}`)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('manual toggle overrides the system preference and persists across reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto(`http://localhost:${PORT}`)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await page.click('#theme-toggle')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  // System preference flips back to dark, but the manual override should win.
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  const stored = await page.evaluate(() => localStorage.getItem('md-dashboard:theme'))
  expect(stored).toBe('light')
})

test('mobile viewport stacks cards into a single column', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto(`http://localhost:${PORT}`)

  const cards = page.locator('.card')
  await expect(cards).toHaveCount(3)
  const first = await cards.nth(0).boundingBox()
  const second = await cards.nth(1).boundingBox()
  expect(first).not.toBeNull()
  expect(second).not.toBeNull()
  // Stacked: same left edge, second card starts below the first.
  expect(Math.abs(first!.x - second!.x)).toBeLessThan(2)
  expect(second!.y).toBeGreaterThan(first!.y + first!.height - 2)
})

test('desktop viewport lays cards out side by side', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`http://localhost:${PORT}`)

  const cards = page.locator('.card')
  await expect(cards).toHaveCount(3)
  const first = await cards.nth(0).boundingBox()
  const second = await cards.nth(1).boundingBox()
  expect(first).not.toBeNull()
  expect(second).not.toBeNull()
  // Side by side: roughly the same top edge, second card starts to the right.
  expect(Math.abs(first!.y - second!.y)).toBeLessThan(2)
  expect(second!.x).toBeGreaterThan(first!.x + first!.width - 2)
})

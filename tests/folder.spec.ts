import { test, expect } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'

// Increment 13: passing a folder instead of a single file watches every
// `.md` file under it (recursively) and adds sidebar navigation between
// them. See tests/fixtures/folder/{alpha,beta}.md and nested/gamma.md.

test.describe('folder mode', () => {
  // Same fix as parser.spec.ts/widgets.spec.ts/etc.: all tests here share one
  // spawned CLI on one port, so they must run in the same worker.
  test.describe.configure({ mode: 'serial' })

  const PORT = 4329
  let cliProcess: ChildProcess

  test.beforeAll(async () => {
    cliProcess = spawn(
      'node',
      ['bin/md-dashboard.js', 'tests/fixtures/folder', '--port', String(PORT), '--no-open'],
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

  test('the sidebar lists every discovered file, recursively, and the first one renders by default', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`)

    const nav = page.locator('#file-nav')
    await expect(nav).toBeVisible()
    const buttons = nav.locator('.file-nav-btn')
    await expect(buttons).toHaveCount(3)
    await expect(buttons.nth(0)).toHaveText(/alpha\.md/)
    await expect(buttons.nth(1)).toHaveText(/beta\.md/)
    await expect(buttons.nth(2)).toHaveText(/nested\/gamma\.md/)

    // alpha.md sorts first, so it's selected by default.
    await expect(buttons.nth(0)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('#doc-title')).toHaveText('Alpha')
    await expect(page.locator('.card', { hasText: 'Overview' })).toBeVisible()
    await expect(page.locator('.card', { hasText: 'Status' })).toBeVisible()
  })

  test('clicking a sidebar entry switches the rendered dashboard to that file', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`)

    await page.locator('.file-nav-btn', { hasText: 'beta.md' }).click()

    await expect(page.locator('#doc-title')).toHaveText('Beta')
    await expect(page.locator('.card', { hasText: 'Overview' })).toBeVisible()
    await expect(page.locator('.card', { hasText: 'Notes' })).toBeVisible()
    await expect(page.locator('.file-nav-btn', { hasText: 'beta.md' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.file-nav-btn', { hasText: 'alpha.md' })).toHaveAttribute('aria-pressed', 'false')
  })

  test('a file nested in a subfolder is reachable and renders', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`)

    await page.locator('.file-nav-btn', { hasText: 'nested/gamma.md' }).click()

    await expect(page.locator('#doc-title')).toHaveText('Gamma')
    await expect(page.locator('.card', { hasText: 'Overview' })).toBeVisible()
  })

  test('the selected file survives a full page reload', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`)

    await page.locator('.file-nav-btn', { hasText: 'beta.md' }).click()
    await expect(page.locator('#doc-title')).toHaveText('Beta')

    await page.reload()

    await expect(page.locator('#doc-title')).toHaveText('Beta')
    await expect(page.locator('.file-nav-btn', { hasText: 'beta.md' })).toHaveAttribute('aria-pressed', 'true')
  })
})

test.describe('single-file mode (regression)', () => {
  const PORT = 4330
  let cliProcess: ChildProcess

  test.beforeAll(async () => {
    cliProcess = spawn(
      'node',
      ['bin/md-dashboard.js', 'tests/fixtures/sample.md', '--port', String(PORT), '--no-open'],
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

  test('a single-file target shows no sidebar', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`)
    await expect(page.locator('h1')).toHaveText('Dashboard')
    await expect(page.locator('#file-nav')).toBeHidden()
  })
})

import { test, expect } from '@playwright/test'

test('dev server starts and renders the dashboard shell', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('md-dashboard')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})

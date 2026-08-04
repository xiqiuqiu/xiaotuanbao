import { test, expect } from '@playwright/test'
import { adminUser } from '../support/credentials'
import { loginAs } from '../support/auth'
import { paths } from '../support/urls'

test.describe('workbench smoke', () => {
  test('工作台主区域可打开', async ({ page }) => {
    await loginAs(page, adminUser)
    await page.goto(paths.home)

    await expect(page.getByRole('heading', { name: /工作台/ })).toBeVisible()
    await expect(page.getByText('工作台加载失败')).toHaveCount(0)
  })
})

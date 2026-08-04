import { test, expect } from '@playwright/test'
import { adminUser } from '../support/credentials'
import { loginAs } from '../support/auth'
import { departureDetailTabs, paths } from '../support/urls'

test.describe('departure smoke', () => {
  test('发团列表可打开；有数据时详情主 Tab 可切换', async ({ page }) => {
    await loginAs(page, adminUser)
    await page.goto(paths.departure)

    await expect(page).toHaveURL(new RegExp(paths.departure))
    await expect(page.getByRole('heading', { name: '发团管理' })).toBeVisible()

    const detailLink = page
      .locator('a[href*="/departure/"]')
      .filter({ hasNot: page.locator('[href$="/departure/new"]') })
      .first()
    const hasDeparture = (await detailLink.count()) > 0

    if (!hasDeparture) {
      test.info().annotations.push({
        type: 'note',
        description: '列表无发团，跳过详情 Tab；可先跑 departure-create.flow',
      })
      return
    }

    await detailLink.click()
    await expect(page).toHaveURL(/\/departure\/[^/]+/)

    for (const tab of departureDetailTabs) {
      const tabControl = page.getByRole('tab', { name: tab })
      await expect(tabControl).toBeVisible()
      await tabControl.click()
      await expect(tabControl).toHaveAttribute('aria-selected', 'true')
    }
  })
})

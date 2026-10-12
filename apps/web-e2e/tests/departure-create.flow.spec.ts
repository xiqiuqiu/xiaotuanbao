import { test, expect } from '@playwright/test'
import { coordinatorUser } from '../support/credentials'
import { loginAs } from '../support/auth'
import { paths } from '../support/urls'

test.describe('departure create flow', () => {
  test('计调可新建发团草稿并在列表看到', async ({ page }) => {
    const stamp = Date.now()
    const routeName = `e2e-web-route-${stamp}`
    const departureName = `e2e-web-${stamp}`

    await loginAs(page, coordinatorUser)
    await page.goto(paths.departureNew)

    await expect(page.getByRole('heading', { name: '新建发团' })).toBeVisible()

    await page.getByRole('textbox', { name: '路线名称' }).fill(routeName)

    const startDate = page.getByLabel('出团日期')
    await startDate.click()
    // Ant DatePicker: type ISO date and confirm.
    await startDate.fill('2026-12-15')
    await page.keyboard.press('Enter')
    // 回测：结束日默认今天，改出团日后必须跟随，否则会存成跨度错误的团期。
    await expect(page.getByLabel('结束日期')).toHaveValue('2026-12-15')

    await expect(page.getByLabel('团名')).toBeVisible()
    await page.getByLabel('团名').fill(departureName)
    await page.getByRole('button', { name: '创建发团' }).click()

    await expect(page.getByText('发团已创建')).toBeVisible()
    await expect(page).toHaveURL(/\/departure\/[^/]+/)

    await page.goto(paths.departure)
    await expect(page.getByText(departureName)).toBeVisible()
  })
})

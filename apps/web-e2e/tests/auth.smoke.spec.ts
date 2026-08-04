import { test, expect } from '@playwright/test'
import { adminUser } from '../support/credentials'
import { loginAs, logout } from '../support/auth'
import { paths } from '../support/urls'

test.describe('auth smoke', () => {
  test('登录进入工作台并可退出', async ({ page }) => {
    await loginAs(page, adminUser)

    await expect(page).toHaveURL(new RegExp(`${paths.home}$|/$`))
    await expect(page.getByRole('heading', { name: /工作台/ })).toBeVisible()

    await logout(page, adminUser.displayName)
  })
})

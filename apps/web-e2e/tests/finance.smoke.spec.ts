import { test, expect } from '@playwright/test'
import { adminUser } from '../support/credentials'
import { loginAs } from '../support/auth'
import { paths } from '../support/urls'

const financePages = [
  { path: paths.financeReceivable, title: '应收管理' },
  { path: paths.financePayable, title: '应付管理' },
  { path: paths.financeTransactions, title: '收支流水' },
  { path: paths.financeVerification, title: '核销管理' },
] as const

test.describe('finance smoke', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, adminUser)
  })

  for (const { path, title } of financePages) {
    test(`${title}页可打开`, async ({ page }) => {
      await page.goto(path)
      await expect(page).toHaveURL(new RegExp(path.replace(/\//g, '\\/')))
      await expect(page).not.toHaveURL(/\/login/)
      await expect(page.getByRole('heading', { name: title })).toBeVisible()
    })
  }
})

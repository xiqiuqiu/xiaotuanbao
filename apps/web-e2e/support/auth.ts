import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import type { E2eUser } from './credentials'
import { paths } from './urls'

export async function loginAs(page: Page, user: E2eUser): Promise<void> {
  await page.goto(paths.login)
  await expect(page.getByRole('main', { name: '登录' })).toBeVisible()

  const loginForm = page.getByRole('main', { name: '登录' })
  await loginForm.getByRole('textbox', { name: '用户名' }).fill(user.username)
  await loginForm.getByRole('textbox', { name: '密码' }).fill(user.password)
  // Ant Design large primary buttons expose spaced CJK labels (e.g. "登 录").
  await loginForm.getByRole('button', { name: /登\s*录/ }).click()

  await expect(page).not.toHaveURL(/\/login/)
  await expect(page.getByRole('button', { name: user.displayName })).toBeVisible()
}

export async function logout(page: Page, displayName: string): Promise<void> {
  await page.getByRole('button', { name: displayName }).click()
  await page.getByText('退出登录').click()
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('main', { name: '登录' })).toBeVisible()
}

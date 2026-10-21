import { expect, test } from '@playwright/test'
import { loginCoordinator } from '../support/collaboration'
import { paths } from '../support/urls'

test('运行时发现短暂 500 后自动恢复，不遗留运行时错误', async ({ page }) => {
  let discoveryRequests = 0
  await page.route('**/copilotkit/info', async (route) => {
    discoveryRequests += 1
    if (discoveryRequests <= 4) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'temporary startup failure' }) })
      return
    }
    await route.continue()
  })
  await loginCoordinator(page)
  await page.goto(paths.departure)
  await page.getByRole('button', { name: '展开电子化助理', exact: true }).click()
  await page.getByRole('textbox', { name: '询问小团宝业务' }).fill('重连后继续编辑的草稿')
  await expect.poll(() => discoveryRequests, { timeout: 15_000 }).toBeGreaterThan(4)
  await expect(page.getByText('Runtime info request failed with status 500', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: '询问小团宝业务' })).toHaveValue('重连后继续编辑的草稿')
  await expect(page.getByText('助手连接暂时中断，正在自动重连', { exact: true })).toHaveCount(0)
})

test('持续不可用时保留草稿并提供重连入口，服务恢复后无需刷新', async ({ page }) => {
  let available = false
  await page.route('**/copilotkit/info', async (route) => {
    if (available) return route.continue()
    await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
  })
  await loginCoordinator(page)
  await page.goto(paths.departure)
  await page.getByRole('button', { name: '展开电子化助理', exact: true }).click()
  await expect(page.getByText('助手连接暂时中断，正在自动重连', { exact: true })).toBeVisible()
  const composer = page.getByRole('textbox', { name: '询问小团宝业务' })
  await composer.fill('服务恢复后继续的业务草稿')
  available = true
  await page.getByRole('button', { name: '立即重连', exact: true }).click()
  await expect(page.getByText('助手连接暂时中断，正在自动重连', { exact: true })).toHaveCount(0)
  await expect(composer).toHaveValue('服务恢复后继续的业务草稿')
  await expect(page.getByText('Runtime info request failed with status 500', { exact: true })).toHaveCount(0)
})

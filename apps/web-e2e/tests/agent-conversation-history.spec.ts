import { expect, test } from '@playwright/test'
import { coordinatorUser } from '../support/credentials'
import { loginAs } from '../support/auth'
import { paths } from '../support/urls'

test.describe('agent conversation history #369', () => {
  test('展开、新建、切换历史且业务 URL 不变', async ({ page }) => {
    const stamp = Date.now()
    const title = `e2e369 ${stamp} 历史会话`

    await loginAs(page, coordinatorUser)
    await page.goto(paths.departure)
    await expect(page.getByRole('heading', { name: '发团管理' })).toBeVisible()

    const created = await page.request.post('/api/agent/conversations/messages', {
      data: { text: title },
      headers: {
        Origin: 'http://localhost:5173',
        'Idempotency-Key': `e2e369-${stamp}`,
      },
    })
    expect(created.status(), await created.text()).toBe(201)

    await page.getByRole('button', { name: '展开电子化助理' }).click()
    const pane = page.getByRole('complementary', { name: '电子化助理' })
    await expect(pane).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`${paths.departure}$`))

    await pane.getByRole('button', { name: '打开会话历史' }).click()
    const overlay = page.getByRole('dialog', { name: '会话历史' })
    await expect(overlay.getByRole('searchbox', { name: '搜索会话' })).toBeVisible()
    await overlay.getByRole('searchbox', { name: '搜索会话' }).fill(String(stamp))
    await expect(overlay.getByRole('option', { name: title })).toBeVisible()
    await overlay.getByRole('option', { name: title }).click()

    await expect(pane.getByRole('button', { name: '打开会话历史' })).toContainText(title)
    await expect(page).toHaveURL(new RegExp(`${paths.departure}$`))

    await pane.getByRole('button', { name: '新建会话', exact: true }).click()
    await expect(pane.getByRole('button', { name: '打开会话历史' })).toContainText('新会话')
    await expect(page).toHaveURL(new RegExp(`${paths.departure}$`))
  })
})

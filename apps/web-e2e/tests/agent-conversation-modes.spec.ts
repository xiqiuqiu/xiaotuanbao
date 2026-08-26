import { expect, test } from '@playwright/test'
import { coordinatorUser } from '../support/credentials'
import { loginAs } from '../support/auth'
import { paths } from '../support/urls'

test.describe('agent conversation modes #370', () => {
  test('侧栏展开到全局再返回，Conversation ID 与草稿保持', async ({ page }) => {
    const stamp = Date.now()
    const title = `e2e370 ${stamp} 同会话切换`

    await loginAs(page, coordinatorUser)
    await page.goto(paths.departure)
    await expect(page.getByRole('heading', { name: '发团管理' })).toBeVisible()

    const created = await page.request.post('/api/agent/conversations/messages', {
      data: { text: title },
      headers: {
        Origin: 'http://localhost:5173',
        'Idempotency-Key': `e2e370-${stamp}`,
      },
    })
    expect(created.status(), await created.text()).toBe(201)
    const conversationId = (await created.json()).data.conversationId as string

    await page.getByRole('button', { name: '展开电子化助理' }).click()
    const pane = page.getByRole('complementary', { name: '电子化助理' })
    await expect(pane).toBeVisible()

    await pane.getByRole('button', { name: '打开会话历史' }).click()
    const overlay = page.getByRole('dialog', { name: '会话历史' })
    await overlay.getByRole('searchbox', { name: '搜索会话' }).fill(String(stamp))
    await overlay.getByRole('option', { name: title }).click()
    await expect(pane.getByRole('button', { name: '打开会话历史' })).toContainText(title)

    const composer = pane.getByRole('textbox', { name: '询问小团宝业务' })
    await composer.fill('未发送草稿')
    await expect
      .poll(async () => {
        const current = await page.request.get(`/api/agent/conversations/${conversationId}`)
        const body = (await current.json()) as { data?: { draft?: { text?: string } } }
        return body.data?.draft?.text ?? ''
      })
      .toBe('未发送草稿')
    await pane.getByRole('button', { name: '进入全局模式' }).click()

    await expect(page).toHaveURL(new RegExp(`${paths.departure}$`))
    const globalOverlay = page.getByRole('dialog', { name: '小团宝 Agent' })
    await expect(globalOverlay).toBeVisible()
    await expect(globalOverlay.getByRole('complementary', { name: '会话历史导航' })).toBeVisible()
    await expect(globalOverlay.getByRole('button', { name: '返回业务页面' })).toBeVisible()
    await expect(globalOverlay.getByRole('button', { name: '折叠历史导航' })).toBeVisible()
    await expect(globalOverlay.getByRole('textbox', { name: '询问小团宝业务' })).toHaveValue(
      '未发送草稿',
    )

    await page.reload()
    await expect(page).toHaveURL(new RegExp(`${paths.departure}$`))
    await expect(page.getByRole('dialog', { name: '小团宝 Agent' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: '询问小团宝业务' })).toHaveValue('未发送草稿')

    await page.getByRole('button', { name: '返回业务页面' }).click()
    await expect(page).toHaveURL(new RegExp(`${paths.departure}$`))
    const restoredPane = page.getByRole('complementary', { name: '电子化助理' })
    await expect(restoredPane).toBeVisible()
    await expect(restoredPane.getByRole('button', { name: '打开会话历史' })).toContainText(title)
    await expect(restoredPane.getByRole('textbox', { name: '询问小团宝业务' })).toHaveValue(
      '未发送草稿',
    )
  })

  test('移动视口使用全屏单栏且没有放大按钮', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await loginAs(page, coordinatorUser)
    await page.goto(paths.departure)
    await page.getByRole('button', { name: '展开电子化助理' }).click()
    const pane = page.getByRole('complementary', { name: '电子化助理' })
    await expect(pane).toBeVisible()
    await expect(pane.getByRole('button', { name: '进入全局模式' })).toHaveCount(0)
    await expect(pane.getByRole('button', { name: '新建会话' })).toBeVisible()
    await expect(pane.getByRole('button', { name: '收起电子化助理' })).toBeVisible()
  })

  test('发送后立即展开仍停留在同一 Conversation', async ({ page }) => {
    const stamp = Date.now()
    const title = `e2e370 ${stamp} 流式切换`

    await loginAs(page, coordinatorUser)
    await page.goto(paths.departure)
    const created = await page.request.post('/api/agent/conversations/messages', {
      data: { text: title },
      headers: {
        Origin: 'http://localhost:5173',
        'Idempotency-Key': `e2e370-stream-${stamp}`,
      },
    })
    expect(created.status(), await created.text()).toBe(201)
    const conversationId = (await created.json()).data.conversationId as string

    await page.getByRole('button', { name: '展开电子化助理' }).click()
    const pane = page.getByRole('complementary', { name: '电子化助理' })
    await pane.getByRole('button', { name: '打开会话历史' }).click()
    const history = page.getByRole('dialog', { name: '会话历史' })
    await history.getByRole('searchbox', { name: '搜索会话' }).fill(String(stamp))
    await history.getByRole('option', { name: title }).click()

    const composer = pane.getByRole('textbox', { name: '询问小团宝业务' })
    await composer.fill('切换中的提问')
    await composer.press('Enter')
    await pane.getByRole('button', { name: '进入全局模式' }).click()
    const overlay = page.getByRole('dialog', { name: '小团宝 Agent' })
    await expect(overlay).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`${paths.departure}$`))
    await expect(overlay.getByText('切换中的提问')).toHaveCount(1)

    await expect
      .poll(async () => {
        const current = await page.request.get(`/api/agent/conversations/${conversationId}`)
        if (!current.ok()) {
          return -1
        }
        const body = (await current.json()) as {
          data?: { events?: Array<{ payload?: { text?: string } }> }
        }
        return (
          body.data?.events?.filter((event) => event.payload?.text === '切换中的提问').length ?? 0
        )
      })
      .toBe(1)
  })
})

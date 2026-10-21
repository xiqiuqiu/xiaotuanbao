import { expect, test } from '@playwright/test'
import { loginCoordinator } from '../support/collaboration'
import { paths } from '../support/urls'

test('运行时发现短暂 500 后自动恢复，不遗留运行时错误', async ({ page }) => {
  let discoveryRequests = 0
  let discovered = false
  page.on('response', response => {
    if (new URL(response.url()).pathname === '/copilotkit/info' && response.status() === 200) discovered = true
  })
  await page.route('**/copilotkit/info', async (route) => {
    discoveryRequests += 1
    if (discoveryRequests <= 2) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'temporary startup failure' }) })
      return
    }
    await route.continue()
  })
  await loginCoordinator(page)
  await page.goto(paths.departure)
  await page.getByRole('button', { name: '展开电子化助理', exact: true }).click()
  await page.getByRole('textbox', { name: '询问小团宝业务' }).fill('重连后继续编辑的草稿')
  await expect.poll(() => discoveryRequests, { timeout: 15_000 }).toBeGreaterThan(2)
  await expect.poll(() => discovered).toBe(true)
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
  const connected = page.waitForResponse(response => new URL(response.url()).pathname === '/copilotkit/info' && response.status() === 200)
  await page.getByRole('button', { name: '立即重连', exact: true }).click()
  await expect(page.getByText('助手连接暂时中断，正在自动重连', { exact: true })).toHaveCount(0)
  expect((await connected).status()).toBe(200)
  await expect(composer).toHaveValue('服务恢复后继续的业务草稿')
})

for (const httpStatus of [401, 403, 404]) test(`发现接口 ${httpStatus} 时停止自动重试并说明原因`, async ({ page }) => {
  let requests = 0
  await page.route('**/copilotkit/info', async (route) => {
    requests += 1
    await route.fulfill({ status: httpStatus, contentType: 'application/json', body: '{}' })
  })
  await loginCoordinator(page)
  await page.goto(paths.departure)
  await page.getByRole('button', { name: '展开电子化助理', exact: true }).click()
  await expect(page.getByText(httpStatus === 404 ? '助手连接配置有误，请检查服务地址后重试' : '助手连接认证失败，请重新登录后重试', { exact: true })).toBeVisible()
  const stoppedAt = requests
  await page.waitForTimeout(2500)
  expect(requests).toBe(stoppedAt)
})


test('瞬时故障耗尽三次自动重试后停止，仍可手动恢复', async ({ page }) => {
  let available = false
  let requests = 0
  await page.route('**/copilotkit/info', async route => {
    requests += 1
    if (available) return route.continue()
    await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
  })
  await loginCoordinator(page)
  await page.goto(paths.departure)
  await page.getByRole('button', { name: '展开电子化助理', exact: true }).click()
  await expect(page.getByText('助手连接失败，自动重试已停止，请手动重连', { exact: true })).toBeVisible()
  const stoppedAt = requests
  await page.waitForTimeout(2500)
  expect(requests).toBe(stoppedAt)
  available = true
  const connected = page.waitForResponse(response => new URL(response.url()).pathname === '/copilotkit/info' && response.status() === 200)
  await page.getByRole('button', { name: '立即重连', exact: true }).click()
  expect((await connected).status()).toBe(200)
  await expect(page.getByRole('status')).toHaveCount(0)
})

test('已有会话在发现失败时仍能发送一次，恢复后历史与消息保留', async ({ page }) => {
  const conversationId = 'conv-runtime-recovery'
  const title = '运行时恢复历史夹具'
  let available = false
  let sent = 0
  let draft = { text: '', draftEpoch: 0, revision: 0 }
  const events = [{ id: 'old-user', sequence: 1, kind: 'user_message', payload: { text: '历史查询' }, createdAt: '2026-10-21T00:00:00Z' },
    { id: 'old-agent', sequence: 2, kind: 'agent_message', payload: { text: '已有会话的历史回答' }, createdAt: '2026-10-21T00:00:01Z' }]
  const view = () => ({ id: conversationId, conversationId, title, status: 'open', events, lastSequence: events.length,
    activeBatch: null, pendingInteraction: null, queuedBatches: [], draft })
  const ok = (data: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, message: 'ok', data }) })
  await page.route('**/copilotkit/info', async route => {
    if (available) return route.continue()
    await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
  })
  await page.route(/\/api\/agent\/conversations(?:\?.*)?$/, route => route.fulfill(ok({
    items: [{ id: conversationId, title, status: 'open', lastActivityAt: '2026-10-21T00:00:00Z', activityGroup: 'today' }], nextCursor: null,
  })))
  await page.route(`**/api/agent/conversations/${conversationId}`, route => route.fulfill(ok(view())))
  await page.route(`**/api/agent/conversations/${conversationId}/events**`, route => route.fulfill(ok(view())))
  await page.route(`**/api/agent/conversations/${conversationId}/stream**`, route => route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }))
  await page.route(`**/api/agent/conversations/${conversationId}/sources`, route => route.fulfill(ok([])))
  await page.route(`**/api/agent/conversations/${conversationId}/draft`, route => {
    draft = { ...draft, text: route.request().postDataJSON().text, revision: draft.revision + 1 }
    return route.fulfill(ok(draft))
  })
  await page.route(`**/api/agent/conversations/${conversationId}/messages`, route => {
    sent += 1
    const text = route.request().postDataJSON().text
    events.push({ id: 'new-user', sequence: 3, kind: 'user_message', payload: { text }, createdAt: '2026-10-21T00:00:02Z' },
      { id: 'new-agent', sequence: 4, kind: 'agent_message', payload: { text: '中断期间的消息已接收' }, createdAt: '2026-10-21T00:00:03Z' })
    draft = { text: '', draftEpoch: 1, revision: draft.revision + 1 }
    return route.fulfill({ ...ok({ ...view(), batch: { id: 'new-batch', status: 'completed' } }), status: 201 })
  })
  await loginCoordinator(page)
  await page.goto(paths.departure)
  await page.getByRole('button', { name: '展开电子化助理', exact: true }).click()
  const pane = page.getByRole('complementary', { name: '电子化助理' })
  await pane.getByRole('button', { name: '打开会话历史' }).click()
  await page.getByRole('dialog', { name: '会话历史' }).getByRole('option', { name: title }).click()
  await expect(pane.getByText('已有会话的历史回答', { exact: true })).toBeVisible()
  await expect(pane.getByRole('status')).toBeVisible()
  await pane.getByRole('textbox', { name: '询问小团宝业务' }).fill('连接失败时的新消息')
  await pane.getByRole('button', { name: '发送', exact: true }).click()
  await expect(pane.getByText('中断期间的消息已接收', { exact: true })).toBeVisible()
  expect(sent).toBe(1)
  available = true
  const connected = page.waitForResponse(response => new URL(response.url()).pathname === '/copilotkit/info' && response.status() === 200)
  await pane.getByRole('button', { name: '立即重连', exact: true }).click()
  expect((await connected).status()).toBe(200)
  await expect(pane.getByRole('status')).toHaveCount(0)
  await expect(pane.getByText('已有会话的历史回答', { exact: true })).toBeVisible()
  await expect(pane.getByText('连接失败时的新消息', { exact: true })).toBeVisible()
  expect(sent).toBe(1)
})

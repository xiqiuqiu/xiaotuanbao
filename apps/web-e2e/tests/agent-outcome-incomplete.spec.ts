import { expect, test, type Page, type Route } from '@playwright/test'
import { createConversation, loginCoordinator } from '../support/collaboration'
import { paths } from '../support/urls'

function apiOk(data: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ code: 0, message: 'ok', data }),
  }
}

async function mockIncompleteOutcome(page: Page, conversationId: string, title: string) {
  const events = [
    {
      id: 'event-user',
      sequence: 1,
      kind: 'user_message',
      payload: { text: '把团名改成八月川西团', batchId: 'batch-incomplete' },
      createdAt: '2026-09-22T00:00:00.000Z',
    },
    {
      id: 'event-error',
      sequence: 2,
      kind: 'error',
      payload: {
        batchId: 'batch-incomplete',
        attemptId: 'attempt-incomplete',
        errorCode: 'AGENT_OUTCOME_INCOMPLETE',
      },
      createdAt: '2026-09-22T00:00:01.000Z',
    },
    {
      id: 'event-failed',
      sequence: 3,
      kind: 'batch_status',
      payload: {
        status: 'failed',
        batchId: 'batch-incomplete',
        attemptId: 'attempt-incomplete',
        errorCode: 'AGENT_OUTCOME_INCOMPLETE',
      },
      createdAt: '2026-09-22T00:00:01.000Z',
    },
  ]
  await page.route(`**/api/agent/conversations/${conversationId}`, async (route: Route) => {
    await route.fulfill(
      apiOk({
        id: conversationId,
        title,
        events,
        lastSequence: 3,
        activeBatch: null,
        draft: { text: '', draftEpoch: 0, revision: 0 },
      }),
    )
  })
  await page.route(`**/api/agent/conversations/${conversationId}/events**`, async (route: Route) => {
    await route.fulfill(apiOk({ conversationId, events, lastSequence: 3 }))
  })
  await page.route(`**/api/agent/conversations/${conversationId}/stream**`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' })
  })
  await page.route(
    `**/api/agent/conversations/${conversationId}/batches/batch-incomplete/retry`,
    async (route: Route) => route.fulfill(apiOk({ conversationId, events, lastSequence: 3 })),
  )
}

test('虚假完成失败态不显示即时承诺文本，并提供批次重试 #474', async ({ page }) => {
  const stamp = Date.now()
  const title = `e2e474 ${stamp} 虚假完成`
  await loginCoordinator(page)
  const conversationId = await createConversation(page, title, `e2e474-${stamp}`)
  await mockIncompleteOutcome(page, conversationId, title)

  await page.goto(paths.departure)
  await page.getByRole('button', { name: '展开电子化助理' }).click()
  const pane = page.getByRole('complementary', { name: '电子化助理' })
  await pane.getByRole('button', { name: '打开会话历史' }).click()
  const history = page.getByRole('dialog', { name: '会话历史' })
  await history.getByRole('searchbox', { name: '搜索会话' }).fill(String(stamp))
  await history.getByRole('option', { name: title }).click()

  await expect(
    pane.getByText('这次处理没有形成可确认的结果，请重试或换一种说法'),
  ).toBeVisible()
  await expect(pane.getByText('我将继续处理团名修改。')).toHaveCount(0)
  await expect(pane.getByRole('button', { name: '重试' })).toBeVisible()

  const retry = page.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      request.url().includes(
        `/api/agent/conversations/${conversationId}/batches/batch-incomplete/retry`,
      ),
  )
  await pane.getByRole('button', { name: '重试' }).click()
  await retry
})

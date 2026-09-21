import { expect, test, type Page, type Route } from '@playwright/test'
import {
  createConversation,
  createDeparture,
  loginCoordinator,
  mockDepartureCollaboration,
  reviewPackage,
  candidate,
} from '../support/collaboration'

function apiOk(data: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ code: 0, message: 'ok', data }),
  }
}

const failedBatchEvents = [
  {
    id: 'e-1',
    sequence: 1,
    kind: 'user_message',
    payload: { text: '请看附件' },
    createdAt: '2026-09-21T00:00:00.000Z',
  },
  {
    id: 'e-2',
    sequence: 2,
    kind: 'batch_status',
    payload: {
      status: 'waiting_for_materials',
      batchId: 'batch-fail-materials',
      readyCount: 0,
      totalCount: 1,
      failedCount: 1,
      failedMaterials: [
        {
          materialId: 'mat-failed',
          originalFilename: '报价单.pdf',
          errorMessage: '无法解析',
        },
      ],
    },
    createdAt: '2026-09-21T00:00:01.000Z',
  },
]

async function mockFailedMaterialConversation(page: Page, conversationId: string) {
  const conversation = {
    id: conversationId,
    title: '资料修复会话',
    events: failedBatchEvents,
    lastSequence: 2,
    draft: { text: '', draftEpoch: 0, revision: 0 },
  }
  await page.route(`**/api/agent/conversations/${conversationId}`, async (route: Route) => {
    await route.fulfill(apiOk(conversation))
  })
  await page.route(`**/api/agent/conversations/${conversationId}/events**`, async (route: Route) => {
    await route.fulfill(
      apiOk({
        conversationId,
        events: failedBatchEvents,
        lastSequence: 2,
      }),
    )
  })
  await page.route(`**/api/agent/conversations/${conversationId}/stream**`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body: '',
    })
  })
  await page.route(
    `**/api/agent/conversations/${conversationId}/batches/**`,
    async (route: Route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }
      await route.fulfill(
        apiOk({
          conversationId,
          events: failedBatchEvents,
          lastSequence: 2,
        }),
      )
    },
  )
}

test.describe('production shell material repair #481', () => {
  test('侧栏与协作工作区可重试、移除、放弃失败资料，聊天无审核确认入口', async ({ page }) => {
    const stamp = Date.now()
    const title = `e2e481 ${stamp} 资料修复`
    await loginCoordinator(page)
    const departureId = await createDeparture(page, 'e2e481')
    const conversationId = await createConversation(page, title, `e2e481-${stamp}`)
    await mockFailedMaterialConversation(page, conversationId)
    await mockDepartureCollaboration(page, departureId, {
      conversations: [{ id: conversationId, title }],
      items: [
        reviewPackage({
          id: 'pkg-hotel',
          payloadSchema: 'departure.segment_resource@v1',
          confirmationUnit: 'segment_resource',
          status: 'pending',
          candidates: [candidate('title', '4月2日住宿')],
          extras: { conversationId },
        }),
      ],
      confirmations: [],
    })

    await page.goto(`/departure/${departureId}`)
    const assistToggle = page.getByRole('button', { name: /电子化助理/ })
    await expect(assistToggle).toBeVisible()
    if ((await assistToggle.getAttribute('aria-label')) === '展开电子化助理') {
      await assistToggle.click()
    }
    const pane = page.getByRole('complementary', { name: '电子化助理' })
    await expect(pane).toBeVisible()
    await pane.getByRole('button', { name: '打开会话历史' }).click()
    const history = page.getByRole('dialog', { name: '会话历史' })
    await history.getByRole('searchbox', { name: '搜索会话' }).fill(String(stamp))
    await history.getByRole('option', { name: title }).click()

    await expect(pane.getByText('有 1 个资料解析失败，请重试、移除后继续或放弃本批')).toBeVisible()
    await expect(pane.getByText('报价单.pdf：无法解析')).toBeVisible()
    await expect(pane.getByRole('button', { name: '重试失败资料' })).toBeVisible()
    await expect(pane.getByRole('button', { name: '移除' })).toBeVisible()
    await expect(pane.getByRole('button', { name: '放弃本批' })).toBeVisible()
    await expect(pane.getByRole('button', { name: '确认' })).toHaveCount(0)
    await expect(pane.getByRole('button', { name: '拒绝' })).toHaveCount(0)

    const retry = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        request.url().includes(
          `/api/agent/conversations/${conversationId}/batches/batch-fail-materials/retry-failed-materials`,
        ) &&
        !request.url().includes('/ai-create-tasks/'),
    )
    await pane.getByRole('button', { name: '重试失败资料' }).click()
    await retry
    await expect(pane.getByRole('button', { name: '重试失败资料' })).toBeEnabled()

    await pane.getByRole('button', { name: '展开协作工作区', exact: true }).click()
    const workspace = page.getByRole('complementary', { name: '发团协作工作区' })
    await expect(workspace).toBeVisible()
    await expect(
      workspace.getByText('有 1 个资料解析失败，请重试、移除后继续或放弃本批'),
    ).toBeVisible()
    await expect(workspace.getByRole('button', { name: '重试失败资料' })).toBeVisible()
    const chat = workspace.getByRole('region', { name: '来源会话' })
    await expect(chat.getByRole('button', { name: '确认' })).toHaveCount(0)
    await expect(chat.getByRole('button', { name: '拒绝' })).toHaveCount(0)

    const remove = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        request.url().includes(
          `/api/agent/conversations/${conversationId}/batches/batch-fail-materials/remove-materials`,
        ),
    )
    await workspace.getByRole('button', { name: '移除' }).click()
    const removeRequest = await remove
    expect(removeRequest.postDataJSON()).toEqual({ materialIds: ['mat-failed'] })
    await expect(workspace.getByRole('button', { name: '放弃本批' })).toBeEnabled()

    const abandon = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        request.url().includes(
          `/api/agent/conversations/${conversationId}/batches/batch-fail-materials/abandon`,
        ),
    )
    await workspace.getByRole('button', { name: '放弃本批' }).click()
    await abandon
  })
})

import { expect, test } from '@playwright/test'
import { createConversation, loginCoordinator } from '../support/collaboration'
import { paths } from '../support/urls'

test('混合诉求的答复、待审核和澄清共存，刷新保留未完成事项', async ({ page }) => {
  const stamp = Date.now()
  const title = `e2e-mixed-${stamp}`
  await loginCoordinator(page)
  const conversationId = await createConversation(page, title, title)
  const batchId = 'batch-mixed'
  const prompt = '出发日期需要顺延几天？'
  const interaction = {
    interactionId: 'interaction-date', type: 'free_text', prompt, options: [],
    responseSchema: { type: 'string', minLength: 1, maxLength: 8000 },
    status: 'pending', version: 1,
  }
  const events = [
    { kind: 'user_message', payload: { batchId, text: '告诉我现在的团名，改成九月川西，日期也顺延一下。' } },
    { kind: 'agent_message', payload: {
      batchId, attemptId: 'attempt-mixed', text: '当前团名是九月成都团。',
      requestItem: { id: 'query-name', request: '查询当前团名', goal: 'answer', resolution: { kind: 'answered', message: '当前团名是九月成都团。' } },
    } },
    { kind: 'agent_message', payload: {
      batchId, attemptId: 'attempt-mixed', text: '已提交待审核建议：团名改为九月川西，请审核确认。',
      reviewPackageId: 'review-name', reviewPackageIds: ['review-name'],
      payloadSchema: 'departure.basic_info_draft@v1', confirmationUnit: 'basic_info_draft',
      requestItem: { id: 'change-name', request: '团名改为九月川西', goal: 'propose_change', resolution: { kind: 'awaiting_review', reviewPackageIndexes: [0] } },
    } },
    { kind: 'agent_message', payload: {
      batchId, attemptId: 'attempt-mixed', text: prompt, interaction,
      requestItem: { id: 'change-date', request: '顺延出发日期', goal: 'propose_change', resolution: { kind: 'awaiting_user_input', interaction: { type: 'free_text', prompt } } },
    } },
    { kind: 'batch_status', payload: { batchId, attemptId: 'attempt-mixed', status: 'awaiting_user_input' } },
  ].map((event, index) => ({ ...event, id: `mixed-event-${index + 1}`, sequence: index + 1, createdAt: '2026-09-23T00:00:00.000Z' }))
  const state = {
    id: conversationId, conversationId, title, status: 'open', events, lastSequence: events.length,
    activeBatch: { id: batchId, status: 'awaiting_user_input', conversationVersion: 1 },
    pendingInteraction: { ...interaction, id: interaction.interactionId, eventId: 'mixed-event-4', inputBatchId: batchId },
    draft: { text: '', draftEpoch: 0, revision: 0 },
  }
  for (const url of [`**/api/agent/conversations/${conversationId}`, `**/api/agent/conversations/${conversationId}/events**`]) {
    await page.route(url, (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, message: 'ok', data: state }),
    }))
  }
  await page.route(`**/api/agent/conversations/${conversationId}/stream**`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }))

  await page.goto(paths.departure)
  await page.getByRole('button', { name: '展开电子化助理' }).click()
  const pane = page.getByRole('complementary', { name: '电子化助理' })
  await pane.getByRole('button', { name: '打开会话历史' }).click()
  const history = page.getByRole('dialog', { name: '会话历史' })
  await history.getByRole('searchbox', { name: '搜索会话' }).fill(String(stamp))
  await history.getByRole('option', { name: title }).click()

  const expectMixedItems = async () => {
    await expect(pane.getByText('当前团名是九月成都团。', { exact: true })).toBeVisible()
    await expect(pane.getByRole('region', { name: '待审核内容' })).toBeVisible()
    await expect(pane.getByText('已提交待审核建议：团名改为九月川西，请审核确认。', { exact: true })).toBeVisible()
    const clarification = pane.getByRole('region', { name: `追问：${prompt}` })
    await expect(clarification.getByRole('textbox', { name: `回答追问：${prompt}` })).toBeVisible()
    await expect(clarification.getByRole('button', { name: '发送回答' })).toBeDisabled()
    await expect(pane.getByText('等待回答', { exact: true })).toBeVisible()
    await expect(pane.getByText(/^(已完成|全部完成)$/)).toHaveCount(0)
  }
  await expectMixedItems()
  await page.reload()
  await expectMixedItems()
})

import { expect, test } from '@playwright/test'
import { apiData, setupAgentConversation as startConversation } from '../support/agent-conversation'

test.skip(!process.env.WEB_E2E_CONTROL_URL, '通过 pnpm test:e2e:web:p0 启动独立 API、Worker 和数据库')

async function control(action: string, body = {}) {
  const response = await fetch(`${process.env.WEB_E2E_CONTROL_URL}/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-P0-Control-Key': process.env.WEB_E2E_CONTROL_KEY! }, body: JSON.stringify(body),
  })
  expect(response.ok, await response.text()).toBe(true)
}

let current: Awaited<ReturnType<typeof startConversation>> | undefined
async function setupAgentConversation(...args: Parameters<typeof startConversation>) {
  current = await startConversation(...args)
  return current
}
test.beforeEach(async () => { current = undefined; await control('reset') })
test.afterEach(async ({}, testInfo) => {
  await control('release')
  try { if (current) await current.save('final') }
  catch (error) { await testInfo.attach('evidence-capture-error', { body: String(error), contentType: 'text/plain' }) }
})

test('P0 真实后端：一次发送完成并持久化，刷新恢复同一会话', async ({ page }, testInfo) => {
  const run = await setupAgentConversation(page, testInfo, 'p0-answer')
  const sent = await run.send('查询当前团，不修改')
  await run.wait('查询完成', view => view.events.some(event => event.kind === 'batch_status'
    && event.payload.batchId === sent.batch.id && event.payload.status === 'completed'))
  await page.reload()
  await expect(run.pane.getByText('P0 确定性查询已完成', { exact: true })).toBeVisible()
  const restored = await run.state()
  expect(restored.id).toBe(sent.conversationId)
  expect(restored.events.filter(event => event.kind === 'user_message' && event.payload.text === '查询当前团，不修改')).toHaveLength(1)
  expect((await run.collaboration()).items).toHaveLength(0)
  await run.save('restored')
})

async function prepareReview(run: Awaited<ReturnType<typeof setupAgentConversation>>, name = 'P0核定行程') {
  const target = run.baseline.items[0]!
  const text = `将当前团已有行程段 ${target.id} 的名称改成“${name}”，其他字段保持不变，先提交审核。`
  await control('review', { departureId: run.departureId, segmentId: target.id, name, text })
  const sent = await run.send(text)
  await run.wait('审核生成', view => view.events.some(event => event.kind === 'batch_status'
    && event.payload.batchId === sent.batch.id && event.payload.status === 'awaiting_review'))
  const items = (await run.collaboration()).items
  expect(items).toHaveLength(1)
  expect((await run.segments()).items).toEqual(run.baseline.items)
  return { target, pkg: items[0]!, sent }
}

test('P0 真实后端：待审核刷新保留，确认后只修改目标且正式结果可重读', async ({ page }, testInfo) => {
  const run = await setupAgentConversation(page, testInfo, 'p0-review')
  const { target } = await prepareReview(run)
  await page.reload()
  await expect(run.pane.getByRole('button', { name: '查看审核内容', exact: true })).toHaveCount(1)
  await run.confirmSegment()
  await page.reload()
  const saved = (await run.segments()).items
  expect(saved).toHaveLength(run.baseline.items.length)
  expect(saved.find(item => item.id === target.id)?.name).toBe('P0核定行程')
  expect(saved.filter(item => item.id !== target.id)).toEqual(run.baseline.items.filter(item => item.id !== target.id))
})

for (const reload of [false, true]) test(`P0 真实后端：发送响应丢失${reload ? '并刷新' : ''}后重试复用原会话与批次`, async ({ page }, testInfo) => {
  const run = await setupAgentConversation(page, testInfo, 'p0-lost-send')
  const accepted: Array<{ conversationId: string; batch: { id: string } }> = []
  await page.route(/\/api\/agent\/conversations(?:\/[^/]+)?\/messages$/, async route => {
    const response = await route.fetch()
    accepted.push((await response.json()).data)
    if (accepted.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  const text = '接收响应丢失后的同一次查询'
  await run.pane.getByRole('textbox', { name: '询问小团宝业务' }).fill(text)
  await run.pane.getByRole('button', { name: '发送', exact: true }).click()
  await expect.poll(() => accepted.length).toBe(1)
  await expect(run.pane.getByRole('textbox', { name: '询问小团宝业务' })).toHaveValue(text)
  if (reload) { await page.reload(); await expect(run.pane.getByRole('textbox', { name: '询问小团宝业务' })).toHaveValue(text) }
  const retried = await run.send(text)
  expect(retried.conversationId).toBe(accepted[0]!.conversationId)
  expect(retried.batch.id).toBe(accepted[0]!.batch.id)
  const state = await run.state()
  expect(state.events.filter(event => event.kind === 'user_message')).toHaveLength(1)
  await run.save('after-retry')
})

for (const fault of ['double-click', 'lost-response'] as const) test(`P0 真实后端：审核确认 ${fault} 只产生一个成功结果`, async ({ page }, testInfo) => {
  const run = await setupAgentConversation(page, testInfo, `p0-${fault}`)
  const { target, pkg } = await prepareReview(run)
  const httpErrors: number[] = []
  page.on('response', response => { if (response.url().includes('/api/agent/') && response.status() >= 500) httpErrors.push(response.status()) })
  if (fault === 'lost-response') await page.route('**/api/agent/review-decisions', async route => {
    await route.fetch()
    await route.abort('failed')
  }, { times: 1 })
  if (fault === 'double-click') await run.confirmSegment(true)
  else {
    await run.pane.getByRole('button', { name: '查看审核内容', exact: true }).click()
    await page.getByRole('region', { name: '行程段修改审核' }).getByRole('button', { name: '确认修改行程段' }).click()
    await expect(page.getByRole('button', { name: '查看行程段', exact: true })).toBeVisible()
  }
  const state = await run.collaboration()
  expect(state.confirmations.flatMap(decision => decision.items).filter(item => item.packageId === pkg.id && item.status === 'succeeded')).toHaveLength(1)
  await page.reload()
  const saved = (await run.segments()).items
  expect(saved.find(item => item.id === target.id)?.name).toBe('P0核定行程')
  expect(saved).toHaveLength(run.baseline.items.length)
  expect(httpErrors).toEqual([])
  await run.save('confirmed')
})

for (const action of ['拒绝建议', '取消此项'] as const) test(`P0 真实后端：${action} 不写入，刷新保留处置且会话仍可继续`, async ({ page }, testInfo) => {
  const run = await setupAgentConversation(page, testInfo, `p0-${action}`)
  await prepareReview(run)
  await run.pane.getByRole('button', { name: '查看审核内容', exact: true }).click()
  await page.getByRole('region', { name: '行程段修改审核' }).getByRole('button', { name: action, exact: true }).click()
  await expect.poll(async () => (await run.collaboration()).items[0]?.status).toBe(action === '拒绝建议' ? 'rejected' : 'cancelled')
  await page.getByRole('complementary', { name: '发团协作工作区' }).getByRole('button', { name: '返回业务页面', exact: true }).first().click()
  await page.reload()
  expect((await run.segments()).items).toEqual(run.baseline.items)
  await control('reset')
  const sent = await run.send('处置后的独立查询，不修改')
  await run.wait('处置后继续查询', view => view.events.some(event => event.kind === 'batch_status'
    && event.payload.batchId === sent.batch.id && event.payload.status === 'completed'))
  expect((await run.collaboration()).items.filter(item => item.status === 'pending')).toHaveLength(0)
  expect((await run.segments()).items).toEqual(run.baseline.items)
})

test('P0 真实后端：人工变更后旧审核被阻止，不覆盖新事实', async ({ page }, testInfo) => {
  const run = await setupAgentConversation(page, testInfo, 'p0-stale')
  const { target, pkg } = await prepareReview(run)
  await apiData(await page.request.patch(`/api/segments/${target.id}`, { headers: run.headers, data: { name: '人工已核定的新事实' } }))
  await run.pane.getByRole('button', { name: '查看审核内容', exact: true }).click()
  const panel = page.getByRole('region', { name: '行程段修改审核' })
  await panel.getByRole('button', { name: '确认修改行程段' }).click()
  await expect(panel.getByRole('alert')).toContainText('目标记录已变化')
  expect((await run.segments()).items.find(item => item.id === target.id)?.name).toBe('人工已核定的新事实')
  expect((await run.collaboration()).items.map(item => item.id)).toContain(pkg.id)
  await run.save('stale-conflict')
})

function answer(message: string, id = 'answer', request = '测试指定的独立查询') {
  return { kind: 'resolved_items', message, items: [{ id, request, goal: 'answer',
    resolution: { kind: 'answered', message } }], reviewPackages: [], completionBasis: { kind: 'resolved_items' } }
}

for (const offline of [false, true]) test(`P0 真实后端：运行中连续输入保持 FIFO${offline ? '，离线刷新后仍完整恢复' : ''}`, async ({ page, context }, testInfo) => {
  const run = await setupAgentConversation(page, testInfo, `p0-queue-${offline}`)
  await control('outcome', { outcomes: ['第一项查询结果', '第二项查询结果', '第三项查询结果'].map(message => answer(message)) })
  await control('hold')
  const first = await run.send('第一项独立查询')
  await run.wait('第一项执行中', view => view.activeBatch?.id === first.batch.id && view.activeBatch.status === 'agent_running')
  const second = await run.send('第二项独立查询')
  const third = await run.send('第三项独立查询')
  const queued = await run.state()
  expect(queued.queuedBatches?.map(batch => batch.id)).toEqual([second.batch.id, third.batch.id])
  await expect(run.pane.getByRole('region', { name: '排队消息，共 2 条' })).toBeVisible()
  if (offline) {
    await context.setOffline(true)
    await page.waitForTimeout(1000)
    await context.setOffline(false)
  }
  await page.reload()
  await expect(run.pane.getByRole('region', { name: '排队消息，共 2 条' })).toBeVisible()
  await control('release')
  const final = await run.wait('所有输入完成', view => [first, second, third].every(sent => view.events.some(event =>
    event.kind === 'batch_status' && event.payload.batchId === sent.batch.id && event.payload.status === 'completed')))
  const completion = [first, second, third].map(sent => final.events.find(event => event.kind === 'batch_status'
    && event.payload.batchId === sent.batch.id && event.payload.status === 'completed')!.sequence)
  expect(completion[0]).toBeLessThan(completion[1]!)
  expect(completion[1]).toBeLessThan(completion[2]!)
  expect(final.events.filter(event => event.kind === 'user_message')).toHaveLength(3)
  for (const text of ['第一项查询结果', '第二项查询结果', '第三项查询结果']) await expect(run.pane.getByText(text, { exact: true })).toBeVisible()
  expect((await run.collaboration()).items).toHaveLength(0)
  await run.save('queue-completed')
})

test('P0 真实后端：澄清期间独立查询不消费原问题，显式回答后继续', async ({ page }, testInfo) => {
  const run = await setupAgentConversation(page, testInfo, 'p0-clarify')
  const prompt = '请明确需要查询哪一天？'
  await control('outcome', { outcomes: [{ kind: 'resolved_items', message: prompt, items: [{ id: 'clarify',
    request: '查询未指定日期的行程', goal: 'answer', resolution: { kind: 'awaiting_user_input', interaction: { type: 'free_text', prompt } } }],
    reviewPackages: [], completionBasis: { kind: 'resolved_items' } }, answer('独立查询已完成'), answer('原问题已按回答继续完成', 'clarify', '查询未指定日期的行程')] })
  await run.send('查询某天行程，先询问日期')
  const questioned = await run.wait('明确追问', view => Boolean(view.pendingInteraction))
  const id = questioned.pendingInteraction!.id
  const independent = await run.send('独立查询，不回答日期追问')
  const answered = await run.wait('独立查询完成', view => view.events.some(event => event.kind === 'batch_status'
    && event.payload.batchId === independent.batch.id && event.payload.status === 'completed'))
  expect(answered.pendingInteraction?.id).toBe(id)
  const region = run.pane.getByRole('region', { name: `追问：${prompt}` })
  await region.getByRole('textbox', { name: `回答追问：${prompt}` }).fill('查询第一天')
  const replied = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/agent/conversations/${questioned.id}/messages`)
  await region.getByRole('button', { name: '发送回答', exact: true }).click()
  await apiData(await replied)
  await run.wait('原问题完成', view => !view.pendingInteraction && view.events.some(event => event.kind === 'agent_message'
    && event.payload.text === '原问题已按回答继续完成'))
  await expect(run.pane.getByText('独立查询已完成', { exact: true })).toBeVisible()
  expect((await run.segments()).items).toEqual(run.baseline.items)
})

for (const service of ['api', 'worker']) test(`P0 真实后端：${service} 重启后待审核不丢失，确认仍只写一次`, async ({ page }, testInfo) => {
  const run = await setupAgentConversation(page, testInfo, `p0-restart-${service}`)
  const { target, pkg } = await prepareReview(run)
  await control(`restart-${service}`)
  await page.reload()
  await expect(run.pane.getByRole('button', { name: '查看审核内容', exact: true })).toHaveCount(1)
  expect((await run.collaboration()).items.map(item => item.id)).toEqual([pkg.id])
  await run.confirmSegment()
  expect((await run.segments()).items.find(item => item.id === target.id)?.name).toBe('P0核定行程')
  expect((await run.collaboration()).confirmations.flatMap(decision => decision.items)
    .filter(item => item.packageId === pkg.id && item.status === 'succeeded')).toHaveLength(1)
})

test('P0 真实后端：两个标签页并发确认，同一审核只写入一次', async ({ page, context }, testInfo) => {
  const run = await setupAgentConversation(page, testInfo, 'p0-two-tabs')
  const { target, pkg } = await prepareReview(run)
  const title = (await run.state()).title!
  const other = await context.newPage()
  try {
    await other.goto(page.url())
    const pane = other.getByRole('complementary', { name: '电子化助理' })
    const expand = other.getByRole('button', { name: '展开电子化助理', exact: true })
    await expect.poll(async () => await pane.isVisible() || await expand.isVisible()).toBe(true)
    if (!(await pane.isVisible())) await expand.click()
    await pane.getByRole('button', { name: '打开会话历史' }).click()
    await other.getByRole('dialog', { name: '会话历史' }).getByRole('option', { name: title }).click()
    await run.pane.getByRole('button', { name: '查看审核内容', exact: true }).click()
    await pane.getByRole('button', { name: '查看审核内容', exact: true }).click()
    let arrivals = 0
    let release!: () => void
    const barrier = new Promise<void>(resolve => { release = resolve })
    const errors: number[] = []
    for (const tab of [page, other]) {
      tab.on('response', response => { if (response.url().includes('/api/agent/') && response.status() >= 500) errors.push(response.status()) })
      await tab.route('**/api/agent/review-decisions', async route => {
        arrivals += 1
        if (arrivals === 2) release()
        await barrier
        await route.continue()
      })
    }
    await Promise.all([page, other].map(tab => tab.getByRole('region', { name: '行程段修改审核' })
      .getByRole('button', { name: '确认修改行程段' }).click()))
    await expect.poll(async () => (await run.collaboration()).confirmations.flatMap(decision => decision.items)
      .filter(item => item.packageId === pkg.id && item.status === 'succeeded').length).toBe(1)
    expect((await run.segments()).items.find(item => item.id === target.id)?.name).toBe('P0核定行程')
    expect((await run.segments()).items).toHaveLength(run.baseline.items.length)
    expect(errors).toEqual([])
    await page.reload()
    await expect(page.getByRole('button', { name: '查看行程段', exact: true })).toBeVisible()
    await run.save('two-tabs-confirmed')
  } finally { await other.close() }
})

test('P0 真实后端：执行中 Worker 重启后接管原批次，结果不重复交付', async ({ page }, testInfo) => {
  const run = await setupAgentConversation(page, testInfo, 'p0-running-restart')
  await control('outcome', { outcomes: [answer('接管后只交付一次的结果')] })
  await control('hold')
  const sent = await run.send('等待执行结束的独立查询')
  const first = await run.wait('旧 Worker 已运行', view => view.events.some(event => event.kind === 'batch_status'
    && event.payload.batchId === sent.batch.id && event.payload.status === 'agent_running'))
  const firstAttempt = first.events.find(event => event.kind === 'batch_status' && event.payload.status === 'agent_running')!.payload.attemptId
  await control('restart-worker')
  await control('release')
  await page.reload()
  const final = await run.wait('新 Worker 接管后完成原批次', view => view.events.some(event => event.kind === 'batch_status'
    && event.payload.batchId === sent.batch.id && event.payload.status === 'completed'))
  const attempts = final.events.filter(event => event.kind === 'batch_status' && event.payload.status === 'agent_running')
  expect(attempts.length).toBeGreaterThanOrEqual(2)
  expect(attempts.at(-1)!.payload.attemptId).not.toBe(firstAttempt)
  expect(final.events.filter(event => event.kind === 'user_message')).toHaveLength(1)
  expect(final.events.filter(event => event.kind === 'agent_message' && event.payload.text === '接管后只交付一次的结果')).toHaveLength(1)
  await expect(run.pane.getByText('接管后只交付一次的结果', { exact: true })).toBeVisible()
  expect((await run.collaboration()).items).toHaveLength(0)
})

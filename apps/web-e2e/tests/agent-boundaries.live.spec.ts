import { writeFile } from 'node:fs/promises'
import { expect, test, type APIResponse, type Page, type TestInfo } from '@playwright/test'
import type {
  AiConversationView,
  DepartureCollaborationView,
  ItinerarySegmentSummary,
  SendAiConversationMessageResult,
} from '../../../packages/shared/src/types/api.types'
import { createDeparture, loginCoordinator } from '../support/collaboration'

test.skip(process.env.WEB_E2E_LIVE_AI !== 'true', '设置 WEB_E2E_LIVE_AI=true 后连接本地真实 AI')
test.setTimeout(420_000)
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 })

async function apiData<T>(response: APIResponse): Promise<T> {
  expect(response.ok(), `${response.url()}: ${response.status()} ${await response.text()}`).toBe(true)
  return (await response.json()).data as T
}

async function setup(page: Page, testInfo: TestInfo, suffix: string) {
  await loginCoordinator(page)
  const departureId = await createDeparture(page, `e2e-live-boundary-${suffix}`)
  const headers = { Origin: new URL(page.url()).origin }
  const segments = () => page.request.get(`/api/departures/${departureId}/segments`)
    .then(apiData<{ items: ItinerarySegmentSummary[] }>)
  const baseline = await segments()
  expect(baseline.items.length).toBeGreaterThan(1)
  const errors: unknown[] = []
  page.on('pageerror', (error) => errors.push({ kind: 'pageerror', message: error.message }))
  page.on('response', (response) => {
    if (response.url().includes('/api/agent/') && response.status() >= 400) {
      errors.push({ kind: 'http', url: response.url(), status: response.status() })
    }
  })
  let conversationId: string | undefined
  const pane = page.getByRole('complementary', { name: '电子化助理' })
  const state = () => {
    expect(conversationId).toBeTruthy()
    return page.request.get(`/api/agent/conversations/${conversationId}`).then(apiData<AiConversationView>)
  }
  const collaboration = () => page.request.get(`/api/agent/departures/${departureId}/collaboration`, {
    params: conversationId ? { conversationId } : {},
  }).then(apiData<DepartureCollaborationView>)
  const save = async (step: string) => {
    const facts = {
      departureId, conversationId, errors,
      conversation: conversationId ? await state() : null,
      collaboration: await collaboration(), segments: await segments(),
    }
    await writeFile(testInfo.outputPath(`${step}.json`), JSON.stringify(facts, null, 2))
    await page.screenshot({ path: testInfo.outputPath(`${step}.png`), fullPage: true, timeout: 10_000 })
    console.log(`[${suffix}] ${step}: ${departureId} ${conversationId ?? ''}`)
    return facts
  }
  const send = async (text: string) => {
    const response = page.waitForResponse((item) => item.request().method() === 'POST'
      && /\/api\/agent\/conversations(?:\/[^/]+)?\/messages$/.test(new URL(item.url()).pathname))
    await pane.getByRole('textbox', { name: '询问小团宝业务' }).fill(text)
    await pane.getByRole('button', { name: '发送', exact: true }).click()
    const sent = await apiData<SendAiConversationMessageResult>(await response)
    conversationId = sent.conversationId
    return sent
  }
  const wait = async (label: string, predicate: (view: AiConversationView) => boolean) => {
    const deadline = Date.now() + 180_000
    while (Date.now() < deadline) {
      const latest = await state()
      const failed = latest.events.filter((event) => event.kind === 'batch_status' && event.payload.status === 'failed')
      expect(failed, `${label}: ${JSON.stringify(failed)}`).toEqual([])
      if (predicate(latest)) return latest
      const latestStatus = latest.events.filter(event => event.kind === 'batch_status').at(-1)?.payload.status
      expect(latestStatus, `${label}: ${latest.pendingInteraction?.prompt ?? ''}`).not.toBe('awaiting_user_input')
      await page.waitForTimeout(1000)
    }
    throw new Error(`${label}: 180秒内未到达预期状态`)
  }
  const confirmSegment = async () => {
    await pane.getByRole('button', { name: '查看审核内容', exact: true }).last().click()
    const workspace = page.getByRole('complementary', { name: '发团协作工作区' })
    const panel = workspace.getByRole('region', { name: '行程段修改审核' })
    await expect(panel).toBeVisible()
    await save('before-confirm')
    await panel.getByRole('button', { name: '确认修改行程段' }).click()
    await expect(workspace.getByRole('button', { name: '查看行程段', exact: true })).toBeVisible({ timeout: 60_000 })
    await expect.poll(async () => (await state()).events.filter(event => event.kind === 'batch_status').at(-1)?.payload.status,
      { message: '审核写入后，本批次也应退出待审核状态', timeout: 15_000 }).toBe('completed')
    await save('after-confirm')
    await workspace.getByRole('button', { name: '返回业务页面', exact: true }).first().click()
  }
  await page.goto(`/departure/${departureId}?tab=execution`)
  await page.getByRole('button', { name: '展开电子化助理' }).click()
  await pane.getByRole('button', { name: '打开会话历史' }).click()
  await page.getByRole('dialog', { name: '会话历史' }).getByRole('button', { name: '新建会话' }).click()
  const attach = pane.getByRole('button', { name: '获取当前页面' })
  if (await attach.isVisible()) await attach.click()
  await expect(pane.getByTestId('current-page-chip')).toBeVisible()
  console.log(`测试团：http://localhost:5173/departure/${departureId}`)
  return { departureId, headers, baseline, pane, state, segments, collaboration, save, send, wait, confirmSegment }
}

test('真实 AI：操作咨询交付具体步骤正文，不能用进度回执假完成', async ({ page }, testInfo) => {
  const live = await setup(page, testInfo, 'answer')
  try {
    const sent = await live.send('用三句具体步骤解释旅行社计调从建团到提交应收应付的业务操作，仅讨论，不创建或修改记录。')
    const final = await live.wait('操作咨询得到完整回答', view => view.events.some(event => event.kind === 'batch_status'
      && event.payload.batchId === sent.batch.id && event.payload.status === 'completed'))
    const answer = final.events.filter(event => event.kind === 'agent_message' && event.payload.batchId === sent.batch.id)
      .map(event => String(event.payload.text)).join('\n')
    expect(answer).toMatch(/建团|创建发团/)
    for (const word of ['客源', '资源', '应收', '应付']) expect(answer).toContain(word)
    expect(answer.split(/[。！？\n]+/).filter(part => part.trim()).length).toBeGreaterThanOrEqual(3)
    expect((await live.collaboration()).items).toHaveLength(0)
    expect((await live.segments()).items).toEqual(live.baseline.items)
  } finally { await live.save('final') }
})

test('真实 AI：运行时独立输入按 FIFO 完成，审核前不写入，确认后可重读', async ({ page }, testInfo) => {
  const live = await setup(page, testInfo, 'queue')
  const target = live.baseline.items[0]!
  try {
    const first = await live.send('请读取当前团的最新正式信息，列出团名、起止日期、全部已有行程段的名称和目的地；仅查询，不做修改。')
    await live.wait('第一个批次开始真实执行', (view) => view.events.some((event) => event.kind === 'batch_status'
      && event.payload.batchId === first.batch.id && event.payload.status === 'agent_running'))
    const second = await live.send(`另一个独立指令：只把当前团已有行程段“${target.name}”（ID ${target.id}）名称改成“边界排队核定行程”。保留其他字段、日期及全部其他行程，只生成修改审核稿，不新增、不直接写入。`)
    await live.save('01-queued')
    expect(second.batch.conversationVersion).toBeGreaterThan(first.batch.conversationVersion)
    const final = await live.wait('两条独立输入均完成其目标', (view) => view.events.some((event) => event.kind === 'batch_status'
      && event.payload.batchId === first.batch.id && event.payload.status === 'completed')
      && view.events.some((event) => event.kind === 'batch_status'
        && event.payload.batchId === second.batch.id && event.payload.status === 'awaiting_review'))
    const firstDone = final.events.find((event) => event.kind === 'batch_status' && event.payload.batchId === first.batch.id && event.payload.status === 'completed')!
    const secondStarted = final.events.find((event) => event.kind === 'batch_status' && event.payload.batchId === second.batch.id && event.payload.status === 'agent_running')!
    expect(secondStarted.sequence).toBeGreaterThan(firstDone.sequence)
    expect((await live.segments()).items).toEqual(live.baseline.items)
    await live.save('02-both-completed')
    await live.confirmSegment()
    const formal = await live.segments()
    expect(formal.items).toHaveLength(live.baseline.items.length)
    expect(formal.items.find((item) => item.id === target.id)?.name).toBe('边界排队核定行程')
    const query = await live.send('请重新读取当前团的正式行程段信息，告诉我刚才修改后的名称；不要引用历史建议，也不要修改。')
    await live.wait('确认后真实模型重新查询正式名称', (view) => view.events.some((event) => event.kind === 'agent_message'
      && event.payload.batchId === query.batch.id && String(event.payload.text).includes('边界排队核定行程')))
    await live.save('03-formal-reread')
  } finally { await live.save('final') }
})

test('真实 AI：同名目标先澄清，独立查询不冒充回答，显式回复后完成原修改', async ({ page }, testInfo) => {
  const live = await setup(page, testInfo, 'clarification')
  const [target, sibling] = live.baseline.items
  try {
    for (const [segment, destination] of [[target!, '拉萨'], [sibling!, '日喀则']] as const) {
      await apiData(await page.request.patch(`/api/segments/${segment.id}`, {
        headers: live.headers, data: { name: '同名游览', destination },
      }))
    }
    const before = await live.segments()
    await live.send('请将当前团已有的“同名游览”行程段备注改成“边界澄清已核实”。有重名时请先通过自由文本追问我具体是哪一段，不擅自选择、不新增、不直接写入。')
    const questioned = await live.wait('同名目标产生明确追问', (view) => Boolean(view.pendingInteraction))
    const interaction = questioned.pendingInteraction!
    await live.save('01-awaiting-clarification')
    const independent = await live.send('这是独立查询：请只读取并回答当前团的团名、出发日期；不要替我选择同名行程，不处置刚才的追问，不修改数据。')
    const answered = await live.wait('待追问时独立查询照常完成', (view) => view.events.some((event) => event.kind === 'batch_status'
      && event.payload.batchId === independent.batch.id && event.payload.status === 'completed'))
    expect(answered.pendingInteraction?.id).toBe(interaction.id)
    expect((await live.segments()).items).toEqual(before.items)
    await live.save('02-independent-answer')
    const question = live.pane.getByRole('region', { name: `追问：${interaction.prompt}` })
    await expect(question).toBeVisible()
    if (interaction.options.length) {
      const option = interaction.options.find((item) => item.label.includes('拉萨') || item.label.includes(target!.id))
      expect(option, '选择题应能明确区分拉萨行程').toBeTruthy()
      await question.getByRole('radio', { name: option!.label, exact: true }).check()
    } else {
      await question.getByRole('textbox', { name: `回答追问：${interaction.prompt}` }).fill(`选择目的地为拉萨、ID 为 ${target!.id} 的行程段。备注改为“边界澄清已核实”，另一段日喀则行程保持不变，只生成审核稿。`)
    }
    const replyResponse = page.waitForResponse(response => response.request().method() === 'POST'
      && new URL(response.url()).pathname === `/api/agent/conversations/${questioned.id}/messages`)
    await question.getByRole('button', { name: '发送回答', exact: true }).click()
    await apiData<SendAiConversationMessageResult>(await replyResponse)
    await live.wait('显式回答后原请求继续生成审核', (view) => !view.pendingInteraction
      && view.events.some((event) => event.kind === 'agent_message' && event.payload.confirmationUnit === 'itinerary_segment_update'))
    const packages = (await live.collaboration()).items
    expect(packages).toHaveLength(1)
    expect(packages[0]!.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldKey: 'itinerarySegmentId', proposedValue: target!.id }),
      expect.objectContaining({ fieldKey: 'notes', proposedValue: '边界澄清已核实' }),
    ]))
    expect((await live.segments()).items).toEqual(before.items)
    await live.save('03-original-goal-reviewed')
    await live.confirmSegment()
    const saved = (await live.segments()).items
    expect(saved.find((item) => item.id === target!.id)?.notes).toBe('边界澄清已核实')
    expect(saved.find((item) => item.id === sibling!.id)).toEqual(before.items.find((item) => item.id === sibling!.id))
  } finally { await live.save('final') }
})

test('真实 AI：运行中短暂离线和刷新后恢复，审核及正式写入不重复', async ({ page, context }, testInfo) => {
  const live = await setup(page, testInfo, 'reconnect')
  const target = live.baseline.items[0]!
  try {
    const sent = await live.send(`请只修改当前团已有行程段“${target.name}”（ID ${target.id}），名称改为“边界重连核定行程”。保留所有未提及字段和其他行程，先生成审核稿，不新增、不直接写入。`)
    await live.wait('真实模型运行后断开浏览器网络', (view) => view.events.some((event) => event.kind === 'batch_status'
      && event.payload.batchId === sent.batch.id && event.payload.status === 'agent_running'))
    await live.save('01-before-offline')
    await context.setOffline(true)
    await page.waitForTimeout(1500)
    await page.screenshot({ path: testInfo.outputPath('02-offline.png'), fullPage: true })
    await context.setOffline(false)
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 })
    const expand = page.getByRole('button', { name: '展开电子化助理', exact: true })
    await expect.poll(async () => await live.pane.isVisible() || await expand.isVisible()).toBe(true)
    if (!(await live.pane.isVisible())) await expand.click()
    await expect(live.pane).toBeVisible()
    await live.wait('重连后同批次生成且恢复审核', (view) => view.events.some((event) => event.kind === 'batch_status'
      && event.payload.batchId === sent.batch.id && event.payload.status === 'awaiting_review'))
    await expect(live.pane.getByRole('button', { name: '查看审核内容', exact: true })).toHaveCount(1)
    expect((await live.collaboration()).items).toHaveLength(1)
    expect((await live.segments()).items).toEqual(live.baseline.items)
    await live.save('03-restored-review')
    await live.confirmSegment()
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 })
    const formal = await live.segments()
    expect(formal.items).toHaveLength(live.baseline.items.length)
    expect(formal.items.filter((item) => item.name === '边界重连核定行程')).toHaveLength(1)
    expect(formal.items.find((item) => item.id === target.id)?.name).toBe('边界重连核定行程')
    await live.save('04-formal-after-reload')
  } finally {
    await context.setOffline(false)
    await live.save('final')
  }
})

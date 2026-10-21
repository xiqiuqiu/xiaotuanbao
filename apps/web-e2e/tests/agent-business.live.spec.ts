import { expect, test } from '@playwright/test'
import { apiData, setupAgentConversation } from '../support/agent-conversation'

test.skip(process.env.WEB_E2E_LIVE_AI !== 'true', '设置 WEB_E2E_LIVE_AI=true 后连接真实 AI')
test.setTimeout(420_000)
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 })

test('真实 AI：否定修改只查询，不生成审核或改变正式数据', async ({ page }, testInfo) => {
  const run = await setupAgentConversation(page, testInfo, 'negation')
  const before = await apiData<{ name: string }>(await page.request.get(`/api/departures/${run.departureId}`))
  try {
    const sent = await run.send('不要把团名改成“禁止写入的名字”，也不要生成修改审核。仅查询并回答当前正式团名和出发日期。')
    const final = await run.wait('否定修改的查询完成', view => view.events.some(event => event.kind === 'batch_status'
      && event.payload.batchId === sent.batch.id && event.payload.status === 'completed'))
    const answer = final.events.filter(event => event.kind === 'agent_message' && event.payload.batchId === sent.batch.id)
      .map(event => String(event.payload.text)).join('\n')
    expect(answer).toContain(before.name)
    expect(answer).toMatch(/2026\s*[-年/.]\s*12\s*[-月/.]\s*15/)
    expect((await run.collaboration()).items).toHaveLength(0)
    expect((await run.segments()).items).toEqual(run.baseline.items)
    expect(await apiData(await page.request.get(`/api/departures/${run.departureId}`))).toEqual(before)
  } finally { await run.save('final') }
})

test('真实 AI：混合查询与修改均交付，审核前无写入', async ({ page }, testInfo) => {
  const run = await setupAgentConversation(page, testInfo, 'mixed')
  const target = run.baseline.items[0]!
  try {
    const sent = await run.send(`请同时完成两个独立事项：①读取并直接回答当前团出发日期；②将当前团已有行程段“${target.name}”（ID ${target.id}）备注改为“混合事项核定备注”，仅提交该项审核。保留其他字段、其他行程和所有已有记录。查询答案和审核都要交付，不直接写入。`)
    const view = await run.wait('查询与审核同时交付', view => view.events.some(event => event.kind === 'batch_status'
      && event.payload.batchId === sent.batch.id && event.payload.status === 'awaiting_review'))
    const answer = view.events.filter(event => event.kind === 'agent_message' && event.payload.batchId === sent.batch.id)
      .map(event => String(event.payload.text)).join('\n')
    expect(answer).toMatch(/2026\s*[-年/.]\s*12\s*[-月/.]\s*15/)
    const items = (await run.collaboration()).items
    expect(items).toHaveLength(1)
    expect(items[0]!.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldKey: 'itinerarySegmentId', proposedValue: target.id }),
      expect.objectContaining({ fieldKey: 'notes', proposedValue: '混合事项核定备注' }),
    ]))
    expect((await run.segments()).items).toEqual(run.baseline.items)
    await run.confirmSegment()
    const saved = (await run.segments()).items
    expect(saved.find(item => item.id === target.id)?.notes).toBe('混合事项核定备注')
    expect(saved.filter(item => item.id !== target.id)).toEqual(run.baseline.items.filter(item => item.id !== target.id))
  } finally { await run.save('final') }
})

test('真实 AI：人工更新后重新读正式事实，不沿用历史回答', async ({ page }, testInfo) => {
  const run = await setupAgentConversation(page, testInfo, 'fresh-facts')
  const target = run.baseline.items[0]!
  const answerFor = (view: Awaited<ReturnType<typeof run.state>>, batchId: string) => view.events
    .filter(event => event.kind === 'agent_message' && event.payload.batchId === batchId).map(event => String(event.payload.text)).join('\n')
  try {
    const first = await run.send(`仅查询并直接回答 ID ${target.id} 的正式行程段名称，不修改。`)
    const before = await run.wait('第一次查询完成', view => view.events.some(event => event.kind === 'batch_status'
      && event.payload.batchId === first.batch.id && event.payload.status === 'completed'))
    expect(answerFor(before, first.batch.id)).toContain(target.name)
    await apiData(await page.request.patch(`/api/segments/${target.id}`, { headers: run.headers, data: { name: '人工更新后的最新正式名称' } }))
    const second = await run.send(`请重新读取 ID ${target.id} 最新正式行程段，只回答当前名称，不引用上一条查询的历史结果，也不修改。`)
    const after = await run.wait('更新后查询完成', view => view.events.some(event => event.kind === 'batch_status'
      && event.payload.batchId === second.batch.id && event.payload.status === 'completed'))
    expect(answerFor(after, second.batch.id)).toContain('人工更新后的最新正式名称')
    expect((await run.collaboration()).items).toHaveLength(0)
    const saved = (await run.segments()).items
    expect(saved.find(item => item.id === target.id)?.name).toBe('人工更新后的最新正式名称')
    expect(saved.filter(item => item.id !== target.id)).toEqual(run.baseline.items.filter(item => item.id !== target.id))
  } finally { await run.save('final') }
})

test('真实 AI：拒绝修改后不写入，后续查询不把被拒建议当事实', async ({ page }, testInfo) => {
  const run = await setupAgentConversation(page, testInfo, 'reject')
  const target = run.baseline.items[0]!
  try {
    const sent = await run.send(`只将当前团已有行程段 ID ${target.id} 的名称改为“被拒绝的名称”，其余不变，先提交审核，不直接写入。`)
    await run.wait('修改审核生成', view => view.events.some(event => event.kind === 'batch_status'
      && event.payload.batchId === sent.batch.id && event.payload.status === 'awaiting_review'))
    expect((await run.segments()).items).toEqual(run.baseline.items)
    await run.pane.getByRole('button', { name: '查看审核内容', exact: true }).click()
    const workspace = page.getByRole('complementary', { name: '发团协作工作区' })
    await workspace.getByRole('button', { name: '拒绝建议', exact: true }).click()
    await expect.poll(async () => (await run.collaboration()).items[0]?.status).toBe('rejected')
    await workspace.getByRole('button', { name: '返回业务页面', exact: true }).first().click()
    const query = await run.send(`仅重新查询 ID ${target.id} 的正式名称，不把被拒绝的建议当成已确认事实，不修改。`)
    const final = await run.wait('拒绝后的查询完成', view => view.events.some(event => event.kind === 'batch_status'
      && event.payload.batchId === query.batch.id && event.payload.status === 'completed'))
    const answer = final.events.filter(event => event.kind === 'agent_message' && event.payload.batchId === query.batch.id)
      .map(event => String(event.payload.text)).join('\n')
    expect(answer).toContain(target.name)
    expect((await run.segments()).items).toEqual(run.baseline.items)
    expect((await run.collaboration()).items.filter(item => item.status === 'pending')).toHaveLength(0)
  } finally { await run.save('final') }
})

test('真实 AI：切换新会话后不串入旧会话待审核建议', async ({ page }, testInfo) => {
  const run = await setupAgentConversation(page, testInfo, 'isolation')
  const target = run.baseline.items[0]!
  try {
    const first = await run.send(`只把已有行程段 ID ${target.id} 名称改成“会话甲专属未确认名称”，仅提交审核，不写入。`)
    await run.wait('会话甲保留审核', view => view.events.some(event => event.kind === 'batch_status'
      && event.payload.batchId === first.batch.id && event.payload.status === 'awaiting_review'))
    const firstPackages = (await run.collaboration()).items
    expect(firstPackages).toHaveLength(1)
    await run.pane.getByRole('button', { name: '新建会话', exact: true }).click()
    const attach = run.pane.getByRole('button', { name: '获取当前页面', exact: true })
    if (await attach.isVisible()) await attach.click()
    const second = await run.send(`只读取当前团 ID ${target.id} 的正式行程段名称，不根据其他会话待审核建议推断，不修改、不生成审核。`)
    expect(second.conversationId).not.toBe(first.conversationId)
    const final = await run.wait('会话乙独立查询完成', view => view.events.some(event => event.kind === 'batch_status'
      && event.payload.batchId === second.batch.id && event.payload.status === 'completed'))
    expect(final.events.filter(event => event.kind === 'user_message')).toHaveLength(1)
    const answer = final.events.filter(event => event.kind === 'agent_message' && event.payload.batchId === second.batch.id)
      .map(event => String(event.payload.text)).join('\n')
    expect(answer).toContain(target.name)
    expect((await run.collaboration()).items).toHaveLength(0)
    const old = await apiData<{ items: Array<{ id: string }> }>(await page.request.get(`/api/agent/departures/${run.departureId}/collaboration`, { params: { conversationId: first.conversationId } }))
    expect(old.items.map(item => item.id)).toEqual(firstPackages.map(item => item.id))
    expect((await run.segments()).items).toEqual(run.baseline.items)
  } finally { await run.save('final') }
})

test('真实 AI：变更值缺失时先澄清，显式回答后生成并确认审核', async ({ page }, testInfo) => {
  const run = await setupAgentConversation(page, testInfo, 'missing-value')
  const target = run.baseline.items[0]!
  try {
    await run.send(`我要改当前团已有行程段 ID ${target.id} 的名称，但还没告诉你新名称。请先用自由文本追问我要改成什么，不替我拟名、不新增、不写入。`)
    const view = await run.wait('缺失值产生追问', view => Boolean(view.pendingInteraction))
    expect((await run.collaboration()).items.filter(item => item.status === 'pending')).toHaveLength(0)
    expect((await run.segments()).items).toEqual(run.baseline.items)
    const prompt = view.pendingInteraction!.prompt
    const question = run.pane.getByRole('region', { name: `追问：${prompt}` })
    await question.getByRole('textbox', { name: `回答追问：${prompt}` }).fill(`新名称为“澄清后核定的新名称”，只修改 ID ${target.id}，其余保持不变，先审核。`)
    const replied = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/agent/conversations/${view.id}/messages`)
    await question.getByRole('button', { name: '发送回答', exact: true }).click()
    await apiData(await replied)
    await run.wait('回答后生成审核', view => !view.pendingInteraction && view.events.some(event => event.kind === 'agent_message'
      && event.payload.confirmationUnit === 'itinerary_segment_update'))
    const items = (await run.collaboration()).items.filter(item => item.status === 'pending')
    expect(items).toHaveLength(1)
    expect(items[0]!.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldKey: 'name', proposedValue: '澄清后核定的新名称' }),
    ]))
    expect((await run.segments()).items).toEqual(run.baseline.items)
    await run.confirmSegment()
    expect((await run.segments()).items.find(item => item.id === target.id)?.name).toBe('澄清后核定的新名称')
  } finally { await run.save('final') }
})

test('真实 AI：用户修正审核值后提交，写入修正值并保留其他记录', async ({ page }, testInfo) => {
  const run = await setupAgentConversation(page, testInfo, 'human-correction')
  const target = run.baseline.items[0]!
  try {
    const sent = await run.send(`只将当前团已有行程段 ID ${target.id} 的名称改成“杭州西湖首日游”，其他字段保持不变，仅提交审核。`)
    await run.wait('待用户核对', view => view.events.some(event => event.kind === 'batch_status'
      && event.payload.batchId === sent.batch.id && event.payload.status === 'awaiting_review'))
    expect((await run.segments()).items).toEqual(run.baseline.items)
    await run.pane.getByRole('button', { name: '查看审核内容', exact: true }).click()
    const panel = page.getByRole('region', { name: '行程段修改审核' })
    await panel.getByRole('textbox', { name: '名称建议', exact: true }).fill('杭州西湖首日游含游船')
    await panel.getByRole('button', { name: '确认修改行程段', exact: true }).click()
    await expect(page.getByRole('button', { name: '查看行程段', exact: true })).toBeVisible({ timeout: 60_000 })
    await page.reload()
    const saved = (await run.segments()).items
    expect(saved.find(item => item.id === target.id)?.name).toBe('杭州西湖首日游含游船')
    expect(saved.filter(item => item.id !== target.id)).toEqual(run.baseline.items.filter(item => item.id !== target.id))
  } finally { await run.save('final') }
})

test('真实 AI：建团、客源资源、初始应收应付审核与重读完整闭环', async ({ page }, testInfo) => {
  test.setTimeout(600_000)
  const run = await setupAgentConversation(page, testInfo, 'business-loop')
  const name = `e2e-live-full-${Date.now()}`
  try {
    await run.send(`这是一个独立建团任务，与当前页面的团无关。请新建拼团：团名“${name}”，路线名称“全流程验收杭州三日线”，2026年12月20日出团，12月22日结束，负责人当前王姐，备注“仅本地完整业务验收”。先提交基础信息审核，不直接创建。`)
    await run.wait('新建团基础信息待审核', view => view.events.some(event => event.kind === 'agent_message'
      && event.payload.confirmationUnit === 'basic_info_draft'))
    await run.pane.getByRole('button', { name: '查看审核内容', exact: true }).last().click()
    await expect(page.getByRole('heading', { name: '新建发团', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '确认写入草稿', exact: true }).click()
    await expect(page.getByRole('textbox', { name: '* 团名', exact: true })).toHaveValue(name)
    const created = page.waitForResponse(response => response.request().method() === 'POST'
      && /\/api\/ai-create-tasks\/[^/]+\/confirm$/.test(new URL(response.url()).pathname))
    await page.getByRole('button', { name: '创建发团', exact: true }).click()
    const departure = await apiData<{ id: string }>(await created)
    run.setDepartureId(departure.id)
    await expect(page).toHaveURL(new RegExp(`/departure/${departure.id}`))
    await expect(run.pane).toBeVisible()
    await expect(run.pane.getByTestId('current-page-chip')).toBeVisible()
    await run.save('01-departure-created')
    const confirmPackage = async (unit: string, label: string) => {
      const pkg = (await run.collaboration()).items.find(item => item.confirmationUnit === unit && item.status === 'pending')
      expect(pkg, `应有 ${unit} 待审核`).toBeTruthy()
      const events = (await run.state()).events.filter(event => event.kind === 'agent_message' && typeof event.payload.reviewPackageId === 'string')
      const index = events.findIndex(event => event.payload.reviewPackageId === pkg!.id)
      expect(index).toBeGreaterThanOrEqual(0)
      await run.pane.getByRole('button', { name: '查看审核内容', exact: true }).nth(index).click()
      const workspace = page.getByRole('complementary', { name: '发团协作工作区' })
      await workspace.getByRole('button', { name: label, exact: true }).click()
      await expect.poll(async () => (await run.collaboration()).confirmations.flatMap(decision => decision.items)
        .find(item => item.packageId === pkg!.id)?.status, { timeout: 60_000 }).toBe('succeeded')
      await workspace.getByRole('button', { name: '返回业务页面', exact: true }).first().click()
    }
    const rows = async (path: string) => apiData<{ items: Array<{ id: string; amountCents: number; settledAmountCents: number }> }>(await page.request.get(`/api/departures/${departure.id}/${path}`))
    const business = await run.send('为当前刚创建的团分别准备两个独立待审核事项：①客源单客户“华东国旅（上海）”，成人1人、成人单价1200元、儿童0人，无调整无优惠、客户全部结算，虚构客人“闭环验收甲”；②发团级酒店资源，供应商“西湖国宾馆”，资源名“闭环全程住宿”，约定总价400元，备注“仅本地验收，覆盖全程”。保留已有记录，先准备审核，不直接创建，不准备应收应付。')
    await run.wait('客源和资源均待审核', view => view.events.some(event => event.kind === 'batch_status'
      && event.payload.batchId === business.batch.id && event.payload.status === 'awaiting_review'))
    expect((await run.collaboration()).items.filter(item => item.status === 'pending').map(item => item.confirmationUnit).sort())
      .toEqual(['departure_resource', 'source_order_create'])
    expect((await rows('source-orders')).items).toHaveLength(0)
    expect((await rows('resources')).items).toHaveLength(0)
    await confirmPackage('source_order_create', '确认写入客源单')
    await confirmPackage('departure_resource', '确认写入资源')
    expect((await rows('source-orders')).items).toHaveLength(1)
    expect((await rows('resources')).items).toHaveLength(1)
    expect((await rows('receivables')).items).toHaveLength(0)
    expect((await rows('payables')).items).toHaveLength(0)
    await run.save('02-source-resource-confirmed')
    const finance = await run.send('请重新读取当前团的正式客源和资源，仅为刚才“闭环验收甲”的客源单准备1200元初始应收审核，为“闭环全程住宿”准备400元初始应付审核，两项独立待审核。不直接生成账款，不收款、不付款，不操作其他来源。')
    await run.wait('初始应收应付均待审核', view => view.events.some(event => event.kind === 'batch_status'
      && event.payload.batchId === finance.batch.id && event.payload.status === 'awaiting_review'))
    expect((await run.collaboration()).items.filter(item => item.status === 'pending').map(item => item.confirmationUnit).sort())
      .toEqual(['resource_payable', 'source_order_receivable'])
    expect((await rows('receivables')).items).toHaveLength(0)
    expect((await rows('payables')).items).toHaveLength(0)
    await confirmPackage('source_order_receivable', '确认提交约定应收')
    await confirmPackage('resource_payable', '确认提交约定应付')
    await page.reload()
    const receivables = (await rows('receivables')).items
    const payables = (await rows('payables')).items
    expect(receivables).toHaveLength(1)
    expect(payables).toHaveLength(1)
    expect(receivables[0]).toMatchObject({ amountCents: 120_000, settledAmountCents: 0 })
    expect(payables[0]).toMatchObject({ amountCents: 40_000, settledAmountCents: 0 })
    const query = await run.send('请重新读取本团最新正式数据，直接回答正式应收、正式应付、已收和已付。说明生成账款不等于收付款。仅查询，不创建或修改，不重复生成账款。')
    const final = await run.wait('完整闭环后重读正式数据', view => view.events.some(event => event.kind === 'batch_status'
      && event.payload.batchId === query.batch.id && event.payload.status === 'completed'))
    const answer = final.events.filter(event => event.kind === 'agent_message' && event.payload.batchId === query.batch.id)
      .map(event => String(event.payload.text)).join('\n')
    expect(answer).toMatch(/1[,，]?200/)
    expect(answer).toContain('400')
    expect((await rows('receivables')).items.map(item => item.id)).toEqual(receivables.map(item => item.id))
    expect((await rows('payables')).items.map(item => item.id)).toEqual(payables.map(item => item.id))
    expect((await run.collaboration()).items.filter(item => item.status === 'pending')).toHaveLength(0)
    await run.save('03-finance-confirmed-and-reread')
  } finally { await run.save('final') }
})

import { expect, test, type APIResponse } from '@playwright/test'
import { createDeparture, loginCoordinator } from '../support/collaboration'

// Real model calls are an explicit local acceptance check, outside the default fixture suite.
test.skip(process.env.WEB_E2E_LIVE_AI !== 'true', '设置 WEB_E2E_LIVE_AI=true 后连接本地真实 AI')

async function apiData<T>(response: APIResponse): Promise<T> {
  expect(response.ok(), `${response.url()}: ${response.status()} ${await response.text()}`).toBe(true)
  return (await response.json()).data as T
}

test('真实网页：AI 修改已有行程段、追加和编辑游客，确认及刷新后保留', async ({ page }, testInfo) => {
  test.setTimeout(480_000)
  await loginCoordinator(page)
  const departureId = await createDeparture(page, 'e2e-live-ai-edit')
  const origin = new URL(page.url()).origin
  const headers = { Origin: origin }
  console.log(`测试团：${origin}/departure/${departureId}`)
  const segments = await apiData<{ items: Array<{ id: string }> }>(await page.request.get(`/api/departures/${departureId}/segments`))
  const segment = segments.items[0]
  expect(segment).toBeTruthy()
  await apiData(await page.request.patch(`/api/segments/${segment.id}`, { headers, data: { name: '网页回测原行程', destination: '日喀则' } }))
  const partners = await apiData<{ items: Array<{ id: string; status: string }> }>(await page.request.get('/api/partners?pageSize=100'))
  const partner = partners.items.find((item) => item.status === 'active')
  expect(partner).toBeTruthy()
  const source = await apiData<{ id: string; displayName: string }>(await page.request.post(`/api/departures/${departureId}/source-orders`, {
    headers, data: { partnerId: partner!.id, adultGuestCount: 3, childGuestCount: 0, adultUnitPriceCents: 100000, discountType: 'none', collectionMode: 'partner_settled' },
  }))
  for (const guest of [{ name: '回测张三', phone: '13800000001' }, { name: '回测李四', notes: '保留原备注' }]) {
    await apiData(await page.request.post(`/api/source-orders/${source.id}/guests`, { headers, data: guest }))
  }
  await page.goto(`/departure/${departureId}?tab=execution`)
  await page.getByRole('button', { name: '展开电子化助理' }).click()
  const assistant = page.getByRole('complementary', { name: '电子化助理' })
  await assistant.getByRole('button', { name: '打开会话历史' }).click()
  await page.getByRole('dialog', { name: '会话历史' }).getByRole('button', { name: '新建会话' }).click()
  const attachPage = assistant.getByRole('button', { name: '获取当前页面' })
  if (await attachPage.isVisible()) await attachPage.click()
  await expect(assistant.getByTestId('current-page-chip')).toBeVisible()
  let conversationId: string | undefined

  async function send(text: string) {
    const reviewButtons = assistant.getByRole('button', { name: '查看审核内容', exact: true })
    const previousReviews = await reviewButtons.count()
    const sent = page.waitForResponse((response) => response.request().method() === 'POST' && /\/api\/agent\/conversations(?:\/[^/]+)?\/messages$/.test(new URL(response.url()).pathname))
    await assistant.getByRole('textbox', { name: '询问小团宝业务' }).fill(text)
    await assistant.getByRole('button', { name: '发送', exact: true }).click()
    const result = await apiData<{ conversationId: string }>(await sent)
    conversationId = result.conversationId
    await expect(reviewButtons).toHaveCount(previousReviews + 1, { timeout: 180_000 })
    await reviewButtons.last().click()
    return page.getByRole('complementary', { name: '发团协作工作区' })
  }

  try {
    console.log('发送真实 AI 行程修改指令')
    let workspace = await send('本地网页回测：请修改当前团已有的“网页回测原行程”，名称改为“网页回测新行程”，目的地改为“拉萨”。只生成修改审核稿，保留日期及其他行程，不新增行程，不直接写入。')
    const segmentPanel = workspace.getByRole('region', { name: '行程段修改审核' })
    await expect(segmentPanel).toContainText('网页回测原行程')
    await expect(segmentPanel.getByRole('textbox', { name: '名称建议' })).toHaveValue('网页回测新行程')
    await segmentPanel.getByRole('textbox', { name: '名称建议' }).fill('网页人工核定行程')
    await segmentPanel.getByRole('button', { name: '确认修改行程段' }).click()
    await expect(workspace.getByRole('button', { name: '查看行程段', exact: true })).toBeVisible({ timeout: 60_000 })
    await page.screenshot({ path: testInfo.outputPath('01-segment-confirmed.png'), fullPage: true })
    await workspace.getByRole('button', { name: '返回业务页面', exact: true }).first().click()
    await page.reload()
    await expect(page.getByRole('main').getByText('网页人工核定行程', { exact: true }).first()).toBeVisible()
    console.log('行程修改：真实模型提案 → 人工修正 → 确认 → 刷新验证通过')

    await page.getByRole('tab', { name: '客源管理', exact: true }).click()
    if (!(await assistant.isVisible())) await page.getByRole('button', { name: '展开电子化助理' }).click()
    workspace = await send(`继续修改当前团唯一已有客源“${source.displayName}”的游客名单：追加新游客“回测王五”，电话13900000005；将已有游客“回测张三”的电话修改为13900000003。保留回测李四及其备注和所有未提及字段，只生成一份游客名单修改审核稿，不新增客源，不删除游客，不改报价和计费人数，不直接写入。`)
    const guestsPanel = workspace.getByRole('region', { name: '游客名单修改审核' })
    await expect(guestsPanel).toContainText('回测张三')
    await expect(guestsPanel).toContainText('回测李四')
    const beforeGuests = await apiData<Array<{ name: string; phone: string | null }>>(await page.request.get(`/api/source-orders/${source.id}/guests`))
    expect(beforeGuests).toHaveLength(2)
    expect(beforeGuests).toEqual(expect.arrayContaining([expect.objectContaining({ name: '回测张三', phone: '13800000001' })]))
    await expect(guestsPanel.getByRole('textbox', { name: '追加游客1姓名' })).toHaveValue('回测王五')
    await guestsPanel.getByRole('textbox', { name: '追加游客1姓名' }).fill('回测王五核定')
    await guestsPanel.getByRole('button', { name: '确认修改游客名单' }).click()
    await expect(workspace.getByRole('button', { name: '查看客源单', exact: true })).toBeVisible({ timeout: 60_000 })
    await page.screenshot({ path: testInfo.outputPath('02-guests-confirmed.png'), fullPage: true })
    await workspace.getByRole('button', { name: '返回业务页面', exact: true }).first().click()
    await page.reload()
    const main = page.getByRole('main')
    const guestCell = main.getByRole('cell', { name: /回测王五核定/ })
    await expect(guestCell).toBeVisible()
    await expect(guestCell).toContainText('回测张三')
    await expect(guestCell).toContainText('回测李四')
    const savedGuests = await apiData<Array<{ name: string; phone: string | null; notes: string | null }>>(await page.request.get(`/api/source-orders/${source.id}/guests`))
    expect(savedGuests).toHaveLength(3)
    expect(savedGuests).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '回测张三', phone: '13900000003' }),
      expect.objectContaining({ name: '回测李四', notes: '保留原备注' }),
      expect.objectContaining({ name: '回测王五核定', phone: '13900000005' }),
    ]))
    await page.screenshot({ path: testInfo.outputPath('03-formal-after-reload.png'), fullPage: true })
    console.log('游客修改：真实模型提案 → 人工修正 → 确认 → 刷新验证通过')
  } finally {
    if (conversationId) {
      const response = await page.request.get(`/api/agent/conversations/${conversationId}`)
      if (response.ok()) await testInfo.attach('live-conversation', { body: JSON.stringify(await response.json(), null, 2), contentType: 'application/json' })
    }
    await testInfo.attach('live-departure', { body: JSON.stringify({ departureId, sourceOrderId: source.id, segmentId: segment.id }), contentType: 'application/json' })
  }
})

import { expect, test, type Page } from '@playwright/test'
import { candidate, loginCoordinator, mockDepartureCollaboration, reviewPackage } from '../support/collaboration'
import { paths } from '../support/urls'

const conversationId = 'conv-queue-review'
const title = 'e2e 排队与审核修订'
const createdAt = '2026-10-20T00:00:00.000Z'
type Event = { kind: string; payload: Record<string, unknown> }

function apiOk(data: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, message: 'ok', data }) }
}

async function mockConversation(page: Page, initialEvents: Event[], queued = false) {
  const events = initialEvents.map((event, index) => ({ ...event, id: `event-${index + 1}`, sequence: index + 1, createdAt }))
  let draft = { text: '', draftEpoch: 0, revision: 0 }
  const sent: Record<string, unknown>[] = []
  const conversation = () => ({ id: conversationId, conversationId, title, status: 'open', events, lastSequence: events.length, draft })
  await page.route(/\/api\/agent\/conversations(?:\?.*)?$/, (route) => route.fulfill(apiOk({
    items: [{ id: conversationId, title, status: 'open', lastActivityAt: createdAt, activityGroup: 'today' }], nextCursor: null,
  })))
  await page.route(`**/api/agent/conversations/${conversationId}`, (route) => route.fulfill(apiOk(conversation())))
  await page.route(`**/api/agent/conversations/${conversationId}/events**`, (route) => route.fulfill(apiOk(conversation())))
  await page.route(`**/api/agent/conversations/${conversationId}/stream**`, (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }))
  await page.route(`**/api/agent/conversations/${conversationId}/sources`, (route) => route.fulfill(apiOk([])))
  await page.route(`**/api/agent/conversations/${conversationId}/draft`, (route) => {
    const payload = route.request().postDataJSON()
    draft = { text: payload.text, draftEpoch: draft.draftEpoch, revision: draft.revision + 1 }
    return route.fulfill(apiOk(draft))
  })
  await page.route(`**/api/agent/conversations/${conversationId}/messages`, (route) => {
    const payload = route.request().postDataJSON()
    sent.push(payload)
    const batchId = `batch-sent-${sent.length}`
    for (const event of [
      { kind: 'user_message', payload: { ...payload, batchId } },
      { kind: 'batch_status', payload: { batchId, status: queued ? 'ready_for_agent' : 'completed', queued } },
    ]) events.push({ ...event, id: `event-${events.length + 1}`, sequence: events.length + 1, createdAt })
    draft = { text: '', draftEpoch: draft.draftEpoch + 1, revision: draft.revision + 1 }
    return route.fulfill(apiOk({ ...conversation(), batch: { id: batchId, status: queued ? 'ready_for_agent' : 'completed' } }))
  })
  return sent
}

async function openConversation(page: Page) {
  await page.goto(paths.departure)
  await page.getByRole('button', { name: '展开电子化助理' }).click()
  const pane = page.getByRole('complementary', { name: '电子化助理' })
  await pane.getByRole('button', { name: '打开会话历史' }).click()
  await page.getByRole('dialog', { name: '会话历史' }).getByRole('option', { name: title }).click()
  return pane
}

test('处理中的新消息进入队列，原处理不被停止', async ({ page }) => {
  await loginCoordinator(page)
  const sent = await mockConversation(page, [
    { kind: 'user_message', payload: { batchId: 'batch-first', text: '先整理这段自由文本' } },
    { kind: 'batch_status', payload: { batchId: 'batch-first', status: 'agent_running' } },
  ], true)
  const stopRequests: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/(stop|cancel)$/.test(request.url())) stopRequests.push(request.url())
  })
  const pane = await openConversation(page)
  await pane.getByRole('textbox', { name: '询问小团宝业务' }).fill('然后创建一个确定目标')
  await pane.getByRole('button', { name: '发送', exact: true }).click()
  await expect(pane.getByRole('region', { name: '排队消息，共 1 条' })).toContainText('然后创建一个确定目标')
  await expect(pane.getByText('先整理这段自由文本', { exact: true })).toBeVisible()
  expect(sent).toEqual([{ text: '然后创建一个确定目标' }])
  expect(stopRequests).toEqual([])
})

test('等待追问时独立消息仍可发送，保留原问题且不冒充回答', async ({ page }) => {
  await loginCoordinator(page)
  const prompt = '出发日期需要顺延几天？'
  const sent = await mockConversation(page, [
    { kind: 'user_message', payload: { batchId: 'batch-question', text: '日期顺延一下' } },
    { kind: 'agent_message', payload: { batchId: 'batch-question', text: prompt, interaction: {
      interactionId: 'interaction-date', type: 'free_text', prompt, options: [], responseSchema: { type: 'string' }, status: 'pending', version: 1,
    } } },
    { kind: 'batch_status', payload: { batchId: 'batch-question', status: 'awaiting_user_input' } },
  ])
  const pane = await openConversation(page)
  const question = pane.getByRole('region', { name: `追问：${prompt}` })
  await expect(question).toBeVisible()
  await pane.getByRole('textbox', { name: '询问小团宝业务' }).fill('独立查询：团单有哪些状态？')
  await pane.getByRole('button', { name: '发送', exact: true }).click()
  await expect.poll(() => sent).toEqual([{ text: '独立查询：团单有哪些状态？' }])
  await expect(question.getByRole('textbox', { name: `回答追问：${prompt}` })).toHaveValue('')
  await expect(question.getByRole('button', { name: '发送回答' })).toBeDisabled()
})

test('查看待审核建团内容后，刷新与连续修订都发送原任务及审核引用', async ({ page }) => {
  await loginCoordinator(page)
  const taskId = 'task-review-existing'
  const reviewPackageId = 'review-existing'
  const sent = await mockConversation(page, [
    { kind: 'user_message', payload: { batchId: 'batch-create', text: '创建九月川西团' } },
    { kind: 'batch_status', payload: { batchId: 'batch-create', status: 'ready_for_agent', createdTaskId: taskId, createdTaskType: 'departure_creation', createdTaskGoal: '创建九月川西团', continuation: true } },
    { kind: 'agent_message', payload: { batchId: 'batch-create', taskId, reviewPackageId, text: '已提交待审核建议', payloadSchema: 'departure.basic_info_draft@v1', confirmationUnit: 'basic_info_draft', fieldKeys: ['name'] } },
    { kind: 'batch_status', payload: { batchId: 'batch-create', taskId, reviewPackageId, status: 'awaiting_review' } },
  ])
  await page.route(`**/api/agent/tasks/${taskId}`, (route) => route.fulfill(apiOk({
    id: taskId, status: 'in_progress', currentPhase: 'basic_info', departureId: null, creatorUserId: 'user-e2e', statusVersion: 1,
    createdAt, updatedAt: createdAt, draft: { version: 1, snapshot: { mode: 'manual', routeName: '' }, updatedAt: createdAt }, pendingReview: null,
  })))
  await page.route(`**/api/agent/tasks/${taskId}/runtime-state`, (route) => route.fulfill(apiOk({ status: 'awaiting_review' })))
  const pane = await openConversation(page)
  await pane.getByRole('button', { name: '查看审核内容' }).click()
  await expect(page).toHaveURL(new RegExp(`/departure/new\\?taskId=${taskId}`))
  await expect(pane.getByTestId('current-page-chip')).toContainText('修订审核建议')
  await page.reload()
  await expect(pane.getByTestId('current-page-chip')).toContainText('修订审核建议')
  for (const text of ['团名改成十月川西团', '再改成十月川西亲子团']) {
    await pane.getByRole('textbox', { name: '询问小团宝业务' }).fill(text)
    await pane.getByRole('button', { name: '发送', exact: true }).click()
    await expect.poll(() => sent.at(-1)).toEqual({ text, primaryTaskId: taskId, reviewPackageId })
    await expect(pane.getByTestId('current-page-chip')).toContainText('修订审核建议')
  }
})

const departureId = 'dep-review-ui'

async function mockBusinessDeparture(page: Page) {
  await page.route(`**/api/departures/${departureId}/segments`, (route) => route.fulfill(apiOk({ items: [], total: 0 })))
  await page.route(`**/api/departures/${departureId}/resources**`, (route) => route.fulfill(apiOk({ items: [], total: 0 })))
  await page.route(`**/api/departures/${departureId}`, (route) => route.fulfill(apiOk({
    id: departureId, departureNo: 'XTB-UI-REVIEW', name: '审核刷新回归团', routeName: '回归路线', routeSource: 'manual',
    sourceTemplateId: null, departureType: 'combined', startDate: '2026-12-15', endDate: '2026-12-16', dayCount: 2,
    ownerUserId: 'user-e2e', ownerName: '王姐', status: 'editing', departureProgress: 'not_started', notes: null, createdAt, updatedAt: createdAt,
    totalGuests: 0, sourceOrderCount: 0, segmentCount: 0, resourceCount: 0, netReceivableCents: 0, payableCents: 0, estimatedMarginCents: 0, canPurge: false,
    completionTags: { sourceOrders: '暂无客源', segments: '暂无行程', resources: '暂无资源', receivables: '未提交应收', payables: '未提交应付' },
    driverSupplierId: null, driverSupplierName: null, guideSupplierId: null, guideSupplierName: null, vehiclePlate: null, contactPhone: null,
    grossReceivableCents: 0, fareAdjustmentNetCents: 0, discountCents: 0, verifiedReceivableCents: 0, openUnsettledReceivableCents: 0,
    verifiedPayableCents: 0, openUnsettledPayableCents: 0, unverifiedIncomeCents: 0, unverifiedExpenseCents: 0, isFinanciallySettled: false,
    archiveHistory: [], settlementHistory: [],
    overviewStats: {
      receivedCents: 0, openUnreceivedCents: 0, closedUnreceivedCents: 0, ungeneratedReceivableCents: 0, otherReceivableCents: 0,
      additionalIncomeNetCents: 0, additionalIncomeGrossCents: 0, additionalIncomeExpenseCents: 0, settlementCollectionReceivedCents: 0,
      settlementCollectionReceivableCents: 0, guestCollectionReceivedCents: 0, guestCollectionAgreedCents: 0, estimatedRebateCents: 0,
      confirmedRebateCents: 0, rebatePaidCents: 0, rebateUnpaidCents: 0, customerTopUpCents: 0, guestListRecorded: 0, guestListPlanned: 0,
      guestListMissing: 0, pendingReceivableCount: 0, pendingPayableCount: 0, unassignedSegmentCount: 0, overdueAccountCount: 0,
      resourceCostCents: 0, outsourceCostCents: 0, confirmedPayableCents: 0, paidCents: 0, resourcePaidCents: 0, openUnpaidCents: 0,
      closedUnpaidCents: 0, ungeneratedPayableCents: 0, otherPayableCents: 0, resourcePayableDifferenceCents: 0, confirmedMarginCents: 0,
      incomeTransactionCents: 0, expenseTransactionCents: 0, cashNetInflowCents: 0, unverifiedIncomeCents: 0, unverifiedExpenseCents: 0,
      verifiedFromExternalCents: 0, verifiedToOtherDeparturesCents: 0, anomalies: [],
    },
  })))
}

async function openBusinessReview(page: Page) {
  await page.getByRole('button', { name: '展开电子化助理' }).click()
  const pane = page.getByRole('complementary', { name: '电子化助理' })
  await pane.getByRole('button', { name: '打开会话历史' }).click()
  await page.getByRole('dialog', { name: '会话历史' }).getByRole('option', { name: title }).click()
  const attach = pane.getByRole('button', { name: '获取当前页面' })
  if (await attach.isVisible()) await attach.click()
  await expect(pane.getByTestId('current-page-chip')).toContainText('XTB-UI-REVIEW')
  await pane.getByRole('button', { name: '展开协作工作区', exact: true }).click()
  return page.getByRole('complementary', { name: '发团协作工作区' })
}

for (const action of [{ path: 'reject', label: '拒绝建议', status: 'rejected' }, { path: 'cancel', label: '取消审核', status: 'cancelled' }]) {
  test(`客源缺字段仍可${action.label}，处置后旧引用清除且连续消息保留本团`, async ({ page }) => {
    await loginCoordinator(page)
    await mockBusinessDeparture(page)
    const sent = await mockConversation(page, [{ kind: 'user_message', payload: { text: '新增客源，报价稍后补充' } }])
    const pkg = reviewPackage({ id: 'review-partial-source', payloadSchema: 'source_order.create@v1', confirmationUnit: 'source_order_create',
      candidates: [candidate('displayName', '待补充报价的客源')], extras: { conversationId, targetId: departureId } })
    await mockDepartureCollaboration(page, departureId, () => ({ conversations: [{ id: conversationId, title }], items: [pkg], confirmations: [] }))
    const formalWrites: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && (/\/source-orders(?:\/|$)/.test(new URL(request.url()).pathname) || request.url().includes('/agent/review-decisions'))) formalWrites.push(request.url())
    })
    await page.route(`**/api/departures/${departureId}/source-orders**`, (route) => route.fulfill(apiOk({ items: [], total: 0 })))
    await page.route(`**/api/agent/review-packages/${pkg.id}/${action.path}`, async (route) => {
      expect(route.request().postDataJSON()).toEqual({ expectedPackageVersion: 1 })
      pkg.status = action.status
      await route.fulfill(apiOk({}))
    })
    await page.goto(`/departure/${departureId}?tab=sourceOrders`)
    const workspace = await openBusinessReview(page)
    const review = workspace.getByRole('region', { name: '客源单审核' })
    await expect(review.getByRole('button', { name: '确认写入客源单' })).toBeDisabled()
    await expect(review.getByRole('button', { name: '拒绝建议' })).toBeEnabled()
    await expect(review.getByRole('button', { name: '取消审核' })).toBeEnabled()
    await workspace.getByRole('button', { name: '针对此项提问' }).click()
    await expect(workspace.getByRole('button', { name: '取消引用' })).toBeVisible()
    await review.getByRole('button', { name: action.label }).click()
    await expect(page.getByText(action.path === 'reject' ? '已拒绝建议，未创建客源单' : '已取消审核，未创建客源单', { exact: true })).toBeVisible()
    await expect(workspace.getByRole('button', { name: '取消引用' })).toHaveCount(0)
    await workspace.getByRole('button', { name: '返回业务页面', exact: true }).first().click()
    const pane = page.getByRole('complementary', { name: '电子化助理' })
    await expect(pane).toBeVisible()
    await expect(pane.getByRole('button', { name: '取消引用' })).toHaveCount(0)
    await page.getByRole('tab', { name: '执行安排', exact: true }).click()
    await page.getByRole('tab', { name: '客源管理', exact: true }).click()
    for (const text of ['独立查询当前团名', '再查询本团客源数量']) {
      await pane.getByRole('textbox', { name: '询问小团宝业务' }).fill(text)
      await pane.getByRole('button', { name: '发送', exact: true }).click()
      await expect.poll(() => sent.at(-1)).toMatchObject({ text, pageLocator: { kind: 'departure', objectId: departureId } })
      expect(sent.at(-1)).not.toHaveProperty('reviewPackageId')
    }
    expect(formalWrites).toEqual([])
  })
}

test('预热客源列表后确认AI审核，返回业务页面立即看到新客源与名单，无需刷新', async ({ page }) => {
  await loginCoordinator(page)
  await mockBusinessDeparture(page)
  await mockConversation(page, [{ kind: 'user_message', payload: { text: '新增回归客户，一位成人3200元，名单王小明' } }])
  const pkg = reviewPackage({ id: 'review-source-confirm', payloadSchema: 'source_order.create@v1', confirmationUnit: 'source_order_create',
    candidates: [candidate('partnerId', 'partner-ui'), candidate('displayName', '暖缓存新客源'), candidate('adultGuestCount', 1),
      candidate('childGuestCount', 0), candidate('adultUnitPriceCents', 320000), candidate('fareAdjustments', []), candidate('discountType', 'none'),
      candidate('collectionMode', 'partner_settled'), candidate('guests', [{ name: '王小明', included: true }])],
    extras: { conversationId, targetId: departureId } })
  let confirmed = false
  let listReads = 0
  const decision = { decisionCommandId: 'decision-ui-source', accepted: true, items: [{ packageId: pkg.id, status: 'succeeded', resultRef: { objectKind: 'source_order', objectId: 'source-ui-created' } }] }
  await mockDepartureCollaboration(page, departureId, () => ({ conversations: [{ id: conversationId, title }], items: [pkg], confirmations: confirmed ? [decision] : [] }))
  await page.route('**/api/partners/partner-ui', (route) => route.fulfill(apiOk({ id: 'partner-ui', name: '暖缓存回归客户' })))
  await page.route(`**/api/departures/${departureId}/source-orders**`, (route) => {
    listReads += 1
    return route.fulfill(apiOk({ total: confirmed ? 1 : 0, items: confirmed ? [{
      id: 'source-ui-created', departureId, partnerId: 'partner-ui', partnerName: '暖缓存回归客户', displayName: '暖缓存新客源',
      guestCount: 1, adultGuestCount: 1, childGuestCount: 0, adultUnitPriceCents: 320000, childUnitPriceCents: 0,
      grossReceivableCents: 320000, fareAdjustmentNetCents: 0, fareAdjustments: [], discountType: 'none', discountCents: 0,
      netReceivableCents: 320000, collectionMode: 'partner_settled', depositCents: 0, balanceCents: 0, partnerCollectedCents: 0, guestCollectCents: 0,
      guests: [{ id: 'guest-ui', name: '王小明' }], receivableStatus: 'not_generated', hasPaymentSchedule: false,
      hasSourceAmountMismatch: false, amountFieldsLocked: false, hasIncompleteReceivablePaths: false, estimatedRebateCents: 0,
      rebateCents: 0, rebateStatus: 'not_generated', rebateScheduleNo: null, createdAt, updatedAt: createdAt,
    }] : [] }))
  })
  await page.route('**/api/agent/review-decisions', (route) => {
    confirmed = true
    pkg.status = 'confirmed'
    return route.fulfill(apiOk(decision))
  })
  await page.route(`**/api/agent/review-decisions/${decision.decisionCommandId}`, (route) => route.fulfill(apiOk(decision)))
  await page.goto(`/departure/${departureId}?tab=sourceOrders`)
  await expect.poll(() => listReads).toBeGreaterThan(0)
  await expect(page.getByRole('main').getByText('暖缓存回归客户', { exact: true })).toHaveCount(0)
  const workspace = await openBusinessReview(page)
  await workspace.getByRole('button', { name: '确认写入客源单' }).click()
  await expect(workspace.getByRole('region', { name: '客源单已创建' })).toBeVisible()
  await workspace.getByRole('button', { name: '返回业务页面', exact: true }).first().click()
  await expect(page.getByRole('main').getByRole('cell', { name: '暖缓存回归客户', exact: true })).toBeVisible()
  await expect(page.getByRole('main').getByText('王小明', { exact: true })).toBeVisible()
  expect(listReads).toBeGreaterThan(1)
})

test('预热行程资源空列表后确认酒店审核，立即显示资源明细与金额，无需刷新', async ({ page }) => {
  await loginCoordinator(page)
  await mockBusinessDeparture(page)
  await mockConversation(page, [{ kind: 'user_message', payload: { text: 'D1入住回归酒店，总价600元' } }])
  let confirmed = false
  let resourceReads = 0
  const pkg = reviewPackage({ id: 'review-hotel-confirm', payloadSchema: 'departure.segment_resource@v1', confirmationUnit: 'segment_resource',
    candidates: [candidate('title', '暖缓存酒店资源'), candidate('resourceKind', 'hotel'), candidate('supplierId', 'supplier-ui'),
      candidate('itinerarySegmentId', 'segment-ui'), candidate('amountCents', 60000)], extras: { conversationId, targetId: departureId } })
  const decision = { decisionCommandId: 'decision-ui-hotel', accepted: true, items: [{ packageId: pkg.id, status: 'succeeded', resultRef: { objectKind: 'segment_resource', objectId: 'resource-ui-created' } }] }
  await mockDepartureCollaboration(page, departureId, () => ({ conversations: [{ id: conversationId, title }], items: [pkg], confirmations: confirmed ? [decision] : [] }))
  await page.route(`**/api/departures/${departureId}/segments`, (route) => route.fulfill(apiOk({
    total: 1, summary: { segmentCount: 1, totalDays: 1, resourceCount: confirmed ? 1 : 0, payableOverview: '未提交' }, items: [{
      id: 'segment-ui', departureId, name: 'D1 回归住宿', sortOrder: 1, startDate: '2026-12-15', endDate: '2026-12-15', dayCount: 1,
      destination: null, notes: null, fullTicketCount: 0, halfTicketCount: 0, studentTicketCount: 0, freeTicketCount: 0,
      hasTicketHeadcountMismatch: false, pendingCheck: false, resourceCount: confirmed ? 1 : 0, outsourceCount: 0,
      resourceAmountCents: confirmed ? 60000 : 0, payableGeneratedCount: 0, payableStatus: 'not_generated',
    }],
  })))
  await page.route('**/api/suppliers/supplier-ui', (route) => route.fulfill(apiOk({ id: 'supplier-ui', name: '回归酒店', categories: ['hotel'] })))
  await page.route('**/api/segments/segment-ui/resources**', (route) => {
    resourceReads += 1
    return route.fulfill(apiOk({ total: confirmed ? 1 : 0, items: confirmed ? [{
      id: 'resource-ui-created', segmentId: 'segment-ui', departureId, resourceKind: 'hotel', counterpartyType: 'supplier',
      partnerId: null, partnerName: null, supplierId: 'supplier-ui', supplierName: '回归酒店', counterpartyName: '回归酒店',
      title: '暖缓存酒店资源', amountCents: 60000, notes: null, pendingCheck: false, hasPaymentSchedule: false,
      payableStatus: 'not_generated', hasSourceAmountMismatch: false, amountFieldsLocked: false, paymentScheduleId: null,
      financeTouched: false, unsettledAmountCents: null, createdAt, updatedAt: createdAt,
    }] : [] }))
  })
  await page.route('**/api/agent/review-decisions', (route) => {
    confirmed = true
    pkg.status = 'confirmed'
    return route.fulfill(apiOk(decision))
  })
  await page.route(`**/api/agent/review-decisions/${decision.decisionCommandId}`, (route) => route.fulfill(apiOk(decision)))
  await page.goto(`/departure/${departureId}?tab=execution`)
  await expect(page.getByRole('main').getByText('本段暂无资源', { exact: true })).toBeVisible()
  expect(resourceReads).toBeGreaterThan(0)
  const workspace = await openBusinessReview(page)
  await workspace.getByRole('button', { name: '确认写入资源' }).click()
  await expect(workspace.getByText('资源已写入', { exact: true })).toBeVisible()
  await workspace.getByRole('button', { name: '返回业务页面', exact: true }).first().click()
  await expect(page.getByRole('main').getByText('暖缓存酒店资源', { exact: true })).toBeVisible()
  await expect(page.getByRole('main').getByText('¥600.00', { exact: true }).first()).toBeVisible()
  expect(resourceReads).toBeGreaterThan(1)
})

for (const guests of [false, true]) {
  test(`${guests ? '游客名单追加和修改' : '已有行程段修改'}展示原值，修正后按新版本确认`, async ({ page }) => {
    await loginCoordinator(page)
    await mockBusinessDeparture(page)
    await mockConversation(page, [{ kind: 'user_message', payload: { text: '修改当前发团内容' } }])
    let confirmed = false
    const corrections: Record<string, unknown>[] = []
    const pkg = reviewPackage({ id: `review-formal-edit-${guests}`, payloadSchema: guests ? 'source_order.guests_update@v1' : 'departure.itinerary_segment_update@v1',
      confirmationUnit: guests ? 'source_order_guests_update' : 'itinerary_segment_update',
      candidates: guests ? [candidate('sourceOrderId', 'source-ui'), candidate('guestChanges', { add: [{ name: '建议新游客' }], update: [{ guestId: 'guest-ui', phone: '13900000000' }] })]
        : [candidate('itinerarySegmentId', 'segment-ui'), candidate('name', '建议新行程')],
      extras: { conversationId, targetId: departureId, baselineSnapshot: guests ? { sourceOrderId: 'source-ui', displayName: '游客回归客户', guests: [{ id: 'guest-ui', name: '原游客', phone: '13800000000' }] }
        : { itinerarySegmentId: 'segment-ui', name: '原行程', startDate: '2026-12-15', endDate: '2026-12-15' } },
    })
    const decision = { decisionCommandId: 'decision-edit-ui', accepted: true, items: [{ packageId: pkg.id, status: 'succeeded', resultRef: { objectKind: guests ? 'source_order_guests' : 'itinerary_segment', objectId: guests ? 'source-ui' : 'segment-ui' } }] }
    await mockDepartureCollaboration(page, departureId, () => ({ conversations: [{ id: conversationId, title }], items: [pkg], confirmations: confirmed ? [decision] : [] }))
    await page.route(`**/api/agent/review-packages/${pkg.id}`, (route) => {
      const payload = route.request().postDataJSON()
      corrections.push(payload)
      pkg.version = 2
      for (const field of pkg.candidates) {
        if (Object.hasOwn(payload.corrections, field.fieldKey)) Object.assign(field, { userCorrectedValue: payload.corrections[field.fieldKey] })
      }
      return route.fulfill(apiOk({ pendingReview: pkg }))
    })
    const decisions: Record<string, unknown>[] = []
    await page.route('**/api/agent/review-decisions', (route) => {
      decisions.push(route.request().postDataJSON())
      confirmed = true
      pkg.status = 'confirmed'
      return route.fulfill(apiOk(decision))
    })
    await page.goto(`/departure/${departureId}`)
    const workspace = await openBusinessReview(page)
    const panel = workspace.getByRole('region', { name: guests ? '游客名单修改审核' : '行程段修改审核' })
    await expect(panel).toContainText(guests ? '原游客' : '原行程')
    await panel.getByRole('textbox', { name: guests ? '追加游客1姓名' : '名称建议' }).fill('人工修正内容')
    await panel.getByRole('button', { name: guests ? '确认修改游客名单' : '确认修改行程段' }).click()
    await expect.poll(() => decisions.length).toBe(1)
    expect(decisions[0]).toMatchObject({ items: [{ packageId: pkg.id, expectedPackageVersion: 2 }] })
    expect(corrections[0]).toEqual({ expectedPackageVersion: 1, corrections: guests ? { guestChanges: { add: [{ name: '人工修正内容' }], update: [{ guestId: 'guest-ui', phone: '13900000000' }] } } : { name: '人工修正内容' } })
    await expect(workspace.getByRole('button', { name: guests ? '查看客源单' : '查看行程段', exact: true })).toBeVisible()
  })
}

import type { INestApplication } from '@nestjs/common'
import {
  CounterpartyType,
  DirectoryProfileStatus,
  PartnerKind,
  PartnerType,
  ResourceKind,
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
} from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { PaymentChannel, PaymentScheduleSourceType } from '@xiaotuanbao/shared'
import { authRequest, createTestApp, loginAs, uniqueBusinessPrefix } from './helpers'

describe('Partner ledger receivables/payables API (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let organizationId: string
  let ownerUserId: string
  let partnerId: string
  let similarNamePartnerId: string
  let departureId: string
  // 聚合/日期过滤专用 Partner（独立于精确过滤 fixtures，出团日期分布在 6/7 两个月）
  let summaryPartnerId: string
  let julyDepartureId: string
  const testPrefix = `e2e-partner-ledger-${Date.now()}`

  beforeAll(async () => {
    app = await createTestApp()
    prisma = new PrismaClient()
    coordinatorToken = await loginAs(app, 'wangjie')
    financeToken = await loginAs(app, 'acai')

    const user = await prisma.user.findFirst({
      where: { username: 'wangjie', deletedAt: null },
    })
    if (!user) {
      throw new Error('Seed user wangjie not found')
    }
    organizationId = user.organizationId
    ownerUserId = user.id

    // P1 名称是 P2 名称的前缀：keyword 模糊匹配会互串，精确过滤不得互串
    const partner = await prisma.partner.create({
      data: {
        organizationId,
        name: `${testPrefix}-华东国旅`,
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.group_agency,
        status: DirectoryProfileStatus.active,
      },
    })
    partnerId = partner.id

    const similarNamePartner = await prisma.partner.create({
      data: {
        organizationId,
        name: `${testPrefix}-华东国旅分社`,
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.group_agency,
        status: DirectoryProfileStatus.active,
      },
    })
    similarNamePartnerId = similarNamePartner.id

    const departureResponse = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name: `${testPrefix}-d1`,
        routeName: '喀纳斯阿勒泰10日线',
        startDate: '2026-06-10',
        endDate: '2026-06-14',
        ownerUserId,
      })
      .expect(201)
    departureId = departureResponse.body.data.id as string

    // P1 客源单：split 模式 → 生成「客户补款」(counterparty=partner) + 「游客代收」(counterparty=guest) 两个应收节点
    const order1Response = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/source-orders`)
      .send({
        partnerId,
        adultGuestCount: 2,
        childGuestCount: 0,
        adultUnitPriceCents: 100000,
        childUnitPriceCents: 0,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.split,
        depositCents: 120000,
        balanceCents: 80000,
      })
      .expect(201)
    await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${order1Response.body.data.id}/generate-receivables`)
      .expect(201)

    // P2（同名前缀干扰）客源单：partner_settled → 生成 counterparty=P2 的应收节点
    const order2Response = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/source-orders`)
      .send({
        partnerId: similarNamePartnerId,
        adultGuestCount: 3,
        childGuestCount: 0,
        adultUnitPriceCents: 90000,
        childUnitPriceCents: 0,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.partner_settled,
      })
      .expect(201)
    await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${order2Response.body.data.id}/generate-receivables`)
      .expect(201)

    // 手工应付：P1 一张、P2 一张
    await authRequest(app, financeToken)
      .post('/api/finance/payables')
      .send({
        departureId,
        title: `${testPrefix}-p1-payable`,
        amountCents: 50000,
        dueDate: '2026-06-20',
        counterpartyType: CounterpartyType.partner,
        counterpartyId: partnerId,
        counterpartyName: `${testPrefix}-华东国旅`,
      })
      .expect(201)
    await authRequest(app, financeToken)
      .post('/api/finance/payables')
      .send({
        departureId,
        title: `${testPrefix}-p2-payable`,
        amountCents: 70000,
        dueDate: '2026-06-21',
        counterpartyType: CounterpartyType.partner,
        counterpartyId: similarNamePartnerId,
        counterpartyName: `${testPrefix}-华东国旅分社`,
      })
      .expect(201)

    await setupSummaryFixtures()
  })

  /**
   * 聚合/出团日期过滤 fixtures（P3）：
   * 6 月团（复用 departureId，出团 2026-06-10）：
   *   - 客源单 split：客户补款 120000（部分收款 50000）＋游客代收 80000
   *   - 手工应收 40000 → 关闭（不计入汇总）
   *   - 手工应付 50000
   * 7 月团（julyDepartureId，出团 2026-07-05）：
   *   - 客源单 split：客户补款 90000＋游客代收 60000
   *   - 手工应收（其他应收）30000
   *   - 历史 Partner 挂靠拼出资源应付 80000（有效）＋ 99900（作废，不计入汇总）
   *     （写路径已改挂供应商；账本回归仍覆盖读路径上的历史 Partner 拼出）
   */
  async function setupSummaryFixtures() {
    const summaryPartner = await prisma.partner.create({
      data: {
        organizationId,
        name: `${testPrefix}-汇总伙伴`,
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.group_agency,
        status: DirectoryProfileStatus.active,
      },
    })
    summaryPartnerId = summaryPartner.id

    const julyDepartureResponse = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name: `${testPrefix}-d2-july`,
        routeName: '吐鲁番3日线',
        startDate: '2026-07-05',
        endDate: '2026-07-07',
        ownerUserId,
      })
      .expect(201)
    julyDepartureId = julyDepartureResponse.body.data.id as string

    // 6 月客源单：客户补款 120000
    const juneOrder = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/source-orders`)
      .send({
        partnerId: summaryPartnerId,
        adultGuestCount: 2,
        childGuestCount: 0,
        adultUnitPriceCents: 100000,
        childUnitPriceCents: 0,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.split,
        depositCents: 120000,
        balanceCents: 80000,
      })
      .expect(201)
    const juneGenerated = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${juneOrder.body.data.id}/generate-receivables`)
      .expect(201)
    const juneCustomerSchedule = juneGenerated.body.data.schedules.find(
      (schedule: { sourceType: string }) =>
        schedule.sourceType ===
        PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
    ) as { id: string }

    // 部分收款 50000 → 已核销合计要能反映核销进度
    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${juneCustomerSchedule.id}/confirm-collection`)
      .send({
        amountCents: 50000,
        transactionDate: '2026-06-15',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.partner,
        counterpartyId: summaryPartnerId,
        counterpartyName: `${testPrefix}-汇总伙伴`,
      })
      .expect(201)

    // 6 月手工应收 40000 → 关闭（cancelled 不计入汇总）
    const closedReceivable = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send({
        departureId,
        title: `${testPrefix}-p3-closed-receivable`,
        amountCents: 40000,
        dueDate: '2026-07-10',
        counterpartyType: CounterpartyType.partner,
        counterpartyId: summaryPartnerId,
        counterpartyName: `${testPrefix}-汇总伙伴`,
      })
      .expect(201)
    await authRequest(app, financeToken)
      .post(
        `/api/finance/payment-schedules/${closedReceivable.body.data.id as string}/cancel`,
      )
      .send({
        closeDisposition: 'other',
        cancelReason: '测试关闭：不计入汇总',
      })
      .expect(201)

    // 6 月手工应付 50000
    await authRequest(app, financeToken)
      .post('/api/finance/payables')
      .send({
        departureId,
        title: `${testPrefix}-p3-june-payable`,
        amountCents: 50000,
        dueDate: '2026-06-25',
        counterpartyType: CounterpartyType.partner,
        counterpartyId: summaryPartnerId,
        counterpartyName: `${testPrefix}-汇总伙伴`,
      })
      .expect(201)

    // 7 月客源单：客户补款 90000
    const julyOrder = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${julyDepartureId}/source-orders`)
      .send({
        partnerId: summaryPartnerId,
        adultGuestCount: 1,
        childGuestCount: 0,
        adultUnitPriceCents: 150000,
        childUnitPriceCents: 0,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.split,
        depositCents: 90000,
        balanceCents: 60000,
      })
      .expect(201)
    await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${julyOrder.body.data.id}/generate-receivables`)
      .expect(201)

    // 7 月手工应收（其他应收）30000：随归属发团出团日期落入 7 月区间
    await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send({
        departureId: julyDepartureId,
        title: `${testPrefix}-p3-other-receivable`,
        amountCents: 30000,
        dueDate: '2026-08-10',
        counterpartyType: CounterpartyType.partner,
        counterpartyId: summaryPartnerId,
        counterpartyName: `${testPrefix}-汇总伙伴`,
      })
      .expect(201)

    // 7 月历史 Partner 拼出资源应付：一条有效 80000，一条作废 99900（不计入汇总）
    const segmentResponse = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${julyDepartureId}/segments`)
      .send({
        name: '吐鲁番段',
        startDate: '2026-07-05',
        endDate: '2026-07-07',
        destination: '吐鲁番',
      })
      .expect(201)
    const segmentId = segmentResponse.body.data.id as string

    const activeResource = await prisma.segmentResource.create({
      data: {
        segmentId,
        resourceKind: ResourceKind.outsource,
        counterpartyType: CounterpartyType.partner,
        partnerId: summaryPartnerId,
        title: `${testPrefix}-拼出`,
        amountCents: 80000,
      },
    })
    await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${activeResource.id}/generate-payable`)
      .expect(201)

    const voidedResource = await prisma.segmentResource.create({
      data: {
        segmentId,
        resourceKind: ResourceKind.outsource,
        counterpartyType: CounterpartyType.partner,
        partnerId: summaryPartnerId,
        title: `${testPrefix}-拼出-误生成`,
        amountCents: 99900,
      },
    })
    const voidedGenerated = await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${voidedResource.id}/generate-payable`)
      .expect(201)
    // ADR-0023: 资源应付作废归 departure:write（计调），财务无权。
    await authRequest(app, coordinatorToken)
      .post(
        `/api/finance/payment-schedules/${voidedGenerated.body.data.schedule.id as string}/void-resource-payable`,
      )
      .send({ voidReason: '测试作废：不计入汇总' })
      .expect(201)
  }

  afterAll(async () => {
    await prisma.financeVerification.deleteMany({
      where: {
        organizationId,
        paymentSchedule: {
          departure: { organizationId, name: { startsWith: testPrefix } },
        },
      },
    })
    await prisma.financeTransaction.deleteMany({
      where: {
        organizationId,
        departure: { name: { startsWith: testPrefix } },
      },
    })
    await prisma.paymentSchedule.deleteMany({
      where: {
        organizationId,
        departure: { name: { startsWith: testPrefix } },
      },
    })
    await prisma.sourceOrder.deleteMany({
      where: {
        departure: { organizationId, name: { startsWith: testPrefix } },
      },
    })
    await prisma.departure.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.partner.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.$disconnect()
    await app.close()
  })

  it('rejects users without /partner menu permission', async () => {
    const { hash } = await import('bcryptjs')
    const password = 'admin123'
    const username = `${testPrefix}-noperm`
    const user = await prisma.user.create({
      data: {
        organizationId,
        username,
        passwordHash: await hash(password, 10),
        name: '无合作伙伴权限用户',
      },
    })

    const token = await loginAs(app, username, password)
    const receivablesResponse = await authRequest(app, token)
      .get(`/api/partners/${partnerId}/receivables`)
      .expect(403)
    expect(receivablesResponse.body.message).toBe('无权访问')

    const payablesResponse = await authRequest(app, token)
      .get(`/api/partners/${partnerId}/payables`)
      .expect(403)
    expect(payablesResponse.body.message).toBe('无权访问')

    const summaryResponse = await authRequest(app, token)
      .get(`/api/partners/${partnerId}/payment-schedule-summary`)
      .expect(403)
    expect(summaryResponse.body.message).toBe('无权访问')

    await prisma.user.delete({ where: { id: user.id } })
  })

  it('allows finance role under ADR-0016 early-launch menus', async () => {
    await authRequest(app, financeToken)
      .get(`/api/partners/${partnerId}/receivables`)
      .expect(200)
    await authRequest(app, financeToken)
      .get(`/api/partners/${partnerId}/payables`)
      .expect(200)
    await authRequest(app, financeToken)
      .get(`/api/partners/${partnerId}/payment-schedule-summary`)
      .expect(200)
  })

  it('returns 404 for unknown partner', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get('/api/partners/nonexistent-partner-id/receivables')
      .expect(404)

    expect(response.body.message).toBe('合作伙伴不存在')

    await authRequest(app, coordinatorToken)
      .get('/api/partners/nonexistent-partner-id/payment-schedule-summary')
      .expect(404)
  })

  it('returns 404 for partner in another organization', async () => {
    const otherOrg = await prisma.organization.create({
      data: {
        name: `${testPrefix}-other-org`,
        businessPrefix: uniqueBusinessPrefix(testPrefix),
      },
    })
    const foreignPartner = await prisma.partner.create({
      data: {
        organizationId: otherOrg.id,
        name: `${testPrefix}-foreign`,
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.group_agency,
        status: DirectoryProfileStatus.active,
      },
    })

    await authRequest(app, coordinatorToken)
      .get(`/api/partners/${foreignPartner.id}/receivables`)
      .expect(404)
    await authRequest(app, coordinatorToken)
      .get(`/api/partners/${foreignPartner.id}/payables`)
      .expect(404)
    await authRequest(app, coordinatorToken)
      .get(`/api/partners/${foreignPartner.id}/payment-schedule-summary`)
      .expect(404)

    await prisma.partner.delete({ where: { id: foreignPartner.id } })
    await prisma.organization.delete({ where: { id: otherOrg.id } })
  })

  it('lists only receivables anchored to the exact partner, excluding guest-collection nodes', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get(`/api/partners/${partnerId}/receivables`)
      .expect(200)

    const data = response.body.data
    // P1 split 客源单只产生 1 个 partner 应收（客户补款 1200）；游客代收节点（counterparty=guest）不出现
    expect(data.total).toBe(1)
    expect(data.items).toHaveLength(1)
    expect(data.items[0]).toMatchObject({
      counterpartyType: CounterpartyType.partner,
      counterpartyId: partnerId,
      amountCents: 120000,
    })

    // 该客源单确实生成了游客代收节点，只是被精确过滤排除
    const guestSchedules = await prisma.paymentSchedule.findMany({
      where: {
        organizationId,
        departureId,
        counterpartyType: CounterpartyType.guest,
      },
    })
    expect(guestSchedules.length).toBeGreaterThan(0)
  })

  it('does not leak nodes of a partner whose name contains the target partner name', async () => {
    const [p1Response, p2Response] = await Promise.all([
      authRequest(app, coordinatorToken)
        .get(`/api/partners/${partnerId}/receivables`)
        .expect(200),
      authRequest(app, coordinatorToken)
        .get(`/api/partners/${similarNamePartnerId}/receivables`)
        .expect(200),
    ])

    const p1Ids = p1Response.body.data.items.map(
      (item: { counterpartyId: string }) => item.counterpartyId,
    )
    const p2Ids = p2Response.body.data.items.map(
      (item: { counterpartyId: string }) => item.counterpartyId,
    )
    expect(p1Ids).toEqual([partnerId])
    expect(p2Ids).toEqual([similarNamePartnerId])
    expect(p2Response.body.data.items[0]).toMatchObject({ amountCents: 270000 })
  })

  it('lists only payables anchored to the exact partner', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get(`/api/partners/${partnerId}/payables`)
      .expect(200)

    const data = response.body.data
    expect(data.total).toBe(1)
    expect(data.items[0]).toMatchObject({
      counterpartyType: CounterpartyType.partner,
      counterpartyId: partnerId,
      amountCents: 50000,
      title: `${testPrefix}-p1-payable`,
    })
  })

  // 回归：计调在「合作伙伴 → 往来账款」列表可见节点行（走 /partner 放行），点击节点编号
  // 打开详情抽屉时前端调 GET /finance/receivables/:id 或 /payables/:id（/finance/* 守卫），
  // 计调无 /finance/* → 403「无权访问」，抽屉报「节点详情加载失败」。列表可见而详情不可见
  // 属权限漂移，应与列表口径一致放行（能看见该往来账款行，即可看其详情）。
  it('coordinator can open payment schedule detail for ledger rows it can list', async () => {
    const receivablesResponse = await authRequest(app, coordinatorToken)
      .get(`/api/partners/${partnerId}/receivables`)
      .expect(200)
    const receivableId = receivablesResponse.body.data.items[0].id as string
    await authRequest(app, coordinatorToken)
      .get(`/api/finance/receivables/${receivableId}`)
      .expect(200)

    const payablesResponse = await authRequest(app, coordinatorToken)
      .get(`/api/partners/${partnerId}/payables`)
      .expect(200)
    const payableId = payablesResponse.body.data.items[0].id as string
    await authRequest(app, coordinatorToken)
      .get(`/api/finance/payables/${payableId}`)
      .expect(200)
  })

  it('ignores counterparty overrides from the query string', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get(`/api/partners/${partnerId}/receivables`)
      .query({ counterpartyId: similarNamePartnerId })
      .expect(200)

    const data = response.body.data
    expect(data.total).toBe(1)
    expect(data.items[0].counterpartyId).toBe(partnerId)
  })

  type AggregateGroup = {
    direction: string
    sourceType: string
    count: number
    amountCents: number
    settledAmountCents: number
    unsettledAmountCents: number
  }

  function findGroup(groups: AggregateGroup[], direction: string, sourceType: string) {
    return groups.find(
      (group) => group.direction === direction && group.sourceType === sourceType,
    )
  }

  describe('departure date range filter on ledger lists', () => {
    it('filters receivables by departure start date, manual nodes follow their departure', async () => {
      const response = await authRequest(app, coordinatorToken)
        .get(`/api/partners/${summaryPartnerId}/receivables`)
        .query({ departureDateFrom: '2026-07-01', departureDateTo: '2026-07-31' })
        .expect(200)

      const data = response.body.data
      expect(data.total).toBe(2)
      const amounts = data.items
        .map((item: { amountCents: number }) => item.amountCents)
        .sort((a: number, b: number) => a - b)
      expect(amounts).toEqual([30000, 90000])
      for (const item of data.items) {
        expect(item.departureId).toBe(julyDepartureId)
      }
    })

    it('includes boundary dates and supports open-ended ranges', async () => {
      const boundary = await authRequest(app, coordinatorToken)
        .get(`/api/partners/${summaryPartnerId}/receivables`)
        .query({ departureDateFrom: '2026-06-10', departureDateTo: '2026-07-05' })
        .expect(200)
      // 6 月：客户补款 120000＋已关闭手工应收 40000（列表仍展示已关闭）；7 月：90000＋30000
      expect(boundary.body.data.total).toBe(4)

      const openEnded = await authRequest(app, coordinatorToken)
        .get(`/api/partners/${summaryPartnerId}/receivables`)
        .query({ departureDateFrom: '2026-07-01' })
        .expect(200)
      expect(openEnded.body.data.total).toBe(2)
    })

    it('filters payables by departure start date', async () => {
      const response = await authRequest(app, coordinatorToken)
        .get(`/api/partners/${summaryPartnerId}/payables`)
        .query({ departureDateFrom: '2026-06-01', departureDateTo: '2026-06-30' })
        .expect(200)

      const data = response.body.data
      expect(data.total).toBe(1)
      expect(data.items[0]).toMatchObject({
        amountCents: 50000,
        sourceType: 'manual',
      })
    })

    it('rejects invalid range (from after to)', async () => {
      await authRequest(app, coordinatorToken)
        .get(`/api/partners/${summaryPartnerId}/receivables`)
        .query({ departureDateFrom: '2026-08-01', departureDateTo: '2026-07-01' })
        .expect(400)
    })
  })

  describe('payment schedule summary aggregation', () => {
    it('groups by direction × sourceType, excluding cancelled and voided nodes', async () => {
      const response = await authRequest(app, coordinatorToken)
        .get(`/api/partners/${summaryPartnerId}/payment-schedule-summary`)
        .expect(200)

      const groups = response.body.data.groups as AggregateGroup[]

      // 应收侧：客户补款（6 月 120000 部分收款 50000 ＋ 7 月 90000）
      expect(
        findGroup(groups, 'receivable', 'source_order_customer_settlement'),
      ).toMatchObject({
        count: 2,
        amountCents: 210000,
        settledAmountCents: 50000,
        unsettledAmountCents: 160000,
      })
      // 其他应收：仅 7 月 30000；6 月已关闭的 40000 不计入
      expect(findGroup(groups, 'receivable', 'manual')).toMatchObject({
        count: 1,
        amountCents: 30000,
        settledAmountCents: 0,
        unsettledAmountCents: 30000,
      })

      // 应付侧：手工 50000＋资源 80000；已作废 99900 不计入
      expect(findGroup(groups, 'payable', 'manual')).toMatchObject({
        count: 1,
        amountCents: 50000,
      })
      expect(findGroup(groups, 'payable', 'segment_resource')).toMatchObject({
        count: 1,
        amountCents: 80000,
      })

      // 游客代收节点（counterparty=guest）不进入该 Partner 聚合
      for (const group of groups) {
        expect(['receivable', 'payable']).toContain(group.direction)
      }
      const receivableTotal = groups
        .filter((group) => group.direction === 'receivable')
        .reduce((sum, group) => sum + group.amountCents, 0)
      expect(receivableTotal).toBe(240000)
    })

    it('follows the departure date range filter', async () => {
      const response = await authRequest(app, coordinatorToken)
        .get(`/api/partners/${summaryPartnerId}/payment-schedule-summary`)
        .query({ departureDateFrom: '2026-06-01', departureDateTo: '2026-06-30' })
        .expect(200)

      const groups = response.body.data.groups as AggregateGroup[]
      expect(
        findGroup(groups, 'receivable', 'source_order_customer_settlement'),
      ).toMatchObject({
        count: 1,
        amountCents: 120000,
        settledAmountCents: 50000,
        unsettledAmountCents: 70000,
      })
      // 6 月唯一的手工应收已关闭，不出现 manual 分组
      expect(findGroup(groups, 'receivable', 'manual')).toBeUndefined()
      expect(findGroup(groups, 'payable', 'manual')).toMatchObject({
        amountCents: 50000,
      })
      expect(findGroup(groups, 'payable', 'segment_resource')).toBeUndefined()
    })

    it('customer settlement total strictly matches the reconciliation-period source order partnerCollectedCents sum', async () => {
      const period = { departureDateFrom: '2026-07-01', departureDateTo: '2026-07-31' }

      const [summaryResponse, sourceOrdersResponse] = await Promise.all([
        authRequest(app, coordinatorToken)
          .get(`/api/partners/${summaryPartnerId}/payment-schedule-summary`)
          .query(period)
          .expect(200),
        authRequest(app, coordinatorToken)
          .get(`/api/partners/${summaryPartnerId}/source-orders`)
          .query(period)
          .expect(200),
      ])

      const groups = summaryResponse.body.data.groups as AggregateGroup[]
      const customerSettlementCents =
        findGroup(groups, 'receivable', 'source_order_customer_settlement')
          ?.amountCents ?? 0

      const partnerCollectedSum = (
        sourceOrdersResponse.body.data.items as { partnerCollectedCents: number }[]
      ).reduce((sum, order) => sum + order.partnerCollectedCents, 0)

      expect(partnerCollectedSum).toBe(90000)
      expect(customerSettlementCents).toBe(partnerCollectedSum)
    })

    it('rejects invalid range (from after to)', async () => {
      await authRequest(app, coordinatorToken)
        .get(`/api/partners/${summaryPartnerId}/payment-schedule-summary`)
        .query({ departureDateFrom: '2026-08-01', departureDateTo: '2026-07-01' })
        .expect(400)
    })
  })
})

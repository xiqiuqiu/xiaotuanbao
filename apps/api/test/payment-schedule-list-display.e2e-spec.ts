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
import { authRequest, createTestApp, loginAs } from './helpers'

/**
 * 端到端验证应收/应付列表新列（费用类别/费用项目/客源单/收款方式/往来对象）
 * 派生字段 resourceKind / resourceTitle / sourceOrderName 在真实状态流转
 * （生成 → 源事实改名 → 登记收付款 → 关闭）下的显示正确性。四个 scope 的列表
 * 都走同一 PaymentScheduleService.list，此处以发团 scope 与全局 scope 覆盖。
 */
describe('Payment schedule list display fields across lifecycle (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let organizationId: string
  let ownerUserId: string
  let partnerId: string
  let partnerName: string
  let supplierId: string
  let supplierName: string
  const testPrefix = `e2e-ps-display-${Date.now()}`

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

    partnerName = `${testPrefix}-partner`
    const partner = await prisma.partner.create({
      data: {
        organizationId,
        name: partnerName,
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.group_agency,
        status: DirectoryProfileStatus.active,
      },
    })
    partnerId = partner.id

    supplierName = `${testPrefix}-supplier`
    const supplier = await prisma.supplier.create({
      data: {
        organizationId,
        name: supplierName,
        categories: [ResourceKind.transport],
        status: DirectoryProfileStatus.active,
      },
    })
    supplierId = supplier.id
  })

  afterAll(async () => {
    const departureWhere = { organizationId, name: { startsWith: testPrefix } }
    // 先删依赖账款的核销与流水，再删收付款节点，避免外键约束。
    await prisma.financeVerification.deleteMany({
      where: { paymentSchedule: { departure: departureWhere } },
    })
    await prisma.financeTransaction.deleteMany({
      where: { organizationId, departure: departureWhere },
    })
    await prisma.paymentScheduleActivity.deleteMany({
      where: { paymentSchedule: { departure: departureWhere } },
    })
    await prisma.paymentSchedule.deleteMany({
      where: { organizationId, departure: { name: { startsWith: testPrefix } } },
    })
    await prisma.segmentResource.deleteMany({
      where: { segment: { departure: { organizationId, name: { startsWith: testPrefix } } } },
    })
    await prisma.itinerarySegment.deleteMany({
      where: { departure: { organizationId, name: { startsWith: testPrefix } } },
    })
    await prisma.sourceOrder.deleteMany({
      where: { departure: { organizationId, name: { startsWith: testPrefix } } },
    })
    await prisma.supplier.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.partner.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.departure.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.$disconnect()
    await app.close()
  })

  async function createDeparture() {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name: `${testPrefix}-团`,
        routeName: '测试路线',
        startDate: '2026-07-01',
        endDate: '2026-07-05',
        ownerUserId,
      })
      .expect(201)
    return response.body.data as { id: string }
  }

  async function createSegment(departureId: string) {
    const response = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/segments`)
      .send({ name: '喀纳斯段', startDate: '2026-07-01', endDate: '2026-07-03', destination: '喀纳斯' })
      .expect(201)
    return response.body.data as { id: string }
  }

  async function createResource(segmentId: string, overrides: Record<string, unknown> = {}) {
    const response = await authRequest(app, coordinatorToken)
      .post(`/api/segments/${segmentId}/resources`)
      .send({
        resourceKind: ResourceKind.transport,
        supplierId,
        title: '喀纳斯用车',
        amountCents: 160000,
        ...overrides,
      })
      .expect(201)
    return response.body.data as { id: string }
  }

  async function createSourceOrder(departureId: string, overrides: Record<string, unknown> = {}) {
    const response = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/source-orders`)
      .send({
        partnerId,
        adultGuestCount: 10,
        childGuestCount: 0,
        adultUnitPriceCents: 100000,
        childUnitPriceCents: 0,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.guest_only,
        ...overrides,
      })
      .expect(201)
    return response.body.data as { id: string; displayName: string }
  }

  async function listDeparturePayables(departureId: string) {
    const response = await authRequest(app, financeToken)
      .get(`/api/departures/${departureId}/payables`)
      .expect(200)
    return response.body.data.items as Array<Record<string, unknown>>
  }

  async function listDepartureReceivables(departureId: string) {
    const response = await authRequest(app, financeToken)
      .get(`/api/departures/${departureId}/receivables`)
      .expect(200)
    return response.body.data.items as Array<Record<string, unknown>>
  }

  function bySourceId(items: Array<Record<string, unknown>>, sourceId: string) {
    const found = items.find((item) => item.sourceId === sourceId)
    if (!found) {
      throw new Error(`schedule for source ${sourceId} not found`)
    }
    return found
  }

  describe('应付资源节点', () => {
    it('生成→源事实改名(实时联查)→部分付款→关闭：费用类别/项目稳定且随资源实时', async () => {
      const departure = await createDeparture()
      const segment = await createSegment(departure.id)
      const resource = await createResource(segment.id)

      await authRequest(app, coordinatorToken)
        .post(`/api/segment-resources/${resource.id}/generate-payable`)
        .expect(201)

      // 生成后：费用类别=资源种类、费用项目=资源实时 title、无客源单、往来对象=供应商。
      const afterGenerate = bySourceId(await listDeparturePayables(departure.id), resource.id)
      expect(afterGenerate).toMatchObject({
        resourceKind: ResourceKind.transport,
        resourceTitle: '喀纳斯用车',
        sourceOrderName: null,
        counterpartyType: CounterpartyType.supplier,
        counterpartyName: supplierName,
        settledAmountCents: 0,
        financeTouched: false,
      })

      // 财务未介入前给资源改名 → 列表费用项目实时跟随（非生成时快照）。
      await authRequest(app, coordinatorToken)
        .patch(`/api/segment-resources/${resource.id}`)
        .send({ title: '喀纳斯豪华大巴' })
        .expect(200)

      const afterRename = bySourceId(await listDeparturePayables(departure.id), resource.id)
      expect(afterRename.resourceTitle).toBe('喀纳斯豪华大巴')
      expect(afterRename.resourceKind).toBe(ResourceKind.transport)

      const scheduleId = afterRename.id as string

      // 部分付款：派生列稳定，已核销与财务介入更新。
      await authRequest(app, financeToken)
        .post(`/api/finance/payables/${scheduleId}/confirm-payment`)
        .send({
          amountCents: 60000,
          transactionDate: '2026-07-02',
          paymentChannel: PaymentChannel.BANK_TRANSFER,
          counterpartyType: CounterpartyType.supplier,
          counterpartyId: supplierId,
          counterpartyName: supplierName,
        })
        .expect(201)

      const afterPartial = bySourceId(await listDeparturePayables(departure.id), resource.id)
      expect(afterPartial).toMatchObject({
        resourceKind: ResourceKind.transport,
        resourceTitle: '喀纳斯豪华大巴',
        settledAmountCents: 60000,
        unsettledAmountCents: 100000,
        financeTouched: true,
        status: 'pending',
      })

      // 关闭节点：派生列仍在，状态变已关闭。
      await authRequest(app, financeToken)
        .post(`/api/finance/payment-schedules/${scheduleId}/cancel`)
        .send({ closeDisposition: 'business_dispute_stop', cancelReason: '供应商争议，停止追付' })
        .expect(201)

      const afterClose = bySourceId(await listDeparturePayables(departure.id), resource.id)
      expect(afterClose).toMatchObject({
        resourceKind: ResourceKind.transport,
        resourceTitle: '喀纳斯豪华大巴',
        sourceOrderName: null,
        status: 'cancelled',
      })

      // 全局应付列表同样携带派生列。
      const globalList = await authRequest(app, financeToken)
        .get(`/api/finance/payables?departureId=${departure.id}`)
        .expect(200)
      const globalRow = bySourceId(globalList.body.data.items, resource.id)
      expect(globalRow).toMatchObject({
        resourceKind: ResourceKind.transport,
        resourceTitle: '喀纳斯豪华大巴',
      })
    })

    it('拼出资源：费用类别为拼出，往来对象为承接 Partner', async () => {
      const departure = await createDeparture()
      const segment = await createSegment(departure.id)
      const resource = await createResource(segment.id, {
        resourceKind: ResourceKind.outsource,
        supplierId: undefined,
        partnerId,
        title: '喀纳斯段拼出',
        amountCents: 800000,
      })

      await authRequest(app, coordinatorToken)
        .post(`/api/segment-resources/${resource.id}/generate-payable`)
        .expect(201)

      const row = bySourceId(await listDeparturePayables(departure.id), resource.id)
      expect(row).toMatchObject({
        resourceKind: ResourceKind.outsource,
        resourceTitle: '喀纳斯段拼出',
        counterpartyType: CounterpartyType.partner,
        counterpartyName: partnerName,
        sourceOrderName: null,
      })
    })

    it('手工其他应付：资源派生列为空', async () => {
      const departure = await createDeparture()
      const created = await authRequest(app, financeToken)
        .post('/api/finance/payables')
        .send({
          departureId: departure.id,
          title: `${testPrefix}-其他应付`,
          amountCents: 10000,
          dueDate: '2026-12-31',
          counterpartyType: CounterpartyType.supplier,
          counterpartyId: supplierId,
        })
        .expect(201)

      const manualId = created.body.data.id as string
      const items = await listDeparturePayables(departure.id)
      const manualRow = items.find((item) => item.id === manualId)
      expect(manualRow).toMatchObject({
        sourceType: PaymentScheduleSourceType.MANUAL,
        resourceKind: null,
        resourceTitle: null,
        sourceOrderName: null,
        title: `${testPrefix}-其他应付`,
      })
    })
  })

  describe('应收客源节点', () => {
    it('split 客源单：客户补款/游客代收两行携带客源单名与正确往来对象', async () => {
      const departure = await createDeparture()
      const sourceOrder = await createSourceOrder(departure.id, {
        collectionMode: SourceOrderCollectionMode.split,
        partnerCollectedCents: 300000,
      })

      await authRequest(app, coordinatorToken)
        .post(`/api/source-orders/${sourceOrder.id}/generate-receivables`)
        .expect(201)

      const items = await listDepartureReceivables(departure.id)
      const customerRow = items.find(
        (item) => item.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
      )!
      const guestRow = items.find(
        (item) => item.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
      )!

      // 客户补款：客源单列=displayName，往来对象=发客 Partner。
      expect(customerRow).toMatchObject({
        sourceOrderName: sourceOrder.displayName,
        counterpartyType: CounterpartyType.partner,
        counterpartyName: partnerName,
        resourceKind: null,
        resourceTitle: null,
      })
      // 游客代收：客源单列=displayName，往来对象类型=guest（前端展示层显示「游客」）。
      expect(guestRow).toMatchObject({
        sourceOrderName: sourceOrder.displayName,
        counterpartyType: CounterpartyType.guest,
      })

      // 部分收款客户补款路径：客源单列稳定。
      await authRequest(app, financeToken)
        .post(`/api/finance/receivables/${customerRow.id}/confirm-collection`)
        .send({
          amountCents: 100000,
          transactionDate: '2026-07-02',
          paymentChannel: PaymentChannel.BANK_TRANSFER,
          counterpartyType: CounterpartyType.partner,
          counterpartyId: partnerId,
          counterpartyName: partnerName,
        })
        .expect(201)

      const afterPartial = (await listDepartureReceivables(departure.id)).find(
        (item) => item.id === customerRow.id,
      )!
      expect(afterPartial).toMatchObject({
        sourceOrderName: sourceOrder.displayName,
        settledAmountCents: 100000,
        unsettledAmountCents: 200000,
        financeTouched: true,
      })

      // 关闭游客代收路径：客源单列仍在，状态已关闭。
      await authRequest(app, financeToken)
        .post(`/api/finance/payment-schedules/${guestRow.id}/cancel`)
        .send({ closeDisposition: 'other', cancelReason: '游客改由组团社代收' })
        .expect(201)

      const afterClose = (await listDepartureReceivables(departure.id)).find(
        (item) => item.id === guestRow.id,
      )!
      expect(afterClose).toMatchObject({
        sourceOrderName: sourceOrder.displayName,
        counterpartyType: CounterpartyType.guest,
        status: 'cancelled',
      })
    })

    it('手工其他应收：客源单列为空', async () => {
      const departure = await createDeparture()
      const created = await authRequest(app, financeToken)
        .post('/api/finance/receivables')
        .send({
          departureId: departure.id,
          title: `${testPrefix}-其他应收`,
          amountCents: 10000,
          dueDate: '2026-12-31',
          counterpartyType: CounterpartyType.partner,
          counterpartyId: partnerId,
        })
        .expect(201)

      const manualId = created.body.data.id as string
      const manualRow = (await listDepartureReceivables(departure.id)).find(
        (item) => item.id === manualId,
      )
      expect(manualRow).toMatchObject({
        sourceType: PaymentScheduleSourceType.MANUAL,
        sourceOrderName: null,
        resourceKind: null,
        resourceTitle: null,
      })
    })
  })
})

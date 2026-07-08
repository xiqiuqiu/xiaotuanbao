import type { INestApplication } from '@nestjs/common'
import {
  CounterpartyType,
  DepartureStatus,
  DepartureType,
  DirectoryProfileStatus,
  ResourceKind,
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
} from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { PaymentChannel } from '@xiaotuanbao/shared'
import { authRequest, createTestApp, loginAs } from './helpers'
import { clearBusinessData, countBusinessData } from '../scripts/business-data-utils'

/**
 * 写入一套覆盖完整业务闭环的演示数据。
 * 运行：pnpm --filter api db:seed-demo-loop
 */
describe('Seed demo business loop', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let organizationId: string
  let ownerUserId: string

  let partners: {
    eastChina: { id: string; name: string }
    zhejiang: { id: string; name: string }
    suzhou: { id: string; name: string }
  }
  let suppliers: {
    scenic: { id: string; name: string }
    restaurant: { id: string; name: string }
    hotel: { id: string; name: string }
    wuzhen: { id: string; name: string }
  }

  beforeAll(async () => {
    app = await createTestApp()
    prisma = new PrismaClient()
    coordinatorToken = await loginAs(app, 'wangjie')
    financeToken = await loginAs(app, 'acai')

    const coordinator = await prisma.user.findFirst({
      where: { username: 'wangjie', deletedAt: null },
    })
    if (!coordinator) {
      throw new Error('Demo user wangjie not found')
    }

    organizationId = coordinator.organizationId
    ownerUserId = coordinator.id

    const partnerByName = async (name: string) => {
      const partner = await prisma.partner.findFirst({
        where: { organizationId, name, status: DirectoryProfileStatus.active },
      })
      if (!partner) {
        throw new Error(`Partner "${name}" not found`)
      }
      return partner
    }

    const supplierByName = async (name: string) => {
      const supplier = await prisma.supplier.findFirst({
        where: { organizationId, name, status: DirectoryProfileStatus.active },
      })
      if (!supplier) {
        throw new Error(`Supplier "${name}" not found`)
      }
      return supplier
    }

    partners = {
      eastChina: await partnerByName('华东国旅（上海）'),
      zhejiang: await partnerByName('浙旅集团杭州分公司'),
      suzhou: await partnerByName('苏州水乡地接社'),
    }
    suppliers = {
      scenic: await supplierByName('灵隐飞来峰'),
      restaurant: await supplierByName('楼外楼（孤山店）'),
      hotel: await supplierByName('黄山迎客松酒店'),
      wuzhen: await supplierByName('乌镇西栅景区'),
    }
  })

  afterAll(async () => {
    await prisma.$disconnect()
    await app.close()
  })

  it('seeds three departures covering the full finance closed loop', async () => {
    console.log('Clearing existing business data...')
    const deleted = await clearBusinessData(prisma)
    console.log('Cleared:', deleted)

    await authRequest(app, coordinatorToken)
      .post('/api/route-templates')
      .send({
        name: '杭州西湖文化2日线',
        defaultDayCount: 2,
        notes: '演示闭环：西湖环湖 + 宋城千古情',
        segments: [
          {
            sortOrder: 0,
            name: '西湖环湖',
            dayCount: 1,
            destination: '西湖',
            resources: [
              {
                resourceKind: ResourceKind.ticket,
                counterpartyType: CounterpartyType.supplier,
                supplierId: suppliers.scenic.id,
                title: '灵隐飞来峰团队票',
                amountCents: 90000,
              },
              {
                resourceKind: ResourceKind.meal,
                counterpartyType: CounterpartyType.supplier,
                supplierId: suppliers.restaurant.id,
                title: '楼外楼团队午餐',
                amountCents: 160000,
              },
            ],
          },
          {
            sortOrder: 1,
            name: '宋城千古情',
            dayCount: 1,
            destination: '宋城',
            resources: [],
          },
        ],
      })
      .expect(201)

    // ── 发团 1：完整闭环（登记收/付款 → 已结清） ──
    const hangzhou = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name: '杭州西湖文化2日线 9月1日团',
        routeName: '杭州西湖文化2日线',
        startDate: '2026-09-01',
        endDate: '2026-09-02',
        ownerUserId,
        departureType: DepartureType.independent,
        notes: '演示：应收应付全部结清，可走发团状态 → 已结清',
      })
      .expect(201)

    const hangzhouSourceOrder = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${hangzhou.body.data.id}/source-orders`)
      .send({
        partnerId: partners.eastChina.id,
        guestCount: 20,
        unitPriceCents: 68000,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.guest_only,
      })
      .expect(201)

    const hangzhouSegment = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${hangzhou.body.data.id}/segments`)
      .send({
        name: '西湖环湖',
        startDate: '2026-09-01',
        endDate: '2026-09-01',
        destination: '西湖',
      })
      .expect(201)

    const hangzhouScenicResource = await authRequest(app, coordinatorToken)
      .post(`/api/segments/${hangzhouSegment.body.data.id}/resources`)
      .send({
        resourceKind: ResourceKind.ticket,
        supplierId: suppliers.scenic.id,
        title: '灵隐飞来峰团队票',
        amountCents: 90000,
      })
      .expect(201)

    const hangzhouMealResource = await authRequest(app, coordinatorToken)
      .post(`/api/segments/${hangzhouSegment.body.data.id}/resources`)
      .send({
        resourceKind: ResourceKind.meal,
        supplierId: suppliers.restaurant.id,
        title: '楼外楼团队午餐',
        amountCents: 160000,
      })
      .expect(201)

    const hangzhouReceivables = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${hangzhouSourceOrder.body.data.id}/generate-receivables`)
      .expect(201)
    const hangzhouScenicPayable = await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${hangzhouScenicResource.body.data.id}/generate-payable`)
      .expect(201)
    const hangzhouMealPayable = await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${hangzhouMealResource.body.data.id}/generate-payable`)
      .expect(201)

    const hangzhouReceivableId = hangzhouReceivables.body.data.schedules[0].id as string
    const hangzhouScenicPayableId = hangzhouScenicPayable.body.data.schedule.id as string
    const hangzhouMealPayableId = hangzhouMealPayable.body.data.schedule.id as string

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${hangzhouReceivableId}/confirm-collection`)
      .send({
        amountCents: 1360000,
        transactionDate: '2026-09-01',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.guest,
        counterpartyName: hangzhouSourceOrder.body.data.displayName,
      })
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/payables/${hangzhouScenicPayableId}/confirm-payment`)
      .send({
        amountCents: 90000,
        transactionDate: '2026-09-01',
        paymentChannel: PaymentChannel.WECHAT,
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: suppliers.scenic.id,
      })
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/payables/${hangzhouMealPayableId}/confirm-payment`)
      .send({
        amountCents: 160000,
        transactionDate: '2026-09-01',
        paymentChannel: PaymentChannel.CASH,
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: suppliers.restaurant.id,
      })
      .expect(201)

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${hangzhou.body.data.id}/transition`)
      .send({ targetStatus: DepartureStatus.pending_settlement })
      .expect(201)

    const hangzhouSettled = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${hangzhou.body.data.id}/transition`)
      .send({ targetStatus: DepartureStatus.settled })
      .expect(201)

    console.log(
      `Departure 1: ${hangzhouSettled.body.data.departureNo} — ${hangzhouSettled.body.data.name} [${hangzhouSettled.body.data.status}]`,
    )

    // ── 发团 2：部分收款 + 预置流水待匹配 ──
    const huangshan = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name: '黄山徽州3日线 9月10日团',
        routeName: '黄山徽州3日线',
        startDate: '2026-09-10',
        endDate: '2026-09-12',
        ownerUserId,
        departureType: DepartureType.combined,
        notes: '演示：部分收款 + 匹配流水（预置未核销流水）',
      })
      .expect(201)

    const huangshanSourceOrder = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${huangshan.body.data.id}/source-orders`)
      .send({
        partnerId: partners.zhejiang.id,
        guestCount: 18,
        unitPriceCents: 128000,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.partner_settled,
      })
      .expect(201)

    const huangshanSegment = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${huangshan.body.data.id}/segments`)
      .send({
        name: '黄山登山',
        startDate: '2026-09-10',
        endDate: '2026-09-11',
        destination: '黄山',
      })
      .expect(201)

    const huangshanHotelResource = await authRequest(app, coordinatorToken)
      .post(`/api/segments/${huangshanSegment.body.data.id}/resources`)
      .send({
        resourceKind: ResourceKind.hotel,
        supplierId: suppliers.hotel.id,
        title: '黄山迎客松酒店',
        amountCents: 52000,
      })
      .expect(201)

    const huangshanReceivables = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${huangshanSourceOrder.body.data.id}/generate-receivables`)
      .expect(201)
    const huangshanPayable = await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${huangshanHotelResource.body.data.id}/generate-payable`)
      .expect(201)

    const huangshanReceivableId = huangshanReceivables.body.data.schedules[0].id as string

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${huangshanReceivableId}/confirm-collection`)
      .send({
        amountCents: 1500000,
        transactionDate: '2026-09-10',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.partner,
        counterpartyId: partners.zhejiang.id,
      })
      .expect(201)

    await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .send({
        direction: 'inflow',
        paymentChannel: PaymentChannel.WECHAT,
        amountCents: 804000,
        transactionDate: '2026-09-11',
        counterpartyType: CounterpartyType.partner,
        counterpartyId: partners.zhejiang.id,
        departureId: huangshan.body.data.id,
        notes: '演示：待匹配至黄山团应收尾款',
      })
      .expect(201)

    await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .send({
        direction: 'outflow',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        amountCents: 52000,
        transactionDate: '2026-09-12',
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: suppliers.hotel.id,
        departureId: huangshan.body.data.id,
        notes: '演示：待匹配至黄山酒店应付',
      })
      .expect(201)

    const huangshanPending = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${huangshan.body.data.id}/transition`)
      .send({ targetStatus: DepartureStatus.pending_settlement })
      .expect(201)

    console.log(
      `Departure 2: ${huangshanPending.body.data.departureNo} — ${huangshanPending.body.data.name} [${huangshanPending.body.data.status}]`,
    )
    console.log(
      `  AR ${huangshanReceivables.body.data.schedules[0].scheduleNo}: partial 1500000/2304000, TX 804000 ready to link`,
    )
    console.log(`  AP ${huangshanPayable.body.data.schedule.scheduleNo}: TX 52000 ready to link`)

    // ── 发团 3：仅运营数据，财务未触发 ──
    const wuzhen = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name: '乌镇西栅2日线 10月1日团',
        routeName: '乌镇西栅2日线',
        startDate: '2026-10-01',
        endDate: '2026-10-02',
        ownerUserId,
        departureType: DepartureType.combined,
        notes: '演示：编辑中，可手动触发「生成应收/应付」',
      })
      .expect(201)

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${wuzhen.body.data.id}/source-orders`)
      .send({
        partnerId: partners.suzhou.id,
        guestCount: 25,
        unitPriceCents: 98000,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.guest_only,
      })
      .expect(201)

    const wuzhenSegment = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${wuzhen.body.data.id}/segments`)
      .send({
        name: '西栅夜游',
        startDate: '2026-10-01',
        endDate: '2026-10-01',
        destination: '乌镇西栅',
      })
      .expect(201)

    await authRequest(app, coordinatorToken)
      .post(`/api/segments/${wuzhenSegment.body.data.id}/resources`)
      .send({
        resourceKind: ResourceKind.ticket,
        supplierId: suppliers.wuzhen.id,
        title: '西栅团队票',
        amountCents: 300000,
      })
      .expect(201)

    console.log(
      `Departure 3: ${wuzhen.body.data.departureNo} — ${wuzhen.body.data.name} [editing]`,
    )

    const after = await countBusinessData(prisma)
    console.log('Final counts:', after)
    console.log('Demo accounts: coordinator wangjie / finance acai (password: admin123)')

    expect(after.departures).toBe(3)
    expect(after.financeVerifications).toBe(4)
    expect(after.financeTransactions).toBe(6)
    expect(after.paymentSchedules).toBe(5)
  })
})

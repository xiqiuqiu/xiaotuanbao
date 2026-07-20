import type { INestApplication } from '@nestjs/common'
import {
  CounterpartyType,
  DirectoryProfileStatus,
  ResourceKind,
} from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { authRequest, createTestApp, loginAs, uniqueBusinessPrefix } from './helpers'

/**
 * 供应商往来账款 Tab（财务账款层）e2e：仅应付方向，按 counterpartyType=supplier
 * + counterpartyId 精确过滤，镜像 Partner 版但无应收端点。
 */
describe('Supplier ledger payables API (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let organizationId: string
  let ownerUserId: string
  let supplierId: string
  // S2 名称含 S1 名称前缀，验证精确过滤不串账
  let similarNameSupplierId: string
  let departureId: string
  let julyDepartureId: string
  const testPrefix = `e2e-supplier-ledger-${Date.now()}`

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

    const supplier = await prisma.supplier.create({
      data: {
        organizationId,
        name: `${testPrefix}-西湖国宾馆`,
        categories: [ResourceKind.hotel],
        status: DirectoryProfileStatus.active,
      },
    })
    supplierId = supplier.id

    const similarNameSupplier = await prisma.supplier.create({
      data: {
        organizationId,
        name: `${testPrefix}-西湖国宾馆东楼`,
        categories: [ResourceKind.hotel],
        status: DirectoryProfileStatus.active,
      },
    })
    similarNameSupplierId = similarNameSupplier.id

    const juneDeparture = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name: `${testPrefix}-d1-june`,
        routeName: '喀纳斯阿勒泰10日线',
        startDate: '2026-06-10',
        endDate: '2026-06-14',
        ownerUserId,
      })
      .expect(201)
    departureId = juneDeparture.body.data.id as string

    const julyDeparture = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name: `${testPrefix}-d2-july`,
        routeName: '吐鲁番3日线',
        startDate: '2026-07-05',
        endDate: '2026-07-07',
        ownerUserId,
      })
      .expect(201)
    julyDepartureId = julyDeparture.body.data.id as string

    // S1 6 月手工应付 50000（有效）
    await createSupplierPayable(departureId, 'p1-june', 50000, supplierId, `${testPrefix}-西湖国宾馆`)
    // S1 7 月手工应付 80000（有效）
    await createSupplierPayable(
      julyDepartureId,
      'p2-july',
      80000,
      supplierId,
      `${testPrefix}-西湖国宾馆`,
    )
    // S1 6 月手工应付 40000 → 关闭（cancelled 不计入汇总，但列表仍展示）
    const closed = await createSupplierPayable(
      departureId,
      'p3-june-closed',
      40000,
      supplierId,
      `${testPrefix}-西湖国宾馆`,
    )
    await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${closed}/cancel`)
      .send({ closeDisposition: 'other', cancelReason: '测试关闭：不计入汇总' })
      .expect(201)

    // S2（同名前缀干扰）6 月手工应付 70000
    await createSupplierPayable(
      departureId,
      's2-payable',
      70000,
      similarNameSupplierId,
      `${testPrefix}-西湖国宾馆东楼`,
    )
  })

  async function createSupplierPayable(
    depId: string,
    titleSuffix: string,
    amountCents: number,
    counterpartyId: string,
    counterpartyName: string,
  ): Promise<string> {
    const response = await authRequest(app, financeToken)
      .post('/api/finance/payables')
      .send({
        departureId: depId,
        title: `${testPrefix}-${titleSuffix}`,
        amountCents,
        dueDate: '2026-06-20',
        counterpartyType: CounterpartyType.supplier,
        counterpartyId,
        counterpartyName,
      })
      .expect(201)
    return response.body.data.id as string
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
      where: { organizationId, departure: { name: { startsWith: testPrefix } } },
    })
    await prisma.paymentSchedule.deleteMany({
      where: { organizationId, departure: { name: { startsWith: testPrefix } } },
    })
    await prisma.departure.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.supplier.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.$disconnect()
    await app.close()
  })

  it('rejects users without /supplier menu permission', async () => {
    const { hash } = await import('bcryptjs')
    const password = 'admin123'
    const username = `${testPrefix}-noperm`
    const user = await prisma.user.create({
      data: {
        organizationId,
        username,
        passwordHash: await hash(password, 10),
        name: '无供应商权限用户',
      },
    })

    const token = await loginAs(app, username, password)
    const payablesResponse = await authRequest(app, token)
      .get(`/api/suppliers/${supplierId}/payables`)
      .expect(403)
    expect(payablesResponse.body.message).toBe('无权访问')

    const summaryResponse = await authRequest(app, token)
      .get(`/api/suppliers/${supplierId}/payment-schedule-summary`)
      .expect(403)
    expect(summaryResponse.body.message).toBe('无权访问')

    await prisma.user.delete({ where: { id: user.id } })
  })

  it('allows finance role under ADR-0016 early-launch menus', async () => {
    await authRequest(app, financeToken)
      .get(`/api/suppliers/${supplierId}/payables`)
      .expect(200)
    await authRequest(app, financeToken)
      .get(`/api/suppliers/${supplierId}/payment-schedule-summary`)
      .expect(200)
  })

  it('has no receivables endpoint for suppliers (payables only)', async () => {
    await authRequest(app, coordinatorToken)
      .get(`/api/suppliers/${supplierId}/receivables`)
      .expect(404)
  })

  it('returns 404 for unknown supplier', async () => {
    const payables = await authRequest(app, coordinatorToken)
      .get('/api/suppliers/nonexistent-supplier-id/payables')
      .expect(404)
    expect(payables.body.message).toBe('供应商不存在')

    await authRequest(app, coordinatorToken)
      .get('/api/suppliers/nonexistent-supplier-id/payment-schedule-summary')
      .expect(404)
  })

  it('returns 404 for supplier in another organization', async () => {
    const otherOrg = await prisma.organization.create({
      data: {
        name: `${testPrefix}-other-org`,
        businessPrefix: uniqueBusinessPrefix(testPrefix),
      },
    })
    const foreignSupplier = await prisma.supplier.create({
      data: {
        organizationId: otherOrg.id,
        name: `${testPrefix}-foreign`,
        categories: [ResourceKind.hotel],
        status: DirectoryProfileStatus.active,
      },
    })

    await authRequest(app, coordinatorToken)
      .get(`/api/suppliers/${foreignSupplier.id}/payables`)
      .expect(404)
    await authRequest(app, coordinatorToken)
      .get(`/api/suppliers/${foreignSupplier.id}/payment-schedule-summary`)
      .expect(404)

    await prisma.supplier.delete({ where: { id: foreignSupplier.id } })
    await prisma.organization.delete({ where: { id: otherOrg.id } })
  })

  it('lists only payables anchored to the exact supplier', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get(`/api/suppliers/${supplierId}/payables`)
      .expect(200)

    const data = response.body.data
    // S1：3 张应付（含已关闭），S2 的 70000 不串
    expect(data.total).toBe(3)
    for (const item of data.items) {
      expect(item.counterpartyType).toBe(CounterpartyType.supplier)
      expect(item.counterpartyId).toBe(supplierId)
    }
    const amounts = data.items
      .map((item: { amountCents: number }) => item.amountCents)
      .sort((a: number, b: number) => a - b)
    expect(amounts).toEqual([40000, 50000, 80000])
  })

  it('does not leak nodes of a supplier whose name contains the target name', async () => {
    const [s1Response, s2Response] = await Promise.all([
      authRequest(app, coordinatorToken)
        .get(`/api/suppliers/${supplierId}/payables`)
        .expect(200),
      authRequest(app, coordinatorToken)
        .get(`/api/suppliers/${similarNameSupplierId}/payables`)
        .expect(200),
    ])

    const s1Ids = new Set(
      s1Response.body.data.items.map((item: { counterpartyId: string }) => item.counterpartyId),
    )
    const s2Ids = s2Response.body.data.items.map(
      (item: { counterpartyId: string }) => item.counterpartyId,
    )
    expect([...s1Ids]).toEqual([supplierId])
    expect(s2Ids).toEqual([similarNameSupplierId])
    expect(s2Response.body.data.total).toBe(1)
    expect(s2Response.body.data.items[0]).toMatchObject({ amountCents: 70000 })
  })

  it('ignores counterparty overrides from the query string', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get(`/api/suppliers/${supplierId}/payables`)
      .query({ counterpartyId: similarNameSupplierId })
      .expect(200)

    for (const item of response.body.data.items) {
      expect(item.counterpartyId).toBe(supplierId)
    }
    expect(response.body.data.total).toBe(3)
  })

  it('filters payables by departure start date', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get(`/api/suppliers/${supplierId}/payables`)
      .query({ departureDateFrom: '2026-07-01', departureDateTo: '2026-07-31' })
      .expect(200)

    const data = response.body.data
    expect(data.total).toBe(1)
    expect(data.items[0]).toMatchObject({
      amountCents: 80000,
      departureId: julyDepartureId,
    })
  })

  it('rejects invalid range (from after to)', async () => {
    await authRequest(app, coordinatorToken)
      .get(`/api/suppliers/${supplierId}/payables`)
      .query({ departureDateFrom: '2026-08-01', departureDateTo: '2026-07-01' })
      .expect(400)
  })

  describe('payment schedule summary aggregation', () => {
    type AggregateGroup = {
      direction: string
      sourceType: string
      count: number
      amountCents: number
      settledAmountCents: number
      unsettledAmountCents: number
    }

    it('aggregates payables only, excluding cancelled nodes', async () => {
      const response = await authRequest(app, coordinatorToken)
        .get(`/api/suppliers/${supplierId}/payment-schedule-summary`)
        .expect(200)

      const groups = response.body.data.groups as AggregateGroup[]
      // 仅应付方向
      for (const group of groups) {
        expect(group.direction).toBe('payable')
      }
      // 手工应付：50000（6 月）＋80000（7 月）＝130000；已关闭 40000 不计入
      const manual = groups.find(
        (group) => group.direction === 'payable' && group.sourceType === 'manual',
      )
      expect(manual).toMatchObject({
        count: 2,
        amountCents: 130000,
        settledAmountCents: 0,
        unsettledAmountCents: 130000,
      })
    })

    it('follows the departure date range filter', async () => {
      const response = await authRequest(app, coordinatorToken)
        .get(`/api/suppliers/${supplierId}/payment-schedule-summary`)
        .query({ departureDateFrom: '2026-06-01', departureDateTo: '2026-06-30' })
        .expect(200)

      const groups = response.body.data.groups as AggregateGroup[]
      const manual = groups.find(
        (group) => group.direction === 'payable' && group.sourceType === 'manual',
      )
      // 6 月唯一有效手工应付 50000；已关闭 40000 不计入
      expect(manual).toMatchObject({ count: 1, amountCents: 50000 })
    })
  })
})

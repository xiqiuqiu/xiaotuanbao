import { Test, type TestingModule } from '@nestjs/testing'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../src/database/prisma/prisma.service'
import { AuthService } from '../src/modules/auth/auth.service'
import { NumberAllocationService } from '../src/modules/number-allocation/number-allocation.service'
import { DepartureFinanceFacade } from '../src/modules/finance/departure-finance-facade.service'
import { DepartureFinanceGenerationService } from '../src/modules/finance/departure-finance-generation.service'
import { DepartureFinanceActualCollectionService } from '../src/modules/finance/departure-finance-actual-collection.service'
import { PaymentScheduleService } from '../src/modules/finance/payment-schedule.service'
import { VerificationService } from '../src/modules/finance/verification.service'
import { SegmentResourceService } from '../src/modules/departure/segment-resource.service'
import { DepartureResourceService } from '../src/modules/departure/departure-resource.service'
import { SourceOrderService } from '../src/modules/departure/source-order.service'
import { TransactionService } from '../src/modules/finance/transaction.service'
import { ReviewCollaborationService } from '../src/modules/ai-create-task/review-collaboration.service'

// 独立测试组织；真实 PostgreSQL 事务与财务服务，不启动 Worker，也不清理其他组织。
describe('resource convention transactions', () => {
  let module: TestingModule
  let prisma: PrismaService
  let finance: DepartureFinanceFacade
  let generation: DepartureFinanceGenerationService
  let organizationId: string
  let ownerId: string
  let supplierId: string

  beforeAll(async () => {
    module = await Test.createTestingModule({ providers: [
      PrismaService, NumberAllocationService, DepartureFinanceFacade,
      DepartureFinanceGenerationService, PaymentScheduleService, VerificationService,
      SegmentResourceService, DepartureResourceService, SourceOrderService, TransactionService,
      { provide: AuthService, useValue: {} },
      { provide: DepartureFinanceActualCollectionService, useValue: {} },
    ] }).compile()
    prisma = module.get(PrismaService)
    finance = module.get(DepartureFinanceFacade)
    generation = module.get(DepartureFinanceGenerationService)
    const prefix = randomUUID().replace(/[^a-f]/g, '').slice(0, 4).toUpperCase()
    const organization = await prisma.organization.create({ data: {
      name: `resource-convention-${randomUUID()}`, businessPrefix: prefix,
    } })
    organizationId = organization.id
    const owner = await prisma.user.create({ data: {
      organizationId, username: `convention-${randomUUID()}`, name: '回归测试', passwordHash: 'unused',
    } })
    ownerId = owner.id
    supplierId = (await prisma.supplier.create({ data: {
      organizationId, name: '约定测试供应商', categories: ['hotel'],
    } })).id
  })

  afterEach(() => jest.restoreAllMocks())
  afterAll(async () => {
    if (organizationId) {
      await prisma.aiReviewPackage.deleteMany({ where: { organizationId } })
      await prisma.financeVerification.deleteMany({ where: { organizationId } })
      await prisma.paymentScheduleActivity.deleteMany({ where: { organizationId } })
      await prisma.paymentSchedule.deleteMany({ where: { organizationId } })
      await prisma.financeTransaction.deleteMany({ where: { organizationId } })
      await prisma.departure.deleteMany({ where: { organizationId } })
      await prisma.supplier.deleteMany({ where: { organizationId } })
      await prisma.partner.deleteMany({ where: { organizationId } })
      await prisma.documentSequence.deleteMany({ where: { organizationId } })
      await prisma.user.deleteMany({ where: { organizationId } })
      await prisma.organization.delete({ where: { id: organizationId } })
    }
    await module?.close()
  })

  async function fixture(sourceType: 'segment_resource' | 'departure_resource') {
    const departure = await prisma.departure.create({ data: {
      organizationId, ownerUserId: ownerId, departureNo: randomUUID(), name: '约定测试团',
      routeName: '测试', startDate: new Date('2026-09-01'), endDate: new Date('2026-09-10'), dayCount: 10,
    } })
    const data = { title: '住宿', amountCents: 10000, resourceKind: 'hotel' as const,
      counterpartyType: 'supplier' as const, supplierId }
    const segment = await prisma.itinerarySegment.create({ data: { departureId: departure.id, name: '第一天', sortOrder: 0 } })
    const resource = sourceType === 'departure_resource'
      ? await prisma.departureResource.create({ data: { ...data, departureId: departure.id } })
      : await prisma.segmentResource.create({ data: { ...data, segmentId: segment.id } })
    const source = { sourceType, sourceId: resource.id }
    return { departure, resource, source }
  }

  it.each(['segment_resource', 'departure_resource'] as const)(
    'keeps the reviewed due date stable through the real %s write path', async (sourceType) => {
      const { departure, resource, source } = await fixture(sourceType)
      const pkg = await prisma.aiReviewPackage.create({ data: {
        organizationId, baseObjectVersion: departure.updatedAt.getTime(), targetId: departure.id,
        payloadSchema: 'resource.payable@v1', confirmationUnit: 'resource_payable', candidates: [],
        baselineSnapshot: { ...source, amountCents: resource.amountCents, supplierId, partnerId: null,
          resourceKind: 'hotel', title: resource.title, endDate: '2026-09-10' },
      } })
      const preview = generation.previewInitialPayable.bind(generation)
      let rivalError: unknown
      jest.spyOn(generation, 'previewInitialPayable').mockImplementationOnce(async (...args) => {
        const value = await preview(...args)
        // 确定插入在基线读取和生成之间；旧实现会让此修改成功并使用未审核日期。
        try {
          await prisma.$transaction(async (rival) => {
            await rival.$executeRaw`SET LOCAL lock_timeout = '200ms'`
            await rival.departure.update({ where: { id: departure.id }, data: { endDate: new Date('2026-09-12') } })
          })
        } catch (error) { rivalError = error }
        return value
      })
      const writer = Object.assign(Object.create(ReviewCollaborationService.prototype), { finance, generation }) as ReviewCollaborationService
      const result = await prisma.$transaction((tx) => writer['writeConfirmedResourcePayable'](tx, organizationId, pkg))
      const schedule = await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: result.scheduleIds[0] } })
      expect(schedule.dueDate.toISOString().slice(0, 10)).toBe('2026-09-10')
      expect(rivalError).toBeDefined()
      expect((await prisma.departure.findUniqueOrThrow({ where: { id: departure.id } })).endDate).toEqual(departure.endDate)
    },
  )

  it.each(['segment_resource', 'departure_resource'] as const)(
    'rolls back both %s and its payable if synchronization fails after the schedule write', async (sourceType) => {
      const { resource, source } = await fixture(sourceType)
      const generated = await finance.generateResourcePayable(organizationId, source)
      const schedules = module.get(PaymentScheduleService)
      const update = schedules.update.bind(schedules)
      jest.spyOn(schedules, 'update').mockImplementationOnce(async (...args) => {
        await update(...args)
        throw new Error('injected sync failure after write')
      })
      const resources = sourceType === 'segment_resource'
        ? module.get(SegmentResourceService) : module.get(DepartureResourceService)
      await expect(resources.update(organizationId, resource.id, { amountCents: 20000 }))
        .rejects.toThrow('injected sync failure')
      const stored = sourceType === 'segment_resource'
        ? await prisma.segmentResource.findUniqueOrThrow({ where: { id: resource.id } })
        : await prisma.departureResource.findUniqueOrThrow({ where: { id: resource.id } })
      const schedule = await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: generated.schedule.id } })
      expect({ resource: stored.amountCents, payable: schedule.amountCents }).toEqual({ resource: 10000, payable: 10000 })
    },
  )
  it.each(['segment_resource', 'departure_resource'] as const)(
    'commits %s and its payable together, and rejects edits during or after payment', async (sourceType) => {
      const { departure, resource, source } = await fixture(sourceType)
      const generated = await finance.generateResourcePayable(organizationId, source)
      const resources = sourceType === 'segment_resource'
        ? module.get(SegmentResourceService) : module.get(DepartureResourceService)
      const updated = await resources.update(organizationId, resource.id, { amountCents: 20000 })
      expect(updated.amountCents).toBe(20000)
      expect((await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: generated.schedule.id } })).amountCents).toBe(20000)
      const transaction = await prisma.financeTransaction.create({ data: {
        organizationId, departureId: departure.id, transactionNo: randomUUID(), direction: 'outflow',
        amountCents: 1000, transactionDate: new Date('2026-09-10'),
        counterpartyType: 'supplier', counterpartyId: supplierId,
      } })
      await prisma.$transaction(async (rival) => {
        await rival.$queryRaw`SELECT id FROM payment_schedules WHERE id = ${generated.schedule.id} FOR UPDATE`
        await expect(resources.update(organizationId, resource.id, { amountCents: 30000 }))
          .rejects.toThrow('资源约定正在修改或结算')
        await module.get(VerificationService).create(organizationId, {
          paymentScheduleId: generated.schedule.id, transactionId: transaction.id, amountCents: 1000,
          verificationDate: '2026-09-10',
        }, { createdBy: ownerId }, rival)
      })
      await expect(resources.update(organizationId, resource.id, { amountCents: 30000 }))
        .rejects.toThrow('当前资源已发生付款')
      const stored = sourceType === 'segment_resource'
        ? await prisma.segmentResource.findUniqueOrThrow({ where: { id: resource.id } })
        : await prisma.departureResource.findUniqueOrThrow({ where: { id: resource.id } })
      expect(stored.amountCents).toBe(20000)
    },
  )

  it.each(['segment_resource', 'departure_resource'] as const)(
    'serializes deleting %s with payable generation', async (sourceType) => {
      const { resource, source } = await fixture(sourceType)
      const resources = sourceType === 'segment_resource'
        ? module.get(SegmentResourceService) : module.get(DepartureResourceService)
      const presence = finance.getResourceFinancePresence.bind(finance)
      let rivalError: unknown
      jest.spyOn(finance, 'getResourceFinancePresence').mockImplementationOnce(async (...args) => {
        const result = await presence(...args)
        try {
          await prisma.$transaction(async (rival) => {
            await rival.$executeRaw`SET LOCAL lock_timeout = '200ms'`
            await generation.generateResourcePayable(organizationId, source,
              (departure, action) => finance.assertAllowsNewObligation(departure, action), { client: rival })
          })
        } catch (error) { rivalError = error }
        return result
      })
      await resources.remove(organizationId, resource.id)
      expect(await prisma.paymentSchedule.count({ where: { organizationId, sourceId: resource.id } })).toBe(0)
      expect(rivalError).toBeDefined()
      await expect(finance.generateResourcePayable(organizationId, source)).rejects.toThrow('资源不存在')
    },
  )

  async function sourceOrderFixture() {
    const { departure } = await fixture('departure_resource')
    const partner = await prisma.partner.create({ data: {
      organizationId, name: `客源测试-${randomUUID()}`, partnerKind: 'group_agent', partnerType: 'group_agency',
    } })
    const orders = module.get(SourceOrderService)
    const order = await orders.create(organizationId, departure.id, {
      partnerId: partner.id, adultGuestCount: 1, childGuestCount: 0, adultUnitPriceCents: 10000,
      discountType: 'none', collectionMode: 'guest_only', depositCents: 4000, balanceCents: 6000,
    })
    const generated = await generation.generateReceivableSchedules(organizationId, order.id,
      (value, action) => finance.assertAllowsNewObligation(value, action))
    expect(generated.schedules).toHaveLength(2)
    return { orders, order, generated, departure, partner }
  }

  it('rolls back the source order and all receivable paths if the second write fails', async () => {
    const { orders, order, generated } = await sourceOrderFixture()
    const schedules = module.get(PaymentScheduleService)
    const update = schedules.update.bind(schedules)
    let writes = 0
    jest.spyOn(schedules, 'update').mockImplementation(async (...args) => {
      const result = await update(...args)
      if (++writes === 2) throw new Error('injected second receivable failure')
      return result
    })
    await expect(orders.update(organizationId, order.id, { depositCents: 5000, balanceCents: 5000 }))
      .rejects.toThrow('injected second receivable failure')
    const stored = await prisma.sourceOrder.findUniqueOrThrow({ where: { id: order.id } })
    expect([stored.depositCents, stored.balanceCents]).toEqual([4000, 6000])
    for (const before of generated.schedules) {
      expect((await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: before.id } })).amountCents).toBe(before.amountCents)
    }
  })

  it('rolls back path closures and the source when creating the replacement path fails', async () => {
    const { orders, order, generated } = await sourceOrderFixture()
    const schedules = module.get(PaymentScheduleService)
    const create = schedules.create.bind(schedules)
    jest.spyOn(schedules, 'create').mockImplementationOnce(async (...args) => {
      await create(...args)
      throw new Error('injected replacement failure')
    })
    await expect(orders.update(organizationId, order.id, { collectionMode: 'partner_settled' }))
      .rejects.toThrow('injected replacement failure')
    expect((await prisma.sourceOrder.findUniqueOrThrow({ where: { id: order.id } })).collectionMode).toBe('guest_only')
    const stored = await prisma.paymentSchedule.findMany({ where: { organizationId, sourceId: order.id } })
    expect(stored.map((row) => row.id).sort()).toEqual(generated.schedules.map((row) => row.id).sort())
    expect(stored.every((row) => row.cancelledAt === null)).toBe(true)
  })

  it('commits receivable changes together and blocks edits during or after collection', async () => {
    const { orders, order, generated, departure } = await sourceOrderFixture()
    const updated = await orders.update(organizationId, order.id, { depositCents: 5000, balanceCents: 5000 })
    expect([updated.depositCents, updated.balanceCents, updated.hasSourceAmountMismatch]).toEqual([5000, 5000, false])
    const schedule = await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: generated.schedules[0].id } })
    expect(schedule.amountCents).toBe(5000)
    const transaction = await prisma.financeTransaction.create({ data: {
      organizationId, departureId: departure.id, transactionNo: randomUUID(), direction: 'inflow',
      amountCents: 1000, transactionDate: new Date('2026-09-10'),
      counterpartyType: schedule.counterpartyType, counterpartyId: schedule.counterpartyId,
      counterpartyName: schedule.counterpartyName,
    } })
    await prisma.$transaction(async (rival) => {
      await rival.$queryRaw`SELECT id FROM payment_schedules WHERE id = ${schedule.id} FOR UPDATE`
      await expect(orders.update(organizationId, order.id, { depositCents: 6000, balanceCents: 4000 }))
        .rejects.toThrow('客源约定正在修改或结算')
      await module.get(VerificationService).create(organizationId, {
        paymentScheduleId: schedule.id, transactionId: transaction.id, amountCents: 1000, verificationDate: '2026-09-10',
      }, { createdBy: ownerId }, rival)
    })
    await expect(orders.update(organizationId, order.id, { depositCents: 6000, balanceCents: 4000 }))
      .rejects.toThrow('当前客源单已发生收款')
    expect((await prisma.sourceOrder.findUniqueOrThrow({ where: { id: order.id } })).depositCents).toBe(5000)
  })

})

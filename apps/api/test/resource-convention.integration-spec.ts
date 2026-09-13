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
      SegmentResourceService, DepartureResourceService,
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
})

import { Test } from '@nestjs/testing'
import { DocumentSequenceType, PaymentScheduleDirection, PrismaClient } from '@prisma/client'
import { PrismaModule } from '../src/database/prisma/prisma.module'
import { getShanghaiTodayString, getShanghaiYearMonthString } from '../src/modules/departure/departure-date.utils'
import { NumberAllocationModule } from '../src/modules/number-allocation/number-allocation.module'
import { NumberAllocationService } from '../src/modules/number-allocation/number-allocation.service'

describe('NumberAllocationService (integration)', () => {
  let service: NumberAllocationService
  let prisma: PrismaClient
  let organizationId: string
  const testPrefix = `XT${String.fromCharCode(65 + (Date.now() % 23))}`

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, NumberAllocationModule],
    }).compile()

    service = moduleRef.get(NumberAllocationService)
    prisma = new PrismaClient()

    const organization = await prisma.organization.create({
      data: {
        name: `number-allocation-test-${testPrefix}`,
        businessPrefix: testPrefix,
      },
    })
    organizationId = organization.id
  })

  afterAll(async () => {
    await prisma.documentSequence.deleteMany({ where: { organizationId } })
    await prisma.organization.delete({ where: { id: organizationId } })
    await prisma.$disconnect()
  })

  afterEach(async () => {
    await prisma.documentSequence.deleteMany({ where: { organizationId } })
  })

  it('formats departure numbers for current Shanghai month', async () => {
    const periodKey = getShanghaiYearMonthString()
    const departureNo = await service.allocateDepartureNo(organizationId)

    expect(departureNo).toBe(`${testPrefix}${periodKey}0001`)
    expect(departureNo).toMatch(/^[A-Z]{2,4}\d{6}\d{4}$/)
  })

  it('increments within the same period', async () => {
    const periodKey = getShanghaiYearMonthString()
    const first = await service.allocateDepartureNo(organizationId)
    const second = await service.allocateDepartureNo(organizationId)

    expect(first).toBe(`${testPrefix}${periodKey}0001`)
    expect(second).toBe(`${testPrefix}${periodKey}0002`)
  })

  it('resets sequence across periods', async () => {
    const currentPeriod = getShanghaiYearMonthString()
    const otherPeriod = currentPeriod === '202601' ? '202602' : '202601'
    await prisma.documentSequence.create({
      data: {
        organizationId,
        documentType: DocumentSequenceType.departure,
        periodKey: otherPeriod,
        lastSequence: 7,
      },
    })

    const currentNo = await service.allocateDepartureNo(organizationId)
    expect(currentNo).toBe(`${testPrefix}${currentPeriod}0001`)
  })

  it('allocates finance numbers with correct prefixes', async () => {
    const monthKey = getShanghaiYearMonthString()
    const dayKey = getShanghaiTodayString().replace(/-/g, '')

    const arNo = await service.allocateScheduleNo(
      organizationId,
      PaymentScheduleDirection.receivable,
    )
    const apNo = await service.allocateScheduleNo(
      organizationId,
      PaymentScheduleDirection.payable,
    )
    const txNo = await service.allocateTransactionNo(organizationId)
    const clNo = await service.allocateVerificationNo(organizationId)

    expect(arNo).toBe(`AR${testPrefix}${monthKey}000001`)
    expect(apNo).toBe(`AP${testPrefix}${monthKey}000001`)
    expect(txNo).toBe(`TX${testPrefix}${dayKey}000001`)
    expect(clNo).toBe(`CL${testPrefix}${monthKey}000001`)
  })

  it('does not duplicate numbers under concurrent allocation', async () => {
    const concurrency = 20
    const results = await Promise.all(
      Array.from({ length: concurrency }, () => service.allocateDepartureNo(organizationId)),
    )

    expect(new Set(results).size).toBe(concurrency)
    results.forEach((no) => {
      expect(no).toMatch(new RegExp(`^${testPrefix}${getShanghaiYearMonthString()}\\d{4}$`))
    })
  })
})

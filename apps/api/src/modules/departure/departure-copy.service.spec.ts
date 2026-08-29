import { BadRequestException } from '@nestjs/common'
import { CounterpartyType, ResourceKind } from '@prisma/client'
import { DepartureCopyService } from './departure-copy.service'

describe('DepartureCopyService.copyToDeparture', () => {
  function buildService(sourceSegments: Array<{
    id: string
    name: string
    sortOrder: number
    dayCount: number | null
    destination: string | null
    notes: string | null
    resources: Array<{
      resourceKind: string
      counterpartyType: string
      partnerId: string | null
      supplierId: string | null
      title: string
      amountCents: number
      notes: string | null
    }>
  }>) {
    const createdSegments: unknown[] = []
    const createdResources: unknown[] = []

    const prisma = {
      departure: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'source-dep',
          organizationId: 'org-1',
          itinerarySegments: sourceSegments,
        }),
      },
    }

    const tx = {
      itinerarySegment: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          createdSegments.push(data)
          return { id: `seg-${createdSegments.length}`, ...data }
        }),
      },
      segmentResource: {
        createMany: jest.fn().mockImplementation(async ({ data }) => {
          createdResources.push(...data)
          return { count: data.length }
        }),
      },
    }

    const service = new DepartureCopyService(prisma as never, {} as never)
    return { service, tx, createdSegments, createdResources }
  }

  const datedSegment = {
    id: 'seg-dated',
    name: '有日期段',
    sortOrder: 0,
    dayCount: 3,
    destination: '喀纳斯',
    notes: null,
    resources: [] as Array<{
      resourceKind: string
      counterpartyType: string
      partnerId: string | null
      supplierId: string | null
      title: string
      amountCents: number
      notes: string | null
    }>,
  }

  it('copies undated segments onto the target departure instead of rejecting', async () => {
    const { service, tx, createdSegments } = buildService([
      datedSegment,
      {
        id: 'seg-undated',
        name: '未定日期段',
        sortOrder: 1,
        dayCount: null,
        destination: null,
        notes: null,
        resources: [],
      },
    ])

    await expect(
      service.copyToDeparture({
        tx: tx as never,
        organizationId: 'org-1',
        sourceDepartureId: 'source-dep',
        targetDepartureId: 'target-dep',
        targetStartDate: new Date('2026-07-30T00:00:00.000Z'),
        targetEndDate: new Date('2026-08-08T00:00:00.000Z'),
      }),
    ).resolves.toBeUndefined()

    expect(createdSegments).toHaveLength(2)
    expect(createdSegments[0]).toMatchObject({
      departureId: 'target-dep',
      name: '有日期段',
      dayCount: 3,
      pendingCheck: true,
    })
    expect(createdSegments[1]).toMatchObject({
      departureId: 'target-dep',
      name: '未定日期段',
      startDate: null,
      endDate: null,
      dayCount: null,
      pendingCheck: true,
    })
  })

  it('copies segment resource structure with zero amount and without supplier or partner', async () => {
    const { service, tx, createdResources } = buildService([
      {
        ...datedSegment,
        resources: [
          {
            resourceKind: ResourceKind.hotel,
            counterpartyType: CounterpartyType.supplier,
            partnerId: null,
            supplierId: 'supplier-1',
            title: '喀纳斯酒店',
            amountCents: 120000,
            notes: '含早',
          },
          {
            resourceKind: ResourceKind.outsource,
            counterpartyType: CounterpartyType.partner,
            partnerId: 'partner-1',
            supplierId: null,
            title: '拼出段',
            amountCents: 88000,
            notes: null,
          },
        ],
      },
    ])

    await service.copyToDeparture({
      tx: tx as never,
      organizationId: 'org-1',
      sourceDepartureId: 'source-dep',
      targetDepartureId: 'target-dep',
      targetStartDate: new Date('2026-09-01T00:00:00.000Z'),
      targetEndDate: new Date('2026-09-10T00:00:00.000Z'),
    })

    expect(createdResources).toEqual([
      {
        segmentId: 'seg-1',
        resourceKind: ResourceKind.hotel,
        counterpartyType: CounterpartyType.supplier,
        partnerId: null,
        supplierId: null,
        title: '喀纳斯酒店',
        amountCents: 0,
        notes: '含早',
        pendingCheck: true,
      },
      {
        segmentId: 'seg-1',
        resourceKind: ResourceKind.outsource,
        counterpartyType: CounterpartyType.supplier,
        partnerId: null,
        supplierId: null,
        title: '拼出段',
        amountCents: 0,
        notes: null,
        pendingCheck: true,
      },
    ])
  })

  it('rejects copy when allocated segment dates overflow the new tour period', async () => {
    const { service, tx, createdSegments } = buildService([datedSegment])

    try {
      await service.copyToDeparture({
        tx: tx as never,
        organizationId: 'org-1',
        sourceDepartureId: 'source-dep',
        targetDepartureId: 'target-dep',
        targetStartDate: new Date('2026-09-01T00:00:00.000Z'),
        targetEndDate: new Date('2026-09-02T00:00:00.000Z'),
      })
      throw new Error('expected copy overflow to be rejected')
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException)
      const response = (error as BadRequestException).getResponse() as {
        message: string
        data: { code: string }
      }
      expect(response.message).toContain('复制被拒绝')
      expect(response.message).toContain('2026-09-01～2026-09-02')
      expect(response.message).toContain('有日期段')
      expect(response.data.code).toBe('ITINERARY_SEGMENT_OUT_OF_RANGE')
    }

    expect(createdSegments).toHaveLength(0)
  })
})

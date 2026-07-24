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

  it('copies undated segments onto the target departure instead of rejecting', async () => {
    const { service, tx, createdSegments } = buildService([
      {
        id: 'seg-dated',
        name: '有日期段',
        sortOrder: 0,
        dayCount: 3,
        destination: '喀纳斯',
        notes: null,
        resources: [],
      },
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
})

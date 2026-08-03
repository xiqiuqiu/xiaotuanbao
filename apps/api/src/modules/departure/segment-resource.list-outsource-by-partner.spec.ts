import { ResourceKind } from '@prisma/client'
import { SegmentResourceService } from './segment-resource.service'

describe('SegmentResourceService.listOutsourceByPartner', () => {
  it('返回引用该 Partner 的拼出资源行，并排除非拼出与其他 Partner', async () => {
    const outsourceDepartureId = 'dep-outsource-1'
    const prisma = {
      partner: {
        findFirst: jest.fn().mockResolvedValue({ id: 'partner-1' }),
      },
      segmentResource: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'res-1',
            segmentId: 'seg-1',
            title: '阿勒泰拼出',
            amountCents: 800000,
            notes: null,
            segment: {
              name: '阿勒泰段',
              departureId: outsourceDepartureId,
              departure: {
                departureNo: 'XTB-001',
                name: '拼出团',
                routeName: '线',
                startDate: new Date('2026-07-01'),
              },
            },
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amountCents: 800000 } }),
      },
      itinerarySegment: {
        findMany: jest.fn().mockResolvedValue([{ departureId: outsourceDepartureId }]),
      },
    }

    const service = new SegmentResourceService(
      prisma as never,
      {} as never,
    )

    const result = await service.listOutsourceByPartner('org-1', 'partner-1', {})

    expect(prisma.segmentResource.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          partnerId: 'partner-1',
          resourceKind: ResourceKind.outsource,
        }),
      }),
    )
    expect(result.total).toBe(1)
    expect(result.items[0]).toMatchObject({
      id: 'res-1',
      departureId: outsourceDepartureId,
      segmentName: '阿勒泰段',
      title: '阿勒泰拼出',
      amountCents: 800000,
    })
    expect(result.items[0]).not.toHaveProperty('resourceKind')
    expect(result.summary).toEqual({
      resourceRowCount: 1,
      departureCount: 1,
      totalAmountCents: 800000,
    })
  })
})

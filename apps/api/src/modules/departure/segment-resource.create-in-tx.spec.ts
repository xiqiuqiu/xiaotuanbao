import { BadRequestException } from '@nestjs/common'
import { ResourceKind } from '@prisma/client'
import { SegmentResourceService } from './segment-resource.service'

describe('SegmentResourceService.createInTx #449', () => {
  it('refuses a segment that does not belong to the confirmed departure', async () => {
    const tx = {
      itinerarySegment: { findFirst: jest.fn().mockResolvedValue(null) },
      segmentResource: { create: jest.fn() },
      supplier: { findFirst: jest.fn() },
    }
    const service = new SegmentResourceService(tx as never, {
      assertMutable: jest.fn(),
    } as never)

    await expect(
      service.createInTx(
        tx as never,
        'org-1',
        'seg-other',
        {
          resourceKind: ResourceKind.hotel,
          supplierId: 'sup-1',
          title: '住宿',
          amountCents: 880000,
        },
        { expectedDepartureId: 'departure-1' },
      ),
    ).rejects.toThrow(BadRequestException)
    await expect(
      service.createInTx(
        tx as never,
        'org-1',
        'seg-other',
        {
          resourceKind: ResourceKind.hotel,
          supplierId: 'sup-1',
          title: '住宿',
          amountCents: 880000,
        },
        { expectedDepartureId: 'departure-1' },
      ),
    ).rejects.toThrow('材料未确定对应行程段，请核实归属，不能凭当前页面日期默认挂靠')
    expect(tx.segmentResource.create).not.toHaveBeenCalled()
  })
  it.each([
    [null, '供应商不存在'],
    [{ status: 'inactive', categories: ['hotel'] }, '供应商不可用'],
    [{ status: 'active', categories: ['transport'] }, '不属于该供应商的类别集合'],
  ])('refuses invalid suppliers before writing a confirmed resource', async (supplier, reason) => {
    const tx = {
      itinerarySegment: { findFirst: jest.fn().mockResolvedValue({ id: 'seg-1', departureId: 'dep-1', departure: {} }) },
      supplier: { findFirst: jest.fn().mockResolvedValue(supplier) },
      segmentResource: { create: jest.fn() },
    }
    const service = new SegmentResourceService(tx as never, { assertMutable: jest.fn() } as never)
    await expect(service.createInTx(tx as never, 'org-1', 'seg-1', {
      resourceKind: ResourceKind.hotel, supplierId: 'sup-1', title: '住宿', amountCents: 880000,
    }, { expectedDepartureId: 'dep-1' })).rejects.toThrow(String(reason))
    expect(tx.supplier.findFirst).toHaveBeenCalledWith({ where: { id: 'sup-1', organizationId: 'org-1' } })
    expect(tx.segmentResource.create).not.toHaveBeenCalled()
  })

})

import { NotFoundException } from '@nestjs/common'
import { ResourceKind } from '@prisma/client'
import { DepartureResourceService } from './departure-resource.service'

describe('DepartureResourceService.createInTx #450', () => {
  it('refuses when the confirmed departure is missing from the organization', async () => {
    const tx = {
      departure: { findFirst: jest.fn().mockResolvedValue(null) },
      departureResource: { create: jest.fn() },
      supplier: { findFirst: jest.fn() },
    }
    const service = new DepartureResourceService(tx as never, {
      assertMutable: jest.fn(),
    } as never)

    await expect(
      service.createInTx(tx as never, 'org-1', 'dep-1', {
        resourceKind: ResourceKind.insurance,
        supplierId: 'sup-1',
        title: '全程保险',
        amountCents: 120000,
      }),
    ).rejects.toThrow(NotFoundException)
    await expect(
      service.createInTx(tx as never, 'org-1', 'dep-1', {
        resourceKind: ResourceKind.insurance,
        supplierId: 'sup-1',
        title: '全程保险',
        amountCents: 120000,
      }),
    ).rejects.toThrow('发团不存在')
    expect(tx.departureResource.create).not.toHaveBeenCalled()
  })

  it.each([
    [null, '供应商不存在'],
    [{ status: 'inactive', categories: ['insurance'] }, '供应商不可用'],
    [{ status: 'active', categories: ['transport'] }, '不属于该供应商的类别集合'],
  ])('refuses invalid suppliers before writing a confirmed resource', async (supplier, reason) => {
    const tx = {
      departure: { findFirst: jest.fn().mockResolvedValue({ id: 'dep-1' }) },
      supplier: { findFirst: jest.fn().mockResolvedValue(supplier) },
      departureResource: { create: jest.fn() },
    }
    const service = new DepartureResourceService(tx as never, { assertMutable: jest.fn() } as never)
    await expect(
      service.createInTx(
        tx as never,
        'org-1',
        'dep-1',
        {
          resourceKind: ResourceKind.insurance,
          supplierId: 'sup-1',
          title: '全程保险',
          amountCents: 120000,
        },
      ),
    ).rejects.toThrow(String(reason))
    expect(tx.supplier.findFirst).toHaveBeenCalledWith({ where: { id: 'sup-1', organizationId: 'org-1' } })
    expect(tx.departureResource.create).not.toHaveBeenCalled()
  })
})

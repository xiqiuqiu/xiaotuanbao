import { BadRequestException } from '@nestjs/common'
import { PaymentScheduleSourceType } from '@xiaotuanbao/shared'
import { DepartureFinanceGenerationService } from './departure-finance-generation.service'

describe('DepartureFinanceGenerationService', () => {
  const service = Object.create(
    DepartureFinanceGenerationService.prototype,
  ) as DepartureFinanceGenerationService

  it('rejects non-resource source types on generateResourcePayable', async () => {
    await expect(
      service.generateResourcePayable(
        'org-1',
        { sourceType: PaymentScheduleSourceType.MANUAL, sourceId: 'x' },
        () => undefined,
      ),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('dispatches segment_resource to generatePayable', async () => {
    const generatePayable = jest.spyOn(service, 'generatePayable').mockResolvedValue({
      schedule: { id: 'sch-1' } as never,
      resource: { id: 'seg-res-1' } as never,
    })

    const result = await service.generateResourcePayable(
      'org-1',
      {
        sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
        sourceId: 'seg-res-1',
      },
      () => undefined,
    )

    expect(generatePayable).toHaveBeenCalledWith('org-1', 'seg-res-1', expect.any(Function))
    expect(result.resourceKind).toBe('segment')
  })

  it('dispatches departure_resource to generateDepartureResourcePayable', async () => {
    const generateDeparture = jest
      .spyOn(service, 'generateDepartureResourcePayable')
      .mockResolvedValue({
        schedule: { id: 'sch-2' } as never,
        resource: { id: 'dep-res-1' } as never,
      })

    const result = await service.generateResourcePayable(
      'org-1',
      {
        sourceType: PaymentScheduleSourceType.DEPARTURE_RESOURCE,
        sourceId: 'dep-res-1',
      },
      () => undefined,
    )

    expect(generateDeparture).toHaveBeenCalledWith('org-1', 'dep-res-1', expect.any(Function))
    expect(result.resourceKind).toBe('departure')
  })
})

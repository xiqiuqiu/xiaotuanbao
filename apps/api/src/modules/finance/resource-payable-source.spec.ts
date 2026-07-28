import { BadRequestException } from '@nestjs/common'
import { PaymentScheduleSourceType } from '@xiaotuanbao/shared'
import { DepartureFinanceBridgeService } from '../departure/departure-finance-bridge.service'
import { DepartureFinanceFacade } from './departure-finance-facade.service'

describe('resource payable source dispatch (#204)', () => {
  const facade = Object.create(DepartureFinanceFacade.prototype) as DepartureFinanceFacade
  const bridge = Object.create(
    DepartureFinanceBridgeService.prototype,
  ) as DepartureFinanceBridgeService

  it('routes segment_resource amount sync to the segment update path', async () => {
    const syncSegment = jest
      .spyOn(facade, 'syncSegmentResourceAmountOnPayableAdjust')
      .mockResolvedValue(undefined)

    await facade.syncResourceAmountOnPayableAdjust({} as never, {
      sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
      sourceId: 'seg-res-1',
      amountCents: 12_000,
    })

    expect(syncSegment).toHaveBeenCalledWith(
      {},
      { resourceId: 'seg-res-1', amountCents: 12_000 },
    )
  })

  it('keeps a departure_resource sync seam that fails until #205 wires the entity', async () => {
    await expect(
      facade.syncResourceAmountOnPayableAdjust({} as never, {
        sourceType: PaymentScheduleSourceType.DEPARTURE_RESOURCE,
        sourceId: 'dep-res-1',
        amountCents: 12_000,
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('rejects non-resource source types on the sync seam', async () => {
    await expect(
      facade.syncResourceAmountOnPayableAdjust({} as never, {
        sourceType: PaymentScheduleSourceType.MANUAL,
        sourceId: 'x',
        amountCents: 1,
      }),
    ).rejects.toThrow('仅资源应付节点可调整约定金额')
  })

  it('no-ops departure_resource void lock until #205 adds the table', async () => {
    await expect(
      facade.lockResourceSourceForVoid({ $queryRaw: jest.fn() } as never, {
        organizationId: 'org-1',
        sourceType: PaymentScheduleSourceType.DEPARTURE_RESOURCE,
        sourceId: 'dep-res-1',
      }),
    ).resolves.toBeUndefined()
  })

  it('routes segment generate through generateResourcePayable', async () => {
    const generate = jest.spyOn(bridge, 'generatePayable').mockResolvedValue({
      schedule: { id: 'sch-1' } as never,
      sourceAmountMismatch: false,
    })

    await bridge.generateResourcePayable('org-1', {
      sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
      sourceId: 'seg-res-1',
    })

    expect(generate).toHaveBeenCalledWith('org-1', 'seg-res-1')
  })

  it('keeps a departure_resource generate seam until #205 wires the entity', async () => {
    await expect(
      bridge.generateResourcePayable('org-1', {
        sourceType: PaymentScheduleSourceType.DEPARTURE_RESOURCE,
        sourceId: 'dep-res-1',
      }),
    ).rejects.toThrow('发团级资源应付生成尚未接入')
  })
})

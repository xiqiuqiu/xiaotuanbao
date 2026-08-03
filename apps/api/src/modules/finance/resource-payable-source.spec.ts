import { PaymentScheduleSourceType } from '@xiaotuanbao/shared'
import { DepartureFinanceBridgeService } from '../departure/departure-finance-bridge.service'
import { DepartureFinanceFacade } from './departure-finance-facade.service'

describe('resource payable source dispatch (#204)', () => {
  const facade = Object.create(DepartureFinanceFacade.prototype) as DepartureFinanceFacade
  const bridge = Object.create(
    DepartureFinanceBridgeService.prototype,
  ) as DepartureFinanceBridgeService
  // Bridge Generation methods forward to Facade (ADR-0004 C1).
  ;(bridge as unknown as { departureFinanceFacade: DepartureFinanceFacade }).departureFinanceFacade =
    facade

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

  it('routes departure_resource amount sync to the departure update path', async () => {
    const syncDeparture = jest
      .spyOn(facade, 'syncDepartureResourceAmountOnPayableAdjust')
      .mockResolvedValue(undefined)

    await facade.syncResourceAmountOnPayableAdjust({} as never, {
      sourceType: PaymentScheduleSourceType.DEPARTURE_RESOURCE,
      sourceId: 'dep-res-1',
      amountCents: 12_000,
    })

    expect(syncDeparture).toHaveBeenCalledWith(
      {},
      { resourceId: 'dep-res-1', amountCents: 12_000 },
    )
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

  it('row-locks departure_resources before void', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ id: 'dep-res-1' }])

    await facade.lockResourceSourceForVoid({ $queryRaw: queryRaw } as never, {
      organizationId: 'org-1',
      sourceType: PaymentScheduleSourceType.DEPARTURE_RESOURCE,
      sourceId: 'dep-res-1',
    })

    expect(queryRaw).toHaveBeenCalled()
  })

  it('routes segment generate through Facade generateResourcePayable', async () => {
    const generate = jest.spyOn(facade, 'generateResourcePayable').mockResolvedValue({
      schedule: { id: 'sch-1' } as never,
      sourceAmountMismatch: false,
    })

    await bridge.generateResourcePayable('org-1', {
      sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
      sourceId: 'seg-res-1',
    })

    expect(generate).toHaveBeenCalledWith('org-1', {
      sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
      sourceId: 'seg-res-1',
    })
  })

  it('routes departure generate through Facade generateResourcePayable', async () => {
    const generate = jest.spyOn(facade, 'generateResourcePayable').mockResolvedValue({
      schedule: { id: 'sch-2' } as never,
      sourceAmountMismatch: false,
    })

    await bridge.generateResourcePayable('org-1', {
      sourceType: PaymentScheduleSourceType.DEPARTURE_RESOURCE,
      sourceId: 'dep-res-1',
    })

    expect(generate).toHaveBeenCalledWith('org-1', {
      sourceType: PaymentScheduleSourceType.DEPARTURE_RESOURCE,
      sourceId: 'dep-res-1',
    })
  })
})

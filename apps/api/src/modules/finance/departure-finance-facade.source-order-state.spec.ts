import { SegmentPayableStatus, SourceOrderReceivableStatus } from '@xiaotuanbao/shared'
import { DepartureFinanceFacade } from './departure-finance-facade.service'
import type { SourceOrderFinanceMeta } from './departure-finance-schedule-loaders'

describe('DepartureFinanceFacade source-order finance state seam', () => {
  const facade = Object.create(DepartureFinanceFacade.prototype) as DepartureFinanceFacade

  it('generateReceivables uses Facade finance state meta (not Bridge)', async () => {
    const order = { id: 'so-1' } as never
    const schedules = [{ id: 'sch-1' }] as never
    const meta: SourceOrderFinanceMeta = {
      hasSchedule: true,
      receivableStatus: SourceOrderReceivableStatus.PENDING,
      hasSourceAmountMismatch: false,
      amountFieldsLocked: false,
      hasIncompleteReceivablePaths: false,
      rebateCents: 0,
      rebateStatus: SegmentPayableStatus.NOT_GENERATED,
      rebateScheduleNo: null,
    }

    ;(facade as unknown as { generation: { generateReceivableSchedules: unknown } }).generation = {
      generateReceivableSchedules: jest.fn().mockResolvedValue({ order, schedules }),
    }
    jest.spyOn(facade, 'assertAllowsNewObligation').mockReturnValue(undefined)
    const getState = jest.spyOn(facade, 'getSourceOrderFinanceState').mockResolvedValue({
      paths: [],
      meta,
    })

    const result = await facade.generateReceivables('org-1', 'so-1', (_order, financeMeta) => {
      expect(financeMeta).toBe(meta)
      return { id: 'so-1' } as never
    })

    expect(getState).toHaveBeenCalledWith('org-1', 'so-1', order)
    expect(result.sourceAmountMismatch).toBe(false)
    expect(result.schedules).toBe(schedules)
  })

  it('syncSourceOrderSchedules returns Facade meta', async () => {
    const order = { id: 'so-2', collectionMode: 'partner_settled' } as never
    const meta: SourceOrderFinanceMeta = {
      hasSchedule: true,
      receivableStatus: SourceOrderReceivableStatus.COLLECTED,
      hasSourceAmountMismatch: false,
      amountFieldsLocked: true,
      hasIncompleteReceivablePaths: false,
      rebateCents: 0,
      rebateStatus: SegmentPayableStatus.NOT_GENERATED,
      rebateScheduleNo: null,
    }

    ;(facade as unknown as { generation: { syncSourceOrderConvention: unknown } }).generation = {
      syncSourceOrderConvention: jest.fn().mockResolvedValue(undefined),
    }
    jest.spyOn(facade, 'getSourceOrderFinanceState').mockResolvedValue({
      paths: [],
      meta,
    })

    await expect(facade.syncSourceOrderSchedules('org-1', order)).resolves.toBe(meta)
  })
})

import { PaymentScheduleSourceType } from '../enums/payment-schedule-source-type.enum'
import { classifyResourceInitialPayable } from './classify-resource-initial-payables'

function schedule(
  id: string,
  amountCents: number,
  flags?: { cancelledAt?: string | null; voidedAt?: string | null },
) {
  return {
    id,
    amountCents,
    cancelledAt: flags?.cancelledAt ?? null,
    voidedAt: flags?.voidedAt ?? null,
  }
}

const hotel = {
  sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
  sourceId: 'res-hotel',
  amountCents: 880_000,
  title: '4月2日住宿',
}

describe('classifyResourceInitialPayable #452', () => {
  it('is ready when the selected resource has a positive amount and no payable history', () => {
    expect(
      classifyResourceInitialPayable({
        resource: hotel,
        existingSchedules: [],
      }),
    ).toEqual({ status: 'ready', amountCents: 880_000 })
  })

  it('does not treat a zero-amount resource as submittable', () => {
    expect(
      classifyResourceInitialPayable({
        resource: { ...hotel, amountCents: 0 },
        existingSchedules: [],
      }),
    ).toEqual({ status: 'no_positive_amount' })
  })

  it('returns the existing schedule when the active payable matches the current amount', () => {
    expect(
      classifyResourceInitialPayable({
        resource: hotel,
        existingSchedules: [schedule('sch-1', 880_000)],
      }),
    ).toEqual({
      status: 'complete_and_consistent',
      scheduleIds: ['sch-1'],
    })
  })

  it('refuses cancelled history instead of recreating the payable', () => {
    expect(
      classifyResourceInitialPayable({
        resource: hotel,
        existingSchedules: [
          schedule('sch-1', 880_000, { cancelledAt: '2026-09-01T00:00:00.000Z' }),
        ],
      }),
    ).toEqual({
      status: 'anomaly',
      code: 'cancelled',
      message: '该资源存在已取消的应付节点，不能通过助手补建或恢复。请在普通业务入口处理。',
    })
  })

  it('refuses voided history instead of treating it as never submitted', () => {
    expect(
      classifyResourceInitialPayable({
        resource: hotel,
        existingSchedules: [
          schedule('sch-1', 880_000, { voidedAt: '2026-09-01T00:00:00.000Z' }),
        ],
      }),
    ).toEqual({
      status: 'anomaly',
      code: 'voided',
      message: '该资源存在已作废的应付节点，不能通过助手覆盖。请在普通业务入口处理。',
    })
  })

  it('refuses an amount mismatch against the current resource convention', () => {
    expect(
      classifyResourceInitialPayable({
        resource: hotel,
        existingSchedules: [schedule('sch-1', 700_000)],
      }),
    ).toEqual({
      status: 'anomaly',
      code: 'amount_mismatch',
      message: '该资源已有应付金额与当前约定不一致，不能通过助手覆盖。请在普通业务入口处理。',
    })
  })

  it('refuses duplicate active payables instead of picking one', () => {
    expect(
      classifyResourceInitialPayable({
        resource: hotel,
        existingSchedules: [schedule('sch-1', 880_000), schedule('sch-2', 880_000)],
      }),
    ).toEqual({
      status: 'anomaly',
      code: 'incomplete',
      message: '该资源应付节点不完整，不能通过助手补建或覆盖。请在普通业务入口处理。',
    })
  })
})

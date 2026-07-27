import { describe, expect, it } from 'vitest'
import { PaymentScheduleSourceType } from '@xiaotuanbao/shared'
import { matchesSourceOrderSchedule } from './matches-source-order-schedule'

describe('matchesSourceOrderSchedule', () => {
  it('matches guest-collection and customer-settlement rows for the source order', () => {
    expect(
      matchesSourceOrderSchedule(
        {
          sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
          sourceId: 'order-1',
        },
        'order-1',
      ),
    ).toBe(true)

    expect(
      matchesSourceOrderSchedule(
        {
          sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
          sourceId: 'order-1',
        },
        'order-1',
      ),
    ).toBe(true)

    expect(
      matchesSourceOrderSchedule(
        {
          sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
          sourceId: 'order-1',
        },
        'order-1',
      ),
    ).toBe(true)
  })

  it('rejects other source types or different source ids', () => {
    expect(
      matchesSourceOrderSchedule(
        {
          sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
          sourceId: 'order-1',
        },
        'order-1',
      ),
    ).toBe(false)

    expect(
      matchesSourceOrderSchedule(
        {
          sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
          sourceId: 'order-2',
        },
        'order-1',
      ),
    ).toBe(false)
  })
})

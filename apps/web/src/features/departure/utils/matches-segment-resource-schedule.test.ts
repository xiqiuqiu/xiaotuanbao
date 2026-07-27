import { describe, expect, it } from 'vitest'
import { PaymentScheduleSourceType } from '@xiaotuanbao/shared'
import { matchesSegmentResourceSchedule } from './matches-segment-resource-schedule'

describe('matchesSegmentResourceSchedule', () => {
  it('matches segment_resource rows for the resource id', () => {
    expect(
      matchesSegmentResourceSchedule(
        {
          sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
          sourceId: 'resource-1',
        },
        'resource-1',
      ),
    ).toBe(true)
  })

  it('rejects other source types or different source ids', () => {
    expect(
      matchesSegmentResourceSchedule(
        {
          sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
          sourceId: 'resource-1',
        },
        'resource-1',
      ),
    ).toBe(false)

    expect(
      matchesSegmentResourceSchedule(
        {
          sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
          sourceId: 'resource-2',
        },
        'resource-1',
      ),
    ).toBe(false)
  })
})

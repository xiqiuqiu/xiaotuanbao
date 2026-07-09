import { SegmentPayableStatus } from '@xiaotuanbao/shared'
import { aggregatePayableOverview } from './segment-payable-overview.utils'

describe('aggregatePayableOverview', () => {
  const { NOT_GENERATED, PENDING, PARTIAL, PAID, CLOSED } = SegmentPayableStatus

  it('returns not_generated for empty list', () => {
    expect(aggregatePayableOverview([])).toBe(NOT_GENERATED)
  })

  it('returns not_generated when all resources are not_generated', () => {
    expect(aggregatePayableOverview([NOT_GENERATED, NOT_GENERATED])).toBe(NOT_GENERATED)
  })

  it('returns closed when all resources are closed', () => {
    expect(aggregatePayableOverview([CLOSED, CLOSED])).toBe(CLOSED)
  })

  it('returns paid when all resources are paid', () => {
    expect(aggregatePayableOverview([PAID, PAID])).toBe(PAID)
  })

  it('returns pending when all resources are pending', () => {
    expect(aggregatePayableOverview([PENDING, PENDING])).toBe(PENDING)
  })

  it('returns partial when any resource is partial', () => {
    expect(aggregatePayableOverview([PARTIAL])).toBe(PARTIAL)
    expect(aggregatePayableOverview([PENDING, PARTIAL, PAID])).toBe(PARTIAL)
  })

  it('returns partial for mixed unpaid / paid / pending states', () => {
    expect(aggregatePayableOverview([PENDING, PAID])).toBe(PARTIAL)
    expect(aggregatePayableOverview([NOT_GENERATED, PENDING])).toBe(PARTIAL)
    expect(aggregatePayableOverview([NOT_GENERATED, PAID])).toBe(PARTIAL)
    expect(aggregatePayableOverview([NOT_GENERATED, PENDING, PAID])).toBe(PARTIAL)
  })

  it('ignores closed resources when deriving settlement progress', () => {
    expect(aggregatePayableOverview([CLOSED, PENDING])).toBe(PENDING)
    expect(aggregatePayableOverview([CLOSED, PAID])).toBe(PAID)
    expect(aggregatePayableOverview([CLOSED, NOT_GENERATED])).toBe(NOT_GENERATED)
    expect(aggregatePayableOverview([CLOSED, PENDING, PAID])).toBe(PARTIAL)
  })
})

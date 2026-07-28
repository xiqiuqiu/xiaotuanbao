import { describe, expect, it } from 'vitest'
import {
  formatTicketHeadcountMismatchMessage,
  hasTicketHeadcountMismatch,
  sumTicketTypeHeadcount,
} from './ticket-type-headcount'

describe('ticket-type-headcount', () => {
  it('sums ticket type counts', () => {
    expect(
      sumTicketTypeHeadcount({
        fullTicketCount: 8,
        halfTicketCount: 1,
        studentTicketCount: 1,
        freeTicketCount: 0,
      }),
    ).toBe(10)
  })

  it('flags mismatch for soft UI warning', () => {
    expect(
      hasTicketHeadcountMismatch(
        {
          fullTicketCount: 6,
          halfTicketCount: 1,
          studentTicketCount: 0,
          freeTicketCount: 0,
        },
        10,
      ),
    ).toBe(true)
  })

  it('formats prominent mismatch copy that still allows save', () => {
    expect(
      formatTicketHeadcountMismatchMessage(
        {
          fullTicketCount: 6,
          halfTicketCount: 1,
          studentTicketCount: 0,
          freeTicketCount: 0,
        },
        10,
      ),
    ).toBe('票型人数合计（7）与本团客源人数（10）不一致，请核对。仍可保存。')
  })
})

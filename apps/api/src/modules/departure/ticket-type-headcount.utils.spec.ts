import {
  hasTicketHeadcountMismatch,
  sumTicketTypeHeadcount,
} from './ticket-type-headcount.utils'

describe('ticket-type-headcount.utils', () => {
  it('sums full/half/student/free counts', () => {
    expect(
      sumTicketTypeHeadcount({
        fullTicketCount: 8,
        halfTicketCount: 1,
        studentTicketCount: 1,
        freeTicketCount: 0,
      }),
    ).toBe(10)
  })

  it('flags mismatch against source guest total', () => {
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

  it('does not flag when ticket sum equals source guest total', () => {
    expect(
      hasTicketHeadcountMismatch(
        {
          fullTicketCount: 8,
          halfTicketCount: 1,
          studentTicketCount: 1,
          freeTicketCount: 0,
        },
        10,
      ),
    ).toBe(false)
  })
})

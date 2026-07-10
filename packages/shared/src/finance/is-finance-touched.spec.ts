import { isFinanceTouched } from './is-finance-touched'

describe('isFinanceTouched', () => {
  const cleanSchedule = {
    cancelledAt: null,
    amountAdjustedAt: null,
  }

  it('is false when never verified, adjusted, or closed', () => {
    expect(isFinanceTouched(cleanSchedule, 0)).toBe(false)
    expect(isFinanceTouched(cleanSchedule, 0, false)).toBe(false)
  })

  it('is true when there is effective settled amount', () => {
    expect(isFinanceTouched(cleanSchedule, 4000)).toBe(true)
  })

  it('is true when verification history exists even if settled amount is zero', () => {
    expect(isFinanceTouched(cleanSchedule, 0, true)).toBe(true)
  })

  it('is true when amount was explicitly adjusted', () => {
    expect(
      isFinanceTouched(
        { ...cleanSchedule, amountAdjustedAt: '2026-08-01T00:00:00.000Z' },
        0,
      ),
    ).toBe(true)
  })

  it('is true when schedule was closed', () => {
    expect(
      isFinanceTouched(
        { ...cleanSchedule, cancelledAt: '2026-08-01T00:00:00.000Z' },
        0,
      ),
    ).toBe(true)
  })
})

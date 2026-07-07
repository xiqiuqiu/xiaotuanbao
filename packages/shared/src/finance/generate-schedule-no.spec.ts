import { PaymentScheduleDirection } from '../enums/payment-schedule-direction.enum'
import { generateScheduleNo } from './generate-schedule-no'

describe('generateScheduleNo', () => {
  it('formats receivable schedule numbers', () => {
    expect(
      generateScheduleNo(PaymentScheduleDirection.RECEIVABLE, '2026-08-01', 1),
    ).toBe('AR202608010001')
    expect(
      generateScheduleNo(PaymentScheduleDirection.RECEIVABLE, '2026-08-01', 42),
    ).toBe('AR202608010042')
  })

  it('formats payable schedule numbers', () => {
    expect(generateScheduleNo(PaymentScheduleDirection.PAYABLE, '2026-08-01', 1)).toBe(
      'AP202608010001',
    )
  })
})

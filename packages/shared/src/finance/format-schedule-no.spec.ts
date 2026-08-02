import { PaymentScheduleDirection } from '../enums/payment-schedule-direction.enum'
import { formatScheduleNo } from './format-schedule-no'

describe('formatScheduleNo', () => {
  it('formats receivable schedule numbers with org prefix', () => {
    expect(
      formatScheduleNo(PaymentScheduleDirection.RECEIVABLE, 'XTB', '2607', 1),
    ).toBe('ARXTB2607000001')
    expect(
      formatScheduleNo(PaymentScheduleDirection.RECEIVABLE, 'XTB', '2607', 42),
    ).toBe('ARXTB2607000042')
  })

  it('formats payable schedule numbers with org prefix', () => {
    expect(formatScheduleNo(PaymentScheduleDirection.PAYABLE, 'SLD', '2607', 1)).toBe(
      'APSLD2607000001',
    )
  })
})

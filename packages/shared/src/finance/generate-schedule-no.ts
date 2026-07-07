import { PaymentScheduleDirection } from '../enums/payment-schedule-direction.enum'

export function generateScheduleNo(
  direction: PaymentScheduleDirection,
  businessDate: string,
  sequence: number,
): string {
  const prefix = direction === PaymentScheduleDirection.RECEIVABLE ? 'AR' : 'AP'
  const datePart = businessDate.replace(/-/g, '')
  const sequencePart = String(sequence).padStart(4, '0')
  return `${prefix}${datePart}${sequencePart}`
}

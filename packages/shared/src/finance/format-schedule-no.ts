import { PaymentScheduleDirection } from '../enums/payment-schedule-direction.enum'

export function formatScheduleNo(
  direction: PaymentScheduleDirection,
  businessPrefix: string,
  periodKey: string,
  sequence: number,
): string {
  const typePrefix =
    direction === PaymentScheduleDirection.RECEIVABLE ? 'AR' : 'AP'
  return `${typePrefix}${businessPrefix}${periodKey}${String(sequence).padStart(6, '0')}`
}

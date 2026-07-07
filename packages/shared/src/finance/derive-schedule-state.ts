import { PaymentScheduleStatus } from '../enums/payment-schedule-status.enum'

export interface DeriveScheduleStateInput {
  amountCents: number
  settledAmountCents: number
  dueDate: string
  cancelledAt: string | Date | null
  businessDate: string
}

export function deriveScheduleState(input: DeriveScheduleStateInput): PaymentScheduleStatus {
  if (input.cancelledAt != null) {
    return PaymentScheduleStatus.CANCELLED
  }

  if (input.settledAmountCents >= input.amountCents) {
    return PaymentScheduleStatus.SETTLED
  }

  if (input.dueDate < input.businessDate) {
    return PaymentScheduleStatus.OVERDUE
  }

  return PaymentScheduleStatus.PENDING
}

import { yuanToCents } from './finance-form'

export interface VerificationFormValues {
  paymentScheduleId: string
  transactionId: string
  amountYuan: number
}

export function buildCreateVerificationPayload(values: VerificationFormValues) {
  return {
    paymentScheduleId: values.paymentScheduleId,
    transactionId: values.transactionId,
    amountCents: yuanToCents(values.amountYuan),
  }
}

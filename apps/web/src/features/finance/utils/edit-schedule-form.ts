import type { PaymentScheduleSummary } from '@xiaotuanbao/shared'
import {
  centsToYuan,
  dateStringToDayjs,
  dayjsToDateString,
  yuanToCents,
} from './finance-form'

export interface EditScheduleFormValues {
  title: string
  amountYuan?: number
  dueDate?: ReturnType<typeof dateStringToDayjs>
  counterpartyName?: string
}

export function scheduleToEditValues(schedule: PaymentScheduleSummary): EditScheduleFormValues {
  return {
    title: schedule.title,
    amountYuan: centsToYuan(schedule.amountCents),
    dueDate: dateStringToDayjs(schedule.dueDate),
    counterpartyName: schedule.counterpartyName ?? undefined,
  }
}

export function buildUpdateSchedulePayload(
  schedule: PaymentScheduleSummary,
  values: EditScheduleFormValues,
) {
  const payload: {
    title: string
    amountCents?: number
    dueDate?: string
    counterpartyName?: string | null
  } = {
    title: values.title.trim(),
  }

  if (!schedule.financeTouched) {
    if (values.amountYuan !== undefined) {
      payload.amountCents = yuanToCents(values.amountYuan)
    }
    if (values.dueDate) {
      payload.dueDate = dayjsToDateString(values.dueDate)
    }
    if (values.counterpartyName !== undefined) {
      payload.counterpartyName = values.counterpartyName.trim() || null
    }
  }

  return payload
}

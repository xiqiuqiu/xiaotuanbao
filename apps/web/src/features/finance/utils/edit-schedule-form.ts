import { CounterpartyType, type PaymentScheduleSummary } from '@xiaotuanbao/shared'
import {
  centsToYuan,
  dateStringToDayjs,
  dayjsToDateString,
  yuanToCents,
} from './finance-form'

export interface EditScheduleFormValues {
  amountYuan?: number
  dueDate?: ReturnType<typeof dateStringToDayjs>
  counterpartyName?: string
}

export function scheduleToEditValues(schedule: PaymentScheduleSummary): EditScheduleFormValues {
  return {
    amountYuan: centsToYuan(schedule.amountCents),
    dueDate: dateStringToDayjs(schedule.dueDate),
    counterpartyName:
      schedule.counterpartyType === CounterpartyType.GUEST
        ? undefined
        : (schedule.counterpartyName ?? undefined),
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
    // 列表/编辑/详情不再展示标题；提交沿用原存储 title。
    title: schedule.title,
  }

  if (!schedule.financeTouched) {
    if (values.amountYuan !== undefined) {
      payload.amountCents = yuanToCents(values.amountYuan)
    }
    if (values.dueDate) {
      payload.dueDate = dayjsToDateString(values.dueDate)
    }
    if (
      schedule.counterpartyType !== CounterpartyType.GUEST &&
      values.counterpartyName !== undefined
    ) {
      payload.counterpartyName = values.counterpartyName.trim() || null
    }
  }

  return payload
}

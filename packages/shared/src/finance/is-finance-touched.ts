export interface FinanceTouchedScheduleInput {
  cancelledAt: string | Date | null
  amountAdjustedAt: string | Date | null
}

export function isFinanceTouched(
  schedule: FinanceTouchedScheduleInput,
  settledAmountCents: number,
): boolean {
  if (settledAmountCents > 0) {
    return true
  }

  if (schedule.amountAdjustedAt != null) {
    return true
  }

  if (schedule.cancelledAt != null) {
    return true
  }

  return false
}

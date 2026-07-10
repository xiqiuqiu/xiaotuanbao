export interface FinanceTouchedScheduleInput {
  cancelledAt: string | Date | null
  amountAdjustedAt: string | Date | null
}

/**
 * Financial history is irreversible: effective settlement can return to zero
 * after cancel verification, but once any verification (including cancelled),
 * amount adjustment, or schedule close has occurred, finance remains touched.
 */
export function isFinanceTouched(
  schedule: FinanceTouchedScheduleInput,
  settledAmountCents: number,
  hasVerificationHistory = false,
): boolean {
  if (settledAmountCents > 0 || hasVerificationHistory) {
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

export interface FinanceTouchedScheduleInput {
  cancelledAt: string | Date | null
  amountAdjustedAt: string | Date | null
}

/**
 * Financial history is irreversible: effective settlement can return to zero
 * after cancel verification, but once any verification (including cancelled),
 * explicit amount adjustment (adjust-amount), or schedule close has occurred,
 * finance remains touched.
 *
 * Ordinary pre-touch edits must NOT set amountAdjustedAt — that timestamp is
 * reserved for explicit adjust-amount and would falsely lock the schedule.
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

export interface SourceAmountPath {
  guestCollectCents: number
  partnerCollectedCents: number
  /** Guest installment split; required so guest_only deposit↔balance reallocation is detected. */
  depositCents: number
  balanceCents: number
}

export function didSourceAmountPathChange(
  previous: SourceAmountPath,
  next: SourceAmountPath,
): boolean {
  return (
    previous.guestCollectCents !== next.guestCollectCents ||
    previous.partnerCollectedCents !== next.partnerCollectedCents ||
    previous.depositCents !== next.depositCents ||
    previous.balanceCents !== next.balanceCents
  )
}

export interface SourceAmountChangeMarkEligibilityInput {
  voidedAt: string | Date | null
  unallocatedAmountCents: number
  createdAt: string | Date
  changeAt: string | Date
}

/**
 * Mark only guest-collection transactions that existed before the path-amount
 * change and still have unallocated balance. Voided / fully allocated / later
 * creates are out of scope.
 */
export function isEligibleForSourceAmountChangeMark(
  input: SourceAmountChangeMarkEligibilityInput,
): boolean {
  if (input.voidedAt != null) {
    return false
  }
  if (input.unallocatedAmountCents <= 0) {
    return false
  }
  return new Date(input.createdAt).getTime() < new Date(input.changeAt).getTime()
}

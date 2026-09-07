export type ReviewBatchDisposition = 'confirmed' | 'rejected'

export type ReviewBatchFollowUp =
  | 'keep_awaiting_review'
  | 'complete_without_continuation'
  | 'complete_with_continuation'

export function reviewBatchFollowUp(input: {
  remainingPendingCount: number
  taskType: string
  disposition: ReviewBatchDisposition
}): ReviewBatchFollowUp {
  if (input.remainingPendingCount > 0) {
    return 'keep_awaiting_review'
  }
  if (input.disposition === 'confirmed' && input.taskType === 'departure_creation') {
    return 'complete_with_continuation'
  }
  return 'complete_without_continuation'
}

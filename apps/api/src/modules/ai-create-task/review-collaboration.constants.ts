export const REVIEW_CONFIRM_BATCH_OPERATION = 'review-confirm-batch'
export const REVIEW_CONFIRM_ITEM_OPERATION = 'review-confirm-item'

export function reviewConfirmJobKey(decisionCommandId: string, packageId: string): string {
  return `review_confirm:${decisionCommandId}:${packageId}`
}

export function reviewConfirmItemKey(decisionCommandId: string, packageId: string): string {
  return `${decisionCommandId}:${packageId}`
}

export function decisionCommandIdFromReviewConfirmJobKey(
  jobKey: string,
  packageId: string,
): string | null {
  const prefix = 'review_confirm:'
  const suffix = `:${packageId}`
  if (!jobKey.startsWith(prefix) || !jobKey.endsWith(suffix)) {
    return null
  }
  return jobKey.slice(prefix.length, jobKey.length - suffix.length)
}

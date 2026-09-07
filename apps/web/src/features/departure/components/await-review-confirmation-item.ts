import type { ReviewConfirmationView } from '@xiaotuanbao/shared'

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'conflict'])

export async function awaitReviewConfirmationItem(params: {
  decisionCommandId: string
  packageId: string
  getConfirmation: (decisionCommandId: string) => Promise<ReviewConfirmationView>
  attempts?: number
  delayMs?: number
  sleep?: (ms: number) => Promise<void>
}): Promise<ReviewConfirmationView> {
  const attempts = params.attempts ?? 20
  const delayMs = params.delayMs ?? 300
  const sleep = params.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))
  let last: ReviewConfirmationView | undefined
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await params.getConfirmation(params.decisionCommandId)
    const item = last.items.find((entry) => entry.packageId === params.packageId)
    if (item && TERMINAL_STATUSES.has(item.status)) {
      if (item.status !== 'succeeded') {
        throw new Error(item.reason ?? '确认未成功')
      }
      return last
    }
    if (attempt < attempts - 1) {
      await sleep(delayMs)
    }
  }
  const timedOut = last?.items.find((entry) => entry.packageId === params.packageId)
  if (!last || !timedOut || timedOut.status !== 'succeeded') {
    throw new Error(timedOut?.reason ?? '确认未成功')
  }
  return last
}

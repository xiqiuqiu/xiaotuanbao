import { describe, expect, it, vi } from 'vitest'
import type { ReviewConfirmationView } from '@xiaotuanbao/shared'
import { awaitReviewConfirmationItem } from './await-review-confirmation-item'

function runningView(packageId: string): ReviewConfirmationView {
  return {
    decisionCommandId: 'decision-1',
    accepted: true,
    items: [{ packageId, itemIdentity: 'item:0', status: 'running' }],
  }
}

describe('awaitReviewConfirmationItem', () => {
  it('throws when polling times out while the item is still running', async () => {
    const getConfirmation = vi.fn().mockResolvedValue(runningView('pkg-1'))

    await expect(
      awaitReviewConfirmationItem({
        decisionCommandId: 'decision-1',
        packageId: 'pkg-1',
        getConfirmation,
        attempts: 2,
        delayMs: 0,
      }),
    ).rejects.toThrow('确认未成功')
  })
})

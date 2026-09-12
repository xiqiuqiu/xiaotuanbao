import { beforeEach, describe, expect, it, vi } from 'vitest'

const post = vi.fn()

vi.mock('@/lib/request', () => ({
  request: {
    get: vi.fn(),
    post: (...args: unknown[]) => post(...args),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

import {
  acceptReviewConfirmation,
  prepareResourcePayableReviews,
  prepareSourceOrderReceivableReview,
} from './agent-collaboration.service'

describe('acceptReviewConfirmation', () => {
  beforeEach(() => {
    post.mockReset()
    post.mockResolvedValue({ decisionCommandId: 'd-1', accepted: true, items: [] })
  })

  it('posts independent review decisions instead of the draft confirm path', async () => {
    await acceptReviewConfirmation({
      decisionCommandId: 'd-1',
      items: [{ packageId: 'pkg-1', expectedPackageVersion: 2 }],
    })
    expect(post).toHaveBeenCalledWith('/agent/review-decisions', {
      decisionCommandId: 'd-1',
      items: [{ packageId: 'pkg-1', expectedPackageVersion: 2 }],
    })
  })

  it('posts source-order receivable review preparation on the departure', async () => {
    await prepareSourceOrderReceivableReview('dep-1', {
      sourceOrderId: 'so-1',
      conversationId: 'conv-1',
    })
    expect(post).toHaveBeenCalledWith(
      '/agent/departures/dep-1/source-order-receivable-reviews',
      { sourceOrderId: 'so-1', conversationId: 'conv-1' },
    )
  })

  it('posts selected resource payable review preparation on the departure', async () => {
    await prepareResourcePayableReviews('dep-1', {
      conversationId: 'conv-1',
      items: [{ sourceType: 'segment_resource', sourceId: 'res-1' }],
    })
    expect(post).toHaveBeenCalledWith('/agent/departures/dep-1/resource-payable-reviews', {
      conversationId: 'conv-1',
      items: [{ sourceType: 'segment_resource', sourceId: 'res-1' }],
    })
  })
})

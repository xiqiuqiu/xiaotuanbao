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

import { acceptReviewConfirmation } from './agent-collaboration.service'

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
})

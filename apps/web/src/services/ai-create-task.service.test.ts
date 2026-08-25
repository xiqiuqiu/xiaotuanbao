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
  downloadBinary: vi.fn(),
}))

import { confirmAiReviewPackage } from './ai-create-task.service'

describe('confirmAiReviewPackage', () => {
  beforeEach(() => {
    post.mockReset()
    post.mockResolvedValue({ id: 'task-1' })
  })

  it('sends Idempotency-Key so confirm can bind a decision identity', async () => {
    const payload = { expectedVersion: 2, expectedPackageVersion: 1 }

    await confirmAiReviewPackage('task-1', 'pkg-1', payload, 'decision-1')

    expect(post).toHaveBeenCalledWith(
      '/ai-create-tasks/task-1/review-packages/pkg-1/confirm',
      payload,
      { headers: { 'Idempotency-Key': 'decision-1' } },
    )
  })
})

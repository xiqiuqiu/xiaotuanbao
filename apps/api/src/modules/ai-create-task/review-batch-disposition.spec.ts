import { reviewBatchFollowUp } from './review-batch-disposition'

describe('reviewBatchFollowUp #447', () => {
  it('keeps the batch awaiting review when other items are still pending', () => {
    expect(
      reviewBatchFollowUp({
        remainingPendingCount: 1,
        taskType: 'departure_creation',
        disposition: 'confirmed',
      }),
    ).toBe('keep_awaiting_review')
    expect(
      reviewBatchFollowUp({
        remainingPendingCount: 2,
        taskType: 'departure_collaboration',
        disposition: 'rejected',
      }),
    ).toBe('keep_awaiting_review')
  })

  it('does not start an automatic continuation for collaboration or rejected last items', () => {
    expect(
      reviewBatchFollowUp({
        remainingPendingCount: 0,
        taskType: 'departure_collaboration',
        disposition: 'confirmed',
      }),
    ).toBe('complete_without_continuation')
    expect(
      reviewBatchFollowUp({
        remainingPendingCount: 0,
        taskType: 'departure_creation',
        disposition: 'rejected',
      }),
    ).toBe('complete_without_continuation')
  })

  it('keeps create-departure continuation only after the last pending item is confirmed', () => {
    expect(
      reviewBatchFollowUp({
        remainingPendingCount: 0,
        taskType: 'departure_creation',
        disposition: 'confirmed',
      }),
    ).toBe('complete_with_continuation')
  })
})

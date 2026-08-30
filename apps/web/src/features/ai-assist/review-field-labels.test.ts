import { describe, expect, it } from 'vitest'
import type { AiReviewCandidateView } from '@xiaotuanbao/shared'
import { findReviewCandidate } from './review-field-labels'

const nameCandidate: AiReviewCandidateView = {
  fieldKey: 'name',
  proposedValue: '川西团',
  clarity: 'clear',
  status: 'pending',
  evidence: [{ kind: 'user_message', sequence: 1, excerpt: '团名叫川西团' }],
}

describe('findReviewCandidate #440', () => {
  it('requires registered schema coordinates before interpreting a field', () => {
    expect(
      findReviewCandidate(
        {
          candidates: [nameCandidate],
          payloadSchema: '',
          confirmationUnit: 'basic_info_draft',
        },
        'name',
      ),
    ).toBeUndefined()

    expect(
      findReviewCandidate(
        {
          candidates: [nameCandidate],
          payloadSchema: 'departure.basic_info_draft@v1',
          confirmationUnit: 'basic_info_draft',
        },
        'name',
      ),
    ).toBe(nameCandidate)
  })
})

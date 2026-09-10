import { describe, expect, it } from 'vitest'
import type { AiReviewCandidateView } from '@xiaotuanbao/shared'
import { effectiveReviewDate, findReviewCandidate } from './review-field-labels'

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

describe('effectiveReviewDate', () => {
  it('prefers a corrected or proposed date over the saved draft', () => {
    expect(effectiveReviewDate(undefined, '2026-09-10')).toBe('2026-09-10')
    expect(
      effectiveReviewDate(
        {
          fieldKey: 'startDate',
          proposedValue: '2026-09-20',
          clarity: 'needs_confirmation',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '9月20号' }],
        },
        '2026-09-10',
      ),
    ).toBe('2026-09-20')
    expect(
      effectiveReviewDate(
        {
          fieldKey: 'startDate',
          proposedValue: '2026-09-20',
          userCorrectedValue: '2026-09-22',
          clarity: 'needs_confirmation',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '9月20号' }],
        },
        '2026-09-10',
      ),
    ).toBe('2026-09-22')
  })
})

import type { StoredReviewCandidate } from './review-package.mapper'
import { effectiveCandidateValue, reviewConfirmValues } from './review-package.mapper'

function candidate(
  overrides: Partial<StoredReviewCandidate> & Pick<StoredReviewCandidate, 'fieldKey' | 'proposedValue'>,
): StoredReviewCandidate {
  return {
    clarity: 'clear',
    status: 'pending',
    evidence: [{ kind: 'user_message', excerpt: '证据' }],
    ...overrides,
  }
}

describe('effectiveCandidateValue', () => {
  it('uses the proposed value when the user has not corrected', () => {
    expect(
      effectiveCandidateValue(
        candidate({ fieldKey: 'startDate', proposedValue: '2026-09-01' }),
      ),
    ).toBe('2026-09-01')
  })

  it('uses a replacement correction', () => {
    expect(
      effectiveCandidateValue(
        candidate({
          fieldKey: 'expectedGuestCountHint',
          proposedValue: 8,
          userCorrectedValue: 12,
        }),
      ),
    ).toBe(12)
  })

  it('preserves an explicit null clear instead of falling back to proposedValue', () => {
    expect(
      effectiveCandidateValue(
        candidate({
          fieldKey: 'startDate',
          proposedValue: '2026-09-01',
          userCorrectedValue: null,
        }),
      ),
    ).toBeNull()
    expect(
      effectiveCandidateValue(
        candidate({
          fieldKey: 'expectedGuestCountHint',
          proposedValue: 8,
          userCorrectedValue: null,
        }),
      ),
    ).toBeNull()
  })
})

describe('reviewConfirmValues', () => {
  it('submits null for cleared fields and proposed values for untouched ones', () => {
    const { corrections, submissions } = reviewConfirmValues([
      candidate({ fieldKey: 'name', proposedValue: '八月川西团' }),
      candidate({
        fieldKey: 'startDate',
        proposedValue: '2026-09-01',
        userCorrectedValue: null,
      }),
      candidate({
        fieldKey: 'expectedGuestCountHint',
        proposedValue: 8,
        userCorrectedValue: null,
      }),
    ])

    expect(submissions).toEqual({
      name: '八月川西团',
      startDate: null,
      expectedGuestCountHint: null,
    })
    expect(corrections).toEqual({
      startDate: null,
      expectedGuestCountHint: null,
    })
  })
})

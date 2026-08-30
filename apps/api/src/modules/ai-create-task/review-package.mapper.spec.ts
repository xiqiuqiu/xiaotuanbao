import type { StoredReviewCandidate } from './review-package.mapper'
import { effectiveCandidateValue, reviewConfirmValues, toReviewPackageView } from './review-package.mapper'

function candidate(
  overrides: Partial<StoredReviewCandidate> & Pick<StoredReviewCandidate, 'fieldKey' | 'proposedValue'>,
): StoredReviewCandidate {
  return {
    clarity: 'clear',
    status: 'pending',
    evidence: [{ kind: 'user_message', sequence: 1, excerpt: '证据' }],
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

describe('toReviewPackageView user provenance', () => {
  it('keeps model evidence and proposedValue when the user supplies a correction', () => {
    const view = toReviewPackageView({
      id: 'pkg-1',
      status: 'pending',
      confirmationUnit: 'basic_info_draft',
      baseObjectVersion: 1,
      version: 1,
      runId: 'run-1',
      candidates: [
        candidate({
          fieldKey: 'name',
          proposedValue: '九月川西团',
          evidence: [{ kind: 'user_message', sequence: 3, excerpt: '九月川西团' }],
        }),
      ],
      baselineSnapshot: { name: '原团名' },
      userCorrections: { name: '用户修正团名' },
    })

    expect(view.candidates).toEqual([
      expect.objectContaining({
        fieldKey: 'name',
        proposedValue: '九月川西团',
        userCorrectedValue: '用户修正团名',
        evidence: [{ kind: 'user_message', sequence: 3, excerpt: '九月川西团' }],
      }),
    ])
  })

  it('preserves an unknown persisted schema and does not project its fields as departure fields #440', () => {
    const view = toReviewPackageView({
      id: 'pkg-stale',
      status: 'pending',
      confirmationUnit: 'basic_info_draft',
      payloadSchema: 'departure.basic_info_draft@v999',
      baseObjectVersion: 1,
      version: 1,
      candidates: [candidate({ fieldKey: 'name', proposedValue: '不应投影' })],
      baselineSnapshot: { name: '原团名' },
    })

    expect(view.payloadSchema).toBe('departure.basic_info_draft@v999')
    expect(view.schemaSupported).toBe(false)
    expect(view.candidates).toEqual([])
  })

  it('does not partially project a registered package containing an invalid field #440', () => {
    const view = toReviewPackageView({
      id: 'pkg-corrupt',
      status: 'pending',
      confirmationUnit: 'basic_info_draft',
      payloadSchema: 'departure.basic_info_draft@v1',
      baseObjectVersion: 1,
      version: 1,
      candidates: [
        candidate({ fieldKey: 'name', proposedValue: '可识别字段' }),
        { ...candidate({ fieldKey: 'name', proposedValue: '未知字段' }), fieldKey: 'secretField' },
      ],
      baselineSnapshot: { name: '原团名' },
    })

    expect(view.schemaSupported).toBe(false)
    expect(view.candidates).toEqual([])
  })
})

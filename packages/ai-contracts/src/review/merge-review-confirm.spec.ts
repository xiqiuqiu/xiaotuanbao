import { evaluateReviewConfirmMerge } from './merge-review-confirm'
import type { AiCreateDraftSnapshot } from '../context/classify-draft-fields'

const baseline: AiCreateDraftSnapshot = {
  mode: 'manual',
  routeName: '川西线',
  name: '旧团名',
  startDate: '2026-09-01',
  endDate: '2026-09-05',
  ownerUserId: 'user-owner',
  departureType: 'combined',
  expectedGuestCountHint: 8,
}

describe('evaluateReviewConfirmMerge', () => {
  it('applies candidate name when unrelated draft fields changed', () => {
    const current: AiCreateDraftSnapshot = {
      ...baseline,
      ownerUserId: 'user-other',
      notes: '表单备注',
    }

    const result = evaluateReviewConfirmMerge({
      baselineSnapshot: baseline,
      currentSnapshot: current,
      submissions: { name: '八月川西团' },
    })

    expect(result).toEqual({
      status: 'ok',
      nextSnapshot: {
        ...current,
        name: '八月川西团',
      },
    })
  })

  it('rejects when a candidate field or its date consistency group changed', () => {
    const nameConflict = evaluateReviewConfirmMerge({
      baselineSnapshot: baseline,
      currentSnapshot: { ...baseline, name: '表单已改团名' },
      submissions: { name: '八月川西团' },
    })
    expect(nameConflict).toEqual({
      status: 'conflict',
      conflictFields: ['name'],
    })

    const dateGroupConflict = evaluateReviewConfirmMerge({
      baselineSnapshot: baseline,
      currentSnapshot: { ...baseline, endDate: '2026-09-08' },
      submissions: { startDate: '2026-09-02' },
    })
    expect(dateGroupConflict).toEqual({
      status: 'conflict',
      conflictFields: ['endDate'],
    })
  })

  it('does not write user-only fields from submissions', () => {
    const result = evaluateReviewConfirmMerge({
      baselineSnapshot: baseline,
      currentSnapshot: baseline,
      submissions: {
        name: '八月川西团',
        ownerUserId: 'hijacked',
        departureType: 'independent',
      } as never,
    })

    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.nextSnapshot.ownerUserId).toBe('user-owner')
      expect(result.nextSnapshot.departureType).toBe('combined')
      expect(result.nextSnapshot.name).toBe('八月川西团')
    }
  })

  it('writes explicit null submissions for dates and expectedGuestCountHint', () => {
    const result = evaluateReviewConfirmMerge({
      baselineSnapshot: baseline,
      currentSnapshot: baseline,
      submissions: { startDate: null, expectedGuestCountHint: null },
    })

    expect(result).toEqual({
      status: 'ok',
      nextSnapshot: {
        ...baseline,
        startDate: null,
        expectedGuestCountHint: null,
      },
    })
  })
})

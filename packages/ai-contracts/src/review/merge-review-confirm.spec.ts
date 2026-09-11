import {
  evaluateReviewConfirmMerge,
  preservePendingCandidateBaseline,
  pendingCandidateSnapshotDrift,
} from './merge-review-confirm'
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

  it('rejects when a submitted candidate field changed in the draft', () => {
    const nameConflict = evaluateReviewConfirmMerge({
      baselineSnapshot: baseline,
      currentSnapshot: { ...baseline, name: '表单已改团名' },
      submissions: { name: '八月川西团' },
    })
    expect(nameConflict).toEqual({
      status: 'conflict',
      conflictFields: ['name'],
    })
  })

  it('keeps a user-edited endDate when only startDate is submitted', () => {
    const result = evaluateReviewConfirmMerge({
      baselineSnapshot: baseline,
      currentSnapshot: { ...baseline, endDate: '2026-09-08' },
      submissions: { startDate: '2026-09-02' },
    })
    expect(result).toEqual({
      status: 'ok',
      nextSnapshot: {
        ...baseline,
        startDate: '2026-09-02',
        endDate: '2026-09-08',
      },
    })
  })

  it('derives endDate when submitted startDate would invert the saved range', () => {
    const result = evaluateReviewConfirmMerge({
      baselineSnapshot: {
        ...baseline,
        startDate: '2026-09-10',
        endDate: '2026-09-10',
      },
      currentSnapshot: {
        ...baseline,
        startDate: '2026-09-10',
        endDate: '2026-09-10',
      },
      submissions: { startDate: '2026-09-20' },
    })
    expect(result).toEqual({
      status: 'ok',
      nextSnapshot: {
        ...baseline,
        startDate: '2026-09-20',
        endDate: '2026-09-20',
      },
    })
  })

  it('writes explicit non-reference fields but never writes the user-only owner field', () => {
    const result = evaluateReviewConfirmMerge({
      baselineSnapshot: baseline,
      currentSnapshot: baseline,
      submissions: {
        name: '八月川西团',
        ownerUserId: 'hijacked',
        departureType: 'independent',
        notes: '客人需要轮椅',
        driverSupplierId: 'sup-driver',
        guideSupplierId: 'sup-guide',
        vehiclePlate: '新A·12345',
        contactPhone: '13800138000',
      } as never,
    })

    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.nextSnapshot.ownerUserId).toBe('user-owner')
      expect(result.nextSnapshot.departureType).toBe('independent')
      expect(result.nextSnapshot.notes).toBe('客人需要轮椅')
      expect(result.nextSnapshot.driverSupplierId).toBe('sup-driver')
      expect(result.nextSnapshot.guideSupplierId).toBe('sup-guide')
      expect(result.nextSnapshot.vehiclePlate).toBe('新A·12345')
      expect(result.nextSnapshot.contactPhone).toBe('13800138000')
      expect(result.nextSnapshot.name).toBe('八月川西团')
    }
  })

  it.each([null, '', 'foobar', 1])(
    'rejects an invalid departureType correction: %p',
    (departureType) => {
      expect(
        evaluateReviewConfirmMerge({
          baselineSnapshot: baseline,
          currentSnapshot: baseline,
          submissions: { departureType } as never,
        }),
      ).toEqual({ status: 'invalid', invalidFields: ['departureType'] })
    },
  )

  it('treats templateId and routeName as one consistency group', () => {
    const withTemplate: AiCreateDraftSnapshot = {
      ...baseline,
      mode: 'template',
      templateId: 'tpl-1',
      routeName: '川西线',
      defaultDayCount: 8,
    }

    const routeConflict = evaluateReviewConfirmMerge({
      baselineSnapshot: withTemplate,
      currentSnapshot: { ...withTemplate, routeName: '表单已改路线' },
      submissions: { templateId: 'tpl-2' },
    })
    expect(routeConflict).toEqual({
      status: 'conflict',
      conflictFields: ['routeName'],
    })

    const templateConflict = evaluateReviewConfirmMerge({
      baselineSnapshot: withTemplate,
      currentSnapshot: { ...withTemplate, templateId: 'tpl-other' },
      submissions: { routeName: '川西稻城线' },
    })
    expect(templateConflict).toEqual({
      status: 'conflict',
      conflictFields: ['templateId'],
    })
  })

  it('does not rewrite startDate or endDate when adopting a template', () => {
    const result = evaluateReviewConfirmMerge({
      baselineSnapshot: baseline,
      currentSnapshot: baseline,
      submissions: { templateId: 'tpl-1' },
    })

    expect(result).toEqual({
      status: 'ok',
      nextSnapshot: {
        ...baseline,
        mode: 'template',
        templateId: 'tpl-1',
      },
    })
    if (result.status === 'ok') {
      expect(result.nextSnapshot.startDate).toBe('2026-09-01')
      expect(result.nextSnapshot.endDate).toBe('2026-09-05')
    }
  })

  it('clears template selection when only a manual routeName is submitted', () => {
    const withTemplate: AiCreateDraftSnapshot = {
      ...baseline,
      mode: 'template',
      templateId: 'tpl-1',
      defaultDayCount: 8,
    }

    const result = evaluateReviewConfirmMerge({
      baselineSnapshot: withTemplate,
      currentSnapshot: withTemplate,
      submissions: { routeName: '手工川西线' },
    })

    expect(result).toEqual({
      status: 'ok',
      nextSnapshot: {
        ...withTemplate,
        mode: 'manual',
        templateId: null,
        routeName: '手工川西线',
        defaultDayCount: null,
      },
    })
  })

  it('keeps unrelated route edits and restores auto-derived 团名 so confirm can proceed', () => {
    const emptyNameBaseline: AiCreateDraftSnapshot = {
      mode: 'manual',
      routeName: '',
      name: null,
      startDate: '2026-08-18',
      endDate: '2026-08-18',
      ownerUserId: 'user-owner',
      departureType: 'combined',
    }
    const afterTypingRoute: AiCreateDraftSnapshot = {
      ...emptyNameBaseline,
      routeName: '西北大环线',
      name: '2026年8月18日 西',
    }
    const submissions = {
      name: '2026年8月13号西北大环线10日游',
      startDate: '2026-08-13',
      endDate: '2026-08-22',
      expectedGuestCountHint: 12,
    }

    expect(
      evaluateReviewConfirmMerge({
        baselineSnapshot: emptyNameBaseline,
        currentSnapshot: afterTypingRoute,
        submissions,
      }),
    ).toEqual({
      status: 'conflict',
      conflictFields: ['name'],
    })

    const preserved = preservePendingCandidateBaseline({
      draft: afterTypingRoute,
      baselineSnapshot: emptyNameBaseline,
      candidateFields: ['name', 'startDate', 'endDate', 'expectedGuestCountHint'],
    })
    expect(preserved.routeName).toBe('西北大环线')
    expect(preserved.name).toBeNull()
    expect(
      pendingCandidateSnapshotDrift({
        draft: afterTypingRoute,
        baselineSnapshot: emptyNameBaseline,
        candidateFields: ['name', 'startDate', 'endDate', 'expectedGuestCountHint'],
      }),
    ).toBe(true)
    expect(
      pendingCandidateSnapshotDrift({
        draft: preserved,
        baselineSnapshot: emptyNameBaseline,
        candidateFields: ['name', 'startDate', 'endDate', 'expectedGuestCountHint'],
      }),
    ).toBe(false)
    expect(
      evaluateReviewConfirmMerge({
        baselineSnapshot: emptyNameBaseline,
        currentSnapshot: preserved,
        submissions,
      }),
    ).toEqual({
      status: 'ok',
      nextSnapshot: {
        ...preserved,
        name: '2026年8月13号西北大环线10日游',
        startDate: '2026-08-13',
        endDate: '2026-08-22',
        expectedGuestCountHint: 12,
      },
    })
  })

  it('does not restore an unsubmitted endDate back to the review baseline', () => {
    const draft = {
      ...baseline,
      endDate: '2026-09-29',
    }
    expect(
      preservePendingCandidateBaseline({
        draft,
        baselineSnapshot: baseline,
        candidateFields: ['startDate'],
      }),
    ).toEqual(draft)
    expect(
      pendingCandidateSnapshotDrift({
        draft,
        baselineSnapshot: baseline,
        candidateFields: ['startDate'],
      }),
    ).toBe(false)
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

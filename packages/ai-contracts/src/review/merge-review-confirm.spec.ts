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

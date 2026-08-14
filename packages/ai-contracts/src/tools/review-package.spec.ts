import {
  AWAIT_REVIEW_PACKAGE_DECISION_TOOL,
  AI_CREATE_TOOL_NAMES,
  SUBMIT_REVIEW_PACKAGE_TOOL,
  capabilitiesForPendingReview,
  submitReviewPackageInputSchema,
  submitReviewPackageOutputSchema,
  awaitReviewPackageDecisionInputSchema,
  reviewPackageDecisionSchema,
} from './review-package'

const validCandidate = {
  fieldKey: 'name' as const,
  proposedValue: '八月川西团',
  clarity: 'clear' as const,
  evidence: [{ kind: 'user_message' as const, excerpt: '团名叫八月川西团' }],
}

describe('submitReviewPackage contract v1', () => {
  it('defines a frontend HITL decision contract without granting a business write capability', () => {
    expect(AWAIT_REVIEW_PACKAGE_DECISION_TOOL).toEqual({
      name: 'awaitReviewPackageDecision',
      version: 1,
    })
    expect(
      awaitReviewPackageDecisionInputSchema.parse({
        reviewPackageId: 'pkg-1',
        ignored: 'stripped',
      }),
    ).toEqual({ reviewPackageId: 'pkg-1' })
    expect(
      reviewPackageDecisionSchema.parse({
        reviewPackageId: 'pkg-1',
        status: 'confirmed',
        snapshotVersion: 3,
      }),
    ).toEqual({ reviewPackageId: 'pkg-1', status: 'confirmed', snapshotVersion: 3 })
    expect(
      reviewPackageDecisionSchema.parse({
        reviewPackageId: 'pkg-1',
        status: 'rejected',
      }),
    ).toEqual({ reviewPackageId: 'pkg-1', status: 'rejected' })
    expect(AI_CREATE_TOOL_NAMES).not.toContain('awaitReviewPackageDecision')
  })

  it('declares the versioned tool name among AI create tools', () => {
    expect(SUBMIT_REVIEW_PACKAGE_TOOL).toEqual({
      name: 'submitReviewPackage',
      version: 1,
    })
    expect(AI_CREATE_TOOL_NAMES).toEqual([
      'getTaskContext',
      'searchRouteTemplates',
      'getMaterialParseResult',
      'submitReviewPackage',
    ])
  })

  it('accepts basic-info candidates with message evidence and strips confirm actions', () => {
    const parsed = submitReviewPackageInputSchema.parse({
      taskId: 'task-1',
      runId: 'run-1',
      objectVersion: 2,
      confirmationUnit: 'basic_info_draft',
      candidates: [
        validCandidate,
        {
          fieldKey: 'startDate',
          proposedValue: '2026-09-01',
          clarity: 'needs_confirmation',
          evidence: [{ kind: 'user_message', excerpt: '9 月 1 号出发' }],
        },
        {
          fieldKey: 'endDate',
          proposedValue: '2026-09-05',
          clarity: 'clear',
          evidence: [{ kind: 'system_derivation', rule: 'startDate plus 4 days' }],
        },
      ],
      confirm: true,
    })

    expect(parsed).not.toHaveProperty('confirm')
    expect(parsed.candidates.map((candidate) => candidate.fieldKey)).toEqual([
      'name',
      'startDate',
      'endDate',
    ])
  })

  it('rejects owner, departure type, missing evidence, duplicate fields and inverted dates', () => {
    expect(() =>
      submitReviewPackageInputSchema.parse({
        taskId: 'task-1',
        runId: 'run-1',
        objectVersion: 1,
        candidates: [
          {
            fieldKey: 'ownerUserId',
            proposedValue: 'user-1',
            clarity: 'clear',
            evidence: [{ kind: 'user_message', excerpt: '负责人王杰' }],
          },
        ],
      }),
    ).toThrow()

    expect(() =>
      submitReviewPackageInputSchema.parse({
        taskId: 'task-1',
        runId: 'run-1',
        objectVersion: 1,
        candidates: [
          {
            fieldKey: 'departureType',
            proposedValue: 'combined',
            clarity: 'clear',
            evidence: [{ kind: 'user_message', excerpt: '散拼' }],
          },
        ],
      }),
    ).toThrow()

    expect(() =>
      submitReviewPackageInputSchema.parse({
        taskId: 'task-1',
        runId: 'run-1',
        objectVersion: 1,
        candidates: [{ ...validCandidate, evidence: [] }],
      }),
    ).toThrow()

    expect(() =>
      submitReviewPackageInputSchema.parse({
        taskId: 'task-1',
        runId: 'run-1',
        objectVersion: 1,
        candidates: [validCandidate, { ...validCandidate, proposedValue: '另一团名' }],
      }),
    ).toThrow()

    expect(() =>
      submitReviewPackageInputSchema.parse({
        taskId: 'task-1',
        runId: 'run-1',
        objectVersion: 1,
        candidates: [
          {
            fieldKey: 'startDate',
            proposedValue: '2026-09-10',
            clarity: 'clear',
            evidence: [{ kind: 'user_message', excerpt: '10 号出发' }],
          },
          {
            fieldKey: 'endDate',
            proposedValue: '2026-09-01',
            clarity: 'clear',
            evidence: [{ kind: 'user_message', excerpt: '1 号结束' }],
          },
        ],
      }),
    ).toThrow()
  })

  it('returns a pending package id without a new draft version', () => {
    const parsed = submitReviewPackageOutputSchema.parse({
      reviewPackageId: 'pkg-1',
      status: 'pending',
      objectVersion: 2,
      fieldKeys: ['name', 'routeName'],
      snapshot: { name: 'must not leak' },
    })

    expect(parsed).toEqual({
      reviewPackageId: 'pkg-1',
      status: 'pending',
      objectVersion: 2,
      fieldKeys: ['name', 'routeName'],
    })
  })

  it('freezes submitReviewPackage while a package is pending', () => {
    expect(capabilitiesForPendingReview(false)).toEqual([
      'getTaskContext',
      'searchRouteTemplates',
      'getMaterialParseResult',
      'submitReviewPackage',
    ])
    expect(capabilitiesForPendingReview(true)).toEqual([
      'getTaskContext',
      'searchRouteTemplates',
      'getMaterialParseResult',
    ])
  })

  it('accepts material_region evidence with page and excerpt', () => {
    const parsed = submitReviewPackageInputSchema.parse({
      taskId: 'task-1',
      runId: 'run-1',
      objectVersion: 2,
      candidates: [
        {
          ...validCandidate,
          evidence: [
            {
              kind: 'material_region',
              materialId: 'mat-1',
              pageNumber: 1,
              excerpt: '八月川西团',
              coordinateSystem: 'pdf_point',
            },
          ],
        },
      ],
    })
    expect(parsed.candidates[0]?.evidence[0]).toMatchObject({
      kind: 'material_region',
      materialId: 'mat-1',
      pageNumber: 1,
    })
  })

  it('accepts templateId in the same basic_info_draft unit as name and dates', () => {
    const parsed = submitReviewPackageInputSchema.parse({
      taskId: 'task-1',
      runId: 'run-1',
      objectVersion: 2,
      candidates: [
        validCandidate,
        {
          fieldKey: 'templateId',
          proposedValue: 'tpl-1',
          clarity: 'clear',
          evidence: [
            { kind: 'system_derivation', rule: 'searchRouteTemplates:name_contains_token:川西' },
          ],
        },
      ],
    })

    expect(parsed.candidates.map((candidate) => candidate.fieldKey)).toEqual([
      'name',
      'templateId',
    ])
  })
})

import {
  AI_CREATE_TOOL_NAMES,
  SUBMIT_REVIEW_PACKAGE_TOOL,
  capabilitiesForPendingReview,
  submitReviewPackageInputSchema,
  submitReviewPackageOutputSchema,
} from './review-package'

const validCandidate = {
  fieldKey: 'name' as const,
  proposedValue: '八月川西团',
  clarity: 'clear' as const,
  evidence: [{ kind: 'user_message' as const, excerpt: '团名叫八月川西团' }],
}

describe('submitReviewPackage contract v1', () => {
  it('declares the versioned tool name among AI create tools', () => {
    expect(SUBMIT_REVIEW_PACKAGE_TOOL).toEqual({
      name: 'submitReviewPackage',
      version: 1,
    })
    expect(AI_CREATE_TOOL_NAMES).toEqual(['getTaskContext', 'submitReviewPackage'])
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
      'submitReviewPackage',
    ])
    expect(capabilitiesForPendingReview(true)).toEqual(['getTaskContext'])
  })
})

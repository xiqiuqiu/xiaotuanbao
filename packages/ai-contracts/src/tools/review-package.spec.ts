import {
  AWAIT_REVIEW_PACKAGE_DECISION_TOOL,
  AI_CREATE_TOOL_NAMES,
  SUBMIT_REVIEW_PACKAGE_TOOL,
  UNIQUE_CANDIDATE_FIELD_KEY_MESSAGE,
  capabilitiesForPendingReview,
  isDuplicateCandidateFieldError,
  submitReviewPackageInputSchema,
  submitReviewPackageModelInputSchema,
  submitReviewPackageOutputSchema,
  awaitReviewPackageDecisionInputSchema,
  reviewPackageDecisionSchema,
} from './review-package'

const validCandidate = {
  fieldKey: 'name' as const,
  proposedValue: '八月川西团',
  clarity: 'clear' as const,
  evidence: [{ kind: 'user_message' as const, sequence: 1, excerpt: '团名叫八月川西团' }],
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
      name: 'proposeReviewPackage',
      version: 1,
    })
    expect(AI_CREATE_TOOL_NAMES).toEqual([
      'getTaskContext',
      'searchRouteTemplates',
      'searchUsers',
      'searchSuppliers',
      'searchPartners',
      'proposeReviewPackage',
      'getMaterialParseResult',
      'readConversationHistory',
      'readConversationSource',
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
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '9 月 1 号出发' }],
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

  it('accepts explicitly expressed non-reference create fields', () => {
    const parsed = submitReviewPackageInputSchema.parse({
      taskId: 'task-1',
      runId: 'run-1',
      objectVersion: 1,
      candidates: [
        {
          fieldKey: 'departureType',
          proposedValue: 'independent',
          clarity: 'clear',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '这是独立团' }],
        },
        {
          fieldKey: 'notes',
          proposedValue: '客人需要轮椅',
          clarity: 'clear',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '客人需要轮椅' }],
        },
        {
          fieldKey: 'vehiclePlate',
          proposedValue: '新A·12345',
          clarity: 'clear',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '车牌新A·12345' }],
        },
        {
          fieldKey: 'contactPhone',
          proposedValue: '13800138000',
          clarity: 'clear',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '联系电话13800138000' }],
        },
      ],
    })

    expect(parsed.candidates.map((candidate) => candidate.fieldKey)).toEqual([
      'departureType',
      'notes',
      'vehiclePlate',
      'contactPhone',
    ])
  })

  it('rejects owner, missing evidence, duplicate fields and inverted dates', () => {
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
            evidence: [{ kind: 'user_message', sequence: 1, excerpt: '负责人王杰' }],
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
            evidence: [{ kind: 'user_message', sequence: 1, excerpt: '10 号出发' }],
          },
          {
            fieldKey: 'endDate',
            proposedValue: '2026-09-01',
            clarity: 'clear',
            evidence: [{ kind: 'user_message', sequence: 1, excerpt: '1 号结束' }],
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

  it('freezes proposeReviewPackage while a package is pending', () => {
    expect(capabilitiesForPendingReview(false)).toEqual([
      'getTaskContext',
      'searchRouteTemplates',
      'searchUsers',
      'searchSuppliers',
      'searchPartners',
      'proposeReviewPackage',
      'getMaterialParseResult',
      'readConversationHistory',
      'readConversationSource',
    ])
    expect(capabilitiesForPendingReview(true)).toEqual([
      'getTaskContext',
      'searchRouteTemplates',
      'searchUsers',
      'searchSuppliers',
      'searchPartners',
      'getMaterialParseResult',
      'readConversationHistory',
      'readConversationSource',
    ])
    expect(capabilitiesForPendingReview(false, true)).toEqual([
      'getTaskContext',
      'readConversationHistory',
      'readConversationSource',
    ])
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

  it('accepts material_region evidence from a pinned parse version', () => {
    const parsed = submitReviewPackageInputSchema.parse({
      taskId: 'task-1',
      runId: 'run-1',
      objectVersion: 2,
      candidates: [
        {
          fieldKey: 'name',
          proposedValue: '九月川西团',
          clarity: 'clear',
          evidence: [
            {
              kind: 'material_region',
              materialId: 'mat-1', parseResultVersion: 1,
              pageNumber: 1,
              excerpt: '九月川西线',
            },
          ],
        },
      ],
    })
    expect(parsed.candidates[0]?.evidence).toEqual([
      {
        kind: 'material_region',
        materialId: 'mat-1',
        parseResultVersion: 1,
        pageNumber: 1,
        excerpt: '九月川西线',
      },
    ])
  })

  it('rejects user_message evidence without an event identity', () => {
    expect(() =>
      submitReviewPackageInputSchema.parse({
        taskId: 'task-1',
        runId: 'run-1',
        objectVersion: 1,
        candidates: [
          {
            fieldKey: 'name',
            proposedValue: '八月川西团',
            clarity: 'clear',
            evidence: [{ kind: 'user_message', excerpt: '团名叫八月川西团' }],
          },
        ],
      }),
    ).toThrow()
  })

  it('rejects material_region evidence without parseResultVersion', () => {
    expect(() =>
      submitReviewPackageInputSchema.parse({
        taskId: 'task-1',
        runId: 'run-1',
        objectVersion: 1,
        candidates: [
          {
            fieldKey: 'name',
            proposedValue: '九月川西团',
            clarity: 'clear',
            evidence: [
              {
                kind: 'material_region',
                materialId: 'mat-1',
                pageNumber: 1,
                excerpt: '九月川西线',
              },
            ],
          },
        ],
      }),
    ).toThrow()
  })

  it('rejects unknown evidence kinds including summary', () => {
    expect(() =>
      submitReviewPackageInputSchema.parse({
        taskId: 'task-1',
        runId: 'run-1',
        objectVersion: 1,
        candidates: [
          {
            fieldKey: 'name',
            proposedValue: '八月川西团',
            clarity: 'clear',
            evidence: [{ kind: 'summary', excerpt: '摘要里写了团名' }],
          },
        ],
      }),
    ).toThrow()
  })

  it('identifies duplicate routeName candidates so the agent can ask for a single retry', () => {
    try {
      submitReviewPackageModelInputSchema.parse({
        objectVersion: 1,
        candidates: [
          {
            fieldKey: 'routeName',
            proposedValue: '天吐喀伊10日',
            clarity: 'needs_confirmation',
            evidence: [
              {
                kind: 'material_region',
                materialId: 'material-1',
                parseResultVersion: 1,
                pageNumber: 1,
                excerpt: '2026年7月21日天吐喀伊10日日报表',
              },
            ],
          },
          {
            fieldKey: 'routeName',
            proposedValue: '喀伊8日',
            clarity: 'needs_confirmation',
            evidence: [
              {
                kind: 'material_region',
                materialId: 'material-1',
                parseResultVersion: 1,
                pageNumber: 1,
                excerpt: '2026年7月21日喀伊8日日报表（司机周雪豹，导游周超凡）',
              },
            ],
          },
        ],
      })
      throw new Error('expected duplicate fieldKeys to fail')
    } catch (error) {
      expect(isDuplicateCandidateFieldError(error)).toBe(true)
      expect(error).toEqual(
        expect.objectContaining({
          issues: expect.arrayContaining([
            expect.objectContaining({ message: UNIQUE_CANDIDATE_FIELD_KEY_MESSAGE }),
          ]),
        }),
      )
    }
  })
})

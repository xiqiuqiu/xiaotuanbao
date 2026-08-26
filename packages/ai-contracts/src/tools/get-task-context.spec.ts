import {
  GET_TASK_CONTEXT_TOOL,
  getTaskContextInputSchema,
  getTaskContextOutputSchema,
} from './get-task-context'

const BASE = {
  task: {
    id: 'task-1',
    status: 'in_progress' as const,
    currentPhase: 'basic_info' as const,
    creatorUserId: 'user-1',
  },
  snapshot: { mode: 'manual' as const, routeName: '川西线' },
  objectVersion: 1,
  pending: { hasPendingReview: false, reviewPackageId: null },
  availableCapabilities: ['getTaskContext'] as const,
  fieldCoverage: { filled: ['routeName'], missing: [], optionalPresent: [] },
}

describe('getTaskContext contract v2', () => {
  it('declares the versioned tool name and forbids write capabilities', () => {
    expect(GET_TASK_CONTEXT_TOOL).toEqual({
      name: 'getTaskContext',
      version: 2,
    })
  })

  it('accepts only task and run identifiers', () => {
    const parsed = getTaskContextInputSchema.parse({
      taskId: 'task-1',
      runId: 'run-1',
      organizationId: 'should-be-stripped',
    })

    expect(parsed).toEqual({ taskId: 'task-1', runId: 'run-1' })
  })

  it('returns min task context and drops unrelated organization or database fields', () => {
    const parsed = getTaskContextOutputSchema.parse({
      task: {
        id: 'task-1',
        status: 'in_progress',
        currentPhase: 'basic_info',
        creatorUserId: 'user-1',
      },
      snapshot: {
        mode: 'manual',
        routeName: '川西线',
        templateId: null,
        copyFromDepartureId: null,
        name: '八月川西团',
        startDate: '2026-09-01',
        endDate: '2026-09-05',
        ownerUserId: 'user-owner',
        departureType: 'combined',
        expectedGuestCountHint: 12,
        notes: null,
        driverSupplierId: null,
        guideSupplierId: null,
        vehiclePlate: null,
        contactPhone: null,
      },
      objectVersion: 3,
      pending: { hasPendingReview: false, reviewPackageId: null },
      availableCapabilities: ['getTaskContext'],
      fieldCoverage: {
        filled: ['name', 'routeName', 'startDate', 'endDate', 'ownerUserId', 'departureType'],
        missing: [],
        optionalPresent: ['expectedGuestCountHint'],
      },
      organizationId: 'org-secret',
      prismaModel: 'AiCreateTask',
    })

    expect(parsed).not.toHaveProperty('organizationId')
    expect(parsed).not.toHaveProperty('prismaModel')
    expect(parsed.availableCapabilities).toEqual(['getTaskContext'])
    expect(parsed.objectVersion).toBe(3)
    expect(parsed).not.toHaveProperty('currentUserMessage')
    expect(parsed).not.toHaveProperty('conversationEvents')
    expect(parsed).not.toHaveProperty('materials')
  })

  it('strips conversation history and material excerpts out of the live tool payload', () => {
    const parsed = getTaskContextOutputSchema.parse({
      ...BASE,
      currentUserMessage: '帮我建一个喀纳斯3日团',
      conversationEvents: [{ sequence: 1, kind: 'user_message', text: '帮我建一个喀纳斯3日团' }],
      materials: [
        {
          materialId: 'mat-1',
          parseResultVersion: 1,
          status: 'ready',
          pageCount: 1,
          excerpt: '九月川西线',
          truncated: false,
          bytes: 'must-not-pass',
        },
      ],
    })
    expect(parsed).not.toHaveProperty('currentUserMessage')
    expect(parsed).not.toHaveProperty('conversationEvents')
    expect(parsed).not.toHaveProperty('materials')
  })

  it('allows proposeReviewPackage and rejects confirm or other write tools', () => {
    const parsed = getTaskContextOutputSchema.parse({
      task: {
        id: 'task-1',
        status: 'in_progress',
        currentPhase: 'basic_info',
        creatorUserId: 'user-1',
      },
      snapshot: {
        mode: 'manual',
        routeName: '川西线',
        templateId: null,
        copyFromDepartureId: null,
        name: null,
        startDate: null,
        endDate: null,
        ownerUserId: null,
        departureType: 'combined',
        expectedGuestCountHint: null,
        notes: null,
        driverSupplierId: null,
        guideSupplierId: null,
        vehiclePlate: null,
        contactPhone: null,
      },
      objectVersion: 1,
      pending: { hasPendingReview: false, reviewPackageId: null },
      availableCapabilities: ['getTaskContext', 'proposeReviewPackage'],
      fieldCoverage: { filled: ['routeName', 'departureType'], missing: ['name'], optionalPresent: [] },
    })
    expect(parsed.availableCapabilities).toEqual(['getTaskContext', 'proposeReviewPackage'])

    expect(() =>
      getTaskContextOutputSchema.parse({
        ...parsed,
        availableCapabilities: ['getTaskContext', 'confirmReviewPackage'],
      }),
    ).toThrow()
  })
})

import { AgentTaskStatus, AiCreateActivityRunStatus } from '@prisma/client'
import { AiCreatePhase, DepartureCreationDraftMode, DepartureType } from '@xiaotuanbao/shared'
import { AI_EVIDENCE_PER_CANDIDATE_LIMIT } from '@xiaotuanbao/ai-contracts'
import { AiCreateTaskService } from './ai-create-task.service'

const organizationId = 'org-1'
const userId = 'user-1'
const taskId = 'task-1'
const runId = 'run-1'
const conversationId = 'conv-1'
const inputBatchId = 'batch-1'
const attemptId = 'attempt-1'
const contextManifestId = 'manifest-1'
const eventId = 'event-3'
const now = new Date('2026-08-25T00:00:00.000Z')

const snapshot = {
  mode: DepartureCreationDraftMode.MANUAL,
  routeName: '川西',
  name: '原团名',
  startDate: '2026-09-01',
  endDate: '2026-09-05',
  ownerUserId: userId,
  departureType: DepartureType.COMBINED,
}

const caller = {
  userId,
  organizationId,
  taskId,
  runId,
  conversationId,
  inputBatchId,
  attemptId,
  contextManifestId,
}

const validProposal = {
  objectVersion: 1,
  confirmationUnit: 'basic_info_draft' as const,
  candidates: [
    {
      fieldKey: 'name' as const,
      proposedValue: '九月川西团',
      clarity: 'clear' as const,
      evidence: [{ kind: 'user_message' as const, sequence: 3, excerpt: '九月川西团' }],
    },
  ],
}

function createService() {
  const writes = {
    actionCreate: jest.fn(),
    reviewCreate: jest.fn(),
    batchUpdate: jest.fn(),
    attemptUpdate: jest.fn(),
  }
  const store = {
    aiCreateTask: {
      findFirst: jest.fn().mockResolvedValue({
        id: taskId,
        currentPhase: AiCreatePhase.BASIC_INFO,
        departureId: null,
        createdAt: now,
        updatedAt: now,
        draft: {
          id: 'draft-1',
          taskId,
          version: 1,
          snapshot,
          createdAt: now,
          updatedAt: now,
        },
        agentTask: {
          id: taskId,
          organizationId,
          ownerUserId: userId,
          status: AgentTaskStatus.active,
          statusVersion: 1,
          createdAt: now,
          updatedAt: now,
          reviewPackages: [],
        },
      }),
    },
    aiCreateActivityRun: {
      findFirst: jest.fn().mockResolvedValue({
        id: runId,
        status: AiCreateActivityRunStatus.running,
      }),
    },
    aiAgentAttempt: {
      findUnique: jest.fn().mockResolvedValue({
        id: attemptId,
        contextManifestId,
        conversationId,
        inputBatchId,
        organizationId,
      }),
      update: writes.attemptUpdate,
    },
    aiContextManifest: {
      findUnique: jest.fn().mockResolvedValue({
        id: contextManifestId,
        conversationId,
        inputBatchId,
        eventSequences: [1, 3],
        materialVersions: [],
        excerptDigests: [],
      }),
    },
    aiConversationEvent: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: eventId,
          conversationId,
          sequence: 3,
          kind: 'user_message',
          payload: { text: '请创建 九月川西团' },
        },
      ]),
    },
    aiAction: { create: writes.actionCreate, findFirst: jest.fn(), count: jest.fn() },
    aiReviewPackage: { create: writes.reviewCreate, findFirst: jest.fn(), count: jest.fn() },
    aiInputBatch: { update: writes.batchUpdate },
  }
  const prisma = {
    ...store,
    $transaction: jest.fn(async (callback: (client: typeof store) => Promise<unknown>) =>
      callback(store),
    ),
  }
  const service = new AiCreateTaskService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  )
  return { service, prisma, writes }
}

describe('AiCreateTaskService.proposeReviewPackageForAgent', () => {
  it('returns a server-normalized proposal without creating an Action, Review Package or batch result', async () => {
    const { service, writes } = createService()

    const result = await service.proposeReviewPackageForAgent(caller, {
      taskId,
      runId,
      ...validProposal,
    })

    expect(result).toMatchObject({
      status: 'accepted',
      objectVersion: 1,
      confirmationUnit: 'basic_info_draft',
      candidates: [
        {
          fieldKey: 'name',
          proposedValue: '九月川西团',
        },
      ],
      normalizedProposal: {
        schemaVersion: 1,
        candidates: [{ candidateId: 'name', proposedValue: '九月川西团' }],
        evidenceCatalog: [
          {
            kind: 'user_message',
            locator: { conversationId, eventId, sequence: 3 },
            excerpt: { text: '九月川西团' },
          },
        ],
      },
    })
    expect(writes.actionCreate).not.toHaveBeenCalled()
    expect(writes.reviewCreate).not.toHaveBeenCalled()
    expect(writes.batchUpdate).not.toHaveBeenCalled()
    expect(writes.attemptUpdate).not.toHaveBeenCalled()
  })

  it('returns candidate/evidence errors for a false excerpt without creating durable review state', async () => {
    const { service, writes } = createService()

    const result = await service.proposeReviewPackageForAgent(caller, {
      taskId,
      runId,
      objectVersion: 1,
      candidates: [
        {
          fieldKey: 'name',
          proposedValue: '十月川西团',
          clarity: 'clear',
          evidence: [{ kind: 'user_message', sequence: 3, excerpt: '十月川西团' }],
        },
      ],
    })

    expect(result).toMatchObject({
      status: 'rejected',
      errors: [{ candidateIndex: 0, evidenceIndex: 0, code: 'EXCERPT_NOT_FOUND' }],
    })
    expect(writes.actionCreate).not.toHaveBeenCalled()
    expect(writes.reviewCreate).not.toHaveBeenCalled()
    expect(writes.batchUpdate).not.toHaveBeenCalled()
  })

  it('rejects a proposal whose JSON exceeds the server hard limit without creating review state', async () => {
    const { service, writes } = createService()
    const excerpt = '九月川西团'.padEnd(240, '甲')

    const result = await service.proposeReviewPackageForAgent(caller, {
      taskId,
      runId,
      objectVersion: 1,
      candidates: [
        {
          fieldKey: 'name',
          proposedValue: '九月川西团',
          clarity: 'clear',
          evidence: Array.from({ length: AI_EVIDENCE_PER_CANDIDATE_LIMIT }, () => ({
            kind: 'user_message' as const,
            sequence: 3,
            excerpt,
          })),
        },
        {
          fieldKey: 'routeName',
          proposedValue: '川西线',
          clarity: 'clear',
          evidence: Array.from({ length: AI_EVIDENCE_PER_CANDIDATE_LIMIT }, () => ({
            kind: 'user_message' as const,
            sequence: 3,
            excerpt,
          })),
        },
        {
          fieldKey: 'templateId',
          proposedValue: 'tpl-1',
          clarity: 'clear',
          evidence: Array.from({ length: AI_EVIDENCE_PER_CANDIDATE_LIMIT }, () => ({
            kind: 'user_message' as const,
            sequence: 3,
            excerpt,
          })),
        },
        {
          fieldKey: 'startDate',
          proposedValue: '2026-09-01',
          clarity: 'clear',
          evidence: Array.from({ length: AI_EVIDENCE_PER_CANDIDATE_LIMIT }, () => ({
            kind: 'user_message' as const,
            sequence: 3,
            excerpt,
          })),
        },
        {
          fieldKey: 'endDate',
          proposedValue: '2026-09-05',
          clarity: 'clear',
          evidence: Array.from({ length: AI_EVIDENCE_PER_CANDIDATE_LIMIT }, () => ({
            kind: 'user_message' as const,
            sequence: 3,
            excerpt,
          })),
        },
        {
          fieldKey: 'expectedGuestCountHint',
          proposedValue: 12,
          clarity: 'clear',
          evidence: Array.from({ length: AI_EVIDENCE_PER_CANDIDATE_LIMIT }, () => ({
            kind: 'user_message' as const,
            sequence: 3,
            excerpt,
          })),
        },
      ],
    })

    expect(result).toMatchObject({
      status: 'rejected',
      errors: [expect.objectContaining({ code: 'PROPOSAL_JSON_TOO_LARGE' })],
    })
    expect(writes.reviewCreate).not.toHaveBeenCalled()
  })

  it('rejects more evidence per candidate than the server hard limit without creating review state', async () => {
    const { service, writes } = createService()

    const result = await service.proposeReviewPackageForAgent(caller, {
      taskId,
      runId,
      objectVersion: 1,
      candidates: [
        {
          fieldKey: 'name',
          proposedValue: '九月川西团',
          clarity: 'clear',
          evidence: Array.from({ length: AI_EVIDENCE_PER_CANDIDATE_LIMIT + 1 }, () => ({
            kind: 'user_message' as const,
            sequence: 3,
            excerpt: '九月川西团',
          })),
        },
      ],
    })

    expect(result).toMatchObject({
      status: 'rejected',
      errors: [expect.objectContaining({ code: 'EVIDENCE_LIMIT_EXCEEDED' })],
    })
    expect(writes.reviewCreate).not.toHaveBeenCalled()
  })
})

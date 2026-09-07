import { AgentTaskStatus, AgentTaskType, AiAgentAttemptStatus } from '@prisma/client'
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
const departureUpdatedAt = new Date('2026-09-07T00:00:00.000Z')
const objectVersion = departureUpdatedAt.getTime()

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

const evidence = [{ kind: 'user_message' as const, sequence: 3, excerpt: '4月2日住宿 8800 元 挂云上酒店' }]

function candidates(overrides: Record<string, string | number> = {}) {
  const values = {
    itinerarySegmentId: 'seg-1',
    resourceKind: 'hotel',
    supplierId: 'sup-1',
    title: '4月2日住宿',
    amountCents: 880000,
    ...overrides,
  }
  return [
    {
      fieldKey: 'itinerarySegmentId' as const,
      proposedValue: String(values.itinerarySegmentId),
      clarity: 'clear' as const,
      evidence,
    },
    {
      fieldKey: 'resourceKind' as const,
      proposedValue: values.resourceKind as 'hotel',
      clarity: 'clear' as const,
      evidence,
    },
    {
      fieldKey: 'supplierId' as const,
      proposedValue: String(values.supplierId),
      clarity: 'clear' as const,
      evidence,
    },
    {
      fieldKey: 'title' as const,
      proposedValue: String(values.title),
      clarity: 'clear' as const,
      evidence,
    },
    {
      fieldKey: 'amountCents' as const,
      proposedValue: Number(values.amountCents),
      clarity: 'clear' as const,
      evidence,
    },
  ]
}

function createService(options?: { segmentId?: string | null }) {
  const writes = {
    actionCreate: jest.fn(),
    reviewCreate: jest.fn(),
  }
  const store = {
    agentTask: {
      findFirst: jest.fn().mockResolvedValue({
        id: taskId,
        type: AgentTaskType.departure_collaboration,
        ownerUserId: userId,
        status: AgentTaskStatus.active,
        departure: { id: 'departure-1', updatedAt: departureUpdatedAt },
      }),
    },
    aiAgentAttempt: {
      findFirst: jest.fn().mockResolvedValue({
        id: attemptId,
        status: AiAgentAttemptStatus.running,
      }),
      findUnique: jest.fn().mockResolvedValue({
        id: attemptId,
        contextManifestId,
        conversationId,
        inputBatchId,
        organizationId,
      }),
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
          payload: { text: '请录入 4月2日住宿 8800 元 挂云上酒店' },
        },
      ]),
    },
    conversationSourceParseRun: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    itinerarySegment: {
      findFirst: jest.fn().mockResolvedValue(
        options?.segmentId === null ? null : { id: options?.segmentId ?? 'seg-1' },
      ),
    },
    aiAction: { create: writes.actionCreate, findFirst: jest.fn(), count: jest.fn() },
    aiReviewPackage: { create: writes.reviewCreate, findFirst: jest.fn(), count: jest.fn() },
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

describe('AiCreateTaskService.proposeSegmentResourceReviewPackageForAgent #449', () => {
  it('accepts a material-backed proposal without writing Action or Review Package', async () => {
    const { service, writes } = createService()

    const result = await service.proposeSegmentResourceReviewPackageForAgent(caller, {
      taskId,
      runId,
      objectVersion,
      candidates: candidates(),
    })

    expect(result).toMatchObject({
      status: 'accepted',
      confirmationUnit: 'segment_resource',
      payloadSchema: 'departure.segment_resource@v1',
      objectVersion,
    })
    expect(writes.actionCreate).not.toHaveBeenCalled()
    expect(writes.reviewCreate).not.toHaveBeenCalled()
  })

  it('retains an unmatched supplier candidate for review without writing formal resources (R7)', async () => {
    const { service, writes } = createService()
    const result = await service.proposeSegmentResourceReviewPackageForAgent(caller, {
      taskId, runId, objectVersion,
      candidates: candidates({ supplierId: 'unmatched-supplier' }),
    })
    expect(result).toMatchObject({ status: 'accepted' })
    expect(writes.actionCreate).not.toHaveBeenCalled()
    expect(writes.reviewCreate).not.toHaveBeenCalled()
  })

  it('rejects a segment that does not belong to the formal departure', async () => {
    const { service, writes } = createService({ segmentId: null })

    const result = await service.proposeSegmentResourceReviewPackageForAgent(caller, {
      taskId,
      runId,
      objectVersion,
      candidates: candidates({ itinerarySegmentId: 'seg-other' }),
    })

    expect(result).toMatchObject({
      status: 'rejected',
      errors: [
        expect.objectContaining({
          code: 'SEGMENT_UNASSIGNED',
          message: '材料未确定对应行程段，请核实归属，不能凭当前页面日期默认挂靠',
        }),
      ],
    })
    expect(writes.reviewCreate).not.toHaveBeenCalled()
  })

  it('rejects a proposal that omits itinerary segment ownership', async () => {
    const { service, writes } = createService()
    const withoutSegment = candidates().filter((candidate) => candidate.fieldKey !== 'itinerarySegmentId')

    const result = await service.proposeSegmentResourceReviewPackageForAgent(caller, {
      taskId,
      runId,
      objectVersion,
      candidates: withoutSegment,
    })

    expect(result).toMatchObject({
      status: 'rejected',
      errors: [expect.objectContaining({ code: 'SEGMENT_UNASSIGNED' })],
    })
    expect(writes.reviewCreate).not.toHaveBeenCalled()
  })
})

import { AgentTaskStatus, AgentTaskType } from '@prisma/client'
import { AiCreateTaskService } from './ai-create-task.service'
import { AiCollaborationHttpException } from './ai-collaboration.http-exception'

const organizationId = 'org-1'
const userId = 'user-1'
const taskId = 'task-1'
const runId = 'run-1'
const conversationId = 'conv-1'
const inputBatchId = 'batch-1'
const attemptId = 'attempt-1'
const currentUpdatedAt = new Date('2026-09-07T12:00:00.000Z')
const staleObjectVersion = currentUpdatedAt.getTime() - 1

const caller = {
  userId,
  organizationId,
  taskId,
  runId,
  conversationId,
  inputBatchId,
  attemptId,
}

const sourceOrderInput = {
  taskId,
  runId,
  objectVersion: staleObjectVersion,
  confirmationUnit: 'source_order_create' as const,
  candidates: [
    {
      fieldKey: 'partnerId' as const,
      proposedValue: 'partner-1',
      clarity: 'clear' as const,
      evidence: [{ kind: 'user_message' as const, sequence: 1, excerpt: '客户甲' }],
    },
  ],
}

function collaborationTask() {
  return {
    id: taskId,
    organizationId,
    ownerUserId: userId,
    status: AgentTaskStatus.active,
    type: AgentTaskType.departure_collaboration,
    departureId: 'departure-1',
    departure: { updatedAt: currentUpdatedAt },
  }
}

function expectVersionConflict(error: unknown) {
  expect(error).toBeInstanceOf(AiCollaborationHttpException)
  expect((error as AiCollaborationHttpException).getResponse()).toEqual(
    expect.objectContaining({
      data: expect.objectContaining({ code: 'VERSION_CONFLICT' }),
    }),
  )
}

describe('AiCreateTaskService collaboration objectVersion CAS #446', () => {
  it('rejects proposeReviewPackageForAgent when the departure version has moved', async () => {
    const prisma = {
      agentTask: {
        findFirst: jest.fn().mockResolvedValue(collaborationTask()),
      },
      aiAgentAttempt: {
        findFirst: jest.fn().mockResolvedValue({ id: attemptId }),
      },
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

    await service.proposeReviewPackageForAgent(caller, sourceOrderInput).then(
      () => {
        throw new Error('expected VERSION_CONFLICT')
      },
      expectVersionConflict,
    )
  })

  it('rejects submitReviewPackageForAgent when the departure version has moved', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ lock: '1' }]),
      agentTask: {
        findFirst: jest.fn().mockResolvedValue(collaborationTask()),
      },
    }
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
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

    await service
      .submitReviewPackageForAgent(caller, sourceOrderInput, { sourceActionId: 'action-1' })
      .then(
        () => {
          throw new Error('expected VERSION_CONFLICT')
        },
        expectVersionConflict,
      )
  })
})

import { AiConversationEventKind, AiInputBatchStatus } from '@prisma/client'
import {
  agentRunningBatchStatusPayload,
  markBatchAgentRunningAfterAttempt,
} from './ai-workflow.agent-running'

describe('agent_running after Attempt', () => {
  it('puts attemptId and generation on the batch_status payload', () => {
    expect(
      agentRunningBatchStatusPayload({
        batchId: 'batch-1',
        attemptId: 'attempt-9',
        generation: 3,
      }),
    ).toEqual({
      batchId: 'batch-1',
      status: AiInputBatchStatus.agent_running,
      attemptId: 'attempt-9',
      generation: 3,
    })
  })

  it('marks the batch running and appends the Attempt identity after the Attempt row exists', async () => {
    const order: string[] = []
    const tx = {
      aiInputBatch: {
        findUniqueOrThrow: jest.fn(async () => {
          order.push('read-batch')
          return { status: AiInputBatchStatus.preparing_context }
        }),
        update: jest.fn(async () => {
          order.push('mark-running')
          return {}
        }),
      },
    }
    const appendEvent = jest.fn(async () => {
      order.push('append-event')
      return { id: 'event-running' }
    })

    const eventId = await markBatchAgentRunningAfterAttempt(
      tx as never,
      appendEvent as never,
      {
        organizationId: 'org-1',
        conversationId: 'conv-1',
        batchId: 'batch-1',
        attemptId: 'attempt-9',
        generation: 3,
      },
    )

    expect(eventId).toBe('event-running')
    expect(order).toEqual(['read-batch', 'mark-running', 'append-event'])
    expect(appendEvent).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        organizationId: 'org-1',
        conversationId: 'conv-1',
        kind: AiConversationEventKind.batch_status,
        payload: {
          batchId: 'batch-1',
          status: AiInputBatchStatus.agent_running,
          attemptId: 'attempt-9',
          generation: 3,
        },
      }),
    )
    expect(tx.aiInputBatch.update).toHaveBeenCalledWith({
      where: { id: 'batch-1' },
      data: { status: AiInputBatchStatus.agent_running },
    })
  })

  it('still appends agent_running for a new Attempt when the batch is already running', async () => {
    const tx = {
      aiInputBatch: {
        findUniqueOrThrow: jest.fn(async () => ({
          status: AiInputBatchStatus.agent_running,
        })),
        update: jest.fn(),
      },
    }
    const appendEvent = jest.fn(async () => ({ id: 'event-retry' }))

    await expect(
      markBatchAgentRunningAfterAttempt(tx as never, appendEvent as never, {
        organizationId: 'org-1',
        conversationId: 'conv-1',
        batchId: 'batch-1',
        attemptId: 'attempt-new',
        generation: 4,
      }),
    ).resolves.toBe('event-retry')

    expect(tx.aiInputBatch.update).not.toHaveBeenCalled()
    expect(appendEvent).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        payload: expect.objectContaining({
          attemptId: 'attempt-new',
          generation: 4,
          status: AiInputBatchStatus.agent_running,
        }),
      }),
    )
  })
})

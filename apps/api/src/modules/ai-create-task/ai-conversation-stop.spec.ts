import { AiConversationService } from './ai-conversation.service'

function setup() {
  const task = {
    id: 'task-1', organizationId: 'org-1', ownerUserId: 'user-1',
    type: 'departure_collaboration', status: 'active', departureId: 'departure-1',
    departureCreationTask: null,
  }
  const batch = {
    id: 'batch-1', organizationId: 'org-1', conversationId: 'conversation-1',
    status: 'agent_running', conversationVersion: 1, sources: [],
    taskLinks: [{ taskId: task.id, role: 'primary' }],
  }
  const write = jest.fn().mockResolvedValue({ count: 1 })
  const draftRead = jest.fn().mockResolvedValue(null)
  const clear = jest.fn().mockResolvedValue(undefined)
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    aiConversation: {
      findFirst: jest.fn().mockResolvedValue({ id: batch.conversationId, creatorUserId: 'user-1', status: 'open' }),
      update: jest.fn(),
    },
    aiCreateTask: { findFirst: draftRead },
    conversationTaskLink: { findMany: jest.fn().mockResolvedValue([{ task }]) },
    aiCreateIdempotencyRecord: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockImplementation(({ create }) => ({ ...create, id: 'key-1' })),
      update: jest.fn(),
    },
    aiInputBatch: {
      findFirst: jest.fn().mockResolvedValue(batch),
      update: jest.fn().mockImplementation(({ data }) => ({ ...batch, ...data })),
    },
    aiWorkflowJob: { updateMany: write },
    aiAgentAttempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }), updateMany: write },
    aiConversationInteraction: { updateMany: write },
    aiConversationEvent: {
      findFirst: jest.fn().mockResolvedValue({ sequence: 2 }),
      create: jest.fn().mockImplementation(({ data }) => ({ ...data, id: 'event-3', createdAt: new Date() })),
    },
  }
  const service = new AiConversationService(
    { ...tx, $transaction: (fn: (client: typeof tx) => unknown) => fn(tx) } as never,
    { get: (key: string) => key === 'app.aiCreateAssist.enabled' ? true : [] } as never,
    { getPermissionKeysForUser: jest.fn().mockResolvedValue(['departure:write']) } as never,
    { publish: jest.fn() } as never, {} as never, {} as never, { clear } as never,
  )
  return { service, task, write, draftRead, clear }
}

describe('stop a formal departure collaboration batch', () => {
  it('cancels the attempt and returns user_stop without requiring a creation draft', async () => {
    const { service, draftRead, clear, write } = setup()
    const result = await service.stopBatch('org-1', 'user-1', undefined, 'conversation-1', 'batch-1', 'stop-1')
    expect(result.batch?.status).toBe('cancelled')
    expect(result.events).toEqual([expect.objectContaining({
      kind: 'batch_status', payload: expect.objectContaining({ status: 'cancelled', reason: 'user_stop' }),
    })])
    expect(draftRead).not.toHaveBeenCalled()
    expect(clear).toHaveBeenCalledWith('attempt-1')
    expect(write).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ errorCode: 'BATCH_CANCELLED' }),
    }))
  })

  it.each([
    { ownerUserId: 'other-user' },
    { organizationId: 'other-org' },
    { status: 'closed' },
  ])('does not cancel an inaccessible or closed task: %j', async (invalid) => {
    const { service, task, write } = setup()
    Object.assign(task, invalid)
    await expect(service.stopBatch('org-1', 'user-1', undefined, 'conversation-1', 'batch-1', 'stop-1')).rejects.toThrow()
    expect(write).not.toHaveBeenCalled()
  })
})

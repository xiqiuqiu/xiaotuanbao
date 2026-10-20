import { AiConversationService } from './ai-conversation.service'

function setup(pendingIds: string[], pendingInteractionBatches: string[] = []) {
  const batches = ['original', 'revision-1', 'revision-2', 'multi'].map((id, index) => ({
    id, conversationId: 'conv-1', conversationVersion: index + 1,
    taskLinks: [{ taskId: 'task-1' }],
    status: pendingInteractionBatches.includes(id) ? 'awaiting_user_input' : 'awaiting_review', userMessageEventId: `message-${id}`,
  }))
  const messages = [
    { batchId: 'original', reviewPackageIds: ['pkg-a', 'pkg-b'] },
    { batchId: 'revision-1', reviewPackageId: 'pkg-b' },
    { batchId: 'revision-2', reviewPackageIds: ['pkg-b'] },
    { batchId: 'multi', reviewPackageIds: ['pkg-b', 'pkg-c'] },
  ]
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    aiReviewPackage: {
      findFirst: jest.fn().mockResolvedValue({ conversationId: 'conv-1' }),
      count: jest.fn(({ where }) => Promise.resolve(where.taskId ? pendingIds.length : pendingIds.filter((id) =>
        id !== where.id.not && (where.OR[1].id.in.includes(id) || (where.OR[0].inputBatchId === 'original' && ['pkg-a', 'pkg-b'].includes(id))),
      ).length)),
    },
    aiConversationInteraction: { count: jest.fn(({ where }) => Promise.resolve(where.inputBatch ? pendingInteractionBatches.length : pendingInteractionBatches.includes(where.inputBatchId) ? 1 : 0)) },
    aiInputBatch: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn(({ where }) => Promise.resolve(where.id?.in
        ? batches.filter((batch) => where.id.in.includes(batch.id) && (typeof where.status === 'string' ? batch.status === where.status : where.status.in.includes(batch.status)) && (where.OR ? where.OR.some((scope: { id?: { in: string[] }; taskLinks?: { some: { taskId: string } } }) => scope.id?.in?.includes(batch.id) || batch.taskLinks.some((link) => link.taskId === scope.taskLinks?.some.taskId)) : batch.taskLinks.some((link) => link.taskId === where.taskLinks?.some?.taskId)))
        : [])),
      create: jest.fn().mockResolvedValue({ id: 'continuation' }),
      update: jest.fn(({ where, data }) => {
        const batch = batches.find((item) => item.id === where.id)!
        Object.assign(batch, data)
        return Promise.resolve(batch)
      }),
    },
    aiConversationEvent: {
      findMany: jest.fn().mockResolvedValue(messages.map((payload) => ({ payload }))),
      findFirst: jest.fn().mockResolvedValue({ sequence: 20 }),
      create: jest.fn(({ data }) => Promise.resolve({ ...data, id: 'event', sequence: 21, createdAt: new Date() })),
    },
    agentTask: { findFirst: jest.fn().mockResolvedValue({ type: 'departure_collaboration' }), updateMany: jest.fn() },
    taskActivity: { create: jest.fn() },
    aiConversation: { update: jest.fn() },
    aiWorkflowJob: { create: jest.fn() },
  }
  const service = new AiConversationService({} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never)
  return { tx, service, batches }
}

describe('revision batches finish with the reviewed item', () => {
  it('finishes all revisions, keeping any batch with another pending item waiting', async () => {
    const { tx, service, batches } = setup(['pkg-a', 'pkg-c'])
    const events = await service.finalizeReviewDisposition(tx as never, {
      organizationId: 'org-1', taskId: 'task-1', userId: 'user-1',
      reviewPackageId: 'pkg-b', inputBatchId: 'original', disposition: 'confirmed',
    })
    expect(batches.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: 'original', status: 'awaiting_review' },
      { id: 'revision-1', status: 'completed' },
      { id: 'revision-2', status: 'completed' },
      { id: 'multi', status: 'awaiting_review' },
    ])
    expect(events).toHaveLength(4)
    expect(tx.agentTask.updateMany).not.toHaveBeenCalled()
  })

  it('reconciles stranded completed revisions without finishing another pending item', async () => {
    const { tx, service, batches } = setup(['pkg-a'])
    const events = await service.finalizeReviewDisposition(tx as never, {
      organizationId: 'org-1', taskId: 'task-1', userId: 'user-1',
      reviewPackageId: 'pkg-c', inputBatchId: null, disposition: 'confirmed',
    })
    expect(batches.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: 'original', status: 'awaiting_review' },
      { id: 'revision-1', status: 'completed' },
      { id: 'revision-2', status: 'completed' },
      { id: 'multi', status: 'completed' },
    ])
    expect(events).toHaveLength(3)
    expect(tx.agentTask.updateMany).not.toHaveBeenCalled()
    expect(events[0].payload).toEqual({ batchId: 'revision-1', status: 'completed', reason: 'review_items_completed' })
    expect(tx.taskActivity.create).toHaveBeenCalledTimes(1)
  })
  it('reactivates the task only after its last pending review is disposed', async () => {
    const { tx, service } = setup([])
    await service.finalizeReviewDisposition(tx as never, {
      organizationId: 'org-1', taskId: 'task-1', userId: 'user-1',
      reviewPackageId: 'pkg-b', inputBatchId: 'original', disposition: 'confirmed',
    })
    expect(tx.aiReviewPackage.count).toHaveBeenCalledWith({ where: { organizationId: 'org-1', taskId: 'task-1', status: 'pending' } })
    expect(tx.agentTask.updateMany).toHaveBeenCalledWith({
      where: { id: 'task-1', status: 'waiting' },
      data: { status: 'active', statusVersion: { increment: 1 } },
    })
  })

  it('cancels only batches without remaining review items and reconciles their revision batches', async () => {
    const { tx, service, batches } = setup(['pkg-a', 'pkg-c'])
    await service.finalizeReviewCancel(tx as never, {
      organizationId: 'org-1', taskId: 'task-1', userId: 'user-1', conversationId: 'conv-1',
      reviewPackageId: 'pkg-b', inputBatchId: 'original',
    })
    expect(batches.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: 'original', status: 'awaiting_review' },
      { id: 'revision-1', status: 'cancelled' },
      { id: 'revision-2', status: 'cancelled' },
      { id: 'multi', status: 'awaiting_review' },
    ])
    expect(tx.agentTask.updateMany).not.toHaveBeenCalled()
  })

})

it.each(['confirmed', 'cancelled'] as const)('keeps sibling clarifications pending after the last review is %s', async (disposition) => {
  const { tx, service, batches } = setup([], ['original'])
  tx.agentTask.findFirst.mockResolvedValue({ type: 'departure_creation' })
  await service.finalizeReviewDisposition(tx as never, {
    organizationId: 'org-1', taskId: 'task-1', userId: 'user-1',
    reviewPackageId: 'pkg-b', inputBatchId: 'original', disposition,
  })
  expect(tx.aiConversationInteraction.count).toHaveBeenCalledWith({ where: {
    organizationId: 'org-1', inputBatchId: 'original', status: 'pending',
  } })
  expect(batches[0].status).toBe('awaiting_user_input')
  expect(tx.aiInputBatch.create).not.toHaveBeenCalled()
  expect(tx.agentTask.updateMany).not.toHaveBeenCalled()
  expect(tx.aiConversationEvent.create).not.toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ kind: 'agent_message' }),
  }))
})

it('records one creation receipt without a model batch when all waiting items are resolved', async () => {
  const { tx, service } = setup([])
  tx.agentTask.findFirst.mockResolvedValue({ type: 'departure_creation' })
  const params = {
    organizationId: 'org-1', taskId: 'task-1', userId: 'user-1',
    reviewPackageId: 'pkg-b', inputBatchId: 'original', disposition: 'confirmed' as const,
  }
  await service.finalizeReviewDisposition(tx as never, params)
  await service.finalizeReviewDisposition(tx as never, params)
  expect(tx.aiInputBatch.create).not.toHaveBeenCalled()
  expect(tx.aiWorkflowJob.create).not.toHaveBeenCalled()
  expect(tx.aiConversationEvent.create.mock.calls.filter(([{ data }]) => data.kind === 'agent_message'))
    .toEqual([[{ data: expect.objectContaining({
      conversationId: 'conv-1', kind: 'agent_message', payload: {
        taskId: 'task-1', batchId: 'original', text: '本次审核建议已写入建团草稿。',
      },
    }) }]])
})

it('finishes a legacy unlinked review batch without touching another task batch', async () => {
  const { tx, service, batches } = setup([])
  batches[0].taskLinks = []
  batches[1].taskLinks = [{ taskId: 'other-task' }]
  tx.aiReviewPackage.findFirst.mockResolvedValue({ conversationId: 'conv-1', inputBatchId: 'original' })
  tx.aiConversationEvent.findMany.mockResolvedValue([
    { payload: { batchId: 'revision-1', reviewPackageId: 'other-task-review' } },
  ])
  const events = await service.finalizeReviewDisposition(tx as never, {
    organizationId: 'org-1', taskId: 'task-1', userId: 'user-1', reviewPackageId: 'pkg-b', inputBatchId: 'original', disposition: 'confirmed',
  })
  expect(batches[0].status).toBe('completed')
  expect(batches[1].status).toBe('awaiting_review')
  expect(events.map((event) => event.payload)).toEqual([{ batchId: 'original', status: 'completed', reviewPackageId: 'pkg-b', disposition: 'confirmed' }])
  expect(tx.agentTask.updateMany).toHaveBeenCalledWith({ where: { id: 'task-1', status: 'waiting' }, data: { status: 'active', statusVersion: { increment: 1 } } })
})

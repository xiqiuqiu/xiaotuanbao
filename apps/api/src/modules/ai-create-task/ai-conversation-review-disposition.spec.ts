import { AiConversationService } from './ai-conversation.service'

function setup(pendingIds: string[]) {
  const batches = ['original', 'revision-1', 'revision-2', 'multi'].map((id, index) => ({
    id, conversationId: 'conv-1', conversationVersion: index + 1,
    status: 'awaiting_review', userMessageEventId: `message-${id}`,
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
    aiInputBatch: {
      findMany: jest.fn(({ where }) => Promise.resolve(batches.filter((batch) => where.id.in.includes(batch.id) && batch.status === 'awaiting_review'))),
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

})

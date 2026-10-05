import { AgentExecutionRouter } from './agent-execution-router'
import { AiConversationService } from './ai-conversation.service'
import { AiWorkflowProcessor } from './ai-workflow.processor'
import { DEPARTURE_COLLABORATION_AGENT_DEFINITION_REF, SEGMENT_RESOURCE_CONFIRMATION_UNIT } from '@xiaotuanbao/ai-contracts'

function setup() {
  const update = jest.fn()
  const tx = {
    $queryRaw: jest.fn(),
    aiWorkflowJob: { findUniqueOrThrow: async () => ({ generation: 1 }), update },
    aiAgentAttempt: { findUnique: async () => ({ generation: 1, status: 'running' }), update },
    agentTask: { findUnique: async () => ({ status: 'active' }), updateMany: update },
    aiReviewPackage: {
      findUniqueOrThrow: async () => ({ confirmationUnit: SEGMENT_RESOURCE_CONFIRMATION_UNIT, targetId: 'departure' }),
      count: jest.fn().mockResolvedValue(1),
    },
    aiConversationEvent: { findMany: jest.fn().mockResolvedValue([]) },
    aiConversationInteraction: { create: jest.fn(), count: jest.fn().mockResolvedValue(1) },
    aiInputBatch: { update: jest.fn() }, taskActivity: { create: update }, aiConversation: { update },
  }
  const appendEvent = jest.fn(async (_tx, data) => ({ id: `event-${data.payload.requestItem?.id ?? 'status'}` }))
  const processor = Object.assign(Object.create(AiWorkflowProcessor.prototype), {
    logger: { log: jest.fn() },
    prisma: { $transaction: (run: (client: typeof tx) => Promise<void>) => run(tx) },
    ownsClaimedJob: async () => true,
    recheckAuthorization: async () => ({ ok: true }),
    conversationService: { appendEvent, pendingBatchStatus: AiConversationService.prototype.pendingBatchStatus }, projectReviewPackageViaGateway: jest.fn().mockResolvedValue('review-1'),
    writeManifestUsage: async () => {}, publishCommittedEvents: jest.fn(), persistFailure: jest.fn(),
  })
  const job = { id: 'job', taskId: 'task', organizationId: 'org', conversationId: 'chat', inputBatchId: 'batch' }
  const route = { kind: 'execution_definition', source: 'task', agentDefinition: DEPARTURE_COLLABORATION_AGENT_DEFINITION_REF, taskId: 'task' }
  const result = {
    kind: 'resolved_items', message: '已答复查询、准备审核，并等待日期澄清。',
    completionBasis: { kind: 'resolved_items' },
    reviewPackages: [{ objectVersion: 1, confirmationUnit: SEGMENT_RESOURCE_CONFIRMATION_UNIT, candidates: [{ fieldKey: 'title', proposedValue: '九月川西', evidence: [] }] }],
    items: [
      { id: 'query', request: '查团名', goal: 'answer', resolution: { kind: 'answered', message: '当前团名是川西团。' } },
      { id: 'change', request: '改资源名称', goal: 'propose_change', resolution: { kind: 'awaiting_review', reviewPackageIndexes: [0] } },
      { id: 'date', request: '日期顺延', goal: 'propose_change', resolution: { kind: 'awaiting_user_input', interaction: { type: 'free_text', prompt: '顺延几天？' } } },
    ],
  }
  return { processor, tx, appendEvent, job, route, result }
}

describe('Agent item outcomes', () => {
  it('atomically projects the answer, accepted review and persistent question without completing the batch', async () => {
    const { processor, tx, appendEvent, job, route, result } = setup()
    await processor.persistOutcome(job, route, {}, 'attempt', result, 'resolve_items')
    expect(processor.persistFailure).not.toHaveBeenCalled()
    expect(processor.projectReviewPackageViaGateway).toHaveBeenCalledWith(tx, job, 'attempt', result.reviewPackages[0], 'request:change:review:0')
    expect(appendEvent).toHaveBeenCalledWith(tx, expect.objectContaining({ payload: expect.objectContaining({ text: '当前团名是川西团。', requestItem: result.items[0] }) }))
    expect(appendEvent).toHaveBeenCalledWith(tx, expect.objectContaining({ payload: expect.objectContaining({ reviewPackageIds: ['review-1'], requestItem: result.items[1] }) }))
    expect(tx.aiConversationInteraction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ eventId: 'event-date', inputBatchId: 'batch', prompt: '顺延几天？' }) })
    expect(tx.aiInputBatch.update).toHaveBeenCalledWith({ where: { id: 'batch' }, data: { status: 'awaiting_user_input' } })
    expect(tx.aiAgentAttempt.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ resultJson: result }) }))
  })

  it('keeps a sibling pending review after an independent query is answered', async () => {
    const { processor, tx, job, route, result } = setup()
    tx.aiConversationInteraction.count.mockResolvedValue(0)
    result.items = result.items.slice(0, 1)
    result.reviewPackages = []
    await processor.persistOutcome(job, route, {}, 'attempt', result, 'resolve_items')
    expect(tx.aiInputBatch.update).toHaveBeenCalledWith({ where: { id: 'batch' }, data: { status: 'awaiting_review' } })
  })

  it('rejects a known change resolved as ordinary text before any projection', async () => {
    const { processor, job, route, result } = setup()
    result.items = [{ ...result.items[0], goal: 'propose_change' }]
    result.reviewPackages = []
    await processor.persistOutcome(job, route, {}, 'attempt', result, 'resolve_items')
    expect(processor.persistFailure).toHaveBeenCalledWith(job, 'AGENT_OUTCOME_INCOMPLETE', expect.objectContaining({ kind: 'failed' }), 'attempt')
    expect(processor.projectReviewPackageViaGateway).not.toHaveBeenCalled()
  })

  it('restores the exact replied-to change item instead of treating the reply as a fresh query', async () => {
    const { processor, job, result } = setup()
    processor.prisma.aiAgentAttempt = { findFirst: jest.fn().mockResolvedValue(null) }
    processor.prisma.aiConversationEvent = { findFirst: jest.fn().mockResolvedValue({ payload: { requestItem: result.items[2] } }) }
    await expect(processor.loadPendingItems({ ...job, inputBatch: { replyToEventId: 'event-date', conversationVersion: 9 } })).resolves.toEqual([
      { id: 'date', request: '日期顺延', goal: 'propose_change' },
    ])
    expect(processor.prisma.aiConversationEvent.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org', conversationId: 'chat', sequence: { lte: 9 } }) }))
  })
  it('keeps a revision waiting when its accepted review belongs to an older input batch', async () => {
    const { processor, tx, job, route, result } = setup()
    tx.aiConversationInteraction.count.mockResolvedValue(0)
    tx.aiReviewPackage.count.mockImplementation(({ where }) => Promise.resolve(
      where.OR?.some((entry: { id?: { in: string[] } }) => entry.id?.in.includes('review-1')) ? 1 : 0,
    ))
    tx.aiConversationEvent.findMany.mockResolvedValue([{ payload: { reviewPackageIds: ['review-1'] } }])
    result.items = result.items.slice(0, 2)
    await processor.persistOutcome(job, route, {}, 'attempt', result, 'resolve_items')
    expect(tx.aiInputBatch.update).toHaveBeenCalledWith({ where: { id: 'batch' }, data: { status: 'awaiting_review' } })
  })

  it('prefers the same-batch task handoff over the question that originally opened the batch', async () => {
    const { processor, job } = setup()
    processor.prisma.aiAgentAttempt = { findFirst: jest.fn().mockResolvedValue({ resultJson: {
      kind: 'resolved_items', message: '创建任务', completionBasis: { kind: 'resolved_items' }, reviewPackages: [],
      items: [{ id: 'create', request: '创建川西团', goal: 'governed_action', resolution: {
        kind: 'registered_intent', intent: { key: 'task.departure-creation.requested', confidence: 'high', goal: '创建川西团' },
      } }],
    } }) }
    processor.prisma.aiConversationEvent = { findFirst: jest.fn().mockResolvedValue({ payload: {
      requestItem: { id: 'create', request: '创建川西团', goal: 'governed_action' },
    } }) }
    await expect(processor.loadPendingItems({ ...job, inputBatch: { replyToEventId: 'old-question', conversationVersion: 9 } })).resolves.toEqual([
      { id: 'create', request: '创建川西团', goal: 'propose_change' },
    ])
  })

  it('keeps the task waiting for a sibling question in another batch', async () => {
    const { processor, tx, job, route, result } = setup()
    result.items = result.items.slice(0, 1)
    result.reviewPackages = []
    tx.aiConversationInteraction.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1)
    tx.aiReviewPackage.count.mockResolvedValue(0)
    await processor.persistOutcome(job, route, {}, 'attempt', result, 'resolve_items')
    expect(tx.aiInputBatch.update).toHaveBeenCalledWith({ where: { id: 'batch' }, data: { status: 'completed' } })
    expect(tx.agentTask.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'waiting', statusVersion: { increment: 1 } } }))
  })

  it('routes a reply to the attempt that asked the question, not a later task in the same batch', async () => {
    const { processor, job } = setup()
    const original = { taskId: 'original-task', agentDefinitionKey: 'departure.collaboration', agentDefinitionVersion: 1 }
    processor.pageLocatorResolver = { resolve: async () => null }
    processor.executionRouter = new AgentExecutionRouter()
    processor.prisma.inputBatchTaskLink = { findMany: async () => [] }
    processor.prisma.aiConversationInteraction = { findUnique: async () => ({
      id: 'question', inputBatchId: 'original-batch', event: { payload: { attemptId: 'original-attempt' } },
      inputBatch: { agentAttempts: [{ taskId: 'new-task', agentDefinitionKey: 'departure.create', agentDefinitionVersion: 1 }] },
    }) }
    processor.prisma.aiConversationEvent = { findFirst: async () => ({ payload: {} }) }
    processor.prisma.aiAgentAttempt = { findFirst: jest.fn().mockResolvedValue(original) }
    const actual = await processor.resolveExecutionRoute({ ...job, inputBatch: {
      replyToEventId: 'question-event', creatorUserId: 'user', conversationVersion: 10,
    } })
    expect(actual.route).toMatchObject({ taskId: 'original-task', agentDefinition: DEPARTURE_COLLABORATION_AGENT_DEFINITION_REF })
    expect(processor.prisma.aiAgentAttempt.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
      id: 'original-attempt', organizationId: 'org', conversationId: 'chat', inputBatchId: 'original-batch',
    } }))
  })

})

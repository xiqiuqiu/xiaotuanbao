import { AiWorkflowProcessor } from './ai-workflow.processor'
import { AgentExecutionRouter } from './agent-execution-router'

describe('new departure from an existing collaboration', () => {
  it('routes a registered new goal into a proposal instead of swallowing it as an old-task reply', async () => {
    const persistTaskCreationProposal = jest.fn()
    const processor = Object.assign(Object.create(AiWorkflowProcessor.prototype), {
      executionRouter: new AgentExecutionRouter(), persistTaskCreationProposal,
    })
    await processor.persistOutcome({}, { kind: 'execution_definition', taskId: 'old' }, {
      associations: { taskRefs: [{ taskId: 'old', role: 'primary', taskType: 'departure_collaboration' }] },
    }, 'attempt', { kind: 'registered_intent', intent: { key: 'task.departure-creation.requested', goal: '创建新团' } })
    expect(persistTaskCreationProposal).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'attempt', expect.anything(), expect.objectContaining({ kind: 'task_creation_proposal', taskType: 'departure_creation' }))
  })

  it('continues the created task even when the input batch still links to its old primary task', async () => {
    const processor = Object.assign(Object.create(AiWorkflowProcessor.prototype), {
      executionRouter: new AgentExecutionRouter(), pageLocatorResolver: { resolve: async () => null },
      prisma: {
        inputBatchTaskLink: { findMany: async () => [
          { taskId: 'old', role: 'primary', task: { type: 'departure_collaboration' } },
          { taskId: 'new', role: 'created', task: { type: 'departure_creation' } },
        ] },
        aiConversationEvent: { findFirst: async () => null },
      },
    })
    const result = await processor.resolveExecutionRoute({ organizationId: 'org', conversationId: 'chat', inputBatchId: 'batch', taskId: 'new', inputBatch: { creatorUserId: 'user', conversationVersion: 1 } })
    expect(result.route).toMatchObject({ taskId: 'new', agentDefinition: { key: 'departure.create' } })
  })
})

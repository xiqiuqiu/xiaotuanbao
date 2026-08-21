import type { GetTaskContextOutput } from '@xiaotuanbao/ai-contracts'
import { AiActionGateway } from '../ai-action/ai-action.gateway'
import { FailingAiActionStore, InMemoryAiActionStore } from '../ai-action/ai-action.in-memory.store'
import type { AiActionStore } from '../ai-action/ai-action.types'
import { AiCollaborationHttpException } from './ai-collaboration.http-exception'
import type { AiCreateTaskService } from './ai-create-task.service'
import type { AiToolRequestUser } from './ai-operation-delegation.guard'
import { AiToolHttpAdapter } from './ai-tool-http.adapter'

const user: AiToolRequestUser = {
  userId: 'user-1',
  organizationId: 'org-1',
  taskId: 'task-1',
  runId: 'run-1',
  conversationId: 'conv-1',
  inputBatchId: 'batch-1',
  attemptId: 'attempt-1',
}

const contextPayload = {
  task: { id: 'task-1', status: 'in_progress', currentPhase: 'basic_info', creatorUserId: 'user-1' },
  snapshot: { mode: 'manual', routeName: '川西环线' },
} as GetTaskContextOutput

function adapterWith(
  store: AiActionStore,
  getTaskContextForAgent: () => Promise<GetTaskContextOutput> = async () => contextPayload,
) {
  const tasks = { getTaskContextForAgent } as unknown as AiCreateTaskService
  return new AiToolHttpAdapter(new AiActionGateway(store), tasks)
}

describe('AiToolHttpAdapter.getTaskContext', () => {
  it('returns the original task context and leaves a read AI action', async () => {
    const store = new InMemoryAiActionStore()
    const adapter = adapterWith(store)

    const result = await adapter.getTaskContext(user, { taskId: 'task-1', runId: 'run-1' })

    expect(result).toBe(contextPayload)
    expect(store.records).toHaveLength(1)
    expect(store.records[0]).toMatchObject({
      name: 'getTaskContext',
      kind: 'read',
      decision: 'allow',
      reasonCode: 'OBSERVATION_PERIOD',
      executionStatus: 'succeeded',
      targetRef: { kind: 'ai_create_task', id: 'task-1' },
    })
  })

  it('still returns the original task context when the decision cannot persist', async () => {
    const adapter = adapterWith(new FailingAiActionStore())

    await expect(adapter.getTaskContext(user, { taskId: 'task-1', runId: 'run-1' })).resolves.toBe(
      contextPayload,
    )
  })

  it('rejects a claimed task that is not the delegated task without returning context', async () => {
    const leakedContext = { ...contextPayload, snapshot: { mode: 'manual', routeName: '别家团' } }
    const adapter = adapterWith(new InMemoryAiActionStore(), async () => leakedContext as GetTaskContextOutput)

    await expect(
      adapter.getTaskContext(user, { taskId: 'task-other-org', runId: 'run-1' }),
    ).rejects.toBeInstanceOf(AiCollaborationHttpException)
  })
})


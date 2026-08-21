import type {
  GetMaterialParseResultOutput,
  GetTaskContextOutput,
  SearchRouteTemplatesOutput,
} from '@xiaotuanbao/ai-contracts'
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

const searchPayload = {
  items: [
    {
      id: 'tpl-1',
      name: '川西环线',
      defaultDayCount: 8,
      usageCount: 3,
      updatedAt: '2026-08-01T00:00:00.000Z',
      matchReasons: [{ code: 'name_contains_token', token: '川西' }],
    },
  ],
} as SearchRouteTemplatesOutput

const parsePayload = {
  materialId: 'mat-1',
  parseResultVersion: 1,
  pageCount: 1,
  truncated: false,
  pages: [{ pageNumber: 1, source: 'ocr', text: '行程' }],
} as GetMaterialParseResultOutput

function adapterWith(
  store: AiActionStore,
  methods: {
    getTaskContextForAgent?: () => Promise<GetTaskContextOutput>
    searchRouteTemplatesForAgent?: () => Promise<SearchRouteTemplatesOutput>
    getMaterialParseResultForAgent?: () => Promise<GetMaterialParseResultOutput>
  } = {},
) {
  const tasks = {
    getTaskContextForAgent: methods.getTaskContextForAgent ?? (async () => contextPayload),
    searchRouteTemplatesForAgent: methods.searchRouteTemplatesForAgent ?? (async () => searchPayload),
    getMaterialParseResultForAgent:
      methods.getMaterialParseResultForAgent ?? (async () => parsePayload),
  } as unknown as AiCreateTaskService
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
    const adapter = adapterWith(new InMemoryAiActionStore(), {
      getTaskContextForAgent: async () => leakedContext as GetTaskContextOutput,
    })

    await expect(
      adapter.getTaskContext(user, { taskId: 'task-other-org', runId: 'run-1' }),
    ).rejects.toBeInstanceOf(AiCollaborationHttpException)
  })
})

describe('AiToolHttpAdapter.searchRouteTemplates', () => {
  it('returns the original route catalog matches and leaves a read AI action', async () => {
    const store = new InMemoryAiActionStore()
    const adapter = adapterWith(store)

    const result = await adapter.searchRouteTemplates(user, {
      taskId: 'task-1',
      runId: 'run-1',
      keyword: '川西',
    })

    expect(result).toBe(searchPayload)
    expect(store.records).toHaveLength(1)
    expect(store.records[0]).toMatchObject({
      name: 'searchRouteTemplates',
      kind: 'read',
      decision: 'allow',
      reasonCode: 'OBSERVATION_PERIOD',
      executionStatus: 'succeeded',
      targetRef: { kind: 'route_template_catalog', id: 'org-1' },
    })
  })

  it('still returns the original matches when the decision cannot persist', async () => {
    const adapter = adapterWith(new FailingAiActionStore())

    await expect(
      adapter.searchRouteTemplates(user, { taskId: 'task-1', runId: 'run-1', keyword: '川西' }),
    ).resolves.toBe(searchPayload)
  })

  it('rejects a claimed organization that is not the delegated organization without returning matches', async () => {
    const leakedItems = {
      items: [{ ...searchPayload.items[0], id: 'tpl-other', name: '别家路线' }],
    }
    const adapter = adapterWith(new InMemoryAiActionStore(), {
      searchRouteTemplatesForAgent: async () => leakedItems as SearchRouteTemplatesOutput,
    })

    await expect(
      adapter.searchRouteTemplates(user, {
        taskId: 'task-1',
        runId: 'run-1',
        organizationId: 'org-other',
        keyword: '川西',
      }),
    ).rejects.toBeInstanceOf(AiCollaborationHttpException)
  })
})

describe('AiToolHttpAdapter.getMaterialParseResult', () => {
  it('returns the original parse result and leaves a read AI action', async () => {
    const store = new InMemoryAiActionStore()
    const adapter = adapterWith(store)

    const result = await adapter.getMaterialParseResult(user, {
      taskId: 'task-1',
      runId: 'run-1',
      materialId: 'mat-1',
      parseResultVersion: 1,
    })

    expect(result).toBe(parsePayload)
    expect(store.records).toHaveLength(1)
    expect(store.records[0]).toMatchObject({
      name: 'getMaterialParseResult',
      kind: 'read',
      decision: 'allow',
      reasonCode: 'OBSERVATION_PERIOD',
      executionStatus: 'succeeded',
      targetRef: { kind: 'departure_material', id: 'mat-1' },
    })
  })

  it('still returns the original parse result when the decision cannot persist', async () => {
    const adapter = adapterWith(new FailingAiActionStore())

    await expect(
      adapter.getMaterialParseResult(user, {
        taskId: 'task-1',
        runId: 'run-1',
        materialId: 'mat-1',
        parseResultVersion: 1,
      }),
    ).resolves.toBe(parsePayload)
  })

  it('rejects a claimed task that is not the delegated task without returning parse result', async () => {
    const leakedParse = {
      ...parsePayload,
      materialId: 'mat-other',
      pages: [{ pageNumber: 1, source: 'ocr', text: '别家资料' }],
    }
    const adapter = adapterWith(new InMemoryAiActionStore(), {
      getMaterialParseResultForAgent: async () => leakedParse as GetMaterialParseResultOutput,
    })

    await expect(
      adapter.getMaterialParseResult(user, {
        taskId: 'task-other',
        runId: 'run-1',
        materialId: 'mat-other',
        parseResultVersion: 1,
      }),
    ).rejects.toBeInstanceOf(AiCollaborationHttpException)
  })
})



import {
  AI_CREATE_AGENT_DEFINITION_REF,
  AI_CREATE_CAPABILITY_REFS_BY_TOOL,
  type GetMaterialParseResultOutput,
  type GetTaskContextOutput,
  type SearchRouteTemplatesOutput,
  type SubmitReviewPackageOutput,
} from '@xiaotuanbao/ai-contracts'
import { AiActionGateway } from '../ai-action/ai-action.gateway'
import { FailingAiActionStore, InMemoryAiActionStore } from '../ai-action/ai-action.in-memory.store'
import { authorityForActor } from '../ai-action/ai-action.in-memory.target-authority'
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
  agentDefinition: AI_CREATE_AGENT_DEFINITION_REF,
  grantedCapabilities: Object.values(AI_CREATE_CAPABILITY_REFS_BY_TOOL),
  entitlementStatus: 'unavailable',
  objectScopes: [{ organizationId: 'org-1', kind: 'ai_create_task', id: 'task-1' }],
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

const reviewOutput = {
  reviewPackageId: 'pkg-1',
  status: 'pending',
  objectVersion: 1,
  fieldKeys: ['name'],
} as SubmitReviewPackageOutput

const reviewInput = {
  taskId: 'task-1',
  runId: 'run-1',
  objectVersion: 1,
  confirmationUnit: 'basic_info_draft',
  candidates: [
    {
      fieldKey: 'name',
      proposedValue: '候选团名-含证件号110101199001011234',
      clarity: 'clear',
      evidence: [{ kind: 'user_message', excerpt: '护照页原文 E12345678', sequence: 1 }],
    },
  ],
}

function adapterWith(
  store: AiActionStore,
  methods: {
    getTaskContextForAgent?: () => Promise<GetTaskContextOutput>
    searchRouteTemplatesForAgent?: () => Promise<SearchRouteTemplatesOutput>
    getMaterialParseResultForAgent?: (
      caller?: AiToolRequestUser,
      rawInput?: unknown,
    ) => Promise<GetMaterialParseResultOutput>
    submitReviewPackageForAgent?: (
      caller: AiToolRequestUser,
      rawInput: unknown,
      options?: { sourceActionId: string },
    ) => Promise<SubmitReviewPackageOutput>
  } = {},
) {
  const tasks = {
    getTaskContextForAgent: methods.getTaskContextForAgent ?? (async () => contextPayload),
    searchRouteTemplatesForAgent: methods.searchRouteTemplatesForAgent ?? (async () => searchPayload),
    getMaterialParseResultForAgent:
      methods.getMaterialParseResultForAgent ?? (async () => parsePayload),
    submitReviewPackageForAgent: methods.submitReviewPackageForAgent ?? (async () => reviewOutput),
  } as unknown as AiCreateTaskService
  return new AiToolHttpAdapter(new AiActionGateway(store, authorityForActor(user)), tasks)
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

  it('returns task context when the payload claims a leaked organizationId', async () => {
    const store = new InMemoryAiActionStore()
    const adapter = adapterWith(store)

    const result = await adapter.getTaskContext(user, {
      taskId: 'task-1',
      runId: 'run-1',
      organizationId: 'leak',
    })

    expect(result).toBe(contextPayload)
    expect(store.records[0]).toMatchObject({
      name: 'getTaskContext',
      decision: 'allow',
      executionStatus: 'succeeded',
    })
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

  it('forwards the normalized material target instead of rebuilding identity from the model payload', async () => {
    const received: unknown[] = []
    const adapter = adapterWith(new InMemoryAiActionStore(), {
      getMaterialParseResultForAgent: async (_caller, rawInput) => {
        received.push(rawInput)
        return parsePayload
      },
    })

    await adapter.getMaterialParseResult(user, {
      taskId: 'task-1',
      runId: 'run-1',
      materialId: 'mat-1',
      parseResultVersion: 1,
      pageNumber: 1,
    })

    expect(received).toEqual([
      {
        taskId: 'task-1',
        runId: 'run-1',
        materialId: 'mat-1',
        parseResultVersion: 1,
        pageNumber: 1,
      },
    ])
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

describe('AiToolHttpAdapter.submitReviewPackage', () => {
  it('returns the original pending package result and leaves a review AI action', async () => {
    const store = new InMemoryAiActionStore()
    const forwarded: Array<{ sourceActionId: string | undefined; input: unknown }> = []
    const adapter = adapterWith(store, {
      submitReviewPackageForAgent: async (_caller, rawInput, options) => {
        forwarded.push({ sourceActionId: options?.sourceActionId, input: rawInput })
        return reviewOutput
      },
    })

    const result = await adapter.submitReviewPackage(user, reviewInput)

    expect(result).toBe(reviewOutput)
    expect(forwarded).toEqual([
      {
        sourceActionId: store.records[0]?.id,
        input: {
          taskId: 'task-1',
          runId: 'run-1',
          objectVersion: 1,
          confirmationUnit: 'basic_info_draft',
          candidates: reviewInput.candidates,
        },
      },
    ])
    expect(store.records).toHaveLength(1)
    expect(store.records[0]).toMatchObject({
      name: 'submitReviewPackage',
      kind: 'write',
      decision: 'review',
      reasonCode: 'OBSERVATION_PERIOD',
      executionStatus: 'succeeded',
      targetRef: { kind: 'departure_creation_draft', id: 'draft-1' },
      candidateFieldKeys: ['name'],
    })
    expect(JSON.stringify(store.records[0])).not.toContain('110101199001011234')
    expect(JSON.stringify(store.records[0])).not.toContain('护照页原文')
  })

  it('still returns the original pending-review error when a package is already pending, and leaves an AI action', async () => {
    const store = new InMemoryAiActionStore()
    const adapter = adapterWith(store, {
      submitReviewPackageForAgent: async () => {
        throw AiCollaborationHttpException.fromCode('REVIEW_PENDING')
      },
    })

    await expect(adapter.submitReviewPackage(user, reviewInput)).rejects.toMatchObject({
      response: {
        data: { code: 'REVIEW_PENDING' },
      },
    })
    expect(store.records).toHaveLength(1)
    expect(store.records[0]).toMatchObject({
      name: 'submitReviewPackage',
      kind: 'write',
      decision: 'review',
      executionStatus: 'failed',
    })
  })

  it('does not forward a write when the decision cannot persist', async () => {
    const forwarded: unknown[] = []
    const adapter = adapterWith(new FailingAiActionStore(), {
      submitReviewPackageForAgent: async () => {
        forwarded.push('called')
        return reviewOutput
      },
    })

    await expect(adapter.submitReviewPackage(user, reviewInput)).rejects.toThrow(
      'decision store unavailable',
    )
    expect(forwarded).toEqual([])
  })

  it('rejects a stale objectVersion as VERSION_CONFLICT instead of unauthorized', async () => {
    const adapter = adapterWith(new InMemoryAiActionStore())

    await expect(
      adapter.submitReviewPackage(user, { ...reviewInput, objectVersion: 10 }),
    ).rejects.toMatchObject({
      response: {
        data: { code: 'VERSION_CONFLICT' },
      },
    })
  })

  it('replays the same proposal without an attempt onto the same AI action using the activity run', async () => {
    const store = new InMemoryAiActionStore()
    const userWithoutAttempt: AiToolRequestUser = { ...user, attemptId: undefined }
    const adapter = adapterWith(store)

    const first = await adapter.submitReviewPackage(userWithoutAttempt, reviewInput)
    const second = await adapter.submitReviewPackage(userWithoutAttempt, reviewInput)

    expect(first).toBe(reviewOutput)
    expect(second).toBe(reviewOutput)
    expect(store.records).toHaveLength(1)
  })
})

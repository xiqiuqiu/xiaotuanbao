import { AiActionGateway } from './ai-action.gateway'
import {
  AI_CREATE_AGENT_DEFINITION_REF,
  AI_CREATE_CAPABILITY_REFS_BY_TOOL,
  CONVERSATION_GENERAL_AGENT_DEFINITION_REF,
  CONVERSATION_HISTORY_READ_CAPABILITY_REF,
  CONVERSATION_PLAINTEXT_REPLY_CAPABILITY_REF,
  CONVERSATION_SOURCE_READ_CAPABILITY_REF,
} from '@xiaotuanbao/ai-contracts'
import { authorityForActor, InMemoryAiActionTargetAuthority } from './ai-action.in-memory.target-authority'
import {
  FailingAiActionStore,
  InMemoryAiActionStore,
  ObservationFailingAiActionStore,
} from './ai-action.in-memory.store'
import type { AiActionActor, AiActionStore } from './ai-action.types'

describe('AiActionGateway.execute', () => {
  const actor: AiActionActor = {
    organizationId: 'org-1',
    userId: 'user-1',
    taskId: 'task-1',
    conversationId: 'conv-1',
    inputBatchId: 'batch-1',
    agentDefinition: AI_CREATE_AGENT_DEFINITION_REF,
    grantedCapabilities: Object.values(AI_CREATE_CAPABILITY_REFS_BY_TOOL),
  }

  const reviewInput = {
    objectVersion: 1,
    candidates: [{ fieldKey: 'name', proposedValue: '新团名' }],
  }

  function createGateway(
    store: AiActionStore = new InMemoryAiActionStore(),
    forActor: AiActionActor = actor,
    authority = authorityForActor(forActor),
  ) {
    return new AiActionGateway(store, authority)
  }

  it('does not forward an unregistered action and still leaves a deny record', async () => {
    const store = new InMemoryAiActionStore()
    const gateway = createGateway(store)
    const forwarded: unknown[] = []

    const result = await gateway.execute({
      name: 'deleteDepartureForever',
      actor,
      input: { taskId: 'task-1' },
      forward: async (context) => {
        forwarded.push(context)
        return { ok: true }
      },
    })

    expect(forwarded).toEqual([])
    expect(result.result).toBeUndefined()
    expect(result.action).toMatchObject({
      name: 'deleteDepartureForever',
      decision: 'deny',
      reasonCode: 'UNREGISTERED',
      executionStatus: 'skipped',
    })
    expect(result.action?.id).toEqual(expect.any(String))
  })

  it.each(['constructor', 'toString', 'valueOf'] as const)(
    'does not treat Object.prototype.%s as a registered action',
    async (name) => {
      const gateway = createGateway()
      const forwarded: unknown[] = []

      const result = await gateway.execute({
        name,
        actor,
        input: {},
        forward: async (context) => {
          forwarded.push(context)
          return { ok: true }
        },
      })

      expect(forwarded).toEqual([])
      expect(result.action).toMatchObject({
        name,
        decision: 'deny',
        reasonCode: 'UNREGISTERED',
        executionStatus: 'skipped',
      })
    },
  )

  it('forwards a registered read and leaves an allow record', async () => {
    const gateway = createGateway()
    const contextPayload = { snapshot: { name: '川西环线' } }

    const result = await gateway.execute({
      name: 'getTaskContext',
      actor,
      input: { taskId: 'task-1', runId: 'run-1' },
      forward: async () => contextPayload,
    })

    expect(result.result).toBe(contextPayload)
    expect(result.action).toMatchObject({
      name: 'getTaskContext',
      kind: 'read',
      decision: 'allow',
      reasonCode: 'OBSERVATION_PERIOD',
      executionStatus: 'succeeded',
      agentDefinition: { key: 'departure.create', version: 1 },
      capability: { key: 'departure.task-context.read', version: 2 },
    })
    expect(result.action?.targetRef).toEqual({ kind: 'ai_create_task', id: 'task-1' })
  })

  it('does not let a late completion overwrite a skipped action', async () => {
    const store = new InMemoryAiActionStore()
    const gateway = createGateway(store)
    let releaseForward!: () => void
    const forwarded = new Promise<void>((resolve) => {
      releaseForward = resolve
    })

    const execution = gateway.execute({
      name: 'getTaskContext',
      actor,
      input: { taskId: 'task-1' },
      forward: async () => {
        await forwarded
        return { ok: true }
      },
    })
    await new Promise((resolve) => setImmediate(resolve))
    const action = store.records[0]
    expect(action).toBeDefined()
    await store.updateExecution(action!.id, 'skipped')
    releaseForward()

    await expect(execution).resolves.toMatchObject({
      action: { executionStatus: 'skipped' },
    })
  })

  it('does not forward a registered Capability missing from the Attempt grant snapshot', async () => {
    const gateway = createGateway()
    const forwarded: unknown[] = []

    const result = await gateway.execute({
      name: 'proposeReviewPackage',
      actor: {
        ...actor,
        grantedCapabilities: [AI_CREATE_CAPABILITY_REFS_BY_TOOL.getTaskContext],
      },
      input: reviewInput,
      forward: async () => forwarded.push('called'),
    })

    expect(forwarded).toEqual([])
    expect(result.action).toMatchObject({
      decision: 'deny',
      reasonCode: 'CAPABILITY_NOT_GRANTED',
      capability: AI_CREATE_CAPABILITY_REFS_BY_TOOL.submitReviewPackage,
    })
  })

  it('does not forward a write when the decision record cannot persist', async () => {
    const gateway = createGateway(new FailingAiActionStore())
    const forwarded: unknown[] = []

    await expect(
      gateway.execute({
        name: 'proposeReviewPackage',
        actor,
        input: reviewInput,
        forward: async (context) => {
          forwarded.push(context)
          return { reviewPackageId: 'pkg-1' }
        },
      }),
    ).rejects.toThrow('decision store unavailable')

    expect(forwarded).toEqual([])
  })

  it('still forwards a read when decision persistence fails', async () => {
    const gateway = createGateway(new FailingAiActionStore())
    const contextPayload = { snapshot: { name: '川西环线' } }

    const result = await gateway.execute({
      name: 'getTaskContext',
      actor,
      input: { taskId: 'task-1', runId: 'run-1' },
      forward: async () => contextPayload,
    })

    expect(result.action).toBeNull()
    expect(result.result).toBe(contextPayload)
  })

  it('records searchRouteTemplates against the organization route catalog', async () => {
    const gateway = createGateway()
    const items = { items: [{ id: 'tpl-1', name: '川西环线' }] }

    const result = await gateway.execute({
      name: 'searchRouteTemplates',
      actor,
      input: { taskId: 'task-1', runId: 'run-1', keyword: '川西' },
      forward: async () => items,
    })

    expect(result.result).toBe(items)
    expect(result.action).toMatchObject({
      name: 'searchRouteTemplates',
      kind: 'read',
      decision: 'allow',
      reasonCode: 'OBSERVATION_PERIOD',
      executionStatus: 'succeeded',
      targetRef: { kind: 'route_template_catalog', id: 'org-1' },
    })
  })

  it('does not forward searchRouteTemplates when the claimed organization is not the delegated organization', async () => {
    const store = new InMemoryAiActionStore()
    const gateway = createGateway(store)
    const leakedItems = { items: [{ id: 'tpl-other', name: '别家路线' }] }
    const forwarded: unknown[] = []

    const result = await gateway.execute({
      name: 'searchRouteTemplates',
      actor,
      input: {
        taskId: 'task-1',
        runId: 'run-1',
        organizationId: 'org-other',
        keyword: '川西',
      },
      forward: async (context) => {
        forwarded.push(context)
        return leakedItems
      },
    })

    expect(forwarded).toEqual([])
    expect(result.result).toBeUndefined()
    expect(result.action).toMatchObject({
      name: 'searchRouteTemplates',
      kind: 'read',
      decision: 'deny',
      reasonCode: 'TARGET_MISMATCH',
      executionStatus: 'skipped',
      targetRef: { kind: 'route_template_catalog', id: 'org-1' },
    })
  })

  it('does not forward searchRouteTemplates when the claimed task is not the delegated task', async () => {
    const gateway = createGateway()
    const forwarded: unknown[] = []

    const result = await gateway.execute({
      name: 'searchRouteTemplates',
      actor,
      input: { taskId: 'task-other', runId: 'run-1', keyword: '川西' },
      forward: async (context) => {
        forwarded.push(context)
        return { items: [] }
      },
    })

    expect(forwarded).toEqual([])
    expect(result.action).toMatchObject({
      name: 'searchRouteTemplates',
      decision: 'deny',
      reasonCode: 'TARGET_MISMATCH',
      executionStatus: 'skipped',
      targetRef: { kind: 'route_template_catalog', id: 'org-1' },
    })
  })

  it('records getMaterialParseResult against the specified departure material', async () => {
    const gateway = createGateway()
    const parsePayload = {
      materialId: 'mat-1',
      parseResultVersion: 1,
      pageCount: 1,
      truncated: false,
      pages: [{ pageNumber: 1, source: 'ocr', text: '行程' }],
    }

    const result = await gateway.execute({
      name: 'getMaterialParseResult',
      actor,
      input: {
        taskId: 'task-1',
        runId: 'run-1',
        materialId: 'mat-1',
        parseResultVersion: 1,
      },
      forward: async () => parsePayload,
    })

    expect(result.result).toBe(parsePayload)
    expect(result.action).toMatchObject({
      name: 'getMaterialParseResult',
      kind: 'read',
      decision: 'allow',
      reasonCode: 'OBSERVATION_PERIOD',
      executionStatus: 'succeeded',
      targetRef: { kind: 'departure_material', id: 'mat-1' },
    })
  })

  it('does not forward getMaterialParseResult when the claimed task is not the delegated task', async () => {
    const store = new InMemoryAiActionStore()
    const gateway = createGateway(store)
    const leakedParse = {
      materialId: 'mat-other',
      parseResultVersion: 1,
      pageCount: 1,
      truncated: false,
      pages: [{ pageNumber: 1, source: 'ocr', text: '别家资料' }],
    }
    const forwarded: unknown[] = []

    const result = await gateway.execute({
      name: 'getMaterialParseResult',
      actor,
      input: {
        taskId: 'task-other',
        runId: 'run-1',
        materialId: 'mat-other',
        parseResultVersion: 1,
      },
      forward: async (context) => {
        forwarded.push(context)
        return leakedParse
      },
    })

    expect(forwarded).toEqual([])
    expect(result.result).toBeUndefined()
    expect(result.action).toMatchObject({
      name: 'getMaterialParseResult',
      kind: 'read',
      decision: 'deny',
      reasonCode: 'TARGET_MISMATCH',
      executionStatus: 'skipped',
      targetRef: { kind: 'departure_material', id: 'mat-other' },
    })
  })

  it('forwards getTaskContext when the payload claims a leaked organizationId', async () => {
    const contextPayload = { snapshot: { name: '川西环线' } }
    const gateway = createGateway()

    const result = await gateway.execute({
      name: 'getTaskContext',
      actor,
      input: { taskId: 'task-1', runId: 'run-1', organizationId: 'leak' },
      forward: async () => contextPayload,
    })

    expect(result.result).toBe(contextPayload)
    expect(result.action).toMatchObject({
      name: 'getTaskContext',
      decision: 'allow',
      reasonCode: 'OBSERVATION_PERIOD',
      executionStatus: 'succeeded',
      targetRef: { kind: 'ai_create_task', id: 'task-1' },
    })
  })

  it('does not forward getTaskContext when the claimed task is not the delegated task', async () => {
    const store = new InMemoryAiActionStore()
    const gateway = createGateway(store)
    const leakedContext = { snapshot: { name: '别家团' } }
    const forwarded: unknown[] = []

    const result = await gateway.execute({
      name: 'getTaskContext',
      actor,
      input: { taskId: 'task-other-org', runId: 'run-1' },
      forward: async (context) => {
        forwarded.push(context)
        return leakedContext
      },
    })

    expect(forwarded).toEqual([])
    expect(result.result).toBeUndefined()
    expect(result.action).toMatchObject({
      name: 'getTaskContext',
      kind: 'read',
      decision: 'deny',
      reasonCode: 'TARGET_MISMATCH',
      executionStatus: 'skipped',
      targetRef: { kind: 'ai_create_task', id: 'task-1' },
    })
  })

  it('does not forward a mismatched getTaskContext even when decision persistence fails', async () => {
    const gateway = createGateway(new FailingAiActionStore())
    const forwarded: unknown[] = []

    const result = await gateway.execute({
      name: 'getTaskContext',
      actor,
      input: { taskId: 'task-other-org', runId: 'run-1' },
      forward: async (context) => {
        forwarded.push(context)
        return { snapshot: { name: '别家团' } }
      },
    })

    expect(forwarded).toEqual([])
    expect(result.result).toBeUndefined()
    expect(result.action).toBeNull()
  })

  it('replays the same attempt, name, target and input hash to the same AI action', async () => {
    const store = new InMemoryAiActionStore()
    const gateway = createGateway(store)
    const actorWithAttempt = { ...actor, attemptId: 'attempt-1', runId: 'run-1' }
    const input = reviewInput
    const persistCalls: string[] = []

    const first = await gateway.execute({
      name: 'proposeReviewPackage',
      actor: actorWithAttempt,
      input,
      forward: async ({ action }) => {
        persistCalls.push(action?.id ?? 'missing')
        return { reviewPackageId: 'pkg-1' }
      },
    })
    const second = await gateway.execute({
      name: 'proposeReviewPackage',
      actor: actorWithAttempt,
      input,
      forward: async ({ action }) => {
        persistCalls.push(action?.id ?? 'missing')
        return { reviewPackageId: 'pkg-1' }
      },
    })

    expect(store.records).toHaveLength(1)
    expect(first.action?.id).toBe(store.records[0]?.id)
    expect(second.action?.id).toBe(first.action?.id)
    expect(persistCalls).toEqual([first.action?.id, first.action?.id])
    expect(first.action).toMatchObject({
      name: 'proposeReviewPackage',
      kind: 'write',
      decision: 'review',
    })
  })

  it('treats a later attempt of the same proposal as a new AI action', async () => {
    const store = new InMemoryAiActionStore()
    const gateway = createGateway(store)
    const input = reviewInput

    const first = await gateway.execute({
      name: 'proposeReviewPackage',
      actor: { ...actor, attemptId: 'attempt-1', runId: 'run-1' },
      input,
      forward: async () => ({ reviewPackageId: 'pkg-1' }),
    })
    const second = await gateway.execute({
      name: 'proposeReviewPackage',
      actor: { ...actor, attemptId: 'attempt-2', runId: 'run-1' },
      input,
      forward: async () => ({ reviewPackageId: 'pkg-1' }),
    })

    expect(store.records).toHaveLength(2)
    expect(second.action?.id).not.toBe(first.action?.id)
  })

  it('observes a later attempt of the same name, target and input hash without changing the decision', async () => {
    const store = new InMemoryAiActionStore()
    const gateway = createGateway(store)
    const input = reviewInput
    const forwarded: string[] = []

    const first = await gateway.execute({
      name: 'proposeReviewPackage',
      actor: { ...actor, attemptId: 'attempt-1', runId: 'run-1' },
      input,
      forward: async ({ action }) => {
        forwarded.push(action?.id ?? 'missing')
        return { reviewPackageId: 'pkg-1' }
      },
    })
    const second = await gateway.execute({
      name: 'proposeReviewPackage',
      actor: { ...actor, attemptId: 'attempt-2', runId: 'run-1' },
      input,
      forward: async ({ action }) => {
        forwarded.push(action?.id ?? 'missing')
        return { reviewPackageId: 'pkg-1' }
      },
    })

    expect(store.records).toHaveLength(2)
    expect(second.action?.id).not.toBe(first.action?.id)
    expect(first.action).toMatchObject({ decision: 'review', reasonCode: 'OBSERVATION_PERIOD' })
    expect(second.action).toMatchObject({ decision: 'review', reasonCode: 'OBSERVATION_PERIOD' })
    expect(forwarded).toEqual([first.action?.id, second.action?.id])
    expect(store.observations).toHaveLength(1)
    expect(store.observations[0]?.actionId).toBe(second.action?.id)
  })

  it('still decides and forwards when repeat observation cannot persist', async () => {
    const store = new ObservationFailingAiActionStore()
    const gateway = createGateway(store)
    const input = reviewInput
    const forwarded: string[] = []

    const first = await gateway.execute({
      name: 'proposeReviewPackage',
      actor: { ...actor, attemptId: 'attempt-1', runId: 'run-1' },
      input,
      forward: async ({ action }) => {
        forwarded.push(action?.id ?? 'missing')
        return { reviewPackageId: 'pkg-1' }
      },
    })
    const second = await gateway.execute({
      name: 'proposeReviewPackage',
      actor: { ...actor, attemptId: 'attempt-2', runId: 'run-1' },
      input,
      forward: async ({ action }) => {
        forwarded.push(action?.id ?? 'missing')
        return { reviewPackageId: 'pkg-1' }
      },
    })

    expect(store.records).toHaveLength(2)
    expect(second.action?.id).not.toBe(first.action?.id)
    expect(first.action).toMatchObject({ decision: 'review', reasonCode: 'OBSERVATION_PERIOD' })
    expect(second.action).toMatchObject({ decision: 'review', reasonCode: 'OBSERVATION_PERIOD' })
    expect(forwarded).toEqual([first.action?.id, second.action?.id])
    expect(store.observations).toEqual([])
  })

  it('does not treat job replay as a model-loop observation', async () => {
    const store = new InMemoryAiActionStore()
    const gateway = createGateway(store)
    const actorWithAttempt = { ...actor, attemptId: 'attempt-1', runId: 'run-1' }
    const input = reviewInput

    const first = await gateway.execute({
      name: 'proposeReviewPackage',
      actor: actorWithAttempt,
      input,
      forward: async () => ({ reviewPackageId: 'pkg-1' }),
    })
    await gateway.execute({
      name: 'proposeReviewPackage',
      actor: { ...actor, attemptId: 'attempt-2', runId: 'run-1' },
      input,
      forward: async () => ({ reviewPackageId: 'pkg-1' }),
    })
    const replayed = await gateway.execute({
      name: 'proposeReviewPackage',
      actor: actorWithAttempt,
      input,
      forward: async () => ({ reviewPackageId: 'pkg-1' }),
    })

    expect(store.records).toHaveLength(2)
    expect(replayed.action?.id).toBe(first.action?.id)
    expect(store.observations).toHaveLength(1)
    expect(store.observations[0]?.actionId).not.toBe(first.action?.id)
  })

  it('keeps loop fingerprints free of candidate text, evidence and attempt ids', async () => {
    const store = new InMemoryAiActionStore()
    const gateway = createGateway(store)
    const secretName = '秘密团名-含证件号110101199001011234'
    const secretEvidence = '护照页原文 E12345678'
    const input = {
      taskId: 'task-1',
      objectVersion: 1,
      candidates: [
        {
          fieldKey: 'name',
          proposedValue: secretName,
          evidence: [{ kind: 'user_message', excerpt: secretEvidence, sequence: 1 }],
        },
      ],
    }

    await gateway.execute({
      name: 'proposeReviewPackage',
      actor: { ...actor, attemptId: 'attempt-1', runId: 'run-1' },
      input,
      forward: async () => ({ reviewPackageId: 'pkg-1' }),
    })
    const second = await gateway.execute({
      name: 'proposeReviewPackage',
      actor: { ...actor, attemptId: 'attempt-2', runId: 'run-1' },
      input,
      forward: async () => ({ reviewPackageId: 'pkg-1' }),
    })

    const observed = JSON.stringify(store.observations)
    expect(store.observations).toHaveLength(1)
    expect(observed).not.toContain(secretName)
    expect(observed).not.toContain(secretEvidence)
    expect(observed).not.toContain('护照页原文')
    expect(observed).not.toContain('attempt-1')
    expect(observed).not.toContain('attempt-2')
    expect(JSON.stringify(second.action)).not.toContain(secretName)
    expect(JSON.stringify(store.records)).not.toContain(secretEvidence)
  })

  it('observes an unregistered repeat without forwarding or changing the deny', async () => {
    const store = new InMemoryAiActionStore()
    const gateway = createGateway(store)
    const forwarded: unknown[] = []
    const input = { taskId: 'task-1' }

    const first = await gateway.execute({
      name: 'deleteDepartureForever',
      actor: { ...actor, attemptId: 'attempt-1', runId: 'run-1' },
      input,
      forward: async (context) => {
        forwarded.push(context)
        return { ok: true }
      },
    })
    const second = await gateway.execute({
      name: 'deleteDepartureForever',
      actor: { ...actor, attemptId: 'attempt-2', runId: 'run-1' },
      input,
      forward: async (context) => {
        forwarded.push(context)
        return { ok: true }
      },
    })

    expect(forwarded).toEqual([])
    expect(store.records).toHaveLength(2)
    expect(first.action).toMatchObject({ decision: 'deny', reasonCode: 'UNREGISTERED' })
    expect(second.action).toMatchObject({ decision: 'deny', reasonCode: 'UNREGISTERED' })
    expect(store.observations).toHaveLength(1)
    expect(store.observations[0]?.actionId).toBe(second.action?.id)
  })

  it('observes the same proposal across activity runs when the actor has no attempt', async () => {
    const store = new InMemoryAiActionStore()
    const gateway = createGateway(store)
    const input = reviewInput
    const forwarded: string[] = []

    const first = await gateway.execute({
      name: 'proposeReviewPackage',
      actor: { ...actor, runId: 'run-1' },
      input,
      forward: async ({ action }) => {
        forwarded.push(action?.id ?? 'missing')
        return { reviewPackageId: 'pkg-1' }
      },
    })
    const second = await gateway.execute({
      name: 'proposeReviewPackage',
      actor: { ...actor, runId: 'run-2' },
      input,
      forward: async ({ action }) => {
        forwarded.push(action?.id ?? 'missing')
        return { reviewPackageId: 'pkg-2' }
      },
    })

    expect(store.records).toHaveLength(2)
    expect(second.action?.id).not.toBe(first.action?.id)
    expect(second.action).toMatchObject({ decision: 'review', reasonCode: 'OBSERVATION_PERIOD' })
    expect(forwarded).toEqual([first.action?.id, second.action?.id])
    expect(store.observations).toHaveLength(1)
  })

  it('does not treat the same proposal in another organization as a loop', async () => {
    const store = new InMemoryAiActionStore()
    const gateway = createGateway(store)
    const input = { taskId: 'shared-looking-payload' }

    await gateway.execute({
      name: 'deleteDepartureForever',
      actor: { ...actor, attemptId: 'attempt-1', runId: 'run-1' },
      input,
      forward: async () => ({ ok: true }),
    })
    const otherOrg = await gateway.execute({
      name: 'deleteDepartureForever',
      actor: {
        ...actor,
        organizationId: 'org-2',
        userId: 'user-2',
        taskId: 'task-2',
        attemptId: 'attempt-org-2',
        runId: 'run-org-2',
      },
      input,
      forward: async () => ({ ok: true }),
    })

    expect(store.records).toHaveLength(2)
    expect(otherOrg.action).toMatchObject({ decision: 'deny', reasonCode: 'UNREGISTERED' })
    expect(store.observations).toEqual([])
  })

  it('replays the same run, name, target and input hash when the actor has no attempt', async () => {
    const store = new InMemoryAiActionStore()
    const gateway = createGateway(store)
    const actorWithoutAttempt = { ...actor, runId: 'run-1' }
    const input = reviewInput
    const persistCalls: string[] = []

    const first = await gateway.execute({
      name: 'proposeReviewPackage',
      actor: actorWithoutAttempt,
      input,
      forward: async ({ action }) => {
        persistCalls.push(action?.id ?? 'missing')
        return { reviewPackageId: 'pkg-1' }
      },
    })
    const second = await gateway.execute({
      name: 'proposeReviewPackage',
      actor: actorWithoutAttempt,
      input,
      forward: async ({ action }) => {
        persistCalls.push(action?.id ?? 'missing')
        return { reviewPackageId: 'pkg-1' }
      },
    })

    expect(store.records).toHaveLength(1)
    expect(first.action?.id).toBe(store.records[0]?.id)
    expect(second.action?.id).toBe(first.action?.id)
    expect(persistCalls).toEqual([first.action?.id, first.action?.id])
  })

  it('does not replay across different activity runs when the actor has no attempt', async () => {
    const store = new InMemoryAiActionStore()
    const gateway = createGateway(store)
    const input = reviewInput

    const first = await gateway.execute({
      name: 'proposeReviewPackage',
      actor: { ...actor, runId: 'run-1' },
      input,
      forward: async () => ({ reviewPackageId: 'pkg-1' }),
    })
    const second = await gateway.execute({
      name: 'proposeReviewPackage',
      actor: { ...actor, runId: 'run-2' },
      input,
      forward: async () => ({ reviewPackageId: 'pkg-2' }),
    })

    expect(store.records).toHaveLength(2)
    expect(second.action?.id).not.toBe(first.action?.id)
  })

  it('records execution failure on the same action identity', async () => {
    const store = new InMemoryAiActionStore()
    const gateway = createGateway(store)

    await expect(
      gateway.execute({
        name: 'proposeReviewPackage',
        actor,
        input: reviewInput,
        forward: async () => {
          throw new Error('projection failed')
        },
      }),
    ).rejects.toThrow('projection failed')

    expect(store.records).toHaveLength(1)
    expect(store.records[0]).toMatchObject({
      name: 'proposeReviewPackage',
      kind: 'write',
      decision: 'review',
      executionStatus: 'failed',
    })
  })

  it('keeps only a safe summary on the action record', async () => {
    const store = new InMemoryAiActionStore()
    const gateway = createGateway(store)
    const secretName = '秘密团名-含证件号110101199001011234'
    const secretEvidence = '护照页原文 E12345678'

    const result = await gateway.execute({
      name: 'proposeReviewPackage',
      actor,
      input: {
        taskId: 'task-1',
        runId: 'run-1',
        objectVersion: 1,
        candidates: [
          {
            fieldKey: 'name',
            proposedValue: secretName,
            evidence: [{ kind: 'user_message', excerpt: secretEvidence, sequence: 1 }],
          },
          {
            fieldKey: 'expectedGuestCountHint',
            proposedValue: 20,
            evidence: [{ kind: 'user_message', excerpt: secretEvidence, sequence: 1 }],
          },
        ],
      },
      forward: async () => ({ reviewPackageId: 'pkg-1' }),
    })

    expect(result.action?.candidateFieldKeys).toEqual(['name', 'expectedGuestCountHint'])
    expect(result.action?.inputHash).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(result.action)).not.toContain(secretName)
    expect(JSON.stringify(result.action)).not.toContain(secretEvidence)
    expect(JSON.stringify(result.action)).not.toContain('护照页原文')
    expect(JSON.stringify(store.records[0])).not.toContain(secretName)
  })

  it.each([
    {
      name: 'getTaskContext' as const,
      input: { taskId: 'task-1' },
      targetRef: { kind: 'ai_create_task', id: 'task-1' },
    },
    {
      name: 'searchRouteTemplates' as const,
      input: { taskId: 'task-1', keyword: '川西' },
      targetRef: { kind: 'route_template_catalog', id: 'org-1' },
    },
    {
      name: 'getMaterialParseResult' as const,
      input: { taskId: 'task-1', materialId: 'mat-1', parseResultVersion: 1 },
      targetRef: { kind: 'departure_material', id: 'mat-1' },
    },
    {
      name: 'proposeReviewPackage' as const,
      input: reviewInput,
      targetRef: { kind: 'departure_creation_draft', id: 'draft-1' },
    },
  ])('forwards registered action $name in observation', async ({ name, input, targetRef }) => {
    const store = new InMemoryAiActionStore()
    const gateway = createGateway(store)
    const forwarded: string[] = []
    let forwardedTarget: { kind: string; id: string } | undefined

    const result = await gateway.execute({
      name,
      actor,
      input,
      forward: async ({ target }) => {
        forwarded.push(name)
        forwardedTarget = { kind: target.kind, id: target.id }
        return { ok: true }
      },
    })

    expect(forwarded).toEqual([name])
    expect(forwardedTarget).toEqual(targetRef)
    expect(result.action?.name).toBe(name)
    expect(result.action?.reasonCode).toBe('OBSERVATION_PERIOD')
    expect(result.action?.executionStatus).toBe('succeeded')
    expect(result.action?.targetRef).toEqual(targetRef)
  })
})

describe('AiActionGateway.execute 权威目标解析', () => {
  const actor: AiActionActor = {
    organizationId: 'org-1',
    userId: 'user-1',
    taskId: 'task-1',
    conversationId: 'conv-1',
    inputBatchId: 'batch-1',
    agentDefinition: AI_CREATE_AGENT_DEFINITION_REF,
    grantedCapabilities: [
      ...Object.values(AI_CREATE_CAPABILITY_REFS_BY_TOOL),
      CONVERSATION_PLAINTEXT_REPLY_CAPABILITY_REF,
    ],
  }

  function createGateway(
    authority: InMemoryAiActionTargetAuthority,
    store: InMemoryAiActionStore = new InMemoryAiActionStore(),
  ) {
    return { store, gateway: new AiActionGateway(store, authority) }
  }

  it('does not forward getTaskContext when the task is missing', async () => {
    const { store, gateway } = createGateway(new InMemoryAiActionTargetAuthority())
    const forwarded: unknown[] = []

    const result = await gateway.execute({
      name: 'getTaskContext',
      actor,
      input: { taskId: 'task-1' },
      forward: async (context) => forwarded.push(context),
    })

    expect(forwarded).toEqual([])
    expect(result.action).toMatchObject({
      decision: 'deny',
      reasonCode: 'TARGET_MISSING',
      executionStatus: 'skipped',
    })
    expect(store.records).toHaveLength(1)
  })

  it('does not forward getTaskContext when the task belongs to another Organization', async () => {
    const { gateway } = createGateway(
      new InMemoryAiActionTargetAuthority({
        tasks: [
          {
            id: 'task-1',
            organizationId: 'org-other',
            ownerUserId: 'user-1',
            draftId: 'draft-1',
            draftVersion: 1,
          },
        ],
      }),
    )
    const forwarded: unknown[] = []

    const result = await gateway.execute({
      name: 'getTaskContext',
      actor,
      input: { taskId: 'task-1' },
      forward: async (context) => forwarded.push(context),
    })

    expect(forwarded).toEqual([])
    expect(result.action).toMatchObject({
      decision: 'deny',
      reasonCode: 'CROSS_ORGANIZATION',
      executionStatus: 'skipped',
    })
  })

  it('does not forward getTaskContext when the actor is not the task owner', async () => {
    const { gateway } = createGateway(
      new InMemoryAiActionTargetAuthority({
        tasks: [
          {
            id: 'task-1',
            organizationId: 'org-1',
            ownerUserId: 'user-other',
            draftId: 'draft-1',
            draftVersion: 1,
          },
        ],
      }),
    )
    const forwarded: unknown[] = []

    const result = await gateway.execute({
      name: 'getTaskContext',
      actor,
      input: { taskId: 'task-1' },
      forward: async (context) => forwarded.push(context),
    })

    expect(forwarded).toEqual([])
    expect(result.action).toMatchObject({
      decision: 'deny',
      reasonCode: 'OBJECT_SCOPE_DENIED',
      executionStatus: 'skipped',
    })
  })

  it('does not forward getMaterialParseResult when the material is missing', async () => {
    const { gateway } = createGateway(authorityForActor(actor))
    const forwarded: unknown[] = []

    const result = await gateway.execute({
      name: 'getMaterialParseResult',
      actor,
      input: { taskId: 'task-1', materialId: 'mat-absent', parseResultVersion: 1 },
      forward: async (context) => forwarded.push(context),
    })

    expect(forwarded).toEqual([])
    expect(result.action).toMatchObject({
      decision: 'deny',
      reasonCode: 'TARGET_MISSING',
      targetRef: { kind: 'departure_material', id: 'mat-absent' },
    })
  })

  it('does not forward getMaterialParseResult when the material belongs to another Organization', async () => {
    const { gateway } = createGateway(authorityForActor(actor))
    const forwarded: unknown[] = []

    const result = await gateway.execute({
      name: 'getMaterialParseResult',
      actor,
      input: { taskId: 'task-1', materialId: 'mat-other', parseResultVersion: 1 },
      forward: async (context) => forwarded.push(context),
    })

    expect(forwarded).toEqual([])
    expect(result.action).toMatchObject({
      decision: 'deny',
      reasonCode: 'CROSS_ORGANIZATION',
    })
  })

  it('forwards getMaterialParseResult for an available same-conversation source that is not pinned to this batch', async () => {
    const { gateway } = createGateway(
      new InMemoryAiActionTargetAuthority({
        tasks: [
          {
            id: 'task-1',
            organizationId: 'org-1',
            ownerUserId: 'user-1',
            draftId: 'draft-1',
            draftVersion: 1,
          },
        ],
        materials: [{ id: 'src-prior', organizationId: 'org-1' }],
        sources: [
          {
            id: 'src-prior',
            organizationId: 'org-1',
            conversationId: 'conv-1',
            parseVersion: 1,
          },
        ],
      }),
    )
    const forwarded: unknown[] = []

    const result = await gateway.execute({
      name: 'getMaterialParseResult',
      actor,
      input: { taskId: 'task-1', materialId: 'src-prior', parseResultVersion: 1 },
      forward: async (context) => forwarded.push(context),
    })

    expect(forwarded).toHaveLength(1)
    expect(result.action).toMatchObject({
      decision: 'allow',
      reasonCode: 'OBSERVATION_PERIOD',
      targetRef: { kind: 'departure_material', id: 'src-prior' },
    })
  })

  it('does not forward getMaterialParseResult when the material is not pinned to the current input batch', async () => {
    const { gateway } = createGateway(
      new InMemoryAiActionTargetAuthority({
        tasks: [
          {
            id: 'task-1',
            organizationId: 'org-1',
            ownerUserId: 'user-1',
            draftId: 'draft-1',
            draftVersion: 1,
          },
        ],
        materials: [{ id: 'mat-unpinned', organizationId: 'org-1' }],
      }),
    )
    const forwarded: unknown[] = []

    const result = await gateway.execute({
      name: 'getMaterialParseResult',
      actor,
      input: { taskId: 'task-1', materialId: 'mat-unpinned', parseResultVersion: 1 },
      forward: async (context) => forwarded.push(context),
    })

    expect(forwarded).toEqual([])
    expect(result.action).toMatchObject({
      decision: 'deny',
      reasonCode: 'TARGET_NOT_PINNED',
    })
  })

  it('does not forward getMaterialParseResult when the requested parse version is not the pinned version', async () => {
    const { gateway } = createGateway(authorityForActor(actor))
    const forwarded: unknown[] = []

    const result = await gateway.execute({
      name: 'getMaterialParseResult',
      actor,
      input: { taskId: 'task-1', materialId: 'mat-1', parseResultVersion: 9 },
      forward: async (context) => forwarded.push(context),
    })

    expect(forwarded).toEqual([])
    expect(result.action).toMatchObject({
      decision: 'deny',
      reasonCode: 'TARGET_VERSION_MISMATCH',
    })
  })

  it('does not forward proposeReviewPackage when the claimed object version is not the current draft', async () => {
    const { gateway } = createGateway(authorityForActor(actor))
    const forwarded: unknown[] = []

    const result = await gateway.execute({
      name: 'proposeReviewPackage',
      actor,
      input: { objectVersion: 2, candidates: [{ fieldKey: 'name', proposedValue: '新团名' }] },
      forward: async (context) => forwarded.push(context),
    })

    expect(forwarded).toEqual([])
    expect(result.action).toMatchObject({
      decision: 'deny',
      reasonCode: 'TARGET_VERSION_MISMATCH',
      executionStatus: 'skipped',
      targetRef: { kind: 'departure_creation_draft', id: 'draft-1' },
    })
  })

  it('keeps the same ALLOW identity when a valid draft later fails to project due to a concurrent version change', async () => {
    const { store, gateway } = createGateway(authorityForActor(actor))

    await expect(
      gateway.execute({
        name: 'proposeReviewPackage',
        actor,
        input: { objectVersion: 1, candidates: [{ fieldKey: 'name', proposedValue: '新团名' }] },
        forward: async ({ target }) => {
          expect(target).toEqual({
            kind: 'departure_creation_draft',
            id: 'draft-1',
            organizationId: 'org-1',
            version: 1,
          })
          throw new Error('VERSION_CONFLICT')
        },
      }),
    ).rejects.toThrow('VERSION_CONFLICT')

    expect(store.records).toHaveLength(1)
    expect(store.records[0]).toMatchObject({
      name: 'proposeReviewPackage',
      decision: 'review',
      reasonCode: 'OBSERVATION_PERIOD',
      executionStatus: 'failed',
      targetRef: { kind: 'departure_creation_draft', id: 'draft-1' },
    })
  })

  it('gives policy, fingerprint and adapter the same normalized search catalog target', async () => {
    const { store, gateway } = createGateway(authorityForActor(actor))
    const seen: unknown[] = []

    const result = await gateway.execute({
      name: 'searchRouteTemplates',
      actor,
      input: { organizationId: 'org-1', keyword: '川西' },
      forward: async ({ target }) => {
        seen.push(target)
        return { items: [] }
      },
    })

    expect(seen).toEqual([
      {
        kind: 'route_template_catalog',
        id: 'org-1',
        organizationId: 'org-1',
        version: null,
      },
    ])
    expect(result.action?.targetRef).toEqual({ kind: 'route_template_catalog', id: 'org-1' })
    expect(store.records[0]?.targetRef).toEqual(result.action?.targetRef)
  })

  it('does not forward proposeReviewPackage when the draft is missing', async () => {
    const { gateway } = createGateway(new InMemoryAiActionTargetAuthority())
    const forwarded: unknown[] = []

    const result = await gateway.execute({
      name: 'proposeReviewPackage',
      actor,
      input: { objectVersion: 1, candidates: [{ fieldKey: 'name', proposedValue: '新团名' }] },
      forward: async (context) => forwarded.push(context),
    })

    expect(forwarded).toEqual([])
    expect(result.action).toMatchObject({
      decision: 'deny',
      reasonCode: 'TARGET_MISSING',
    })
  })

  it('does not forward proposeReviewPackage when the task belongs to another Organization', async () => {
    const { gateway } = createGateway(
      new InMemoryAiActionTargetAuthority({
        tasks: [
          {
            id: 'task-1',
            organizationId: 'org-other',
            ownerUserId: 'user-1',
            draftId: 'draft-1',
            draftVersion: 1,
          },
        ],
      }),
    )
    const forwarded: unknown[] = []

    const result = await gateway.execute({
      name: 'proposeReviewPackage',
      actor,
      input: { objectVersion: 1, candidates: [{ fieldKey: 'name', proposedValue: '新团名' }] },
      forward: async (context) => forwarded.push(context),
    })

    expect(forwarded).toEqual([])
    expect(result.action).toMatchObject({
      decision: 'deny',
      reasonCode: 'CROSS_ORGANIZATION',
      targetRef: { kind: 'departure_creation_draft', id: 'draft-1' },
    })
  })

  it('does not forward proposeReviewPackage when the actor is not the task owner', async () => {
    const { gateway } = createGateway(
      new InMemoryAiActionTargetAuthority({
        tasks: [
          {
            id: 'task-1',
            organizationId: 'org-1',
            ownerUserId: 'user-other',
            draftId: 'draft-1',
            draftVersion: 1,
          },
        ],
      }),
    )
    const forwarded: unknown[] = []

    const result = await gateway.execute({
      name: 'proposeReviewPackage',
      actor,
      input: { objectVersion: 1, candidates: [{ fieldKey: 'name', proposedValue: '新团名' }] },
      forward: async (context) => forwarded.push(context),
    })

    expect(forwarded).toEqual([])
    expect(result.action).toMatchObject({
      decision: 'deny',
      reasonCode: 'OBJECT_SCOPE_DENIED',
    })
  })

  it('does not forward proposeReviewPackage when the claimed task is not the delegated task', async () => {
    const { gateway } = createGateway(authorityForActor(actor))
    const forwarded: unknown[] = []

    const result = await gateway.execute({
      name: 'proposeReviewPackage',
      actor,
      input: {
        taskId: 'task-other',
        objectVersion: 1,
        candidates: [{ fieldKey: 'name', proposedValue: '新团名' }],
      },
      forward: async (context) => forwarded.push(context),
    })

    expect(forwarded).toEqual([])
    expect(result.action).toMatchObject({
      decision: 'deny',
      reasonCode: 'TARGET_MISMATCH',
      targetRef: { kind: 'departure_creation_draft', id: 'draft-1' },
    })
  })

  it('does not forward replyPlaintext when the conversation is missing', async () => {
    const { gateway } = createGateway(new InMemoryAiActionTargetAuthority())
    const forwarded: unknown[] = []
    const conversationActor: AiActionActor = {
      ...actor,
      agentDefinition: CONVERSATION_GENERAL_AGENT_DEFINITION_REF,
      grantedCapabilities: [CONVERSATION_PLAINTEXT_REPLY_CAPABILITY_REF],
    }

    const result = await gateway.execute({
      name: 'replyPlaintext',
      actor: conversationActor,
      input: {},
      forward: async (context) => forwarded.push(context),
    })

    expect(forwarded).toEqual([])
    expect(result.action).toMatchObject({
      name: 'replyPlaintext',
      decision: 'deny',
      reasonCode: 'TARGET_MISSING',
    })
  })

  it('does not forward replyPlaintext when the conversation belongs to another Organization', async () => {
    const conversationActor: AiActionActor = {
      ...actor,
      agentDefinition: CONVERSATION_GENERAL_AGENT_DEFINITION_REF,
      grantedCapabilities: [CONVERSATION_PLAINTEXT_REPLY_CAPABILITY_REF],
    }
    const { gateway } = createGateway(
      new InMemoryAiActionTargetAuthority({
        conversations: [
          { id: 'conv-1', organizationId: 'org-other', creatorUserId: 'user-1' },
        ],
      }),
    )
    const forwarded: unknown[] = []

    const result = await gateway.execute({
      name: 'replyPlaintext',
      actor: conversationActor,
      input: {},
      forward: async (context) => forwarded.push(context),
    })

    expect(forwarded).toEqual([])
    expect(result.action).toMatchObject({
      decision: 'deny',
      reasonCode: 'CROSS_ORGANIZATION',
    })
  })

  it('does not forward replyPlaintext when the actor is not the conversation owner', async () => {
    const conversationActor: AiActionActor = {
      ...actor,
      agentDefinition: CONVERSATION_GENERAL_AGENT_DEFINITION_REF,
      grantedCapabilities: [CONVERSATION_PLAINTEXT_REPLY_CAPABILITY_REF],
    }
    const { gateway } = createGateway(
      new InMemoryAiActionTargetAuthority({
        conversations: [
          { id: 'conv-1', organizationId: 'org-1', creatorUserId: 'user-other' },
        ],
      }),
    )
    const forwarded: unknown[] = []

    const result = await gateway.execute({
      name: 'replyPlaintext',
      actor: conversationActor,
      input: {},
      forward: async (context) => forwarded.push(context),
    })

    expect(forwarded).toEqual([])
    expect(result.action).toMatchObject({
      decision: 'deny',
      reasonCode: 'OBJECT_SCOPE_DENIED',
    })
  })

  it('forwards replyPlaintext against the trusted conversation', async () => {
    const conversationActor: AiActionActor = {
      ...actor,
      agentDefinition: CONVERSATION_GENERAL_AGENT_DEFINITION_REF,
      grantedCapabilities: [CONVERSATION_PLAINTEXT_REPLY_CAPABILITY_REF],
    }
    const { gateway } = createGateway(authorityForActor(conversationActor))
    const seen: unknown[] = []

    const result = await gateway.execute({
      name: 'replyPlaintext',
      actor: conversationActor,
      input: {},
      forward: async ({ target }) => {
        seen.push(target)
        return { message: '你好' }
      },
    })

    expect(seen).toEqual([
      {
        kind: 'agent_conversation',
        id: 'conv-1',
        organizationId: 'org-1',
        version: null,
      },
    ])
    expect(result.action).toMatchObject({
      name: 'replyPlaintext',
      kind: 'read',
      decision: 'allow',
      targetRef: { kind: 'agent_conversation', id: 'conv-1' },
      executionStatus: 'succeeded',
    })
  })

  it('forwards readConversationHistory against the trusted conversation', async () => {
    const conversationActor: AiActionActor = {
      ...actor,
      grantedCapabilities: [CONVERSATION_HISTORY_READ_CAPABILITY_REF],
    }
    const { gateway } = createGateway(authorityForActor(conversationActor))
    const seen: unknown[] = []
    const result = await gateway.execute({
      name: 'readConversationHistory',
      actor: conversationActor,
      input: { sequenceStart: 1, sequenceEnd: 2 },
      forward: async ({ target }) => {
        seen.push(target)
        return { ok: true }
      },
    })
    expect(seen).toEqual([
      {
        kind: 'agent_conversation',
        id: 'conv-1',
        organizationId: 'org-1',
        version: null,
      },
    ])
    expect(result.action).toMatchObject({
      name: 'readConversationHistory',
      decision: 'allow',
      targetRef: { kind: 'agent_conversation', id: 'conv-1' },
    })
  })

  it('does not forward readConversationSource when parseVersion is missing', async () => {
    const conversationActor: AiActionActor = {
      ...actor,
      grantedCapabilities: [CONVERSATION_SOURCE_READ_CAPABILITY_REF],
    }
    const { gateway } = createGateway(authorityForActor(conversationActor))
    const result = await gateway.execute({
      name: 'readConversationSource',
      actor: conversationActor,
      input: { sourceId: 'src-1' },
      forward: async () => ({ ok: true }),
    })
    expect(result.result).toBeUndefined()
    expect(result.action).toMatchObject({
      name: 'readConversationSource',
      decision: 'deny',
      reasonCode: 'TARGET_VERSION_MISMATCH',
    })
  })

  it('forwards readConversationSource against a same-conversation parse version', async () => {
    const conversationActor: AiActionActor = {
      ...actor,
      grantedCapabilities: [CONVERSATION_SOURCE_READ_CAPABILITY_REF],
    }
    const { gateway } = createGateway(authorityForActor(conversationActor))
    const seen: unknown[] = []
    const result = await gateway.execute({
      name: 'readConversationSource',
      actor: conversationActor,
      input: { sourceId: 'src-1', parseVersion: 2 },
      forward: async ({ target }) => {
        seen.push(target)
        return { ok: true }
      },
    })
    expect(seen).toEqual([
      {
        kind: 'conversation_source',
        id: 'src-1',
        organizationId: 'org-1',
        version: 2,
      },
    ])
    expect(result.action).toMatchObject({
      name: 'readConversationSource',
      decision: 'allow',
      targetRef: { kind: 'conversation_source', id: 'src-1' },
    })
  })
})

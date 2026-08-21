import { AiActionGateway } from './ai-action.gateway'
import {
  FailingAiActionStore,
  InMemoryAiActionStore,
  ObservationFailingAiActionStore,
} from './ai-action.in-memory.store'

describe('AiActionGateway.execute', () => {
  const actor = { organizationId: 'org-1', userId: 'user-1', taskId: 'task-1' }

  it('does not forward an unregistered action and still leaves a deny record', async () => {
    const store = new InMemoryAiActionStore()
    const gateway = new AiActionGateway(store)
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
      const gateway = new AiActionGateway(new InMemoryAiActionStore())
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
    const gateway = new AiActionGateway(new InMemoryAiActionStore())
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
    })
    expect(result.action?.targetRef).toEqual({ kind: 'ai_create_task', id: 'task-1' })
  })

  it('does not forward a write when the decision record cannot persist', async () => {
    const gateway = new AiActionGateway(new FailingAiActionStore())
    const forwarded: unknown[] = []

    await expect(
      gateway.execute({
        name: 'submitReviewPackage',
        actor,
        input: { candidates: [{ fieldKey: 'name', proposedValue: '新团名' }] },
        forward: async (context) => {
          forwarded.push(context)
          return { reviewPackageId: 'pkg-1' }
        },
      }),
    ).rejects.toThrow('decision store unavailable')

    expect(forwarded).toEqual([])
  })

  it('still forwards a read when decision persistence fails', async () => {
    const gateway = new AiActionGateway(new FailingAiActionStore())
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
    const gateway = new AiActionGateway(new InMemoryAiActionStore())
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
    const gateway = new AiActionGateway(store)
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
    const gateway = new AiActionGateway(new InMemoryAiActionStore())
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
    const gateway = new AiActionGateway(new InMemoryAiActionStore())
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
    const gateway = new AiActionGateway(store)
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

  it('does not forward getTaskContext when the claimed task is not the delegated task', async () => {
    const store = new InMemoryAiActionStore()
    const gateway = new AiActionGateway(store)
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
    const gateway = new AiActionGateway(new FailingAiActionStore())
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
    const gateway = new AiActionGateway(store)
    const actorWithAttempt = { ...actor, attemptId: 'attempt-1', runId: 'run-1' }
    const input = { candidates: [{ fieldKey: 'name', proposedValue: '新团名' }] }
    const persistCalls: string[] = []

    const first = await gateway.execute({
      name: 'submitReviewPackage',
      actor: actorWithAttempt,
      input,
      forward: async ({ action }) => {
        persistCalls.push(action?.id ?? 'missing')
        return { reviewPackageId: 'pkg-1' }
      },
    })
    const second = await gateway.execute({
      name: 'submitReviewPackage',
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
      name: 'submitReviewPackage',
      kind: 'write',
      decision: 'review',
    })
  })

  it('treats a later attempt of the same proposal as a new AI action', async () => {
    const store = new InMemoryAiActionStore()
    const gateway = new AiActionGateway(store)
    const input = { candidates: [{ fieldKey: 'name', proposedValue: '新团名' }] }

    const first = await gateway.execute({
      name: 'submitReviewPackage',
      actor: { ...actor, attemptId: 'attempt-1', runId: 'run-1' },
      input,
      forward: async () => ({ reviewPackageId: 'pkg-1' }),
    })
    const second = await gateway.execute({
      name: 'submitReviewPackage',
      actor: { ...actor, attemptId: 'attempt-2', runId: 'run-1' },
      input,
      forward: async () => ({ reviewPackageId: 'pkg-1' }),
    })

    expect(store.records).toHaveLength(2)
    expect(second.action?.id).not.toBe(first.action?.id)
  })

  it('observes a later attempt of the same name, target and input hash without changing the decision', async () => {
    const store = new InMemoryAiActionStore()
    const gateway = new AiActionGateway(store)
    const input = { candidates: [{ fieldKey: 'name', proposedValue: '新团名' }] }
    const forwarded: string[] = []

    const first = await gateway.execute({
      name: 'submitReviewPackage',
      actor: { ...actor, attemptId: 'attempt-1', runId: 'run-1' },
      input,
      forward: async ({ action }) => {
        forwarded.push(action?.id ?? 'missing')
        return { reviewPackageId: 'pkg-1' }
      },
    })
    const second = await gateway.execute({
      name: 'submitReviewPackage',
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
    const gateway = new AiActionGateway(store)
    const input = { candidates: [{ fieldKey: 'name', proposedValue: '新团名' }] }
    const forwarded: string[] = []

    const first = await gateway.execute({
      name: 'submitReviewPackage',
      actor: { ...actor, attemptId: 'attempt-1', runId: 'run-1' },
      input,
      forward: async ({ action }) => {
        forwarded.push(action?.id ?? 'missing')
        return { reviewPackageId: 'pkg-1' }
      },
    })
    const second = await gateway.execute({
      name: 'submitReviewPackage',
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
    const gateway = new AiActionGateway(store)
    const actorWithAttempt = { ...actor, attemptId: 'attempt-1', runId: 'run-1' }
    const input = { candidates: [{ fieldKey: 'name', proposedValue: '新团名' }] }

    const first = await gateway.execute({
      name: 'submitReviewPackage',
      actor: actorWithAttempt,
      input,
      forward: async () => ({ reviewPackageId: 'pkg-1' }),
    })
    await gateway.execute({
      name: 'submitReviewPackage',
      actor: { ...actor, attemptId: 'attempt-2', runId: 'run-1' },
      input,
      forward: async () => ({ reviewPackageId: 'pkg-1' }),
    })
    const replayed = await gateway.execute({
      name: 'submitReviewPackage',
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
    const gateway = new AiActionGateway(store)
    const secretName = '秘密团名-含证件号110101199001011234'
    const secretEvidence = '护照页原文 E12345678'
    const input = {
      taskId: 'task-1',
      candidates: [
        {
          fieldKey: 'name',
          proposedValue: secretName,
          evidence: [{ kind: 'user_message', excerpt: secretEvidence, sequence: 1 }],
        },
      ],
    }

    await gateway.execute({
      name: 'submitReviewPackage',
      actor: { ...actor, attemptId: 'attempt-1', runId: 'run-1' },
      input,
      forward: async () => ({ reviewPackageId: 'pkg-1' }),
    })
    const second = await gateway.execute({
      name: 'submitReviewPackage',
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
    const gateway = new AiActionGateway(store)
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
    const gateway = new AiActionGateway(store)
    const input = { candidates: [{ fieldKey: 'name', proposedValue: '新团名' }] }
    const forwarded: string[] = []

    const first = await gateway.execute({
      name: 'submitReviewPackage',
      actor: { ...actor, runId: 'run-1' },
      input,
      forward: async ({ action }) => {
        forwarded.push(action?.id ?? 'missing')
        return { reviewPackageId: 'pkg-1' }
      },
    })
    const second = await gateway.execute({
      name: 'submitReviewPackage',
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
    const gateway = new AiActionGateway(store)
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
    const gateway = new AiActionGateway(store)
    const actorWithoutAttempt = { ...actor, runId: 'run-1' }
    const input = { candidates: [{ fieldKey: 'name', proposedValue: '新团名' }] }
    const persistCalls: string[] = []

    const first = await gateway.execute({
      name: 'submitReviewPackage',
      actor: actorWithoutAttempt,
      input,
      forward: async ({ action }) => {
        persistCalls.push(action?.id ?? 'missing')
        return { reviewPackageId: 'pkg-1' }
      },
    })
    const second = await gateway.execute({
      name: 'submitReviewPackage',
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
    const gateway = new AiActionGateway(store)
    const input = { candidates: [{ fieldKey: 'name', proposedValue: '新团名' }] }

    const first = await gateway.execute({
      name: 'submitReviewPackage',
      actor: { ...actor, runId: 'run-1' },
      input,
      forward: async () => ({ reviewPackageId: 'pkg-1' }),
    })
    const second = await gateway.execute({
      name: 'submitReviewPackage',
      actor: { ...actor, runId: 'run-2' },
      input,
      forward: async () => ({ reviewPackageId: 'pkg-2' }),
    })

    expect(store.records).toHaveLength(2)
    expect(second.action?.id).not.toBe(first.action?.id)
  })

  it('records execution failure on the same action identity', async () => {
    const store = new InMemoryAiActionStore()
    const gateway = new AiActionGateway(store)

    await expect(
      gateway.execute({
        name: 'submitReviewPackage',
        actor,
        input: { candidates: [{ fieldKey: 'name', proposedValue: '新团名' }] },
        forward: async () => {
          throw new Error('projection failed')
        },
      }),
    ).rejects.toThrow('projection failed')

    expect(store.records).toHaveLength(1)
    expect(store.records[0]).toMatchObject({
      name: 'submitReviewPackage',
      kind: 'write',
      decision: 'review',
      executionStatus: 'failed',
    })
  })

  it('keeps only a safe summary on the action record', async () => {
    const store = new InMemoryAiActionStore()
    const gateway = new AiActionGateway(store)
    const secretName = '秘密团名-含证件号110101199001011234'
    const secretEvidence = '护照页原文 E12345678'

    const result = await gateway.execute({
      name: 'submitReviewPackage',
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

  it.each(['getTaskContext', 'searchRouteTemplates', 'getMaterialParseResult', 'submitReviewPackage'] as const)(
    'forwards registered action %s in observation',
    async (name) => {
      const store = new InMemoryAiActionStore()
      const gateway = new AiActionGateway(store)
      const forwarded: string[] = []

      const result = await gateway.execute({
        name,
        actor,
        input: { taskId: 'task-1' },
        forward: async () => {
          forwarded.push(name)
          return { ok: true }
        },
      })

      expect(forwarded).toEqual([name])
      expect(result.action?.name).toBe(name)
      expect(result.action?.reasonCode).toBe('OBSERVATION_PERIOD')
      expect(result.action?.executionStatus).toBe('succeeded')
    },
  )
})

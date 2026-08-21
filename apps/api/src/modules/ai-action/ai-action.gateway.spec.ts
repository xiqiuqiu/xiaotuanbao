import { AiActionGateway } from './ai-action.gateway'
import { FailingAiActionStore, InMemoryAiActionStore } from './ai-action.in-memory.store'

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

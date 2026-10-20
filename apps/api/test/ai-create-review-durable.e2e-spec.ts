import type { AddressInfo } from 'node:net'
import type { INestApplication } from '@nestjs/common'
import { DepartureType, PrismaClient } from '@prisma/client'
import { recoveryFromAttempt } from '../src/modules/ai-create-task/attempt-diagnostic'
import { AiWorkflowProcessor } from '../src/modules/ai-create-task/ai-workflow.processor'
import { authRequest, createTestApp, loginAs } from './helpers'
import { startDeterministicHeadlessAgent, resolvedItemOutcome } from './support/deterministic-headless-agent'
import { startDeterministicParseWorker } from './support/deterministic-parse-worker'

const AGENT_SECRET = 'e2e-agent-service-secret'
const COMPLETED_MESSAGE = '已记下你的出团说明，可以继续在表单完善。'
const CONFIRMATION_RECEIPT = '本次审核建议已写入建团草稿。'

describe('Durable form review disposition and receipts (e2e) #319', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let processor: AiWorkflowProcessor
  let coordinatorToken: string
  let financeToken: string
  let organizationId: string
  let ownerUserId: string
  let agent: Awaited<ReturnType<typeof startDeterministicHeadlessAgent>>
  let ocr: Awaited<ReturnType<typeof startDeterministicParseWorker>>
  const testPrefix = `e2e-ai-review-durable-${Date.now()}`

  beforeAll(async () => {
    let apiBaseUrl = ''
    process.env.AI_CREATE_ASSIST_ENABLED = 'true'
    process.env.AGENT_SERVICE_SECRET = AGENT_SECRET

    ocr = await startDeterministicParseWorker({ text: '出团日期 2026-10-01' })
    process.env.OCR_BASE_URL = ocr.origin

    agent = await startDeterministicHeadlessAgent({
      getApiBaseUrl: () => apiBaseUrl,
      serviceSecret: AGENT_SECRET,
      outcome: resolvedItemOutcome({ kind: 'awaiting_user_input', interaction: { type: 'free_text', prompt: COMPLETED_MESSAGE }, completionBasis: { kind: 'persistent_clarification' } }),
    })
    process.env.AGENT_INTERNAL_URL = agent.origin

    app = await createTestApp()
    const address = app.getHttpServer().address() as AddressInfo
    apiBaseUrl = `http://127.0.0.1:${address.port}`

    prisma = new PrismaClient()
    processor = app.get(AiWorkflowProcessor)
    coordinatorToken = await loginAs(app, 'wangjie')
    financeToken = await loginAs(app, 'acai')

    const user = await prisma.user.findFirst({
      where: { username: 'wangjie', deletedAt: null },
    })
    if (!user) {
      throw new Error('Seed user wangjie not found')
    }
    organizationId = user.organizationId
    ownerUserId = user.id
  })

  afterAll(async () => {
    await prisma.aiConversation.deleteMany({
      where: { organizationId, creatorUserId: ownerUserId },
    })
    await prisma.aiReviewPackage.deleteMany({
      where: { task: { organizationId, ownerUserId } },
    })
    await prisma.aiCreateActivityRun.deleteMany({
      where: { task: { organizationId, ownerUserId } },
    })
    await prisma.departureCreationDraft.deleteMany({
      where: { task: { agentTask: { organizationId, ownerUserId } } },
    })
    await prisma.agentTask.deleteMany({
      where: { organizationId, ownerUserId },
    })
    await prisma.$disconnect()
    await agent.close()
    await ocr.close()
    await app.close()
  })

  afterEach(() => {
    agent.setOutcome(resolvedItemOutcome(reviewOutcome(1)))
    agent.release()
    ocr.release()
  })

  async function openSession() {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/agent/tasks/departure-creation/sessions')
      .send({
        draft: {
          mode: 'manual',
          routeName: `${testPrefix}-路线`,
          name: `${testPrefix}-原团名`,
          startDate: '2026-09-01',
          endDate: '2026-09-05',
          ownerUserId,
          departureType: DepartureType.combined,
        },
      })
      .expect(201)
    return response.body.data as {
      task: {
        id: string
        draft: { version: number; snapshot: { name: string } }
        pendingReview: { id: string; version: number } | null
      }
      conversation: { id: string }
    }
  }

  function sendMessage(taskId: string, conversationId: string, text: string, key: string) {
    return authRequest(app, coordinatorToken)
      .post(`/api/agent/conversations/${conversationId}/messages`)
      .set('Idempotency-Key', key)
      .send({ text, primaryTaskId: taskId })
  }

  async function listEvents(_taskId: string, conversationId: string, afterSequence = 0) {
    const response = await authRequest(app, coordinatorToken)
      .get(
        `/api/agent/conversations/${conversationId}/events?afterSequence=${afterSequence}`,
      )
      .expect(200)
    return response.body.data as {
      events: Array<{
        id: string
        sequence: number
        kind: string
        payload: Record<string, unknown>
      }>
      lastSequence: number
      activeBatch: { id: string; status: string } | null
      queuedBatches: Array<{ id: string; status: string; queued?: boolean }>
    }
  }

  function reviewOutcome(objectVersion: number, name = `${testPrefix}-候选团名`) {
    return {
      kind: 'awaiting_review' as const,
      completionBasis: { kind: 'accepted_review_package' as const },
      reviewPackage: {
        objectVersion,
        confirmationUnit: 'basic_info_draft' as const,
        candidates: [
          {
            fieldKey: 'name' as const,
            proposedValue: name,
            clarity: 'clear' as const,
            evidence: [{ kind: 'user_message' as const, sequence: 1, excerpt: '请按这个团名建团' }],
          },
        ],
      },
      diagnostic: {
        mastraTraceId: `trace-${testPrefix}`,
        usageSource: 'estimated' as const,
        usage: { total: 88 },
        latencyMs: 420,
        toolSteps: [
          {
            stepId: 'step-1',
            toolName: 'proposeReviewPackage',
            capabilityKey: 'departure.review-package.propose',
            capabilityVersion: 1,
            status: 'succeeded' as const,
            latencyMs: 40,
          },
        ],
        modelSteps: [],
      },
    }
  }

  async function submitAwaitingReview(taskId: string, conversationId: string, objectVersion: number) {
    agent.setOutcome(resolvedItemOutcome(reviewOutcome(objectVersion)))
    await sendMessage(taskId, conversationId, '请按这个团名建团', `e2e-review-${taskId}`).expect(201)
    await processor.processDueJobs(5)
    await waitFor(async () => {
      const batch = await prisma.aiInputBatch.findFirst({
        where: { taskLinks: { some: { taskId } }, status: 'awaiting_review' },
      })
      expect(batch).not.toBeNull()
    })
  }

  it('rejects a display-only propose_change as AGENT_OUTCOME_INCOMPLETE without retry or agent_message #474', async () => {
    agent.setOutcome({
      kind: 'answered',
      message: '我将继续处理团名修改。',
      completionBasis: { kind: 'final_answer' },
    })
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id
    const beforeCalls = agent.callCount()
    await sendMessage(taskId, conversationId, '请按这个团名建团', `e2e-false-complete-${taskId}`).expect(201)
    await processor.processDueJobs(5)
    await processor.processDueJobs(5)

    expect(agent.callCount()).toBe(beforeCalls + 1)
    const batch = await prisma.aiInputBatch.findFirstOrThrow({
      where: { taskLinks: { some: { taskId } } },
      orderBy: { createdAt: 'desc' },
    })
    expect(batch.status).toBe('failed')
    const attempt = await prisma.aiAgentAttempt.findFirstOrThrow({ where: { inputBatchId: batch.id } })
    expect(attempt.status).toBe('failed')
    expect(attempt.errorCode).toBe('AGENT_OUTCOME_INCOMPLETE')
    const job = await prisma.aiWorkflowJob.findFirstOrThrow({
      where: { conversationId, type: 'agent_batch' },
    })
    expect(job.status).toBe('failed')
    expect(job.lastErrorCode).toBe('AGENT_OUTCOME_INCOMPLETE')
    expect(
      await prisma.aiConversationEvent.count({
        where: { conversationId, kind: 'agent_message' },
      }),
    ).toBe(0)
  })

  it('atomically persists the review package, completion message and awaiting_review without writing the draft', async () => {
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id

    await submitAwaitingReview(taskId, conversationId, opened.task.draft.version)

    const task = await authRequest(app, coordinatorToken)
      .get(`/api/agent/tasks/${taskId}`)
      .expect(200)
    expect(task.body.data.draft.version).toBe(opened.task.draft.version)
    expect(task.body.data.draft.snapshot.name).toBe(`${testPrefix}-原团名`)
    expect(task.body.data.pendingReview).toMatchObject({
      status: 'pending',
      version: 1,
      baseObjectVersion: opened.task.draft.version,
      confirmationUnit: 'basic_info_draft',
      candidates: [
        {
          fieldKey: 'name',
          proposedValue: `${testPrefix}-候选团名`,
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '请按这个团名建团' }],
        },
      ],
    })

    const pkg = await prisma.aiReviewPackage.findFirstOrThrow({ where: { taskId } })
    const batch = await prisma.aiInputBatch.findFirstOrThrow({
      where: { taskLinks: { some: { taskId } }, status: 'awaiting_review' },
    })
    expect(pkg.inputBatchId).toBe(batch.id)
    const attempt = await prisma.aiAgentAttempt.findFirstOrThrow({
      where: { inputBatchId: batch.id },
      include: { aiActions: true },
    })
    expect(attempt.status).toBe('completed')
    expect(attempt.agentDefinitionKey).toBe('departure.create')
    expect(attempt.agentDefinitionVersion).toBe(1)
    expect(attempt.usageSource).toBe('estimated')
    expect(attempt.usage).toEqual({ total: 88 })
    expect(attempt.latencyMs).toBe(420)
    expect(attempt.mastraTraceId).toBe(`trace-${testPrefix}`)
    expect(attempt.toolSteps).toEqual([
      expect.objectContaining({
        toolName: 'proposeReviewPackage',
        capabilityKey: 'departure.review-package.propose',
        capabilityVersion: 1,
      }),
    ])
    expect(attempt.aiActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          attemptId: attempt.id,
          capabilityKey: 'departure.review-package.propose',
          capabilityVersion: 1,
          agentDefinitionKey: 'departure.create',
        }),
      ]),
    )
    await prisma.aiAgentAttempt.update({
      where: { id: attempt.id },
      data: { mastraTraceId: null },
    })
    const recovered = await prisma.aiAgentAttempt.findUniqueOrThrow({ where: { id: attempt.id } })
    expect(recovered.status).toBe('completed')
    expect(recovered.mastraTraceId).toBeNull()
    expect(
      recoveryFromAttempt({
        status: recovered.status,
        errorCode: recovered.errorCode,
        resultJson: recovered.resultJson,
        mastraTraceId: recovered.mastraTraceId,
      }),
    ).toEqual({ recoverable: true, status: 'completed', errorCode: null })
    expect(
      await prisma.aiReviewPackage.findFirstOrThrow({ where: { id: pkg.id } }),
    ).toMatchObject({ attemptId: attempt.id, status: 'pending' })
    expect(recovered.status).toBe('completed')
    expect(recovered.endedAt).not.toBeNull()

    const listed = await listEvents(taskId, conversationId)
    expect(listed.activeBatch).toMatchObject({ id: batch.id, status: 'awaiting_review' })
    expect(
      listed.events.some(
        (event) =>
          event.kind === 'agent_message' &&
          event.payload.reviewPackageId === pkg.id,
      ),
    ).toBe(true)
    expect(
      listed.events.some(
        (event) =>
          event.kind === 'batch_status' &&
          event.payload.status === 'awaiting_review' &&
          event.payload.reviewPackageId === pkg.id,
      ),
    ).toBe(true)
  })

  it('confirms corrected candidates with CAS and persists the receipt even when the model cannot produce an outcome', async () => {
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id
    await submitAwaitingReview(taskId, conversationId, opened.task.draft.version)
    const callsAfterSubmit = agent.callCount()

    const pending = (
      await authRequest(app, coordinatorToken).get(`/api/agent/tasks/${taskId}`).expect(200)
    ).body.data.pendingReview as { id: string; version: number }

    const patched = await authRequest(app, coordinatorToken)
      .patch(`/api/agent/review-packages/${pending.id}`)
      .send({
        corrections: { name: `${testPrefix}-修正团名` },
        expectedPackageVersion: pending.version,
      })
      .expect(200)
    expect(patched.body.data.draft.snapshot.name).toBe(`${testPrefix}-原团名`)
    expect(patched.body.data.pendingReview.candidates[0].userCorrectedValue).toBe(
      `${testPrefix}-修正团名`,
    )

    agent.setOutcome({ kind: 'failed', error: {
      code: 'AGENT_OUTCOME_INCOMPLETE', message: '模型未形成回执', retryable: false,
    } })
    const confirmed = await authRequest(app, coordinatorToken)
      .post(`/api/agent/review-packages/${pending.id}/confirm`)
      .send({
        expectedVersion: opened.task.draft.version,
        expectedPackageVersion: patched.body.data.pendingReview.version,
        corrections: { name: `${testPrefix}-修正团名` },
      })
      .expect(200)

    expect(confirmed.body.data.pendingReview).toBeNull()
    expect(confirmed.body.data.draft.version).toBe(opened.task.draft.version + 1)
    expect(confirmed.body.data.draft.snapshot.name).toBe(`${testPrefix}-修正团名`)

    const afterConfirm = await listEvents(taskId, conversationId)
    expect(
      afterConfirm.events.some(
        (event) =>
          event.kind === 'batch_status' &&
          event.payload.status === 'completed' &&
          event.payload.disposition === 'confirmed',
      ),
    ).toBe(true)
    expect(
      afterConfirm.events.some(
        (event) =>
          event.kind === 'user_message' && event.payload.text === '已确认本次审核建议',
      ),
    ).toBe(false)
    expect(
      afterConfirm.events.some(
        (event) =>
          event.kind === 'batch_status' &&
          event.payload.status === 'ready_for_agent' &&
          event.payload.disposition === 'confirmed',
      ),
    ).toBe(false)

    await processor.processDueJobs(5)
    expect(agent.callCount()).toBe(callsAfterSubmit)
    const listed = await listEvents(taskId, conversationId)
    expect(listed.events.filter((event) => event.payload.text === CONFIRMATION_RECEIPT)).toHaveLength(1)
    expect(listed.events.some((event) => event.kind === 'error')).toBe(false)
    expect(listed.activeBatch).toBeNull()
    expect(await prisma.aiInputBatch.count({ where: { conversationId } })).toBe(1)
  })

  it('审核回执不占用模型，独立用户输入仍按自己的批次执行', async () => {
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id
    await submitAwaitingReview(taskId, conversationId, opened.task.draft.version)
    const callsAfterSubmit = agent.callCount()

    const ordinaryText = `${testPrefix}-审核期间补一句`
    const ordinary = await sendMessage(
      taskId,
      conversationId,
      ordinaryText,
      `e2e-review-queued-${taskId}`,
    ).expect(201)
    expect(ordinary.body.data.batch).toMatchObject({
      status: 'ready_for_agent',
    })
    expect(ordinary.body.data.batch.queued).not.toBe(true)

    const pending = (
      await authRequest(app, coordinatorToken).get(`/api/agent/tasks/${taskId}`).expect(200)
    ).body.data.pendingReview as { id: string; version: number }

    agent.setOutcome(resolvedItemOutcome({
      kind: 'answered',
      message: '已处理这条独立消息。',
      completionBasis: { kind: 'final_answer' },
    }))
    await authRequest(app, coordinatorToken)
      .post(`/api/agent/review-packages/${pending.id}/confirm`)
      .send({
        expectedVersion: opened.task.draft.version,
        expectedPackageVersion: pending.version,
      })
      .expect(200)

    const confirmed = await listEvents(taskId, conversationId)
    expect(confirmed.events.filter((event) => event.payload.text === CONFIRMATION_RECEIPT)).toHaveLength(1)
    await processor.processDueJobs(1)
    expect(agent.callCount()).toBe(callsAfterSubmit + 1)
    expect(agent.lastUserText()).toContain(ordinaryText)
    expect(await prisma.aiInputBatch.findUniqueOrThrow({ where: { id: ordinary.body.data.batch.id } }))
      .toMatchObject({ status: 'completed' })

    await processor.processDueJobs(5)
    expect(agent.callCount()).toBe(callsAfterSubmit + 1)
    expect(await prisma.aiInputBatch.count({ where: { conversationId } })).toBe(2)
  })

  it('基础审核确认保留同一输入中尚未回答的追问，不将混合诉求标为完成', async () => {
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id
    agent.setOutcome({ kind: 'resolved_items', message: '团名待审核，接送安排待补充。',
      items: [
        { id: 'basic-info', request: '请按这个团名建团', goal: 'propose_change',
          resolution: { kind: 'awaiting_review', reviewPackageIndexes: [0] } },
        { id: 'transfer', request: '核实接送安排', goal: 'clarify',
          resolution: { kind: 'awaiting_user_input', interaction: { type: 'free_text', prompt: '接送日期是哪天？' } } },
      ],
      reviewPackages: [reviewOutcome(opened.task.draft.version).reviewPackage],
      completionBasis: { kind: 'resolved_items' },
    })
    await sendMessage(taskId, conversationId, '请按这个团名建团，并核实接送安排', `mixed-review-${taskId}`).expect(201)
    await processor.processDueJobs(5)
    const pending = await prisma.aiReviewPackage.findFirstOrThrow({ where: { taskId, status: 'pending' } })
    const interaction = await prisma.aiConversationInteraction.findFirstOrThrow({ where: { conversationId, status: 'pending' } })
    const callsAfterSubmit = agent.callCount()

    await authRequest(app, coordinatorToken)
      .post(`/api/agent/review-packages/${pending.id}/confirm`)
      .send({ expectedVersion: opened.task.draft.version, expectedPackageVersion: pending.version })
      .expect(200)
    await processor.processDueJobs(5)

    expect(agent.callCount()).toBe(callsAfterSubmit)
    expect(await prisma.aiConversationInteraction.findUniqueOrThrow({ where: { id: interaction.id } }))
      .toMatchObject({ status: 'pending', prompt: '接送日期是哪天？' })
    expect(await prisma.aiInputBatch.findUniqueOrThrow({ where: { id: interaction.inputBatchId } }))
      .toMatchObject({ status: 'awaiting_user_input' })
    expect(await prisma.aiInputBatch.count({ where: { conversationId } })).toBe(1)
  })

  it('待审核时短回复“对”不确认，取消后追加信息也不复活审核项', async () => {
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id
    await submitAwaitingReview(taskId, conversationId, opened.task.draft.version)
    const pending = (
      await authRequest(app, coordinatorToken).get(`/api/agent/tasks/${taskId}`).expect(200)
    ).body.data.pendingReview as { id: string; version: number }

    agent.setOutcome(
      resolvedItemOutcome({
        kind: 'answered',
        message: '收到这条独立消息，但不会代替审核确认。',
        completionBasis: { kind: 'final_answer' },
      }),
    )
    await sendMessage(
      taskId,
      conversationId,
      '对',
      `e2e-review-short-ordinary-${taskId}`,
    ).expect(201)
    await processor.processDueJobs(5)

    const stillPending = await authRequest(app, coordinatorToken)
      .get(`/api/agent/tasks/${taskId}`)
      .expect(200)
    expect(stillPending.body.data.pendingReview).toMatchObject({
      id: pending.id,
      status: 'pending',
      version: pending.version,
    })
    expect(stillPending.body.data.draft).toMatchObject({
      version: opened.task.draft.version,
      snapshot: { name: `${testPrefix}-原团名` },
    })
    expect(
      await prisma.aiReviewRecord.count({
        where: { packageId: pending.id, action: 'confirm' },
      }),
    ).toBe(0)

    await authRequest(app, coordinatorToken)
      .post(`/api/agent/review-packages/${pending.id}/cancel`)
      .send({ expectedPackageVersion: pending.version })
      .expect(200)
    await sendMessage(
      taskId,
      conversationId,
      '取消后补充说明，但不要恢复刚才的建议',
      `e2e-review-after-cancel-${taskId}`,
    ).expect(201)
    await processor.processDueJobs(5)

    const after = await authRequest(app, coordinatorToken)
      .get(`/api/agent/tasks/${taskId}`)
      .expect(200)
    expect(after.body.data.pendingReview).toBeNull()
    expect(after.body.data.draft).toMatchObject({
      version: opened.task.draft.version,
      snapshot: { name: `${testPrefix}-原团名` },
    })
    expect(
      await prisma.aiReviewPackage.findUniqueOrThrow({ where: { id: pending.id } }),
    ).toMatchObject({ status: 'cancelled' })
    expect(
      await prisma.aiCreateTask.findUniqueOrThrow({ where: { id: taskId } }),
    ).toMatchObject({ departureId: null })
  })

  it('rejects without mutating the draft or enqueueing a continuation', async () => {
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id
    await submitAwaitingReview(taskId, conversationId, opened.task.draft.version)
    const callsAfterSubmit = agent.callCount()

    const pending = (
      await authRequest(app, coordinatorToken).get(`/api/agent/tasks/${taskId}`).expect(200)
    ).body.data.pendingReview as { id: string; version: number }

    const rejected = await authRequest(app, coordinatorToken)
      .post(`/api/agent/review-packages/${pending.id}/reject`)
      .send({ expectedPackageVersion: pending.version })
      .expect(200)

    expect(rejected.body.data.pendingReview).toBeNull()
    expect(rejected.body.data.draft.version).toBe(opened.task.draft.version)
    expect(rejected.body.data.draft.snapshot.name).toBe(`${testPrefix}-原团名`)
    await expect(
      prisma.taskActivity.findMany({
        where: {
          taskId,
          actorUserId: ownerUserId,
          payload: { path: ['reviewPackageId'], equals: pending.id },
        },
        select: { kind: true, summary: true, payload: true },
        orderBy: { createdAt: 'asc' },
      }),
    ).resolves.toEqual([
      {
        kind: 'progress',
        summary: 'User 已拒绝审核项',
        payload: { reviewPackageId: pending.id },
      },
    ])

    await processor.processDueJobs(5)
    expect(agent.callCount()).toBe(callsAfterSubmit)

    const listed = await listEvents(taskId, conversationId)
    expect(listed.activeBatch).toBeNull()
    expect(
      listed.events.some(
        (event) =>
          event.kind === 'batch_status' &&
          event.payload.status === 'completed' &&
          event.payload.disposition === 'rejected',
      ),
    ).toBe(true)
    expect(
      listed.events.some(
        (event) =>
          event.kind === 'batch_status' &&
          event.payload.status === 'ready_for_agent' &&
          event.payload.disposition === 'confirmed',
      ),
    ).toBe(false)
    expect(listed.events.some((event) => event.payload.text === CONFIRMATION_RECEIPT)).toBe(false)
  })

  it('lets the first confirm win CAS and tells the other device the package was already handled', async () => {
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id
    await submitAwaitingReview(taskId, conversationId, opened.task.draft.version)

    const pending = (
      await authRequest(app, coordinatorToken).get(`/api/agent/tasks/${taskId}`).expect(200)
    ).body.data.pendingReview as { id: string; version: number }

    agent.setOutcome(resolvedItemOutcome({
      kind: 'answered',
      message: CONFIRMATION_RECEIPT,
      completionBasis: { kind: 'final_answer' },
    }))
    const body = {
      expectedVersion: opened.task.draft.version,
      expectedPackageVersion: pending.version,
    }
    const [first, second] = await Promise.all([
      authRequest(app, coordinatorToken)
        .post(`/api/agent/review-packages/${pending.id}/confirm`)
        .send(body),
      authRequest(app, coordinatorToken)
        .post(`/api/agent/review-packages/${pending.id}/confirm`)
        .send(body),
    ])
    const statuses = [first.status, second.status].sort()
    expect(statuses).toEqual([200, 409])
    const conflict = first.status === 409 ? first : second
    expect(conflict.body.message).toContain('已处理')
    expect(conflict.body.data.pendingReview).toBeNull()
    expect(conflict.body.data.draft.snapshot.name).toBe(`${testPrefix}-候选团名`)

    const late = await authRequest(app, coordinatorToken)
      .post(`/api/agent/review-packages/${pending.id}/reject`)
      .send({ expectedPackageVersion: pending.version })
      .expect(409)
    expect(late.body.message).toContain('已处理')
    expect(late.body.data.pendingReview).toBeNull()
    expect(late.body.data.draft.snapshot.name).toBe(`${testPrefix}-候选团名`)

    await processor.processDueJobs(5)
    const listed = await listEvents(taskId, conversationId)
    expect(
      listed.events.filter(
        (event) =>
          event.kind === 'batch_status' &&
          event.payload.status === 'ready_for_agent' &&
          event.payload.disposition === 'confirmed',
      ),
    ).toHaveLength(0)
    expect(listed.events.filter((event) => event.payload.text === CONFIRMATION_RECEIPT)).toHaveLength(1)
    expect(
      listed.events.filter(
        (event) =>
          event.kind === 'user_message' && event.payload.text === '已确认本次审核建议',
      ),
    ).toHaveLength(0)
  })

  it('keeps the package pending on package-version conflict and permission denial, and marks target-version stale as conflict', async () => {
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id
    await submitAwaitingReview(taskId, conversationId, opened.task.draft.version)

    const pending = (
      await authRequest(app, coordinatorToken).get(`/api/agent/tasks/${taskId}`).expect(200)
    ).body.data.pendingReview as { id: string; version: number }

    const staleVersion = await authRequest(app, coordinatorToken)
      .post(`/api/agent/review-packages/${pending.id}/confirm`)
      .send({
        expectedVersion: opened.task.draft.version,
        expectedPackageVersion: pending.version + 1,
      })
      .expect(409)
    expect(staleVersion.body.message).toMatch(/版本|已处理/)

    await authRequest(app, financeToken)
      .post(`/api/agent/review-packages/${pending.id}/confirm`)
      .send({
        expectedVersion: opened.task.draft.version,
        expectedPackageVersion: pending.version,
      })
      .expect(403)

    await authRequest(app, coordinatorToken)
      .post('/api/ai-create-tasks/draft')
      .send({
        taskId,
        expectedVersion: opened.task.draft.version,
        draft: {
          mode: 'manual',
          routeName: `${testPrefix}-路线`,
          name: `${testPrefix}-表单改名`,
          startDate: '2026-09-01',
          endDate: '2026-09-05',
          ownerUserId,
          departureType: DepartureType.combined,
        },
      })
      .expect(200)

    const staleDraft = await authRequest(app, coordinatorToken)
      .post(`/api/agent/review-packages/${pending.id}/confirm`)
      .send({
        expectedVersion: opened.task.draft.version + 1,
        expectedPackageVersion: pending.version,
      })
      .expect(409)
    expect(staleDraft.body.message).toContain('目标版本已变化')
    expect(staleDraft.body.data.reviewConflict.status).toBe('stale_target_version')

    const after = await authRequest(app, coordinatorToken)
      .get(`/api/agent/tasks/${taskId}`)
      .expect(200)
    expect(after.body.data.pendingReview).toBeNull()
    expect(after.body.data.draft.snapshot.name).toBe(`${testPrefix}-表单改名`)
    const conflicted = await prisma.aiReviewPackage.findFirstOrThrow({
      where: { id: pending.id },
    })
    expect(conflicted.status).toBe('conflict')
    expect(conflicted.candidates).toEqual(expect.any(Array))

    const batch = await prisma.aiInputBatch.findFirst({
      where: { taskLinks: { some: { taskId } }, status: 'awaiting_review' },
    })
    expect(batch).not.toBeNull()
  })
})

async function waitFor(assert: () => Promise<void>, timeoutMs = 5_000): Promise<void> {
  const started = Date.now()
  let lastError: unknown
  while (Date.now() - started < timeoutMs) {
    try {
      await assert()
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => {
        setTimeout(resolve, 50)
      })
    }
  }
  throw lastError
}

import type { AddressInfo } from 'node:net'
import type { INestApplication } from '@nestjs/common'
import { DepartureType, PrismaClient } from '@prisma/client'
import { AiWorkflowProcessor } from '../src/modules/ai-create-task/ai-workflow.processor'
import { authRequest, createTestApp, loginAs } from './helpers'
import { startDeterministicHeadlessAgent } from './support/deterministic-headless-agent'
import { startDeterministicParseWorker } from './support/deterministic-parse-worker'

const AGENT_SECRET = 'e2e-agent-service-secret'
const COMPLETED_MESSAGE = '已记下你的出团说明，可以继续在表单完善。'
const CONTINUATION_MESSAGE = '已写入团名，可以继续完善出团日期。'

describe('Durable form review batch continuation (e2e) #319', () => {
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
      outcome: { kind: 'completed', message: COMPLETED_MESSAGE },
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
      where: { task: { organizationId, creatorUserId: ownerUserId } },
    })
    await prisma.aiCreateActivityRun.deleteMany({
      where: { task: { organizationId, creatorUserId: ownerUserId } },
    })
    await prisma.departureCreationDraft.deleteMany({
      where: { task: { organizationId, creatorUserId: ownerUserId } },
    })
    await prisma.aiCreateTask.deleteMany({
      where: { organizationId, creatorUserId: ownerUserId },
    })
    await prisma.$disconnect()
    await agent.close()
    await ocr.close()
    await app.close()
  })

  afterEach(() => {
    agent.setOutcome({ kind: 'completed', message: COMPLETED_MESSAGE })
    agent.release()
    ocr.release()
  })

  async function openSession() {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/ai-create-tasks/assist-session')
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
      .post(`/api/ai-create-tasks/${taskId}/conversations/${conversationId}/messages`)
      .set('Idempotency-Key', key)
      .send({ text })
  }

  async function listEvents(taskId: string, conversationId: string, afterSequence = 0) {
    const response = await authRequest(app, coordinatorToken)
      .get(
        `/api/ai-create-tasks/${taskId}/conversations/${conversationId}/events?afterSequence=${afterSequence}`,
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
      reviewPackage: {
        objectVersion,
        confirmationUnit: 'basic_info_draft' as const,
        candidates: [
          {
            fieldKey: 'name' as const,
            proposedValue: name,
            clarity: 'clear' as const,
            evidence: [{ kind: 'user_message' as const, excerpt: `团名叫${name}` }],
          },
        ],
      },
    }
  }

  async function submitAwaitingReview(taskId: string, conversationId: string, objectVersion: number) {
    agent.setOutcome(reviewOutcome(objectVersion))
    await sendMessage(
      taskId,
      conversationId,
      `团名叫${testPrefix}-候选团名`,
      `e2e-review-${taskId}`,
    ).expect(201)
    await processor.processDueJobs(5)
    await waitFor(async () => {
      const batch = await prisma.aiInputBatch.findFirst({
        where: { taskId, status: 'awaiting_review' },
      })
      expect(batch).not.toBeNull()
    })
  }

  it('atomically persists the review package, completion message and awaiting_review without writing the draft', async () => {
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id

    await submitAwaitingReview(taskId, conversationId, opened.task.draft.version)

    const task = await authRequest(app, coordinatorToken)
      .get(`/api/ai-create-tasks/${taskId}`)
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
          evidence: [{ kind: 'user_message', excerpt: `团名叫${testPrefix}-候选团名` }],
        },
      ],
    })

    const pkg = await prisma.aiReviewPackage.findFirstOrThrow({ where: { taskId } })
    const batch = await prisma.aiInputBatch.findFirstOrThrow({
      where: { taskId, status: 'awaiting_review' },
    })
    expect(pkg.inputBatchId).toBe(batch.id)
    const attempt = await prisma.aiAgentAttempt.findFirstOrThrow({
      where: { inputBatchId: batch.id },
    })
    expect(attempt.status).toBe('completed')

    const listed = await listEvents(taskId, conversationId)
    expect(listed.activeBatch).toMatchObject({ id: batch.id, status: 'awaiting_review' })
    expect(
      listed.events.some(
        (event) =>
          event.kind === 'agent_message' &&
          event.payload.text === '已提交待审核建议，请在中间表单确认。' &&
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

  it('keeps corrections as candidates and confirms with CAS, then continues from the latest snapshot', async () => {
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id
    await submitAwaitingReview(taskId, conversationId, opened.task.draft.version)

    const pending = (
      await authRequest(app, coordinatorToken).get(`/api/ai-create-tasks/${taskId}`).expect(200)
    ).body.data.pendingReview as { id: string; version: number }

    const patched = await authRequest(app, coordinatorToken)
      .patch(`/api/ai-create-tasks/${taskId}/review-packages/${pending.id}`)
      .send({ corrections: { name: `${testPrefix}-修正团名` } })
      .expect(200)
    expect(patched.body.data.draft.snapshot.name).toBe(`${testPrefix}-原团名`)
    expect(patched.body.data.pendingReview.candidates[0].userCorrectedValue).toBe(
      `${testPrefix}-修正团名`,
    )

    agent.setOutcome({ kind: 'completed', message: CONTINUATION_MESSAGE })
    const confirmed = await authRequest(app, coordinatorToken)
      .post(`/api/ai-create-tasks/${taskId}/review-packages/${pending.id}/confirm`)
      .send({
        expectedVersion: opened.task.draft.version,
        expectedPackageVersion: pending.version,
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
    ).toBe(true)

    await processor.processDueJobs(5)
    await waitFor(async () => {
      const listed = await listEvents(taskId, conversationId)
      expect(listed.events.some((event) => event.payload.text === CONTINUATION_MESSAGE)).toBe(true)
    })

    const context = agent.lastTaskContext() as {
      data?: { snapshot?: { name?: string }; currentUserMessage?: string }
    }
    expect(context.data?.snapshot?.name).toBe(`${testPrefix}-修正团名`)
    expect(context.data?.currentUserMessage).toContain('已在中间表单确认')
    expect(agent.lastUserText()).toContain('已在中间表单确认')
    expect(agent.lastUserText()).not.toBe('请按这个团名建团')
  })

  it('runs the confirm continuation before a message queued during awaiting_review', async () => {
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id
    await submitAwaitingReview(taskId, conversationId, opened.task.draft.version)
    const callsAfterSubmit = agent.callCount()

    const queuedText = `${testPrefix}-审核期间补一句`
    const queued = await sendMessage(
      taskId,
      conversationId,
      queuedText,
      `e2e-review-queued-${taskId}`,
    ).expect(201)
    expect(queued.body.data.batch).toMatchObject({
      status: 'ready_for_agent',
      queued: true,
    })

    const pending = (
      await authRequest(app, coordinatorToken).get(`/api/ai-create-tasks/${taskId}`).expect(200)
    ).body.data.pendingReview as { id: string; version: number }

    agent.setOutcome({ kind: 'completed', message: CONTINUATION_MESSAGE })
    await authRequest(app, coordinatorToken)
      .post(`/api/ai-create-tasks/${taskId}/review-packages/${pending.id}/confirm`)
      .send({
        expectedVersion: opened.task.draft.version,
        expectedPackageVersion: pending.version,
      })
      .expect(200)

    await processor.processDueJobs(1)
    expect(agent.callCount()).toBe(callsAfterSubmit + 1)
    expect(agent.lastUserText()).toContain('已在中间表单确认')
    expect(agent.lastUserText()).not.toContain(queuedText)

    agent.setOutcome({ kind: 'completed', message: COMPLETED_MESSAGE })
    await processor.processDueJobs(5)
    expect(agent.callCount()).toBe(callsAfterSubmit + 2)
    expect(agent.lastUserText()).toContain(queuedText)
  })

  it('rejects without mutating the draft or enqueueing a continuation', async () => {
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id
    await submitAwaitingReview(taskId, conversationId, opened.task.draft.version)
    const callsAfterSubmit = agent.callCount()

    const pending = (
      await authRequest(app, coordinatorToken).get(`/api/ai-create-tasks/${taskId}`).expect(200)
    ).body.data.pendingReview as { id: string; version: number }

    const rejected = await authRequest(app, coordinatorToken)
      .post(`/api/ai-create-tasks/${taskId}/review-packages/${pending.id}/reject`)
      .send({ expectedPackageVersion: pending.version })
      .expect(200)

    expect(rejected.body.data.pendingReview).toBeNull()
    expect(rejected.body.data.draft.version).toBe(opened.task.draft.version)
    expect(rejected.body.data.draft.snapshot.name).toBe(`${testPrefix}-原团名`)

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
    expect(listed.events.some((event) => event.payload.text === CONTINUATION_MESSAGE)).toBe(false)
  })

  it('lets the first confirm win CAS and tells the other device the package was already handled', async () => {
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id
    await submitAwaitingReview(taskId, conversationId, opened.task.draft.version)

    const pending = (
      await authRequest(app, coordinatorToken).get(`/api/ai-create-tasks/${taskId}`).expect(200)
    ).body.data.pendingReview as { id: string; version: number }

    agent.setOutcome({ kind: 'completed', message: CONTINUATION_MESSAGE })
    const body = {
      expectedVersion: opened.task.draft.version,
      expectedPackageVersion: pending.version,
    }
    const [first, second] = await Promise.all([
      authRequest(app, coordinatorToken)
        .post(`/api/ai-create-tasks/${taskId}/review-packages/${pending.id}/confirm`)
        .send(body),
      authRequest(app, coordinatorToken)
        .post(`/api/ai-create-tasks/${taskId}/review-packages/${pending.id}/confirm`)
        .send(body),
    ])
    const statuses = [first.status, second.status].sort()
    expect(statuses).toEqual([200, 409])
    const conflict = first.status === 409 ? first : second
    expect(conflict.body.message).toContain('已处理')
    expect(conflict.body.data.pendingReview).toBeNull()
    expect(conflict.body.data.draft.snapshot.name).toBe(`${testPrefix}-候选团名`)

    const late = await authRequest(app, coordinatorToken)
      .post(`/api/ai-create-tasks/${taskId}/review-packages/${pending.id}/reject`)
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
    ).toHaveLength(1)
    expect(
      listed.events.filter(
        (event) =>
          event.kind === 'user_message' && event.payload.text === '已确认本次审核建议',
      ),
    ).toHaveLength(0)
  })

  it('keeps the package pending on package-version conflict, permission denial and draft conflict', async () => {
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id
    await submitAwaitingReview(taskId, conversationId, opened.task.draft.version)

    const pending = (
      await authRequest(app, coordinatorToken).get(`/api/ai-create-tasks/${taskId}`).expect(200)
    ).body.data.pendingReview as { id: string; version: number }

    const staleVersion = await authRequest(app, coordinatorToken)
      .post(`/api/ai-create-tasks/${taskId}/review-packages/${pending.id}/confirm`)
      .send({
        expectedVersion: opened.task.draft.version,
        expectedPackageVersion: pending.version + 1,
      })
      .expect(409)
    expect(staleVersion.body.message).toMatch(/版本|已处理/)

    await authRequest(app, financeToken)
      .post(`/api/ai-create-tasks/${taskId}/review-packages/${pending.id}/confirm`)
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
      .post(`/api/ai-create-tasks/${taskId}/review-packages/${pending.id}/confirm`)
      .send({
        expectedVersion: opened.task.draft.version + 1,
        expectedPackageVersion: pending.version,
      })
      .expect(409)
    expect(staleDraft.body.message).toContain('旧候选不能覆盖新值')

    const after = await authRequest(app, coordinatorToken)
      .get(`/api/ai-create-tasks/${taskId}`)
      .expect(200)
    expect(after.body.data.pendingReview.id).toBe(pending.id)
    expect(after.body.data.pendingReview.status).toBe('pending')
    expect(after.body.data.draft.snapshot.name).toBe(`${testPrefix}-表单改名`)

    const batch = await prisma.aiInputBatch.findFirst({
      where: { taskId, status: 'awaiting_review' },
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

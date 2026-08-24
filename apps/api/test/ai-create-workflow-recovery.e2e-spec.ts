import type { AddressInfo } from 'node:net'
import type { INestApplication } from '@nestjs/common'
import { DepartureType, PrismaClient, UserStatus } from '@prisma/client'
import {
  WORKFLOW_MAX_ATTEMPTS,
  workflowBackoffMs,
} from '../src/modules/ai-create-task/ai-conversation.constants'
import { AiWorkflowProcessor } from '../src/modules/ai-create-task/ai-workflow.processor'
import { authRequest, createTestApp, loginAs } from './helpers'
import { startDeterministicHeadlessAgent } from './support/deterministic-headless-agent'
import { startDeterministicParseWorker } from './support/deterministic-parse-worker'

const AGENT_SECRET = 'e2e-agent-service-secret'
const COMPLETED_MESSAGE = '已记下你的出团说明，可以继续在表单完善。'
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

describe('AI workflow recovery and creator retry (e2e) #322', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let processor: AiWorkflowProcessor
  let coordinatorToken: string
  let peerToken: string
  let organizationId: string
  let ownerUserId: string
  let agent: Awaited<ReturnType<typeof startDeterministicHeadlessAgent>>
  let ocr: Awaited<ReturnType<typeof startDeterministicParseWorker>>
  const testPrefix = `e2e-ai-recovery-${Date.now()}`
  const previousLease = process.env.WORKFLOW_LEASE_MS
  const previousHeartbeat = process.env.WORKFLOW_HEARTBEAT_MS

  beforeAll(async () => {
    let apiBaseUrl = ''
    process.env.AI_CREATE_ASSIST_ENABLED = 'true'
    process.env.AGENT_SERVICE_SECRET = AGENT_SECRET
    process.env.WORKFLOW_LEASE_MS = '1500'
    process.env.WORKFLOW_HEARTBEAT_MS = '400'

    ocr = await startDeterministicParseWorker({ text: '九月川西线 预计 12 人' })
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
    peerToken = await loginAs(app, 'mazong')

    const user = await prisma.user.findFirst({
      where: { username: 'wangjie', deletedAt: null },
    })
    if (!user) {
      throw new Error('Seed user wangjie not found')
    }
    organizationId = user.organizationId
    ownerUserId = user.id
  })

  afterEach(async () => {
    agent.setOutcome({ kind: 'completed', message: COMPLETED_MESSAGE })
    agent.release()
    ocr.release()
    await prisma.user.update({
      where: { id: ownerUserId },
      data: { status: UserStatus.enabled },
    })
  })

  afterAll(async () => {
    if (previousLease == null) {
      delete process.env.WORKFLOW_LEASE_MS
    } else {
      process.env.WORKFLOW_LEASE_MS = previousLease
    }
    if (previousHeartbeat == null) {
      delete process.env.WORKFLOW_HEARTBEAT_MS
    } else {
      process.env.WORKFLOW_HEARTBEAT_MS = previousHeartbeat
    }
    await prisma.aiConversation.deleteMany({
      where: { organizationId, creatorUserId: ownerUserId },
    })
    await prisma.departureMaterial.deleteMany({
      where: { organizationId, createdByUserId: ownerUserId },
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

  async function openSession() {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/ai-create-tasks/assist-session')
      .send({
        draft: {
          mode: 'manual',
          routeName: `${testPrefix}-路线`,
          name: `${testPrefix}-团`,
          startDate: '2026-09-01',
          endDate: '2026-09-05',
          ownerUserId,
          departureType: DepartureType.combined,
        },
      })
      .expect(201)
    return response.body.data as {
      task: { id: string; draft: { version: number } }
      conversation: { id: string }
    }
  }

  function sendText(
    taskId: string,
    conversationId: string,
    text: string,
    idempotencyKey: string,
  ) {
    return authRequest(app, coordinatorToken)
      .post(`/api/ai-create-tasks/${taskId}/conversations/${conversationId}/messages`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ text })
  }

  function retryBatch(
    taskId: string,
    conversationId: string,
    batchId: string,
    idempotencyKey: string,
  ) {
    return authRequest(app, coordinatorToken)
      .post(
        `/api/ai-create-tasks/${taskId}/conversations/${conversationId}/batches/${batchId}/retry`,
      )
      .set('Idempotency-Key', idempotencyKey)
      .send({})
  }

  async function runJobs(taskId?: string) {
    if (taskId) {
      await prisma.aiWorkflowJob.updateMany({
        where: { taskId, status: { in: ['pending', 'claimed'] } },
        data: {
          leaseExpiresAt: new Date(Date.now() - 1_000),
          nextAttemptAt: new Date(),
        },
      })
    }
    return processor.processDueJobs(20)
  }

  async function listEvents(taskId: string, conversationId: string) {
    const response = await authRequest(app, coordinatorToken)
      .get(`/api/ai-create-tasks/${taskId}/conversations/${conversationId}/events`)
      .expect(200)
    return response.body.data as {
      events: Array<{ kind: string; payload: Record<string, unknown> }>
      activeBatch: { id: string; status: string } | null
    }
  }

  function reviewOutcome(objectVersion: number) {
    return {
      kind: 'awaiting_review' as const,
      reviewPackage: {
        objectVersion,
        confirmationUnit: 'basic_info_draft' as const,
        candidates: [
          {
            fieldKey: 'name' as const,
            proposedValue: `${testPrefix}-候选团名`,
            clarity: 'clear' as const,
            evidence: [{ kind: 'user_message' as const, sequence: 1, excerpt: '团名' }],
          },
        ],
      },
    }
  }

  it('lets the creator retry a failed Agent batch without sending a new User message', async () => {
    agent.setOutcome({
      kind: 'failed',
      error: {
        code: 'MODEL_REFUSED',
        message: '模型拒绝回答，请换一种说法或继续使用表单',
        retryable: false,
      },
    })
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id
    const sent = await sendText(taskId, conversationId, '这次会失败', `e2e-retry-fail-${taskId}`).expect(
      201,
    )
    const batchId = sent.body.data.batch.id as string
    await runJobs()

    const failed = await listEvents(taskId, conversationId)
    expect(failed.events.filter((event) => event.kind === 'user_message')).toHaveLength(1)
    expect(
      failed.events.some(
        (event) => event.kind === 'batch_status' && event.payload.status === 'failed',
      ),
    ).toBe(true)

    agent.setOutcome({ kind: 'completed', message: COMPLETED_MESSAGE })
    const retried = await retryBatch(taskId, conversationId, batchId, `e2e-retry-${taskId}`).expect(200)
    expect(retried.body.data.batch).toMatchObject({ id: batchId, status: 'ready_for_agent' })
    expect(retried.body.data.events.map((event: { kind: string }) => event.kind)).toEqual([
      'batch_status',
    ])
    const replay = await retryBatch(taskId, conversationId, batchId, `e2e-retry-${taskId}`).expect(200)
    expect(replay.body.data.lastSequence).toBe(retried.body.data.lastSequence)

    const job = await prisma.aiWorkflowJob.findFirstOrThrow({
      where: { inputBatchId: batchId, type: 'agent_batch' },
    })
    expect(job).toMatchObject({ status: 'pending', attemptCount: 0 })

    await runJobs()
    const recovered = await listEvents(taskId, conversationId)
    expect(recovered.events.filter((event) => event.kind === 'user_message')).toHaveLength(1)
    expect(recovered.events.some((event) => event.payload.text === COMPLETED_MESSAGE)).toBe(true)
    expect(
      recovered.events.some(
        (event) => event.kind === 'batch_status' && event.payload.status === 'completed',
      ),
    ).toBe(true)
  })

  it('rejects retry for cancelled or awaiting_review batches and for other members', async () => {
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id
    const sent = await sendText(taskId, conversationId, '先停再试', `e2e-retry-stop-${taskId}`).expect(
      201,
    )
    const batchId = sent.body.data.batch.id as string
    await authRequest(app, coordinatorToken)
      .post(
        `/api/ai-create-tasks/${taskId}/conversations/${conversationId}/batches/${batchId}/stop`,
      )
      .set('Idempotency-Key', `e2e-stop-${taskId}`)
      .send({})
      .expect(200)
    await retryBatch(taskId, conversationId, batchId, `e2e-retry-cancelled-${taskId}`).expect(409)

    const review = await openSession()
    agent.setOutcome(reviewOutcome(review.task.draft.version))
    const reviewing = await sendText(
      review.task.id,
      review.conversation.id,
      '请提交审核',
      `e2e-retry-review-${review.task.id}`,
    ).expect(201)
    await runJobs()
    await retryBatch(
      review.task.id,
      review.conversation.id,
      reviewing.body.data.batch.id as string,
      `e2e-retry-reviewing-${review.task.id}`,
    ).expect(409)

    await authRequest(app, peerToken)
      .post(
        `/api/ai-create-tasks/${taskId}/conversations/${conversationId}/batches/${batchId}/retry`,
      )
      .set('Idempotency-Key', `e2e-peer-retry-${taskId}`)
      .send({})
      .expect(403)
  })

  it('backs off transient Agent 5xx instead of failing the batch', async () => {
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id
    const sent = await sendText(taskId, conversationId, '瞬时故障', `e2e-5xx-${taskId}`).expect(201)
    agent.failNextHttp(503)
    const before = Date.now()
    await runJobs()

    const job = await prisma.aiWorkflowJob.findFirstOrThrow({
      where: { inputBatchId: sent.body.data.batch.id as string, type: 'agent_batch' },
    })
    expect(job.status).toBe('pending')
    expect(job.lastErrorCode).toBe('AGENT_UNAVAILABLE')
    expect(job.attemptCount).toBe(1)
    expect(job.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + workflowBackoffMs(1) - 500)
    const listed = await listEvents(taskId, conversationId)
    expect(
      listed.events.some(
        (event) => event.kind === 'batch_status' && event.payload.status === 'failed',
      ),
    ).toBe(false)
  })

  it('backs off transient parse 5xx instead of failing the material', async () => {
    const opened = await openSession()
    const taskId = opened.task.id
    ocr.failNext(503)
    const before = Date.now()
    await authRequest(app, coordinatorToken)
      .post(
        `/api/ai-create-tasks/${taskId}/conversations/${opened.conversation.id}/messages`,
      )
      .set('Idempotency-Key', `e2e-parse-5xx-${taskId}`)
      .field('text', '请解析附件')
      .attach('files', PNG_1X1, { filename: '瞬时解析.png', contentType: 'image/png' })
      .expect(201)
    await runJobs()

    const job = await prisma.aiWorkflowJob.findFirstOrThrow({
      where: { taskId, type: 'material_parse' },
    })
    expect(job.status).toBe('pending')
    expect(job.lastErrorCode).toBe('PARSE_UNAVAILABLE')
    expect(job.attemptCount).toBe(1)
    expect(job.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + workflowBackoffMs(1) - 500)
    const material = await prisma.departureMaterial.findFirstOrThrow({ where: { taskId } })
    expect(material.status).not.toBe('failed')
  })

  it('fails immediately on VERSION_CONFLICT and after permission revoke without calling tools', async () => {
    const conflict = await openSession()
    agent.setOutcome(reviewOutcome(conflict.task.draft.version + 9))
    await sendText(
      conflict.task.id,
      conflict.conversation.id,
      '版本冲突',
      `e2e-conflict-${conflict.task.id}`,
    ).expect(201)
    await runJobs()
    const conflictJob = await prisma.aiWorkflowJob.findFirstOrThrow({
      where: { taskId: conflict.task.id, type: 'agent_batch' },
    })
    expect(conflictJob.status).toBe('failed')
    expect(conflictJob.lastErrorCode).toBe('VERSION_CONFLICT')

    const opened = await openSession()
    const beforeAgent = agent.callCount()
    await sendText(opened.task.id, opened.conversation.id, '权限已撤', `e2e-perm-${opened.task.id}`).expect(
      201,
    )
    await prisma.user.update({
      where: { id: ownerUserId },
      data: { status: UserStatus.disabled },
    })
    await runJobs()
    expect(agent.callCount()).toBe(beforeAgent)
    const denied = await prisma.aiWorkflowJob.findFirstOrThrow({
      where: { taskId: opened.task.id, type: 'agent_batch' },
    })
    expect(denied).toMatchObject({ status: 'failed', lastErrorCode: 'PERMISSION_DENIED' })
    await prisma.user.update({
      where: { id: ownerUserId },
      data: { status: UserStatus.enabled },
    })
    const retried = await retryBatch(
      opened.task.id,
      opened.conversation.id,
      denied.inputBatchId,
      `e2e-perm-retry-${opened.task.id}`,
    ).expect(200)
    expect(retried.body.data.batch.status).toBe('ready_for_agent')
  })

  it('reclaims a claimed job after crash and keeps a single pending review package', async () => {
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id
    agent.setOutcome(reviewOutcome(opened.task.draft.version))
    const sent = await sendText(taskId, conversationId, '崩溃后回包', `e2e-crash-${taskId}`).expect(201)
    const job = await prisma.aiWorkflowJob.findFirstOrThrow({
      where: { taskId, type: 'agent_batch' },
    })
    await prisma.aiInputBatch.update({
      where: { id: job.inputBatchId },
      data: { status: 'agent_running' },
    })
    await prisma.aiWorkflowJob.update({
      where: { id: job.id },
      data: {
        status: 'claimed',
        claimedAt: new Date(Date.now() - 10_000),
        claimedBy: 'dead-worker',
        leaseExpiresAt: new Date(Date.now() - 1_000),
        attemptCount: 1,
      },
    })
    await runJobs()
    await prisma.aiWorkflowJob.update({
      where: { id: job.id },
      data: {
        status: 'claimed',
        claimedAt: new Date(Date.now() - 10_000),
        claimedBy: 'dead-worker-2',
        leaseExpiresAt: new Date(Date.now() - 1_000),
      },
    })
    await prisma.aiInputBatch.update({
      where: { id: job.inputBatchId },
      data: { status: 'agent_running' },
    })
    await runJobs()
    const packages = await prisma.aiReviewPackage.findMany({
      where: { taskId, status: 'pending' },
    })
    expect(packages).toHaveLength(1)
    expect(sent.body.data.batch.id).toBe(job.inputBatchId)
  })

  it('renews the lease during a long Agent run so the job is not stolen', async () => {
    const opened = await openSession()
    const taskId = opened.task.id
    await sendText(taskId, opened.conversation.id, '长跑续租', `e2e-lease-${taskId}`).expect(201)
    agent.holdNextCall()
    const running = processor.processDueJobs(5)
    await waitFor(async () => {
      const job = await prisma.aiWorkflowJob.findFirst({
        where: { taskId, type: 'agent_batch', status: 'claimed' },
      })
      expect(job).toBeTruthy()
    })
    const first = await prisma.aiWorkflowJob.findFirstOrThrow({
      where: { taskId, type: 'agent_batch' },
    })
    const firstLease = first.leaseExpiresAt?.getTime() ?? 0
    await new Promise((resolve) => setTimeout(resolve, 900))
    const renewed = await prisma.aiWorkflowJob.findFirstOrThrow({ where: { id: first.id } })
    expect(renewed.status).toBe('claimed')
    expect(renewed.leaseExpiresAt?.getTime() ?? 0).toBeGreaterThan(firstLease)
    agent.release()
    await running
    const done = await prisma.aiWorkflowJob.findFirstOrThrow({ where: { id: first.id } })
    expect(done.status).toBe('succeeded')
  })

  it('keeps Agent slots free while a slow parse is in flight', async () => {
    const parseSession = await openSession()
    const agentSession = await openSession()
    ocr.holdNextCall()
    agent.holdNextCall()

    await authRequest(app, coordinatorToken)
      .post(
        `/api/ai-create-tasks/${parseSession.task.id}/conversations/${parseSession.conversation.id}/messages`,
      )
      .set('Idempotency-Key', `e2e-parse-slot-${parseSession.task.id}`)
      .field('text', '请解析附件')
      .attach('files', PNG_1X1, { filename: '团期.png', contentType: 'image/png' })
      .expect(201)
    await sendText(
      agentSession.task.id,
      agentSession.conversation.id,
      '并行 Agent',
      `e2e-agent-slot-${agentSession.task.id}`,
    ).expect(201)

    const running = processor.processDueJobs(5)
    await waitFor(async () => {
      const parseClaimed = await prisma.aiWorkflowJob.count({
        where: { taskId: parseSession.task.id, type: 'material_parse', status: 'claimed' },
      })
      const agentClaimed = await prisma.aiWorkflowJob.count({
        where: { taskId: agentSession.task.id, type: 'agent_batch', status: 'claimed' },
      })
      expect(parseClaimed).toBe(1)
      expect(agentClaimed).toBe(1)
    })
    ocr.release()
    agent.release()
    await running
  })

  it('still parses after the initiating User is disabled', async () => {
    const opened = await openSession()
    await authRequest(app, coordinatorToken)
      .post(
        `/api/ai-create-tasks/${opened.task.id}/conversations/${opened.conversation.id}/messages`,
      )
      .set('Idempotency-Key', `e2e-user-disabled-parse-${opened.task.id}`)
      .field('text', 'User 停用后仍应归档')
      .attach('files', PNG_1X1, { filename: '停用后.png', contentType: 'image/png' })
      .expect(201)
    await prisma.user.update({
      where: { id: ownerUserId },
      data: { status: UserStatus.disabled },
    })
    await runJobs()
    const material = await prisma.departureMaterial.findFirstOrThrow({
      where: { taskId: opened.task.id },
    })
    expect(['available', 'partially_available']).toContain(material.status)
  })

  it('stops auto-retrying after the shared attempt cap', async () => {
    const opened = await openSession()
    const sent = await sendText(
      opened.task.id,
      opened.conversation.id,
      '毒任务',
      `e2e-cap-${opened.task.id}`,
    ).expect(201)
    await prisma.aiWorkflowJob.updateMany({
      where: { inputBatchId: sent.body.data.batch.id as string },
      data: { attemptCount: WORKFLOW_MAX_ATTEMPTS, status: 'pending', nextAttemptAt: new Date() },
    })
    await runJobs()
    const job = await prisma.aiWorkflowJob.findFirstOrThrow({
      where: { inputBatchId: sent.body.data.batch.id as string, type: 'agent_batch' },
    })
    expect(job.status).toBe('failed')
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

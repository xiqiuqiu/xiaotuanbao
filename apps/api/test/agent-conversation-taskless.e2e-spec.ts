import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { INestApplication } from '@nestjs/common'
import {
  AiAgentAttemptStatus,
  AiConversationEventKind,
  AiInputBatchStatus,
  AiWorkflowJobStatus,
  AiWorkflowJobType,
  PrismaClient,
} from '@prisma/client'
import { CONVERSATION_GENERAL_AGENT_DEFINITION_REF } from '@xiaotuanbao/ai-contracts'
import request from 'supertest'
import { AiWorkflowProcessor } from '../src/modules/ai-create-task/ai-workflow.processor'
import {
  PLAINTEXT_CONTEXT_BUILDER_VERSION,
  PLAINTEXT_SYSTEM_PROMPT_VERSION,
  PLAINTEXT_TOOL_SCHEMA_VERSION,
} from '../src/modules/ai-create-task/ai-conversation.constants'
import { authRequest, createTestApp, loginAs } from './helpers'
import { startDeterministicHeadlessAgent } from './support/deterministic-headless-agent'

const AGENT_SECRET = 'e2e-agent-service-secret'
const COMPLETED_MESSAGE = '这是一条无任务会话的确定性回复。'
const TEST_ORIGIN = 'http://localhost:5173'

describe('Taskless agent conversation runtime (e2e) #365', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let processor: AiWorkflowProcessor
  let coordinatorToken: string
  let financeToken: string
  let peerToken: string
  let organizationId: string
  let ownerUserId: string
  let agent: Awaited<ReturnType<typeof startDeterministicHeadlessAgent>>
  const testPrefix = `e2e365-${Date.now()}`
  const createdIds: string[] = []

  beforeAll(async () => {
    let apiBaseUrl = ''
    process.env.AI_CREATE_ASSIST_ENABLED = 'true'
    process.env.AGENT_SERVICE_SECRET = AGENT_SECRET
    process.env.AI_MODEL = 'deterministic'
    process.env.WORKFLOW_AGENT_CONCURRENCY = '2'

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

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.aiConversation.deleteMany({ where: { id: { in: createdIds } } })
    }
    await prisma.$disconnect()
    await agent.close()
    await app.close()
  })

  beforeEach(async () => {
    agent.setOutcome({ kind: 'completed', message: COMPLETED_MESSAGE })
    await prisma.aiWorkflowJob.updateMany({
      where: {
        organizationId,
        taskId: null,
        status: { in: [AiWorkflowJobStatus.pending, AiWorkflowJobStatus.claimed] },
        conversation: { creatorUserId: ownerUserId },
      },
      data: { status: AiWorkflowJobStatus.failed, lastErrorCode: 'e2e-drained' },
    })
    await prisma.aiInputBatch.updateMany({
      where: {
        organizationId,
        creatorUserId: ownerUserId,
        taskLinks: { none: {} },
        status: {
          in: [
            AiInputBatchStatus.ready_for_agent,
            AiInputBatchStatus.agent_running,
            AiInputBatchStatus.waiting_for_materials,
          ],
        },
      },
      data: { status: AiInputBatchStatus.cancelled },
    })
    await prisma.aiAgentAttempt.updateMany({
      where: {
        organizationId,
        taskId: null,
        status: AiAgentAttemptStatus.running,
        conversation: { creatorUserId: ownerUserId },
      },
      data: { status: AiAgentAttemptStatus.failed, errorCode: 'e2e-drained', endedAt: new Date() },
    })
  })

  afterEach(() => {
    agent.release()
  })

  function track(conversationId: string): string {
    createdIds.push(conversationId)
    return conversationId
  }

  function sendFirst(token: string, text: string, idempotencyKey: string) {
    return authRequest(app, token)
      .post('/api/agent/conversations/messages')
      .set('Idempotency-Key', idempotencyKey)
      .send({ text })
  }

  function sendFollowUp(
    token: string,
    conversationId: string,
    text: string,
    idempotencyKey: string,
    reply: {
      replyToEventId?: string
      interactionId?: string
      interactionVersion?: number
      selectedOptionId?: string
    } = {},
  ) {
    return authRequest(app, token)
      .post(`/api/agent/conversations/${conversationId}/messages`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ text, ...reply })
  }

  async function listEvents(token: string, conversationId: string, afterSequence = 0) {
    const response = await authRequest(app, token)
      .get(`/api/agent/conversations/${conversationId}/events?afterSequence=${afterSequence}`)
      .expect(200)
    return response.body.data as {
      conversationId: string
      events: Array<{
        id: string
        sequence: number
        kind: string
        payload: Record<string, unknown>
      }>
      lastSequence: number
      activeBatch: { id: string; status: string } | null
      pendingInteraction: {
        id: string
        eventId: string
        type: string
        prompt: string
        status: string
        version: number
      } | null
      queuedBatches: Array<{ id: string; status: string; queued?: boolean }>
    }
  }

  it('does not persist a blank session and only writes after the first successful send', async () => {
    await authRequest(app, coordinatorToken)
      .get('/api/agent/conversations/does-not-exist')
      .expect(404)

    const before = await prisma.aiConversation.count({
      where: { organizationId, creatorUserId: ownerUserId, taskLinks: { none: {} } },
    })
    const text = `${testPrefix} 首次发送才落库`
    const sent = await sendFirst(coordinatorToken, text, `${testPrefix}-first`).expect(201)
    const conversationId = track(sent.body.data.conversationId as string)
    expect(conversationId).toMatch(/\S/)
    expect(sent.body.data.events.map((event: { kind: string }) => event.kind)).toEqual([
      'user_message',
      'batch_status',
    ])

    const after = await prisma.aiConversation.count({
      where: { organizationId, creatorUserId: ownerUserId, taskLinks: { none: {} } },
    })
    expect(after).toBe(before + 1)

    const opened = await authRequest(app, coordinatorToken)
      .get(`/api/agent/conversations/${conversationId}`)
      .expect(200)
    expect(opened.body.data).toMatchObject({
      id: conversationId,
      status: 'open',
      title: text.slice(0, 40),
      titleSource: 'first_message',
    })
    expect(opened.body.data.taskId).toBeUndefined()
  })

  it('saves a taskless draft by conversation and rejects a stale epoch after send', async () => {
    const sent = await sendFirst(
      coordinatorToken,
      `${testPrefix} 草稿会话`,
      `${testPrefix}-draft-first`,
    ).expect(201)
    const conversationId = track(sent.body.data.conversationId as string)

    const saved = await authRequest(app, coordinatorToken)
      .put(`/api/agent/conversations/${conversationId}/draft`)
      .send({ text: '未发送的说明', draftEpoch: 1 })
      .expect(200)
    expect(saved.body.data).toMatchObject({
      conversationId,
      text: '未发送的说明',
      draftEpoch: 1,
      revision: 2,
    })

    await sendFollowUp(
      coordinatorToken,
      conversationId,
      '未发送的说明',
      `${testPrefix}-draft-send`,
    ).expect(201)

    await authRequest(app, coordinatorToken)
      .put(`/api/agent/conversations/${conversationId}/draft`)
      .send({ text: '旧 epoch 延迟到达', draftEpoch: 1 })
      .expect(409)

    await authRequest(app, peerToken)
      .put(`/api/agent/conversations/${conversationId}/draft`)
      .send({ text: '不应写入', draftEpoch: 2 })
      .expect(403)
  })

  it('replays the same first send with the same idempotency key', async () => {
    const key = `${testPrefix}-idempotent`
    const text = `${testPrefix} 重复提交`
    const first = await sendFirst(coordinatorToken, text, key).expect(201)
    track(first.body.data.conversationId as string)
    const replay = await sendFirst(coordinatorToken, text, key).expect(201)
    expect(replay.body.data.conversationId).toBe(first.body.data.conversationId)
    expect(replay.body.data.batch.id).toBe(first.body.data.batch.id)
    expect(replay.body.data.lastSequence).toBe(first.body.data.lastSequence)
  })

  it('completes a taskless plaintext turn through worker and headless agent', async () => {
    const sent = await sendFirst(
      coordinatorToken,
      `${testPrefix} 普通查询不需要建团任务`,
      `${testPrefix}-complete`,
    ).expect(201)
    const conversationId = track(sent.body.data.conversationId as string)
    const beforeWorker = agent.callCount()
    await processor.processDueJobs(5)
    expect(agent.callCount()).toBe(beforeWorker + 1)
    expect(agent.lastTaskContext()).toBeNull()

    const events = await listEvents(coordinatorToken, conversationId)
    expect(events.events.some((event) => event.kind === 'agent_message')).toBe(true)
    expect(
      events.events.find((event) => event.kind === 'agent_message')?.payload,
    ).toMatchObject({ text: COMPLETED_MESSAGE })
    expect(events.activeBatch).toBeNull()

    const attempt = await prisma.aiAgentAttempt.findFirst({
      where: { conversationId },
      include: { contextManifest: true },
    })
    expect(attempt).toMatchObject({
      status: 'completed',
      taskId: null,
      activityRunId: null,
      agentDefinitionKey: CONVERSATION_GENERAL_AGENT_DEFINITION_REF.key,
      agentDefinitionVersion: CONVERSATION_GENERAL_AGENT_DEFINITION_REF.version,
      usageSource: 'missing',
      usage: null,
      mastraTraceId: null,
      toolSteps: [],
      contextManifest: {
        systemPromptVersion: 'conversation-general/v1',
        toolSchemaVersion: 'conversation-general-no-tools/v1',
      },
    })
    expect(attempt?.contextManifest?.systemPromptVersion).not.toBe(PLAINTEXT_SYSTEM_PROMPT_VERSION)
    expect(attempt?.contextManifest?.toolSchemaVersion).not.toBe(PLAINTEXT_TOOL_SCHEMA_VERSION)
  })

  it('queues later turns on the same conversation and runs them in server sequence', async () => {
    const opened = await sendFirst(
      coordinatorToken,
      `${testPrefix} 同会话第一句`,
      `${testPrefix}-seq-open`,
    ).expect(201)
    const conversationId = track(opened.body.data.conversationId as string)
    await sendFollowUp(
      coordinatorToken,
      conversationId,
      `${testPrefix} 同会话第二句`,
      `${testPrefix}-seq-second`,
    ).expect(201)

    agent.holdNextCall()
    const firstWave = processor.processDueJobs(5)
    await waitFor(async () => {
      const running = await prisma.aiInputBatch.count({
        where: { conversationId, status: AiInputBatchStatus.agent_running },
      })
      expect(running).toBe(1)
    })
    await processor.processDueJobs(5)
    expect(
      await prisma.aiInputBatch.count({
        where: { conversationId, status: AiInputBatchStatus.agent_running },
      }),
    ).toBe(1)

    agent.release()
    await firstWave
    await processor.processDueJobs(5)
    await waitFor(async () => {
      const batches = await prisma.aiInputBatch.findMany({
        where: { conversationId },
        orderBy: { conversationVersion: 'asc' },
      })
      expect(batches.map((batch) => batch.status)).toEqual([
        AiInputBatchStatus.completed,
        AiInputBatchStatus.completed,
      ])
    })
  })

  it('runs independent conversations in parallel', async () => {
    const first = await sendFirst(
      coordinatorToken,
      `${testPrefix} 并行会话甲`,
      `${testPrefix}-par-a`,
    ).expect(201)
    const second = await sendFirst(
      coordinatorToken,
      `${testPrefix} 并行会话乙`,
      `${testPrefix}-par-b`,
    ).expect(201)
    const ids = [
      track(first.body.data.conversationId as string),
      track(second.body.data.conversationId as string),
    ]

    agent.holdNextCall()
    const beforeWorker = agent.callCount()
    const wave = processor.processDueJobs(5)
    await waitFor(async () => {
      expect(agent.callCount()).toBe(beforeWorker + 2)
      const running = await prisma.aiInputBatch.count({
        where: { conversationId: { in: ids }, status: AiInputBatchStatus.agent_running },
      })
      expect(running).toBe(2)
    })
    agent.release()
    await wave
    await waitFor(async () => {
      const remaining = await prisma.aiInputBatch.count({
        where: { conversationId: { in: ids }, status: AiInputBatchStatus.agent_running },
      })
      expect(remaining).toBe(0)
    })
  })

  it('ends the attempt and keeps the pending interaction when waiting for user input', async () => {
    agent.setOutcome({
      kind: 'awaiting_user_input',
      interaction: { type: 'free_text', prompt: '还需要补充哪一段？' },
    })
    const sent = await sendFirst(
      coordinatorToken,
      `${testPrefix} 进入等待用户`,
      `${testPrefix}-hitl`,
    ).expect(201)
    const conversationId = track(sent.body.data.conversationId as string)
    await processor.processDueJobs(5)

    const waiting = await prisma.aiInputBatch.findFirstOrThrow({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
    })
    expect(waiting.status).toBe(AiInputBatchStatus.awaiting_user_input)
    expect(
      await prisma.aiAgentAttempt.count({
        where: { conversationId, status: AiAgentAttemptStatus.running },
      }),
    ).toBe(0)

    const asked = await listEvents(coordinatorToken, conversationId)
    expect(asked.activeBatch?.status).toBe('awaiting_user_input')
    expect(asked.pendingInteraction).toMatchObject({
      type: 'free_text',
      prompt: '还需要补充哪一段？',
      status: 'pending',
      version: 1,
    })

    agent.setOutcome({ kind: 'completed', message: COMPLETED_MESSAGE })
    await sendFollowUp(
      coordinatorToken,
      conversationId,
      `${testPrefix} 不能冒充答案`,
      `${testPrefix}-hitl-next`,
    ).expect(201)
    await processor.processDueJobs(5)

    const stillWaiting = await listEvents(coordinatorToken, conversationId)
    expect(stillWaiting.pendingInteraction?.id).toBe(asked.pendingInteraction?.id)
    expect(stillWaiting.pendingInteraction?.status).toBe('pending')
    expect(stillWaiting.activeBatch?.status).toBe('awaiting_user_input')
    expect(stillWaiting.queuedBatches).toHaveLength(1)

    const batches = await prisma.aiInputBatch.findMany({
      where: { conversationId },
      orderBy: { conversationVersion: 'asc' },
    })
    expect(batches.map((batch) => batch.status)).toEqual([
      AiInputBatchStatus.awaiting_user_input,
      AiInputBatchStatus.ready_for_agent,
    ])
  })

  it('answers a pending interaction and resumes the taskless run', async () => {
    agent.setOutcome({
      kind: 'awaiting_user_input',
      interaction: { type: 'free_text', prompt: '还需要补充哪一段？' },
    })
    const sent = await sendFirst(
      coordinatorToken,
      `${testPrefix} 回答追问`,
      `${testPrefix}-hitl-reply`,
    ).expect(201)
    const conversationId = track(sent.body.data.conversationId as string)
    await processor.processDueJobs(5)

    const asked = await listEvents(coordinatorToken, conversationId)
    expect(asked.pendingInteraction?.status).toBe('pending')

    await sendFollowUp(
      coordinatorToken,
      conversationId,
      '补充行程第二天',
      `${testPrefix}-hitl-incomplete`,
      { interactionId: asked.pendingInteraction?.id, interactionVersion: 1 },
    ).expect(400)

    agent.setOutcome({ kind: 'completed', message: COMPLETED_MESSAGE })
    const replied = await sendFollowUp(
      coordinatorToken,
      conversationId,
      '补充行程第二天',
      `${testPrefix}-hitl-answer`,
      {
        replyToEventId: asked.pendingInteraction?.eventId,
        interactionId: asked.pendingInteraction?.id,
        interactionVersion: 1,
      },
    ).expect(201)
    expect(replied.body.data.batch.replyToEventId).toBe(asked.pendingInteraction?.eventId)

    await processor.processDueJobs(5)
    const afterReply = await listEvents(coordinatorToken, conversationId)
    expect(afterReply.pendingInteraction).toBeNull()
    expect(afterReply.activeBatch).toBeNull()
    const replyEvent = afterReply.events.find(
      (event) =>
        event.kind === 'user_message' &&
        event.payload.replyToEventId === asked.pendingInteraction?.eventId,
    )
    expect(replyEvent?.payload).toMatchObject({
      text: '补充行程第二天',
      replyToEventId: asked.pendingInteraction?.eventId,
      interactionId: asked.pendingInteraction?.id,
    })
    expect(
      afterReply.events.some(
        (event) => event.kind === 'agent_message' && event.payload.text === COMPLETED_MESSAGE,
      ),
    ).toBe(true)

    const batches = await prisma.aiInputBatch.findMany({
      where: { conversationId },
      orderBy: { conversationVersion: 'asc' },
    })
    expect(batches.map((batch) => batch.status)).toEqual([
      AiInputBatchStatus.completed,
      AiInputBatchStatus.completed,
    ])
  })

  it('stops the current run without closing the conversation and drops a late outcome', async () => {
    const sent = await sendFirst(
      coordinatorToken,
      `${testPrefix} 将被停止`,
      `${testPrefix}-stop`,
    ).expect(201)
    const conversationId = track(sent.body.data.conversationId as string)

    agent.holdNextCall()
    const inFlight = processor.processDueJobs(5)
    await waitFor(async () => {
      const running = await prisma.aiInputBatch.count({
        where: { conversationId, status: AiInputBatchStatus.agent_running },
      })
      expect(running).toBe(1)
    })

    await authRequest(app, coordinatorToken)
      .post(`/api/agent/conversations/${conversationId}/stop`)
      .set('Idempotency-Key', `${testPrefix}-stop-run`)
      .expect(200)

    const opened = await authRequest(app, coordinatorToken)
      .get(`/api/agent/conversations/${conversationId}`)
      .expect(200)
    expect(opened.body.data.status).toBe('open')

    agent.release()
    await inFlight
    await processor.processDueJobs(5)

    const events = await listEvents(coordinatorToken, conversationId)
    expect(events.events.some((event) => event.payload.text === COMPLETED_MESSAGE)).toBe(false)
    expect(
      events.events.some(
        (event) => event.kind === 'batch_status' && event.payload.status === 'cancelled',
      ),
    ).toBe(true)
    expect(
      await prisma.aiAgentAttempt.count({
        where: { conversationId, status: AiAgentAttemptStatus.running },
      }),
    ).toBe(0)
  })

  it('recovers an expired worker lease and still completes from PostgreSQL state', async () => {
    const sent = await sendFirst(
      coordinatorToken,
      `${testPrefix} 中断恢复`,
      `${testPrefix}-recover`,
    ).expect(201)
    const conversationId = track(sent.body.data.conversationId as string)
    const job = await prisma.aiWorkflowJob.findFirstOrThrow({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    })
    await prisma.aiInputBatch.update({
      where: { id: job.inputBatchId },
      data: { status: AiInputBatchStatus.agent_running },
    })
    await prisma.aiWorkflowJob.update({
      where: { id: job.id },
      data: {
        status: AiWorkflowJobStatus.claimed,
        claimedAt: new Date(Date.now() - 130_000),
        claimedBy: 'dead-worker',
        leaseExpiresAt: new Date(Date.now() - 10_000),
        attemptCount: 1,
      },
    })

    const beforeWorker = agent.callCount()
    await processor.processDueJobs(5)
    expect(agent.callCount()).toBe(beforeWorker + 1)
    const restored = await prisma.aiInputBatch.findFirstOrThrow({
      where: { id: job.inputBatchId },
    })
    expect(restored.status).toBe(AiInputBatchStatus.completed)
  })

  it('rejects a second running attempt on the same conversation at the database', async () => {
    const sent = await sendFirst(
      coordinatorToken,
      `${testPrefix} 约束证明`,
      `${testPrefix}-constraint`,
    ).expect(201)
    const conversationId = track(sent.body.data.conversationId as string)

    agent.holdNextCall()
    const inFlight = processor.processDueJobs(5)
    await waitFor(async () => {
      expect(
        await prisma.aiAgentAttempt.count({
          where: { conversationId, status: AiAgentAttemptStatus.running },
        }),
      ).toBe(1)
    })

    const last = await prisma.aiConversationEvent.findFirstOrThrow({
      where: { conversationId },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    })
    const event = await prisma.aiConversationEvent.create({
      data: {
        organizationId,
        conversationId,
        sequence: last.sequence + 1,
        kind: AiConversationEventKind.user_message,
        payload: { text: `${testPrefix} 不应并存的第二轮` },
      },
    })
    const batch = await prisma.aiInputBatch.create({
      data: {
        organizationId,
        conversationId,
        creatorUserId: ownerUserId,
        userMessageEventId: event.id,
        conversationVersion: last.sequence + 1,
        status: AiInputBatchStatus.ready_for_agent,
      },
    })
    const job = await prisma.aiWorkflowJob.create({
      data: {
        organizationId,
        conversationId,
        inputBatchId: batch.id,
        type: AiWorkflowJobType.agent_batch,
        jobKey: `e2e-constraint:${randomUUID()}`,
        status: AiWorkflowJobStatus.pending,
      },
    })
    const manifest = await prisma.aiContextManifest.create({
      data: {
        organizationId,
        conversationId,
        inputBatchId: batch.id,
        conversationVersion: last.sequence + 1,
        eventSequences: [last.sequence + 1],
        businessSnapshotVersion: 0,
        builderVersion: PLAINTEXT_CONTEXT_BUILDER_VERSION,
        systemPromptVersion: PLAINTEXT_SYSTEM_PROMPT_VERSION,
        toolSchemaVersion: PLAINTEXT_TOOL_SCHEMA_VERSION,
        modelId: 'e2e',
        inputHash: `e2e-${batch.id}`,
        truncationReasons: [],
      },
    })

    await expect(
      prisma.aiAgentAttempt.create({
        data: {
          organizationId,
          conversationId,
          inputBatchId: batch.id,
          jobId: job.id,
          contextManifestId: manifest.id,
          agentDefinitionKey: CONVERSATION_GENERAL_AGENT_DEFINITION_REF.key,
          agentDefinitionVersion: CONVERSATION_GENERAL_AGENT_DEFINITION_REF.version,
          grantedCapabilities: [],
          status: AiAgentAttemptStatus.running,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' })

    agent.release()
    await inFlight
  })

  it('lets any org member start a taskless conversation and isolates other users', async () => {
    const financeSent = await sendFirst(
      financeToken,
      `${testPrefix} 财务也可以发`,
      `${testPrefix}-finance`,
    ).expect(201)
    const financeConversationId = track(financeSent.body.data.conversationId as string)
    await processor.processDueJobs(5)
    const financeEvents = await listEvents(financeToken, financeConversationId)
    expect(financeEvents.events.some((event) => event.payload.text === COMPLETED_MESSAGE)).toBe(
      true,
    )

    const ownerSent = await sendFirst(
      coordinatorToken,
      `${testPrefix} 所有者会话`,
      `${testPrefix}-owner-iso`,
    ).expect(201)
    const ownerConversationId = track(ownerSent.body.data.conversationId as string)

    await authRequest(app, peerToken)
      .get(`/api/agent/conversations/${ownerConversationId}`)
      .expect(403)
    await authRequest(app, peerToken)
      .post(`/api/agent/conversations/${ownerConversationId}/messages`)
      .set('Idempotency-Key', `${testPrefix}-peer`)
      .send({ text: '不应发送' })
      .expect(403)
    await request(app.getHttpServer())
      .post('/api/agent/conversations/messages')
      .set('Origin', TEST_ORIGIN)
      .set('Idempotency-Key', `${testPrefix}-anon`)
      .send({ text: `${testPrefix} 未登录` })
      .expect(401)
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

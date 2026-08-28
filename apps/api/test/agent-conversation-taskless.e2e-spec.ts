import http from 'node:http'
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { INestApplication } from '@nestjs/common'
import {
  AiAgentAttemptStatus,
  AiConversationEventKind,
  AiInputBatchStatus,
  AiWorkflowJobStatus,
  AiWorkflowJobType,
  InputBatchTaskRole,
  PrismaClient,
} from '@prisma/client'
import {
  AI_CREATE_AGENT_DEFINITION_REF,
  CONVERSATION_GENERAL_AGENT_DEFINITION_REF,
  DEPARTURE_CREATION_GOAL_INTENT_KEY,
} from '@xiaotuanbao/ai-contracts'
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
  const createdTaskIds: string[] = []

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
    if (createdTaskIds.length > 0) {
      await prisma.agentTask.deleteMany({ where: { id: { in: createdTaskIds } } })
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

  it('accepts and preserves a 100,000-character message for oversized-input indexing', async () => {
    const text = `${testPrefix} 超长单条消息`.padEnd(100_000, '甲')
    const sent = await sendFirst(
      coordinatorToken,
      text,
      `${testPrefix}-oversized-message`,
    ).expect(201)
    const conversationId = track(sent.body.data.conversationId as string)

    let events = await listEvents(coordinatorToken, conversationId)
    const userMessage = events.events.find((event) => event.kind === 'user_message')
    expect(userMessage?.payload.text).toBe(text)

    await processor.processDueJobs(5)
    events = await listEvents(coordinatorToken, conversationId)
    expect(events.events.some((event) => event.kind === 'agent_message')).toBe(true)
    expect(events.activeBatch).toBeNull()
  })

  it('saves and returns a 100,000-character conversation draft', async () => {
    const sent = await sendFirst(
      coordinatorToken,
      `${testPrefix} 超长草稿会话`,
      `${testPrefix}-oversized-draft-first`,
    ).expect(201)
    const conversationId = track(sent.body.data.conversationId as string)
    const text = `${testPrefix} 超长草稿`.padEnd(100_000, '乙')

    const saved = await authRequest(app, coordinatorToken)
      .put(`/api/agent/conversations/${conversationId}/draft`)
      .send({ text, draftEpoch: 1 })
      .expect(200)

    expect(saved.body.data.text).toBe(text)
  })

  it('returns 413 when a JSON request exceeds the configured body limit', async () => {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/agent/conversations/messages')
      .send({ text: '甲'.repeat(200_000) })
      .expect(413)

    expect(response.body).toMatchObject({
      code: 413,
      message: '请求内容过大',
      data: null,
    })
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
    const runningStatus = events.events.find(
      (event) => event.kind === 'batch_status' && event.payload.status === 'agent_running',
    )
    expect(runningStatus?.payload).toMatchObject({
      attemptId: attempt?.id,
      generation: attempt?.generation,
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
        systemPromptVersion: 'conversation-general/v3',
        toolSchemaVersion: 'conversation-general-routing-recall/v2',
      },
    })
    expect(attempt?.contextManifest?.systemPromptVersion).not.toBe(PLAINTEXT_SYSTEM_PROMPT_VERSION)
    expect(attempt?.contextManifest?.toolSchemaVersion).not.toBe(PLAINTEXT_TOOL_SCHEMA_VERSION)
    expect(
      await prisma.inputBatchTaskLink.count({ where: { inputBatch: { conversationId } } }),
    ).toBe(0)
  })

  it('creates a departure task from a registered intent and continues on the same batch', async () => {
    agent.setOutcomes([
      {
        kind: 'registered_intent',
        intent: {
          key: DEPARTURE_CREATION_GOAL_INTENT_KEY,
          confidence: 'high',
          goal: '创建七月喀纳斯发团',
        },
        message: '正在准备建团任务。',
      },
      { kind: 'completed', message: '已进入建团专长。' },
    ])
    const beforeWorker = agent.callCount()
    const sent = await sendFirst(
      coordinatorToken,
      `${testPrefix} 帮我创建七月喀纳斯发团`,
      `${testPrefix}-task-proposal`,
    ).expect(201)
    const conversationId = track(sent.body.data.conversationId as string)
    const inputBatchId = sent.body.data.batch.id as string

    await processor.processDueJobs(5)
    await processor.processDueJobs(5)

    const batch = await prisma.aiInputBatch.findUniqueOrThrow({
      where: { id: inputBatchId },
      include: {
        taskLinks: true,
        agentAttempts: {
          orderBy: { startedAt: 'asc' },
          include: { contextManifest: true },
        },
      },
    })
    expect(batch.status).toBe(AiInputBatchStatus.completed)
    expect(agent.callCount()).toBe(beforeWorker + 2)
    expect(batch.taskLinks).toHaveLength(1)
    expect(batch.taskLinks[0].role).toBe(InputBatchTaskRole.created)
    const taskId = batch.taskLinks[0].taskId
    createdTaskIds.push(taskId)
    expect(batch.agentAttempts).toHaveLength(2)
    expect(batch.agentAttempts[0]).toMatchObject({
      taskId: null,
      agentDefinitionKey: CONVERSATION_GENERAL_AGENT_DEFINITION_REF.key,
      resultJson: { kind: 'registered_intent' },
    })
    expect(batch.agentAttempts[0].contextManifest.taskRefs).toEqual([])
    expect(batch.agentAttempts[1]).toMatchObject({
      taskId,
      agentDefinitionKey: AI_CREATE_AGENT_DEFINITION_REF.key,
    })
    expect(batch.agentAttempts[1].contextManifest.taskRefs).toEqual([
      expect.objectContaining({ taskId, role: 'primary' }),
    ])
    expect(batch.agentAttempts[0].contextManifestId).not.toBe(
      batch.agentAttempts[1].contextManifestId,
    )
    expect(batch.agentAttempts[0].contextManifest.inputHash).not.toBe(
      batch.agentAttempts[1].contextManifest.inputHash,
    )
    expect(
      await prisma.aiContextManifest.count({ where: { inputBatchId } }),
    ).toBe(2)
    expect(
      await prisma.aiInputBatch.count({ where: { conversationId } }),
    ).toBe(1)
    expect(
      await prisma.aiConversationEvent.count({
        where: { conversationId, kind: AiConversationEventKind.user_message },
      }),
    ).toBe(1)
    await expect(prisma.agentTask.findUniqueOrThrow({ where: { id: taskId } })).resolves.toMatchObject({
      goal: '创建七月喀纳斯发团',
      ownerUserId,
      status: 'active',
    })
    const events = await prisma.aiConversationEvent.findMany({
      where: { conversationId },
      orderBy: { sequence: 'asc' },
    })
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: AiConversationEventKind.batch_status,
          payload: expect.objectContaining({
            createdTaskId: taskId,
            createdTaskGoal: '创建七月喀纳斯发团',
            continuation: true,
          }),
        }),
        expect.objectContaining({
          kind: AiConversationEventKind.agent_message,
          payload: expect.objectContaining({ taskId }),
        }),
      ]),
    )
  })

  it('ignores an unregistered intent and completes as a general reply', async () => {
    agent.setOutcome({
      kind: 'registered_intent',
      intent: { key: 'partner.ledger.query', confidence: 'high', goal: '查询伙伴账款' },
      message: '当前尚未登记这个能力。',
    })
    const sent = await sendFirst(
      coordinatorToken,
      `${testPrefix} 未登记意图`,
      `${testPrefix}-unknown-intent`,
    ).expect(201)
    const conversationId = track(sent.body.data.conversationId as string)

    await processor.processDueJobs(5)

    expect(
      await prisma.inputBatchTaskLink.count({ where: { inputBatch: { conversationId } } }),
    ).toBe(0)
    const events = await listEvents(coordinatorToken, conversationId)
    expect(events.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'agent_message',
          payload: expect.objectContaining({ text: '当前尚未登记这个能力。' }),
        }),
      ]),
    )
  })

  it('stops a same-batch continuation before its second attempt starts', async () => {
    agent.setOutcomes([
      {
        kind: 'registered_intent',
        intent: {
          key: DEPARTURE_CREATION_GOAL_INTENT_KEY,
          confidence: 'high',
          goal: `${testPrefix} 将停止的建团`,
        },
        message: '正在准备建团任务。',
      },
      { kind: 'completed', message: '不应执行的续跑。' },
    ])
    const beforeWorker = agent.callCount()
    const sent = await sendFirst(
      coordinatorToken,
      `${testPrefix} 创建后停止`,
      `${testPrefix}-proposal-stop`,
    ).expect(201)
    const conversationId = track(sent.body.data.conversationId as string)

    await processor.processDueJobs(1)
    const ready = await prisma.aiInputBatch.findFirstOrThrow({
      where: { conversationId },
      include: { taskLinks: true },
    })
    expect(ready.status).toBe(AiInputBatchStatus.ready_for_agent)
    expect(ready.taskLinks).toHaveLength(1)
    createdTaskIds.push(ready.taskLinks[0].taskId)

    await authRequest(app, coordinatorToken)
      .post(`/api/agent/conversations/${conversationId}/stop`)
      .set('Idempotency-Key', `${testPrefix}-proposal-stop-command`)
      .expect(200)
    await processor.processDueJobs(5)

    expect(agent.callCount()).toBe(beforeWorker + 1)
    expect(
      await prisma.aiAgentAttempt.count({ where: { conversationId } }),
    ).toBe(1)
    expect(
      await prisma.aiInputBatch.findFirstOrThrow({ where: { conversationId } }),
    ).toMatchObject({ status: AiInputBatchStatus.cancelled })
  })

  it('rejects a departure task proposal without departure:write', async () => {
    agent.setOutcome({
      kind: 'registered_intent',
      intent: {
        key: DEPARTURE_CREATION_GOAL_INTENT_KEY,
        confidence: 'high',
        goal: `${testPrefix} 创建无权限发团`,
      },
      message: '正在准备建团任务。',
    })
    const sent = await sendFirst(
      financeToken,
      `${testPrefix} 财务尝试建团`,
      `${testPrefix}-proposal-denied`,
    ).expect(201)
    const conversationId = track(sent.body.data.conversationId as string)

    await processor.processDueJobs(5)

    const batch = await prisma.aiInputBatch.findFirstOrThrow({ where: { conversationId } })
    expect(batch.status).toBe(AiInputBatchStatus.failed)
    expect(await prisma.inputBatchTaskLink.count({ where: { inputBatchId: batch.id } })).toBe(0)
    expect(
      await prisma.agentTask.count({
        where: { organizationId, goal: `${testPrefix} 创建无权限发团` },
      }),
    ).toBe(0)
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

  it('等待回答会释放执行权，普通输入继续执行且不会处置待回答交互', async () => {
    agent.setOutcome({
      kind: 'awaiting_user_input',
      interaction: { type: 'free_text', prompt: '你希望新建发团，还是查询已有发团？' },
    })
    const sent = await sendFirst(
      coordinatorToken,
      `${testPrefix} 帮我处理一下发团`,
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
      prompt: '你希望新建发团，还是查询已有发团？',
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
    expect(stillWaiting.queuedBatches).toHaveLength(0)

    const batches = await prisma.aiInputBatch.findMany({
      where: { conversationId },
      orderBy: { conversationVersion: 'asc' },
    })
    expect(batches.map((batch) => batch.status)).toEqual([
      AiInputBatchStatus.awaiting_user_input,
      AiInputBatchStatus.completed,
    ])
  })

  it('同一会话允许多条未处置追问并存', async () => {
    agent.setOutcome({
      kind: 'awaiting_user_input',
      interaction: { type: 'free_text', prompt: '请补充出发城市' },
    })
    const sent = await sendFirst(
      coordinatorToken,
      `${testPrefix} 第一条追问`,
      `${testPrefix}-multi-interaction-first`,
    ).expect(201)
    const conversationId = track(sent.body.data.conversationId as string)
    await processor.processDueJobs(1)

    agent.setOutcome({
      kind: 'awaiting_user_input',
      interaction: { type: 'free_text', prompt: '请补充预算' },
    })
    await sendFollowUp(
      coordinatorToken,
      conversationId,
      `${testPrefix} 独立处理另一件事`,
      `${testPrefix}-multi-interaction-second`,
    ).expect(201)
    await processor.processDueJobs(1)

    expect(
      await prisma.aiConversationInteraction.count({
        where: { conversationId, status: 'pending' },
      }),
    ).toBe(2)
    const events = await listEvents(coordinatorToken, conversationId)
    expect(
      events.events.filter(
        (event) =>
          event.kind === 'agent_message' &&
          event.payload.interaction &&
          typeof event.payload.interaction === 'object',
      ),
    ).toHaveLength(2)
  })

  it('撤回排队消息并编辑重发后，新批次在前一回答结束时继续执行', async () => {
    agent.setOutcomes([
      {
        kind: 'awaiting_user_input',
        interaction: { type: 'free_text', prompt: '请补充信息' },
      },
      { kind: 'completed', message: COMPLETED_MESSAGE },
    ])
    const first = await sendFirst(
      coordinatorToken,
      `${testPrefix} 撤回排队消息`,
      `${testPrefix}-retract-first`,
    ).expect(201)
    const conversationId = track(first.body.data.conversationId as string)
    agent.holdNextCall()
    const firstWave = processor.processDueJobs(5)
    await waitFor(async () => {
      const running = await prisma.aiInputBatch.findUniqueOrThrow({
        where: { id: first.body.data.batch.id },
      })
      expect(running.status).toBe(AiInputBatchStatus.agent_running)
    })

    const queuedText = `${testPrefix} 先排队再编辑`
    const queued = await sendFollowUp(
      coordinatorToken,
      conversationId,
      queuedText,
      `${testPrefix}-retract-queued`,
    ).expect(201)
    expect(queued.body.data.events.at(-1)?.payload.queued).toBe(true)

    const retracted = await authRequest(app, coordinatorToken)
      .post(
        `/api/agent/conversations/${conversationId}/batches/${queued.body.data.batch.id}/retract`,
      )
      .set('Idempotency-Key', `${testPrefix}-retract-command`)
      .expect(200)

    expect(retracted.body.data.batch.status).toBe(AiInputBatchStatus.cancelled)
    expect(retracted.body.data.draft.text).toBe(queuedText)
    expect(retracted.body.data.events.at(-1)?.payload).toMatchObject({
      status: AiInputBatchStatus.cancelled,
      reason: 'queue_retracted',
    })
    expect(
      await prisma.aiWorkflowJob.count({
        where: {
          inputBatchId: queued.body.data.batch.id,
          status: { in: [AiWorkflowJobStatus.pending, AiWorkflowJobStatus.claimed] },
        },
      }),
    ).toBe(0)

    const resent = await sendFollowUp(
      coordinatorToken,
      conversationId,
      `${queuedText}（已编辑）`,
      `${testPrefix}-retract-resent`,
    ).expect(201)

    expect(resent.body.data.batch.id).not.toBe(queued.body.data.batch.id)
    expect(resent.body.data.events.at(-1)?.payload.queued).toBe(true)
    agent.release()
    await firstWave
    await processor.processDueJobs(5)

    const batches = await prisma.aiInputBatch.findMany({
      where: { conversationId },
      orderBy: { conversationVersion: 'asc' },
      select: { id: true, status: true },
    })
    expect(batches).toEqual([
      { id: first.body.data.batch.id, status: AiInputBatchStatus.awaiting_user_input },
      { id: queued.body.data.batch.id, status: AiInputBatchStatus.cancelled },
      { id: resent.body.data.batch.id, status: AiInputBatchStatus.completed },
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

  it('追问回复按服务端事件顺序执行，不越过更早的普通输入', async () => {
    agent.setOutcome({
      kind: 'awaiting_user_input',
      interaction: { type: 'free_text', prompt: '请补充城市' },
    })
    const sent = await sendFirst(
      coordinatorToken,
      `${testPrefix} 顺序追问`,
      `${testPrefix}-reply-order-first`,
    ).expect(201)
    const conversationId = track(sent.body.data.conversationId as string)
    await processor.processDueJobs(5)
    const asked = await listEvents(coordinatorToken, conversationId)

    const ordinary = await sendFollowUp(
      coordinatorToken,
      conversationId,
      `${testPrefix} 更早的普通输入`,
      `${testPrefix}-reply-order-ordinary`,
    ).expect(201)
    const reply = await sendFollowUp(
      coordinatorToken,
      conversationId,
      '上海',
      `${testPrefix}-reply-order-answer`,
      {
        replyToEventId: asked.pendingInteraction?.eventId,
        interactionId: asked.pendingInteraction?.id,
        interactionVersion: asked.pendingInteraction?.version,
      },
    ).expect(201)

    agent.setOutcome({ kind: 'completed', message: COMPLETED_MESSAGE })
    await processor.processDueJobs(1)
    expect(
      await prisma.aiInputBatch.findUniqueOrThrow({ where: { id: ordinary.body.data.batch.id } }),
    ).toMatchObject({ status: AiInputBatchStatus.completed })
    expect(
      await prisma.aiInputBatch.findUniqueOrThrow({ where: { id: reply.body.data.batch.id } }),
    ).toMatchObject({ status: AiInputBatchStatus.ready_for_agent })

    await processor.processDueJobs(1)
    expect(
      await prisma.aiInputBatch.findUniqueOrThrow({ where: { id: reply.body.data.batch.id } }),
    ).toMatchObject({ status: AiInputBatchStatus.completed })
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

  it('recovers an expired lease while the batch is still preparing_context', async () => {
    const sent = await sendFirst(
      coordinatorToken,
      `${testPrefix} 整理中断恢复`,
      `${testPrefix}-prepare-recover`,
    ).expect(201)
    const conversationId = track(sent.body.data.conversationId as string)
    const job = await prisma.aiWorkflowJob.findFirstOrThrow({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    })
    await prisma.aiInputBatch.update({
      where: { id: job.inputBatchId },
      data: { status: AiInputBatchStatus.preparing_context },
    })
    await prisma.aiWorkflowJob.update({
      where: { id: job.id },
      data: {
        status: AiWorkflowJobStatus.claimed,
        claimedAt: new Date(Date.now() - 130_000),
        claimedBy: 'dead-prepare-worker',
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

  it('keeps the Worker running after SSE disconnect and restores the current snapshot on reconnect #419', async () => {
    const sent = await sendFirst(
      coordinatorToken,
      `${testPrefix} 断线重连恢复即时输出`,
      `${testPrefix}-sse-reconnect`,
    ).expect(201)
    const conversationId = track(sent.body.data.conversationId as string)
    const lastSequence = sent.body.data.lastSequence as number
    agent.holdNextCall()
    const running = processor.processDueJobs(5)
    await waitFor(async () => {
      const attempt = await prisma.aiAgentAttempt.findFirst({
        where: { conversationId, status: AiAgentAttemptStatus.running },
      })
      expect(attempt).toBeTruthy()
    })
    const attempt = await prisma.aiAgentAttempt.findFirstOrThrow({
      where: { conversationId, status: AiAgentAttemptStatus.running },
    })
    const job = await prisma.aiWorkflowJob.findFirstOrThrow({
      where: { conversationId, type: AiWorkflowJobType.agent_batch },
    })
    await prisma.aiAgentLiveOutput.create({
      data: {
        attemptId: attempt.id,
        organizationId,
        conversationId,
        inputBatchId: job.inputBatchId,
        generation: attempt.generation,
        revision: 4,
        reasoningText: '先核对出团日期',
        text: '已整理当前资料。',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    })

    const first = await readSseFramesUntil(
      app,
      coordinatorToken,
      `/api/agent/conversations/${conversationId}/stream?afterSequence=${lastSequence}`,
      (frames) => frames.some((frame) => frame.data.type === 'assistant.snapshot'),
    )
    expect(first.headers['x-accel-buffering']).toBe('no')
    expect(String(first.headers['cache-control'] ?? '')).toContain('no-transform')
    expect(first.frames[0]).not.toHaveProperty('id')
    expect(first.frames[0]?.data).toMatchObject({
      type: 'assistant.snapshot',
      attemptId: attempt.id,
      reasoningText: '先核对出团日期',
      text: '已整理当前资料。',
    })

    const afterDisconnect = await prisma.aiWorkflowJob.findFirstOrThrow({ where: { id: job.id } })
    expect(afterDisconnect.status).toBe(AiWorkflowJobStatus.claimed)
    expect(afterDisconnect.claimedBy).toBeTruthy()
    expect(
      await prisma.aiAgentAttempt.count({
        where: { conversationId, status: AiAgentAttemptStatus.running },
      }),
    ).toBe(1)
    expect(
      await prisma.aiConversationEvent.count({
        where: { conversationId, kind: AiConversationEventKind.agent_message },
      }),
    ).toBe(0)

    const reconnected = await readSseFramesUntil(
      app,
      coordinatorToken,
      `/api/agent/conversations/${conversationId}/stream`,
      (frames) => frames.some((frame) => frame.data.type === 'assistant.snapshot'),
      { lastEventId: String(lastSequence) },
    )
    const snapshotIndex = reconnected.frames.findIndex(
      (frame) => frame.data.type === 'assistant.snapshot',
    )
    const eventIndex = reconnected.frames.findIndex(
      (frame) => frame.data.type === 'conversation.event',
    )
    expect(snapshotIndex).toBe(0)
    expect(reconnected.frames[0]).not.toHaveProperty('id')
    expect(reconnected.frames[0]?.data).toMatchObject({
      type: 'assistant.snapshot',
      text: '已整理当前资料。',
      reasoningText: '先核对出团日期',
    })
    if (eventIndex >= 0) {
      expect(eventIndex).toBeGreaterThan(snapshotIndex)
      expect(reconnected.frames[eventIndex]?.id).toBeDefined()
    }

    agent.release()
    await running
    await waitFor(async () => {
      expect(
        await prisma.aiConversationEvent.count({
          where: { conversationId, kind: AiConversationEventKind.agent_message },
        }),
      ).toBe(1)
    })
    const completed = await prisma.aiAgentAttempt.findFirstOrThrow({
      where: { id: attempt.id },
    })
    expect(completed.status).toBe(AiAgentAttemptStatus.completed)
    expect(
      await prisma.aiConversationEvent.count({
        where: { conversationId, kind: AiConversationEventKind.agent_message },
      }),
    ).toBe(1)
  })

  it('does not persist a final agent_message when the Agent rate-limits the run #419', async () => {
    const sent = await sendFirst(
      coordinatorToken,
      `${testPrefix} 限流不回滚终态`,
      `${testPrefix}-rate-limit`,
    ).expect(201)
    const conversationId = track(sent.body.data.conversationId as string)
    agent.failNextHttp(429)
    await processor.processDueJobs(5)

    expect(
      await prisma.aiConversationEvent.count({
        where: { conversationId, kind: AiConversationEventKind.agent_message },
      }),
    ).toBe(0)
    const job = await prisma.aiWorkflowJob.findFirstOrThrow({
      where: { conversationId, type: AiWorkflowJobType.agent_batch },
    })
    expect(job.status).toBe(AiWorkflowJobStatus.pending)
    expect(job.lastErrorCode).toBe('AGENT_UNAVAILABLE')
    const batch = await prisma.aiInputBatch.findFirstOrThrow({ where: { conversationId } })
    expect(batch.status).not.toBe(AiInputBatchStatus.completed)
    expect(batch.status).not.toBe(AiInputBatchStatus.failed)
    expect(batch.status).not.toBe(AiInputBatchStatus.cancelled)
  })

  it('does not persist a final agent_message when Agent NDJSON is illegal #419', async () => {
    const sent = await sendFirst(
      coordinatorToken,
      `${testPrefix} 非法 NDJSON 不落终态`,
      `${testPrefix}-illegal-ndjson`,
    ).expect(201)
    const conversationId = track(sent.body.data.conversationId as string)
    agent.failNextNdjson('illegal')
    await processor.processDueJobs(5)

    expect(
      await prisma.aiConversationEvent.count({
        where: { conversationId, kind: AiConversationEventKind.agent_message },
      }),
    ).toBe(0)
    const job = await prisma.aiWorkflowJob.findFirstOrThrow({
      where: { conversationId, type: AiWorkflowJobType.agent_batch },
    })
    expect(job.status).toBe(AiWorkflowJobStatus.failed)
    expect(job.lastErrorCode).toBe('INVALID_FORMAT')
    const attempt = await prisma.aiAgentAttempt.findFirstOrThrow({
      where: { conversationId },
      orderBy: { startedAt: 'desc' },
    })
    expect(attempt.status).toBe(AiAgentAttemptStatus.failed)
    expect(attempt.errorCode).toBe('INVALID_FORMAT')
  })
})

async function readSseFramesUntil(
  app: INestApplication,
  sessionCookie: string,
  path: string,
  predicate: (frames: Array<{ id?: string; data: Record<string, unknown> }>) => boolean,
  options: { lastEventId?: string } = {},
): Promise<{
  headers: http.IncomingHttpHeaders
  frames: Array<{ id?: string; data: Record<string, unknown> }>
}> {
  const address = app.getHttpServer().address() as AddressInfo
  const frames: Array<{ id?: string; data: Record<string, unknown> }> = []
  let headers: http.IncomingHttpHeaders = {}
  let buffer = ''

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.destroy()
      reject(new Error('SSE timed out'))
    }, 8_000)
    const client = http.request(
      {
        hostname: '127.0.0.1',
        port: address.port,
        path,
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          Cookie: sessionCookie,
          ...(options.lastEventId ? { 'Last-Event-ID': options.lastEventId } : {}),
        },
      },
      (response) => {
        headers = response.headers
        response.on('data', (chunk: Buffer) => {
          buffer += chunk.toString('utf8')
          buffer = parseSseFrames(buffer, frames)
          if (predicate(frames)) {
            clearTimeout(timeout)
            client.destroy()
            resolve()
          }
        })
      },
    )
    client.on('error', (error) => {
      if ((error as NodeJS.ErrnoException).code !== 'ECONNRESET') {
        clearTimeout(timeout)
        reject(error)
      }
    })
    client.end()
  })

  return { headers, frames }
}

function parseSseFrames(
  buffer: string,
  frames: Array<{ id?: string; data: Record<string, unknown> }>,
): string {
  let remaining = buffer
  while (true) {
    const boundary = remaining.indexOf('\n\n')
    if (boundary < 0) {
      return remaining
    }
    const block = remaining.slice(0, boundary)
    remaining = remaining.slice(boundary + 2)
    if (!block.trim()) {
      continue
    }
    let id: string | undefined
    let dataLine: string | undefined
    for (const line of block.split('\n')) {
      if (line.startsWith('id:')) {
        id = line.slice('id:'.length).trim()
      }
      if (line.startsWith('data:')) {
        dataLine = line
      }
    }
    if (!dataLine) {
      continue
    }
    try {
      const parsed = JSON.parse(dataLine.slice('data:'.length).trim()) as Record<string, unknown>
      frames.push(id ? { id, data: parsed } : { data: parsed })
    } catch {
      // ignore incomplete frames
    }
  }
}

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

import http from 'node:http'
import type { AddressInfo } from 'node:net'
import type { INestApplication } from '@nestjs/common'
import { DepartureType, PrismaClient } from '@prisma/client'
import {
  MAX_IN_FLIGHT_PROCESSING_BATCHES_PER_CONVERSATION,
  MAX_IN_FLIGHT_PROCESSING_BATCHES_PER_USER,
} from '../src/modules/ai-create-task/ai-conversation.constants'
import { AiWorkflowProcessor } from '../src/modules/ai-create-task/ai-workflow.processor'
import { authRequest, createTestApp, loginAs } from './helpers'
import { startDeterministicHeadlessAgent } from './support/deterministic-headless-agent'

const AGENT_SECRET = 'e2e-agent-service-secret'
const COMPLETED_MESSAGE = '已记下你的出团说明，可以继续在表单完善。'

describe('Durable plaintext AI create conversation (e2e) #315', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let processor: AiWorkflowProcessor
  let coordinatorToken: string
  let financeToken: string
  let peerToken: string
  let organizationId: string
  let ownerUserId: string
  let agent: Awaited<ReturnType<typeof startDeterministicHeadlessAgent>>
  const testPrefix = `e2e-ai-durable-${Date.now()}`

  beforeAll(async () => {
    let apiBaseUrl = ''
    process.env.AI_CREATE_ASSIST_ENABLED = 'true'
    process.env.AGENT_SERVICE_SECRET = AGENT_SECRET

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
    await app.close()
  })

  async function openSession(taskId?: string) {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/ai-create-tasks/assist-session')
      .send(
        taskId
          ? { taskId }
          : {
              draft: {
                mode: 'manual',
                routeName: `${testPrefix}-路线`,
                name: `${testPrefix}-团`,
                startDate: '2026-09-01',
                endDate: '2026-09-05',
                ownerUserId,
                departureType: DepartureType.combined,
              },
            },
      )
      .expect(201)
    return response.body.data as {
      task: { id: string; draft: { version: number } }
      conversation: {
        id: string
        status: string
        events: Array<{ sequence: number; kind: string; payload: Record<string, unknown> }>
        activeBatch: { id: string; status: string } | null
      }
      runId: string
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

  async function listEvents(taskId: string, conversationId: string, afterSequence = 0) {
    const response = await authRequest(app, coordinatorToken)
      .get(
        `/api/ai-create-tasks/${taskId}/conversations/${conversationId}/events?afterSequence=${afterSequence}`,
      )
      .expect(200)
    return response.body.data as {
      conversationId: string
      events: Array<{ sequence: number; kind: string; payload: Record<string, unknown> }>
      lastSequence: number
      activeBatch: { id: string; status: string } | null
    }
  }

  async function cancelOwnerInFlightProcessing() {
    await prisma.aiWorkflowJob.updateMany({
      where: {
        organizationId,
        task: { creatorUserId: ownerUserId },
        status: { in: ['pending', 'claimed'] },
      },
      data: { status: 'failed', lastErrorCode: 'e2e-cancelled-for-cap-test' },
    })
    await prisma.aiInputBatch.updateMany({
      where: {
        organizationId,
        creatorUserId: ownerUserId,
        status: { in: ['waiting_for_materials', 'ready_for_agent', 'agent_running'] },
      },
      data: { status: 'cancelled' },
    })
  }

  it('reuses the same unfinished conversation after close and re-entry', async () => {
    const first = await openSession()
    const second = await openSession(first.task.id)

    expect(second.conversation.id).toBe(first.conversation.id)
    expect(second.runId).toBe(first.runId)
    expect(second.conversation.status).toBe('open')
  })

  it('sends plaintext idempotently and completes via worker after the client disconnects', async () => {
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id
    const idempotencyKey = `e2e-send-${taskId}`
    const userText = '团名先用九月川西线，预计 12 人。'

    const sent = await sendText(taskId, conversationId, userText, idempotencyKey).expect(201)
    expect(sent.body.data).toMatchObject({
      conversationId,
      batch: { status: 'ready_for_agent' },
      lastSequence: expect.any(Number),
    })
    const events = sent.body.data.events as Array<{ kind: string; payload: Record<string, unknown> }>
    expect(events.map((event) => event.kind)).toEqual(['user_message', 'batch_status'])
    expect(events[0]?.payload).toMatchObject({ text: userText })
    expect(events[1]?.payload).toMatchObject({ status: 'ready_for_agent' })

    const replay = await sendText(taskId, conversationId, userText, idempotencyKey).expect(201)
    expect(replay.body.data.batch.id).toBe(sent.body.data.batch.id)
    expect(replay.body.data.lastSequence).toBe(sent.body.data.lastSequence)

    const beforeWorker = agent.callCount()
    await processor.processDueJobs(5)
    expect(agent.callCount()).toBe(beforeWorker + 1)

    const restored = await openSession(taskId)
    expect(restored.conversation.id).toBe(conversationId)
    const kinds = restored.conversation.events.map((event) => event.kind)
    expect(kinds).toEqual(
      expect.arrayContaining(['user_message', 'batch_status', 'agent_message']),
    )
    const agentMessage = restored.conversation.events.find((event) => event.kind === 'agent_message')
    expect(agentMessage?.payload).toMatchObject({ text: COMPLETED_MESSAGE })
    expect(restored.conversation.activeBatch).toBeNull()

    const catchUp = await listEvents(taskId, conversationId, sent.body.data.lastSequence as number)
    expect(catchUp.events.some((event) => event.kind === 'agent_message')).toBe(true)
    expect(catchUp.events.every((event) => event.sequence > (sent.body.data.lastSequence as number))).toBe(
      true,
    )

    const attempt = await prisma.aiAgentAttempt.findFirst({
      where: { taskId, conversationId },
      include: { contextManifest: true },
    })
    expect(attempt).toMatchObject({
      status: 'completed',
      contextManifest: {
        conversationVersion: expect.any(Number),
        builderVersion: 'ai-create-frozen-projection/v1',
        inputHash: expect.any(String),
        summaryVersion: null,
        excerptDigests: [],
      },
    })
    const sequences = attempt?.contextManifest.eventSequences
    expect(Array.isArray(sequences)).toBe(true)
    expect(agent.lastUserText()).toContain('【交流背景】')
    expect(agent.lastUserText()).toContain('【本轮指令】')
    const jobsBeforeList = await prisma.aiWorkflowJob.count({ where: { taskId } })
    const listedAgain = await listEvents(taskId, conversationId)
    expect(listedAgain.events.length).toBeGreaterThan(0)
    expect(listedAgain.events.length).toBeLessThanOrEqual(100)
    expect(await prisma.aiWorkflowJob.count({ where: { taskId } })).toBe(jobsBeforeList)
  })

  it('keeps only one Agent batch running for the same task', async () => {
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id

    await sendText(taskId, conversationId, '第一批说明', `e2e-one-running-a-${taskId}`).expect(201)
    await sendText(taskId, conversationId, '第二批说明', `e2e-one-running-b-${taskId}`).expect(201)

    agent.holdNextCall()
    const first = processor.processDueJobs(5)
    await waitFor(async () => {
      const running = await prisma.aiInputBatch.count({
        where: { taskId, status: 'agent_running' },
      })
      expect(running).toBe(1)
    })

    await processor.processDueJobs(5)
    const stillOne = await prisma.aiInputBatch.count({
      where: { taskId, status: 'agent_running' },
    })
    expect(stillOne).toBe(1)

    agent.release()
    await first
    await processor.processDueJobs(5)
    await waitFor(async () => {
      const done = await prisma.aiInputBatch.count({
        where: { taskId, status: 'agent_running' },
      })
      expect(done).toBe(0)
    })
  })

  it('reclaims an expired worker lease so a later batch on the same task can run', async () => {
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id

    await sendText(taskId, conversationId, '崩溃前的第一批', `e2e-lease-a-${taskId}`).expect(201)
    await sendText(taskId, conversationId, '崩溃后仍应执行的第二批', `e2e-lease-b-${taskId}`).expect(201)

    const firstJob = await prisma.aiWorkflowJob.findFirstOrThrow({
      where: { taskId },
      orderBy: { createdAt: 'asc' },
    })
    await prisma.aiInputBatch.update({
      where: { id: firstJob.inputBatchId },
      data: { status: 'agent_running' },
    })
    await prisma.aiWorkflowJob.update({
      where: { id: firstJob.id },
      data: {
        status: 'claimed',
        claimedAt: new Date(Date.now() - 130_000),
        claimedBy: 'dead-worker',
        leaseExpiresAt: new Date(Date.now() - 10_000),
        attemptCount: 1,
      },
    })

    const beforeWorker = agent.callCount()
    await processor.processDueJobs(5)
    expect(agent.callCount()).toBe(beforeWorker + 2)

    const batches = await prisma.aiInputBatch.findMany({
      where: { taskId },
      orderBy: { createdAt: 'asc' },
    })
    expect(batches.map((batch) => batch.status)).toEqual(['completed', 'completed'])
    const jobs = await prisma.aiWorkflowJob.findMany({
      where: { taskId },
      orderBy: { createdAt: 'asc' },
    })
    expect(jobs.map((job) => job.status)).toEqual(['succeeded', 'succeeded'])
  })

  it('persists Agent failure as a server-side batch fact and allows a new send', async () => {
    agent.setOutcome({
      kind: 'failed',
      error: {
        code: 'AGENT_UNAVAILABLE',
        message: 'AI 辅助暂时不可用，请稍后重试或继续使用表单',
        retryable: true,
      },
    })
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id

    await sendText(taskId, conversationId, '这次会失败', `e2e-fail-${taskId}`).expect(201)
    await processor.processDueJobs(5)

    const failed = await listEvents(taskId, conversationId)
    expect(failed.events.some((event) => event.kind === 'error')).toBe(true)
    expect(
      failed.events.some(
        (event) => event.kind === 'batch_status' && event.payload.status === 'failed',
      ),
    ).toBe(true)

    agent.setOutcome({ kind: 'completed', message: COMPLETED_MESSAGE })
    await sendText(taskId, conversationId, '重试后的说明', `e2e-fail-retry-${taskId}`).expect(201)
    await processor.processDueJobs(5)
    const recovered = await listEvents(taskId, conversationId)
    expect(recovered.events.some((event) => event.payload.text === COMPLETED_MESSAGE)).toBe(true)
  })

  it('rejects other organization members and keeps the form draft writable during execution', async () => {
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id

    await authRequest(app, peerToken)
      .get(`/api/ai-create-tasks/${taskId}/conversations/${conversationId}/events`)
      .expect(403)
    await authRequest(app, peerToken)
      .post(`/api/ai-create-tasks/${taskId}/conversations/${conversationId}/messages`)
      .set('Idempotency-Key', `e2e-peer-${taskId}`)
      .send({ text: '不应发送' })
      .expect(403)
    await authRequest(app, financeToken)
      .post(`/api/ai-create-tasks/${taskId}/conversations/${conversationId}/messages`)
      .set('Idempotency-Key', `e2e-finance-${taskId}`)
      .send({ text: '财务不应发送' })
      .expect(403)

    await sendText(taskId, conversationId, '执行中仍可改表单', `e2e-form-${taskId}`).expect(201)

    const saved = await authRequest(app, coordinatorToken)
      .post('/api/ai-create-tasks/draft')
      .send({
        taskId,
        expectedVersion: opened.task.draft.version,
        draft: {
          mode: 'manual',
          routeName: `${testPrefix}-手改路线`,
          name: `${testPrefix}-手改团名`,
        },
      })
      .expect(200)
    expect(saved.body.data.draft.snapshot).toMatchObject({
      routeName: `${testPrefix}-手改路线`,
      name: `${testPrefix}-手改团名`,
    })

    await processor.processDueJobs(5)
  })

  it('pushes completion over SSE by event sequence without replaying the Agent', async () => {
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id
    const sent = await sendText(
      taskId,
      conversationId,
      '请用 SSE 推送完成消息',
      `e2e-sse-${taskId}`,
    ).expect(201)
    const afterSequence = sent.body.data.lastSequence as number
    const callsBefore = agent.callCount()

    const seen = await readSseUntil(
      app,
      coordinatorToken,
      `/api/ai-create-tasks/${taskId}/conversations/${conversationId}/stream?afterSequence=${afterSequence}`,
      (events) => events.some((event) => event.kind === 'agent_message'),
      async () => {
        await processor.processDueJobs(5)
      },
    )

    expect(seen.some((event) => event.payload.text === COMPLETED_MESSAGE)).toBe(true)
    expect(agent.callCount()).toBe(callsBefore + 1)

    await readSseUntil(
      app,
      coordinatorToken,
      `/api/ai-create-tasks/${taskId}/conversations/${conversationId}/stream?afterSequence=${afterSequence}`,
      (events) => events.some((event) => event.kind === 'agent_message'),
      async () => undefined,
    )
    expect(agent.callCount()).toBe(callsBefore + 1)
  })

  it('rejects further sends when the conversation already has the max in-flight processing batches', async () => {
    await cancelOwnerInFlightProcessing()
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id

    try {
      let firstBatchId: string | undefined
      for (let index = 0; index < MAX_IN_FLIGHT_PROCESSING_BATCHES_PER_CONVERSATION; index += 1) {
        const sent = await sendText(
          taskId,
          conversationId,
          `会话在途批次 ${index + 1}`,
          `e2e-conv-cap-${taskId}-${index}`,
        ).expect(201)
        if (index === 0) {
          firstBatchId = sent.body.data.batch.id as string
        }
      }

      const rejected = await sendText(
        taskId,
        conversationId,
        '超出会话在途上限',
        `e2e-conv-cap-${taskId}-overflow`,
      ).expect(429)
      expect(rejected.body.message).toContain('当前会话待处理的 AI 批次已达上限')

      const replay = await sendText(
        taskId,
        conversationId,
        '会话在途批次 1',
        `e2e-conv-cap-${taskId}-0`,
      ).expect(201)
      expect(replay.body.data.batch.id).toBe(firstBatchId)

      const listed = await listEvents(taskId, conversationId)
      expect(listed.events.filter((event) => event.kind === 'user_message')).toHaveLength(
        MAX_IN_FLIGHT_PROCESSING_BATCHES_PER_CONVERSATION,
      )
    } finally {
      await prisma.aiCreateTask.deleteMany({ where: { id: taskId } })
    }
  })

  it('rejects further sends when the user already has the max in-flight processing batches', async () => {
    await cancelOwnerInFlightProcessing()
    const opened: Array<{ taskId: string }> = []
    try {
      let remaining = MAX_IN_FLIGHT_PROCESSING_BATCHES_PER_USER
      while (remaining > 0) {
        const session = await openSession()
        const taskId = session.task.id
        const conversationId = session.conversation.id
        opened.push({ taskId })
        const take = Math.min(remaining, MAX_IN_FLIGHT_PROCESSING_BATCHES_PER_CONVERSATION)
        for (let index = 0; index < take; index += 1) {
          await sendText(
            taskId,
            conversationId,
            `用户在途批次 ${opened.length}-${index + 1}`,
            `e2e-user-cap-${taskId}-${index}`,
          ).expect(201)
        }
        remaining -= take
      }

      const overflowSession = await openSession()
      opened.push({ taskId: overflowSession.task.id })
      const rejected = await sendText(
        overflowSession.task.id,
        overflowSession.conversation.id,
        '超出用户在途上限',
        `e2e-user-cap-${overflowSession.task.id}-overflow`,
      ).expect(429)
      expect(rejected.body.message).toContain('待处理的 AI 批次已达上限')

      const listed = await listEvents(overflowSession.task.id, overflowSession.conversation.id)
      expect(listed.events.filter((event) => event.kind === 'user_message')).toHaveLength(0)
    } finally {
      await prisma.aiCreateTask.deleteMany({
        where: { id: { in: opened.map((item) => item.taskId) } },
      })
    }
  })
})

async function readSseUntil(
  app: INestApplication,
  sessionCookie: string,
  path: string,
  predicate: (
    events: Array<{ sequence: number; kind: string; payload: Record<string, unknown> }>,
  ) => boolean,
  afterOpen: () => Promise<void>,
): Promise<Array<{ sequence: number; kind: string; payload: Record<string, unknown> }>> {
  const address = app.getHttpServer().address() as AddressInfo
  const events: Array<{ sequence: number; kind: string; payload: Record<string, unknown> }> = []

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.destroy()
      reject(new Error('SSE timed out'))
    }, 8_000)

    const client = createSseRequest(
      address.port,
      path,
      sessionCookie,
      (chunk) => {
        parseSse(chunk.toString('utf8'), events)
        if (predicate(events)) {
          clearTimeout(timeout)
          client.destroy()
          resolve()
        }
      },
      (error) => {
        clearTimeout(timeout)
        reject(error)
      },
    )

    void afterOpen().catch((error: unknown) => {
      clearTimeout(timeout)
      client.destroy()
      reject(error)
    })
  })

  return events
}

function createSseRequest(
  port: number,
  path: string,
  sessionCookie: string,
  onData: (chunk: Buffer) => void,
  onError: (error: Error) => void,
): http.ClientRequest {
  const req = http.request(
    {
      hostname: '127.0.0.1',
      port,
      path,
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        Cookie: sessionCookie,
      },
    },
    (response) => {
      response.on('data', onData)
    },
  )
  req.on('error', (error) => {
    if ((error as NodeJS.ErrnoException).code !== 'ECONNRESET') {
      onError(error)
    }
  })
  req.end()
  return req
}

function parseSse(
  chunk: string,
  events: Array<{ sequence: number; kind: string; payload: Record<string, unknown> }>,
) {
  const blocks = chunk.split('\n\n')
  for (const block of blocks) {
    const dataLine = block
      .split('\n')
      .find((line) => line.startsWith('data:'))
    if (!dataLine) {
      continue
    }
    try {
      const parsed = JSON.parse(dataLine.slice('data:'.length).trim()) as {
        sequence?: number
        kind?: string
        payload?: Record<string, unknown>
      }
      if (typeof parsed.sequence === 'number' && typeof parsed.kind === 'string') {
        events.push({
          sequence: parsed.sequence,
          kind: parsed.kind,
          payload: parsed.payload ?? {},
        })
      }
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

import type { AddressInfo } from 'node:net'
import type { INestApplication } from '@nestjs/common'
import { DepartureType, PrismaClient } from '@prisma/client'
import { AiWorkflowProcessor } from '../src/modules/ai-create-task/ai-workflow.processor'
import { authRequest, createTestApp, loginAs } from './helpers'
import { startDeterministicHeadlessAgent } from './support/deterministic-headless-agent'
import { startDeterministicParseWorker } from './support/deterministic-parse-worker'

const AGENT_SECRET = 'e2e-agent-service-secret'
const COMPLETED_MESSAGE = '已记下你的出团说明，可以继续在表单完善。'
const FREE_TEXT_PROMPT = '出团日期是哪一天？'
const SINGLE_CHOICE_PROMPT = '这次按几天出团？'
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

describe('Queued input and Agent HITL replies (e2e) #318', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let processor: AiWorkflowProcessor
  let coordinatorToken: string
  let organizationId: string
  let ownerUserId: string
  let agent: Awaited<ReturnType<typeof startDeterministicHeadlessAgent>>
  let ocr: Awaited<ReturnType<typeof startDeterministicParseWorker>>
  const testPrefix = `e2e-ai-hitl-${Date.now()}`

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
        events: Array<{
          id: string
          sequence: number
          kind: string
          payload: Record<string, unknown>
        }>
        activeBatch: { id: string; status: string } | null
        pendingInteraction: {
          id: string
          eventId: string
          type: string
          prompt: string
          options: Array<{ id: string; label: string }>
          status: string
          version: number
        } | null
        queuedBatches: Array<{ id: string; status: string; queued?: boolean }>
      }
    }
  }

  function sendMessage(
    taskId: string,
    conversationId: string,
    body: Record<string, unknown>,
    idempotencyKey: string,
  ) {
    return authRequest(app, coordinatorToken)
      .post(`/api/ai-create-tasks/${taskId}/conversations/${conversationId}/messages`)
      .set('Idempotency-Key', idempotencyKey)
      .send(body)
  }

  async function listEvents(taskId: string, conversationId: string, afterSequence = 0) {
    const response = await authRequest(app, coordinatorToken)
      .get(
        `/api/ai-create-tasks/${taskId}/conversations/${conversationId}/events?afterSequence=${afterSequence}`,
      )
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
        options: Array<{ id: string; label: string }>
        status: string
        version: number
      } | null
      queuedBatches: Array<{ id: string; status: string; queued?: boolean }>
    }
  }

  it('keeps later sends as independent queued batches while one Agent batch is running', async () => {
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id

    const first = await sendMessage(
      taskId,
      conversationId,
      { text: '第一批说明' },
      `e2e-queue-a-${taskId}`,
    ).expect(201)
    agent.holdNextCall()
    const running = processor.processDueJobs(5)
    await waitFor(async () => {
      const count = await prisma.aiInputBatch.count({
        where: { taskId, status: 'agent_running' },
      })
      expect(count).toBe(1)
    })

    const second = await sendMessage(
      taskId,
      conversationId,
      { text: '第二批排队说明' },
      `e2e-queue-b-${taskId}`,
    ).expect(201)
    expect(second.body.data.batch).toMatchObject({
      status: 'ready_for_agent',
      queued: true,
    })
    expect(second.body.data.batch.id).not.toBe(first.body.data.batch.id)

    const listed = await listEvents(taskId, conversationId)
    expect(listed.activeBatch).toMatchObject({
      id: first.body.data.batch.id,
      status: 'agent_running',
    })
    expect(listed.queuedBatches.map((batch) => batch.id)).toEqual([second.body.data.batch.id])

    await processor.processDueJobs(5)
    expect(
      await prisma.aiInputBatch.count({
        where: { taskId, status: 'agent_running' },
      }),
    ).toBe(1)

    agent.release()
    await running
    await processor.processDueJobs(5)

    const batches = await prisma.aiInputBatch.findMany({
      where: { taskId },
      orderBy: { conversationVersion: 'asc' },
    })
    expect(batches.map((batch) => batch.status)).toEqual(['completed', 'completed'])
  })

  it('keeps near-simultaneous sends from two devices as independent sequenced batches', async () => {
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id

    const [first, second] = await Promise.all([
      sendMessage(taskId, conversationId, { text: '设备甲' }, `e2e-dual-a-${taskId}`),
      sendMessage(taskId, conversationId, { text: '设备乙' }, `e2e-dual-b-${taskId}`),
    ])
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect(first.body.data.batch.id).not.toBe(second.body.data.batch.id)

    const listed = await listEvents(taskId, conversationId)
    const userTexts = listed.events
      .filter((event) => event.kind === 'user_message')
      .map((event) => event.payload.text)
    expect(userTexts).toEqual(expect.arrayContaining(['设备甲', '设备乙']))
    expect(userTexts).toHaveLength(2)
    expect(new Set(listed.events.map((event) => event.sequence)).size).toBe(listed.events.length)
  })

  it('persists a free-text question atomically and restores it after reopen', async () => {
    agent.setOutcome({
      kind: 'awaiting_user_input',
      interaction: { type: 'free_text', prompt: FREE_TEXT_PROMPT },
    })
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id

    await sendMessage(
      taskId,
      conversationId,
      { text: '先记下路线，日期还没定' },
      `e2e-ask-${taskId}`,
    ).expect(201)
    await processor.processDueJobs(5)

    const listed = await listEvents(taskId, conversationId)
    expect(listed.activeBatch?.status).toBe('awaiting_user_input')
    expect(listed.pendingInteraction).toMatchObject({
      type: 'free_text',
      prompt: FREE_TEXT_PROMPT,
      status: 'pending',
      version: 1,
    })
    const question = listed.events.find((event) => event.kind === 'agent_message')
    expect(question?.id).toBe(listed.pendingInteraction?.eventId)
    expect(question?.payload).toMatchObject({
      text: FREE_TEXT_PROMPT,
      interaction: {
        interactionId: listed.pendingInteraction?.id,
        type: 'free_text',
        prompt: FREE_TEXT_PROMPT,
        status: 'pending',
        version: 1,
      },
    })

    const restored = await openSession(taskId)
    expect(restored.conversation.id).toBe(conversationId)
    expect(restored.conversation.pendingInteraction).toMatchObject({
      id: listed.pendingInteraction?.id,
      eventId: listed.pendingInteraction?.eventId,
      prompt: FREE_TEXT_PROMPT,
      status: 'pending',
    })
    expect(
      await prisma.aiAgentAttempt.count({
        where: { taskId, conversationId, status: 'completed' },
      }),
    ).toBe(1)
  })

  it('requires a valid replyToEventId and does not treat earlier queued text as the answer', async () => {
    agent.setOutcome({
      kind: 'awaiting_user_input',
      interaction: { type: 'free_text', prompt: FREE_TEXT_PROMPT },
    })
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id

    await sendMessage(taskId, conversationId, { text: '先问日期' }, `e2e-iso-a-${taskId}`).expect(201)
    await sendMessage(
      taskId,
      conversationId,
      { text: '这是提问前就排队的消息，不能当答案' },
      `e2e-iso-b-${taskId}`,
    ).expect(201)
    await processor.processDueJobs(5)

    const asked = await listEvents(taskId, conversationId)
    expect(asked.pendingInteraction?.status).toBe('pending')
    expect(asked.queuedBatches).toHaveLength(1)

    await sendMessage(
      taskId,
      conversationId,
      { text: '2026-10-01' },
      `e2e-iso-bad-reply-${taskId}`,
    ).expect(201)
    const stillWaiting = await listEvents(taskId, conversationId)
    expect(stillWaiting.pendingInteraction?.status).toBe('pending')
    expect(stillWaiting.queuedBatches).toHaveLength(2)

    await sendMessage(
      taskId,
      conversationId,
      {
        text: '2026-10-01',
        replyToEventId: 'missing-event',
        interactionId: asked.pendingInteraction?.id,
        interactionVersion: 1,
      },
      `e2e-iso-wrong-event-${taskId}`,
    ).expect(400)

    await sendMessage(
      taskId,
      conversationId,
      {
        text: '2026-10-01',
        replyToEventId: asked.pendingInteraction?.eventId,
        interactionId: asked.pendingInteraction?.id,
        interactionVersion: 99,
      },
      `e2e-iso-stale-${taskId}`,
    ).expect(409)

    agent.setOutcome({ kind: 'completed', message: COMPLETED_MESSAGE })
    const replied = await sendMessage(
      taskId,
      conversationId,
      {
        text: '2026-10-01',
        replyToEventId: asked.pendingInteraction?.eventId,
        interactionId: asked.pendingInteraction?.id,
        interactionVersion: 1,
      },
      `e2e-iso-ok-${taskId}`,
    ).expect(201)
    expect(replied.body.data.batch.replyToEventId).toBe(asked.pendingInteraction?.eventId)

    const afterReply = await listEvents(taskId, conversationId)
    expect(afterReply.pendingInteraction).toBeNull()
    const replyEvent = afterReply.events.find(
      (event) =>
        event.kind === 'user_message' &&
        event.payload.replyToEventId === asked.pendingInteraction?.eventId,
    )
    expect(replyEvent?.payload).toMatchObject({
      text: '2026-10-01',
      replyToEventId: asked.pendingInteraction?.eventId,
      interactionId: asked.pendingInteraction?.id,
    })

    agent.holdNextCall()
    const replyRun = processor.processDueJobs(1)
    await waitFor(async () => {
      const replyBatch = await prisma.aiInputBatch.findUnique({
        where: { id: replied.body.data.batch.id as string },
      })
      expect(replyBatch?.status).toBe('agent_running')
    })
    expect(
      await prisma.aiInputBatch.count({
        where: { taskId, replyToEventId: null, status: 'ready_for_agent' },
      }),
    ).toBeGreaterThan(0)

    agent.release()
    await replyRun
    await processor.processDueJobs(5)
    const remaining = await prisma.aiInputBatch.count({
      where: { taskId, status: { in: ['ready_for_agent', 'agent_running'] } },
    })
    expect(remaining).toBe(0)
  })

  it('does not claim pre-question queued batches while a HITL reply is still waiting for materials', async () => {
    agent.setOutcome({
      kind: 'awaiting_user_input',
      interaction: { type: 'free_text', prompt: FREE_TEXT_PROMPT },
    })
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id

    await sendMessage(taskId, conversationId, { text: '先问日期' }, `e2e-mat-iso-a-${taskId}`).expect(
      201,
    )
    await sendMessage(
      taskId,
      conversationId,
      { text: '提问前就排队的消息，不能抢在带附件的答案前面' },
      `e2e-mat-iso-b-${taskId}`,
    ).expect(201)
    await processor.processDueJobs(5)

    const asked = await listEvents(taskId, conversationId)
    expect(asked.pendingInteraction?.status).toBe('pending')
    expect(asked.queuedBatches).toHaveLength(1)
    const queuedBatchId = asked.queuedBatches[0]?.id

    agent.setOutcome({ kind: 'completed', message: COMPLETED_MESSAGE })
    ocr.holdNextCall()
    const replied = await authRequest(app, coordinatorToken)
      .post(`/api/ai-create-tasks/${taskId}/conversations/${conversationId}/messages`)
      .set('Idempotency-Key', `e2e-mat-iso-ok-${taskId}`)
      .field('text', '2026-10-01')
      .field('replyToEventId', asked.pendingInteraction?.eventId ?? '')
      .field('interactionId', asked.pendingInteraction?.id ?? '')
      .field('interactionVersion', '1')
      .attach('files', PNG_1X1, { filename: '日期.png', contentType: 'image/png' })
      .expect(201)
    expect(replied.body.data.batch).toMatchObject({
      status: 'waiting_for_materials',
      replyToEventId: asked.pendingInteraction?.eventId,
    })

    const parseRun = processor.processDueJobs(1)
    await waitFor(async () => {
      expect(ocr.callCount()).toBeGreaterThan(0)
    })

    await processor.processDueJobs(5)
    const queuedDuringParse = await prisma.aiInputBatch.findUnique({
      where: { id: queuedBatchId as string },
    })
    expect(queuedDuringParse?.status).toBe('ready_for_agent')
    expect(
      await prisma.aiInputBatch.count({
        where: { id: replied.body.data.batch.id as string, status: 'waiting_for_materials' },
      }),
    ).toBe(1)

    ocr.release()
    await parseRun

    agent.holdNextCall()
    const replyRun = processor.processDueJobs(1)
    await waitFor(async () => {
      const replyBatch = await prisma.aiInputBatch.findUnique({
        where: { id: replied.body.data.batch.id as string },
      })
      expect(replyBatch?.status).toBe('agent_running')
    })
    expect(
      await prisma.aiInputBatch.count({
        where: { taskId, replyToEventId: null, status: 'ready_for_agent' },
      }),
    ).toBeGreaterThan(0)

    agent.release()
    await replyRun
    await processor.processDueJobs(5)
    const remaining = await prisma.aiInputBatch.count({
      where: {
        taskId,
        status: { in: ['waiting_for_materials', 'ready_for_agent', 'agent_running'] },
      },
    })
    expect(remaining).toBe(0)
  })

  it('accepts the first valid interaction response and rejects a late duplicate from another device', async () => {
    agent.setOutcome({
      kind: 'awaiting_user_input',
      interaction: {
        type: 'single_choice',
        prompt: SINGLE_CHOICE_PROMPT,
        options: [
          { id: '3d', label: '3天' },
          { id: '5d', label: '5天' },
        ],
      },
    })
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id
    await sendMessage(taskId, conversationId, { text: '天数还没定' }, `e2e-cas-a-${taskId}`).expect(
      201,
    )
    await processor.processDueJobs(5)
    const asked = await listEvents(taskId, conversationId)
    expect(asked.pendingInteraction).toMatchObject({
      type: 'single_choice',
      prompt: SINGLE_CHOICE_PROMPT,
      status: 'pending',
    })

    await sendMessage(
      taskId,
      conversationId,
      {
        text: '不是选项',
        replyToEventId: asked.pendingInteraction?.eventId,
        interactionId: asked.pendingInteraction?.id,
        interactionVersion: 1,
      },
      `e2e-cas-schema-${taskId}`,
    ).expect(400)

    agent.setOutcome({ kind: 'completed', message: COMPLETED_MESSAGE })
    const accepted = await sendMessage(
      taskId,
      conversationId,
      {
        selectedOptionId: '5d',
        replyToEventId: asked.pendingInteraction?.eventId,
        interactionId: asked.pendingInteraction?.id,
        interactionVersion: 1,
      },
      `e2e-cas-ok-${taskId}`,
    ).expect(201)
    expect(accepted.body.data.batch.replyToEventId).toBe(asked.pendingInteraction?.eventId)

    await sendMessage(
      taskId,
      conversationId,
      {
        selectedOptionId: '3d',
        replyToEventId: asked.pendingInteraction?.eventId,
        interactionId: asked.pendingInteraction?.id,
        interactionVersion: 1,
      },
      `e2e-cas-late-${taskId}`,
    ).expect(409)

    const restored = await openSession(taskId)
    expect(restored.conversation.pendingInteraction).toBeNull()
    expect(
      restored.conversation.events.some(
        (event) => event.kind === 'user_message' && event.payload.selectedOptionId === '5d',
      ),
    ).toBe(true)
  })

  it('cancels the current wait so previously queued batches can run in sequence', async () => {
    agent.setOutcome({
      kind: 'awaiting_user_input',
      interaction: { type: 'free_text', prompt: FREE_TEXT_PROMPT },
    })
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id
    await sendMessage(taskId, conversationId, { text: '先提问' }, `e2e-cancel-a-${taskId}`).expect(
      201,
    )
    await sendMessage(
      taskId,
      conversationId,
      { text: '提问前排队，取消后仍按原序执行' },
      `e2e-cancel-b-${taskId}`,
    ).expect(201)
    await processor.processDueJobs(5)
    const asked = await listEvents(taskId, conversationId)

    agent.setOutcome({ kind: 'completed', message: COMPLETED_MESSAGE })
    await authRequest(app, coordinatorToken)
      .post(
        `/api/ai-create-tasks/${taskId}/conversations/${conversationId}/interactions/${asked.pendingInteraction?.id}/cancel`,
      )
      .set('Idempotency-Key', `e2e-cancel-${taskId}`)
      .send({ version: 1 })
      .expect(200)

    const afterCancel = await listEvents(taskId, conversationId)
    expect(afterCancel.pendingInteraction).toBeNull()
    expect(afterCancel.activeBatch).toMatchObject({ status: 'ready_for_agent' })

    await processor.processDueJobs(5)
    const batches = await prisma.aiInputBatch.findMany({
      where: { taskId },
      orderBy: { conversationVersion: 'asc' },
    })
    expect(batches.map((batch) => batch.status)).toEqual(['cancelled', 'completed'])
  })

  it('stops the current attempt and keeps a clear event link for the next reorganized batch', async () => {
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id
    const sent = await sendMessage(
      taskId,
      conversationId,
      { text: '先跑起来再停' },
      `e2e-stop-a-${taskId}`,
    ).expect(201)
    agent.holdNextCall()
    const running = processor.processDueJobs(5)
    await waitFor(async () => {
      expect(
        await prisma.aiInputBatch.count({
          where: { taskId, status: 'agent_running' },
        }),
      ).toBe(1)
    })

    const stopped = await authRequest(app, coordinatorToken)
      .post(
        `/api/ai-create-tasks/${taskId}/conversations/${conversationId}/batches/${sent.body.data.batch.id}/stop`,
      )
      .set('Idempotency-Key', `e2e-stop-${taskId}`)
      .expect(200)
    const stopEvent = (stopped.body.data.events as Array<{ payload: Record<string, unknown> }>).find(
      (event) => event.payload.status === 'cancelled',
    )
    expect(stopEvent?.payload).toMatchObject({
      batchId: sent.body.data.batch.id,
      status: 'cancelled',
      reason: 'user_stop',
    })
    expect(typeof stopEvent?.payload.attemptId).toBe('string')

    agent.release()
    await running.catch(() => undefined)

    const next = await sendMessage(
      taskId,
      conversationId,
      { text: '停止后重新组织的输入' },
      `e2e-stop-b-${taskId}`,
    ).expect(201)
    expect(next.body.data.batch.id).not.toBe(sent.body.data.batch.id)
    await processor.processDueJobs(5)
    const listed = await listEvents(taskId, conversationId)
    expect(
      listed.events.some(
        (event) =>
          event.kind === 'batch_status' &&
          event.payload.reason === 'user_stop' &&
          event.payload.batchId === sent.body.data.batch.id,
      ),
    ).toBe(true)
    expect(listed.events.some((event) => event.payload.text === COMPLETED_MESSAGE)).toBe(true)
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

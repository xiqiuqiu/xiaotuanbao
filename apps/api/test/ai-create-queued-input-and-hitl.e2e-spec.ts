import type { AddressInfo } from 'node:net'
import type { INestApplication } from '@nestjs/common'
import { DepartureType, PrismaClient } from '@prisma/client'
import type { SubmitReviewPackageModelInput } from '@xiaotuanbao/ai-contracts'
import { AiWorkflowProcessor } from '../src/modules/ai-create-task/ai-workflow.processor'
import { authRequest, createTestApp, loginAs } from './helpers'
import { startDeterministicHeadlessAgent, resolvedItemOutcome } from './support/deterministic-headless-agent'
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
  let ownerUserId: string
  let agent: Awaited<ReturnType<typeof startDeterministicHeadlessAgent>>
  let ocr: Awaited<ReturnType<typeof startDeterministicParseWorker>>
  const testPrefix = `e2e-ai-hitl-${Date.now()}`
  const createdTaskIds = new Set<string>()
  const createdConversationIds = new Set<string>()
  const activeProcessorRuns = new Set<Promise<number>>()

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

    const user = await prisma.user.findFirst({
      where: { username: 'wangjie', deletedAt: null },
    })
    if (!user) {
      throw new Error('Seed user wangjie not found')
    }
    ownerUserId = user.id
  })

  afterAll(async () => {
    const failures: unknown[] = []
    const settle = async (operation: Promise<unknown> | undefined) => {
      if (!operation) {
        return
      }
      try {
        await operation
      } catch (error) {
        failures.push(error)
      }
    }

    await settle((prisma as PrismaClient | undefined)?.$disconnect())
    await settle((agent as typeof agent | undefined)?.close())
    await settle((ocr as typeof ocr | undefined)?.close())
    await settle((app as INestApplication | undefined)?.close())
    if (failures.length > 0) {
      throw new AggregateError(failures, 'HITL E2E teardown failed')
    }
  })

  afterEach(async () => {
    agent.setOutcome(resolvedItemOutcome({ kind: 'awaiting_user_input', interaction: { type: 'free_text', prompt: COMPLETED_MESSAGE }, completionBasis: { kind: 'persistent_clarification' } }))
    agent.release()
    ocr.release()
    await Promise.allSettled([...activeProcessorRuns])
    const taskIds = [...createdTaskIds]
    const conversationIds = [...createdConversationIds]
    if (conversationIds.length > 0) {
      await prisma.aiConversation.deleteMany({ where: { id: { in: conversationIds } } })
    }
    if (taskIds.length > 0) {
      await prisma.aiReviewPackage.deleteMany({ where: { taskId: { in: taskIds } } })
      await prisma.aiCreateActivityRun.deleteMany({ where: { taskId: { in: taskIds } } })
      await prisma.departureCreationDraft.deleteMany({ where: { taskId: { in: taskIds } } })
      await prisma.aiCreateIdempotencyRecord.deleteMany({ where: { taskId: { in: taskIds } } })
      await prisma.agentTask.deleteMany({ where: { id: { in: taskIds } } })
    }
    createdTaskIds.clear()
    createdConversationIds.clear()
  })

  async function openSession(taskId?: string) {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/agent/tasks/departure-creation/sessions')
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
    const opened = response.body.data as {
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
    createdTaskIds.add(opened.task.id)
    createdConversationIds.add(opened.conversation.id)
    return opened
  }

  async function processOwnedDueJobs(limit = 5): Promise<number> {
    const run = processor.processDueJobs(limit)
    activeProcessorRuns.add(run)
    void run.finally(() => activeProcessorRuns.delete(run)).catch(() => undefined)
    return run
  }

  function sendMessage(
    taskId: string,
    conversationId: string,
    body: Record<string, unknown>,
    idempotencyKey: string,
  ) {
    return authRequest(app, coordinatorToken)
      .post(`/api/agent/conversations/${conversationId}/messages`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ ...body, primaryTaskId: taskId })
  }

  async function listEvents(_taskId: string, conversationId: string, afterSequence = 0) {
    const response = await authRequest(app, coordinatorToken)
      .get(
        `/api/agent/conversations/${conversationId}/events?afterSequence=${afterSequence}`,
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
      draft: { text: string; draftEpoch: number; revision: number }
    }
  }

  it('queues a new send until the running batch finishes without cancelling either input', async () => {
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
    const running = processOwnedDueJobs(5)
    await waitFor(async () => {
      const count = await prisma.aiInputBatch.count({
        where: { taskLinks: { some: { taskId } }, status: 'agent_running' },
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
    })
    expect(second.body.data.batch.queued).toBe(true)
    expect(second.body.data.batch.id).not.toBe(first.body.data.batch.id)
    expect(second.body.data.events.some((event: { payload: { status?: string } }) => event.payload.status === 'cancelled')).toBe(false)

    const listed = await listEvents(taskId, conversationId)
    expect(listed.activeBatch).toMatchObject({
      id: first.body.data.batch.id,
      status: 'agent_running',
    })
    expect(listed.queuedBatches).toHaveLength(1)

    agent.release()
    await running
    await processOwnedDueJobs(5)

    const batches = await prisma.aiInputBatch.findMany({
      where: { taskLinks: { some: { taskId } } },
      orderBy: { conversationVersion: 'asc' },
    })
    expect(batches.map((batch) => batch.status)).toEqual(['awaiting_user_input', 'awaiting_user_input'])
    expect(await prisma.aiConversationInteraction.count({
      where: { inputBatchId: first.body.data.batch.id as string },
    })).toBe(1)
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
    agent.setOutcome(resolvedItemOutcome({
      kind: 'awaiting_user_input',
      completionBasis: { kind: 'persistent_clarification' },
      interaction: { type: 'free_text', prompt: FREE_TEXT_PROMPT },
    }))
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id

    await sendMessage(
      taskId,
      conversationId,
      { text: '先记下路线，日期还没定' },
      `e2e-ask-${taskId}`,
    ).expect(201)
    await processOwnedDueJobs(5)

    const listed = await listEvents(taskId, conversationId)
    expect(listed.activeBatch?.status).toBe('awaiting_user_input')
    const attempt = await prisma.aiAgentAttempt.findFirstOrThrow({ where: { taskId } })
    expect(attempt.status).toBe('completed')
    expect(attempt.endedAt).not.toBeNull()
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

  it('短回复“对”只有显式绑定追问卡片时才回答，不会被当成提交授权', async () => {
    agent.setOutcome(
      resolvedItemOutcome({
        kind: 'awaiting_user_input',
        completionBasis: { kind: 'persistent_clarification' },
        interaction: { type: 'free_text', prompt: FREE_TEXT_PROMPT },
      }),
    )
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id

    await sendMessage(
      taskId,
      conversationId,
      { text: '日期还需要确认' },
      `e2e-short-reply-ask-${taskId}`,
    ).expect(201)
    await processOwnedDueJobs(5)
    const asked = await listEvents(taskId, conversationId)
    expect(asked.pendingInteraction).toMatchObject({
      type: 'free_text',
      status: 'pending',
      version: 1,
    })

    const ordinary = await sendMessage(
      taskId,
      conversationId,
      { text: '对' },
      `e2e-short-reply-ordinary-${taskId}`,
    ).expect(201)
    const stillWaiting = await listEvents(taskId, conversationId)
    expect(stillWaiting.pendingInteraction?.id).toBe(asked.pendingInteraction?.id)
    expect(ordinary.body.data.batch).toMatchObject({ status: 'ready_for_agent' })

    const explicitReply = await sendMessage(
      taskId,
      conversationId,
      {
        text: '对',
        replyToEventId: asked.pendingInteraction?.eventId,
        interactionId: asked.pendingInteraction?.id,
        interactionVersion: 1,
      },
      `e2e-short-reply-explicit-${taskId}`,
    ).expect(201)
    expect(explicitReply.body.data.batch.replyToEventId).toBe(asked.pendingInteraction?.eventId)

    const afterReply = await listEvents(taskId, conversationId)
    expect(afterReply.pendingInteraction).toBeNull()
    expect(
      await prisma.aiConversationInteraction.findUniqueOrThrow({
        where: { id: asked.pendingInteraction?.id },
      }),
    ).toMatchObject({ status: 'answered', responseJson: { text: '对' } })
    expect(await prisma.aiReviewPackage.count({ where: { taskId } })).toBe(0)
    expect(
      await prisma.aiCreateTask.findUniqueOrThrow({ where: { id: taskId } }),
    ).toMatchObject({ departureId: null })
  })

  it('keeps the composer draft when answering an interaction card', async () => {
    agent.setOutcome(resolvedItemOutcome({
      kind: 'awaiting_user_input',
      completionBasis: { kind: 'persistent_clarification' },
      interaction: { type: 'free_text', prompt: FREE_TEXT_PROMPT },
    }))
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id

    await sendMessage(
      taskId,
      conversationId,
      { text: '先记下路线，日期还没定' },
      `e2e-draft-ask-${taskId}`,
    ).expect(201)
    await processOwnedDueJobs(5)

    const asked = await listEvents(taskId, conversationId)
    const saved = await authRequest(app, coordinatorToken)
      .put(`/api/agent/conversations/${conversationId}/draft`)
      .send({ text: '还没发出去的备注', draftEpoch: 1 })
      .expect(200)
    expect(saved.body.data).toMatchObject({
      text: '还没发出去的备注',
      draftEpoch: 1,
    })

    agent.setOutcome(resolvedItemOutcome({ kind: 'awaiting_user_input', interaction: { type: 'free_text', prompt: COMPLETED_MESSAGE }, completionBasis: { kind: 'persistent_clarification' } }))
    const replied = await sendMessage(
      taskId,
      conversationId,
      {
        text: '2026-10-01',
        replyToEventId: asked.pendingInteraction?.eventId,
        interactionId: asked.pendingInteraction?.id,
        interactionVersion: 1,
      },
      `e2e-draft-reply-${taskId}`,
    ).expect(201)

    expect(replied.body.data.draft).toMatchObject({
      text: '还没发出去的备注',
      draftEpoch: 1,
      revision: saved.body.data.revision,
    })
    const listed = await listEvents(taskId, conversationId)
    expect(listed.draft).toMatchObject({
      text: '还没发出去的备注',
      draftEpoch: 1,
      revision: saved.body.data.revision,
    })
  })

  it('requires a valid replyToEventId and does not treat earlier queued text as the answer', async () => {
    agent.setOutcome(resolvedItemOutcome({
      kind: 'awaiting_user_input',
      completionBasis: { kind: 'persistent_clarification' },
      interaction: { type: 'free_text', prompt: FREE_TEXT_PROMPT },
    }))
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id

    await sendMessage(taskId, conversationId, { text: '先问日期' }, `e2e-iso-a-${taskId}`).expect(201)
    const earlierOrdinary = await sendMessage(
      taskId,
      conversationId,
      { text: '这是提问前就排队的消息，不能当答案' },
      `e2e-iso-b-${taskId}`,
    ).expect(201)
    await processOwnedDueJobs(1)

    const asked = await listEvents(taskId, conversationId)
    expect(asked.pendingInteraction?.status).toBe('pending')
    expect(asked.activeBatch?.id).toBe(earlierOrdinary.body.data.batch.id)
    expect(asked.queuedBatches).toHaveLength(0)

    const laterOrdinary = await sendMessage(
      taskId,
      conversationId,
      { text: '2026-10-01' },
      `e2e-iso-bad-reply-${taskId}`,
    ).expect(201)
    const stillWaiting = await listEvents(taskId, conversationId)
    expect(stillWaiting.pendingInteraction?.status).toBe('pending')
    expect(stillWaiting.queuedBatches).toHaveLength(1)

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

    agent.setOutcome(resolvedItemOutcome({ kind: 'answered', message: COMPLETED_MESSAGE, completionBasis: { kind: 'final_answer' } }))
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

    await processOwnedDueJobs(1)
    expect(
      await prisma.aiInputBatch.findUniqueOrThrow({
        where: { id: earlierOrdinary.body.data.batch.id as string },
      }),
    ).toMatchObject({ status: 'completed' })
    expect(
      await prisma.aiInputBatch.findUniqueOrThrow({
        where: { id: laterOrdinary.body.data.batch.id as string },
      }),
    ).toMatchObject({ status: 'ready_for_agent' })
    expect(
      await prisma.aiInputBatch.findUniqueOrThrow({
        where: { id: replied.body.data.batch.id as string },
      }),
    ).toMatchObject({ status: 'ready_for_agent' })

    await processOwnedDueJobs(5)
    const remaining = await prisma.aiInputBatch.count({
      where: {
        taskLinks: { some: { taskId } },
        status: { in: ['ready_for_agent', 'preparing_context', 'agent_running'] },
      },
    })
    expect(remaining).toBe(0)
  })

  it('更早的普通输入不被带附件的追问回复阻塞，回复在资料就绪后按序执行', async () => {
    agent.setOutcome(resolvedItemOutcome({
      kind: 'awaiting_user_input',
      completionBasis: { kind: 'persistent_clarification' },
      interaction: { type: 'free_text', prompt: FREE_TEXT_PROMPT },
    }))
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id

    await sendMessage(taskId, conversationId, { text: '先问日期' }, `e2e-mat-iso-a-${taskId}`).expect(
      201,
    )
    const earlierOrdinary = await sendMessage(
      taskId,
      conversationId,
      { text: '提问前就排队的消息，不能抢在带附件的答案前面' },
      `e2e-mat-iso-b-${taskId}`,
    ).expect(201)
    await processOwnedDueJobs(1)

    const asked = await listEvents(taskId, conversationId)
    expect(asked.pendingInteraction?.status).toBe('pending')
    expect(asked.activeBatch?.id).toBe(earlierOrdinary.body.data.batch.id)
    expect(asked.queuedBatches).toHaveLength(0)
    const queuedBatchId = earlierOrdinary.body.data.batch.id

    agent.setOutcome(resolvedItemOutcome({ kind: 'answered', message: COMPLETED_MESSAGE, completionBasis: { kind: 'final_answer' } }))
    ocr.holdNextCall()
    const replied = await authRequest(app, coordinatorToken)
      .post(`/api/agent/conversations/${conversationId}/messages`)
      .set('Idempotency-Key', `e2e-mat-iso-ok-${taskId}`)
      .field('text', '2026-10-01')
      .field('primaryTaskId', taskId)
      .field('replyToEventId', asked.pendingInteraction?.eventId ?? '')
      .field('interactionId', asked.pendingInteraction?.id ?? '')
      .field('interactionVersion', '1')
      .attach('files', PNG_1X1, { filename: '日期.png', contentType: 'image/png' })
      .expect(201)
    expect(replied.body.data.batch).toMatchObject({
      status: 'waiting_for_materials',
      replyToEventId: asked.pendingInteraction?.eventId,
    })

    const parseRun = processOwnedDueJobs(1)
    await waitFor(async () => {
      expect(ocr.callCount()).toBeGreaterThan(0)
    })

    await processOwnedDueJobs(5)
    const queuedDuringParse = await prisma.aiInputBatch.findUnique({
      where: { id: queuedBatchId as string },
    })
    expect(queuedDuringParse?.status).toBe('completed')
    expect(
      await prisma.aiInputBatch.count({
        where: { id: replied.body.data.batch.id as string, status: 'waiting_for_materials' },
      }),
    ).toBe(1)

    ocr.release()
    await parseRun

    await processOwnedDueJobs(5)
    const remaining = await prisma.aiInputBatch.count({
      where: {
        taskLinks: { some: { taskId } },
        status: { in: ['waiting_for_materials', 'ready_for_agent', 'preparing_context', 'agent_running'] },
      },
    })
    expect(remaining).toBe(0)
  })

  it('accepts the first valid interaction response and rejects a late duplicate from another device', async () => {
    agent.setOutcome(resolvedItemOutcome({
      kind: 'awaiting_user_input',
      completionBasis: { kind: 'persistent_clarification' },
      interaction: {
        type: 'single_choice',
        prompt: SINGLE_CHOICE_PROMPT,
        options: [
          { id: '3d', label: '3天' },
          { id: '5d', label: '5天' },
        ],
      },
    }))
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id
    await sendMessage(taskId, conversationId, { text: '天数还没定' }, `e2e-cas-a-${taskId}`).expect(
      201,
    )
    await processOwnedDueJobs(5)
    const asked = await listEvents(taskId, conversationId)
    expect(asked.pendingInteraction).not.toBeNull()
    expect(await prisma.agentTask.findUniqueOrThrow({ where: { id: taskId } })).toMatchObject({
      status: 'waiting',
    })
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

    agent.setOutcome(resolvedItemOutcome({ kind: 'awaiting_user_input', interaction: { type: 'free_text', prompt: COMPLETED_MESSAGE }, completionBasis: { kind: 'persistent_clarification' } }))
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

  it('revises the referenced review in its original task without rejecting or creating another draft', async () => {
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id
    const originalName = `${testPrefix}-原建议`
    const revisedName = `${testPrefix}-修订建议`
    const otherName = `${testPrefix}-另一待审建议`
    const originalProposal = {
      objectVersion: opened.task.draft.version, confirmationUnit: 'basic_info_draft', candidates: [
        { fieldKey: 'name', proposedValue: originalName, clarity: 'clear', evidence: [{ kind: 'user_message', sequence: 1, excerpt: originalName }] },
        { fieldKey: 'notes', proposedValue: '保留的备注', clarity: 'clear', evidence: [{ kind: 'user_message', sequence: 1, excerpt: '保留的备注' }] },
      ],
    } satisfies SubmitReviewPackageModelInput
    agent.setOutcome(resolvedItemOutcome({ kind: 'awaiting_review', completionBasis: { kind: 'accepted_review_package' },
      reviewPackage: originalProposal,
      reviewPackages: [{ ...originalProposal, candidates: [
        { fieldKey: 'name', proposedValue: otherName, clarity: 'clear', evidence: [{ kind: 'user_message', sequence: 1, excerpt: otherName }] },
      ] }, originalProposal],
    }))
    await sendMessage(taskId, conversationId, { text: `两份建议：${otherName}；${originalName}，保留的备注` }, `revision-initial-${taskId}`).expect(201)
    await processOwnedDueJobs(1)
    const original = await prisma.aiReviewPackage.findFirstOrThrow({ where: {
      taskId, conversationId, status: 'pending', candidates: { path: ['0', 'proposedValue'], equals: originalName },
    } })
    const other = await prisma.aiReviewPackage.findFirstOrThrow({ where: {
      taskId, conversationId, status: 'pending', candidates: { path: ['0', 'proposedValue'], equals: otherName },
    } })
    const sent = await authRequest(app, coordinatorToken)
      .post(`/api/agent/conversations/${conversationId}/messages`)
      .set('Idempotency-Key', `revision-followup-${taskId}`)
      .send({ text: `只将团名改为 ${revisedName}`, reviewPackageId: original.id })
      .expect(201)
    expect(sent.body.data.batch.queued).not.toBe(true)
    const sequence = sent.body.data.events.find((event: { kind: string }) => event.kind === 'user_message').sequence
    agent.setOutcome(resolvedItemOutcome({ kind: 'awaiting_review', completionBasis: { kind: 'accepted_review_package' },
      reviewPackage: { objectVersion: opened.task.draft.version, confirmationUnit: 'basic_info_draft',
        reviewPackageId: original.id, expectedPackageVersion: original.version,
        candidates: [{ fieldKey: 'name', proposedValue: revisedName, clarity: 'clear',
          evidence: [{ kind: 'user_message', sequence, excerpt: revisedName }] }],
      },
    }))
    await processOwnedDueJobs(1)
    const unresolvedState = JSON.parse(agent.lastUserText()!.split('【未决交互】\n')[1]!.split('\n\n【交流背景】')[0]!)
    expect(unresolvedState.reviewPackageId).toBe(original.id)
    expect(unresolvedState.pendingReviews).toEqual([expect.objectContaining({ id: original.id })])
    const revised = await prisma.aiReviewPackage.findUniqueOrThrow({ where: { id: original.id } })
    expect(revised).toMatchObject({ taskId, status: 'pending', version: original.version + 1 })
    expect(revised.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldKey: 'name', proposedValue: revisedName }),
      expect.objectContaining({ fieldKey: 'notes', proposedValue: '保留的备注' }),
    ]))
    expect(await prisma.aiReviewPackage.findUniqueOrThrow({ where: { id: other.id } })).toMatchObject({
      status: 'pending', version: other.version, candidates: other.candidates,
    })
    expect(await prisma.conversationTaskLink.count({ where: { conversationId } })).toBe(1)
    expect(await prisma.aiReviewPackage.count({ where: { conversationId } })).toBe(2)
  })

  it('awaiting_review 不阻塞独立输入，也不处置原审核事项', async () => {
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id

    const first = await sendMessage(
      taskId,
      conversationId,
      { text: '先提交待审核建议' },
      `e2e-review-queue-a-${taskId}`,
    ).expect(201)
    await prisma.$transaction([
      prisma.aiInputBatch.update({
        where: { id: first.body.data.batch.id as string },
        data: { status: 'awaiting_review' },
      }),
      prisma.aiWorkflowJob.updateMany({
        where: { inputBatchId: first.body.data.batch.id as string },
        data: { status: 'succeeded', leaseExpiresAt: null },
      }),
    ])

    const second = await sendMessage(
      taskId,
      conversationId,
      { text: '审核未结束时独立询问' },
      `e2e-review-queue-b-${taskId}`,
    ).expect(201)
    expect(second.body.data.batch).toMatchObject({
      status: 'ready_for_agent',
    })
    expect(second.body.data.batch.queued).not.toBe(true)

    await processOwnedDueJobs(5)
    const completedDuringReview = await prisma.aiInputBatch.findUnique({
      where: { id: second.body.data.batch.id as string },
    })
    expect(completedDuringReview?.status).toBe('awaiting_user_input')
    expect(
      await prisma.aiWorkflowJob.count({
        where: {
          inputBatchId: second.body.data.batch.id as string,
          status: 'succeeded',
        },
      }),
    ).toBe(1)
    expect(
      await prisma.aiInputBatch.findUniqueOrThrow({
        where: { id: first.body.data.batch.id as string },
      }),
    ).toMatchObject({ status: 'awaiting_review' })
  })

  it('does not claim a later ready batch while an earlier non-reply batch is waiting for materials', async () => {
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id

    ocr.holdNextCall()
    const first = await authRequest(app, coordinatorToken)
      .post(`/api/agent/conversations/${conversationId}/messages`)
      .set('Idempotency-Key', `e2e-wait-mat-a-${taskId}`)
      .field('text', '先解析这张图')
      .field('primaryTaskId', taskId)
      .attach('files', PNG_1X1, { filename: '行程.png', contentType: 'image/png' })
      .expect(201)
    expect(first.body.data.batch.status).toBe('waiting_for_materials')

    const parseRun = processOwnedDueJobs(1)
    try {
      await waitFor(async () => {
        expect(ocr.callCount()).toBeGreaterThan(0)
      })

      const second = await sendMessage(
        taskId,
        conversationId,
        { text: '资料未齐套前这条应继续排队' },
        `e2e-wait-mat-b-${taskId}`,
      ).expect(201)
      expect(second.body.data.batch).toMatchObject({
        status: 'ready_for_agent',
        queued: true,
      })

      await processOwnedDueJobs(5)
      const queuedDuringParse = await prisma.aiInputBatch.findUnique({
        where: { id: second.body.data.batch.id as string },
      })
      expect(queuedDuringParse?.status).toBe('ready_for_agent')
      expect(
        await prisma.aiWorkflowJob.count({
          where: {
            inputBatchId: second.body.data.batch.id as string,
            status: { in: ['claimed', 'succeeded'] },
          },
        }),
      ).toBe(0)
    } finally {
      ocr.release()
      await parseRun
    }
    await processOwnedDueJobs(5)
    const batches = await prisma.aiInputBatch.findMany({
      where: { taskLinks: { some: { taskId } } },
      orderBy: { conversationVersion: 'asc' },
    })
    expect(batches.map((batch) => batch.status)).toEqual(['awaiting_user_input', 'awaiting_user_input'])
  })

  it('cancels the current wait so previously queued batches can run in sequence', async () => {
    agent.setOutcome(resolvedItemOutcome({
      kind: 'awaiting_user_input',
      completionBasis: { kind: 'persistent_clarification' },
      interaction: { type: 'free_text', prompt: FREE_TEXT_PROMPT },
    }))
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
    await processOwnedDueJobs(1)
    const asked = await listEvents(taskId, conversationId)

    agent.setOutcome(resolvedItemOutcome({ kind: 'awaiting_user_input', interaction: { type: 'free_text', prompt: COMPLETED_MESSAGE }, completionBasis: { kind: 'persistent_clarification' } }))
    await authRequest(app, coordinatorToken)
      .post(
        `/api/agent/conversations/${conversationId}/interactions/${asked.pendingInteraction?.id}/cancel`,
      )
      .set('Idempotency-Key', `e2e-cancel-${taskId}`)
      .send({ version: 1 })
      .expect(200)

    const afterCancel = await listEvents(taskId, conversationId)
    expect(afterCancel.pendingInteraction).toBeNull()
    expect(await prisma.agentTask.findUniqueOrThrow({ where: { id: taskId } })).toMatchObject({
      status: 'active',
    })
    expect(afterCancel.activeBatch).toMatchObject({ status: 'ready_for_agent' })

    await processOwnedDueJobs(5)
    const batches = await prisma.aiInputBatch.findMany({
      where: { taskLinks: { some: { taskId } } },
      orderBy: { conversationVersion: 'asc' },
    })
    expect(batches.map((batch) => batch.status)).toEqual(['cancelled', 'awaiting_user_input'])
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
    const running = processOwnedDueJobs(5)
    await waitFor(async () => {
      expect(
        await prisma.aiInputBatch.count({
          where: { taskLinks: { some: { taskId } }, status: 'agent_running' },
        }),
      ).toBe(1)
    })

    const stopped = await authRequest(app, coordinatorToken)
      .post(
        `/api/agent/conversations/${conversationId}/batches/${sent.body.data.batch.id}/stop`,
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
    await processOwnedDueJobs(5)
    const listed = await listEvents(taskId, conversationId)
    expect(
      listed.events.some(
        (event) =>
          event.kind === 'batch_status' &&
          event.payload.reason === 'user_stop' &&
          event.payload.batchId === sent.body.data.batch.id,
      ),
    ).toBe(true)
    expect(
      listed.events.some(
        (event) =>
          event.kind === 'agent_message' && event.payload.batchId === sent.body.data.batch.id,
      ),
    ).toBe(false)
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

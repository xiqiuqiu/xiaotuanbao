import type { AddressInfo } from 'node:net'
import type { INestApplication } from '@nestjs/common'
import { DepartureType, PrismaClient } from '@prisma/client'
import { AiWorkflowProcessor } from '../src/modules/ai-create-task/ai-workflow.processor'
import { authRequest, createTestApp, loginAs } from './helpers'
import { startDeterministicHeadlessAgent } from './support/deterministic-headless-agent'

const AGENT_SECRET = 'e2e-agent-service-secret'
const COMPLETED_MESSAGE = '已记下你的出团说明，可以继续在表单完善。'

describe('AgentTask confirm isolates the current run and keeps the task open (e2e) #445', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let processor: AiWorkflowProcessor
  let token: string
  let organizationId: string
  let userId: string
  let agent: Awaited<ReturnType<typeof startDeterministicHeadlessAgent>>
  const testPrefix = `e2e366-confirm-${Date.now()}`
  const taskIds: string[] = []
  const conversationIds: string[] = []

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
    token = await loginAs(app, 'wangjie')
    const user = await prisma.user.findFirstOrThrow({ where: { username: 'wangjie' } })
    organizationId = user.organizationId
    userId = user.id
  })

  afterAll(async () => {
    await prisma.aiCreateIdempotencyRecord.deleteMany({
      where: { organizationId, idempotencyKey: { startsWith: testPrefix } },
    })
    if (conversationIds.length > 0) {
      await prisma.aiConversation.deleteMany({ where: { id: { in: conversationIds } } })
    }
    if (taskIds.length > 0) {
      await prisma.$executeRawUnsafe(
        'DELETE FROM "agent_tasks" WHERE "id" = ANY($1::text[])',
        taskIds,
      )
    }
    await prisma.itinerarySegment.deleteMany({
      where: { departure: { organizationId, name: { startsWith: testPrefix } } },
    })
    await prisma.departure.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.$disconnect()
    await agent.close()
    await app.close()
  })

  afterEach(() => {
    agent.setOutcome({ kind: 'completed', message: COMPLETED_MESSAGE })
    agent.release()
  })

  async function openConfirmableSession(name: string) {
    const response = await authRequest(app, token)
      .post('/api/agent/tasks/departure-creation/sessions')
      .send({
        draft: {
          mode: 'manual',
          routeName: `${testPrefix}-路线`,
          name,
          startDate: '2026-09-01',
          endDate: '2026-09-05',
          ownerUserId: userId,
          departureType: DepartureType.combined,
        },
      })
      .expect(201)
    const taskId = response.body.data.task.id as string
    const conversationId = response.body.data.conversation.id as string
    taskIds.push(taskId)
    conversationIds.push(conversationId)
    return {
      taskId,
      conversationId,
      draftVersion: response.body.data.task.draft.version as number,
    }
  }

  it('fails open jobs, cancels batches, and skips leftover actions when confirming a departure', async () => {
    const name = `${testPrefix}-isolate`
    const opened = await openConfirmableSession(name)
    const sent = await authRequest(app, token)
      .post(`/api/agent/conversations/${opened.conversationId}/messages`)
      .set('Idempotency-Key', `${testPrefix}-isolate-send`)
      .field('text', '确认前仍有未完成作业')
      .field('primaryTaskId', opened.taskId)
      .expect(201)
    const batchId = sent.body.data.batch.id as string
    const action = await prisma.aiAction.create({
      data: {
        organizationId,
        userId,
        taskId: opened.taskId,
        conversationId: opened.conversationId,
        inputBatchId: batchId,
        name: 'departure.test.write',
        kind: 'write',
        decision: 'allow',
        reasonCode: 'TEST',
        inputHash: `${testPrefix}-isolate-action`,
        replayKey: `${testPrefix}-isolate-action-${Math.random()}`,
      },
    })

    const confirmed = await authRequest(app, token)
      .post(`/api/ai-create-tasks/${opened.taskId}/confirm`)
      .set('Idempotency-Key', `${testPrefix}-isolate-confirm`)
      .send({ expectedVersion: opened.draftVersion })
      .expect(201)

    expect(await prisma.agentTask.findUniqueOrThrow({ where: { id: opened.taskId } })).toMatchObject({
      status: 'active',
    })
    expect(
      await prisma.aiConversation.findUniqueOrThrow({ where: { id: opened.conversationId } }),
    ).toMatchObject({ status: 'open' })
    expect(await prisma.aiInputBatch.findUniqueOrThrow({ where: { id: batchId } })).toMatchObject({
      status: 'cancelled',
    })
    expect(
      await prisma.aiWorkflowJob.findFirstOrThrow({
        where: { inputBatchId: batchId, type: 'agent_batch' },
      }),
    ).toMatchObject({ status: 'failed', generation: 1, lastErrorCode: 'DEPARTURE_CREATED' })
    expect(await prisma.aiAction.findUniqueOrThrow({ where: { id: action.id } })).toMatchObject({
      executionStatus: 'skipped',
    })
    await expect(
      prisma.taskActivity.findFirst({ where: { taskId: opened.taskId, kind: 'completed' } }),
    ).resolves.toBeNull()

    await authRequest(app, token)
      .patch(`/api/departures/${confirmed.body.data.id}`)
      .send({ name: `${name}-正式`, notes: '正式事实已更新' })
      .expect(200)

    const resumed = await authRequest(app, token)
      .post(`/api/agent/tasks/departure-creation/sessions`)
      .send({ taskId: opened.taskId, conversationId: opened.conversationId })
      .expect(201)
    expect(resumed.body.data.task).toMatchObject({
      id: opened.taskId,
      status: 'in_progress',
      departureId: confirmed.body.data.id,
      draft: { snapshot: { name: `${name}-正式`, notes: '正式事实已更新' } },
    })
  })

  it('does not let a still-claimed worker succeed the job or append progress after confirm', async () => {
    const name = `${testPrefix}-late-outcome`
    const opened = await openConfirmableSession(name)
    const sent = await authRequest(app, token)
      .post(`/api/agent/conversations/${opened.conversationId}/messages`)
      .set('Idempotency-Key', `${testPrefix}-late-send`)
      .field('text', '确认时 Worker 仍在跑')
      .field('primaryTaskId', opened.taskId)
      .expect(201)
    const batchId = sent.body.data.batch.id as string

    agent.holdNextCall()
    const running = processor.processDueJobs(5)
    try {
      await waitFor(async () => {
        const job = await prisma.aiWorkflowJob.findFirst({
          where: { inputBatchId: batchId, type: 'agent_batch' },
        })
        expect(job).toMatchObject({ status: 'claimed' })
      })

      await authRequest(app, token)
        .post(`/api/ai-create-tasks/${opened.taskId}/confirm`)
        .set('Idempotency-Key', `${testPrefix}-late-confirm`)
        .send({ expectedVersion: opened.draftVersion })
        .expect(201)

      expect(
        await prisma.aiWorkflowJob.findFirstOrThrow({
          where: { inputBatchId: batchId, type: 'agent_batch' },
        }),
      ).toMatchObject({ status: 'failed', lastErrorCode: 'DEPARTURE_CREATED' })
    } finally {
      agent.release()
      await running
    }

    const job = await prisma.aiWorkflowJob.findFirstOrThrow({
      where: { inputBatchId: batchId, type: 'agent_batch' },
    })
    expect(job).toMatchObject({ status: 'failed', lastErrorCode: 'DEPARTURE_CREATED' })
    expect(job.status).not.toBe('succeeded')

    const activities = await prisma.taskActivity.findMany({
      where: { taskId: opened.taskId },
      orderBy: { createdAt: 'asc' },
    })
    expect(activities.map((activity) => activity.kind)).toEqual(
      expect.arrayContaining(['business_object']),
    )
    expect(activities.some((activity) => activity.kind === 'progress' && activity.summary === 'Agent 已完成一轮推进')).toBe(
      false,
    )
    expect(activities.some((activity) => activity.kind === 'waiting')).toBe(false)
    expect(activities.some((activity) => activity.kind === 'completed')).toBe(false)
    expect((await prisma.agentTask.findUniqueOrThrow({ where: { id: opened.taskId } })).status).toBe(
      'active',
    )
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

import type { AddressInfo } from 'node:net'
import { createHash } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { DepartureType, PrismaClient } from '@prisma/client'
import { WORKFLOW_MAX_ATTEMPTS } from '../src/modules/ai-create-task/ai-conversation.constants'
import { AiWorkflowProcessor } from '../src/modules/ai-create-task/ai-workflow.processor'
import { authRequest, createTestApp, loginAs } from './helpers'
import { startDeterministicHeadlessAgent } from './support/deterministic-headless-agent'
import { startDeterministicParseWorker } from './support/deterministic-parse-worker'

const AGENT_SECRET = 'e2e-agent-service-secret'
const COMPLETED_MESSAGE = '已根据固定解析版本整理资料。'
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

describe('AI create material readiness barrier (e2e) #316', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let processor: AiWorkflowProcessor
  let coordinatorToken: string
  let ownerUserId: string
  let organizationId: string
  let agent: Awaited<ReturnType<typeof startDeterministicHeadlessAgent>>
  let ocr: Awaited<ReturnType<typeof startDeterministicParseWorker>>
  const testPrefix = `e2e-ai-material-${Date.now()}`

  beforeAll(async () => {
    let apiBaseUrl = ''
    process.env.AI_CREATE_ASSIST_ENABLED = 'true'
    process.env.AGENT_SERVICE_SECRET = AGENT_SECRET

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
    await prisma.departureMaterial.deleteMany({
      where: { organizationId, createdByUserId: ownerUserId },
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
      task: { id: string }
      conversation: { id: string }
    }
  }

  it('holds the Agent until attachments are archived, parsed, and pinned', async () => {
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id
    const userText = '这是团期资料，请按附件填写。'
    ocr.holdNextCall()

    const sent = await authRequest(app, coordinatorToken)
      .post(`/api/ai-create-tasks/${taskId}/conversations/${conversationId}/messages`)
      .set('Idempotency-Key', `e2e-material-${taskId}`)
      .field('text', userText)
      .attach('files', PNG_1X1, { filename: '团期.png', contentType: 'image/png' })
      .expect(201)

    expect(sent.body.data.batch.status).toBe('waiting_for_materials')
    expect(sent.body.data.batch.materialProgress).toEqual({ ready: 0, total: 1, failed: 0 })
    expect(sent.body.data.events.map((event: { kind: string }) => event.kind)).toEqual([
      'user_message',
      'batch_status',
    ])
    expect(sent.body.data.events[1]?.payload).toMatchObject({
      status: 'waiting_for_materials',
      readyCount: 0,
      totalCount: 1,
    })

    const materials = await prisma.departureMaterial.findMany({ where: { taskId } })
    expect(materials).toHaveLength(1)
    expect(materials[0]?.sha256).toBe(createHash('sha256').update(PNG_1X1).digest('hex'))
    expect(materials[0]?.status).toBe('queued')

    const parseJobs = await prisma.aiWorkflowJob.findMany({
      where: { taskId, type: 'material_parse' },
    })
    const agentJobs = await prisma.aiWorkflowJob.findMany({
      where: { taskId, type: 'agent_batch' },
    })
    expect(parseJobs).toHaveLength(1)
    expect(agentJobs).toHaveLength(0)

    const beforeParse = agent.callCount()
    const processing = processor.processDueJobs(1)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(agent.callCount()).toBe(beforeParse)
    expect(ocr.callCount()).toBe(1)

    ocr.release()
    await processing

    const afterParseJobs = await prisma.aiWorkflowJob.findMany({
      where: { taskId, type: 'agent_batch' },
    })
    const batch = await prisma.aiInputBatch.findFirstOrThrow({ where: { taskId } })
    expect(batch.status).toBe('ready_for_agent')
    expect(afterParseJobs).toHaveLength(1)
    expect(agent.callCount()).toBe(beforeParse)

    await processor.processDueJobs(1)
    expect(agent.callCount()).toBe(beforeParse + 1)

    const context = agent.lastTaskContext() as {
      data?: { materials?: Array<{ materialId: string; parseResultVersion: number }>; pages?: unknown }
    }
    expect(context.data?.materials).toEqual([
      {
        materialId: materials[0]?.id,
        parseResultVersion: 1,
      },
    ])
    expect(context.data).not.toHaveProperty('pages')
    expect(JSON.stringify(context)).not.toContain(PNG_1X1.toString('base64'))

    const restored = await authRequest(app, coordinatorToken)
      .post('/api/ai-create-tasks/assist-session')
      .send({ taskId })
      .expect(201)
    const kinds = restored.body.data.conversation.events.map((event: { kind: string }) => event.kind)
    expect(kinds).toEqual(expect.arrayContaining(['user_message', 'batch_status', 'agent_message']))
    const agentMessage = restored.body.data.conversation.events.find(
      (event: { kind: string }) => event.kind === 'agent_message',
    )
    expect(agentMessage?.payload).toMatchObject({ text: COMPLETED_MESSAGE })

    const listed = await authRequest(app, coordinatorToken)
      .get(`/api/ai-create-tasks/${taskId}/materials`)
      .expect(200)
    expect(listed.body.data).toHaveLength(1)
    expect(listed.body.data[0]).toMatchObject({
      id: materials[0]?.id,
      status: 'available',
      latestResultVersion: 1,
    })

    const preview = await authRequest(app, coordinatorToken)
      .get(`/api/ai-create-tasks/${taskId}/materials/${materials[0]?.id}/preview`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => callback(null, Buffer.concat(chunks)))
      })
      .expect(200)
    expect(Buffer.isBuffer(preview.body)).toBe(true)
    expect(preview.body.equals(PNG_1X1)).toBe(true)

    const draft = await authRequest(app, coordinatorToken)
      .post('/api/ai-create-tasks/draft')
      .send({
        taskId,
        expectedVersion: 1,
        draft: {
          mode: 'manual',
          routeName: `${testPrefix}-手填路线`,
          name: `${testPrefix}-团`,
          startDate: '2026-09-01',
          endDate: '2026-09-05',
          ownerUserId,
          departureType: DepartureType.combined,
        },
      })
      .expect(200)
    expect(draft.body.data.draft.snapshot.routeName).toBe(`${testPrefix}-手填路线`)
  })

  it('fails the input batch when OCR yields no usable text', async () => {
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id
    ocr.setPageText('   ')
    try {
      const sent = await authRequest(app, coordinatorToken)
        .post(`/api/ai-create-tasks/${taskId}/conversations/${conversationId}/messages`)
        .set('Idempotency-Key', `e2e-material-empty-${taskId}`)
        .field('text', '这是团期资料，请按附件填写。')
        .attach('files', PNG_1X1, { filename: '空白.png', contentType: 'image/png' })
        .expect(201)
      expect(sent.body.data.batch.status).toBe('waiting_for_materials')

      const beforeAgent = agent.callCount()
      await processor.processDueJobs(1)
      expect(agent.callCount()).toBe(beforeAgent)

      const batch = await prisma.aiInputBatch.findFirstOrThrow({ where: { taskId } })
      const material = await prisma.departureMaterial.findFirstOrThrow({ where: { taskId } })
      const parseJob = await prisma.aiWorkflowJob.findFirstOrThrow({
        where: { taskId, type: 'material_parse' },
      })
      const events = await prisma.aiConversationEvent.findMany({
        where: { conversationId },
        orderBy: { sequence: 'asc' },
      })
      expect(material.status).toBe('failed')
      expect(parseJob.status).toBe('failed')
      expect(parseJob.lastErrorCode).toBe('PARSE_FAILED')
      expect(batch.status).toBe('waiting_for_materials')
      expect(events.map((event) => event.kind)).toEqual(
        expect.arrayContaining(['user_message', 'batch_status', 'error']),
      )
      expect(events.map((event) => event.payload)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ errorCode: 'PARSE_FAILED' }),
          expect.objectContaining({
            status: 'waiting_for_materials',
            failedCount: 1,
          }),
        ]),
      )
    } finally {
      ocr.setPageText('九月川西线 预计 12 人')
    }
  })

  it('requeues parse when the same failed attachment is sent again', async () => {
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id
    ocr.setPageText('   ')
    try {
      const sent = await authRequest(app, coordinatorToken)
        .post(`/api/ai-create-tasks/${taskId}/conversations/${conversationId}/messages`)
        .set('Idempotency-Key', `e2e-material-resend-${taskId}`)
        .field('text', '这是团期资料，请按附件填写。')
        .attach('files', PNG_1X1, { filename: '空白.png', contentType: 'image/png' })
        .expect(201)
      expect(sent.body.data.batch.status).toBe('waiting_for_materials')

      await processor.processDueJobs(1)
      const failedJob = await prisma.aiWorkflowJob.findFirstOrThrow({
        where: { taskId, type: 'material_parse' },
      })
      expect(failedJob.status).toBe('failed')

      ocr.setPageText('九月川西线 预计 12 人')
      const retry = await authRequest(app, coordinatorToken)
        .post(`/api/ai-create-tasks/${taskId}/conversations/${conversationId}/messages`)
        .set('Idempotency-Key', `e2e-material-resend-retry-${taskId}`)
        .field('text', '同一份资料再发一次。')
        .attach('files', PNG_1X1, { filename: '空白.png', contentType: 'image/png' })
        .expect(201)
      expect(retry.body.data.batch.status).toBe('waiting_for_materials')
      expect(retry.body.data.batch.id).not.toBe(sent.body.data.batch.id)

      const parseJobs = await prisma.aiWorkflowJob.findMany({
        where: { taskId, type: 'material_parse' },
      })
      expect(parseJobs).toHaveLength(1)
      expect(parseJobs[0]).toMatchObject({
        status: 'pending',
        attemptCount: 0,
        inputBatchId: retry.body.data.batch.id,
        lastErrorCode: null,
      })

      const beforeAgent = agent.callCount()
      await processor.processDueJobs(1)
      expect(agent.callCount()).toBe(beforeAgent)

      const retryBatch = await prisma.aiInputBatch.findUniqueOrThrow({
        where: { id: retry.body.data.batch.id as string },
      })
      expect(retryBatch.status).toBe('ready_for_agent')
      const agentJobs = await prisma.aiWorkflowJob.findMany({
        where: { taskId, type: 'agent_batch' },
      })
      expect(agentJobs.length).toBeGreaterThanOrEqual(1)
    } finally {
      ocr.setPageText('九月川西线 预计 12 人')
    }
  })

  it('fails the input batch when parse retries are exhausted', async () => {
    const opened = await openSession()
    const taskId = opened.task.id
    const conversationId = opened.conversation.id

    const sent = await authRequest(app, coordinatorToken)
      .post(`/api/ai-create-tasks/${taskId}/conversations/${conversationId}/messages`)
      .set('Idempotency-Key', `e2e-material-exhausted-${taskId}`)
      .field('text', '这是团期资料，请按附件填写。')
      .attach('files', PNG_1X1, { filename: '超时.png', contentType: 'image/png' })
      .expect(201)
    expect(sent.body.data.batch.status).toBe('waiting_for_materials')

    await prisma.aiWorkflowJob.updateMany({
      where: { taskId, type: 'material_parse' },
      data: { attemptCount: WORKFLOW_MAX_ATTEMPTS },
    })

    const beforeOcr = ocr.callCount()
    const beforeAgent = agent.callCount()
    await processor.processDueJobs(1)
    expect(ocr.callCount()).toBe(beforeOcr)
    expect(agent.callCount()).toBe(beforeAgent)

    const batch = await prisma.aiInputBatch.findFirstOrThrow({ where: { taskId } })
    const material = await prisma.departureMaterial.findFirstOrThrow({ where: { taskId } })
    const parseJob = await prisma.aiWorkflowJob.findFirstOrThrow({
      where: { taskId, type: 'material_parse' },
    })
    expect(material.status).toBe('failed')
    expect(parseJob.status).toBe('failed')
    expect(parseJob.lastErrorCode).toBe('PARSE_FAILED')
    expect(batch.status).toBe('waiting_for_materials')
  })
})

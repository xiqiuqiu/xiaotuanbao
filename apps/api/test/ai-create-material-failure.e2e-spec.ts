import type { AddressInfo } from 'node:net'
import { createHash } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { DepartureType, PrismaClient } from '@prisma/client'
import type { AiInputBatchView } from '@xiaotuanbao/shared'
import { AiWorkflowProcessor } from '../src/modules/ai-create-task/ai-workflow.processor'
import { authRequest, createTestApp, loginAs } from './helpers'
import { startDeterministicHeadlessAgent } from './support/deterministic-headless-agent'
import { startDeterministicParseWorker } from './support/deterministic-parse-worker'

const AGENT_SECRET = 'e2e-agent-service-secret'
const COMPLETED_MESSAGE = '已根据固定解析版本整理资料。'
const PNG_OK = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const PNG_FAIL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

describe('AI create material failure control (e2e) #317', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let processor: AiWorkflowProcessor
  let coordinatorToken: string
  let ownerUserId: string
  let organizationId: string
  let agent: Awaited<ReturnType<typeof startDeterministicHeadlessAgent>>
  let ocr: Awaited<ReturnType<typeof startDeterministicParseWorker>>
  const testPrefix = `e2e-ai-fail-${Date.now()}`

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

  beforeEach(async () => {
    await prisma.aiWorkflowJob.updateMany({
      where: {
        organizationId,
        status: { in: ['pending', 'claimed'] },
      },
      data: {
        status: 'failed',
        lastErrorCode: 'E2E_ISOLATION',
        leaseExpiresAt: null,
      },
    })
  })

  afterEach(() => {
    ocr.setPageText('九月川西线 预计 12 人')
    agent.release()
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

  function batchPath(taskId: string, conversationId: string, batchId: string, action: string) {
    return `/api/ai-create-tasks/${taskId}/conversations/${conversationId}/batches/${batchId}/${action}`
  }

  async function sendTwoAttachments(taskId: string, conversationId: string, key: string) {
    ocr.queuePageTexts(['九月川西线 预计 12 人', '   '])
    return authRequest(app, coordinatorToken)
      .post(`/api/ai-create-tasks/${taskId}/conversations/${conversationId}/messages`)
      .set('Idempotency-Key', key)
      .field('text', '这是团期资料，请按附件填写。')
      .attach('files', PNG_OK, { filename: '可用.png', contentType: 'image/png' })
      .attach('files', PNG_FAIL, { filename: '空白.png', contentType: 'image/png' })
      .expect(201)
  }

  it('holds the batch for User decision when one required material fails', async () => {
    const opened = await openSession()
    const sent = await sendTwoAttachments(
      opened.task.id,
      opened.conversation.id,
      `e2e-fail-partial-${opened.task.id}`,
    )
    expect(sent.body.data.batch.status).toBe('waiting_for_materials')

    const beforeAgent = agent.callCount()
    await processor.processDueJobs(2)
    expect(agent.callCount()).toBe(beforeAgent)

    const batch = await prisma.aiInputBatch.findUniqueOrThrow({
      where: { id: sent.body.data.batch.id as string },
      include: { sources: { include: { source: true } } },
    })
    expect(batch.status).toBe('waiting_for_materials')
    const failed = batch.sources.find((item) => item.source.originalFilename === '空白.png')
    const ready = batch.sources.find((item) => item.source.originalFilename === '可用.png')
    expect(failed?.source.status).toBe('failed')
    expect(failed?.parseVersion).toBeNull()
    expect(ready?.parseVersion).toBe(1)

    const restored = await authRequest(app, coordinatorToken)
      .post('/api/ai-create-tasks/assist-session')
      .send({ taskId: opened.task.id })
      .expect(201)
    const view = restored.body.data.conversation.activeBatch as AiInputBatchView
    expect(view.status).toBe('waiting_for_materials')
    expect(view.materialProgress).toEqual({ ready: 1, total: 2, failed: 1 })
    expect(view.materials).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          originalFilename: '空白.png',
          status: 'failed',
          errorCode: 'PARSE_FAILED',
          errorMessage: '无法从该资料提取可用文字',
        }),
        expect.objectContaining({
          originalFilename: '可用.png',
          status: 'ready',
          parseResultVersion: 1,
        }),
      ]),
    )
    const errorEvent = restored.body.data.conversation.events.find(
      (event: { kind: string; payload: { materialId?: string } }) =>
        event.kind === 'error' && event.payload.materialId === failed?.sourceId,
    )
    expect(errorEvent?.payload).toMatchObject({
      errorCode: 'PARSE_FAILED',
      originalFilename: '空白.png',
    })
  })

  it('retries only the failed material and keeps the successful parse version', async () => {
    const opened = await openSession()
    const sent = await sendTwoAttachments(
      opened.task.id,
      opened.conversation.id,
      `e2e-fail-retry-${opened.task.id}`,
    )
    await processor.processDueJobs(2)
    const batchId = sent.body.data.batch.id as string
    const failed = await prisma.inputBatchSource.findFirstOrThrow({
      where: { inputBatchId: batchId, source: { originalFilename: '空白.png' } },
    })
    const ready = await prisma.inputBatchSource.findFirstOrThrow({
      where: { inputBatchId: batchId, source: { originalFilename: '可用.png' } },
    })
    const beforeOcr = ocr.callCount()
    const beforeAgent = agent.callCount()

    ocr.setPageText('九月川西线 预计 12 人')
    const retry = await authRequest(app, coordinatorToken)
      .post(batchPath(opened.task.id, opened.conversation.id, batchId, 'retry-failed-materials'))
      .set('Idempotency-Key', `e2e-retry-${opened.task.id}`)
      .send({ materialIds: [failed.sourceId] })
      .expect(200)
    expect(retry.body.data.batch.status).toBe('waiting_for_materials')
    expect(retry.body.data.batch.id).toBe(batchId)

    const replay = await authRequest(app, coordinatorToken)
      .post(batchPath(opened.task.id, opened.conversation.id, batchId, 'retry-failed-materials'))
      .set('Idempotency-Key', `e2e-retry-${opened.task.id}`)
      .send({ materialIds: [failed.sourceId] })
      .expect(200)
    expect(replay.body.data.batch.id).toBe(batchId)

    await processor.processDueJobs(1)
    expect(ocr.callCount()).toBe(beforeOcr + 1)
    expect(agent.callCount()).toBe(beforeAgent)

    const afterReady = await prisma.inputBatchSource.findUniqueOrThrow({
      where: { id: ready.id },
    })
    const afterFailed = await prisma.inputBatchSource.findUniqueOrThrow({
      where: { id: failed.id },
    })
    expect(afterReady.parseVersion).toBe(1)
    expect(afterFailed.parseVersion).toBe(2)
    const batch = await prisma.aiInputBatch.findUniqueOrThrow({ where: { id: batchId } })
    expect(batch.status).toBe('ready_for_agent')
    const parseRuns = await prisma.conversationSourceParseRun.findMany({
      where: { sourceId: failed.sourceId },
      orderBy: { resultVersion: 'asc' },
    })
    expect(parseRuns.map((run) => run.resultVersion)).toEqual([1, 2])
    expect(parseRuns[0]?.status).toBe('failed')
    expect(parseRuns[1]?.status).toBe('succeeded')
  })

  it('removes a failed dependency before Agent claim and continues with remaining materials', async () => {
    const opened = await openSession()
    const sent = await sendTwoAttachments(
      opened.task.id,
      opened.conversation.id,
      `e2e-fail-remove-${opened.task.id}`,
    )
    await processor.processDueJobs(2)
    const batchId = sent.body.data.batch.id as string
    const failed = await prisma.inputBatchSource.findFirstOrThrow({
      where: { inputBatchId: batchId, source: { originalFilename: '空白.png' } },
    })
    const materialId = failed.sourceId
    const beforeAgent = agent.callCount()

    const removed = await authRequest(app, coordinatorToken)
      .post(batchPath(opened.task.id, opened.conversation.id, batchId, 'remove-materials'))
      .set('Idempotency-Key', `e2e-remove-${opened.task.id}`)
      .send({ materialIds: [materialId] })
      .expect(200)
    expect(removed.body.data.batch.status).toBe('ready_for_agent')
    expect(removed.body.data.batch.materialProgress).toEqual({ ready: 1, total: 1, failed: 0 })

    const replay = await authRequest(app, coordinatorToken)
      .post(batchPath(opened.task.id, opened.conversation.id, batchId, 'remove-materials'))
      .set('Idempotency-Key', `e2e-remove-${opened.task.id}`)
      .send({ materialIds: [materialId] })
      .expect(200)
    expect(replay.body.data.batch.status).toBe('ready_for_agent')

    const remaining = await prisma.inputBatchSource.findMany({ where: { inputBatchId: batchId } })
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.sourceId).not.toBe(materialId)
    const archived = await prisma.conversationSource.findUniqueOrThrow({ where: { id: materialId } })
    expect(archived.id).toBe(materialId)
    expect(agent.callCount()).toBe(beforeAgent)

    await processor.processDueJobs(1)
    expect(agent.callCount()).toBe(beforeAgent + 1)
  })

  it('ignores a late parse completion after the waiting batch is abandoned', async () => {
    const opened = await openSession()
    ocr.holdNextCall()
    const sent = await authRequest(app, coordinatorToken)
      .post(`/api/ai-create-tasks/${opened.task.id}/conversations/${opened.conversation.id}/messages`)
      .set('Idempotency-Key', `e2e-fail-abandon-${opened.task.id}`)
      .field('text', '这是团期资料，请按附件填写。')
      .attach('files', PNG_OK, { filename: '迟到.png', contentType: 'image/png' })
      .expect(201)
    const batchId = sent.body.data.batch.id as string
    const processing = processor.processDueJobs(1)
    await new Promise((resolve) => setTimeout(resolve, 50))

    const abandoned = await authRequest(app, coordinatorToken)
      .post(batchPath(opened.task.id, opened.conversation.id, batchId, 'abandon'))
      .set('Idempotency-Key', `e2e-abandon-${opened.task.id}`)
      .send({})
      .expect(200)
    expect(abandoned.body.data.batch.status).toBe('cancelled')
    const replay = await authRequest(app, coordinatorToken)
      .post(batchPath(opened.task.id, opened.conversation.id, batchId, 'abandon'))
      .set('Idempotency-Key', `e2e-abandon-${opened.task.id}`)
      .send({})
      .expect(200)
    expect(replay.body.data.batch.status).toBe('cancelled')

    const beforeAgent = agent.callCount()
    ocr.release()
    await processing

    const batch = await prisma.aiInputBatch.findUniqueOrThrow({ where: { id: batchId } })
    expect(batch.status).toBe('cancelled')
    const material = await prisma.conversationSource.findFirstOrThrow({
      where: { conversationId: opened.conversation.id },
    })
    expect(material.status).toBe('available')
    const agentJobs = await prisma.aiWorkflowJob.findMany({
      where: { inputBatchId: batchId, type: 'agent_batch' },
    })
    expect(agentJobs).toHaveLength(0)
    expect(agent.callCount()).toBe(beforeAgent)
  })

  it('keeps a claimed batch pinned to the original parse version after a later reparse', async () => {
    const opened = await openSession()
    agent.holdNextCall()
    const sent = await authRequest(app, coordinatorToken)
      .post(`/api/ai-create-tasks/${opened.task.id}/conversations/${opened.conversation.id}/messages`)
      .set('Idempotency-Key', `e2e-fail-reparse-${opened.task.id}`)
      .field('text', '这是团期资料，请按附件填写。')
      .attach('files', PNG_OK, { filename: '固定.png', contentType: 'image/png' })
      .expect(201)
    const batchId = sent.body.data.batch.id as string
    await processor.processDueJobs(1)
    const running = processor.processDueJobs(1)
    await waitFor(async () => {
      const batch = await prisma.aiInputBatch.findUniqueOrThrow({ where: { id: batchId } })
      expect(batch.status).toBe('agent_running')
    })

    const dependency = await prisma.inputBatchSource.findFirstOrThrow({
      where: { inputBatchId: batchId },
    })
    expect(dependency.parseVersion).toBe(1)

    await prisma.conversationSourceParseRun.create({
      data: {
        organizationId,
        sourceId: dependency.sourceId,
        status: 'succeeded',
        resultVersion: 2,
        pages: [{ pageNumber: 1, source: 'ocr', text: '被重新解析的内容' }],
        parserVersions: { deterministic: '2' },
        endedAt: new Date(),
      },
    })
    await authRequest(app, coordinatorToken)
      .post(batchPath(opened.task.id, opened.conversation.id, batchId, 'remove-materials'))
      .set('Idempotency-Key', `e2e-reparse-remove-${opened.task.id}`)
      .send({ materialIds: [dependency.sourceId] })
      .expect(409)

    agent.release()
    await running

    const pinned = await prisma.inputBatchSource.findUniqueOrThrow({
      where: { id: dependency.id },
    })
    expect(pinned.parseVersion).toBe(1)
    const context = agent.lastTaskContext() as {
      data?: { materials?: Array<{ materialId: string; parseResultVersion: number }> }
    }
    expect(context.data).not.toHaveProperty('materials')
    expect(agent.lastUserText()).toContain(dependency.sourceId)
    expect(agent.lastUserText()).toContain('解析版本 1')
  })

  it('cancels the claimed attempt on stop so a new batch can reorganize input', async () => {
    const opened = await openSession()
    agent.holdNextCall()
    const sent = await authRequest(app, coordinatorToken)
      .post(`/api/ai-create-tasks/${opened.task.id}/conversations/${opened.conversation.id}/messages`)
      .set('Idempotency-Key', `e2e-fail-stop-${opened.task.id}`)
      .field('text', '这是团期资料，请按附件填写。')
      .attach('files', PNG_OK, { filename: '停止.png', contentType: 'image/png' })
      .expect(201)
    const batchId = sent.body.data.batch.id as string
    await processor.processDueJobs(1)
    const running = processor.processDueJobs(1)
    await waitFor(async () => {
      const attempt = await prisma.aiAgentAttempt.findFirst({
        where: { inputBatchId: batchId },
      })
      expect(attempt).toBeTruthy()
    })

    const stopped = await authRequest(app, coordinatorToken)
      .post(batchPath(opened.task.id, opened.conversation.id, batchId, 'stop'))
      .set('Idempotency-Key', `e2e-stop-${opened.task.id}`)
      .send({})
      .expect(200)
    expect(stopped.body.data.batch.status).toBe('cancelled')

    agent.release()
    await running

    const attempt = await prisma.aiAgentAttempt.findFirstOrThrow({
      where: { inputBatchId: batchId },
    })
    expect(attempt.status).toBe('failed')
    const batch = await prisma.aiInputBatch.findUniqueOrThrow({ where: { id: batchId } })
    expect(batch.status).toBe('cancelled')

    const next = await authRequest(app, coordinatorToken)
      .post(`/api/ai-create-tasks/${opened.task.id}/conversations/${opened.conversation.id}/messages`)
      .set('Idempotency-Key', `e2e-fail-stop-next-${opened.task.id}`)
      .send({ text: '改用文字说明：九月川西线 12 人。' })
      .expect(201)
    expect(next.body.data.batch.id).not.toBe(batchId)
    expect(next.body.data.batch.status).toBe('ready_for_agent')
  })

  it('reuses the same-task duplicate archive and keeps cross-task archives independent', async () => {
    const first = await openSession()
    await authRequest(app, coordinatorToken)
      .post(`/api/ai-create-tasks/${first.task.id}/conversations/${first.conversation.id}/messages`)
      .set('Idempotency-Key', `e2e-dup-first-${first.task.id}`)
      .field('text', '请根据附件整理。')
      .attach('files', PNG_OK, { filename: '团期.png', contentType: 'image/png' })
      .expect(201)
    await processor.processDueJobs(2)
    const firstMaterial = await prisma.conversationSource.findFirstOrThrow({
      where: { conversationId: first.conversation.id },
    })

    const duplicate = await authRequest(app, coordinatorToken)
      .post(`/api/ai-create-tasks/${first.task.id}/conversations/${first.conversation.id}/messages`)
      .set('Idempotency-Key', `e2e-dup-second-${first.task.id}`)
      .field('text', '同一份资料再发一次。')
      .attach('files', PNG_OK, { filename: '团期副本.png', contentType: 'image/png' })
      .expect(201)
    expect(duplicate.body.data.batch.status).toBe('ready_for_agent')
    expect(duplicate.body.data.batch.materials).toEqual([
      expect.objectContaining({
        materialId: firstMaterial.id,
        parseResultVersion: 1,
        status: 'ready',
      }),
    ])
    const sameTaskMaterials = await prisma.conversationSource.findMany({
      where: { conversationId: first.conversation.id },
    })
    expect(sameTaskMaterials).toHaveLength(1)
    expect(sameTaskMaterials[0]?.sha256).toBe(createHash('sha256').update(PNG_OK).digest('hex'))

    const second = await openSession()
    await authRequest(app, coordinatorToken)
      .post(`/api/ai-create-tasks/${second.task.id}/conversations/${second.conversation.id}/messages`)
      .set('Idempotency-Key', `e2e-dup-other-${second.task.id}`)
      .field('text', '另一任务上传同一原件。')
      .attach('files', PNG_OK, { filename: '团期.png', contentType: 'image/png' })
      .expect(201)
    const otherMaterial = await prisma.conversationSource.findFirstOrThrow({
      where: { conversationId: second.conversation.id },
    })
    expect(otherMaterial.id).not.toBe(firstMaterial.id)
    expect(otherMaterial.sha256).toBe(firstMaterial.sha256)
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

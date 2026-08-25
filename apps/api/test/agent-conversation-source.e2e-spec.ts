import { createHash } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { INestApplication } from '@nestjs/common'
import { DepartureType, PrismaClient } from '@prisma/client'
import { AiWorkflowProcessor } from '../src/modules/ai-create-task/ai-workflow.processor'
import { authRequest, createTestApp, loginAs } from './helpers'
import { startDeterministicHeadlessAgent } from './support/deterministic-headless-agent'
import { startDeterministicParseWorker } from './support/deterministic-parse-worker'

const AGENT_SECRET = 'e2e-agent-service-secret'
const COMPLETED_MESSAGE = '已根据冻结来源版本回答。'
const PARSE_TEXT = '九月川西线 预计 12 人'
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

describe('Conversation sources and formal attachments (e2e) #368', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let processor: AiWorkflowProcessor
  let coordinatorToken: string
  let ownerUserId: string
  let agent: Awaited<ReturnType<typeof startDeterministicHeadlessAgent>>
  let ocr: Awaited<ReturnType<typeof startDeterministicParseWorker>>
  const testPrefix = `e2e368-${Date.now()}`
  const createdIds: string[] = []
  const createdDepartureIds: string[] = []

  beforeAll(async () => {
    let apiBaseUrl = ''
    process.env.AI_CREATE_ASSIST_ENABLED = 'true'
    process.env.AGENT_SERVICE_SECRET = AGENT_SECRET
    process.env.AI_MODEL = 'deterministic'

    ocr = await startDeterministicParseWorker({ text: PARSE_TEXT })
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
    ownerUserId = user.id
  })

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.aiConversation.deleteMany({ where: { id: { in: createdIds } } })
    }
    if (createdDepartureIds.length > 0) {
      await prisma.departureMaterial.deleteMany({
        where: { departureId: { in: createdDepartureIds } },
      })
      await prisma.departure.deleteMany({ where: { id: { in: createdDepartureIds } } })
    }
    await prisma.$disconnect()
    await agent.close()
    await ocr.close()
    await app.close()
  })

  afterEach(() => {
    ocr.setPageText(PARSE_TEXT)
    agent.release()
  })

  function track(conversationId: string): string {
    createdIds.push(conversationId)
    return conversationId
  }

  it('parses an uploaded conversation source before the InputBatch runs', async () => {
    ocr.holdNextCall()
    const digest = createHash('sha256').update(PNG_1X1).digest('hex')
    const sent = await authRequest(app, coordinatorToken)
      .post('/api/agent/conversations/messages')
      .set('Idempotency-Key', `${testPrefix}-auto-parse`)
      .field('text', `${testPrefix} 请根据附件回答`)
      .attach('files', PNG_1X1, { filename: '团期.png', contentType: 'image/png' })
      .expect(201)

    const conversationId = track(sent.body.data.conversationId as string)
    expect(sent.body.data.batch.status).toBe('waiting_for_materials')
    expect(sent.body.data.batch.materialProgress).toEqual({ ready: 0, total: 1, failed: 0 })

    const listed = await authRequest(app, coordinatorToken)
      .get(`/api/agent/conversations/${conversationId}/sources`)
      .expect(200)
    expect(listed.body.data).toHaveLength(1)
    expect(listed.body.data[0]).toMatchObject({
      kind: 'upload',
      originalFilename: '团期.png',
      contentType: 'image/png',
      sha256: digest,
      status: 'queued',
    })
    const sourceId = listed.body.data[0].id as string

    const parseJobs = await prisma.aiWorkflowJob.findMany({
      where: { conversationId, type: 'material_parse' },
    })
    const agentJobs = await prisma.aiWorkflowJob.findMany({
      where: { conversationId, type: 'agent_batch' },
    })
    expect(parseJobs).toHaveLength(1)
    expect(agentJobs).toHaveLength(0)

    const beforeAgent = agent.callCount()
    const processing = processor.processDueJobs(1)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(agent.callCount()).toBe(beforeAgent)
    expect(ocr.callCount()).toBe(1)

    ocr.release()
    await processing

    const afterParse = await authRequest(app, coordinatorToken)
      .get(`/api/agent/conversations/${conversationId}/sources`)
      .expect(200)
    expect(afterParse.body.data[0]).toMatchObject({
      id: sourceId,
      status: 'available',
      latestParseVersion: 1,
    })

    const batch = await prisma.aiInputBatch.findFirstOrThrow({
      where: { conversationId },
    })
    expect(batch.status).toBe('ready_for_agent')

    const frozen = await prisma.$queryRaw<
      Array<{
        source_id: string
        parse_version: number
        content_digest: string
        locator: { kind: string; sha256: string }
      }>
    >`
      SELECT source_id, parse_version, content_digest, locator
      FROM input_batch_sources
      WHERE input_batch_id = ${batch.id}
    `
    expect(frozen).toEqual([
      {
        source_id: sourceId,
        parse_version: 1,
        content_digest: digest,
        locator: expect.objectContaining({ kind: 'upload', sha256: digest }),
      },
    ])

    await processor.processDueJobs(1)
    expect(agent.callCount()).toBe(beforeAgent + 1)

    const attempt = await prisma.aiAgentAttempt.findFirst({
      where: { conversationId },
      include: { contextManifest: true },
    })
    expect(attempt?.status).toBe('completed')
    const manifest = attempt?.contextManifest as { sourceVersions?: unknown; materialVersions?: unknown }
    expect(manifest.sourceVersions).toEqual([
      { sourceId, parseVersion: 1, contentDigest: digest },
    ])
    expect(agent.lastUserText()).toContain(sourceId)
    expect(agent.lastUserText()).toContain('解析版本 1')
  })

  it('keeps the InputBatch waiting when parse fails and does not start the Agent', async () => {
    ocr.setPageText('   ')
    const sent = await authRequest(app, coordinatorToken)
      .post('/api/agent/conversations/messages')
      .set('Idempotency-Key', `${testPrefix}-parse-fail`)
      .field('text', `${testPrefix} 解析失败`)
      .attach('files', PNG_1X1, { filename: '空白.png', contentType: 'image/png' })
      .expect(201)
    const conversationId = track(sent.body.data.conversationId as string)
    const beforeAgent = agent.callCount()
    await processor.processDueJobs(1)
    expect(agent.callCount()).toBe(beforeAgent)

    const listed = await authRequest(app, coordinatorToken)
      .get(`/api/agent/conversations/${conversationId}/sources`)
      .expect(200)
    expect(listed.body.data[0]).toMatchObject({ status: 'failed' })

    const batch = await prisma.aiInputBatch.findFirstOrThrow({ where: { conversationId } })
    expect(batch.status).toBe('waiting_for_materials')
  })

  it('does not leak conversation A sources into conversation B', async () => {
    const first = await authRequest(app, coordinatorToken)
      .post('/api/agent/conversations/messages')
      .set('Idempotency-Key', `${testPrefix}-iso-a`)
      .field('text', `${testPrefix} 会话A`)
      .attach('files', PNG_1X1, { filename: '团期.png', contentType: 'image/png' })
      .expect(201)
    const conversationA = track(first.body.data.conversationId as string)
    await processor.processDueJobs(2)

    const second = await authRequest(app, coordinatorToken)
      .post('/api/agent/conversations/messages')
      .set('Idempotency-Key', `${testPrefix}-iso-b`)
      .field('text', `${testPrefix} 会话B 无附件`)
      .expect(201)
    const conversationB = track(second.body.data.conversationId as string)

    const listedA = await authRequest(app, coordinatorToken)
      .get(`/api/agent/conversations/${conversationA}/sources`)
      .expect(200)
    const listedB = await authRequest(app, coordinatorToken)
      .get(`/api/agent/conversations/${conversationB}/sources`)
      .expect(200)
    expect(listedA.body.data).toHaveLength(1)
    expect(listedB.body.data).toEqual([])
  })

  it('registers a formal departure attachment only through an explicit domain command', async () => {
    const sent = await authRequest(app, coordinatorToken)
      .post('/api/agent/conversations/messages')
      .set('Idempotency-Key', `${testPrefix}-register`)
      .field('text', `${testPrefix} 待登记`)
      .attach('files', PNG_1X1, { filename: '团期.png', contentType: 'image/png' })
      .expect(201)
    const conversationId = track(sent.body.data.conversationId as string)
    await processor.processDueJobs(2)
    const listed = await authRequest(app, coordinatorToken)
      .get(`/api/agent/conversations/${conversationId}/sources`)
      .expect(200)
    const sourceId = listed.body.data[0].id as string

    const created = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name: `${testPrefix}-正式团`,
        routeName: `${testPrefix}-路线`,
        startDate: '2026-09-01',
        endDate: '2026-09-05',
        ownerUserId,
        departureType: DepartureType.combined,
      })
      .expect(201)
    const departureId = created.body.data.id as string
    createdDepartureIds.push(departureId)

    const beforeRegister = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departureId}/formal-attachments`)
      .expect(200)
    expect(beforeRegister.body.data).toEqual([])

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/formal-attachments`)
      .send({ sourceId, parseVersion: 99 })
      .expect(404)

    const registered = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/formal-attachments`)
      .send({ sourceId, parseVersion: 1 })
      .expect(201)
    expect(registered.body.data).toMatchObject({
      departureId,
      sourceId,
      parseVersion: 1,
      originalFilename: '团期.png',
    })

    const afterRegister = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departureId}/formal-attachments`)
      .expect(200)
    expect(afterRegister.body.data).toHaveLength(1)

    await prisma.aiConversation.deleteMany({ where: { id: conversationId } })
    const afterReset = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departureId}/formal-attachments`)
      .expect(200)
    expect(afterReset.body.data).toHaveLength(1)
    expect(afterReset.body.data[0].sourceId).toBeNull()
  })

  it('does not write a parallel task-owned material model', async () => {
    const sent = await authRequest(app, coordinatorToken)
      .post('/api/agent/conversations/messages')
      .set('Idempotency-Key', `${testPrefix}-no-task-model`)
      .field('text', `${testPrefix} 不再写任务资料`)
      .attach('files', PNG_1X1, { filename: '团期.png', contentType: 'image/png' })
      .expect(201)
    track(sent.body.data.conversationId as string)
    await processor.processDueJobs(1)

    const leftover = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT to_regclass('public.ai_input_batch_materials') IS NOT NULL AS exists
    `
    expect(leftover[0]?.exists).toBe(false)
    const taskOwned = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM information_schema.columns
      WHERE table_name = 'departure_materials' AND column_name = 'task_id'
    `
    expect(Number(taskOwned[0]?.count ?? 1)).toBe(0)
  })
})

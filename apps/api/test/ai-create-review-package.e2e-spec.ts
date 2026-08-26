import type { INestApplication } from '@nestjs/common'
import { DepartureType, PrismaClient } from '@prisma/client'
import request from 'supertest'
import { authRequest, createTestApp, loginAs } from './helpers'
import { mintRunningAttemptDelegation } from './support/worker-delegation'

const AGENT_SECRET = 'e2e-agent-service-secret'

describe('AI review package confirm-to-draft (e2e) #298', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let organizationId: string
  let ownerUserId: string
  const testPrefix = `e2e-ai-review-${Date.now()}`

  beforeAll(async () => {
    process.env.AI_CREATE_ASSIST_ENABLED = 'true'
    process.env.AGENT_SERVICE_SECRET = AGENT_SECRET
    process.env.AGENT_RUNTIME_URL = 'http://127.0.0.1:4111/copilotkit'

    app = await createTestApp()
    prisma = new PrismaClient()
    coordinatorToken = await loginAs(app, 'wangjie')
    financeToken = await loginAs(app, 'acai')

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
    await prisma.aiReviewRecord.deleteMany({
      where: { package: { task: { organizationId, ownerUserId } } },
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
    await app.close()
  })

  function agentSubmit(delegationToken: string, body: Record<string, unknown>, serviceKey = AGENT_SECRET) {
    return request(app.getHttpServer())
      .post('/api/ai-tools/v1/submit-review-package')
      .set('X-Agent-Service-Key', serviceKey)
      .set('Authorization', `Bearer ${delegationToken}`)
      .send(body)
  }

  function agentContext(delegationToken: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/api/ai-tools/v1/get-task-context')
      .set('X-Agent-Service-Key', AGENT_SECRET)
      .set('Authorization', `Bearer ${delegationToken}`)
      .send(body)
  }

  async function openTask() {
    const created = await authRequest(app, coordinatorToken)
      .post('/api/ai-create-tasks/draft')
      .send({
        draft: {
          mode: 'manual',
          routeName: `${testPrefix}-路线`,
          name: `${testPrefix}-原团名`,
          startDate: '2026-09-01',
          endDate: '2026-09-05',
          ownerUserId,
          departureType: DepartureType.combined,
          expectedGuestCountHint: 8,
        },
      })
      .expect(201)

    const taskId = created.body.data.id as string
    const version = created.body.data.draft.version as number
    const session = await authRequest(app, coordinatorToken)
      .post('/api/agent/tasks/departure-creation/sessions')
      .send({ taskId })
      .expect(201)

    const minted = await mintRunningAttemptDelegation({
      app,
      prisma,
      organizationId,
      userId: ownerUserId,
      taskId,
      conversationId: session.body.data.conversation.id as string,
    })

    return {
      taskId,
      version,
      runId: minted.runId,
      userMessageSequence: minted.userMessageSequence,
      delegationToken: minted.delegationToken,
    }
  }

  function nameCandidate(sequence: number) {
    return {
      fieldKey: 'name',
      proposedValue: `${testPrefix}-候选团名`,
      clarity: 'clear',
      evidence: [{ kind: 'user_message', sequence, excerpt: 'e2e worker-shaped attempt' }],
    }
  }

  it('persists a pending package without mutating the draft', async () => {
    const opened = await openTask()

    const submitted = await agentSubmit(opened.delegationToken, {
      taskId: opened.taskId,
      runId: opened.runId,
      objectVersion: opened.version,
      candidates: [nameCandidate(opened.userMessageSequence)],
    }).expect(200)

    expect(submitted.body.data).toMatchObject({
      status: 'pending',
      objectVersion: opened.version,
      fieldKeys: ['name'],
    })

    const after = await authRequest(app, coordinatorToken)
      .get(`/api/agent/tasks/${opened.taskId}`)
      .expect(200)

    expect(after.body.data.draft.version).toBe(opened.version)
    expect(after.body.data.draft.snapshot.name).toBe(`${testPrefix}-原团名`)
    expect(after.body.data.pendingReview).toMatchObject({
      id: submitted.body.data.reviewPackageId,
      status: 'pending',
      confirmationUnit: 'basic_info_draft',
      candidates: [
        {
          fieldKey: 'name',
          proposedValue: `${testPrefix}-候选团名`,
        },
      ],
    })
    expect(after.body.data.pendingReview.candidates[0].userCorrectedValue).toBeUndefined()

    const context = await agentContext(opened.delegationToken, {
      taskId: opened.taskId,
      runId: opened.runId,
    }).expect(200)
    expect(context.body.data.pending.hasPendingReview).toBe(true)
    expect(context.body.data.availableCapabilities).toEqual([
      'getTaskContext',
      'searchRouteTemplates',
      'getMaterialParseResult',
      'readConversationHistory',
      'readConversationSource',
    ])
  })

  it('allows a second independent proposal to coexist until one is confirmed', async () => {
    const opened = await openTask()
    const submitted = await agentSubmit(opened.delegationToken, {
      taskId: opened.taskId,
      runId: opened.runId,
      objectVersion: opened.version,
      candidates: [nameCandidate(opened.userMessageSequence)],
    }).expect(200)

    const second = await agentSubmit(opened.delegationToken, {
      taskId: opened.taskId,
      runId: opened.runId,
      objectVersion: opened.version,
      candidates: [
        {
          ...nameCandidate(opened.userMessageSequence),
          proposedValue: `${testPrefix}-另一条候选`,
        },
      ],
    }).expect(200)
    expect(second.body.data.reviewPackageId).not.toBe(submitted.body.data.reviewPackageId)

    const replayed = await agentSubmit(opened.delegationToken, {
      taskId: opened.taskId,
      runId: opened.runId,
      objectVersion: opened.version,
      candidates: [nameCandidate(opened.userMessageSequence)],
    }).expect(200)
    expect(replayed.body.data.reviewPackageId).toBe(submitted.body.data.reviewPackageId)

    const after = await authRequest(app, coordinatorToken)
      .get(`/api/agent/tasks/${opened.taskId}`)
      .expect(200)
    expect(after.body.data.pendingReviews).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: submitted.body.data.reviewPackageId, status: 'pending' }),
        expect.objectContaining({ id: second.body.data.reviewPackageId, status: 'pending' }),
      ]),
    )
    expect(after.body.data.draft.snapshot.name).toBe(`${testPrefix}-原团名`)
  })

  it('lets the user correct, reject, or confirm; only confirm writes the draft', async () => {
    const opened = await openTask()
    const submitted = await agentSubmit(opened.delegationToken, {
      taskId: opened.taskId,
      runId: opened.runId,
      objectVersion: opened.version,
      candidates: [nameCandidate(opened.userMessageSequence)],
    }).expect(200)
    const packageId = submitted.body.data.reviewPackageId as string

    const patched = await authRequest(app, coordinatorToken)
      .patch(`/api/agent/review-packages/${packageId}`)
      .send({ corrections: { name: `${testPrefix}-修正团名` } })
      .expect(200)
    expect(patched.body.data.draft.snapshot.name).toBe(`${testPrefix}-原团名`)
    expect(patched.body.data.pendingReview.candidates[0].userCorrectedValue).toBe(
      `${testPrefix}-修正团名`,
    )

    const rejectedOpened = await openTask()
    const rejectedSubmit = await agentSubmit(rejectedOpened.delegationToken, {
      taskId: rejectedOpened.taskId,
      runId: rejectedOpened.runId,
      objectVersion: rejectedOpened.version,
      candidates: [nameCandidate(rejectedOpened.userMessageSequence)],
    }).expect(200)
    const rejected = await authRequest(app, coordinatorToken)
      .post(
        `/api/agent/review-packages/${rejectedSubmit.body.data.reviewPackageId}/reject`,
      )
      .send({ expectedPackageVersion: 1 })
      .expect(200)
    expect(rejected.body.data.pendingReview).toBeNull()
    expect(rejected.body.data.draft.snapshot.name).toBe(`${testPrefix}-原团名`)
    expect(rejected.body.data.draft.version).toBe(rejectedOpened.version)

    const confirmed = await authRequest(app, coordinatorToken)
      .post(`/api/agent/review-packages/${packageId}/confirm`)
      .send({ expectedVersion: opened.version, expectedPackageVersion: 1 })
      .expect(200)

    expect(confirmed.body.data.pendingReview).toBeNull()
    expect(confirmed.body.data.draft.version).toBe(opened.version + 1)
    expect(confirmed.body.data.draft.snapshot.name).toBe(`${testPrefix}-修正团名`)
    expect(confirmed.body.data.draft.snapshot.ownerUserId).toBe(ownerUserId)
    expect(confirmed.body.data.draft.snapshot.departureType).toBe(DepartureType.combined)

    const records = await prisma.aiReviewRecord.findMany({
      where: { packageId },
    })
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      action: 'confirm',
      writeResult: 'success',
      operatorUserId: ownerUserId,
    })
  })

  it('lets the user clear a date and guest-count candidate through patch and confirm', async () => {
    const opened = await openTask()
    const submitted = await agentSubmit(opened.delegationToken, {
      taskId: opened.taskId,
      runId: opened.runId,
      objectVersion: opened.version,
      candidates: [
        {
          fieldKey: 'startDate',
          proposedValue: '2026-09-08',
          clarity: 'clear',
          evidence: [{ kind: 'user_message', sequence: opened.userMessageSequence, excerpt: 'e2e worker-shaped attempt' }],
        },
        {
          fieldKey: 'expectedGuestCountHint',
          proposedValue: 12,
          clarity: 'clear',
          evidence: [{ kind: 'user_message', sequence: opened.userMessageSequence, excerpt: 'e2e worker-shaped attempt' }],
        },
      ],
    }).expect(200)
    const packageId = submitted.body.data.reviewPackageId as string

    const patched = await authRequest(app, coordinatorToken)
      .patch(`/api/agent/review-packages/${packageId}`)
      .send({ corrections: { startDate: null, expectedGuestCountHint: null } })
      .expect(200)
    expect(patched.body.data.draft.snapshot.startDate).toBe('2026-09-01')
    expect(patched.body.data.draft.snapshot.expectedGuestCountHint).toBe(8)
    expect(patched.body.data.pendingReview.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldKey: 'startDate', userCorrectedValue: null }),
        expect.objectContaining({ fieldKey: 'expectedGuestCountHint', userCorrectedValue: null }),
      ]),
    )

    const confirmed = await authRequest(app, coordinatorToken)
      .post(`/api/agent/review-packages/${packageId}/confirm`)
      .send({
        expectedVersion: opened.version,
        expectedPackageVersion: 1,
        corrections: { startDate: null, expectedGuestCountHint: null },
      })
      .expect(200)

    expect(confirmed.body.data.pendingReview).toBeNull()
    expect(confirmed.body.data.draft.snapshot.startDate).toBeNull()
    expect(confirmed.body.data.draft.snapshot.expectedGuestCountHint).toBeNull()
    expect(confirmed.body.data.draft.snapshot.endDate).toBe('2026-09-05')
  })

  it('rejects stale candidates after overlapping draft changes and keeps them out of the draft', async () => {
    const opened = await openTask()
    const submitted = await agentSubmit(opened.delegationToken, {
      taskId: opened.taskId,
      runId: opened.runId,
      objectVersion: opened.version,
      candidates: [nameCandidate(opened.userMessageSequence)],
    }).expect(200)
    const packageId = submitted.body.data.reviewPackageId as string

    const saved = await authRequest(app, coordinatorToken)
      .post('/api/ai-create-tasks/draft')
      .send({
        taskId: opened.taskId,
        expectedVersion: opened.version,
        draft: {
          mode: 'manual',
          routeName: `${testPrefix}-路线`,
          name: `${testPrefix}-表单改名`,
          startDate: '2026-09-01',
          endDate: '2026-09-05',
          ownerUserId,
          departureType: DepartureType.combined,
        },
      })
      .expect(200)
    expect(saved.body.data.pendingReview.id).toBe(packageId)

    const conflict = await authRequest(app, coordinatorToken)
      .post(`/api/agent/review-packages/${packageId}/confirm`)
      .send({ expectedVersion: opened.version + 1, expectedPackageVersion: 1 })
      .expect(409)

    expect(conflict.body.message).toContain('目标版本已变化')
    expect(conflict.body.data.reviewConflict.status).toBe('stale_target_version')
    expect(conflict.body.data.reviewConflict.conflictFields).toEqual(
      expect.arrayContaining(['name']),
    )
    expect(conflict.body.data.draft.snapshot.name).toBe(`${testPrefix}-表单改名`)

    const after = await authRequest(app, coordinatorToken)
      .get(`/api/agent/tasks/${opened.taskId}`)
      .expect(200)
    expect(after.body.data.draft.snapshot.name).toBe(`${testPrefix}-表单改名`)
    expect(after.body.data.pendingReview).toBeNull()
  })

  it('forbids finance, rejects agent confirm, and does not write owner or type', async () => {
    const opened = await openTask()
    const submitted = await agentSubmit(opened.delegationToken, {
      taskId: opened.taskId,
      runId: opened.runId,
      objectVersion: opened.version,
      candidates: [nameCandidate(opened.userMessageSequence)],
    }).expect(200)
    const packageId = submitted.body.data.reviewPackageId as string

    await authRequest(app, financeToken)
      .post(`/api/agent/review-packages/${packageId}/confirm`)
      .send({ expectedVersion: opened.version, expectedPackageVersion: 1 })
      .expect(403)

    await request(app.getHttpServer())
      .post(`/api/agent/review-packages/${packageId}/confirm`)
      .set('Authorization', `Bearer ${opened.delegationToken}`)
      .set('Origin', 'http://localhost:5173')
      .send({ expectedVersion: opened.version, expectedPackageVersion: 1 })
      .expect(401)

    const invalid = await agentSubmit(opened.delegationToken, {
      taskId: opened.taskId,
      runId: opened.runId,
      objectVersion: opened.version,
      candidates: [
        {
          fieldKey: 'ownerUserId',
          proposedValue: ownerUserId,
          clarity: 'clear',
          evidence: [{ kind: 'user_message', sequence: opened.userMessageSequence, excerpt: 'e2e worker-shaped attempt' }],
        },
      ],
    })
    expect(invalid.status).toBe(422)
    expect(invalid.body.data).toMatchObject({ code: 'INVALID_FORMAT' })
  })
})

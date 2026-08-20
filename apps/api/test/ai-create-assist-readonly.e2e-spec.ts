import type { INestApplication } from '@nestjs/common'
import { DepartureType, PrismaClient } from '@prisma/client'
import request from 'supertest'
import { authRequest, createTestApp, loginAs } from './helpers'
import { mintRunningAttemptDelegation } from './support/worker-delegation'

const AGENT_SECRET = 'e2e-agent-service-secret'

describe('AI create readonly tool chain (e2e) #297', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let organizationId: string
  let ownerUserId: string
  const testPrefix = `e2e-ai-assist-${Date.now()}`

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
    await app.close()
  })

  function agentContextRequest(delegationToken: string, body: Record<string, unknown>, serviceKey = AGENT_SECRET) {
    return request(app.getHttpServer())
      .post('/api/ai-tools/v1/get-task-context')
      .set('X-Agent-Service-Key', serviceKey)
      .set('Authorization', `Bearer ${delegationToken}`)
      .send(body)
  }

  it('hides the assist entry from users without departure:write', async () => {
    const response = await authRequest(app, financeToken)
      .get('/api/ai-create-tasks/assist-availability')
      .expect(200)

    expect(response.body.data).toEqual({ enabled: false, agentRuntimeUrl: null })
  })

  it('lets a flagged coordinator open an assist session without a complete draft', async () => {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/ai-create-tasks/assist-session')
      .send({
        draft: {
          mode: 'manual',
          routeName: '',
          name: `${testPrefix}-partial`,
        },
      })
      .expect(201)

    expect(response.body.data).toMatchObject({
      task: {
        status: 'in_progress',
        currentPhase: 'basic_info',
        draft: {
          version: 1,
          snapshot: {
            name: `${testPrefix}-partial`,
            routeName: '',
          },
        },
      },
      conversation: {
        id: expect.any(String),
        status: 'open',
      },
    })
    expect(response.body.data).not.toHaveProperty('runId')
    expect(response.body.data).not.toHaveProperty('delegationToken')
    expect(response.body.data).not.toHaveProperty('agentRuntimeUrl')
    expect(response.body.data).not.toHaveProperty('expiresAt')
  })

  it('returns min task context, does not mutate the draft, and rejects untrusted callers', async () => {
    const created = await authRequest(app, coordinatorToken)
      .post('/api/ai-create-tasks/draft')
      .send({
        draft: {
          mode: 'manual',
          routeName: `${testPrefix}-路线`,
          name: `${testPrefix}-完整`,
          startDate: '2026-09-01',
          endDate: '2026-09-05',
          ownerUserId,
          departureType: DepartureType.combined,
          expectedGuestCountHint: 8,
        },
      })
      .expect(201)

    const taskId = created.body.data.id as string
    const versionBefore = created.body.data.draft.version as number

    const session = await authRequest(app, coordinatorToken)
      .post('/api/ai-create-tasks/assist-session')
      .send({ taskId })
      .expect(201)

    const conversationId = session.body.data.conversation.id as string
    const minted = await mintRunningAttemptDelegation({
      app,
      prisma,
      organizationId,
      userId: ownerUserId,
      taskId,
      conversationId,
    })
    const { runId, delegationToken } = minted

    await agentContextRequest(delegationToken, { taskId, runId, organizationId: 'leak' }).expect(200)
      .then((response) => {
        expect(response.body.data).toMatchObject({
          task: {
            id: taskId,
            status: 'in_progress',
            currentPhase: 'basic_info',
            creatorUserId: ownerUserId,
          },
          objectVersion: versionBefore,
          availableCapabilities: [
            'getTaskContext',
            'searchRouteTemplates',
            'submitReviewPackage',
            'getMaterialParseResult',
          ],
          pending: { hasPendingReview: false, reviewPackageId: null },
          fieldCoverage: {
            filled: ['name', 'routeName', 'startDate', 'endDate', 'ownerUserId', 'departureType'],
            missing: [],
            optionalPresent: ['expectedGuestCountHint'],
          },
        })
        expect(response.body.data).not.toHaveProperty('organizationId')
        expect(response.body.data.snapshot.name).toBe(`${testPrefix}-完整`)
      })

    const after = await authRequest(app, coordinatorToken)
      .get(`/api/ai-create-tasks/${taskId}`)
      .expect(200)
    expect(after.body.data.draft.version).toBe(versionBefore)
    expect(after.body.data.draft.snapshot.name).toBe(`${testPrefix}-完整`)

    const untrusted = await agentContextRequest(delegationToken, { taskId, runId }, 'wrong-secret')
    expect(untrusted.status).toBe(401)
    expect(untrusted.body.data).toMatchObject({ code: 'SERVICE_IDENTITY_INVALID' })

    const noDelegation = await request(app.getHttpServer())
      .post('/api/ai-tools/v1/get-task-context')
      .set('X-Agent-Service-Key', AGENT_SECRET)
      .send({ taskId, runId })
    expect(noDelegation.status).toBe(401)
    expect(noDelegation.body.data).toMatchObject({ code: 'DELEGATION_INVALID' })
  })

  it('rejects a delegation token replayed as an xtb_session cookie', async () => {
    const session = await authRequest(app, coordinatorToken)
      .post('/api/ai-create-tasks/assist-session')
      .send({
        draft: {
          mode: 'manual',
          routeName: '',
          name: `${testPrefix}-delegation-replay`,
        },
      })
      .expect(201)

    const minted = await mintRunningAttemptDelegation({
      app,
      prisma,
      organizationId,
      userId: ownerUserId,
      taskId: session.body.data.task.id as string,
      conversationId: session.body.data.conversation.id as string,
    })
    const { delegationToken } = minted

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', `xtb_session=${delegationToken}`)
      .expect(401)

    await request(app.getHttpServer())
      .post('/api/ai-create-tasks/draft')
      .set('Cookie', `xtb_session=${delegationToken}`)
      .set('Origin', 'http://localhost:5173')
      .send({ draft: { mode: 'manual', routeName: `${testPrefix}-escalation` } })
      .expect(401)
  })

  it('forbids finance from starting an assist session', async () => {
    await authRequest(app, financeToken)
      .post('/api/ai-create-tasks/assist-session')
      .send({ draft: { mode: 'manual', routeName: `${testPrefix}-finance` } })
      .expect(403)
  })
})

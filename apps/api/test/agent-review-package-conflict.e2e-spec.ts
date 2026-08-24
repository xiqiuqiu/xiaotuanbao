import type { INestApplication } from '@nestjs/common'
import { DepartureType, PrismaClient } from '@prisma/client'
import request from 'supertest'
import { authRequest, createTestApp, loginAs } from './helpers'
import { mintRunningAttemptDelegation } from './support/worker-delegation'

const AGENT_SECRET = 'e2e-agent-service-secret'

describe('Generic Review Package concurrent conflict (e2e) #367', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let organizationId: string
  let ownerUserId: string
  const testPrefix = `e2e-ai-review-367-${Date.now()}`
  const taskIds: string[] = []
  const conversationIds: string[] = []

  beforeAll(async () => {
    process.env.AI_CREATE_ASSIST_ENABLED = 'true'
    process.env.AGENT_SERVICE_SECRET = AGENT_SECRET
    process.env.AGENT_RUNTIME_URL = 'http://127.0.0.1:4111/copilotkit'

    app = await createTestApp()
    prisma = new PrismaClient()
    coordinatorToken = await loginAs(app, 'wangjie')
    financeToken = await loginAs(app, 'acai')
    const user = await prisma.user.findFirstOrThrow({
      where: { username: 'wangjie', deletedAt: null },
    })
    organizationId = user.organizationId
    ownerUserId = user.id
  })

  afterAll(async () => {
    if (taskIds.length > 0) {
      await prisma.aiReviewPackage.deleteMany({ where: { taskId: { in: taskIds } } })
    }
    if (conversationIds.length > 0) {
      await prisma.aiConversation.deleteMany({ where: { id: { in: conversationIds } } })
    }
    if (taskIds.length > 0) {
      await prisma.$executeRawUnsafe(
        'DELETE FROM "agent_tasks" WHERE "id" = ANY($1::text[])',
        taskIds,
      )
    }
    await prisma.$disconnect()
    await app.close()
  })

  function agentSubmit(delegationToken: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/api/ai-tools/v1/submit-review-package')
      .set('X-Agent-Service-Key', AGENT_SECRET)
      .set('Authorization', `Bearer ${delegationToken}`)
      .send(body)
  }

  async function openLinkedConversations() {
    const first = await authRequest(app, coordinatorToken)
      .post('/api/ai-create-tasks/assist-session')
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
    const second = await authRequest(app, coordinatorToken)
      .post('/api/ai-create-tasks/assist-session')
      .send({ draft: { mode: 'manual', routeName: `${testPrefix}-另一会话` } })
      .expect(201)

    const taskId = first.body.data.task.id as string
    const conversationA = first.body.data.conversation.id as string
    const conversationB = second.body.data.conversation.id as string
    taskIds.push(taskId, second.body.data.task.id as string)
    conversationIds.push(conversationA, conversationB)

    await authRequest(app, coordinatorToken)
      .post(`/api/agent/tasks/${taskId}/conversations/${conversationB}`)
      .send({ linkReason: 'continued' })
      .expect(201)

    const version = first.body.data.task.draft.version as number
    const mintedA = await mintRunningAttemptDelegation({
      app,
      prisma,
      organizationId,
      userId: ownerUserId,
      taskId,
      conversationId: conversationA,
    })
    const mintedB = await mintRunningAttemptDelegation({
      app,
      prisma,
      organizationId,
      userId: ownerUserId,
      taskId,
      conversationId: conversationB,
    })
    return { taskId, version, conversationA, conversationB, mintedA, mintedB }
  }

  function nameCandidate(value: string, excerpt: string) {
    return {
      fieldKey: 'name' as const,
      proposedValue: value,
      clarity: 'clear' as const,
      evidence: [{ kind: 'user_message' as const, sequence: 1, excerpt }],
    }
  }

  it('lets Conversation B propose while Conversation A is awaiting review', async () => {
    const opened = await openLinkedConversations()
    const packageA = await agentSubmit(opened.mintedA.delegationToken, {
      taskId: opened.taskId,
      runId: opened.mintedA.runId,
      objectVersion: opened.version,
      candidates: [nameCandidate(`${testPrefix}-A`, '会话A团名')],
    }).expect(200)
    const packageB = await agentSubmit(opened.mintedB.delegationToken, {
      taskId: opened.taskId,
      runId: opened.mintedB.runId,
      objectVersion: opened.version,
      candidates: [nameCandidate(`${testPrefix}-B`, '会话B团名')],
    }).expect(200)

    expect(packageA.body.data.reviewPackageId).not.toBe(packageB.body.data.reviewPackageId)

    const packages = await prisma.aiReviewPackage.findMany({
      where: { taskId: opened.taskId, status: 'pending' },
      select: {
        id: true,
        conversationId: true,
        inputBatchId: true,
        proposalHash: true,
        capabilityVersion: true,
        targetKind: true,
        targetId: true,
      },
    })
    expect(packages).toHaveLength(2)
    expect(new Set(packages.map((pkg) => pkg.conversationId))).toEqual(
      new Set([opened.conversationA, opened.conversationB]),
    )
    expect(packages.every((pkg) => pkg.proposalHash.length === 64)).toBe(true)
    expect(packages[0]?.targetId).toBe(packages[1]?.targetId)

    const after = await authRequest(app, coordinatorToken)
      .get(`/api/ai-create-tasks/${opened.taskId}`)
      .expect(200)
    expect(after.body.data.pendingReviews).toHaveLength(2)
    expect(after.body.data.draft.snapshot.name).toBe(`${testPrefix}-原团名`)
  })

  it('confirms the first proposal and returns a stable conflict for the stale one without partial writes', async () => {
    const opened = await openLinkedConversations()
    const packageA = await agentSubmit(opened.mintedA.delegationToken, {
      taskId: opened.taskId,
      runId: opened.mintedA.runId,
      objectVersion: opened.version,
      candidates: [nameCandidate(`${testPrefix}-先确认`, '先确认')],
    }).expect(200)
    const packageB = await agentSubmit(opened.mintedB.delegationToken, {
      taskId: opened.taskId,
      runId: opened.mintedB.runId,
      objectVersion: opened.version,
      candidates: [nameCandidate(`${testPrefix}-后冲突`, '后冲突')],
    }).expect(200)

    const confirmed = await authRequest(app, coordinatorToken)
      .post(
        `/api/ai-create-tasks/${opened.taskId}/review-packages/${packageA.body.data.reviewPackageId}/confirm`,
      )
      .send({
        expectedVersion: opened.version,
        expectedPackageVersion: 1,
      })
      .expect(200)
    expect(confirmed.body.data.draft.snapshot.name).toBe(`${testPrefix}-先确认`)
    expect(confirmed.body.data.draft.version).toBe(opened.version + 1)

    const conflict = await authRequest(app, coordinatorToken)
      .post(
        `/api/ai-create-tasks/${opened.taskId}/review-packages/${packageB.body.data.reviewPackageId}/confirm`,
      )
      .send({
        expectedVersion: opened.version + 1,
        expectedPackageVersion: 1,
      })
      .expect(409)
    expect(conflict.body.message).toContain('目标版本已变化')
    expect(conflict.body.data.reviewConflict.status).toBe('stale_target_version')
    expect(conflict.body.data.draft.snapshot.name).toBe(`${testPrefix}-先确认`)

    const stale = await prisma.aiReviewPackage.findFirstOrThrow({
      where: { id: packageB.body.data.reviewPackageId },
    })
    expect(stale.status).toBe('conflict')
    expect(stale.candidates).toEqual([
      expect.objectContaining({ proposedValue: `${testPrefix}-后冲突` }),
    ])

    const events = await prisma.aiConversationEvent.findMany({
      where: { conversationId: opened.conversationB, kind: 'batch_status' },
      orderBy: { sequence: 'desc' },
    })
    expect(events[0]?.payload).toEqual(
      expect.objectContaining({
        disposition: 'conflict',
        reviewPackageId: packageB.body.data.reviewPackageId,
      }),
    )

    const regenerated = await authRequest(app, coordinatorToken)
      .post(
        `/api/ai-create-tasks/${opened.taskId}/review-packages/${packageB.body.data.reviewPackageId}/regenerate`,
      )
      .expect(200)
    const original = await prisma.aiReviewPackage.findFirstOrThrow({
      where: { id: packageB.body.data.reviewPackageId },
    })
    expect(original.status).toBe('conflict')
    expect(original.proposalHash).toBe(stale.proposalHash)
    const newBatch = await prisma.aiInputBatch.findFirst({
      where: {
        conversationId: opened.conversationB,
        status: 'ready_for_agent',
      },
      orderBy: { createdAt: 'desc' },
    })
    expect(newBatch).not.toBeNull()
    expect(newBatch?.id).not.toBe(original.inputBatchId)
    expect(regenerated.body.data.draft.snapshot.name).toBe(`${testPrefix}-先确认`)
  })

  it('reuses the same confirm decision command and refuses after permission revoke without writing', async () => {
    const opened = await openLinkedConversations()
    const submitted = await agentSubmit(opened.mintedA.delegationToken, {
      taskId: opened.taskId,
      runId: opened.mintedA.runId,
      objectVersion: opened.version,
      candidates: [nameCandidate(`${testPrefix}-幂等`, '幂等确认')],
    }).expect(200)

    await authRequest(app, financeToken)
      .post(
        `/api/ai-create-tasks/${opened.taskId}/review-packages/${submitted.body.data.reviewPackageId}/confirm`,
      )
      .send({
        expectedVersion: opened.version,
        expectedPackageVersion: 1,
      })
      .expect(403)

    const stillPending = await prisma.aiReviewPackage.findFirstOrThrow({
      where: { id: submitted.body.data.reviewPackageId },
    })
    expect(stillPending.status).toBe('pending')

    const key = `e2e-367-confirm-${submitted.body.data.reviewPackageId}`
    const first = await authRequest(app, coordinatorToken)
      .post(
        `/api/ai-create-tasks/${opened.taskId}/review-packages/${submitted.body.data.reviewPackageId}/confirm`,
      )
      .set('Idempotency-Key', key)
      .send({
        expectedVersion: opened.version,
        expectedPackageVersion: 1,
        decisionCommandId: key,
      })
      .expect(200)
    const second = await authRequest(app, coordinatorToken)
      .post(
        `/api/ai-create-tasks/${opened.taskId}/review-packages/${submitted.body.data.reviewPackageId}/confirm`,
      )
      .set('Idempotency-Key', key)
      .send({
        expectedVersion: opened.version,
        expectedPackageVersion: 1,
        decisionCommandId: key,
      })
      .expect(200)
    expect(second.body.data.draft.version).toBe(first.body.data.draft.version)
    expect(second.body.data.draft.snapshot.name).toBe(`${testPrefix}-幂等`)

    const records = await prisma.aiReviewRecord.findMany({
      where: {
        packageId: submitted.body.data.reviewPackageId,
        writeResult: 'success',
      },
    })
    expect(records).toHaveLength(1)

    const cancelled = await agentSubmit(opened.mintedB.delegationToken, {
      taskId: opened.taskId,
      runId: opened.mintedB.runId,
      objectVersion: opened.version + 1,
      candidates: [nameCandidate(`${testPrefix}-取消项`, '取消等待')],
    }).expect(200)
    const taskBefore = await prisma.agentTask.findFirstOrThrow({ where: { id: opened.taskId } })
    await authRequest(app, coordinatorToken)
      .post(
        `/api/ai-create-tasks/${opened.taskId}/review-packages/${cancelled.body.data.reviewPackageId}/cancel`,
      )
      .send({ expectedPackageVersion: 1 })
      .expect(200)
    const cancelledPkg = await prisma.aiReviewPackage.findFirstOrThrow({
      where: { id: cancelled.body.data.reviewPackageId },
    })
    const taskAfter = await prisma.agentTask.findFirstOrThrow({ where: { id: opened.taskId } })
    const conversation = await prisma.aiConversation.findFirstOrThrow({
      where: { id: opened.conversationB },
    })
    expect(cancelledPkg.status).toBe('cancelled')
    expect(taskAfter.status).not.toBe('cancelled')
    expect(taskAfter.status).not.toBe('closed')
    expect(conversation.status).toBe('open')
    expect(taskAfter.id).toBe(taskBefore.id)
  })

  it('does not apply a missing template and leaves the original package pending', async () => {
    const opened = await openLinkedConversations()
    const submitted = await agentSubmit(opened.mintedA.delegationToken, {
      taskId: opened.taskId,
      runId: opened.mintedA.runId,
      objectVersion: opened.version,
      candidates: [
        {
          fieldKey: 'templateId',
          proposedValue: 'missing-template',
          clarity: 'clear',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '用这条常用路线' }],
        },
      ],
    }).expect(200)

    await authRequest(app, coordinatorToken)
      .post(
        `/api/ai-create-tasks/${opened.taskId}/review-packages/${submitted.body.data.reviewPackageId}/confirm`,
      )
      .send({
        expectedVersion: opened.version,
        expectedPackageVersion: 1,
      })
      .expect(400)

    const pkg = await prisma.aiReviewPackage.findFirstOrThrow({
      where: { id: submitted.body.data.reviewPackageId },
    })
    const draft = await prisma.departureCreationDraft.findFirstOrThrow({
      where: { taskId: opened.taskId },
    })
    expect(pkg.status).toBe('pending')
    expect(draft.version).toBe(opened.version)
    expect((draft.snapshot as { name?: string }).name).toBe(`${testPrefix}-原团名`)
  })
})

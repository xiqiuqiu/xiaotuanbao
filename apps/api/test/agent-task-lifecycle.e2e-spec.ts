import type { INestApplication } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { authRequest, createTestApp, loginAs } from './helpers'

describe('Generic AgentTask lifecycle (e2e) #366', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let token: string
  let organizationId: string
  let userId: string
  const taskIds: string[] = []
  const conversationIds: string[] = []

  beforeAll(async () => {
    process.env.AI_CREATE_ASSIST_ENABLED = 'true'
    app = await createTestApp()
    prisma = new PrismaClient()
    token = await loginAs(app, 'wangjie')
    const user = await prisma.user.findFirstOrThrow({ where: { username: 'wangjie' } })
    organizationId = user.organizationId
    userId = user.id
  })

  afterAll(async () => {
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

  it('creates a departure task as a shared-id AgentTask domain extension', async () => {
    const response = await authRequest(app, token)
      .post('/api/ai-create-tasks/assist-session')
      .send({ draft: { mode: 'manual', routeName: '' } })
      .expect(201)

    const taskId = response.body.data.task.id as string
    const conversationId = response.body.data.conversation.id as string
    taskIds.push(taskId)
    conversationIds.push(conversationId)

    const rows = await prisma.$queryRawUnsafe<
      Array<{
        id: string
        type: string
        status: string
        goal: string
        owner_user_id: string
        organization_id: string
        extension_id: string
      }>
    >(
      `SELECT t.id, t.type, t.status, t.goal, t.owner_user_id, t.organization_id,
              d.id AS extension_id
         FROM agent_tasks t
         JOIN ai_create_tasks d ON d.id = t.id
        WHERE t.id = $1`,
      taskId,
    )

    expect(rows).toEqual([
      expect.objectContaining({
        id: taskId,
        extension_id: taskId,
        type: 'departure_creation',
        status: 'active',
        owner_user_id: userId,
        organization_id: organizationId,
      }),
    ])
    expect(rows[0]?.goal).toContain('创建发团')
  })

  it('links multiple tasks to one conversation and continues one task from another conversation', async () => {
    const first = await authRequest(app, token)
      .post('/api/ai-create-tasks/assist-session')
      .send({ draft: { mode: 'manual', routeName: '川西' } })
      .expect(201)
    const second = await authRequest(app, token)
      .post('/api/ai-create-tasks/assist-session')
      .send({
        conversationId: first.body.data.conversation.id,
        draft: { mode: 'manual', routeName: '云南' },
      })
      .expect(201)
    const third = await authRequest(app, token)
      .post('/api/ai-create-tasks/assist-session')
      .send({ draft: { mode: 'manual', routeName: '西藏' } })
      .expect(201)
    const firstTaskId = first.body.data.task.id as string
    const secondTaskId = second.body.data.task.id as string
    const firstConversationId = first.body.data.conversation.id as string
    const secondConversationId = third.body.data.conversation.id as string
    taskIds.push(firstTaskId, secondTaskId, third.body.data.task.id as string)
    conversationIds.push(firstConversationId, secondConversationId)

    expect(second.body.data.conversation.id).toBe(firstConversationId)

    await authRequest(app, token)
      .post(`/api/agent/tasks/${secondTaskId}/conversations/${firstConversationId}`)
      .send({ linkReason: 'referenced' })
      .expect(201)
    await authRequest(app, token)
      .post(`/api/agent/tasks/${firstTaskId}/conversations/${secondConversationId}`)
      .send({ linkReason: 'continued' })
      .expect(201)

    const continued = await authRequest(app, token)
      .post(`/api/ai-create-tasks/${firstTaskId}/conversations/${secondConversationId}/messages`)
      .set('Idempotency-Key', `e2e366-cross-${Date.now()}`)
      .field('text', '从另一会话继续这个建团目标')
      .expect(201)

    const links = await prisma.conversationTaskLink.findMany({
      where: { conversationId: firstConversationId },
      orderBy: { linkedAt: 'asc' },
    })
    expect(links.map((link) => link.taskId)).toEqual(
      expect.arrayContaining([firstTaskId, secondTaskId]),
    )

    const batchLinks = await prisma.inputBatchTaskLink.findMany({
      where: { inputBatchId: continued.body.data.batch.id },
    })
    expect(batchLinks).toMatchObject([
      { taskId: firstTaskId, role: 'primary' },
    ])
  })

  it('keeps stop, waiting-item cancellation, and explicit task close as separate commands', async () => {
    const session = await authRequest(app, token)
      .post('/api/ai-create-tasks/assist-session')
      .send({ draft: { mode: 'manual', routeName: '新疆' } })
      .expect(201)
    const taskId = session.body.data.task.id as string
    const conversationId = session.body.data.conversation.id as string
    taskIds.push(taskId)
    conversationIds.push(conversationId)

    const first = await authRequest(app, token)
      .post(`/api/ai-create-tasks/${taskId}/conversations/${conversationId}/messages`)
      .set('Idempotency-Key', `e2e366-stop-send-${Date.now()}`)
      .field('text', '先停止这一次运行')
      .expect(201)
    await authRequest(app, token)
      .post(
        `/api/ai-create-tasks/${taskId}/conversations/${conversationId}/batches/${first.body.data.batch.id}/stop`,
      )
      .set('Idempotency-Key', `e2e366-stop-${Date.now()}`)
      .expect(200)
    expect((await prisma.agentTask.findUniqueOrThrow({ where: { id: taskId } })).status).toBe(
      'active',
    )

    const second = await authRequest(app, token)
      .post(`/api/ai-create-tasks/${taskId}/conversations/${conversationId}/messages`)
      .set('Idempotency-Key', `e2e366-wait-send-${Date.now()}`)
      .field('text', '制造一个等待项')
      .expect(201)
    const lastEvent = await prisma.aiConversationEvent.findFirstOrThrow({
      where: { conversationId },
      orderBy: { sequence: 'desc' },
    })
    const promptEvent = await prisma.aiConversationEvent.create({
      data: {
        organizationId,
        conversationId,
        sequence: lastEvent.sequence + 1,
        kind: 'agent_message',
        payload: { text: '请补充信息' },
      },
    })
    const interaction = await prisma.aiConversationInteraction.create({
      data: {
        organizationId,
        conversationId,
        inputBatchId: second.body.data.batch.id,
        eventId: promptEvent.id,
        type: 'free_text',
        prompt: '请补充信息',
        responseSchema: { type: 'string' },
      },
    })
    await prisma.aiInputBatch.update({
      where: { id: second.body.data.batch.id },
      data: { status: 'awaiting_user_input' },
    })
    await authRequest(app, token)
      .post(
        `/api/ai-create-tasks/${taskId}/conversations/${conversationId}/interactions/${interaction.id}/cancel`,
      )
      .set('Idempotency-Key', `e2e366-cancel-wait-${Date.now()}`)
      .send({ version: 1 })
      .expect(200)
    expect((await prisma.agentTask.findUniqueOrThrow({ where: { id: taskId } })).status).toBe(
      'active',
    )

    const third = await authRequest(app, token)
      .post(`/api/ai-create-tasks/${taskId}/conversations/${conversationId}/messages`)
      .set('Idempotency-Key', `e2e366-close-send-${Date.now()}`)
      .field('text', '关闭整个任务')
      .expect(201)
    const action = await prisma.aiAction.create({
      data: {
        organizationId,
        userId,
        taskId,
        conversationId,
        inputBatchId: third.body.data.batch.id,
        name: 'departure.test.write',
        kind: 'write',
        decision: 'allow',
        reasonCode: 'TEST',
        inputHash: `e2e366-${Date.now()}`,
        replayKey: `e2e366-${Date.now()}-${Math.random()}`,
      },
    })

    await authRequest(app, token)
      .post(`/api/agent/tasks/${taskId}/close`)
      .send({ expectedStatusVersion: 1 })
      .expect(200)

    expect(await prisma.agentTask.findUniqueOrThrow({ where: { id: taskId } })).toMatchObject({
      status: 'closed',
      statusVersion: 2,
    })
    expect(
      await prisma.aiConversation.findUniqueOrThrow({ where: { id: conversationId } }),
    ).toMatchObject({ status: 'open' })
    expect(await prisma.aiInputBatch.findUniqueOrThrow({ where: { id: third.body.data.batch.id } })).toMatchObject({ status: 'cancelled' })
    expect(
      await prisma.aiWorkflowJob.findFirstOrThrow({
        where: { inputBatchId: third.body.data.batch.id, type: 'agent_batch' },
      }),
    ).toMatchObject({ status: 'failed', generation: 1, lastErrorCode: 'TASK_CLOSED' })
    expect(await prisma.aiAction.findUniqueOrThrow({ where: { id: action.id } })).toMatchObject({
      executionStatus: 'skipped',
    })
    await authRequest(app, token)
      .post(`/api/agent/tasks/${taskId}/cancel`)
      .send({ expectedStatusVersion: 2 })
      .expect(409)
  })

  it('cancels a task without deleting its conversation', async () => {
    const session = await authRequest(app, token)
      .post('/api/ai-create-tasks/assist-session')
      .send({ draft: { mode: 'manual', routeName: '取消任务' } })
      .expect(201)
    const taskId = session.body.data.task.id as string
    const conversationId = session.body.data.conversation.id as string
    taskIds.push(taskId)
    conversationIds.push(conversationId)

    await authRequest(app, token)
      .post(`/api/agent/tasks/${taskId}/cancel`)
      .send({ expectedStatusVersion: 1 })
      .expect(200)

    expect(await prisma.agentTask.findUniqueOrThrow({ where: { id: taskId } })).toMatchObject({
      status: 'cancelled',
      statusVersion: 2,
    })
    await expect(
      prisma.aiConversation.findUniqueOrThrow({ where: { id: conversationId } }),
    ).resolves.toMatchObject({ status: 'open' })
    await expect(
      prisma.taskActivity.findFirstOrThrow({ where: { taskId, kind: 'cancelled' } }),
    ).resolves.toMatchObject({ summary: '任务已由 User 取消' })
  })
})

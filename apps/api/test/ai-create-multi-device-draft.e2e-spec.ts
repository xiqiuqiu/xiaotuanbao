import type { INestApplication } from '@nestjs/common'
import { DepartureType, PrismaClient } from '@prisma/client'
import { authRequest, createTestApp, loginAs } from './helpers'

describe('AI create multi-device conversation draft (e2e) #320', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let ownerToken: string
  let ownerPhoneToken: string
  let peerToken: string
  let organizationId: string
  let ownerUserId: string
  const testPrefix = `e2e-ai-draft-${Date.now()}`

  beforeAll(async () => {
    process.env.AI_CREATE_ASSIST_ENABLED = 'true'
    app = await createTestApp()
    prisma = new PrismaClient()
    ownerToken = await loginAs(app, 'wangjie')
    ownerPhoneToken = await loginAs(app, 'wangjie')
    peerToken = await loginAs(app, 'mazong')
    const owner = await prisma.user.findFirstOrThrow({
      where: { username: 'wangjie', deletedAt: null },
    })
    organizationId = owner.organizationId
    ownerUserId = owner.id
  })

  afterAll(async () => {
    await prisma.aiConversation.deleteMany({
      where: { organizationId, creatorUserId: ownerUserId },
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

  async function openSession() {
    const response = await authRequest(app, ownerToken)
      .post('/api/agent/tasks/departure-creation/sessions')
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
      conversation: {
        id: string
        events: unknown[]
        draft: { text: string; draftEpoch: number; revision: number }
      }
    }
  }

  function saveDraft(
    sessionCookie: string,
    _taskId: string,
    conversationId: string,
    text: string,
    draftEpoch: number,
  ) {
    return authRequest(app, sessionCookie)
      .put(`/api/agent/conversations/${conversationId}/draft`)
      .send({ text, draftEpoch })
  }

  async function readNextSseEvent(
    _taskId: string,
    conversationId: string,
    afterSequence: number,
  ): Promise<{ id: number; data: { sequence: number } }> {
    const abort = new AbortController()
    const timeout = setTimeout(() => abort.abort(), 5_000)
    try {
      const response = await fetch(
        `${await app.getUrl()}/api/agent/conversations/${conversationId}/stream`,
        {
          headers: {
            Cookie: ownerPhoneToken,
            'Last-Event-ID': String(afterSequence),
          },
          signal: abort.signal,
        },
      )
      expect(response.status).toBe(200)
      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('SSE 响应缺少 body')
      }
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) {
          throw new Error('SSE 在事件到达前结束')
        }
        buffer += decoder.decode(chunk.value, { stream: true })
        const boundary = buffer.indexOf('\n\n')
        if (boundary < 0) {
          continue
        }
        const frame = buffer.slice(0, boundary)
        const id = Number(frame.match(/^id: (\d+)$/m)?.[1])
        const data = frame.match(/^data: (.+)$/m)?.[1]
        if (Number.isInteger(id) && data) {
          return { id, data: JSON.parse(data) as { sequence: number } }
        }
      }
    } finally {
      clearTimeout(timeout)
      abort.abort()
    }
  }

  it('converges two signed-in clients by server receive order without creating draft events', async () => {
    const opened = await openSession()
    const { id: taskId } = opened.task
    const { id: conversationId } = opened.conversation
    expect(opened.conversation.draft).toMatchObject({ text: '', draftEpoch: 0, revision: 0 })

    const [fromComputer, fromPhone] = await Promise.all([
      saveDraft(ownerToken, taskId, conversationId, '电脑上的完整草稿', 0).expect(200),
      saveDraft(ownerPhoneToken, taskId, conversationId, '手机上的完整草稿', 0).expect(200),
    ])
    const winner = [fromComputer.body.data, fromPhone.body.data].sort(
      (left, right) => right.revision - left.revision,
    )[0]
    expect(winner).toMatchObject({ conversationId, draftEpoch: 0, revision: 2 })

    const [computerView, phoneView] = await Promise.all([
      authRequest(app, ownerToken)
        .get(`/api/agent/conversations/${conversationId}/events`)
        .expect(200),
      authRequest(app, ownerPhoneToken)
        .get(`/api/agent/conversations/${conversationId}/events`)
        .expect(200),
    ])
    for (const view of [computerView, phoneView]) {
      expect(view.body.data.events).toEqual([])
      expect(view.body.data.draft).toMatchObject(winner)
    }
  })

  it('clears the draft and advances draftEpoch atomically with send', async () => {
    const opened = await openSession()
    const { id: taskId } = opened.task
    const { id: conversationId } = opened.conversation
    await saveDraft(ownerToken, taskId, conversationId, '准备发送的文本', 0).expect(200)

    const sent = await authRequest(app, ownerToken)
      .post(`/api/agent/conversations/${conversationId}/messages`)
      .set('Idempotency-Key', `e2e-draft-send-${taskId}`)
      .send({ text: '准备发送的文本', primaryTaskId: taskId })
      .expect(201)

    expect(sent.body.data.draft).toMatchObject({ text: '', draftEpoch: 1, revision: 2 })
    const resumed = await readNextSseEvent(taskId, conversationId, 1)
    expect(resumed.id).toBe(2)
    expect(resumed.data.sequence).toBe(2)
    const entryState = await authRequest(app, ownerToken)
      .get(`/api/agent/tasks/${taskId}/runtime-state`)
      .expect(200)
    expect(entryState.body.data).toMatchObject({ status: 'ai_processing' })
    await saveDraft(ownerPhoneToken, taskId, conversationId, '旧 epoch 延迟到达', 0).expect(409)

    const listed = await authRequest(app, ownerToken)
      .get(`/api/agent/conversations/${conversationId}/events`)
      .expect(200)
    expect(listed.body.data.draft).toMatchObject({ text: '', draftEpoch: 1, revision: 2 })
    expect(listed.body.data.events.some((event: { payload?: { text?: string } }) =>
      event.payload?.text === '旧 epoch 延迟到达',
    )).toBe(false)
  })

  it('keeps another same-organization departure writer out of the draft', async () => {
    const opened = await openSession()
    const { id: taskId } = opened.task
    const { id: conversationId } = opened.conversation

    await authRequest(app, peerToken)
      .put(`/api/agent/conversations/${conversationId}/draft`)
      .send({ text: '不应写入', draftEpoch: 0 })
      .expect(403)
    await authRequest(app, peerToken)
      .get(`/api/agent/conversations/${conversationId}/events`)
      .expect(403)
    await authRequest(app, peerToken)
      .get(`/api/agent/tasks/${taskId}/runtime-state`)
      .expect(403)
  })
})

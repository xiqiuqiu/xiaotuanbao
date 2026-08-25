import type { INestApplication } from '@nestjs/common'
import {
  AiConversationEventKind,
  AiConversationStatus,
  PrismaClient,
} from '@prisma/client'
import { authRequest, createTestApp, loginAs } from './helpers'

type HistoryItem = {
  id: string
  title: string
  status: string
  lastActivityAt: string
  activityGroup: 'today' | 'yesterday' | 'last_7_days' | 'earlier'
}

type HistoryPage = {
  items: HistoryItem[]
  nextCursor: string | null
}

describe('Agent conversation history (e2e) #369', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let peerToken: string
  let organizationId: string
  let ownerUserId: string
  let peerUserId: string
  const testPrefix = `e2e369-${Date.now()}`
  const createdIds: string[] = []

  beforeAll(async () => {
    app = await createTestApp()
    prisma = new PrismaClient()
    coordinatorToken = await loginAs(app, 'wangjie')
    peerToken = await loginAs(app, 'mazong')

    const owner = await prisma.user.findFirst({
      where: { username: 'wangjie', deletedAt: null },
    })
    const peer = await prisma.user.findFirst({
      where: { username: 'mazong', deletedAt: null },
    })
    if (!owner || !peer) {
      throw new Error('Seed users wangjie/mazong not found')
    }
    organizationId = owner.organizationId
    ownerUserId = owner.id
    peerUserId = peer.id
  })

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.aiConversation.deleteMany({ where: { id: { in: createdIds } } })
    }
    await prisma.$disconnect()
    await app.close()
  })

  function track(id: string): string {
    createdIds.push(id)
    return id
  }

  async function createOwnedConversation(params: {
    title: string
    userMessage?: string
    agentMessage?: string
    status?: AiConversationStatus
    lastActivityAt: Date
    creatorUserId?: string
  }): Promise<string> {
    const creatorUserId = params.creatorUserId ?? ownerUserId
    const conversation = await prisma.aiConversation.create({
      data: {
        organizationId,
        creatorUserId,
        title: params.title,
        titleSource: 'first_message',
        status: params.status ?? AiConversationStatus.open,
        lastActivityAt: params.lastActivityAt,
      },
    })
    track(conversation.id)
    const events = []
    if (params.userMessage) {
      events.push({
        organizationId,
        conversationId: conversation.id,
        sequence: 1,
        kind: AiConversationEventKind.user_message,
        payload: { text: params.userMessage },
      })
    }
    if (params.agentMessage) {
      events.push({
        organizationId,
        conversationId: conversation.id,
        sequence: events.length + 1,
        kind: AiConversationEventKind.agent_message,
        payload: { text: params.agentMessage },
      })
    }
    if (events.length > 0) {
      await prisma.aiConversationEvent.createMany({ data: events })
    }
    return conversation.id
  }

  function listHistory(
    token: string,
    query: {
      q?: string
      includeArchived?: boolean
      cursor?: string
      limit?: number
    } = {},
  ) {
    return authRequest(app, token).get('/api/agent/conversations').query(query)
  }

  it('lists only the current user conversations and hides other users', async () => {
    const newer = await createOwnedConversation({
      title: `${testPrefix} 所有者较新`,
      userMessage: `${testPrefix} 所有者正文`,
      lastActivityAt: new Date('2026-08-25T10:00:00.000Z'),
    })
    const older = await createOwnedConversation({
      title: `${testPrefix} 所有者较旧`,
      lastActivityAt: new Date('2026-08-24T10:00:00.000Z'),
    })
    const peerConversation = await createOwnedConversation({
      title: `${testPrefix} 同事会话`,
      creatorUserId: peerUserId,
      lastActivityAt: new Date('2026-08-25T12:00:00.000Z'),
    })

    const listed = await listHistory(coordinatorToken, { q: testPrefix }).expect(200)
    const page = listed.body.data as HistoryPage
    expect(page.items.map((item) => item.id)).toEqual([newer, older])
    expect(page.items.every((item) => item.status === 'open')).toBe(true)
    expect(page.nextCursor).toBeNull()

    const peerListed = await listHistory(peerToken, { q: testPrefix }).expect(200)
    expect(peerListed.body.data.items.map((item: HistoryItem) => item.id)).toEqual([
      peerConversation,
    ])

    await authRequest(app, peerToken).get(`/api/agent/conversations/${newer}`).expect(403)
    await authRequest(app, coordinatorToken)
      .post(`/api/agent/conversations/${peerConversation}/archive`)
      .expect(403)
  })

  it('searches title and user message body but not agent replies', async () => {
    const byTitle = await createOwnedConversation({
      title: `${testPrefix} 标题含有独有词青城山`,
      userMessage: `${testPrefix} 普通正文`,
      lastActivityAt: new Date('2026-08-23T08:00:00.000Z'),
    })
    const byBody = await createOwnedConversation({
      title: `${testPrefix} 普通标题`,
      userMessage: `${testPrefix} 正文提到独有词都江堰`,
      lastActivityAt: new Date('2026-08-23T07:00:00.000Z'),
    })
    await createOwnedConversation({
      title: `${testPrefix} 只有回复`,
      userMessage: `${testPrefix} 不相关提问`,
      agentMessage: `${testPrefix} Agent 回复里有青城山`,
      lastActivityAt: new Date('2026-08-23T06:00:00.000Z'),
    })

    const titleHits = await listHistory(coordinatorToken, { q: '青城山' }).expect(200)
    expect(titleHits.body.data.items.map((item: HistoryItem) => item.id)).toEqual([byTitle])

    const bodyHits = await listHistory(coordinatorToken, { q: '都江堰' }).expect(200)
    expect(bodyHits.body.data.items.map((item: HistoryItem) => item.id)).toEqual([byBody])
  })

  it('hides archived conversations until explicitly requested and can restore them', async () => {
    const openId = await createOwnedConversation({
      title: `${testPrefix} 仍开放`,
      lastActivityAt: new Date('2026-08-22T09:00:00.000Z'),
    })
    const toArchive = await createOwnedConversation({
      title: `${testPrefix} 将被归档`,
      lastActivityAt: new Date('2026-08-22T08:00:00.000Z'),
    })

    await authRequest(app, coordinatorToken)
      .post(`/api/agent/conversations/${toArchive}/archive`)
      .expect(200)

    const hidden = await listHistory(coordinatorToken, { q: `${testPrefix} 将被归档` }).expect(200)
    expect(hidden.body.data.items).toEqual([])

    const archived = await listHistory(coordinatorToken, {
      q: testPrefix,
      includeArchived: true,
    }).expect(200)
    const archivedIds = archived.body.data.items.map((item: HistoryItem) => item.id)
    expect(archivedIds).toContain(openId)
    expect(archivedIds).toContain(toArchive)
    expect(
      archived.body.data.items.find((item: HistoryItem) => item.id === toArchive)?.status,
    ).toBe('archived')

    await authRequest(app, coordinatorToken)
      .post(`/api/agent/conversations/${toArchive}/unarchive`)
      .expect(200)

    const restored = await listHistory(coordinatorToken, { q: `${testPrefix} 将被归档` }).expect(200)
    expect(restored.body.data.items.map((item: HistoryItem) => item.id)).toEqual([toArchive])
    expect(restored.body.data.items[0]?.status).toBe('open')
  })

  it('pages by last activity cursor in a stable order', async () => {
    const first = await createOwnedConversation({
      title: `${testPrefix} 分页甲`,
      lastActivityAt: new Date('2026-08-21T12:00:00.000Z'),
    })
    const second = await createOwnedConversation({
      title: `${testPrefix} 分页乙`,
      lastActivityAt: new Date('2026-08-21T11:00:00.000Z'),
    })
    const third = await createOwnedConversation({
      title: `${testPrefix} 分页丙`,
      lastActivityAt: new Date('2026-08-21T10:00:00.000Z'),
    })

    const page1 = await listHistory(coordinatorToken, { q: `${testPrefix} 分页`, limit: 2 }).expect(
      200,
    )
    expect(page1.body.data.items.map((item: HistoryItem) => item.id)).toEqual([first, second])
    expect(page1.body.data.nextCursor).toEqual(expect.any(String))

    const page2 = await listHistory(coordinatorToken, {
      q: `${testPrefix} 分页`,
      limit: 2,
      cursor: page1.body.data.nextCursor,
    }).expect(200)
    expect(page2.body.data.items.map((item: HistoryItem) => item.id)).toEqual([third])
    expect(page2.body.data.nextCursor).toBeNull()
  })

  it('does not list a blank unsent session', async () => {
    const before = await listHistory(coordinatorToken, { q: `${testPrefix}-blank` }).expect(200)
    expect(before.body.data.items).toEqual([])
    await authRequest(app, coordinatorToken).get('/api/agent/conversations/does-not-exist').expect(404)
  })
})

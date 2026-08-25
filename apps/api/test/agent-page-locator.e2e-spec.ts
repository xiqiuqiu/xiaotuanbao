import type { INestApplication } from '@nestjs/common'
import {
  DirectoryProfileStatus,
  PartnerKind,
  PartnerType,
  PrismaClient,
} from '@prisma/client'
import { hash } from 'bcryptjs'
import { PageLocatorResolver } from '../src/modules/ai-create-task/page-locator.resolver'
import { authRequest, createTestApp, loginAs, uniqueBusinessPrefix } from './helpers'

describe('Agent page locator (e2e) #371', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let resolver: PageLocatorResolver
  let coordinatorToken: string
  let noMenuToken: string
  let organizationId: string
  let ownerUserId: string
  let partnerId: string
  let partnerName: string
  let noMenuUsername: string
  const testPrefix = `e2e371-${Date.now()}`
  const createdIds: string[] = []
  const createdPartnerIds: string[] = []
  const createdOrgIds: string[] = []

  beforeAll(async () => {
    app = await createTestApp()
    prisma = new PrismaClient()
    resolver = app.get(PageLocatorResolver)
    coordinatorToken = await loginAs(app, 'wangjie')

    const user = await prisma.user.findFirst({
      where: { username: 'wangjie', deletedAt: null },
    })
    if (!user) {
      throw new Error('Seed user wangjie not found')
    }
    organizationId = user.organizationId
    ownerUserId = user.id

    const partner = await prisma.partner.create({
      data: {
        organizationId,
        name: `${testPrefix}-页面伙伴`,
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.group_agency,
        status: DirectoryProfileStatus.active,
      },
    })
    partnerId = partner.id
    partnerName = partner.name
    createdPartnerIds.push(partner.id)

    noMenuUsername = `${testPrefix}-nomenu`.toLowerCase()
    await prisma.user.create({
      data: {
        organizationId,
        username: noMenuUsername,
        passwordHash: await hash('admin123', 10),
        name: '无菜单测试员',
      },
    })
    noMenuToken = await loginAs(app, noMenuUsername)
  })

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.aiConversation.deleteMany({ where: { id: { in: createdIds } } })
    }
    if (noMenuUsername) {
      await prisma.user.deleteMany({ where: { username: noMenuUsername } })
    }
    if (createdPartnerIds.length > 0) {
      await prisma.partner.deleteMany({ where: { id: { in: createdPartnerIds } } })
    }
    if (createdOrgIds.length > 0) {
      await prisma.organization.deleteMany({ where: { id: { in: createdOrgIds } } })
    }
    await prisma.$disconnect()
    await app.close()
  })

  function track(conversationId: string): string {
    createdIds.push(conversationId)
    return conversationId
  }

  function sendFirst(
    token: string,
    text: string,
    idempotencyKey: string,
    pageLocator?: Record<string, unknown>,
  ) {
    return authRequest(app, token)
      .post('/api/agent/conversations/messages')
      .set('Idempotency-Key', idempotencyKey)
      .send({ text, ...(pageLocator ? { pageLocator } : {}) })
  }

  it('freezes a valid partner locator onto the InputBatch and rereads current facts', async () => {
    const sent = await sendFirst(coordinatorToken, `${testPrefix} 查当前合作伙伴`, `${testPrefix}-ok`, {
      kind: 'partner',
      objectId: partnerId,
      section: 'accounts',
    }).expect(201)
    const conversationId = track(sent.body.data.conversationId as string)
    expect(sent.body.data.batch.pageLocator).toEqual({
      kind: 'partner',
      objectId: partnerId,
      section: 'accounts',
    })

    const batch = await prisma.aiInputBatch.findUniqueOrThrow({
      where: { id: sent.body.data.batch.id as string },
    })
    expect(batch.pageLocator).toEqual({
      kind: 'partner',
      objectId: partnerId,
      section: 'accounts',
    })

    const firstRead = await resolver.resolve(organizationId, ownerUserId, batch.pageLocator)
    expect(firstRead?.facts).toMatchObject({
      kind: 'partner',
      objectId: partnerId,
      name: partnerName,
    })

    const renamed = `${partnerName}-改名`
    await prisma.partner.update({
      where: { id: partnerId },
      data: { name: renamed },
    })
    partnerName = renamed

    const follow = await authRequest(app, coordinatorToken)
      .post(`/api/agent/conversations/${conversationId}/messages`)
      .set('Idempotency-Key', `${testPrefix}-changed`)
      .send({
        text: `${testPrefix} 再读一次`,
        pageLocator: { kind: 'partner', objectId: partnerId, section: 'accounts' },
      })
      .expect(201)
    const secondBatch = await prisma.aiInputBatch.findUniqueOrThrow({
      where: { id: follow.body.data.batch.id as string },
    })
    expect(secondBatch.pageLocator).toEqual(batch.pageLocator)
    const secondRead = await resolver.resolve(organizationId, ownerUserId, secondBatch.pageLocator)
    expect(secondRead?.facts).toMatchObject({ name: renamed })
    expect(secondRead?.objectVersion).toBeGreaterThan(firstRead?.objectVersion ?? 0)
  })

  it('rejects a forged locator before creating an InputBatch', async () => {
    const before = await prisma.aiConversation.count({
      where: { organizationId, creatorUserId: ownerUserId, taskLinks: { none: {} } },
    })
    const forged = await sendFirst(coordinatorToken, `${testPrefix} 伪造`, `${testPrefix}-forged`, {
      kind: 'invoice',
      objectId: 'inv-1',
      html: '<main />',
    })
    expect(forged.status).toBe(400)
    expect(forged.body.message).toMatch(/locator|页面|不支持/i)
    const after = await prisma.aiConversation.count({
      where: { organizationId, creatorUserId: ownerUserId, taskLinks: { none: {} } },
    })
    expect(after).toBe(before)
  })

  it('rejects a missing object and a cross-organization locator', async () => {
    await sendFirst(coordinatorToken, `${testPrefix} 不存在`, `${testPrefix}-missing`, {
      kind: 'partner',
      objectId: 'missing-partner',
    }).expect(400)

    const otherOrg = await prisma.organization.create({
      data: {
        name: `${testPrefix}-other-org`,
        businessPrefix: uniqueBusinessPrefix(`${testPrefix}-x`),
      },
    })
    createdOrgIds.push(otherOrg.id)
    const foreign = await prisma.partner.create({
      data: {
        organizationId: otherOrg.id,
        name: `${testPrefix}-外组织伙伴`,
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.group_agency,
        status: DirectoryProfileStatus.active,
      },
    })
    createdPartnerIds.push(foreign.id)

    await sendFirst(coordinatorToken, `${testPrefix} 跨组织`, `${testPrefix}-cross`, {
      kind: 'partner',
      objectId: foreign.id,
    }).expect(400)
  })

  it('rejects a locator the current User cannot read', async () => {
    await sendFirst(noMenuToken, `${testPrefix} 无菜单`, `${testPrefix}-denied`, {
      kind: 'partner',
      objectId: partnerId,
      section: 'accounts',
    }).expect(403)
  })
})

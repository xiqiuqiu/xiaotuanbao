import type { INestApplication } from '@nestjs/common'
import { DirectoryProfileStatus, PartnerKind, PartnerType } from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { authRequest, createTestApp, loginAs } from './helpers'

describe('Partner API (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let organizationId: string
  const testPartnerPrefix = `e2e-partner-${Date.now()}`

  beforeAll(async () => {
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
  })

  afterAll(async () => {
    await prisma.partner.deleteMany({
      where: {
        organizationId,
        name: { startsWith: testPartnerPrefix },
      },
    })
    await prisma.$disconnect()
    await app.close()
  })

  it('returns 403 for finance role without /partner permission', async () => {
    const response = await authRequest(app, financeToken).get('/api/partners').expect(403)

    expect(response.body.code).toBe(403)
    expect(response.body.message).toBe('无权访问')
  })

  it('returns 403 for finance role on POST /partners', async () => {
    const response = await authRequest(app, financeToken)
      .post('/api/partners')
      .send({
        name: `${testPartnerPrefix}-finance-blocked`,
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.local_agency,
      })
      .expect(403)

    expect(response.body.code).toBe(403)
  })

  it('lists partners excluding archived by default', async () => {
    const visibleName = `${testPartnerPrefix}-visible`
    const archivedName = `${testPartnerPrefix}-archived`

    await prisma.partner.createMany({
      data: [
        {
          organizationId,
          name: visibleName,
          partnerKind: PartnerKind.group_agent,
          partnerType: PartnerType.group_agency,
          status: DirectoryProfileStatus.active,
        },
        {
          organizationId,
          name: archivedName,
          partnerKind: PartnerKind.peer,
          partnerType: PartnerType.local_agency,
          status: DirectoryProfileStatus.archived,
        },
      ],
    })

    const response = await authRequest(app, coordinatorToken)
      .get('/api/partners')
      .query({ search: testPartnerPrefix, pageSize: 50 })
      .expect(200)

    const names = response.body.data.items.map((item: { name: string }) => item.name)
    expect(names).toContain(visibleName)
    expect(names).not.toContain(archivedName)
  })

  it('lists archived partners when includeArchived=true', async () => {
    const archivedName = `${testPartnerPrefix}-include-archived`

    await prisma.partner.create({
      data: {
        organizationId,
        name: archivedName,
        partnerKind: PartnerKind.peer,
        partnerType: PartnerType.local_agency,
        status: DirectoryProfileStatus.archived,
      },
    })

    const response = await authRequest(app, coordinatorToken)
      .get('/api/partners')
      .query({ search: archivedName, includeArchived: true })
      .expect(200)

    const names = response.body.data.items.map((item: { name: string }) => item.name)
    expect(names).toContain(archivedName)
  })

  it('returns summary counts for active partners by kind', async () => {
    const prefix = `${testPartnerPrefix}-summary`

    const beforeResponse = await authRequest(app, coordinatorToken)
      .get('/api/partners')
      .query({ pageSize: 1 })
      .expect(200)

    const before = beforeResponse.body.data.summary

    await prisma.partner.createMany({
      data: [
        {
          organizationId,
          name: `${prefix}-group-agent`,
          partnerKind: PartnerKind.group_agent,
          partnerType: PartnerType.group_agency,
          status: DirectoryProfileStatus.active,
        },
        {
          organizationId,
          name: `${prefix}-peer`,
          partnerKind: PartnerKind.peer,
          partnerType: PartnerType.local_agency,
          status: DirectoryProfileStatus.active,
        },
        {
          organizationId,
          name: `${prefix}-both`,
          partnerKind: PartnerKind.both,
          partnerType: PartnerType.wholesaler,
          status: DirectoryProfileStatus.active,
        },
        {
          organizationId,
          name: `${prefix}-disabled`,
          partnerKind: PartnerKind.group_agent,
          partnerType: PartnerType.other,
          status: DirectoryProfileStatus.disabled,
        },
        {
          organizationId,
          name: `${prefix}-archived`,
          partnerKind: PartnerKind.peer,
          partnerType: PartnerType.other,
          status: DirectoryProfileStatus.archived,
        },
      ],
    })

    const response = await authRequest(app, coordinatorToken)
      .get('/api/partners')
      .query({ pageSize: 1 })
      .expect(200)

    const summary = response.body.data.summary
    expect(summary.total).toBe(before.total + 3)
    expect(summary.groupAgent).toBe(before.groupAgent + 1)
    expect(summary.peer).toBe(before.peer + 1)
    expect(summary.both).toBe(before.both + 1)
    expect(summary.total).toBe(summary.groupAgent + summary.peer + summary.both)
  })

  it('filters partners by partnerKind', async () => {
    const prefix = `${testPartnerPrefix}-kind-filter`

    await prisma.partner.createMany({
      data: [
        {
          organizationId,
          name: `${prefix}-group-agent`,
          partnerKind: PartnerKind.group_agent,
          partnerType: PartnerType.group_agency,
          status: DirectoryProfileStatus.active,
        },
        {
          organizationId,
          name: `${prefix}-peer`,
          partnerKind: PartnerKind.peer,
          partnerType: PartnerType.local_agency,
          status: DirectoryProfileStatus.active,
        },
      ],
    })

    const response = await authRequest(app, coordinatorToken)
      .get('/api/partners')
      .query({ search: prefix, partnerKind: PartnerKind.peer, pageSize: 50 })
      .expect(200)

    expect(response.body.data.items).toHaveLength(1)
    expect(response.body.data.items[0].name).toBe(`${prefix}-peer`)
  })

  it('filters partners by partnerType', async () => {
    const prefix = `${testPartnerPrefix}-type-filter`

    await prisma.partner.createMany({
      data: [
        {
          organizationId,
          name: `${prefix}-group-agency`,
          partnerKind: PartnerKind.group_agent,
          partnerType: PartnerType.group_agency,
          status: DirectoryProfileStatus.active,
        },
        {
          organizationId,
          name: `${prefix}-wholesaler`,
          partnerKind: PartnerKind.peer,
          partnerType: PartnerType.wholesaler,
          status: DirectoryProfileStatus.active,
        },
      ],
    })

    const response = await authRequest(app, coordinatorToken)
      .get('/api/partners')
      .query({ search: prefix, partnerType: PartnerType.wholesaler, pageSize: 50 })
      .expect(200)

    expect(response.body.data.items).toHaveLength(1)
    expect(response.body.data.items[0].name).toBe(`${prefix}-wholesaler`)
  })

  it('filters partners by status', async () => {
    const prefix = `${testPartnerPrefix}-status-filter`

    await prisma.partner.createMany({
      data: [
        {
          organizationId,
          name: `${prefix}-active`,
          partnerKind: PartnerKind.group_agent,
          partnerType: PartnerType.group_agency,
          status: DirectoryProfileStatus.active,
        },
        {
          organizationId,
          name: `${prefix}-disabled`,
          partnerKind: PartnerKind.peer,
          partnerType: PartnerType.local_agency,
          status: DirectoryProfileStatus.disabled,
        },
      ],
    })

    const response = await authRequest(app, coordinatorToken)
      .get('/api/partners')
      .query({ search: prefix, status: DirectoryProfileStatus.disabled, pageSize: 50 })
      .expect(200)

    expect(response.body.data.items).toHaveLength(1)
    expect(response.body.data.items[0].name).toBe(`${prefix}-disabled`)
  })

  it('creates partner with name, partnerKind and partnerType', async () => {
    const name = `${testPartnerPrefix}-create`

    const response = await authRequest(app, coordinatorToken)
      .post('/api/partners')
      .send({
        name,
        partnerKind: PartnerKind.both,
        partnerType: PartnerType.wholesaler,
      })
      .expect(201)

    expect(response.body.data).toMatchObject({
      name,
      partnerKind: PartnerKind.both,
      partnerType: PartnerType.wholesaler,
      status: DirectoryProfileStatus.active,
    })
  })

  it('returns 400 when required fields are missing', async () => {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/partners')
      .send({ name: `${testPartnerPrefix}-missing-fields` })
      .expect(400)

    expect(response.body.code).toBe(400)
  })

  it('returns 409 when partner name duplicates in same organization', async () => {
    const name = `${testPartnerPrefix}-duplicate`

    await authRequest(app, coordinatorToken)
      .post('/api/partners')
      .send({
        name,
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.group_agency,
      })
      .expect(201)

    const response = await authRequest(app, coordinatorToken)
      .post('/api/partners')
      .send({
        name,
        partnerKind: PartnerKind.peer,
        partnerType: PartnerType.local_agency,
      })
      .expect(409)

    expect(response.body.code).toBe(409)
    expect(response.body.message).toBe('合作伙伴名称已存在')
  })

  it('gets partner by id with full profile', async () => {
    const createResponse = await authRequest(app, coordinatorToken)
      .post('/api/partners')
      .send({
        name: `${testPartnerPrefix}-get-by-id`,
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.integrated_agency,
        contactName: '张经理',
        contactPhone: '13800138000',
      })
      .expect(201)

    const partnerId = createResponse.body.data.id as string

    const response = await authRequest(app, coordinatorToken)
      .get(`/api/partners/${partnerId}`)
      .expect(200)

    expect(response.body.data).toMatchObject({
      id: partnerId,
      name: `${testPartnerPrefix}-get-by-id`,
      partnerKind: PartnerKind.group_agent,
      partnerType: PartnerType.integrated_agency,
      contactName: '张经理',
      contactPhone: '13800138000',
    })
  })

  it('returns 404 when partner does not belong to current organization', async () => {
    const otherOrg = await prisma.organization.create({
      data: { name: `${testPartnerPrefix}-other-org` },
    })

    const foreignPartner = await prisma.partner.create({
      data: {
        organizationId: otherOrg.id,
        name: `${testPartnerPrefix}-foreign`,
        partnerKind: PartnerKind.peer,
        partnerType: PartnerType.other,
        status: DirectoryProfileStatus.active,
      },
    })

    const response = await authRequest(app, coordinatorToken)
      .get(`/api/partners/${foreignPartner.id}`)
      .expect(404)

    expect(response.body.code).toBe(404)

    await prisma.partner.delete({ where: { id: foreignPartner.id } })
    await prisma.organization.delete({ where: { id: otherOrg.id } })
  })

  it('updates partner fields via PATCH', async () => {
    const createResponse = await authRequest(app, coordinatorToken)
      .post('/api/partners')
      .send({
        name: `${testPartnerPrefix}-patch`,
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.group_agency,
      })
      .expect(201)

    const partnerId = createResponse.body.data.id as string

    const response = await authRequest(app, coordinatorToken)
      .patch(`/api/partners/${partnerId}`)
      .send({
        name: `${testPartnerPrefix}-patch-updated`,
        partnerKind: PartnerKind.peer,
        partnerType: PartnerType.local_agency,
        status: DirectoryProfileStatus.disabled,
        contactName: '李经理',
        contactPhone: '13900139000',
        settlementMethod: 'postpay',
        paymentTermRule: 'monthly',
        settlementNotes: '月结 30 天',
      })
      .expect(200)

    expect(response.body.data).toMatchObject({
      name: `${testPartnerPrefix}-patch-updated`,
      partnerKind: PartnerKind.peer,
      partnerType: PartnerType.local_agency,
      status: DirectoryProfileStatus.disabled,
      contactName: '李经理',
      contactPhone: '13900139000',
      settlementMethod: 'postpay',
      paymentTermRule: 'monthly',
      settlementNotes: '月结 30 天',
    })
  })

  it('returns 409 when PATCH renames to an existing partner name', async () => {
    const firstName = `${testPartnerPrefix}-patch-conflict-a`
    const secondName = `${testPartnerPrefix}-patch-conflict-b`

    await authRequest(app, coordinatorToken)
      .post('/api/partners')
      .send({
        name: firstName,
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.group_agency,
      })
      .expect(201)

    const second = await authRequest(app, coordinatorToken)
      .post('/api/partners')
      .send({
        name: secondName,
        partnerKind: PartnerKind.peer,
        partnerType: PartnerType.local_agency,
      })
      .expect(201)

    const response = await authRequest(app, coordinatorToken)
      .patch(`/api/partners/${second.body.data.id}`)
      .send({ name: firstName })
      .expect(409)

    expect(response.body.code).toBe(409)
    expect(response.body.message).toBe('合作伙伴名称已存在')
  })

  it('returns 404 when PATCH partner does not exist', async () => {
    const response = await authRequest(app, coordinatorToken)
      .patch('/api/partners/nonexistent-partner-id')
      .send({ name: `${testPartnerPrefix}-ghost` })
      .expect(404)

    expect(response.body.code).toBe(404)
  })

  it('returns 404 when PATCH partner belongs to another organization', async () => {
    const otherOrg = await prisma.organization.create({
      data: { name: `${testPartnerPrefix}-patch-other-org` },
    })

    const foreignPartner = await prisma.partner.create({
      data: {
        organizationId: otherOrg.id,
        name: `${testPartnerPrefix}-patch-foreign`,
        partnerKind: PartnerKind.peer,
        partnerType: PartnerType.other,
        status: DirectoryProfileStatus.active,
      },
    })

    const response = await authRequest(app, coordinatorToken)
      .patch(`/api/partners/${foreignPartner.id}`)
      .send({ name: `${testPartnerPrefix}-patch-foreign-updated` })
      .expect(404)

    expect(response.body.code).toBe(404)

    await prisma.partner.delete({ where: { id: foreignPartner.id } })
    await prisma.organization.delete({ where: { id: otherOrg.id } })
  })

  it('returns 400 when PATCH body is empty', async () => {
    const createResponse = await authRequest(app, coordinatorToken)
      .post('/api/partners')
      .send({
        name: `${testPartnerPrefix}-patch-empty`,
        partnerKind: PartnerKind.both,
        partnerType: PartnerType.wholesaler,
      })
      .expect(201)

    const partnerId = createResponse.body.data.id as string

    const response = await authRequest(app, coordinatorToken)
      .patch(`/api/partners/${partnerId}`)
      .send({})
      .expect(400)

    expect(response.body.code).toBe(400)
  })

  it('archives partner via POST /archive', async () => {
    const createResponse = await authRequest(app, coordinatorToken)
      .post('/api/partners')
      .send({
        name: `${testPartnerPrefix}-archive`,
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.group_agency,
      })
      .expect(201)

    const partnerId = createResponse.body.data.id as string

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/partners/${partnerId}/archive`)
      .expect(201)

    expect(response.body.data.status).toBe(DirectoryProfileStatus.archived)

    const listResponse = await authRequest(app, coordinatorToken)
      .get('/api/partners')
      .query({ search: `${testPartnerPrefix}-archive` })
      .expect(200)

    expect(listResponse.body.data.items).toHaveLength(0)
  })

  it('restores archived partner via POST /restore', async () => {
    const name = `${testPartnerPrefix}-restore`
    const partner = await prisma.partner.create({
      data: {
        organizationId,
        name,
        partnerKind: PartnerKind.both,
        partnerType: PartnerType.wholesaler,
        status: DirectoryProfileStatus.archived,
      },
    })

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/partners/${partner.id}/restore`)
      .expect(201)

    expect(response.body.data.status).toBe(DirectoryProfileStatus.active)

    const listResponse = await authRequest(app, coordinatorToken)
      .get('/api/partners')
      .query({ search: name })
      .expect(200)

    expect(listResponse.body.data.items.map((item: { name: string }) => item.name)).toContain(name)
  })
})

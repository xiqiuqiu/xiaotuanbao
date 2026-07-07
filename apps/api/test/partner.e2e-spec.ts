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
})

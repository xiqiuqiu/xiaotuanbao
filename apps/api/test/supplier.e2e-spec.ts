import type { INestApplication } from '@nestjs/common'
import { DirectoryProfileStatus, ResourceKind } from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { authRequest, createTestApp, loginAs, uniqueBusinessPrefix } from './helpers'

describe('Supplier API (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let organizationId: string
  const testSupplierPrefix = `e2e-supplier-${Date.now()}`

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
    await prisma.supplier.deleteMany({
      where: {
        organizationId,
        name: { startsWith: testSupplierPrefix },
      },
    })
    await prisma.$disconnect()
    await app.close()
  })

  it('returns 403 for finance role without /supplier permission', async () => {
    const response = await authRequest(app, financeToken).get('/api/suppliers').expect(403)

    expect(response.body.code).toBe(403)
    expect(response.body.message).toBe('无权访问')
  })

  it('returns 403 for finance role on POST /suppliers', async () => {
    const response = await authRequest(app, financeToken)
      .post('/api/suppliers')
      .send({ name: `${testSupplierPrefix}-finance-blocked`, categories: [ResourceKind.other] })
      .expect(403)

    expect(response.body.code).toBe(403)
  })

  it('lists suppliers excluding archived by default', async () => {
    const visibleName = `${testSupplierPrefix}-visible`
    const archivedName = `${testSupplierPrefix}-archived`

    await prisma.supplier.createMany({
      data: [
        {
          organizationId,
          name: visibleName,
          categories: [ResourceKind.hotel],
          status: DirectoryProfileStatus.active,
        },
        {
          organizationId,
          name: archivedName,
          categories: [ResourceKind.meal],
          status: DirectoryProfileStatus.archived,
        },
      ],
    })

    const response = await authRequest(app, coordinatorToken)
      .get('/api/suppliers')
      .query({ search: testSupplierPrefix, pageSize: 50 })
      .expect(200)

    const names = response.body.data.items.map((item: { name: string }) => item.name)
    expect(names).toContain(visibleName)
    expect(names).not.toContain(archivedName)
  })

  it('creates supplier with name and category only', async () => {
    const name = `${testSupplierPrefix}-create`

    const response = await authRequest(app, coordinatorToken)
      .post('/api/suppliers')
      .send({
        name,
        categories: [ResourceKind.transport],
      })
      .expect(201)

    expect(response.body.data).toMatchObject({
      name,
      categories: [ResourceKind.transport],
      status: DirectoryProfileStatus.active,
    })
  })

  it('creates supplier with multiple categories', async () => {
    const name = `${testSupplierPrefix}-multi-categories`

    const response = await authRequest(app, coordinatorToken)
      .post('/api/suppliers')
      .send({
        name,
        categories: [ResourceKind.hotel, ResourceKind.meal],
      })
      .expect(201)

    expect(response.body.data.categories).toEqual([ResourceKind.hotel, ResourceKind.meal])
  })

  it('rejects empty categories', async () => {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/suppliers')
      .send({
        name: `${testSupplierPrefix}-empty-categories`,
        categories: [],
      })
      .expect(400)

    expect(response.body.code).toBe(400)
  })

  it('rejects outsource as a supplier category', async () => {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/suppliers')
      .send({
        name: `${testSupplierPrefix}-outsource-category`,
        categories: [ResourceKind.outsource],
      })
      .expect(400)

    expect(response.body.code).toBe(400)
  })

  it('filters suppliers by category containment', async () => {
    const hotelMealName = `${testSupplierPrefix}-filter-hotel-meal`
    const transportName = `${testSupplierPrefix}-filter-transport`

    await authRequest(app, coordinatorToken)
      .post('/api/suppliers')
      .send({ name: hotelMealName, categories: [ResourceKind.hotel, ResourceKind.meal] })
      .expect(201)

    await authRequest(app, coordinatorToken)
      .post('/api/suppliers')
      .send({ name: transportName, categories: [ResourceKind.transport] })
      .expect(201)

    const mealFilter = await authRequest(app, coordinatorToken)
      .get('/api/suppliers')
      .query({ search: testSupplierPrefix, category: ResourceKind.meal, pageSize: 50 })
      .expect(200)

    const mealNames = mealFilter.body.data.items.map((item: { name: string }) => item.name)
    expect(mealNames).toContain(hotelMealName)
    expect(mealNames).not.toContain(transportName)
  })

  it('returns 409 when supplier name duplicates in same organization', async () => {
    const name = `${testSupplierPrefix}-duplicate`

    await authRequest(app, coordinatorToken)
      .post('/api/suppliers')
      .send({ name, categories: [ResourceKind.guide] })
      .expect(201)

    const response = await authRequest(app, coordinatorToken)
      .post('/api/suppliers')
      .send({ name, categories: [ResourceKind.scenic] })
      .expect(409)

    expect(response.body.code).toBe(409)
    expect(response.body.message).toBe('供应商名称已存在')
  })

  it('lists archived suppliers when includeArchived=true', async () => {
    const archivedName = `${testSupplierPrefix}-include-archived`

    await prisma.supplier.create({
      data: {
        organizationId,
        name: archivedName,
        categories: [ResourceKind.other],
        status: DirectoryProfileStatus.archived,
      },
    })

    const response = await authRequest(app, coordinatorToken)
      .get('/api/suppliers')
      .query({ search: archivedName, includeArchived: true })
      .expect(200)

    const names = response.body.data.items.map((item: { name: string }) => item.name)
    expect(names).toContain(archivedName)
  })

  it('gets supplier by id with full profile', async () => {
    const createResponse = await authRequest(app, coordinatorToken)
      .post('/api/suppliers')
      .send({
        name: `${testSupplierPrefix}-get-by-id`,
        categories: [ResourceKind.hotel],
        contactName: '张经理',
        contactPhone: '13800138000',
      })
      .expect(201)

    const supplierId = createResponse.body.data.id as string

    const response = await authRequest(app, coordinatorToken)
      .get(`/api/suppliers/${supplierId}`)
      .expect(200)

    expect(response.body.data).toMatchObject({
      id: supplierId,
      name: `${testSupplierPrefix}-get-by-id`,
      categories: [ResourceKind.hotel],
      contactName: '张经理',
      contactPhone: '13800138000',
    })
  })

  it('returns 404 when supplier does not belong to current organization', async () => {
    const otherOrg = await prisma.organization.create({
      data: {
        name: `${testSupplierPrefix}-other-org`,
        businessPrefix: uniqueBusinessPrefix(`${testSupplierPrefix}-other`),
      },
    })

    const foreignSupplier = await prisma.supplier.create({
      data: {
        organizationId: otherOrg.id,
        name: `${testSupplierPrefix}-foreign`,
        categories: [ResourceKind.other],
        status: DirectoryProfileStatus.active,
      },
    })

    const response = await authRequest(app, coordinatorToken)
      .get(`/api/suppliers/${foreignSupplier.id}`)
      .expect(404)

    expect(response.body.code).toBe(404)

    await prisma.supplier.delete({ where: { id: foreignSupplier.id } })
    await prisma.organization.delete({ where: { id: otherOrg.id } })
  })

  it('updates supplier fields via PATCH', async () => {
    const createResponse = await authRequest(app, coordinatorToken)
      .post('/api/suppliers')
      .send({
        name: `${testSupplierPrefix}-patch`,
        categories: [ResourceKind.meal],
      })
      .expect(201)

    const supplierId = createResponse.body.data.id as string

    const response = await authRequest(app, coordinatorToken)
      .patch(`/api/suppliers/${supplierId}`)
      .send({
        name: `${testSupplierPrefix}-patch-updated`,
        categories: [ResourceKind.hotel],
        status: DirectoryProfileStatus.disabled,
        contactName: '李经理',
      })
      .expect(200)

    expect(response.body.data).toMatchObject({
      name: `${testSupplierPrefix}-patch-updated`,
      categories: [ResourceKind.hotel],
      status: DirectoryProfileStatus.disabled,
      contactName: '李经理',
    })
  })

  it('returns 409 when PATCH renames to an existing supplier name', async () => {
    const firstName = `${testSupplierPrefix}-patch-conflict-a`
    const secondName = `${testSupplierPrefix}-patch-conflict-b`

    await authRequest(app, coordinatorToken)
      .post('/api/suppliers')
      .send({ name: firstName, categories: [ResourceKind.guide] })
      .expect(201)

    const second = await authRequest(app, coordinatorToken)
      .post('/api/suppliers')
      .send({ name: secondName, categories: [ResourceKind.guide] })
      .expect(201)

    const response = await authRequest(app, coordinatorToken)
      .patch(`/api/suppliers/${second.body.data.id}`)
      .send({
        name: firstName,
        categories: [ResourceKind.guide],
        status: DirectoryProfileStatus.active,
      })
      .expect(409)

    expect(response.body.code).toBe(409)
  })

  it('archives supplier via POST /archive', async () => {
    const createResponse = await authRequest(app, coordinatorToken)
      .post('/api/suppliers')
      .send({
        name: `${testSupplierPrefix}-archive`,
        categories: [ResourceKind.scenic],
      })
      .expect(201)

    const supplierId = createResponse.body.data.id as string

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/suppliers/${supplierId}/archive`)
      .expect(201)

    expect(response.body.data.status).toBe(DirectoryProfileStatus.archived)

    const listResponse = await authRequest(app, coordinatorToken)
      .get('/api/suppliers')
      .query({ search: `${testSupplierPrefix}-archive` })
      .expect(200)

    expect(listResponse.body.data.items).toHaveLength(0)
  })

  it('restores archived supplier via POST /restore', async () => {
    const name = `${testSupplierPrefix}-restore`
    const supplier = await prisma.supplier.create({
      data: {
        organizationId,
        name,
        categories: [ResourceKind.transport],
        status: DirectoryProfileStatus.archived,
      },
    })

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/suppliers/${supplier.id}/restore`)
      .expect(201)

    expect(response.body.data.status).toBe(DirectoryProfileStatus.active)

    const listResponse = await authRequest(app, coordinatorToken)
      .get('/api/suppliers')
      .query({ search: name })
      .expect(200)

    expect(listResponse.body.data.items.map((item: { name: string }) => item.name)).toContain(name)
  })
})

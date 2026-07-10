import type { INestApplication } from '@nestjs/common'
import {
  CounterpartyType,
  DirectoryProfileStatus,
  ResourceKind,
} from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { authRequest, createTestApp, loginAs, uniqueBusinessPrefix } from './helpers'

describe('Supplier API (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let organizationId: string
  let ownerUserId: string
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
    ownerUserId = user.id
  })

  afterAll(async () => {
    await prisma.segmentResource.deleteMany({
      where: {
        segment: {
          departure: { organizationId, name: { startsWith: testSupplierPrefix } },
        },
      },
    })
    await prisma.itinerarySegment.deleteMany({
      where: {
        departure: { organizationId, name: { startsWith: testSupplierPrefix } },
      },
    })
    await prisma.departure.deleteMany({
      where: {
        organizationId,
        name: { startsWith: testSupplierPrefix },
      },
    })
    await prisma.supplier.deleteMany({
      where: {
        organizationId,
        name: { startsWith: testSupplierPrefix },
      },
    })
    await prisma.$disconnect()
    await app.close()
  })

  it('allows finance role to list suppliers (ADR-0016 early-launch menus)', async () => {
    const response = await authRequest(app, financeToken).get('/api/suppliers').expect(200)

    expect(response.body.data.items).toEqual(expect.any(Array))
  })

  it('allows finance role to create suppliers (ADR-0016 early-launch menus)', async () => {
    const response = await authRequest(app, financeToken)
      .post('/api/suppliers')
      .send({ name: `${testSupplierPrefix}-finance-allowed`, categories: [ResourceKind.other] })
      .expect(201)

    expect(response.body.data.name).toBe(`${testSupplierPrefix}-finance-allowed`)
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

  it('rejects empty categories on PATCH', async () => {
    const createResponse = await authRequest(app, coordinatorToken)
      .post('/api/suppliers')
      .send({
        name: `${testSupplierPrefix}-patch-empty-categories`,
        categories: [ResourceKind.hotel],
      })
      .expect(201)

    const response = await authRequest(app, coordinatorToken)
      .patch(`/api/suppliers/${createResponse.body.data.id}`)
      .send({
        name: `${testSupplierPrefix}-patch-empty-categories`,
        categories: [],
        status: DirectoryProfileStatus.active,
      })
      .expect(400)

    expect(response.body.code).toBe(400)
    expect(response.body.message).toContain('供应商类别不能为空')
  })

  it('rejects outsource as a supplier category on PATCH', async () => {
    const createResponse = await authRequest(app, coordinatorToken)
      .post('/api/suppliers')
      .send({
        name: `${testSupplierPrefix}-patch-outsource`,
        categories: [ResourceKind.hotel],
      })
      .expect(201)

    const response = await authRequest(app, coordinatorToken)
      .patch(`/api/suppliers/${createResponse.body.data.id}`)
      .send({
        name: `${testSupplierPrefix}-patch-outsource`,
        categories: [ResourceKind.hotel, ResourceKind.outsource],
        status: DirectoryProfileStatus.active,
      })
      .expect(400)

    expect(response.body.code).toBe(400)
    expect(response.body.message).toContain('拼出不得作为供应商类别')
  })

  it('rejects removing a category still used by segment resources', async () => {
    const createResponse = await authRequest(app, coordinatorToken)
      .post('/api/suppliers')
      .send({
        name: `${testSupplierPrefix}-in-use-category`,
        categories: [ResourceKind.hotel, ResourceKind.meal],
      })
      .expect(201)

    const supplierId = createResponse.body.data.id as string

    const departure = await prisma.departure.create({
      data: {
        organizationId,
        departureNo: `TS${Date.now().toString().slice(-10)}`,
        name: `${testSupplierPrefix}-in-use-departure`,
        routeName: '测试线',
        startDate: new Date('2026-08-01'),
        endDate: new Date('2026-08-05'),
        dayCount: 5,
        ownerUserId,
        departureType: 'combined',
      },
    })

    const segment = await prisma.itinerarySegment.create({
      data: {
        departureId: departure.id,
        name: '测试段',
        sortOrder: 0,
        startDate: new Date('2026-08-01'),
        endDate: new Date('2026-08-03'),
        dayCount: 3,
      },
    })

    await prisma.segmentResource.create({
      data: {
        segmentId: segment.id,
        resourceKind: ResourceKind.meal,
        counterpartyType: CounterpartyType.supplier,
        supplierId,
        title: '团队餐',
        amountCents: 50000,
      },
    })

    const response = await authRequest(app, coordinatorToken)
      .patch(`/api/suppliers/${supplierId}`)
      .send({
        name: `${testSupplierPrefix}-in-use-category`,
        categories: [ResourceKind.hotel],
        status: DirectoryProfileStatus.active,
      })
      .expect(400)

    expect(response.body.code).toBe(400)
    expect(response.body.message).toContain('餐')
    expect(response.body.message).toMatch(/仍被|无法移除/)

    const kept = await prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } })
    expect(kept.categories).toEqual(
      expect.arrayContaining([ResourceKind.hotel, ResourceKind.meal]),
    )
  })

  it('allows removing a category not used by segment resources', async () => {
    const createResponse = await authRequest(app, coordinatorToken)
      .post('/api/suppliers')
      .send({
        name: `${testSupplierPrefix}-unused-category`,
        categories: [ResourceKind.hotel, ResourceKind.meal],
      })
      .expect(201)

    const supplierId = createResponse.body.data.id as string

    const departure = await prisma.departure.create({
      data: {
        organizationId,
        departureNo: `TU${Date.now().toString().slice(-10)}`,
        name: `${testSupplierPrefix}-unused-departure`,
        routeName: '测试线',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-05'),
        dayCount: 5,
        ownerUserId,
        departureType: 'combined',
      },
    })

    const segment = await prisma.itinerarySegment.create({
      data: {
        departureId: departure.id,
        name: '测试段',
        sortOrder: 0,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-03'),
        dayCount: 3,
      },
    })

    await prisma.segmentResource.create({
      data: {
        segmentId: segment.id,
        resourceKind: ResourceKind.hotel,
        counterpartyType: CounterpartyType.supplier,
        supplierId,
        title: '酒店',
        amountCents: 80000,
      },
    })

    const response = await authRequest(app, coordinatorToken)
      .patch(`/api/suppliers/${supplierId}`)
      .send({
        name: `${testSupplierPrefix}-unused-category`,
        categories: [ResourceKind.hotel],
        status: DirectoryProfileStatus.active,
      })
      .expect(200)

    expect(response.body.data.categories).toEqual([ResourceKind.hotel])
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

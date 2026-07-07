import type { INestApplication } from '@nestjs/common'
import { DirectoryProfileStatus, SupplierCategory } from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { authRequest, createTestApp, loginAs } from './helpers'

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
      .send({ name: `${testSupplierPrefix}-finance-blocked`, category: SupplierCategory.other })
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
          category: SupplierCategory.hotel,
          status: DirectoryProfileStatus.active,
        },
        {
          organizationId,
          name: archivedName,
          category: SupplierCategory.restaurant,
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
        category: SupplierCategory.transport,
      })
      .expect(201)

    expect(response.body.data).toMatchObject({
      name,
      category: SupplierCategory.transport,
      status: DirectoryProfileStatus.active,
    })
  })

  it('returns 409 when supplier name duplicates in same organization', async () => {
    const name = `${testSupplierPrefix}-duplicate`

    await authRequest(app, coordinatorToken)
      .post('/api/suppliers')
      .send({ name, category: SupplierCategory.guide })
      .expect(201)

    const response = await authRequest(app, coordinatorToken)
      .post('/api/suppliers')
      .send({ name, category: SupplierCategory.scenic })
      .expect(409)

    expect(response.body.code).toBe(409)
    expect(response.body.message).toBe('供应商名称已存在')
  })
})

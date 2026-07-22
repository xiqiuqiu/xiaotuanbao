import type { INestApplication } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { authRequest, createTestApp, loginAs } from './helpers'

/**
 * ADR-0023 / #149: product:write action key enforcement.
 * 计调与企业管理员持有 product:write；财务无写能力，可读 /product。
 */
describe('product:write action-key enforcement (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let adminToken: string
  let organizationId: string
  const testPrefix = `e2e-productwrite-${Date.now()}`

  beforeAll(async () => {
    app = await createTestApp()
    prisma = new PrismaClient()
    coordinatorToken = await loginAs(app, 'wangjie')
    financeToken = await loginAs(app, 'acai')
    adminToken = await loginAs(app, 'admin')

    const user = await prisma.user.findFirst({
      where: { username: 'wangjie', deletedAt: null },
    })
    if (!user) {
      throw new Error('Seed user wangjie not found')
    }
    organizationId = user.organizationId
  })

  afterAll(async () => {
    await prisma.productSchedule.deleteMany({
      where: { product: { organizationId, name: { startsWith: testPrefix } } },
    })
    await prisma.productSpec.deleteMany({
      where: { product: { organizationId, name: { startsWith: testPrefix } } },
    })
    await prisma.product.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.$disconnect()
    await app.close()
  })

  async function createProduct(token: string) {
    const response = await authRequest(app, token)
      .post('/api/products')
      .send({ name: `${testPrefix}-${Math.random().toString(36).slice(2, 8)}` })
      .expect(201)
    return response.body.data as { id: string; name: string }
  }

  it('rejects 财务 creating / updating / deleting with 403', async () => {
    await authRequest(app, financeToken)
      .post('/api/products')
      .send({ name: `${testPrefix}-denied` })
      .expect(403)

    const product = await createProduct(coordinatorToken)

    await authRequest(app, financeToken)
      .patch(`/api/products/${product.id}`)
      .send({ shortItinerary: '财务不可写' })
      .expect(403)

    await authRequest(app, financeToken)
      .patch(`/api/products/${product.id}/spec`)
      .send({ adultPriceCents: 1 })
      .expect(403)

    await authRequest(app, financeToken)
      .post(`/api/products/${product.id}/schedules`)
      .send({ title: 'x', priceOnInquiry: true })
      .expect(403)

    await authRequest(app, financeToken).delete(`/api/products/${product.id}`).expect(403)
  })

  it('allows 财务 to read list and detail', async () => {
    const product = await createProduct(coordinatorToken)

    await authRequest(app, financeToken).get('/api/products').expect(200)
    await authRequest(app, financeToken).get(`/api/products/${product.id}`).expect(200)
  })

  it('allows 企业管理员 and 计调 to create products', async () => {
    await createProduct(coordinatorToken)
    await createProduct(adminToken)
  })
})

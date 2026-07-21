import type { INestApplication } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { authRequest, createTestApp, loginAs } from './helpers'

/**
 * #149 / ADR-0023：product:write — 计调/企管可写，财务只读。
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
      .send({
        name: `${testPrefix}-${Math.random().toString(36).slice(2, 8)}`,
        shortItinerary: 'D1',
      })
      .expect(201)
    return response.body.data as { id: string; name: string }
  }

  describe('产品写接口 — 财务 403', () => {
    it('rejects 财务 creating a product with 403', async () => {
      await authRequest(app, financeToken)
        .post('/api/products')
        .send({ name: `${testPrefix}-finance`, shortItinerary: 'D1' })
        .expect(403)
    })

    it('rejects 财务 mutating product / spec / schedule / lifecycle with 403', async () => {
      const product = await createProduct(coordinatorToken)

      await authRequest(app, financeToken)
        .patch(`/api/products/${product.id}`)
        .send({ name: product.name, shortItinerary: 'D2' })
        .expect(403)
      await authRequest(app, financeToken)
        .patch(`/api/products/${product.id}/spec`)
        .send({ adultPriceCents: 1000 })
        .expect(403)
      await authRequest(app, financeToken)
        .post(`/api/products/${product.id}/schedules`)
        .send({ description: 'x' })
        .expect(403)
      await authRequest(app, financeToken)
        .post(`/api/products/${product.id}/publish`)
        .expect(403)
      await authRequest(app, financeToken)
        .post(`/api/products/${product.id}/off-shelf`)
        .expect(403)
      await authRequest(app, financeToken).delete(`/api/products/${product.id}`).expect(403)
    })
  })

  describe('产品读取 — 财务照常 200 只读', () => {
    it('lets 财务 list products and read a product', async () => {
      const product = await createProduct(coordinatorToken)
      await authRequest(app, financeToken).get('/api/products').expect(200)
      const detail = await authRequest(app, financeToken)
        .get(`/api/products/${product.id}`)
        .expect(200)
      expect(detail.body.data.id).toBe(product.id)
    })
  })

  describe('产品写接口 — 计调 / 企业管理员 200', () => {
    it('allows 计调 to create / update / off-shelf', async () => {
      const product = await createProduct(coordinatorToken)
      await authRequest(app, coordinatorToken)
        .patch(`/api/products/${product.id}`)
        .send({ name: product.name, shortItinerary: 'D2 行程' })
        .expect(200)
      await authRequest(app, coordinatorToken)
        .post(`/api/products/${product.id}/off-shelf`)
        .expect(201)
    })

    it('allows 企业管理员 to create / update / off-shelf', async () => {
      const product = await createProduct(adminToken)
      await authRequest(app, adminToken)
        .patch(`/api/products/${product.id}`)
        .send({ name: product.name, shortItinerary: 'D2' })
        .expect(200)
      await authRequest(app, adminToken)
        .post(`/api/products/${product.id}/off-shelf`)
        .expect(201)
    })
  })
})

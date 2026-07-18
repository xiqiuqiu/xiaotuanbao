import type { INestApplication } from '@nestjs/common'
import { DirectoryProfileStatus, PrismaClient, ResourceKind } from '@prisma/client'
import { authRequest, createTestApp, loginAs } from './helpers'

/**
 * ADR-0023 / #135: supplier:write action key enforcement.
 * 计调 (wangjie) 与企业管理员 (admin) 持有 supplier:write，可维护供应商目录；
 * 财务 (acai) 不持有，对目录写接口（create/update/archive/restore）返回 403，
 * 但供应商读取（list / getById）保持 /supplier，财务仍可 200 只读查看结算信息。
 */
describe('supplier:write action-key enforcement (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let adminToken: string
  let organizationId: string
  const testPrefix = `e2e-supplierwrite-${Date.now()}`

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
    await prisma.supplier.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.$disconnect()
    await app.close()
  })

  function supplierPayload(overrides: Record<string, unknown> = {}) {
    return {
      name: `${testPrefix}-${Math.random().toString(36).slice(2, 8)}`,
      categories: [ResourceKind.hotel],
      ...overrides,
    }
  }

  async function createSupplier(token: string) {
    const response = await authRequest(app, token)
      .post('/api/suppliers')
      .send(supplierPayload())
      .expect(201)
    return response.body.data as { id: string; name: string }
  }

  describe('供应商目录写接口 — 财务 403', () => {
    it('rejects 财务 creating a supplier with 403', async () => {
      await authRequest(app, financeToken)
        .post('/api/suppliers')
        .send(supplierPayload())
        .expect(403)
    })

    it('rejects 财务 updating / archiving / restoring with 403', async () => {
      const supplier = await createSupplier(coordinatorToken)

      await authRequest(app, financeToken)
        .patch(`/api/suppliers/${supplier.id}`)
        .send({
          name: supplier.name,
          categories: [ResourceKind.meal],
          status: DirectoryProfileStatus.active,
        })
        .expect(403)
      await authRequest(app, financeToken)
        .post(`/api/suppliers/${supplier.id}/archive`)
        .expect(403)

      // 归档后再验证财务恢复也被拒
      await authRequest(app, coordinatorToken)
        .post(`/api/suppliers/${supplier.id}/archive`)
        .expect(201)
      await authRequest(app, financeToken)
        .post(`/api/suppliers/${supplier.id}/restore`)
        .expect(403)
    })
  })

  describe('供应商读取 — 财务照常 200 只读', () => {
    it('lets 财务 list suppliers and read a supplier profile', async () => {
      const supplier = await createSupplier(coordinatorToken)

      await authRequest(app, financeToken).get('/api/suppliers').expect(200)
      const detail = await authRequest(app, financeToken)
        .get(`/api/suppliers/${supplier.id}`)
        .expect(200)
      expect(detail.body.data.id).toBe(supplier.id)
    })
  })

  describe('供应商目录写接口 — 计调 / 企业管理员 200', () => {
    it('allows 计调 to create / update / archive / restore', async () => {
      const supplier = await createSupplier(coordinatorToken)
      await authRequest(app, coordinatorToken)
        .patch(`/api/suppliers/${supplier.id}`)
        .send({
          name: supplier.name,
          categories: [ResourceKind.meal],
          status: DirectoryProfileStatus.active,
        })
        .expect(200)
      await authRequest(app, coordinatorToken)
        .post(`/api/suppliers/${supplier.id}/archive`)
        .expect(201)
      await authRequest(app, coordinatorToken)
        .post(`/api/suppliers/${supplier.id}/restore`)
        .expect(201)
    })

    it('allows 企业管理员 to create / update / archive / restore', async () => {
      const supplier = await createSupplier(adminToken)
      await authRequest(app, adminToken)
        .patch(`/api/suppliers/${supplier.id}`)
        .send({
          name: supplier.name,
          categories: [ResourceKind.meal],
          status: DirectoryProfileStatus.active,
        })
        .expect(200)
      await authRequest(app, adminToken)
        .post(`/api/suppliers/${supplier.id}/archive`)
        .expect(201)
      await authRequest(app, adminToken)
        .post(`/api/suppliers/${supplier.id}/restore`)
        .expect(201)
    })
  })
})

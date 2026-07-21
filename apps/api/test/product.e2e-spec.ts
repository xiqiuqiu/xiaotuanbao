import type { INestApplication } from '@nestjs/common'
import { PrismaClient, ProductScheduleStatus, ProductStatus } from '@prisma/client'
import { authRequest, createTestApp, loginAs } from './helpers'

/**
 * #149 Product Center：CRUD、ADR-0025 班期价快照、上架门槛、组织隔离、不可硬删有班期产品。
 */
describe('Product Center CRUD + snapshot (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let organizationId: string
  const testPrefix = `e2e-product-${Date.now()}`

  beforeAll(async () => {
    app = await createTestApp()
    prisma = new PrismaClient()
    coordinatorToken = await loginAs(app, 'wangjie')

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

  async function createProduct(overrides: Record<string, unknown> = {}) {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/products')
      .send({
        name: `${testPrefix}-${Math.random().toString(36).slice(2, 8)}`,
        shortItinerary: 'D1 乌鲁木齐集合',
        ...overrides,
      })
      .expect(201)
    return response.body.data as {
      id: string
      name: string
      status: string
      productType: string
      spec: { id: string; adultPriceCents: number | null }
      schedules: Array<{
        id: string
        adultPriceCents: number | null
        childPriceCents: number | null
        singleSupplementCents: number | null
        status: string
      }>
    }
  }

  it('creates a draft group_tour product with a default 标准 spec', async () => {
    const product = await createProduct()
    expect(product.status).toBe(ProductStatus.draft)
    expect(product.productType).toBe('group_tour')
    expect(product.spec).toMatchObject({ name: '标准', adultPriceCents: null })
    expect(product.schedules).toEqual([])
  })

  it('lists products for the organization and returns 404 for unknown id', async () => {
    const product = await createProduct()
    const list = await authRequest(app, coordinatorToken).get('/api/products').expect(200)
    const ids = (list.body.data.items as Array<{ id: string }>).map((row) => row.id)
    expect(ids).toContain(product.id)

    await authRequest(app, coordinatorToken)
      .get('/api/products/nonexistent-product-id')
      .expect(404)

    // 组织隔离：伪造其它组织 id 不可读
    const otherOrg = await prisma.organization.findFirst({
      where: { id: { not: organizationId }, deletedAt: null },
    })
    if (otherOrg) {
      const foreign = await prisma.product.create({
        data: {
          organizationId: otherOrg.id,
          name: `${testPrefix}-foreign`,
        },
      })
      await authRequest(app, coordinatorToken).get(`/api/products/${foreign.id}`).expect(404)
      await prisma.product.delete({ where: { id: foreign.id } })
    }
  })

  it('snapshots spec defaults into schedule prices; changing defaults does not rewrite schedule (ADR-0025)', async () => {
    const product = await createProduct()

    await authRequest(app, coordinatorToken)
      .patch(`/api/products/${product.id}/spec`)
      .send({
        adultPriceCents: 238_000,
        childPriceCents: 198_000,
        singleSupplementCents: 50_000,
      })
      .expect(200)

    const withSchedule = await authRequest(app, coordinatorToken)
      .post(`/api/products/${product.id}/schedules`)
      .send({ description: '7月天天发团' })
      .expect(201)

    const schedule = withSchedule.body.data.schedules[0] as {
      id: string
      adultPriceCents: number
      childPriceCents: number
      singleSupplementCents: number
    }
    expect(schedule).toMatchObject({
      adultPriceCents: 238_000,
      childPriceCents: 198_000,
      singleSupplementCents: 50_000,
    })

    await authRequest(app, coordinatorToken)
      .patch(`/api/products/${product.id}/spec`)
      .send({
        adultPriceCents: 280_000,
        childPriceCents: 220_000,
        singleSupplementCents: 60_000,
      })
      .expect(200)

    const afterSpecChange = await authRequest(app, coordinatorToken)
      .get(`/api/products/${product.id}`)
      .expect(200)

    expect(afterSpecChange.body.data.spec.adultPriceCents).toBe(280_000)
    expect(afterSpecChange.body.data.schedules[0]).toMatchObject({
      id: schedule.id,
      adultPriceCents: 238_000,
      childPriceCents: 198_000,
      singleSupplementCents: 50_000,
    })

    await authRequest(app, coordinatorToken)
      .patch(`/api/products/${product.id}/schedules/${schedule.id}`)
      .send({ adultPriceCents: 250_000 })
      .expect(200)

    const afterScheduleEdit = await authRequest(app, coordinatorToken)
      .get(`/api/products/${product.id}`)
      .expect(200)
    expect(afterScheduleEdit.body.data.schedules[0].adultPriceCents).toBe(250_000)
    expect(afterScheduleEdit.body.data.spec.adultPriceCents).toBe(280_000)
  })

  it('supports schedule statuses; cancelled schedules are excluded from effective count', async () => {
    const product = await createProduct()
    await authRequest(app, coordinatorToken)
      .patch(`/api/products/${product.id}/spec`)
      .send({ adultPriceCents: 100_000 })
      .expect(200)

    const created = await authRequest(app, coordinatorToken)
      .post(`/api/products/${product.id}/schedules`)
      .send({ description: '旺季' })
      .expect(201)
    const scheduleId = created.body.data.schedules[0].id as string

    expect(created.body.data.effectiveScheduleCount).toBe(1)

    const cancelled = await authRequest(app, coordinatorToken)
      .patch(`/api/products/${product.id}/schedules/${scheduleId}`)
      .send({ status: ProductScheduleStatus.cancelled })
      .expect(200)

    expect(cancelled.body.data.schedules[0].status).toBe(ProductScheduleStatus.cancelled)
    expect(cancelled.body.data.effectiveScheduleCount).toBe(0)
  })

  it('publishes when name + short itinerary + displayable schedule; rejects hard delete when schedules exist', async () => {
    const product = await createProduct({ shortItinerary: 'D1 集合' })
    await authRequest(app, coordinatorToken)
      .patch(`/api/products/${product.id}/spec`)
      .send({ adultPriceCents: 100_000 })
      .expect(200)
    await authRequest(app, coordinatorToken)
      .post(`/api/products/${product.id}/schedules`)
      .send({ description: '报价行' })
      .expect(201)

    const published = await authRequest(app, coordinatorToken)
      .post(`/api/products/${product.id}/publish`)
      .expect(201)
    expect(published.body.data.status).toBe(ProductStatus.on_sale)

    await authRequest(app, coordinatorToken).delete(`/api/products/${product.id}`).expect(400)

    const off = await authRequest(app, coordinatorToken)
      .post(`/api/products/${product.id}/off-shelf`)
      .expect(201)
    expect(off.body.data.status).toBe(ProductStatus.off_shelf)
  })

  it('allows editing an on_sale product after publish', async () => {
    const product = await createProduct({ shortItinerary: 'D1 集合' })
    await authRequest(app, coordinatorToken)
      .patch(`/api/products/${product.id}/spec`)
      .send({ adultPriceCents: 100_000 })
      .expect(200)
    await authRequest(app, coordinatorToken)
      .post(`/api/products/${product.id}/schedules`)
      .send({ description: '报价行' })
      .expect(201)
    await authRequest(app, coordinatorToken)
      .post(`/api/products/${product.id}/publish`)
      .expect(201)

    const updated = await authRequest(app, coordinatorToken)
      .patch(`/api/products/${product.id}`)
      .send({ name: product.name, shortItinerary: 'D1 集合（已上架可改）' })
      .expect(200)
    expect(updated.body.data.status).toBe(ProductStatus.on_sale)
    expect(updated.body.data.shortItinerary).toBe('D1 集合（已上架可改）')
  })

  it('allows hard delete when product has no schedules', async () => {
    const product = await createProduct()
    await authRequest(app, coordinatorToken).delete(`/api/products/${product.id}`).expect(204)
    await authRequest(app, coordinatorToken).get(`/api/products/${product.id}`).expect(404)
  })
})

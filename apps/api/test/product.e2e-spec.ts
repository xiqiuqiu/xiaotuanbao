import type { INestApplication } from '@nestjs/common'
import { PrismaClient, ProductScheduleStatus, ProductStatus } from '@prisma/client'
import { authRequest, createTestApp, loginAs, uniqueBusinessPrefix } from './helpers'

describe('Product API (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let organizationId: string
  const testPrefix = `e2e-product-${Date.now()}`

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

  async function createDraft(nameSuffix: string) {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/products')
      .send({ name: `${testPrefix}-${nameSuffix}` })
      .expect(201)
    return response.body.data as {
      id: string
      name: string
      status: string
      productType: string
      spec: { id: string; adultPriceCents: number | null }
      schedules: unknown[]
    }
  }

  it('allows finance to list products (read-only menu)', async () => {
    const response = await authRequest(app, financeToken).get('/api/products').expect(200)
    expect(response.body.data.items).toEqual(expect.any(Array))
  })

  it('rejects finance creating products', async () => {
    await authRequest(app, financeToken)
      .post('/api/products')
      .send({ name: `${testPrefix}-finance-denied` })
      .expect(403)
  })

  it('creates draft product with fixed group_join type and default spec', async () => {
    const product = await createDraft('create')

    expect(product).toMatchObject({
      name: `${testPrefix}-create`,
      status: ProductStatus.draft,
      productType: 'group_join',
      shortItinerary: '',
      schedules: [],
    })
    expect(product.spec).toMatchObject({
      name: '标准',
      adultPriceCents: null,
    })
  })

  it('updates draft fields and creates schedule with price snapshot from spec', async () => {
    const product = await createDraft('snapshot')

    await authRequest(app, coordinatorToken)
      .patch(`/api/products/${product.id}/spec`)
      .send({
        adultPriceCents: 238_000,
        childPriceCents: 180_000,
        singleRoomSupplementCents: 40_000,
      })
      .expect(200)

    const withSchedule = await authRequest(app, coordinatorToken)
      .post(`/api/products/${product.id}/schedules`)
      .send({
        title: '7月天天发',
        dateRuleText: '天天发团',
        startDate: '2026-07-01',
        endDate: '2026-07-31',
      })
      .expect(201)

    expect(withSchedule.body.data.schedules).toHaveLength(1)
    expect(withSchedule.body.data.schedules[0]).toMatchObject({
      title: '7月天天发',
      adultPriceCents: 238_000,
      childPriceCents: 180_000,
      singleRoomSupplementCents: 40_000,
      status: ProductScheduleStatus.on_sale,
    })

    await authRequest(app, coordinatorToken)
      .patch(`/api/products/${product.id}/spec`)
      .send({ adultPriceCents: 999_000 })
      .expect(200)

    const afterSpecChange = await authRequest(app, coordinatorToken)
      .get(`/api/products/${product.id}`)
      .expect(200)

    expect(afterSpecChange.body.data.spec.adultPriceCents).toBe(999_000)
    expect(afterSpecChange.body.data.schedules[0].adultPriceCents).toBe(238_000)
  })

  it('publishes when name + short itinerary + displayable schedule exist', async () => {
    const product = await createDraft('publish')

    await authRequest(app, coordinatorToken)
      .patch(`/api/products/${product.id}/spec`)
      .send({ adultPriceCents: 100_000 })
      .expect(200)

    await authRequest(app, coordinatorToken)
      .post(`/api/products/${product.id}/schedules`)
      .send({ title: '询价班期', priceOnInquiry: true, adultPriceCents: null })
      .expect(201)

    const published = await authRequest(app, coordinatorToken)
      .patch(`/api/products/${product.id}`)
      .send({
        shortItinerary: 'D1 乌鲁木齐接机\nD2 天山天池',
        status: ProductStatus.on_sale,
      })
      .expect(200)

    expect(published.body.data.status).toBe(ProductStatus.on_sale)
  })

  it('rejects publish without displayable schedule', async () => {
    const product = await createDraft('publish-blocked')

    const response = await authRequest(app, coordinatorToken)
      .patch(`/api/products/${product.id}`)
      .send({
        shortItinerary: '有简版但无班期',
        status: ProductStatus.on_sale,
      })
      .expect(400)

    expect(response.body.message).toContain('可展示班期')
  })

  it('cancels schedule without deleting history and excludes from active count', async () => {
    const product = await createDraft('cancel-schedule')

    await authRequest(app, coordinatorToken)
      .patch(`/api/products/${product.id}/spec`)
      .send({ adultPriceCents: 120_000 })
      .expect(200)

    const created = await authRequest(app, coordinatorToken)
      .post(`/api/products/${product.id}/schedules`)
      .send({ title: '将取消', dateRuleText: '每周一' })
      .expect(201)

    const scheduleId = created.body.data.schedules[0].id as string
    expect(created.body.data.activeScheduleCount).toBe(1)

    const cancelled = await authRequest(app, coordinatorToken)
      .patch(`/api/products/${product.id}/schedules/${scheduleId}`)
      .send({ status: ProductScheduleStatus.cancelled })
      .expect(200)

    expect(cancelled.body.data.schedules).toHaveLength(1)
    expect(cancelled.body.data.schedules[0].status).toBe(ProductScheduleStatus.cancelled)
    expect(cancelled.body.data.activeScheduleCount).toBe(0)
  })

  it('rejects physical delete when product has schedules; allows offline', async () => {
    const product = await createDraft('no-delete')

    await authRequest(app, coordinatorToken)
      .patch(`/api/products/${product.id}/spec`)
      .send({ adultPriceCents: 150_000 })
      .expect(200)

    await authRequest(app, coordinatorToken)
      .post(`/api/products/${product.id}/schedules`)
      .send({ title: '保留历史' })
      .expect(201)

    await authRequest(app, coordinatorToken).delete(`/api/products/${product.id}`).expect(400)

    const offlined = await authRequest(app, coordinatorToken)
      .patch(`/api/products/${product.id}`)
      .send({ status: ProductStatus.offline })
      .expect(200)

    expect(offlined.body.data.status).toBe(ProductStatus.offline)
  })

  it('allows delete draft product without schedules', async () => {
    const product = await createDraft('deletable')

    await authRequest(app, coordinatorToken).delete(`/api/products/${product.id}`).expect(204)

    await authRequest(app, coordinatorToken).get(`/api/products/${product.id}`).expect(404)
  })

  it('returns 404 for product in another organization', async () => {
    const otherOrg = await prisma.organization.create({
      data: {
        name: `${testPrefix}-other-org`,
        businessPrefix: uniqueBusinessPrefix(`${testPrefix}-other`),
      },
    })

    const foreign = await prisma.product.create({
      data: {
        organizationId: otherOrg.id,
        name: `${testPrefix}-foreign`,
        specs: { create: { name: '标准' } },
      },
    })

    await authRequest(app, coordinatorToken).get(`/api/products/${foreign.id}`).expect(404)

    await prisma.productSpec.deleteMany({ where: { productId: foreign.id } })
    await prisma.product.delete({ where: { id: foreign.id } })
    await prisma.organization.delete({ where: { id: otherOrg.id } })
  })
})

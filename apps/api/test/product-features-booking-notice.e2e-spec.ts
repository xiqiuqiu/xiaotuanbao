import type { INestApplication } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { authRequest, createTestApp, loginAs } from './helpers'

/**
 * #151: Product Feature 条目 + Booking Notice 整段 + 组织模板引用后可覆盖且不回写。
 */
describe('Product features & booking notice templates (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let adminToken: string
  let organizationId: string
  const testPrefix = `e2e-feat-notice-${Date.now()}`

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
    await prisma.productFeature.deleteMany({
      where: { product: { organizationId, name: { startsWith: testPrefix } } },
    })
    await prisma.productSchedule.deleteMany({
      where: { product: { organizationId, name: { startsWith: testPrefix } } },
    })
    await prisma.productSpec.deleteMany({
      where: { product: { organizationId, name: { startsWith: testPrefix } } },
    })
    await prisma.product.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.bookingNoticeTemplate.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.$disconnect()
    await app.close()
  })

  async function createDraft(suffix: string) {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/products')
      .send({ name: `${testPrefix}-${suffix}`, shortItinerary: 'D1 测试' })
      .expect(201)
    return response.body.data as { id: string }
  }

  it('allows empty features and replacing feature entries', async () => {
    const product = await createDraft('features')

    const empty = await authRequest(app, coordinatorToken)
      .put(`/api/products/${product.id}/features`)
      .send({ features: [] })
      .expect(200)

    expect(empty.body.data.features).toEqual([])
    expect(empty.body.data.featuresText).toBeNull()

    const withItems = await authRequest(app, coordinatorToken)
      .put(`/api/products/${product.id}/features`)
      .send({
        features: [
          { title: '真心', description: '行程不含购物店' },
          { title: '', description: '纯玩保障' },
        ],
      })
      .expect(200)

    expect(withItems.body.data.features).toHaveLength(2)
    expect(withItems.body.data.features[0]).toMatchObject({
      title: '真心',
      description: '行程不含购物店',
      sortOrder: 0,
    })
    expect(withItems.body.data.features[1]).toMatchObject({
      title: '',
      description: '纯玩保障',
      sortOrder: 1,
    })
    expect(withItems.body.data.featuresText).toContain('真心')
    expect(withItems.body.data.featuresText).toContain('纯玩保障')
  })

  it('serializes concurrent feature replacements without duplicate rows', async () => {
    const product = await createDraft('features-concurrent')

    await authRequest(app, coordinatorToken)
      .put(`/api/products/${product.id}/features`)
      .send({
        features: [
          { title: 'seed', description: 'initial' },
          { title: 'seed2', description: 'initial2' },
        ],
      })
      .expect(200)

    const payloadA = [
      { title: 'A0', description: 'da0' },
      { title: 'A1', description: 'da1' },
      { title: 'A2', description: 'da2' },
    ]
    const payloadB = [
      { title: 'B0', description: 'db0' },
      { title: 'B1', description: 'db1' },
      { title: 'B2', description: 'db2' },
      { title: 'B3', description: 'db3' },
      { title: 'B4', description: 'db4' },
    ]

    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        authRequest(app, coordinatorToken)
          .put(`/api/products/${product.id}/features`)
          .send({ features: index % 2 === 0 ? payloadA : payloadB }),
      ),
    )

    expect(responses.every((response) => response.status === 200)).toBe(true)

    const rows = await prisma.productFeature.findMany({
      where: { productId: product.id },
      orderBy: { sortOrder: 'asc' },
    })
    // Without product FOR UPDATE, overlapping deleteMany+createMany often leaves
    // 3+5 (or more) rows. With the lock, exactly one writer wins.
    expect([payloadA.length, payloadB.length]).toContain(rows.length)

    const titles = rows.map((row) => row.title)
    const winner = titles[0]?.startsWith('A') ? payloadA : payloadB
    expect(titles).toEqual(winner.map((item) => item.title))

    const detail = await authRequest(app, coordinatorToken)
      .get(`/api/products/${product.id}`)
      .expect(200)
    expect(detail.body.data.features).toHaveLength(winner.length)
    expect(detail.body.data.featuresText).toContain(winner[0].title)
  })

  it('allows publishing with empty features when other on-sale rules are met', async () => {
    const product = await createDraft('on-sale-no-features')

    await authRequest(app, coordinatorToken)
      .put(`/api/products/${product.id}/features`)
      .send({ features: [] })
      .expect(200)

    await authRequest(app, coordinatorToken)
      .post(`/api/products/${product.id}/schedules`)
      .send({ title: '询价档', priceOnInquiry: true, startDate: '2026-08-01' })
      .expect(201)

    const published = await authRequest(app, coordinatorToken)
      .patch(`/api/products/${product.id}`)
      .send({ status: 'on_sale' })
      .expect(200)

    expect(published.body.data).toMatchObject({
      status: 'on_sale',
      features: [],
      featuresText: null,
    })
  })

  it('rejects finance writing features or booking notice', async () => {
    const product = await createDraft('finance-deny')

    await authRequest(app, financeToken)
      .put(`/api/products/${product.id}/features`)
      .send({ features: [{ title: 'x', description: 'y' }] })
      .expect(403)

    await authRequest(app, financeToken)
      .patch(`/api/products/${product.id}`)
      .send({ bookingNotice: '财务不可写须知' })
      .expect(403)

    await authRequest(app, financeToken)
      .post(`/api/products/${product.id}/booking-notice/from-template`)
      .send({ templateId: 'nonexistent' })
      .expect(403)
  })

  it('lets org admin manage templates; product apply copies then override does not write back', async () => {
    const templateName = `${testPrefix}-须知模板`
    const created = await authRequest(app, adminToken)
      .post('/api/booking-notice-templates')
      .send({
        name: templateName,
        content: '适用年龄 7-70；儿童不占床；退改按合同。',
      })
      .expect(201)

    const template = created.body.data as { id: string; name: string; content: string }
    expect(template).toMatchObject({
      name: templateName,
      content: '适用年龄 7-70；儿童不占床；退改按合同。',
    })

    // 计调可读模板列表（用于产品页引用），不可写模板。
    const listed = await authRequest(app, coordinatorToken)
      .get('/api/booking-notice-templates')
      .expect(200)
    expect(listed.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: template.id, name: templateName })]),
    )

    await authRequest(app, coordinatorToken)
      .post('/api/booking-notice-templates')
      .send({ name: `${testPrefix}-denied`, content: 'x' })
      .expect(403)

    await authRequest(app, financeToken)
      .post('/api/booking-notice-templates')
      .send({ name: `${testPrefix}-finance`, content: 'x' })
      .expect(403)

    const product = await createDraft('notice-override')
    const applied = await authRequest(app, coordinatorToken)
      .post(`/api/products/${product.id}/booking-notice/from-template`)
      .send({ templateId: template.id })
      .expect(201)

    expect(applied.body.data).toMatchObject({
      bookingNotice: template.content,
      bookingNoticeTemplateId: template.id,
      bookingNoticeTemplateName: templateName,
    })

    const overridden = await authRequest(app, coordinatorToken)
      .patch(`/api/products/${product.id}`)
      .send({ bookingNotice: '本线儿童须满 12 岁；其余同组织须知。' })
      .expect(200)

    expect(overridden.body.data.bookingNotice).toBe('本线儿童须满 12 岁；其余同组织须知。')
    // 溯源保留；正文已独立，不回写模板。
    expect(overridden.body.data.bookingNoticeTemplateId).toBe(template.id)

    const templateAfter = await authRequest(app, adminToken)
      .get(`/api/booking-notice-templates/${template.id}`)
      .expect(200)
    expect(templateAfter.body.data.content).toBe('适用年龄 7-70；儿童不占床；退改按合同。')

    await authRequest(app, adminToken)
      .patch(`/api/booking-notice-templates/${template.id}`)
      .send({ content: '模板已更新，不应覆盖已改写产品。' })
      .expect(200)

    const productAfterTemplateEdit = await authRequest(app, coordinatorToken)
      .get(`/api/products/${product.id}`)
      .expect(200)
    expect(productAfterTemplateEdit.body.data.bookingNotice).toBe(
      '本线儿童须满 12 岁；其余同组织须知。',
    )
  })
})

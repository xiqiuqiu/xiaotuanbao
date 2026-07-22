import type { INestApplication } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { authRequest, createTestApp, loginAs } from './helpers'

/**
 * #152 — 同行资料 PDF + 过渡总表 Excel。
 * 缝：HTTP 导出端点（content-type / 正文关键文本或单元格 / 校验 / 财务只读可导）。
 * Word 本期不做（ADR-0027：P1.5）。
 */
describe('product export (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let organizationId: string
  const testPrefix = `e2e-prodexport-${Date.now()}`

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
    await prisma.$disconnect()
    await app.close()
  })

  async function createExportableProduct(options?: {
    name?: string
    shortItinerary?: string
    withAdultPrice?: boolean
    withFeatures?: boolean
    withNotice?: boolean
    sourceSheetName?: string | null
    status?: 'draft' | 'on_sale'
  }) {
    const name = options?.name ?? `${testPrefix}-${Math.random().toString(36).slice(2, 8)}`
    const shortItinerary = options?.shortItinerary ?? 'D1 乌鲁木齐集合 / D2 天山天池'
    const created = await authRequest(app, coordinatorToken)
      .post('/api/products')
      .send({ name, shortItinerary, tags: ['纯玩', '大巴'] })
      .expect(201)
    const product = created.body.data as { id: string; name: string }

    if (options?.withAdultPrice !== false) {
      await authRequest(app, coordinatorToken)
        .post(`/api/products/${product.id}/schedules`)
        .send({
          title: '暑期班',
          dateRuleText: '7月每周六',
          startDate: '2026-07-04',
          endDate: '2026-07-11',
          adultPriceCents: 328000,
          childPriceCents: 298000,
        })
        .expect(201)
    } else {
      await authRequest(app, coordinatorToken)
        .post(`/api/products/${product.id}/schedules`)
        .send({
          title: '询价班',
          dateRuleText: '询价',
          priceOnInquiry: true,
        })
        .expect(201)
    }

    if (options?.withFeatures) {
      await authRequest(app, coordinatorToken)
        .put(`/api/products/${product.id}/features`)
        .send({ features: [{ title: '纯玩无购物', description: '全程无自费' }] })
        .expect(200)
    }

    if (options?.withNotice) {
      await authRequest(app, coordinatorToken)
        .patch(`/api/products/${product.id}`)
        .send({ bookingNotice: '报名须知：请提前三日确认名单' })
        .expect(200)
    }

    if (options?.sourceSheetName) {
      await prisma.product.update({
        where: { id: product.id },
        data: { sourceSheetName: options.sourceSheetName },
      })
    }

    if (options?.status === 'on_sale') {
      await authRequest(app, coordinatorToken)
        .patch(`/api/products/${product.id}`)
        .send({ status: 'on_sale' })
        .expect(200)
    }

    return product
  }

  /** Supertest binary body parser（与往来账 xlsx e2e 同形）。 */
  const parseBinary = (res: { on: Function }, callback: (err: Error | null, body: Buffer) => void) => {
    const chunks: Buffer[] = []
    res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
    res.on('end', () => callback(null, Buffer.concat(chunks)))
  }

  /** UniGB-UCS2-H 文本以 UTF-16BE hex 写入 PDF，可直接检索。 */
  function expectPdfContainsText(buffer: Buffer, text: string) {
    const hex = Array.from(text)
      .map((ch) => ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'))
      .join('')
    expect(buffer.toString('latin1').toUpperCase()).toContain(hex)
  }

  describe('peer-pack.pdf', () => {
    it('exports priced PDF with title, itinerary, schedule price, optional feature/notice', async () => {
      const product = await createExportableProduct({
        withFeatures: true,
        withNotice: true,
      })

      const response = await authRequest(app, coordinatorToken)
        .get(`/api/products/${product.id}/peer-pack.pdf`)
        .query({ priced: true })
        .buffer(true)
        .parse(parseBinary)
        .expect(200)

      expect(response.headers['content-type']).toMatch(/application\/pdf/)
      expect(Buffer.isBuffer(response.body)).toBe(true)
      expect(response.body.subarray(0, 5).toString('utf8')).toBe('%PDF-')
      const disposition = String(response.headers['content-disposition'] ?? '')
      expect(disposition).toMatch(/attachment/)
      expect(disposition).toContain(encodeURIComponent(product.name))
      expect(disposition).toMatch(/\.pdf/i)

      expectPdfContainsText(response.body, product.name)
      expectPdfContainsText(response.body, 'D1 乌鲁木齐集合')
      expectPdfContainsText(response.body, '3280')
      expectPdfContainsText(response.body, '纯玩无购物')
      expectPdfContainsText(response.body, '报名须知')
    })

    it('exports unpriced PDF without adult price digits', async () => {
      const product = await createExportableProduct({
        name: `${testPrefix}-unpriced`,
      })

      const response = await authRequest(app, coordinatorToken)
        .get(`/api/products/${product.id}/peer-pack.pdf`)
        .query({ priced: false })
        .buffer(true)
        .parse(parseBinary)
        .expect(200)

      expect(response.headers['content-type']).toMatch(/application\/pdf/)
      expectPdfContainsText(response.body, product.name)
      expectPdfContainsText(response.body, '询价')
      const hex3280 = Array.from('3280')
        .map((ch) => ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'))
        .join('')
      expect(response.body.toString('latin1').toUpperCase()).not.toContain(hex3280)
    })

    it('allows export when features/notice missing; blocks priced export without adult price', async () => {
      const bare = await createExportableProduct({
        withFeatures: false,
        withNotice: false,
      })
      await authRequest(app, coordinatorToken)
        .get(`/api/products/${bare.id}/peer-pack.pdf`)
        .query({ priced: true })
        .buffer(true)
        .parse(parseBinary)
        .expect(200)

      const noPrice = await authRequest(app, coordinatorToken)
        .post('/api/products')
        .send({ name: `${testPrefix}-noprice`, shortItinerary: '有简版' })
        .expect(201)
      await authRequest(app, coordinatorToken)
        .post(`/api/products/${noPrice.body.data.id}/schedules`)
        .send({ title: '无价班', dateRuleText: '待定', priceOnInquiry: true })
        .expect(201)

      const blocked = await authRequest(app, coordinatorToken)
        .get(`/api/products/${noPrice.body.data.id}/peer-pack.pdf`)
        .query({ priced: true })
        .expect(400)
      expect(String(blocked.body.message)).toMatch(/成人价/)

      const emptyItinerary = await authRequest(app, coordinatorToken)
        .post('/api/products')
        .send({ name: `${testPrefix}-empty-itin` })
        .expect(201)
      await authRequest(app, coordinatorToken)
        .post(`/api/products/${emptyItinerary.body.data.id}/schedules`)
        .send({ title: '班', dateRuleText: 'x', adultPriceCents: 10000 })
        .expect(201)
      const missingItin = await authRequest(app, coordinatorToken)
        .get(`/api/products/${emptyItinerary.body.data.id}/peer-pack.pdf`)
        .query({ priced: true })
        .expect(400)
      expect(String(missingItin.body.message)).toMatch(/简版/)
    })

    it('marks draft in filename; finance can export but cannot write', async () => {
      const product = await createExportableProduct()

      const pdf = await authRequest(app, financeToken)
        .get(`/api/products/${product.id}/peer-pack.pdf`)
        .query({ priced: true })
        .buffer(true)
        .parse(parseBinary)
        .expect(200)
      expect(pdf.headers['content-type']).toMatch(/application\/pdf/)
      const disposition = decodeURIComponent(
        String(pdf.headers['content-disposition'] ?? ''),
      )
      expect(disposition).toMatch(/草稿/)

      await authRequest(app, financeToken)
        .patch(`/api/products/${product.id}`)
        .send({ shortItinerary: '财务不可改' })
        .expect(403)
    })
  })

  describe('summary.xlsx', () => {
    it('exports transitional workbook partitioned by source sheet', async () => {
      const ExcelJS = await import('exceljs')
      const north = await createExportableProduct({
        name: `${testPrefix}-north`,
        sourceSheetName: '北疆大巴纯玩线路',
        withFeatures: true,
      })
      const manual = await createExportableProduct({
        name: `${testPrefix}-manual`,
        sourceSheetName: null,
      })

      const response = await authRequest(app, financeToken)
        .get('/api/products/summary.xlsx')
        .query({ search: testPrefix })
        .buffer(true)
        .parse(parseBinary)
        .expect(200)

      expect(response.headers['content-type']).toMatch(
        /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/,
      )
      const disposition = String(response.headers['content-disposition'] ?? '')
      expect(disposition).toMatch(/attachment/)
      expect(disposition).toMatch(/\.xlsx/)

      const workbook = new ExcelJS.Workbook()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await workbook.xlsx.load(response.body as any)
      const sheetNames = workbook.worksheets.map((sheet) => sheet.name)
      expect(sheetNames).toEqual(expect.arrayContaining(['北疆大巴纯玩线路', '手建产品']))

      const northSheet = workbook.getWorksheet('北疆大巴纯玩线路')
      expect(northSheet).toBeDefined()
      const headerRow = northSheet!.getRow(1).values as Array<string | null | undefined>
      expect(headerRow).toEqual(
        expect.arrayContaining([
          '线路名称',
          '标签',
          '简版行程',
          '特色',
          '发团日期',
          '成人价',
          '儿童价',
          '单房差',
        ]),
      )

      const northValues = northSheet!.getSheetValues().flat().map(String)
      expect(northValues.some((cell) => cell.includes(north.name))).toBe(true)
      expect(northValues.some((cell) => cell.includes('3280') || cell.includes('3280.00'))).toBe(
        true,
      )

      const manualSheet = workbook.getWorksheet('手建产品')
      const manualValues = manualSheet!.getSheetValues().flat().map(String)
      expect(manualValues.some((cell) => cell.includes(manual.name))).toBe(true)
    })
  })
})

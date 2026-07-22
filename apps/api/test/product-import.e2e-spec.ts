import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { INestApplication } from '@nestjs/common'
import { PrismaClient, ProductStatus } from '@prisma/client'
import { authRequest, createTestApp, loginAs } from './helpers'

const FIXTURE_PATH = join(__dirname, 'fixtures/jiangyouji-daba-sample.xlsx')

const EXPECTED_SHEETS = [
  '北疆大巴纯玩线路',
  '南北疆大巴连线（单卧）',
  '北疆+喀什连线（单卧）',
  '喀什起止大巴、7座拼车',
  '伊宁起止大巴、7座拼车',
]

describe('Product Import Session (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  const testPrefix = `e2e-pimport-${Date.now()}`
  const createdSessionIds: string[] = []
  const createdProductIds: string[] = []
  const createdStoredObjectIds: string[] = []

  beforeAll(async () => {
    app = await createTestApp()
    prisma = new PrismaClient()
    coordinatorToken = await loginAs(app, 'wangjie')
    financeToken = await loginAs(app, 'acai')
  })

  afterAll(async () => {
    if (createdProductIds.length > 0) {
      await prisma.productSchedule.deleteMany({
        where: { productId: { in: createdProductIds } },
      })
      await prisma.productSpec.deleteMany({
        where: { productId: { in: createdProductIds } },
      })
      await prisma.product.deleteMany({
        where: { id: { in: createdProductIds } },
      })
    }
    if (createdSessionIds.length > 0) {
      await prisma.productImportSession.deleteMany({
        where: { id: { in: createdSessionIds } },
      })
    }
    if (createdStoredObjectIds.length > 0) {
      await prisma.storedObject.deleteMany({
        where: { id: { in: createdStoredObjectIds } },
      })
    }
    await prisma.$disconnect()
    await app.close()
  })

  it('rejects finance creating import sessions', async () => {
    await authRequest(app, financeToken)
      .post('/api/products/import-sessions')
      .attach('file', readFileSync(FIXTURE_PATH), {
        filename: `${testPrefix}.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      .expect(403)
  })

  it('uploads sample workbook, confirms draft products, and filters by batch/sheet', async () => {
    const upload = await authRequest(app, coordinatorToken)
      .post('/api/products/import-sessions')
      .attach('file', readFileSync(FIXTURE_PATH), {
        filename: `${testPrefix}-疆游记.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      .expect(201)

    expect(upload.body.code).toBe(0)
    const session = upload.body.data as {
      id: string
      status: string
      storedObjectId: string
      sheetCount: number
      parseResult: { sheets: Array<{ sheetName: string; lines: Array<{ candidateKey: string; name: string; shortItinerary: string; featuresText: string | null; schedules: Array<Record<string, unknown>> }> }> }
    }
    createdSessionIds.push(session.id)
    createdStoredObjectIds.push(session.storedObjectId)

    expect(session.status).toBe('pending_confirmation')
    expect(session.sheetCount).toBe(5)
    expect(session.parseResult.sheets.map((sheet) => sheet.sheetName)).toEqual(EXPECTED_SHEETS)

    // Confirm前不应落产品
    const beforeConfirm = await prisma.product.count({
      where: { importSessionId: session.id },
    })
    expect(beforeConfirm).toBe(0)

    const north = session.parseResult.sheets.find((sheet) => sheet.sheetName === '北疆大巴纯玩线路')
    expect(north).toBeDefined()
    const lineA = north!.lines.find((line) => line.name.includes('A线'))
    expect(lineA).toBeDefined()
    expect(lineA!.shortItinerary.length).toBeGreaterThan(0)
    expect(lineA!.schedules.length).toBeGreaterThan(0)

    const confirm = await authRequest(app, coordinatorToken)
      .post(`/api/products/import-sessions/${session.id}/confirm`)
      .send({
        lines: [
          {
            candidateKey: lineA!.candidateKey,
            action: 'accept',
            name: `${testPrefix}-${lineA!.name}`,
            shortItinerary: lineA!.shortItinerary,
            featuresText: lineA!.featuresText,
            tags: ['经典热卖款'],
            schedules: lineA!.schedules.map((schedule) => ({
              dateRuleText: schedule.dateRuleText,
              startDate: schedule.startDate,
              endDate: schedule.endDate,
              adultPriceCents: schedule.adultPriceCents,
              childPriceCents: schedule.childPriceCents,
              singleRoomSupplementCents: schedule.singleRoomSupplementCents,
              priceOnInquiry: schedule.priceOnInquiry,
              confirmed: true,
            })),
          },
          ...north!.lines
            .filter((line) => line.candidateKey !== lineA!.candidateKey)
            .slice(0, 2)
            .map((line) => ({
              candidateKey: line.candidateKey,
              action: 'skip' as const,
            })),
        ],
      })
      .expect(201)

    expect(confirm.body.data.session.status).toBe('confirmed')
    expect(confirm.body.data.createdProducts).toHaveLength(1)

    const product = confirm.body.data.createdProducts[0] as {
      id: string
      status: string
      importSessionId: string
      sourceSheetName: string
      shortItinerary: string
      schedules: unknown[]
    }
    createdProductIds.push(product.id)

    expect(product.status).toBe(ProductStatus.draft)
    expect(product.importSessionId).toBe(session.id)
    expect(product.sourceSheetName).toBe('北疆大巴纯玩线路')
    expect(product.shortItinerary).toContain('D1')
    expect(product.schedules.length).toBeGreaterThan(0)

    const byBatch = await authRequest(app, coordinatorToken)
      .get('/api/products')
      .query({ importSessionId: session.id })
      .expect(200)
    expect(byBatch.body.data.items.map((item: { id: string }) => item.id)).toContain(product.id)

    const bySheet = await authRequest(app, coordinatorToken)
      .get('/api/products')
      .query({
        importSessionId: session.id,
        sourceSheetName: '北疆大巴纯玩线路',
      })
      .expect(200)
    expect(bySheet.body.data.items).toHaveLength(1)

    const otherSheet = await authRequest(app, coordinatorToken)
      .get('/api/products')
      .query({
        importSessionId: session.id,
        sourceSheetName: '伊宁起止大巴、7座拼车',
      })
      .expect(200)
    expect(otherSheet.body.data.items).toHaveLength(0)

    // 原件可回看
    const original = await authRequest(app, coordinatorToken)
      .get(`/api/stored-objects/${session.storedObjectId}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
        res.on('end', () => callback(null, Buffer.concat(chunks)))
      })
      .expect(200)

    expect(Buffer.isBuffer(original.body)).toBe(true)
    expect((original.body as Buffer).byteLength).toBeGreaterThan(1000)
  })

  it('rejects confirm when accepted schedules omit price/date acknowledgment', async () => {
    const upload = await authRequest(app, coordinatorToken)
      .post('/api/products/import-sessions')
      .attach('file', readFileSync(FIXTURE_PATH), {
        filename: `${testPrefix}-unconfirmed.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      .expect(201)

    const session = upload.body.data as {
      id: string
      storedObjectId: string
      parseResult: {
        sheets: Array<{
          sheetName: string
          lines: Array<{
            candidateKey: string
            name: string
            shortItinerary: string
            featuresText: string | null
            schedules: Array<Record<string, unknown>>
          }>
        }>
      }
    }
    createdSessionIds.push(session.id)
    createdStoredObjectIds.push(session.storedObjectId)

    const north = session.parseResult.sheets.find((sheet) => sheet.sheetName === '北疆大巴纯玩线路')
    expect(north).toBeDefined()
    const lineA = north!.lines.find((line) => line.name.includes('A线'))
    expect(lineA).toBeDefined()

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/products/import-sessions/${session.id}/confirm`)
      .send({
        lines: [
          {
            candidateKey: lineA!.candidateKey,
            action: 'accept',
            name: `${testPrefix}-unconfirmed-${lineA!.name}`,
            shortItinerary: lineA!.shortItinerary,
            featuresText: lineA!.featuresText,
            tags: ['经典热卖款'],
            schedules: lineA!.schedules.map((schedule) => ({
              dateRuleText: schedule.dateRuleText,
              startDate: schedule.startDate,
              endDate: schedule.endDate,
              adultPriceCents: schedule.adultPriceCents,
              childPriceCents: schedule.childPriceCents,
              singleRoomSupplementCents: schedule.singleRoomSupplementCents,
              priceOnInquiry: schedule.priceOnInquiry,
              // intentionally omit confirmed
            })),
          },
        ],
      })
      .expect(400)

    expect(JSON.stringify(response.body)).toMatch(/confirmed/i)
    const productCount = await prisma.product.count({
      where: { importSessionId: session.id },
    })
    expect(productCount).toBe(0)
  })

  it('creates products only once under concurrent confirm requests', async () => {
    const upload = await authRequest(app, coordinatorToken)
      .post('/api/products/import-sessions')
      .attach('file', readFileSync(FIXTURE_PATH), {
        filename: `${testPrefix}-concurrent.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      .expect(201)

    const session = upload.body.data as {
      id: string
      storedObjectId: string
      parseResult: {
        sheets: Array<{
          sheetName: string
          lines: Array<{
            candidateKey: string
            name: string
            shortItinerary: string
            featuresText: string | null
            schedules: Array<Record<string, unknown>>
          }>
        }>
      }
    }
    createdSessionIds.push(session.id)
    createdStoredObjectIds.push(session.storedObjectId)

    const north = session.parseResult.sheets.find((sheet) => sheet.sheetName === '北疆大巴纯玩线路')
    expect(north).toBeDefined()
    const lineA = north!.lines.find((line) => line.name.includes('A线'))
    expect(lineA).toBeDefined()

    const payload = {
      lines: [
        {
          candidateKey: lineA!.candidateKey,
          action: 'accept' as const,
          name: `${testPrefix}-concurrent-${lineA!.name}`,
          shortItinerary: lineA!.shortItinerary,
          featuresText: lineA!.featuresText,
          tags: ['经典热卖款'],
          schedules: lineA!.schedules.map((schedule) => ({
            dateRuleText: schedule.dateRuleText,
            startDate: schedule.startDate,
            endDate: schedule.endDate,
            adultPriceCents: schedule.adultPriceCents,
            childPriceCents: schedule.childPriceCents,
            singleRoomSupplementCents: schedule.singleRoomSupplementCents,
            priceOnInquiry: schedule.priceOnInquiry,
            confirmed: true,
          })),
        },
      ],
    }

    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        authRequest(app, coordinatorToken)
          .post(`/api/products/import-sessions/${session.id}/confirm`)
          .send(payload),
      ),
    )

    const successResponses = responses.filter((response) => response.status === 201)
    const rejectedResponses = responses.filter((response) => response.status === 400)
    expect(successResponses).toHaveLength(1)
    expect(rejectedResponses).toHaveLength(7)
    expect(rejectedResponses.every((response) =>
      String(response.body.message).includes('不能重复确认'),
    )).toBe(true)

    const productIds = successResponses[0].body.data.createdProducts.map(
      (product: { id: string }) => product.id,
    ) as string[]
    createdProductIds.push(...productIds)

    const productCount = await prisma.product.count({
      where: { importSessionId: session.id },
    })
    expect(productCount).toBe(1)

    const refreshed = await prisma.productImportSession.findUniqueOrThrow({
      where: { id: session.id },
    })
    expect(refreshed.status).toBe('confirmed')
  })
})

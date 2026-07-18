import type { INestApplication } from '@nestjs/common'
import {
  CounterpartyType,
  DirectoryProfileStatus,
  PartnerKind,
  PartnerType,
  PaymentScheduleCloseDisposition,
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
} from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { authRequest, createTestApp, loginAs, uniqueBusinessPrefix } from './helpers'

describe('Partner reconciliation statement API (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let organizationId: string
  let ownerUserId: string
  let partnerId: string
  let otherPartnerId: string
  const testPrefix = `e2e-partner-recon-${Date.now()}`
  const PERIOD = { periodStart: '2026-06-01', periodEnd: '2026-07-31' }

  // 固定 fixtures（P1）：
  // D1 出团 2026-06-10：成人2×1000 + 儿童1×500，立减 300，split 客户已收 1200；两条客人名单（最早=游客代表）
  // D2 出团 2026-07-05：成人5×800，partner_settled；应收生成后关闭（照常列入不标记）；无客人名单
  // D3 出团 2026-05-20：周期外，不得列入
  // 干扰：D1 下另一 Partner 客源单；D1 下 P1 的手工其他应收（须排除）
  let departure1: { id: string; departureNo: string }
  let departure2: { id: string; departureNo: string }
  let departure3: { id: string; departureNo: string }
  let order1Id: string
  let order2Id: string

  async function createDeparture(name: string, startDate: string, endDate: string) {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name,
        routeName: '喀纳斯阿勒泰10日线',
        startDate,
        endDate,
        ownerUserId,
      })
      .expect(201)
    return response.body.data as { id: string; departureNo: string }
  }

  async function createOrder(
    departureId: string,
    payload: Record<string, unknown>,
  ): Promise<string> {
    const response = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/source-orders`)
      .send(payload)
      .expect(201)
    return response.body.data.id as string
  }

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

    const partner = await prisma.partner.create({
      data: {
        organizationId,
        name: `${testPrefix}-华东国旅`,
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.group_agency,
        status: DirectoryProfileStatus.active,
      },
    })
    partnerId = partner.id

    const otherPartner = await prisma.partner.create({
      data: {
        organizationId,
        name: `${testPrefix}-partner-second`,
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.group_agency,
        status: DirectoryProfileStatus.active,
      },
    })
    otherPartnerId = otherPartner.id

    departure1 = await createDeparture(`${testPrefix}-d1`, '2026-06-10', '2026-06-14')
    departure2 = await createDeparture(`${testPrefix}-d2`, '2026-07-05', '2026-07-09')
    departure3 = await createDeparture(`${testPrefix}-d3`, '2026-05-20', '2026-05-24')

    order1Id = await createOrder(departure1.id, {
      partnerId,
      adultGuestCount: 2,
      childGuestCount: 1,
      adultUnitPriceCents: 100000,
      childUnitPriceCents: 50000,
      discountType: SourceOrderDiscountType.lump_sum,
      discountCents: 30000,
      collectionMode: SourceOrderCollectionMode.split,
      partnerCollectedCents: 120000,
      notes: '窗口位',
    })
    // 客人名单两条：最早一条为游客代表
    await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${order1Id}/guests`)
      .send({ name: '陈志明', phone: '13800002211' })
      .expect(201)
    await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${order1Id}/guests`)
      .send({ name: '林晓芳', phone: '13900008876' })
      .expect(201)

    order2Id = await createOrder(departure2.id, {
      partnerId,
      adultGuestCount: 5,
      childGuestCount: 0,
      adultUnitPriceCents: 80000,
      childUnitPriceCents: 0,
      discountType: SourceOrderDiscountType.none,
      collectionMode: SourceOrderCollectionMode.partner_settled,
    })
    // 应收生成后关闭：确认单照常列入、不做标记
    const generated = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${order2Id}/generate-receivables`)
      .expect(201)
    const scheduleId = generated.body.data.schedules[0].id as string
    // ADR-0023: 关闭节点是财务动作，用 financeToken（计调已无 /finance/* 菜单）
    await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${scheduleId}/cancel`)
      .send({
        closeDisposition: PaymentScheduleCloseDisposition.external_or_special,
        cancelReason: 'e2e 关闭应收',
      })
      .expect(201)

    // 周期外客源单：不得列入
    await createOrder(departure3.id, {
      partnerId,
      adultGuestCount: 1,
      childGuestCount: 0,
      adultUnitPriceCents: 60000,
      childUnitPriceCents: 0,
      discountType: SourceOrderDiscountType.none,
      collectionMode: SourceOrderCollectionMode.guest_only,
    })
    // 干扰：同发团另一 Partner 的客源单
    await createOrder(departure1.id, {
      partnerId: otherPartnerId,
      adultGuestCount: 9,
      childGuestCount: 0,
      adultUnitPriceCents: 999900,
      childUnitPriceCents: 0,
      discountType: SourceOrderDiscountType.none,
      collectionMode: SourceOrderCollectionMode.guest_only,
    })
    // 手工其他应收（无客源单载体）：确认单必须排除
    await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send({
        departureId: departure1.id,
        title: `${testPrefix}-手工其他应收`,
        amountCents: 88800,
        dueDate: '2026-07-10',
        counterpartyType: CounterpartyType.partner,
        counterpartyId: partnerId,
        counterpartyName: `${testPrefix}-华东国旅`,
      })
      .expect(201)
  })

  afterAll(async () => {
    await prisma.financeVerification.deleteMany({
      where: {
        organizationId,
        paymentSchedule: {
          departure: { organizationId, name: { startsWith: testPrefix } },
        },
      },
    })
    await prisma.paymentSchedule.deleteMany({
      where: {
        organizationId,
        departure: { name: { startsWith: testPrefix } },
      },
    })
    await prisma.sourceOrderGuest.deleteMany({
      where: {
        sourceOrder: {
          departure: { organizationId, name: { startsWith: testPrefix } },
        },
      },
    })
    await prisma.sourceOrder.deleteMany({
      where: {
        departure: { organizationId, name: { startsWith: testPrefix } },
      },
    })
    await prisma.departure.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.partner.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.$disconnect()
    await app.close()
  })

  describe('permission and validation boundaries', () => {
    it('rejects users without /partner menu permission', async () => {
      const { hash } = await import('bcryptjs')
      const password = 'admin123'
      const username = `${testPrefix}-noperm`
      const user = await prisma.user.create({
        data: {
          organizationId,
          username,
          passwordHash: await hash(password, 10),
          name: '无合作伙伴权限用户',
        },
      })

      const token = await loginAs(app, username, password)
      await authRequest(app, token)
        .get(`/api/partners/${partnerId}/reconciliation-statement`)
        .query(PERIOD)
        .expect(403)
      await authRequest(app, token)
        .get(`/api/partners/${partnerId}/reconciliation-statement.xlsx`)
        .query(PERIOD)
        .expect(403)

      await prisma.user.delete({ where: { id: user.id } })
    })

    it('allows finance role under ADR-0016 early-launch menus', async () => {
      await authRequest(app, financeToken)
        .get(`/api/partners/${partnerId}/reconciliation-statement`)
        .query(PERIOD)
        .expect(200)
    })

    it('returns 404 for unknown partner', async () => {
      const response = await authRequest(app, coordinatorToken)
        .get('/api/partners/nonexistent-partner-id/reconciliation-statement')
        .query(PERIOD)
        .expect(404)

      expect(response.body.message).toBe('合作伙伴不存在')
    })

    it('returns 404 for partner in another organization', async () => {
      const otherOrg = await prisma.organization.create({
        data: {
          name: `${testPrefix}-other-org`,
          businessPrefix: uniqueBusinessPrefix(`${testPrefix}`),
        },
      })
      const foreignPartner = await prisma.partner.create({
        data: {
          organizationId: otherOrg.id,
          name: `${testPrefix}-foreign`,
          partnerKind: PartnerKind.group_agent,
          partnerType: PartnerType.group_agency,
          status: DirectoryProfileStatus.active,
        },
      })

      await authRequest(app, coordinatorToken)
        .get(`/api/partners/${foreignPartner.id}/reconciliation-statement`)
        .query(PERIOD)
        .expect(404)

      await prisma.partner.delete({ where: { id: foreignPartner.id } })
      await prisma.organization.delete({ where: { id: otherOrg.id } })
    })

    it('returns 400 when period is missing (both endpoints)', async () => {
      await authRequest(app, coordinatorToken)
        .get(`/api/partners/${partnerId}/reconciliation-statement`)
        .expect(400)
      await authRequest(app, coordinatorToken)
        .get(`/api/partners/${partnerId}/reconciliation-statement`)
        .query({ periodStart: '2026-06-01' })
        .expect(400)
      await authRequest(app, coordinatorToken)
        .get(`/api/partners/${partnerId}/reconciliation-statement.xlsx`)
        .query({ periodEnd: '2026-07-31' })
        .expect(400)
    })

    it('returns 400 when period range is invalid (start after end)', async () => {
      const response = await authRequest(app, coordinatorToken)
        .get(`/api/partners/${partnerId}/reconciliation-statement`)
        .query({ periodStart: '2026-08-01', periodEnd: '2026-07-31' })
        .expect(400)

      expect(response.body.code).toBe(400)
    })

    it('returns 400 when period is not a plain YYYY-MM-DD date', async () => {
      await authRequest(app, coordinatorToken)
        .get(`/api/partners/${partnerId}/reconciliation-statement`)
        .query({ periodStart: '2026-06-01T10:00:00Z', periodEnd: '2026-07-31' })
        .expect(400)
    })
  })

  describe('JSON snapshot', () => {
    it('covers all source orders in period sorted by departure date asc, closed receivable included without marker', async () => {
      const response = await authRequest(app, coordinatorToken)
        .get(`/api/partners/${partnerId}/reconciliation-statement`)
        .query(PERIOD)
        .expect(200)

      const snapshot = response.body.data
      expect(snapshot.partnerId).toBe(partnerId)
      expect(snapshot.partnerName).toBe(`${testPrefix}-华东国旅`)
      expect(snapshot.periodStart).toBe('2026-06-01')
      expect(snapshot.periodEnd).toBe('2026-07-31')
      expect(typeof snapshot.organizationName).toBe('string')
      expect(snapshot.organizationName.length).toBeGreaterThan(0)

      // 行范围＝周期内全部客源单（D3 周期外排除；另一 Partner 排除），按出团日期正序
      expect(snapshot.rows).toHaveLength(2)
      expect(snapshot.rows.map((row: { departureDate: string }) => row.departureDate)).toEqual([
        '2026-06-10',
        '2026-07-05',
      ])

      const [row1, row2] = snapshot.rows
      expect(row1).toMatchObject({
        sourceOrderId: order1Id,
        departureId: departure1.id,
        departureNo: departure1.departureNo,
        routeName: '喀纳斯阿勒泰10日线',
        adultGuestCount: 2,
        childGuestCount: 1,
        totalGuestCount: 3,
        adultUnitPriceCents: 100000,
        childUnitPriceCents: 50000,
        originalReceivableCents: 250000,
        discountCents: 30000,
        actualReceivableCents: 220000,
        customerDepositCents: 120000,
        guestCollectCents: 100000,
        notes: '窗口位',
      })

      // 应收已关闭的客源单照常列入、金额如实、不做标记
      expect(row2).toMatchObject({
        sourceOrderId: order2Id,
        originalReceivableCents: 400000,
        actualReceivableCents: 400000,
        customerDepositCents: 400000,
        guestCollectCents: 0,
      })
      expect(row2).not.toHaveProperty('receivableStatus')
    })

    it('every row is recomputable: original = adult×price + child×price, actual = original − discount, guest collect = actual − deposit', async () => {
      const response = await authRequest(app, coordinatorToken)
        .get(`/api/partners/${partnerId}/reconciliation-statement`)
        .query(PERIOD)
        .expect(200)

      for (const row of response.body.data.rows) {
        expect(row.originalReceivableCents).toBe(
          row.adultGuestCount * row.adultUnitPriceCents +
            row.childGuestCount * row.childUnitPriceCents,
        )
        expect(row.actualReceivableCents).toBe(
          row.originalReceivableCents - row.discountCents,
        )
        expect(row.guestCollectCents).toBe(
          row.actualReceivableCents - row.customerDepositCents,
        )
        expect(row.totalGuestCount).toBe(row.adultGuestCount + row.childGuestCount)
      }
    })

    it('guest representative takes the earliest guest; empty list leaves it null; manual other receivable excluded from totals', async () => {
      const response = await authRequest(app, coordinatorToken)
        .get(`/api/partners/${partnerId}/reconciliation-statement`)
        .query(PERIOD)
        .expect(200)

      const snapshot = response.body.data
      const [row1, row2] = snapshot.rows
      expect(row1.guestRepresentativeName).toBe('陈志明')
      expect(row1.guestRepresentativePhone).toBe('13800002211')
      expect(row2.guestRepresentativeName).toBeNull()
      expect(row2.guestRepresentativePhone).toBeNull()

      // 手工其他应收 88800 分不得混入任何合计
      expect(snapshot.totals).toMatchObject({
        orderCount: 2,
        adultGuestCount: 7,
        childGuestCount: 1,
        totalGuestCount: 8,
        originalReceivableCents: 650000,
        discountCents: 30000,
        actualReceivableCents: 620000,
        customerDepositCents: 520000,
        guestCollectCents: 100000,
      })
    })

    it('generates title by period rule: same month / same year cross month / cross year', async () => {
      const sameMonth = await authRequest(app, coordinatorToken)
        .get(`/api/partners/${partnerId}/reconciliation-statement`)
        .query({ periodStart: '2026-06-01', periodEnd: '2026-06-30' })
        .expect(200)
      expect(sameMonth.body.data.title).toBe('2026年6月往来账确认单')

      const crossMonth = await authRequest(app, coordinatorToken)
        .get(`/api/partners/${partnerId}/reconciliation-statement`)
        .query(PERIOD)
        .expect(200)
      expect(crossMonth.body.data.title).toBe('2026年6-7月往来账确认单')

      const crossYear = await authRequest(app, coordinatorToken)
        .get(`/api/partners/${partnerId}/reconciliation-statement`)
        .query({ periodStart: '2026-12-01', periodEnd: '2027-01-31' })
        .expect(200)
      expect(crossYear.body.data.title).toBe('2026年12月-2027年1月往来账确认单')
    })

    it('returns empty rows with zero totals when no source order falls in period', async () => {
      const response = await authRequest(app, coordinatorToken)
        .get(`/api/partners/${partnerId}/reconciliation-statement`)
        .query({ periodStart: '2027-06-01', periodEnd: '2027-06-30' })
        .expect(200)

      const snapshot = response.body.data
      expect(snapshot.rows).toHaveLength(0)
      expect(snapshot.totals.orderCount).toBe(0)
      expect(snapshot.totals.actualReceivableCents).toBe(0)
    })
  })

  describe('xlsx export', () => {
    it('downloads a valid workbook with title, 17-column header, totals row and print setup', async () => {
      const ExcelJS = await import('exceljs')
      const response = await authRequest(app, coordinatorToken)
        .get(`/api/partners/${partnerId}/reconciliation-statement.xlsx`)
        .query(PERIOD)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
          res.on('end', () => callback(null, Buffer.concat(chunks)))
        })
        .expect(200)

      expect(response.headers['content-type']).toMatch(
        /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/,
      )
      const disposition = String(response.headers['content-disposition'] ?? '')
      expect(disposition).toMatch(/attachment/)
      expect(disposition).toContain(encodeURIComponent('往来账确认单'))
      const filenameStar = disposition.match(/filename\*=UTF-8''([^;]+)/)?.[1] ?? ''
      const decodedFilename = decodeURIComponent(filenameStar)
      expect(decodedFilename).toContain('往来账确认单')
      expect(decodedFilename).toContain('2026-06-01至2026-07-31')
      expect(decodedFilename).toMatch(/\.xlsx$/)

      expect(Buffer.isBuffer(response.body)).toBe(true)
      // 不得是全局 JSON envelope
      expect(response.body.subarray(0, 1).toString('utf8')).not.toBe('{')

      const workbook = new ExcelJS.Workbook()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await workbook.xlsx.load(response.body as any)
      expect(workbook.worksheets).toHaveLength(1)
      const worksheet = workbook.worksheets[0]
      expect(worksheet.name).toBe('往来账确认单')

      // 打印规格：A4 横向、宽度一页、高度自然分页、页脚页码
      expect(worksheet.pageSetup.orientation).toBe('landscape')
      expect(worksheet.pageSetup.paperSize).toBe(9)
      expect(worksheet.pageSetup.fitToWidth).toBe(1)
      expect(worksheet.pageSetup.fitToHeight).toBe(0)
      expect(worksheet.headerFooter.oddFooter).toContain('&P')

      // 标题按周期规则生成（同年跨月）
      expect(worksheet.getCell(1, 1).value).toBe('2026年6-7月往来账确认单')

      // 17 列表头整行匹配，且被设置为分页重复表头
      const expectedHeaders = [
        '序号',
        '出团日期',
        '团单编号',
        '线路/团单名称',
        '游客代表',
        '联系电话',
        '成人',
        '儿童',
        '合计',
        '拼入单价（成人）',
        '拼入单价（儿童）',
        '原始应收（拼入合计）',
        '优惠金额',
        '实际应收',
        '客户已收押金',
        '游客代收',
        '备注',
      ]
      let headerRowNumber = 0
      worksheet.eachRow((row, rowNumber) => {
        if (row.getCell(1).value === '序号') {
          headerRowNumber = rowNumber
        }
      })
      expect(headerRowNumber).toBeGreaterThan(0)
      const headerValues = expectedHeaders.map(
        (_, index) => worksheet.getRow(headerRowNumber).getCell(index + 1).value,
      )
      expect(headerValues).toEqual(expectedHeaders)
      expect(worksheet.pageSetup.printTitlesRow).toContain(String(headerRowNumber))

      const cellTexts: string[] = []
      const moneyCells: Array<{ value: number; numFmt?: string }> = []
      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          const text = cell.text?.trim() || String(cell.value ?? '').trim()
          if (text) {
            cellTexts.push(text)
          }
          if (typeof cell.value === 'number') {
            moneyCells.push({ value: cell.value, numFmt: cell.numFmt })
          }
        })
      })

      // 六项汇总、确认说明、双方签章栏
      for (const label of ['客源单数', '总人数', '拼入合计', '优惠合计', '实际应收', '游客代收']) {
        expect(cellTexts).toContain(label)
      }
      expect(cellTexts).toContain('确认说明')
      expect(cellTexts.some((text) => text.startsWith('我方确认（盖章）：'))).toBe(true)
      expect(
        cellTexts.some((text) =>
          text.startsWith(`客户确认（盖章）：${testPrefix}-华东国旅`),
        ),
      ).toBe(true)

      // 合计行：实际应收合计 6200 元；金额使用 ¥ 数字格式；儿童数为 0 的行儿童单价显示「-」
      expect(cellTexts).toContain('合计')
      expect(moneyCells.some((cell) => cell.value === 6200)).toBe(true)
      expect(
        moneyCells.some(
          (cell) => typeof cell.numFmt === 'string' && cell.numFmt.includes('¥'),
        ),
      ).toBe(true)

      const order2RowNumber = (() => {
        let found = 0
        worksheet.eachRow((row, rowNumber) => {
          if (row.getCell(2).value === '2026-07-05') {
            found = rowNumber
          }
        })
        return found
      })()
      expect(order2RowNumber).toBeGreaterThan(0)
      expect(worksheet.getRow(order2RowNumber).getCell(11).value).toBe('-')

      // 游客代表取最早名单；干扰 Partner 数据不得出现
      expect(cellTexts).toContain('陈志明')
      expect(cellTexts).not.toContain('林晓芳')
      expect(moneyCells.some((cell) => cell.value === 9999)).toBe(false)
    })
  })
})

/**
 * PROTOTYPE — 往来账确认单版式样张（wayfinder #113）。
 *
 * 一次性脚本：用假数据渲染《往来账确认单》xlsx，供与客户模板
 * 「ider/月度往来账确认单_优化版.xlsx」并排对照评审版式。定稿后删除本文件。
 *
 * 版式基于客户模板，套用 #112 数据口径决议的两处改动：
 * 删「客源单号」列；「拼入单价」拆成成人/儿童两列。
 *
 * 运行：pnpm -C apps/api exec tsx scripts/prototype-reconciliation-statement.ts
 * 输出：仓库根 tmp/PROTOTYPE-往来账确认单-样张.xlsx
 */
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import ExcelJS from 'exceljs'

// ---------- 假数据 ----------

interface SampleRow {
  departureDate: string // 出团日期
  departureNo: string // 团单编号
  routeName: string // 线路/团单名称
  guestRepName: string // 游客代表
  guestRepPhone: string // 联系电话
  adultCount: number
  childCount: number
  adultUnitPriceCents: number // 拼入单价（成人）
  childUnitPriceCents: number // 拼入单价（儿童）
  discountCents: number // 优惠金额
  customerDepositCents: number // 客户已收押金（=系统「客户补款」）
  notes: string
}

const PARTNER_NAME = '杭州漫游国际旅行社有限公司'
const ORG_NAME = '厦门小团宝旅行社有限公司'
const PERIOD_START = '2026-06-01'
const PERIOD_END = '2026-07-31'

const ROWS: SampleRow[] = [
  {
    departureDate: '2026-06-03',
    departureNo: 'XTB20260603001',
    routeName: '厦门鼓浪屿+环岛路纯玩3日',
    guestRepName: '陈志明',
    guestRepPhone: '13800002211',
    adultCount: 4,
    childCount: 1,
    adultUnitPriceCents: 128_000,
    childUnitPriceCents: 88_000,
    discountCents: 20_000,
    customerDepositCents: 100_000,
    notes: '',
  },
  {
    departureDate: '2026-06-08',
    departureNo: 'XTB20260608001',
    routeName: '云水谣土楼一日',
    guestRepName: '林晓芳',
    guestRepPhone: '13900008876',
    adultCount: 12,
    childCount: 0,
    adultUnitPriceCents: 36_800,
    childUnitPriceCents: 0,
    discountCents: 0,
    customerDepositCents: 200_000,
    notes: '含午餐',
  },
  {
    departureDate: '2026-06-15',
    departureNo: 'XTB20260615001',
    routeName: '武夷山双高4日',
    guestRepName: '王建国',
    guestRepPhone: '13700000345',
    adultCount: 6,
    childCount: 2,
    adultUnitPriceCents: 218_000,
    childUnitPriceCents: 158_000,
    discountCents: 50_000,
    customerDepositCents: 400_000,
    notes: '升级一晚山景房',
  },
  {
    // 名单未录入：游客代表/电话留空（#112 决议：名单空则留空）
    departureDate: '2026-06-15',
    departureNo: 'XTB20260615001',
    routeName: '武夷山双高4日',
    guestRepName: '',
    guestRepPhone: '',
    adultCount: 2,
    childCount: 0,
    adultUnitPriceCents: 218_000,
    childUnitPriceCents: 0,
    discountCents: 0,
    customerDepositCents: 0,
    notes: '',
  },
  {
    // 应收已关闭的客源单：照常列入、不做任何标记（#112 决议）
    departureDate: '2026-06-22',
    departureNo: 'XTB20260622001',
    routeName: '厦门亲子研学2日',
    guestRepName: '赵丽',
    guestRepPhone: '15000006690',
    adultCount: 8,
    childCount: 8,
    adultUnitPriceCents: 78_000,
    childUnitPriceCents: 68_000,
    discountCents: 40_000,
    customerDepositCents: 300_000,
    notes: '',
  },
  {
    departureDate: '2026-07-02',
    departureNo: 'XTB20260702001',
    routeName: '平潭岛环岛2日',
    guestRepName: '孙海涛',
    guestRepPhone: '13600004412',
    adultCount: 10,
    childCount: 3,
    adultUnitPriceCents: 96_000,
    childUnitPriceCents: 66_000,
    discountCents: 30_000,
    customerDepositCents: 350_000,
    notes: '',
  },
  {
    departureDate: '2026-07-11',
    departureNo: 'XTB20260711001',
    routeName: '泉州世遗文化1日',
    guestRepName: '周敏',
    guestRepPhone: '13300009021',
    adultCount: 20,
    childCount: 0,
    adultUnitPriceCents: 29_800,
    childUnitPriceCents: 0,
    discountCents: 19_600,
    customerDepositCents: 200_000,
    notes: '团队价',
  },
  {
    departureDate: '2026-07-25',
    departureNo: 'XTB20260725001',
    routeName: '厦门鼓浪屿+环岛路纯玩3日',
    guestRepName: '陈志明',
    guestRepPhone: '13800002211',
    adultCount: 5,
    childCount: 2,
    adultUnitPriceCents: 128_000,
    childUnitPriceCents: 88_000,
    discountCents: 0,
    customerDepositCents: 250_000,
    notes: '回头客',
  },
]

// ---------- 派生口径（客户模板「字段说明」sheet 的映射） ----------

function originalReceivableCents(r: SampleRow): number {
  // 原始应收（拼入合计）= 成人×成人价 + 儿童×儿童价（逐行可复算）
  return r.adultCount * r.adultUnitPriceCents + r.childCount * r.childUnitPriceCents
}

function actualReceivableCents(r: SampleRow): number {
  // 实际应收 = 原始应收 − 优惠金额
  return originalReceivableCents(r) - r.discountCents
}

function guestCollectCents(r: SampleRow): number {
  // 游客代收 = 实际应收 − 客户已收押金
  return actualReceivableCents(r) - r.customerDepositCents
}

// ---------- 版式 ----------

const PAPER_SIZE_A4 = 9
const RMB_NUM_FMT = '¥#,##0.00'
// 客户模板 17 列：删「客源单号」、拼入单价拆两列后仍为 17 列
const COL_COUNT = 17

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF666666' } },
  left: { style: 'thin', color: { argb: 'FF666666' } },
  bottom: { style: 'thin', color: { argb: 'FF666666' } },
  right: { style: 'thin', color: { argb: 'FF666666' } },
}

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFECECEC' },
}

function statementTitle(start: string, end: string): string {
  const [sy, sm] = [Number(start.slice(0, 4)), Number(start.slice(5, 7))]
  const [ey, em] = [Number(end.slice(0, 4)), Number(end.slice(5, 7))]
  if (sy === ey && sm === em) return `${sy}年${sm}月往来账确认单`
  if (sy === ey) return `${sy}年${sm}-${em}月往来账确认单`
  return `${sy}年${sm}月-${ey}年${em}月往来账确认单`
}

function centsToYuan(cents: number): number {
  return cents / 100
}

function money(cell: ExcelJS.Cell, cents: number): void {
  cell.value = centsToYuan(cents)
  cell.numFmt = RMB_NUM_FMT
  cell.alignment = { horizontal: 'right', vertical: 'middle' }
}

function headerChrome(cell: ExcelJS.Cell): void {
  cell.border = { ...THIN_BORDER }
  cell.fill = HEADER_FILL
  cell.font = { ...(cell.font ?? {}), bold: true }
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
}

async function main(): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = ORG_NAME
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('往来账确认单', {
    views: [{ state: 'normal', showGridLines: false }],
  })

  sheet.columns = [
    { width: 6 }, // 1 序号
    { width: 11 }, // 2 出团日期
    { width: 16 }, // 3 团单编号
    { width: 22 }, // 4 线路/团单名称
    { width: 10 }, // 5 游客代表
    { width: 13 }, // 6 联系电话
    { width: 6 }, // 7 成人
    { width: 6 }, // 8 儿童
    { width: 6 }, // 9 合计
    { width: 11 }, // 10 拼入单价（成人）
    { width: 11 }, // 11 拼入单价（儿童）
    { width: 13 }, // 12 原始应收（拼入合计）
    { width: 11 }, // 13 优惠金额
    { width: 12 }, // 14 实际应收
    { width: 12 }, // 15 客户已收押金
    { width: 12 }, // 16 游客代收
    { width: 24 }, // 17 备注
  ]

  sheet.pageSetup = {
    paperSize: PAPER_SIZE_A4,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
  }
  sheet.headerFooter = {
    oddFooter: '&C第 &P 页 / 共 &N 页',
  }

  let row = 1

  // 标题（周期自动生成，格式沿客户模板）
  sheet.mergeCells(row, 1, row, COL_COUNT)
  const titleCell = sheet.getCell(row, 1)
  titleCell.value = statementTitle(PERIOD_START, PERIOD_END)
  titleCell.font = { bold: true, size: 16 }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getRow(row).height = 30
  row += 1

  // 抬头单行（沿客户模板：合作方＋对账周期＋导出时间）
  sheet.mergeCells(row, 1, row, COL_COUNT)
  const metaCell = sheet.getCell(row, 1)
  metaCell.value = `合作方：${PARTNER_NAME}    对账周期：${PERIOD_START} 至 ${PERIOD_END}（按出团日期）    导出时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`
  metaCell.alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getRow(row).height = 20
  row += 2

  // 表头汇总区（六项，沿客户模板两行版式）
  const totals = {
    orderCount: ROWS.length,
    guestCount: ROWS.reduce((s, r) => s + r.adultCount + r.childCount, 0),
    adultCount: ROWS.reduce((s, r) => s + r.adultCount, 0),
    childCount: ROWS.reduce((s, r) => s + r.childCount, 0),
    originalCents: ROWS.reduce((s, r) => s + originalReceivableCents(r), 0),
    discountCents: ROWS.reduce((s, r) => s + r.discountCents, 0),
    actualCents: ROWS.reduce((s, r) => s + actualReceivableCents(r), 0),
    depositCents: ROWS.reduce((s, r) => s + r.customerDepositCents, 0),
    guestCollectCents: ROWS.reduce((s, r) => s + guestCollectCents(r), 0),
  }

  const summaryItems: Array<{ label: string; write: (cell: ExcelJS.Cell) => void }> = [
    { label: '客源单数', write: (c) => (c.value = totals.orderCount) },
    { label: '总人数', write: (c) => (c.value = totals.guestCount) },
    { label: '拼入合计', write: (c) => money(c, totals.originalCents) },
    { label: '优惠合计', write: (c) => money(c, totals.discountCents) },
    { label: '实际应收', write: (c) => money(c, totals.actualCents) },
    { label: '游客代收', write: (c) => money(c, totals.guestCollectCents) },
  ]
  const summarySpans: Array<[number, number]> = [
    [1, 3],
    [4, 6],
    [7, 9],
    [10, 12],
    [13, 15],
    [16, 17],
  ]
  const summaryLabelRow = row
  const summaryValueRow = row + 1
  summaryItems.forEach((item, i) => {
    const [from, to] = summarySpans[i]
    sheet.mergeCells(summaryLabelRow, from, summaryLabelRow, to)
    const labelCell = sheet.getCell(summaryLabelRow, from)
    labelCell.value = item.label
    headerChrome(labelCell)
    sheet.mergeCells(summaryValueRow, from, summaryValueRow, to)
    const valueCell = sheet.getCell(summaryValueRow, from)
    item.write(valueCell)
    valueCell.alignment = { horizontal: 'center', vertical: 'middle' }
    valueCell.font = { bold: true, size: 12 }
    valueCell.border = { ...THIN_BORDER }
  })
  sheet.getRow(summaryValueRow).height = 24
  row = summaryValueRow + 2

  // 明细表（客户模板 17 列，删「客源单号」，拼入单价拆成人/儿童）
  const headers = [
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
  const headerRow = row
  headers.forEach((h, i) => headerChrome(Object.assign(sheet.getCell(headerRow, i + 1), { value: h })))
  sheet.getRow(headerRow).height = 30
  // 分页打印时每页重复明细表头
  sheet.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`
  row += 1

  const sorted = [...ROWS].sort((a, b) => a.departureDate.localeCompare(b.departureDate))
  sorted.forEach((r, index) => {
    sheet.getCell(row, 1).value = index + 1
    sheet.getCell(row, 2).value = r.departureDate
    sheet.getCell(row, 3).value = r.departureNo
    sheet.getCell(row, 4).value = r.routeName
    sheet.getCell(row, 5).value = r.guestRepName || ''
    sheet.getCell(row, 6).value = r.guestRepPhone || ''
    sheet.getCell(row, 7).value = r.adultCount
    sheet.getCell(row, 8).value = r.childCount
    sheet.getCell(row, 9).value = r.adultCount + r.childCount
    money(sheet.getCell(row, 10), r.adultUnitPriceCents)
    if (r.childCount > 0) {
      money(sheet.getCell(row, 11), r.childUnitPriceCents)
    } else {
      sheet.getCell(row, 11).value = '-'
      sheet.getCell(row, 11).alignment = { horizontal: 'center', vertical: 'middle' }
    }
    money(sheet.getCell(row, 12), originalReceivableCents(r))
    money(sheet.getCell(row, 13), r.discountCents)
    money(sheet.getCell(row, 14), actualReceivableCents(r))
    money(sheet.getCell(row, 15), r.customerDepositCents)
    money(sheet.getCell(row, 16), guestCollectCents(r))
    sheet.getCell(row, 17).value = r.notes
    for (let col = 1; col <= COL_COUNT; col += 1) {
      const cell = sheet.getCell(row, col)
      cell.border = { ...THIN_BORDER }
      cell.alignment = { ...(cell.alignment ?? {}), vertical: 'middle', wrapText: true }
      if (col === 1 || (col >= 7 && col <= 9)) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
      }
    }
    sheet.getRow(row).height = 20
    row += 1
  })

  // 合计行（沿客户模板：人数三列求和，单价两列留空，金额五列求和）
  const totalRow = row
  sheet.mergeCells(totalRow, 1, totalRow, 6)
  const totalLabel = sheet.getCell(totalRow, 1)
  totalLabel.value = '合计'
  totalLabel.alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getCell(totalRow, 7).value = totals.adultCount
  sheet.getCell(totalRow, 8).value = totals.childCount
  sheet.getCell(totalRow, 9).value = totals.guestCount
  money(sheet.getCell(totalRow, 12), totals.originalCents)
  money(sheet.getCell(totalRow, 13), totals.discountCents)
  money(sheet.getCell(totalRow, 14), totals.actualCents)
  money(sheet.getCell(totalRow, 15), totals.depositCents)
  money(sheet.getCell(totalRow, 16), totals.guestCollectCents)
  for (let col = 1; col <= COL_COUNT; col += 1) {
    const cell = sheet.getCell(totalRow, col)
    cell.border = { ...THIN_BORDER }
    cell.fill = HEADER_FILL
    cell.font = { ...(cell.font ?? {}), bold: true }
    if (col >= 7 && col <= 9) {
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    }
  }
  sheet.getRow(totalRow).height = 22
  row = totalRow + 2

  // 确认说明（首句沿客户模板，补一行计算口径便于对方复核）
  sheet.mergeCells(row, 1, row, COL_COUNT)
  const noteTitle = sheet.getCell(row, 1)
  noteTitle.value = '确认说明'
  noteTitle.font = { bold: true, size: 11 }
  headerChrome(noteTitle)
  noteTitle.alignment = { horizontal: 'left', vertical: 'middle' }
  row += 1
  const noteLines = [
    '1. 请核对以上团单、人数、拼入单价、优惠及应收金额。如有异议，请在收到确认单后 3 个工作日内反馈；',
    '2. 实际应收＝原始应收（拼入合计）－优惠金额；游客代收＝实际应收－客户已收押金；',
    '3. 本确认单为截至导出时间的业务约定金额与收款拆分，不含双方收付款进度。',
  ]
  sheet.mergeCells(row, 1, row, COL_COUNT)
  const noteCell = sheet.getCell(row, 1)
  noteCell.value = noteLines.join('\n')
  noteCell.alignment = { wrapText: true, vertical: 'top' }
  noteCell.border = { ...THIN_BORDER }
  sheet.getRow(row).height = noteLines.length * 16 + 8
  row += 2

  // 双方签章栏（沿客户模板左右两块）
  const signRow = row
  sheet.mergeCells(signRow, 1, signRow + 2, 6)
  const issuerSign = sheet.getCell(signRow, 1)
  issuerSign.value = `我方确认（盖章）：${ORG_NAME}\n确认人：____________\n确认日期：____年__月__日`
  issuerSign.alignment = { wrapText: true, vertical: 'top' }
  issuerSign.border = { ...THIN_BORDER }
  sheet.mergeCells(signRow, 12, signRow + 2, COL_COUNT)
  const partnerSign = sheet.getCell(signRow, 12)
  partnerSign.value = `客户确认（盖章）：${PARTNER_NAME}\n确认人：____________\n确认日期：____年__月__日`
  partnerSign.alignment = { wrapText: true, vertical: 'top' }
  partnerSign.border = { ...THIN_BORDER }
  sheet.getRow(signRow).height = 24
  sheet.getRow(signRow + 1).height = 24
  sheet.getRow(signRow + 2).height = 24

  const outDir = resolve(__dirname, '../../../tmp')
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(outDir, 'PROTOTYPE-往来账确认单-样张.xlsx')
  await workbook.xlsx.writeFile(outPath)
  console.log(`样张已生成：${outPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

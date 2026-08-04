import ExcelJS from 'exceljs'
import { triggerBrowserDownload } from '@/lib/request'
import { summarizeRouteLedgerUnitPrices } from '../../utils/route-ledger-inbound-price-formula'
import {
  COST_SCOPE_COLUMN_LABEL,
  formatReportTitlePrefix,
  type ProtoDepartureReport,
} from './shared'

/** 贴近客户现有日报表：橙黄标题 + 白底黑字 + 黑色细边框。 */
const COLORS = {
  titleBg: 'FFFFC000',
  sectionBg: 'FFFFE699',
  subHeaderBg: 'FFFFF2CC',
  totalBg: 'FFFFE699',
  headerBg: 'FFFFFFFF',
  bodyBg: 'FFFFFFFF',
  border: 'FF000000',
  text: 'FF000000',
  mutedText: 'FF595959',
} as const

const FONT_FAMILY = '宋体'

const FONT = {
  title: { name: FONT_FAMILY, size: 14, bold: true, color: { argb: COLORS.text } },
  section: { name: FONT_FAMILY, size: 11, bold: true, color: { argb: COLORS.text } },
  header: { name: FONT_FAMILY, size: 10, bold: true, color: { argb: COLORS.text } },
  subHeader: { name: FONT_FAMILY, size: 10, bold: true, color: { argb: COLORS.text } },
  body: { name: FONT_FAMILY, size: 10, color: { argb: COLORS.text } },
  total: { name: FONT_FAMILY, size: 10, bold: true, color: { argb: COLORS.text } },
  meta: { name: FONT_FAMILY, size: 10, color: { argb: COLORS.mutedText } },
} as const

const INCOME_COL_COUNT = 13
const MONEY_FMT = '¥#,##0.00'
const PRICE_FMT = '#,##0.##'

const COST_HEADERS = [
  '序号',
  COST_SCOPE_COLUMN_LABEL,
  '资源类型',
  '项目',
  '供应商',
  '金额',
  '备注',
] as const

const OUTSOURCE_HEADERS = ['序号', '拼出方', '说明', '金额', '备注'] as const

/**
 * 全 Sheet 共用列宽。执行成本/拼出往来复用前几列，故 3–6 列需兼顾
 * 「说明 / 项目 / 供应商 / 金额」等内容，避免 ##### 或换行截断。
 */
const INCOME_COLUMN_WIDTHS = [6, 16, 18, 22, 20, 14, 10, 10, 14, 14, 14, 14, 20] as const
function solidFill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

function thinBorder(color = COLORS.border): Partial<ExcelJS.Borders> {
  const side: ExcelJS.Border = { style: 'thin', color: { argb: color } }
  return { top: side, left: side, bottom: side, right: side }
}

function mediumBorder(color = COLORS.border): Partial<ExcelJS.Borders> {
  const side: ExcelJS.Border = { style: 'medium', color: { argb: color } }
  return { top: side, left: side, bottom: side, right: side }
}

function setCellStyle(
  cell: ExcelJS.Cell,
  options: {
    font?: Partial<ExcelJS.Font>
    fill?: ExcelJS.Fill
    alignment?: Partial<ExcelJS.Alignment>
    border?: Partial<ExcelJS.Borders>
    numFmt?: string
  },
) {
  if (options.font) cell.font = { ...FONT.body, ...options.font }
  if (options.fill) cell.fill = options.fill
  if (options.alignment) cell.alignment = options.alignment
  if (options.border) cell.border = options.border
  if (options.numFmt) cell.numFmt = options.numFmt
}

function applyRangeBorder(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number,
) {
  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      const cell = sheet.getCell(row, col)
      cell.border = thinBorder()
    }
  }
}

function mergeAndStyle(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
  value: string,
  style: Parameters<typeof setCellStyle>[1],
) {
  sheet.mergeCells(startRow, startCol, endRow, endCol)
  const cell = sheet.getCell(startRow, startCol)
  cell.value = value
  setCellStyle(cell, style)
}

function setColumnWidths(sheet: ExcelJS.Worksheet, widths: readonly number[]) {
  sheet.columns = widths.map((width) => ({ width }))
}

function yuanNumber(cents: number): number {
  return cents / 100
}

function buildSheetName(startDate: string, departureNo: string): string {
  const mmdd = startDate.slice(5).replace('-', '')
  return `${mmdd}_${departureNo}`.slice(0, 31)
}

function writeSheetTitle(sheet: ExcelJS.Worksheet, report: ProtoDepartureReport): number {
  const title = `${formatReportTitlePrefix(report.startDate, report.routeName)} · ${report.departureNo}`
  mergeAndStyle(sheet, 1, 1, 1, INCOME_COL_COUNT, title, {
    font: FONT.title,
    fill: solidFill(COLORS.titleBg),
    alignment: { vertical: 'middle', horizontal: 'center' },
    border: mediumBorder(),
  })
  sheet.getRow(1).height = 30
  return 2
}

/** 与页面一致：人数 / 拼入价 双行分组表头。 */
function writeIncomeHeader(sheet: ExcelJS.Worksheet, startRow: number): number {
  const top = startRow
  const sub = startRow + 1

  const singles = ['序号', '发客客户', '游客代表', '电话', '原始团款', '我方代收', '客户已收', '结算金额', '备注']
  const singleCols = [1, 2, 3, 4, 9, 10, 11, 12, 13]

  singleCols.forEach((col, index) => {
    mergeAndStyle(sheet, top, col, sub, col, singles[index] ?? '', {
      font: FONT.header,
      fill: solidFill(COLORS.headerBg),
      alignment: { vertical: 'middle', horizontal: 'center', wrapText: true },
      border: thinBorder(),
    })
  })

  mergeAndStyle(sheet, top, 5, top, 6, '人数', {
    font: FONT.header,
    fill: solidFill(COLORS.headerBg),
    alignment: { vertical: 'middle', horizontal: 'center' },
    border: thinBorder(),
  })
  mergeAndStyle(sheet, top, 7, top, 8, '拼入价', {
    font: FONT.header,
    fill: solidFill(COLORS.headerBg),
    alignment: { vertical: 'middle', horizontal: 'center' },
    border: thinBorder(),
  })

  ;[
    { col: 5, label: '成人' },
    { col: 6, label: '儿童' },
    { col: 7, label: '成人' },
    { col: 8, label: '儿童' },
  ].forEach(({ col, label }) => {
    const cell = sheet.getCell(sub, col)
    cell.value = label
    setCellStyle(cell, {
      font: FONT.subHeader,
      fill: solidFill(COLORS.subHeaderBg),
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: thinBorder(),
    })
  })

  sheet.getRow(top).height = 22
  sheet.getRow(sub).height = 20
  return sub + 1
}

function writeSimpleHeader(
  sheet: ExcelJS.Worksheet,
  row: number,
  headers: readonly string[],
  colCount: number,
): number {
  headers.forEach((label, index) => {
    const cell = sheet.getCell(row, index + 1)
    cell.value = label
    setCellStyle(cell, {
      font: FONT.header,
      fill: solidFill(COLORS.headerBg),
      alignment: { vertical: 'middle', horizontal: 'center', wrapText: true },
      border: thinBorder(),
    })
  })
  for (let col = headers.length + 1; col <= colCount; col += 1) {
    setCellStyle(sheet.getCell(row, col), {
      fill: solidFill(COLORS.headerBg),
      border: thinBorder(),
    })
  }
  sheet.getRow(row).height = 22
  return row + 1
}

function writeSectionTitle(
  sheet: ExcelJS.Worksheet,
  row: number,
  title: string,
  colSpan: number,
): number {
  mergeAndStyle(sheet, row, 1, row, colSpan, title, {
    font: FONT.section,
    fill: solidFill(COLORS.sectionBg),
    alignment: { vertical: 'middle', horizontal: 'center' },
    border: thinBorder(),
  })
  sheet.getRow(row).height = 24
  return row + 1
}

function styleIncomeDataRow(sheet: ExcelJS.Worksheet, row: number) {
  for (let col = 1; col <= INCOME_COL_COUNT; col += 1) {
    const cell = sheet.getCell(row, col)
    const isMoney = col >= 9 && col <= 12
    const isPrice = col === 7 || col === 8
    setCellStyle(cell, {
      font: FONT.body,
      fill: solidFill(COLORS.bodyBg),
      border: thinBorder(),
      alignment: {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: col === 13,
      },
      numFmt: isMoney ? MONEY_FMT : isPrice ? PRICE_FMT : undefined,
    })
  }
  sheet.getRow(row).height = 20
}

function writeIncomeSection(sheet: ExcelJS.Worksheet, report: ProtoDepartureReport, startRow: number): number {
  let row = writeSectionTitle(sheet, startRow, '客源收入', INCOME_COL_COUNT)
  row = writeIncomeHeader(sheet, row)
  const dataStart = row

  report.incomeRows.forEach((order) => {
    const dataRow = sheet.getRow(row)
    dataRow.getCell(1).value = order.seq
    dataRow.getCell(2).value = order.partnerName
    dataRow.getCell(3).value = order.guestName
    dataRow.getCell(4).value = order.phone
    dataRow.getCell(5).value = order.adultGuestCount
    dataRow.getCell(6).value = order.childGuestCount
    dataRow.getCell(7).value =
      order.adultGuestCount > 0 ? yuanNumber(order.adultUnitPriceCents) : '—'
    dataRow.getCell(8).value =
      order.childGuestCount > 0 ? yuanNumber(order.childUnitPriceCents) : '—'
    dataRow.getCell(9).value = yuanNumber(order.grossReceivableCents)
    dataRow.getCell(10).value = yuanNumber(order.guestCollectCents)
    dataRow.getCell(11).value = yuanNumber(order.partnerCollectedCents)
    dataRow.getCell(12).value = yuanNumber(order.netReceivableCents)
    dataRow.getCell(13).value = order.notes ?? ''
    styleIncomeDataRow(sheet, row)
    row += 1
  })

  const unitPriceSummary = summarizeRouteLedgerUnitPrices(report.incomeRows)
  const totalRow = sheet.getRow(row)
  totalRow.getCell(1).value = '合计'
  totalRow.getCell(2).value = `${report.incomeRows.length} 单`
  totalRow.getCell(5).value = report.incomeRows.reduce((sum, item) => sum + item.adultGuestCount, 0)
  totalRow.getCell(6).value = report.incomeRows.reduce((sum, item) => sum + item.childGuestCount, 0)
  totalRow.getCell(7).value = unitPriceSummary.adultUnitPriceYuan
  totalRow.getCell(8).value = unitPriceSummary.childUnitPriceYuan
  totalRow.getCell(9).value = yuanNumber(
    report.incomeRows.reduce((sum, item) => sum + item.grossReceivableCents, 0),
  )
  totalRow.getCell(10).value = yuanNumber(
    report.incomeRows.reduce((sum, item) => sum + item.guestCollectCents, 0),
  )
  totalRow.getCell(11).value = yuanNumber(
    report.incomeRows.reduce((sum, item) => sum + item.partnerCollectedCents, 0),
  )
  totalRow.getCell(12).value = yuanNumber(
    report.incomeRows.reduce((sum, item) => sum + item.netReceivableCents, 0),
  )

  for (let col = 1; col <= INCOME_COL_COUNT; col += 1) {
    setCellStyle(totalRow.getCell(col), {
      font: FONT.total,
      fill: solidFill(COLORS.totalBg),
      border: thinBorder(),
      alignment: {
        vertical: 'middle',
        horizontal: 'center',
      },
      numFmt: col >= 9 && col <= 12 ? MONEY_FMT : col === 7 || col === 8 ? PRICE_FMT : undefined,
    })
  }
  sheet.getRow(row).height = 22
  applyRangeBorder(sheet, startRow, row, 1, INCOME_COL_COUNT)
  if (report.incomeRows.length > 0) {
    applyRangeBorder(sheet, dataStart, row - 1, 1, INCOME_COL_COUNT)
  }

  return row + 2
}

function writeTableSection(
  sheet: ExcelJS.Worksheet,
  options: {
    startRow: number
    sectionTitle: string
    headers: readonly string[]
    colCount: number
    rows: Array<(row: ExcelJS.Row) => void>
    writeTotal: (row: ExcelJS.Row) => void
    emptyText?: string
  },
): number {
  let row = writeSectionTitle(sheet, options.startRow, options.sectionTitle, options.colCount)
  row = writeSimpleHeader(sheet, row, options.headers, options.colCount)

  if (options.rows.length === 0) {
    mergeAndStyle(sheet, row, 1, row, options.colCount, options.emptyText ?? '暂无数据', {
      font: FONT.meta,
      fill: solidFill(COLORS.bodyBg),
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: thinBorder(),
    })
    sheet.getRow(row).height = 24
    applyRangeBorder(sheet, options.startRow, row, 1, options.colCount)
    return row + 2
  }

  options.rows.forEach((writeRow) => {
    const dataRow = sheet.getRow(row)
    writeRow(dataRow)
    for (let col = 1; col <= options.colCount; col += 1) {
      const cell = dataRow.getCell(col)
      const header = options.headers[col - 1]
      const isMoney = header === '金额'
      setCellStyle(cell, {
        font: FONT.body,
        fill: solidFill(COLORS.bodyBg),
        border: thinBorder(),
        alignment: {
          vertical: 'middle',
          horizontal: 'center',
          wrapText: true,
        },
        numFmt: isMoney ? MONEY_FMT : undefined,
      })
    }
    sheet.getRow(row).height = 20
    row += 1
  })

  const totalRow = sheet.getRow(row)
  options.writeTotal(totalRow)
  for (let col = 1; col <= options.colCount; col += 1) {
    setCellStyle(totalRow.getCell(col), {
      font: FONT.total,
      fill: solidFill(COLORS.totalBg),
      border: thinBorder(),
      alignment: { vertical: 'middle', horizontal: 'center' },
      numFmt: options.headers[col - 1] === '金额' ? MONEY_FMT : undefined,
    })
  }
  sheet.getRow(row).height = 22
  applyRangeBorder(sheet, options.startRow, row, 1, options.colCount)
  return row + 2
}

function writeDepartureSheet(sheet: ExcelJS.Worksheet, report: ProtoDepartureReport) {
  setColumnWidths(sheet, INCOME_COLUMN_WIDTHS)

  let row = writeSheetTitle(sheet, report)
  row = writeIncomeSection(sheet, report, row)

  row = writeTableSection(sheet, {
    startRow: row,
    sectionTitle: '执行成本',
    headers: COST_HEADERS,
    colCount: COST_HEADERS.length,
    emptyText: '暂无执行成本资源',
    rows: report.costRows.map(
      (cost) => (dataRow) => {
        dataRow.getCell(1).value = cost.seq
        dataRow.getCell(2).value = cost.segmentLabel
        dataRow.getCell(3).value = cost.resourceKindLabel
        dataRow.getCell(4).value = cost.title
        dataRow.getCell(5).value = cost.supplierName
        dataRow.getCell(6).value = yuanNumber(cost.amountCents)
        dataRow.getCell(7).value = cost.notes ?? ''
      },
    ),
    writeTotal: (totalRow) => {
      totalRow.getCell(1).value = '合计'
      totalRow.getCell(2).value = `${report.costRows.length} 项`
      totalRow.getCell(6).value = yuanNumber(
        report.costRows.reduce((sum, item) => sum + item.amountCents, 0),
      )
    },
  })

  writeTableSection(sheet, {
    startRow: row,
    sectionTitle: '拼出往来',
    headers: OUTSOURCE_HEADERS,
    colCount: OUTSOURCE_HEADERS.length,
    emptyText: '本团暂无拼出记录',
    rows: report.outsource.items.map(
      (item, index) => (dataRow) => {
        dataRow.getCell(1).value = item.seq ?? index + 1
        dataRow.getCell(2).value = item.supplierName
        dataRow.getCell(3).value = item.title
        dataRow.getCell(4).value = yuanNumber(item.amountCents)
        dataRow.getCell(5).value = item.notes ?? ''
      },
    ),
    writeTotal: (totalRow) => {
      totalRow.getCell(1).value = '合计'
      totalRow.getCell(2).value = `${report.outsource.items.length} 项`
      totalRow.getCell(4).value = yuanNumber(report.outsource.totalAmountCents)
    },
  })

  sheet.views = [{ state: 'frozen', ySplit: 1, activeCell: 'A2' }]
  sheet.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  }
}

export type PrototypeExportScope = {
  routeName?: string
  startDateFrom?: string
  startDateTo?: string
}

function sanitizeFilenamePart(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '_').trim()
}

function buildPrototypeExportFilename(
  reports: ProtoDepartureReport[],
  scope: PrototypeExportScope,
): string {
  const exportDay = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const routePart = scope.routeName?.trim()
    ? sanitizeFilenamePart(scope.routeName.trim())
    : null
  const dates = reports.map((report) => report.startDate).sort()
  const rangePart =
    scope.startDateFrom && scope.startDateTo
      ? `${scope.startDateFrom.replace(/-/g, '')}-${scope.startDateTo.replace(/-/g, '')}`
      : dates.length > 0
        ? `${dates[0]?.replace(/-/g, '')}-${dates[dates.length - 1]?.replace(/-/g, '')}`
        : 'empty'

  const nameCore = routePart ? `${routePart}_${rangePart}` : rangePart
  return `线路视图_${sanitizeFilenamePart(nameCore)}_${exportDay}.xlsx`
}

/** PROTOTYPE — 浏览器端 Mock 导出，列序/合计行与页面定稿一致（不影响线上 API 导出）。 */
export async function downloadPrototypeRouteLedgerExcel(
  reports: ProtoDepartureReport[],
  scope: PrototypeExportScope = {},
): Promise<void> {
  if (reports.length === 0) {
    throw new Error('当前筛选无发团可导出')
  }

  const workbook = new ExcelJS.Workbook()
  workbook.creator = '小团宝'
  workbook.created = new Date()

  const usedNames = new Set<string>()
  for (const report of reports) {
    let sheetName = buildSheetName(report.startDate, report.departureNo)
    let suffix = 2
    while (usedNames.has(sheetName)) {
      sheetName = `${buildSheetName(report.startDate, report.departureNo).slice(0, 28)}_${suffix}`
      suffix += 1
    }
    usedNames.add(sheetName)
    writeDepartureSheet(workbook.addWorksheet(sheetName, { views: [{ showGridLines: false }] }), report)
  }

  const buffer = await workbook.xlsx.writeBuffer()
  triggerBrowserDownload(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    buildPrototypeExportFilename(reports, scope),
  )
}

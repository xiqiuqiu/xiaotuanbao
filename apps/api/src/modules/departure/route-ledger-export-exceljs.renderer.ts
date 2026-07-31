import ExcelJS from 'exceljs'
import {
  ROUTE_LEDGER_XLSX_CONTENT_TYPE,
  type RouteLedgerExportExcelFile,
  type RouteLedgerExportSheet,
  type RouteLedgerExportSnapshot,
} from './route-ledger-export.types'

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFECECEC' },
}

const SECTION_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFD9D9D9' },
}

const GUEST_HEADERS = [
  '序号',
  '发客客户',
  '游客代表',
  '电话',
  '拼入价成人',
  '拼入价儿童',
  '人数成人',
  '人数儿童',
  '原始团款',
  '我方代收',
  '客户已收',
  '结算金额',
  '备注',
] as const

const RESOURCE_HEADERS = [
  '行程段',
  '种类',
  '资源名称',
  '供应商',
  '约定金额',
  '备注',
] as const

export async function renderRouteLedgerExportExcel(
  snapshot: RouteLedgerExportSnapshot,
): Promise<RouteLedgerExportExcelFile> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = snapshot.exportedByName || 'xiaotuanbao'
  workbook.created = new Date(snapshot.exportedAt)

  const usedNames = new Set<string>()
  for (const sheet of snapshot.sheets) {
    const name = uniqueSheetName(sheet.sheetName, usedNames)
    usedNames.add(name)
    writeDepartureSheet(workbook.addWorksheet(name), sheet, snapshot)
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer())
  return {
    buffer,
    filename: snapshot.filename,
    contentType: ROUTE_LEDGER_XLSX_CONTENT_TYPE,
  }
}

function uniqueSheetName(desired: string, used: Set<string>): string {
  if (!used.has(desired)) {
    return desired
  }
  for (let i = 2; i < 100; i += 1) {
    const suffix = ` (${i})`
    const base = desired.slice(0, Math.max(1, 31 - suffix.length))
    const candidate = `${base}${suffix}`
    if (!used.has(candidate)) {
      return candidate
    }
  }
  return desired.slice(0, 28) + '…'
}

function writeDepartureSheet(
  sheet: ExcelJS.Worksheet,
  data: RouteLedgerExportSheet,
  snapshot: RouteLedgerExportSnapshot,
): void {
  let row = 1
  sheet.getCell(row, 1).value = data.title
  sheet.getCell(row, 1).font = { bold: true, size: 12 }
  row += 1
  sheet.getCell(row, 1).value = `导出人：${snapshot.exportedByName || '-'}`
  row += 1
  sheet.getCell(row, 1).value = `导出时间：${snapshot.exportedAt}`
  row += 2

  const guestHeaderRow = sheet.getRow(row)
  GUEST_HEADERS.forEach((label, index) => {
    const cell = guestHeaderRow.getCell(index + 1)
    cell.value = label
    cell.fill = HEADER_FILL
    cell.font = { bold: true }
  })
  row += 1

  for (const order of data.sourceOrders) {
    const r = sheet.getRow(row)
    r.getCell(1).value = order.seq
    r.getCell(2).value = order.partnerName
    r.getCell(3).value = order.guestRepresentativeName
    r.getCell(4).value = order.guestRepresentativePhone
    r.getCell(5).value = order.adultUnitPriceYuan
    r.getCell(6).value = order.childUnitPriceYuan
    r.getCell(7).value = order.adultGuestCount
    r.getCell(8).value = order.childGuestCount
    r.getCell(9).value = order.grossReceivableYuan
    r.getCell(10).value = order.guestCollectYuan
    r.getCell(11).value = order.partnerCollectedYuan
    r.getCell(12).value = order.netReceivableYuan
    r.getCell(13).value = order.notes
    row += 1
  }

  const total = data.sourceOrderTotals
  const totalRow = sheet.getRow(row)
  totalRow.getCell(1).value = '合计'
  totalRow.getCell(7).value = total.adultGuestCount
  totalRow.getCell(8).value = total.childGuestCount
  totalRow.getCell(9).value = total.grossReceivableYuan
  totalRow.getCell(10).value = total.guestCollectYuan
  totalRow.getCell(11).value = total.partnerCollectedYuan
  totalRow.getCell(12).value = total.netReceivableYuan
  totalRow.font = { bold: true }
  row += 2

  const section = sheet.getRow(row)
  section.getCell(1).value = '资源安排'
  section.getCell(1).fill = SECTION_FILL
  section.getCell(1).font = { bold: true }
  row += 1

  const resourceHeaderRow = sheet.getRow(row)
  RESOURCE_HEADERS.forEach((label, index) => {
    const cell = resourceHeaderRow.getCell(index + 1)
    cell.value = label
    cell.fill = HEADER_FILL
    cell.font = { bold: true }
  })
  row += 1

  for (const resource of data.resources) {
    const r = sheet.getRow(row)
    r.getCell(1).value = resource.segmentName
    r.getCell(2).value = resource.resourceKindLabel
    r.getCell(3).value = resource.title
    r.getCell(4).value = resource.supplierName
    r.getCell(5).value = resource.amountYuan
    r.getCell(6).value = resource.notes ?? ''
    row += 1
  }

  if (data.resources.length === 0) {
    sheet.getRow(row).getCell(1).value = '暂无资源安排'
  }

  sheet.columns = [
    { width: 10 },
    { width: 16 },
    { width: 12 },
    { width: 14 },
    { width: 12 },
    { width: 12 },
    { width: 10 },
    { width: 10 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 20 },
  ]
}

import ExcelJS from 'exceljs'
import {
  PRODUCT_SUMMARY_XLSX_CONTENT_TYPE,
  type ProductExportFile,
  type ProductSummarySnapshot,
} from './product-export.types'

const HEADERS = [
  '线路名称',
  '标签',
  '简版行程',
  '特色',
  '班期标题',
  '发团日期',
  '成人价',
  '儿童价',
  '单房差',
  '询价',
  '状态',
  '报名须知',
] as const

/**
 * 过渡总表 Excel：列近似疆游记总表阅读习惯，按来源 Sheet 分 sheet。
 */
export async function renderProductSummaryExcel(
  snapshot: ProductSummarySnapshot,
): Promise<ProductExportFile> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'xiaotuanbao'
  workbook.created = new Date()

  for (const sheet of snapshot.sheets) {
    const worksheet = workbook.addWorksheet(sanitizeSheetName(sheet.sheetName))
    worksheet.addRow([...HEADERS])
    const header = worksheet.getRow(1)
    header.font = { bold: true }
    header.commit()

    for (const row of sheet.rows) {
      worksheet.addRow([
        row.name,
        row.tags.join('、'),
        row.shortItinerary,
        row.featuresText ?? '',
        row.scheduleTitle,
        formatDateCell(row),
        formatYuanCell(row.adultPriceCents),
        formatYuanCell(row.childPriceCents),
        formatYuanCell(row.singleRoomSupplementCents),
        row.priceOnInquiry ? '是' : '',
        row.status,
        row.bookingNotice ?? '',
      ])
    }

    worksheet.columns = HEADERS.map((title) => ({
      header: title,
      width: columnWidth(title),
    }))
  }

  if (workbook.worksheets.length === 0) {
    const empty = workbook.addWorksheet('产品总表')
    empty.addRow([...HEADERS])
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer())
  return {
    buffer,
    filename: `产品总表_${formatDateStamp(new Date())}.xlsx`,
    contentType: PRODUCT_SUMMARY_XLSX_CONTENT_TYPE,
  }
}

function formatDateCell(row: {
  startDate: string | null
  endDate: string | null
  dateRuleText: string
}): string {
  if (row.startDate || row.endDate) {
    if (row.startDate && row.endDate) {
      return `${row.startDate} 至 ${row.endDate}`
    }
    return row.startDate ?? row.endDate ?? ''
  }
  return row.dateRuleText
}

function formatYuanCell(cents: number | null): number | string {
  if (cents == null) {
    return ''
  }
  return cents / 100
}

function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[\\/*?:\[\]]/g, '_').trim()
  const base = cleaned.length > 0 ? cleaned : 'Sheet'
  return base.slice(0, 31)
}

function columnWidth(title: string): number {
  switch (title) {
    case '简版行程':
    case '特色':
    case '报名须知':
      return 36
    case '线路名称':
    case '发团日期':
      return 22
    default:
      return 12
  }
}

function formatDateStamp(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

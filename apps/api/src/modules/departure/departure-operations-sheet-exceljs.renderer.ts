import { Injectable } from '@nestjs/common'
import type {
  DepartureOperationsSheetAnomaly,
  DepartureOperationsSheetPendingTransaction,
  DepartureOperationsSheetReceivablePathRow,
  DepartureOperationsSheetResourceRow,
  DepartureOperationsSheetSnapshot,
  DepartureOperationsSheetSourceOrderRow,
} from '@xiaotuanbao/shared'
import { PAYMENT_CHANNEL_LABELS } from '@xiaotuanbao/shared'
import ExcelJS from 'exceljs'
import {
  DepartureOperationsSheetExcelRenderer,
  OPERATIONS_SHEET_XLSX_CONTENT_TYPE,
  buildOperationsSheetFilename,
  type DepartureOperationsSheetExcelFile,
} from './departure-operations-sheet-excel.types'

const RMB_NUM_FMT = '¥#,##0.00'
const PROGRESS_ABSENCE = '—'
const REVIEW_MARKER = '需核对'
/** Excel paperSize enum: A4 */
const PAPER_SIZE_A4 = 9
const MONEY_COL_WIDTH = 14
const NOTES_COL_WIDTH = 28
const BASE_ROW_HEIGHT = 18
const WRAPPED_LINE_HEIGHT = 15

/** Light gray header fill — still visible when printed monochrome. */
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

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF666666' } },
  left: { style: 'thin', color: { argb: 'FF666666' } },
  bottom: { style: 'thin', color: { argb: 'FF666666' } },
  right: { style: 'thin', color: { argb: 'FF666666' } },
}

const DATA_STAGE_LABELS: Record<string, string> = {
  not_started: '财务未开始',
  partial: '部分开始',
  active: '已开始',
}

const DEPARTURE_STATUS_LABELS: Record<string, string> = {
  editing: '编辑中',
  pending_settlement: '待结算',
  settled: '已结清',
  closed: '已关闭',
}

const DEPARTURE_PROGRESS_LABELS: Record<string, string> = {
  not_started: '未开始',
  in_progress: '进行中',
  ended: '已结束',
}

const RECEIVABLE_PROGRESS_LABELS: Record<string, string> = {
  not_generated: PROGRESS_ABSENCE,
  pending: '待收款',
  partial: '部分收款',
  collected: '已收清',
  closed: '已关闭',
}

const PAYABLE_STATUS_LABELS: Record<string, string> = {
  not_generated: '未生成',
  pending: '待付',
  partial: '部分付款',
  paid: '已付清',
  closed: '已关闭',
}

const PENDING_DIRECTION_LABELS: Record<string, string> = {
  inflow: '收入',
  outflow: '支出',
}

const ANOMALY_KIND_LABELS: Record<string, string> = {
  closed_with_balance: '关闭仍有余额',
  amount_mismatch: '业务/财务金额不一致',
}

const ANOMALY_SIDE_LABELS: Record<string, string> = {
  receivable: '应收',
  payable: '应付',
}

@Injectable()
export class ExcelJsDepartureOperationsSheetRenderer extends DepartureOperationsSheetExcelRenderer {
  async render(
    snapshot: DepartureOperationsSheetSnapshot,
  ): Promise<DepartureOperationsSheetExcelFile> {
    const workbook = new ExcelJS.Workbook()
    workbook.creator = snapshot.exportedByName || '小团宝'
    workbook.created = new Date(snapshot.exportedAt)

    const sheet = workbook.addWorksheet('发团运营表', {
      views: [{ state: 'normal', showGridLines: true }],
    })

    // Money columns stay fixed-width; notes prefer column 9 so Chinese wrap has room
    // even though vertical sections reuse earlier columns for different meanings.
    sheet.columns = [
      { width: 16 },
      { width: MONEY_COL_WIDTH },
      { width: 18 },
      { width: MONEY_COL_WIDTH },
      { width: MONEY_COL_WIDTH },
      { width: MONEY_COL_WIDTH },
      { width: MONEY_COL_WIDTH },
      { width: MONEY_COL_WIDTH },
      { width: NOTES_COL_WIDTH },
    ]

    applyPrintPageSetup(sheet)

    let row = 1
    const identityStartRow = row
    row = writeTitle(sheet, row, '发团运营表')
    row = writeKeyValue(sheet, row, '企业', snapshot.organizationName)
    row = writeKeyValue(sheet, row, '导出人', snapshot.exportedByName || '-')
    row = writeKeyValue(sheet, row, '快照时间', formatSnapshotTime(snapshot.exportedAt))
    row = writeKeyValue(sheet, row, '发团编号', snapshot.departure.departureNo)
    row = writeKeyValue(sheet, row, '发团名称', snapshot.departure.name)
    // Contiguous print-title block: identity + section map (Excel can only repeat one row range).
    row = writeKeyValue(
      sheet,
      row,
      '分区',
      '发团与数据阶段｜客源及应收｜行程段资源及应付｜待确认款项｜财务汇总与异常｜发团级备注',
    )
    const identityEndRow = row - 1
    sheet.pageSetup.printTitlesRow = `${identityStartRow}:${identityEndRow}`
    sheet.headerFooter = {
      oddHeader: `&L发团运营表&C${snapshot.departure.departureNo}｜${snapshot.departure.name}&R${formatSnapshotTime(snapshot.exportedAt)}`,
      oddFooter: '&C第 &P 页 / 共 &N 页',
    }
    row += 1

    row = writeSectionHeader(sheet, row, '发团与数据阶段')
    row = writeKeyValue(sheet, row, '路线', snapshot.departure.routeName)
    row = writeKeyValue(
      sheet,
      row,
      '日期',
      `${snapshot.departure.startDate} ~ ${snapshot.departure.endDate}（${snapshot.departure.dayCount} 天）`,
    )
    row = writeKeyValue(sheet, row, '负责人', snapshot.departure.ownerName)
    row = writeKeyValue(
      sheet,
      row,
      '发团状态',
      labelOf(DEPARTURE_STATUS_LABELS, snapshot.departure.status),
    )
    row = writeKeyValue(
      sheet,
      row,
      '出团进度',
      labelOf(DEPARTURE_PROGRESS_LABELS, snapshot.departure.departureProgress),
    )
    row = writeKeyValue(sheet, row, '数据阶段', labelOf(DATA_STAGE_LABELS, snapshot.dataStage))
    row += 1

    row = writeSectionHeader(sheet, row, '客源及应收')
    row = writeHeaderRow(sheet, row, [
      '合作方',
      '游客代表',
      '成人/儿童/合计',
      '调整净额',
      '约定应收',
    ])
    writeNotesHeader(sheet, row - 1)
    for (const order of snapshot.sourceOrders) {
      row = writeSourceOrderRow(sheet, row, order)
      if ((order.receivablePaths?.length ?? 0) > 0) {
        row = writeHeaderRow(sheet, row, [
          '收款路径',
          '约定应收',
          '财务金额',
          '已收',
          '未收',
          '进度',
        ])
        for (const path of order.receivablePaths) {
          row = writeReceivablePathRow(sheet, row, path)
        }
      }
    }
    row += 1

    row = writeSectionHeader(sheet, row, '行程段资源及应付')
    for (const segment of snapshot.segments) {
      const dateLabel =
        segment.startDate && segment.endDate
          ? `${segment.startDate} ~ ${segment.endDate}`
          : '日期待定'
      const dayLabel = segment.dayCount != null ? `${segment.dayCount} 天` : null
      const meta = [dateLabel, dayLabel, segment.destination, segment.notes]
        .filter((part) => part && String(part).trim())
        .join(' · ')
      // Bold segment title keeps context if Excel paginates mid-segment (no keep-together API).
      row = writeSegmentTitle(sheet, row, segment.name, meta || '-')
      row = writeHeaderRow(sheet, row, [
        '资源种类',
        '供应商',
        '名称',
        '约定应付',
        '财务金额',
        '已付',
        '未付',
        '进度',
        '备注',
      ])
      for (const resource of segment.resources) {
        row = writeResourceRow(sheet, row, resource)
      }
      row += 1
    }

    if (snapshot.pendingSummary) {
      row = writeSectionHeader(sheet, row, '待确认款项')
      if (snapshot.pendingSummary.pendingCollectionCents > 0) {
        row = writeMoneyKeyValue(
          sheet,
          row,
          '待确认收款',
          snapshot.pendingSummary.pendingCollectionCents,
        )
      }
      if (snapshot.pendingSummary.pendingPaymentCents > 0) {
        row = writeMoneyKeyValue(
          sheet,
          row,
          '待确认付款',
          snapshot.pendingSummary.pendingPaymentCents,
        )
      }
      row = writeHeaderRow(sheet, row, [
        '方向',
        '交易日期',
        '往来对象',
        '待确认金额',
        '支付通道',
      ])
      writeNotesHeader(sheet, row - 1)
      for (const tx of snapshot.pendingTransactions) {
        row = writePendingRow(sheet, row, tx)
      }
      row += 1
    }

    const hasFinanceSummary =
      snapshot.financeSummary.receivable != null || snapshot.financeSummary.payable != null
    if (hasFinanceSummary || snapshot.anomalies.length > 0) {
      row = writeSectionHeader(sheet, row, '财务汇总与异常')
      if (snapshot.financeSummary.receivable) {
        row = writeMoneyKeyValue(
          sheet,
          row,
          '正常应收',
          snapshot.financeSummary.receivable.agreedCents,
        )
        row = writeMoneyKeyValue(
          sheet,
          row,
          '正常已收',
          snapshot.financeSummary.receivable.settledCents,
        )
        row = writeMoneyKeyValue(
          sheet,
          row,
          '正常未收',
          snapshot.financeSummary.receivable.unsettledCents,
        )
      }
      if (snapshot.financeSummary.payable) {
        row = writeMoneyKeyValue(
          sheet,
          row,
          '正常应付',
          snapshot.financeSummary.payable.agreedCents,
        )
        row = writeMoneyKeyValue(
          sheet,
          row,
          '正常已付',
          snapshot.financeSummary.payable.settledCents,
        )
        row = writeMoneyKeyValue(
          sheet,
          row,
          '正常未付',
          snapshot.financeSummary.payable.unsettledCents,
        )
      }
      if (snapshot.anomalies.length > 0) {
        row = writeHeaderRow(sheet, row, [
          '异常类型',
          '方向',
          '对象',
          '业务金额',
          '财务金额',
          '已结清',
          '剩余',
          '标记',
        ])
        for (const anomaly of snapshot.anomalies) {
          row = writeAnomalyRow(sheet, row, anomaly)
        }
      }
      row += 1
    }

    const departureNotes = snapshot.departure.notes?.trim()
    if (departureNotes) {
      row = writeSectionHeader(sheet, row, '发团级备注')
      sheet.getCell(row, 1).value = departureNotes
      applyWrap(sheet.getCell(row, 1), departureNotes, NOTES_COL_WIDTH)
    }

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())
    return {
      buffer,
      filename: buildOperationsSheetFilename(
        snapshot.departure.departureNo,
        snapshot.exportedAt,
      ),
      contentType: OPERATIONS_SHEET_XLSX_CONTENT_TYPE,
    }
  }
}

function applyPrintPageSetup(sheet: ExcelJS.Worksheet): void {
  sheet.pageSetup = {
    paperSize: PAPER_SIZE_A4,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    // 0 = automatic vertical pagination (do not force single page height)
    fitToHeight: 0,
    horizontalCentered: true,
    margins: {
      left: 0.4,
      right: 0.4,
      top: 0.5,
      bottom: 0.5,
      header: 0.3,
      footer: 0.3,
    },
  }
}

function labelOf(labels: Record<string, string>, value: string): string {
  return labels[value] ?? value
}

function formatSnapshotTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString('zh-CN', { hour12: false })
}

function centsToYuan(cents: number): number {
  return cents / 100
}

function estimateWrappedHeight(text: string, colWidth: number): number {
  const charsPerLine = Math.max(8, Math.floor(colWidth * 1.6))
  const lines = Math.ceil(text.length / charsPerLine) || 1
  return Math.max(BASE_ROW_HEIGHT, lines * WRAPPED_LINE_HEIGHT)
}

function applyWrap(cell: ExcelJS.Cell, text: string, colWidth = NOTES_COL_WIDTH): void {
  cell.alignment = { ...(cell.alignment ?? {}), wrapText: true, vertical: 'top' }
  const rowNumber = typeof cell.row === 'number' ? cell.row : Number(cell.row)
  const row = cell.worksheet.getRow(rowNumber)
  row.height = Math.max(row.height ?? BASE_ROW_HEIGHT, estimateWrappedHeight(text, colWidth))
}

function applyTableChrome(
  cell: ExcelJS.Cell,
  options: { header?: boolean; vertical?: 'top' | 'middle' } = {},
): void {
  cell.border = { ...THIN_BORDER }
  if (options.header) {
    cell.fill = HEADER_FILL
    cell.font = { ...(cell.font ?? {}), bold: true }
  }
  cell.alignment = {
    ...(cell.alignment ?? {}),
    vertical: options.vertical ?? 'middle',
  }
}

function styleDataCells(sheet: ExcelJS.Worksheet, row: number, colCount: number): void {
  for (let col = 1; col <= colCount; col += 1) {
    applyTableChrome(sheet.getCell(row, col))
  }
}

function writeTitle(sheet: ExcelJS.Worksheet, row: number, title: string): number {
  const cell = sheet.getCell(row, 1)
  cell.value = title
  cell.font = { bold: true, size: 14 }
  return row + 1
}

function writeSectionHeader(sheet: ExcelJS.Worksheet, row: number, title: string): number {
  const cell = sheet.getCell(row, 1)
  cell.value = title
  cell.font = { bold: true, size: 12 }
  cell.fill = SECTION_FILL
  // Span a readable band so section breaks scan as bars, not single words.
  for (let col = 1; col <= 9; col += 1) {
    const band = sheet.getCell(row, col)
    band.fill = SECTION_FILL
    band.border = { ...THIN_BORDER }
  }
  return row + 1
}

function writeSegmentTitle(
  sheet: ExcelJS.Worksheet,
  row: number,
  name: string,
  meta: string,
): number {
  const nameCell = sheet.getCell(row, 1)
  nameCell.value = name
  nameCell.font = { bold: true }
  applyTableChrome(nameCell, { header: true })
  const metaCell = sheet.getCell(row, 2)
  metaCell.value = meta
  applyTableChrome(metaCell, { header: true, vertical: 'top' })
  if (meta !== '-') {
    applyWrap(metaCell, meta, MONEY_COL_WIDTH)
  }
  return row + 1
}

function writeKeyValue(
  sheet: ExcelJS.Worksheet,
  row: number,
  label: string,
  value: string,
): number {
  sheet.getCell(row, 1).value = label
  sheet.getCell(row, 2).value = value
  return row + 1
}

function writeNotes(sheet: ExcelJS.Worksheet, row: number, notes: string): void {
  const cell = sheet.getCell(row, 9)
  cell.value = notes
  applyTableChrome(cell, { vertical: 'top' })
  if (notes !== '-') {
    applyWrap(cell, notes, NOTES_COL_WIDTH)
  }
}

function writeNotesHeader(sheet: ExcelJS.Worksheet, row: number): void {
  const cell = sheet.getCell(row, 9)
  cell.value = '备注'
  applyTableChrome(cell, { header: true })
}

function writeMoneyKeyValue(
  sheet: ExcelJS.Worksheet,
  row: number,
  label: string,
  cents: number,
): number {
  sheet.getCell(row, 1).value = label
  writeMoney(sheet.getCell(row, 2), cents)
  return row + 1
}

function writeHeaderRow(sheet: ExcelJS.Worksheet, row: number, headers: string[]): number {
  headers.forEach((header, index) => {
    const cell = sheet.getCell(row, index + 1)
    cell.value = header
    applyTableChrome(cell, { header: true })
  })
  return row + 1
}

function writeMoney(cell: ExcelJS.Cell, cents: number): void {
  cell.value = centsToYuan(cents)
  cell.numFmt = RMB_NUM_FMT
  cell.alignment = { horizontal: 'right', vertical: 'middle' }
}

function writeProgress(cell: ExcelJS.Cell, cents: number | null): void {
  if (cents == null) {
    cell.value = PROGRESS_ABSENCE
    return
  }
  writeMoney(cell, cents)
}

function writeScheduleAmount(cell: ExcelJS.Cell, agreedCents: number, scheduleCents: number | null): void {
  if (scheduleCents == null || scheduleCents === agreedCents) {
    cell.value = '-'
    return
  }
  writeMoney(cell, scheduleCents)
}

function guestRepresentativeText(order: DepartureOperationsSheetSourceOrderRow): string {
  if (!order.guestRepresentative) {
    return '-'
  }
  return order.guestRepresentative.phone
    ? `${order.guestRepresentative.name} ${order.guestRepresentative.phone}`
    : order.guestRepresentative.name
}

function formatSourceOrderNotes(order: DepartureOperationsSheetSourceOrderRow): string {
  const parts: string[] = []
  const settlementNotes = order.settlementNotes?.trim()
  const notes = order.notes?.trim()
  if (settlementNotes) {
    parts.push(`结算：${settlementNotes}`)
  }
  if (notes) {
    parts.push(`客源：${notes}`)
  }
  return parts.length > 0 ? parts.join('；') : '-'
}

function withReviewMarker(label: string, needsReview: boolean): string {
  if (!needsReview) {
    return label
  }
  if (label === PROGRESS_ABSENCE) {
    return REVIEW_MARKER
  }
  return `${label} · ${REVIEW_MARKER}`
}

function receivableProgressLabel(path: DepartureOperationsSheetReceivablePathRow): string {
  if (path.receivableStatus === 'not_generated') {
    return PROGRESS_ABSENCE
  }
  return withReviewMarker(
    labelOf(RECEIVABLE_PROGRESS_LABELS, path.receivableStatus),
    path.needsReview,
  )
}

function payableProgressLabel(resource: DepartureOperationsSheetResourceRow): string {
  if (resource.payableStatus === 'not_generated') {
    return PROGRESS_ABSENCE
  }
  return withReviewMarker(
    labelOf(PAYABLE_STATUS_LABELS, resource.payableStatus),
    resource.needsReview,
  )
}

function writeSourceOrderRow(
  sheet: ExcelJS.Worksheet,
  row: number,
  order: DepartureOperationsSheetSourceOrderRow,
): number {
  sheet.getCell(row, 1).value = order.partnerName
  sheet.getCell(row, 2).value = guestRepresentativeText(order)
  sheet.getCell(row, 3).value =
    `${order.adultGuestCount}/${order.childGuestCount}/${order.guestCount}`
  writeMoney(sheet.getCell(row, 4), order.fareAdjustmentNetCents)
  writeMoney(sheet.getCell(row, 5), order.agreedReceivableCents)
  for (let col = 1; col <= 5; col += 1) {
    applyTableChrome(sheet.getCell(row, col))
  }
  writeNotes(sheet, row, formatSourceOrderNotes(order))
  return row + 1
}

function writeReceivablePathRow(
  sheet: ExcelJS.Worksheet,
  row: number,
  path: DepartureOperationsSheetReceivablePathRow,
): number {
  sheet.getCell(row, 1).value = path.pathLabel
  writeMoney(sheet.getCell(row, 2), path.agreedReceivableCents)
  writeScheduleAmount(sheet.getCell(row, 3), path.agreedReceivableCents, path.scheduleReceivableCents)
  writeProgress(sheet.getCell(row, 4), path.receivedCents)
  writeProgress(sheet.getCell(row, 5), path.unreceivedCents)
  sheet.getCell(row, 6).value = receivableProgressLabel(path)
  styleDataCells(sheet, row, 6)
  return row + 1
}

function writeResourceRow(
  sheet: ExcelJS.Worksheet,
  row: number,
  resource: DepartureOperationsSheetResourceRow,
): number {
  sheet.getCell(row, 1).value = resource.resourceKindLabel
  sheet.getCell(row, 2).value = resource.counterpartyName
  sheet.getCell(row, 3).value = resource.title
  writeMoney(sheet.getCell(row, 4), resource.agreedPayableCents)
  writeScheduleAmount(sheet.getCell(row, 5), resource.agreedPayableCents, resource.schedulePayableCents)
  writeProgress(sheet.getCell(row, 6), resource.paidCents)
  writeProgress(sheet.getCell(row, 7), resource.unpaidCents)
  sheet.getCell(row, 8).value = payableProgressLabel(resource)
  writeNotes(sheet, row, resource.notes?.trim() || '-')
  styleDataCells(sheet, row, 8)
  return row + 1
}

function writePendingRow(
  sheet: ExcelJS.Worksheet,
  row: number,
  tx: DepartureOperationsSheetPendingTransaction,
): number {
  sheet.getCell(row, 1).value = labelOf(PENDING_DIRECTION_LABELS, tx.direction)
  sheet.getCell(row, 2).value = tx.transactionDate
  sheet.getCell(row, 3).value = tx.counterpartyName
  writeMoney(sheet.getCell(row, 4), tx.remainingUnverifiedCents)
  sheet.getCell(row, 5).value =
    PAYMENT_CHANNEL_LABELS[tx.paymentChannel as keyof typeof PAYMENT_CHANNEL_LABELS] ??
    tx.paymentChannel
  for (let col = 1; col <= 5; col += 1) {
    applyTableChrome(sheet.getCell(row, col))
  }
  writeNotes(sheet, row, tx.notes?.trim() || '-')
  return row + 1
}

function writeAnomalyRow(
  sheet: ExcelJS.Worksheet,
  row: number,
  anomaly: DepartureOperationsSheetAnomaly,
): number {
  sheet.getCell(row, 1).value = labelOf(ANOMALY_KIND_LABELS, anomaly.kind)
  sheet.getCell(row, 2).value = labelOf(ANOMALY_SIDE_LABELS, anomaly.side)
  sheet.getCell(row, 3).value = anomaly.subjectLabel
  writeMoney(sheet.getCell(row, 4), anomaly.agreedAmountCents)
  if (anomaly.scheduleAmountCents == null) {
    sheet.getCell(row, 5).value = PROGRESS_ABSENCE
  } else {
    writeMoney(sheet.getCell(row, 5), anomaly.scheduleAmountCents)
  }
  writeMoney(sheet.getCell(row, 6), anomaly.settledCents)
  writeMoney(sheet.getCell(row, 7), anomaly.remainingCents)
  // Textual marker so monochrome print / color-blind reading still works.
  sheet.getCell(row, 8).value = REVIEW_MARKER
  styleDataCells(sheet, row, 8)
  return row + 1
}

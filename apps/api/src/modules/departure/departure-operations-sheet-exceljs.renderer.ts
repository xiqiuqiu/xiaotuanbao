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

    sheet.columns = [
      { width: 18 },
      { width: 16 },
      { width: 16 },
      { width: 14 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
      { width: 14 },
      { width: 24 },
    ]

    let row = 1
    row = writeTitle(sheet, row, '发团运营表')
    row = writeKeyValue(sheet, row, '企业', snapshot.organizationName)
    row = writeKeyValue(sheet, row, '导出人', snapshot.exportedByName || '-')
    row = writeKeyValue(sheet, row, '快照时间', formatSnapshotTime(snapshot.exportedAt))
    row += 1

    row = writeSectionHeader(sheet, row, '发团与数据阶段')
    row = writeKeyValue(sheet, row, '发团编号', snapshot.departure.departureNo)
    row = writeKeyValue(sheet, row, '发团名称', snapshot.departure.name)
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
      '约定应收',
      '备注',
    ])
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
      row = writeKeyValue(sheet, row, segment.name, meta || '-')
      row = writeHeaderRow(sheet, row, [
        '资源种类',
        '对手方',
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
        '备注',
      ])
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
      sheet.getCell(row, 1).alignment = { wrapText: true, vertical: 'top' }
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
    cell.font = { bold: true }
  })
  return row + 1
}

function writeMoney(cell: ExcelJS.Cell, cents: number): void {
  cell.value = centsToYuan(cents)
  cell.numFmt = RMB_NUM_FMT
  cell.alignment = { horizontal: 'right' }
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

function receivableProgressLabel(path: DepartureOperationsSheetReceivablePathRow): string {
  if (path.receivableStatus === 'not_generated') {
    return PROGRESS_ABSENCE
  }
  const progressLabel = labelOf(RECEIVABLE_PROGRESS_LABELS, path.receivableStatus)
  if (path.needsReview) {
    return progressLabel === PROGRESS_ABSENCE ? '需核对' : `${progressLabel} · 需核对`
  }
  return progressLabel
}

function payableProgressLabel(resource: DepartureOperationsSheetResourceRow): string {
  if (resource.payableStatus === 'not_generated') {
    return PROGRESS_ABSENCE
  }
  const progressLabel = labelOf(PAYABLE_STATUS_LABELS, resource.payableStatus)
  if (resource.needsReview) {
    return progressLabel === PROGRESS_ABSENCE ? '需核对' : `${progressLabel} · 需核对`
  }
  return progressLabel
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
  writeMoney(sheet.getCell(row, 4), order.agreedReceivableCents)
  sheet.getCell(row, 5).value = formatSourceOrderNotes(order)
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
  sheet.getCell(row, 9).value = resource.notes?.trim() || '-'
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
  sheet.getCell(row, 6).value = tx.notes?.trim() || '-'
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
  return row + 1
}

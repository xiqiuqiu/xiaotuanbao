import { Injectable } from '@nestjs/common'
import type {
  PartnerReconciliationStatementRow,
  PartnerReconciliationStatementSnapshot,
} from '@xiaotuanbao/shared'
import { PARTNER_RECONCILIATION_CONFIRMATION_NOTES } from '@xiaotuanbao/shared'
import ExcelJS from 'exceljs'
import {
  PartnerReconciliationStatementExcelRenderer,
  RECONCILIATION_STATEMENT_XLSX_CONTENT_TYPE,
  buildReconciliationStatementFilename,
  type PartnerReconciliationStatementExcelFile,
} from './partner-reconciliation-statement-excel.types'

const RMB_NUM_FMT = '¥#,##0.00'
/** Excel paperSize enum: A4 */
const PAPER_SIZE_A4 = 9
/** 客户模板 18 列：在原始应收与优惠之间增「调整净额」 */
const COL_COUNT = 18

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF666666' } },
  left: { style: 'thin', color: { argb: 'FF666666' } },
  bottom: { style: 'thin', color: { argb: 'FF666666' } },
  right: { style: 'thin', color: { argb: 'FF666666' } },
}

/** Light gray header fill — still visible when printed monochrome. */
const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFECECEC' },
}

/** 18 列表头（对外客户习惯名，豁免仅限导出物；调整净额用系统规范名） */
const DETAIL_HEADERS = [
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
  '调整净额',
  '优惠金额',
  '实际应收',
  '客户已收押金',
  '游客代收',
  '备注',
] as const

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

function formatExportedAt(exportedAt: string): string {
  const date = new Date(exportedAt)
  if (Number.isNaN(date.getTime())) {
    return exportedAt
  }
  return date.toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' })
}

@Injectable()
export class ExcelJsPartnerReconciliationStatementRenderer extends PartnerReconciliationStatementExcelRenderer {
  async render(
    snapshot: PartnerReconciliationStatementSnapshot,
  ): Promise<PartnerReconciliationStatementExcelFile> {
    const workbook = new ExcelJS.Workbook()
    workbook.creator = snapshot.organizationName || '小团宝'
    workbook.created = new Date(snapshot.exportedAt)

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
      { width: 11 }, // 13 调整净额
      { width: 11 }, // 14 优惠金额
      { width: 12 }, // 15 实际应收
      { width: 12 }, // 16 客户已收押金
      { width: 12 }, // 17 游客代收
      { width: 24 }, // 18 备注
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
    row = this.writeTitle(sheet, row, snapshot)
    row = this.writeMetaLine(sheet, row, snapshot)
    row += 1
    row = this.writeSummary(sheet, row, snapshot)
    row += 1
    row = this.writeDetailTable(sheet, row, snapshot)
    row += 1
    row = this.writeConfirmationNotes(sheet, row)
    row += 1
    this.writeSignatureBlocks(sheet, row, snapshot)

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())
    return {
      buffer,
      filename: buildReconciliationStatementFilename(
        snapshot.partnerName,
        snapshot.periodStart,
        snapshot.periodEnd,
      ),
      contentType: RECONCILIATION_STATEMENT_XLSX_CONTENT_TYPE,
    }
  }

  /** 标题：由周期自动生成（快照已含），沿客户模板 */
  private writeTitle(
    sheet: ExcelJS.Worksheet,
    row: number,
    snapshot: PartnerReconciliationStatementSnapshot,
  ): number {
    sheet.mergeCells(row, 1, row, COL_COUNT)
    const titleCell = sheet.getCell(row, 1)
    titleCell.value = snapshot.title
    titleCell.font = { bold: true, size: 16 }
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    sheet.getRow(row).height = 30
    return row + 1
  }

  /** 抬头单行：合作方＋对账周期（按出团日期）＋导出时间 */
  private writeMetaLine(
    sheet: ExcelJS.Worksheet,
    row: number,
    snapshot: PartnerReconciliationStatementSnapshot,
  ): number {
    sheet.mergeCells(row, 1, row, COL_COUNT)
    const metaCell = sheet.getCell(row, 1)
    metaCell.value = `合作方：${snapshot.partnerName}    对账周期：${snapshot.periodStart} 至 ${snapshot.periodEnd}（按出团日期）    导出时间：${formatExportedAt(snapshot.exportedAt)}`
    metaCell.alignment = { horizontal: 'center', vertical: 'middle' }
    sheet.getRow(row).height = 20
    return row + 1
  }

  /** 七项汇总两行版式：客源单数｜总人数｜拼入合计｜调整净额｜优惠合计｜实际应收｜游客代收 */
  private writeSummary(
    sheet: ExcelJS.Worksheet,
    row: number,
    snapshot: PartnerReconciliationStatementSnapshot,
  ): number {
    const { totals } = snapshot
    const summaryItems: Array<{ label: string; write: (cell: ExcelJS.Cell) => void }> = [
      { label: '客源单数', write: (cell) => (cell.value = totals.orderCount) },
      { label: '总人数', write: (cell) => (cell.value = totals.totalGuestCount) },
      { label: '拼入合计', write: (cell) => money(cell, totals.originalReceivableCents) },
      { label: '调整净额', write: (cell) => money(cell, totals.fareAdjustmentNetCents) },
      { label: '优惠合计', write: (cell) => money(cell, totals.discountCents) },
      { label: '实际应收', write: (cell) => money(cell, totals.actualReceivableCents) },
      { label: '游客代收', write: (cell) => money(cell, totals.guestCollectCents) },
    ]
    const summarySpans: Array<[number, number]> = [
      [1, 2],
      [3, 4],
      [5, 7],
      [8, 10],
      [11, 13],
      [14, 16],
      [17, 18],
    ]
    const labelRow = row
    const valueRow = row + 1
    summaryItems.forEach((item, index) => {
      const [from, to] = summarySpans[index]
      sheet.mergeCells(labelRow, from, labelRow, to)
      const labelCell = sheet.getCell(labelRow, from)
      labelCell.value = item.label
      headerChrome(labelCell)
      sheet.mergeCells(valueRow, from, valueRow, to)
      const valueCell = sheet.getCell(valueRow, from)
      item.write(valueCell)
      valueCell.alignment = { horizontal: 'center', vertical: 'middle' }
      valueCell.font = { bold: true, size: 12 }
      valueCell.border = { ...THIN_BORDER }
    })
    sheet.getRow(valueRow).height = 24
    return valueRow + 1
  }

  /** 18 列明细＋合计行；分页时重复明细表头 */
  private writeDetailTable(
    sheet: ExcelJS.Worksheet,
    row: number,
    snapshot: PartnerReconciliationStatementSnapshot,
  ): number {
    const headerRow = row
    DETAIL_HEADERS.forEach((header, index) => {
      const cell = sheet.getCell(headerRow, index + 1)
      cell.value = header
      headerChrome(cell)
    })
    sheet.getRow(headerRow).height = 30
    sheet.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`
    row += 1

    snapshot.rows.forEach((statementRow, index) => {
      this.writeDetailRow(sheet, row, index + 1, statementRow)
      row += 1
    })

    return this.writeTotalsRow(sheet, row, snapshot)
  }

  private writeDetailRow(
    sheet: ExcelJS.Worksheet,
    row: number,
    sequence: number,
    statementRow: PartnerReconciliationStatementRow,
  ): void {
    sheet.getCell(row, 1).value = sequence
    sheet.getCell(row, 2).value = statementRow.departureDate
    sheet.getCell(row, 3).value = statementRow.departureNo
    sheet.getCell(row, 4).value = statementRow.routeName
    sheet.getCell(row, 5).value = statementRow.guestRepresentativeName ?? ''
    sheet.getCell(row, 6).value = statementRow.guestRepresentativePhone ?? ''
    sheet.getCell(row, 7).value = statementRow.adultGuestCount
    sheet.getCell(row, 8).value = statementRow.childGuestCount
    sheet.getCell(row, 9).value = statementRow.totalGuestCount
    money(sheet.getCell(row, 10), statementRow.adultUnitPriceCents)
    if (statementRow.childGuestCount > 0) {
      money(sheet.getCell(row, 11), statementRow.childUnitPriceCents)
    } else {
      sheet.getCell(row, 11).value = '-'
      sheet.getCell(row, 11).alignment = { horizontal: 'center', vertical: 'middle' }
    }
    money(sheet.getCell(row, 12), statementRow.originalReceivableCents)
    money(sheet.getCell(row, 13), statementRow.fareAdjustmentNetCents)
    money(sheet.getCell(row, 14), statementRow.discountCents)
    money(sheet.getCell(row, 15), statementRow.actualReceivableCents)
    money(sheet.getCell(row, 16), statementRow.customerDepositCents)
    money(sheet.getCell(row, 17), statementRow.guestCollectCents)
    sheet.getCell(row, 18).value = statementRow.notes ?? ''
    for (let col = 1; col <= COL_COUNT; col += 1) {
      const cell = sheet.getCell(row, col)
      cell.border = { ...THIN_BORDER }
      cell.alignment = { ...(cell.alignment ?? {}), vertical: 'middle', wrapText: true }
      if (col === 1 || (col >= 7 && col <= 9)) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
      }
    }
    sheet.getRow(row).height = 20
  }

  /** 合计行：人数三列求和，单价两列留空，金额六列求和 */
  private writeTotalsRow(
    sheet: ExcelJS.Worksheet,
    row: number,
    snapshot: PartnerReconciliationStatementSnapshot,
  ): number {
    const { totals } = snapshot
    sheet.mergeCells(row, 1, row, 6)
    const totalLabel = sheet.getCell(row, 1)
    totalLabel.value = '合计'
    totalLabel.alignment = { horizontal: 'center', vertical: 'middle' }
    sheet.getCell(row, 7).value = totals.adultGuestCount
    sheet.getCell(row, 8).value = totals.childGuestCount
    sheet.getCell(row, 9).value = totals.totalGuestCount
    money(sheet.getCell(row, 12), totals.originalReceivableCents)
    money(sheet.getCell(row, 13), totals.fareAdjustmentNetCents)
    money(sheet.getCell(row, 14), totals.discountCents)
    money(sheet.getCell(row, 15), totals.actualReceivableCents)
    money(sheet.getCell(row, 16), totals.customerDepositCents)
    money(sheet.getCell(row, 17), totals.guestCollectCents)
    for (let col = 1; col <= COL_COUNT; col += 1) {
      const cell = sheet.getCell(row, col)
      cell.border = { ...THIN_BORDER }
      cell.fill = HEADER_FILL
      cell.font = { ...(cell.font ?? {}), bold: true }
      if (col >= 7 && col <= 9) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
      }
    }
    sheet.getRow(row).height = 22
    return row + 1
  }

  /** 确认说明：客户原句＋计算口径公式＋不含收付款进度声明 */
  private writeConfirmationNotes(sheet: ExcelJS.Worksheet, row: number): number {
    sheet.mergeCells(row, 1, row, COL_COUNT)
    const noteTitle = sheet.getCell(row, 1)
    noteTitle.value = '确认说明'
    noteTitle.font = { bold: true, size: 11 }
    headerChrome(noteTitle)
    noteTitle.alignment = { horizontal: 'left', vertical: 'middle' }
    row += 1

    sheet.mergeCells(row, 1, row, COL_COUNT)
    const noteCell = sheet.getCell(row, 1)
    noteCell.value = PARTNER_RECONCILIATION_CONFIRMATION_NOTES.join('\n')
    noteCell.alignment = { wrapText: true, vertical: 'top' }
    noteCell.border = { ...THIN_BORDER }
    sheet.getRow(row).height = PARTNER_RECONCILIATION_CONFIRMATION_NOTES.length * 16 + 8
    return row + 1
  }

  /** 双方签章栏：左我方（出具方）、右客户（合作方），各含确认人/确认日期空线 */
  private writeSignatureBlocks(
    sheet: ExcelJS.Worksheet,
    row: number,
    snapshot: PartnerReconciliationStatementSnapshot,
  ): void {
    sheet.mergeCells(row, 1, row + 2, 6)
    const issuerSign = sheet.getCell(row, 1)
    issuerSign.value = `我方确认（盖章）：${snapshot.organizationName}\n确认人：____________\n确认日期：____年__月__日`
    issuerSign.alignment = { wrapText: true, vertical: 'top' }
    issuerSign.border = { ...THIN_BORDER }
    sheet.mergeCells(row, 12, row + 2, COL_COUNT)
    const partnerSign = sheet.getCell(row, 12)
    partnerSign.value = `客户确认（盖章）：${snapshot.partnerName}\n确认人：____________\n确认日期：____年__月__日`
    partnerSign.alignment = { wrapText: true, vertical: 'top' }
    partnerSign.border = { ...THIN_BORDER }
    sheet.getRow(row).height = 24
    sheet.getRow(row + 1).height = 24
    sheet.getRow(row + 2).height = 24
  }
}

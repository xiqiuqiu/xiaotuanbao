import type { PartnerReconciliationStatementSnapshot } from '@xiaotuanbao/shared'
import {
  OPERATIONS_SHEET_XLSX_CONTENT_TYPE,
  sanitizeOperationsSheetFilenamePart,
} from '../departure/departure-operations-sheet-excel.types'

/** Binary workbook payload — no ExcelJS types leak past the renderer boundary. */
export interface PartnerReconciliationStatementExcelFile {
  buffer: Buffer
  filename: string
  contentType: string
}

/**
 * Replaceable Excel render boundary (ADR-0018).
 * Domain snapshot must not import ExcelJS.
 */
export abstract class PartnerReconciliationStatementExcelRenderer {
  abstract render(
    snapshot: PartnerReconciliationStatementSnapshot,
  ): Promise<PartnerReconciliationStatementExcelFile>
}

export const RECONCILIATION_STATEMENT_XLSX_CONTENT_TYPE = OPERATIONS_SHEET_XLSX_CONTENT_TYPE

/**
 * 标题由周期自动生成（#113 定稿）：
 * 同年同月「2026年6月往来账确认单」；同年跨月「2026年6-7月往来账确认单」；
 * 跨年「2026年12月-2027年1月往来账确认单」。
 */
export function buildReconciliationStatementTitle(
  periodStart: string,
  periodEnd: string,
): string {
  const startYear = Number(periodStart.slice(0, 4))
  const startMonth = Number(periodStart.slice(5, 7))
  const endYear = Number(periodEnd.slice(0, 4))
  const endMonth = Number(periodEnd.slice(5, 7))
  if (startYear === endYear && startMonth === endMonth) {
    return `${startYear}年${startMonth}月往来账确认单`
  }
  if (startYear === endYear) {
    return `${startYear}年${startMonth}-${endMonth}月往来账确认单`
  }
  return `${startYear}年${startMonth}月-${endYear}年${endMonth}月往来账确认单`
}

export function buildReconciliationStatementFilename(
  partnerName: string,
  periodStart: string,
  periodEnd: string,
): string {
  const safePartner = sanitizeOperationsSheetFilenamePart(partnerName)
  return `往来账确认单_${safePartner}_${periodStart}至${periodEnd}.xlsx`
}

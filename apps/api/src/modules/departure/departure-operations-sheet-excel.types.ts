import type { DepartureOperationsSheetSnapshot } from '@xiaotuanbao/shared'

/** Binary workbook payload — no ExcelJS types leak past the renderer boundary. */
export interface DepartureOperationsSheetExcelFile {
  buffer: Buffer
  filename: string
  contentType: string
}

/**
 * Replaceable Excel render boundary (ADR-0018).
 * Domain snapshot / Finance interfaces must not import ExcelJS.
 */
export abstract class DepartureOperationsSheetExcelRenderer {
  abstract render(
    snapshot: DepartureOperationsSheetSnapshot,
  ): Promise<DepartureOperationsSheetExcelFile>
}

export const OPERATIONS_SHEET_XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Excel illegal filename characters + control chars. */
const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g

export function sanitizeOperationsSheetFilenamePart(value: string): string {
  const cleaned = value.replace(ILLEGAL_FILENAME_CHARS, '_').replace(/\s+/g, ' ').trim()
  return cleaned.length > 0 ? cleaned : '_'
}

export function buildOperationsSheetFilename(
  departureNo: string,
  exportedAt: string,
): string {
  const safeNo = sanitizeOperationsSheetFilenamePart(departureNo)
  const safeDate = sanitizeOperationsSheetFilenamePart(formatSnapshotDateForFilename(exportedAt))
  return `发团运营表_${safeNo}_${safeDate}.xlsx`
}

/** Local calendar date so filename matches the visible 快照时间 (zh-CN). */
export function formatSnapshotDateForFilename(exportedAt: string): string {
  const date = new Date(exportedAt)
  if (Number.isNaN(date.getTime())) {
    return exportedAt.slice(0, 10)
  }
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function buildOperationsSheetContentDisposition(filename: string): string {
  const escapedFilename = filename.replace(/"/g, '\\"')
  return `attachment; filename="${escapedFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

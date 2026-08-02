import {
  formatSnapshotDateForFilename,
  sanitizeOperationsSheetFilenamePart,
} from './departure-operations-sheet-excel.types'

const EXCEL_SHEET_NAME_MAX = 31

export function sanitizeRouteLedgerExcelPart(value: string): string {
  return sanitizeOperationsSheetFilenamePart(value)
}

/** Sheet: MMDD_departureNo, max 31 chars (Excel limit). */
export function buildRouteLedgerSheetName(startDate: string, departureNo: string): string {
  const compact = startDate.replace(/-/g, '')
  const mmdd = compact.length >= 8 ? compact.slice(4, 8) : compact
  const prefix = `${mmdd}_`
  const safeNo = sanitizeRouteLedgerExcelPart(departureNo)
  const maxNoLen = EXCEL_SHEET_NAME_MAX - prefix.length
  const truncatedNo = safeNo.length > maxNoLen ? safeNo.slice(0, maxNoLen) : safeNo
  return `${prefix}${truncatedNo}`
}

export function buildRouteLedgerExportFilename(input: {
  routeName?: string
  startDateFrom?: string
  startDateTo?: string
  exportedAt: string
}): string {
  const exportDay = formatSnapshotDateForFilename(input.exportedAt)
  const scope = input.routeName?.trim()
    ? sanitizeRouteLedgerExcelPart(input.routeName.trim())
    : [
        (input.startDateFrom ?? '').replace(/-/g, ''),
        (input.startDateTo ?? '').replace(/-/g, ''),
      ]
        .filter(Boolean)
        .join('-') || '导出'
  return `线路视图_${sanitizeRouteLedgerExcelPart(scope)}_${exportDay}.xlsx`
}

/** Domain snapshot for route-ledger multi-sheet export — no ExcelJS types. */

export interface RouteLedgerExportSourceOrderRow {
  seq: number
  partnerName: string
  guestRepresentativeName: string
  guestRepresentativePhone: string
  adultUnitPriceYuan: string
  childUnitPriceYuan: string
  adultGuestCount: number
  childGuestCount: number
  grossReceivableYuan: string
  guestCollectYuan: string
  partnerCollectedYuan: string
  netReceivableYuan: string
  notes: string
}

export interface RouteLedgerExportSourceOrderTotals {
  adultGuestCount: number
  childGuestCount: number
  grossReceivableYuan: string
  guestCollectYuan: string
  partnerCollectedYuan: string
  netReceivableYuan: string
}

/** Arrangement facts only — no payable progress (ADR-0037). */
export interface RouteLedgerExportResourceRow {
  segmentName: string
  resourceKindLabel: string
  title: string
  supplierName: string
  amountYuan: string
  notes: string | null
}

export interface RouteLedgerExportSheet {
  sheetName: string
  title: string
  sourceOrders: RouteLedgerExportSourceOrderRow[]
  sourceOrderTotals: RouteLedgerExportSourceOrderTotals
  resources: RouteLedgerExportResourceRow[]
}

export interface RouteLedgerExportSnapshot {
  filename: string
  exportedAt: string
  exportedByName: string
  sheets: RouteLedgerExportSheet[]
}

export interface RouteLedgerExportExcelFile {
  buffer: Buffer
  filename: string
  contentType: string
}

export const ROUTE_LEDGER_XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

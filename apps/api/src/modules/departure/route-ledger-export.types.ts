/** Domain snapshot for route-ledger multi-sheet export — no ExcelJS types. */

export interface RouteLedgerExportSourceOrderRow {
  seq: number
  partnerName: string
  guestRepresentativeName: string
  guestRepresentativePhone: string
  adultGuestCount: number
  childGuestCount: number
  adultUnitPriceCents: number
  childUnitPriceCents: number
  grossReceivableCents: number
  guestCollectCents: number
  partnerCollectedCents: number
  netReceivableCents: number
  notes: string
}

export interface RouteLedgerExportSourceOrderTotals {
  orderCount: number
  adultGuestCount: number
  childGuestCount: number
  grossReceivableCents: number
  guestCollectCents: number
  partnerCollectedCents: number
  netReceivableCents: number
}

/** 执行成本行（不含拼出），对齐 Web UI 成本区。 */
export interface RouteLedgerExportCostRow {
  seq: number
  segmentLabel: string
  resourceKindLabel: string
  title: string
  supplierName: string
  amountCents: number
  notes: string | null
}

/** 拼出往来行，对齐 Web UI 拼出区。 */
export interface RouteLedgerExportOutsourceRow {
  seq: number
  supplierName: string
  title: string
  amountCents: number
  notes: string | null
}

export interface RouteLedgerExportSheet {
  sheetName: string
  title: string
  sourceOrders: RouteLedgerExportSourceOrderRow[]
  sourceOrderTotals: RouteLedgerExportSourceOrderTotals
  costRows: RouteLedgerExportCostRow[]
  outsourceRows: RouteLedgerExportOutsourceRow[]
  outsourceTotalAmountCents: number
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

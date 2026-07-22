/** Binary export payload — no ExcelJS / PDF internals leak past the renderer boundary. */
export interface ProductExportFile {
  buffer: Buffer
  filename: string
  contentType: string
}

export const PRODUCT_SUMMARY_XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export const PRODUCT_PEER_PACK_PDF_CONTENT_TYPE = 'application/pdf'

export interface ProductPeerPackSnapshot {
  name: string
  status: 'draft' | 'on_sale' | 'offline'
  tags: string[]
  shortItinerary: string
  features: Array<{ title: string; description: string }>
  bookingNotice: string | null
  schedules: Array<{
    title: string
    dateRuleText: string
    startDate: string | null
    endDate: string | null
    status: string
    priceOnInquiry: boolean
    adultPriceCents: number | null
    childPriceCents: number | null
    singleRoomSupplementCents: number | null
    notes: string | null
  }>
  priced: boolean
}

export interface ProductSummaryRow {
  name: string
  tags: string[]
  shortItinerary: string
  featuresText: string | null
  bookingNotice: string | null
  status: string
  sourceSheetName: string | null
  scheduleTitle: string
  dateRuleText: string
  startDate: string | null
  endDate: string | null
  priceOnInquiry: boolean
  adultPriceCents: number | null
  childPriceCents: number | null
  singleRoomSupplementCents: number | null
}

export interface ProductSummarySnapshot {
  sheets: Array<{
    sheetName: string
    rows: ProductSummaryRow[]
  }>
}

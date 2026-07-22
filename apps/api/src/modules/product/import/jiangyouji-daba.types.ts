/** Pure parse result for 西部中旅《疆游记》大巴总表 — no Nest / Prisma types. */

export interface JiangyoujiScheduleCandidate {
  /** 发团日期原文（D 列）。 */
  dateRuleText: string
  /** 成人价原文片段（便于确认页对照）。 */
  adultPriceText: string
  adultPriceCents: number | null
  childPriceCents: number | null
  singleRoomSupplementCents: number | null
  /** 能解析则填；否则 null，确认前不计入可销售统计。 */
  startDate: string | null
  endDate: string | null
  /** 明确无报价 / 询价。 */
  priceOnInquiry: boolean
  datesParseable: boolean
}

export interface JiangyoujiLineCandidate {
  /** 会话内稳定键：sheetIndex + 线路块序号。 */
  candidateKey: string
  sheetName: string
  /** 建议产品名。 */
  name: string
  tags: string[]
  shortItinerary: string
  /** 可空。 */
  featuresText: string | null
  schedules: JiangyoujiScheduleCandidate[]
  rawNameBlock: string
}

export interface JiangyoujiSheetParseResult {
  sheetName: string
  sheetIndex: number
  /** Sheet 表头注意事项（若有）。 */
  headerNotice: string | null
  lines: JiangyoujiLineCandidate[]
}

export interface JiangyoujiParseResult {
  sheets: JiangyoujiSheetParseResult[]
  /** ExcelJS media 计数；缺失不阻断。 */
  embeddedOleCount: number
  /** 解析用默认年份（来自标题或 2026）。 */
  defaultYear: number
}

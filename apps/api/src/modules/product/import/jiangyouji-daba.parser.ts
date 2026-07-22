import ExcelJS from 'exceljs'
import type {
  JiangyoujiLineCandidate,
  JiangyoujiParseResult,
  JiangyoujiScheduleCandidate,
  JiangyoujiSheetParseResult,
} from './jiangyouji-daba.types'

const HEADER_LABEL = '编号及线路名称'
const FOOTER_MARK = '还有更多'

/**
 * 西部中旅《疆游记》大巴总表纯解析器（与 HTTP 分离，供单测与导入会话共用）。
 * OLE / media 缺失不抛错。
 */
export async function parseJiangyoujiDabaWorkbook(
  buffer: Buffer,
): Promise<JiangyoujiParseResult> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)

  const defaultYear = detectDefaultYear(workbook) ?? 2026
  const media = (workbook as ExcelJS.Workbook & { media?: unknown[] }).media
  const embeddedOleCount = Array.isArray(media) ? media.length : 0

  const sheets: JiangyoujiSheetParseResult[] = workbook.worksheets.map((worksheet, sheetIndex) =>
    parseSheet(worksheet, sheetIndex, defaultYear),
  )

  return { sheets, embeddedOleCount, defaultYear }
}

function detectDefaultYear(workbook: ExcelJS.Workbook): number | null {
  for (const worksheet of workbook.worksheets) {
    const title = cellText(worksheet.getRow(1).getCell(1))
    const match = title.match(/(20\d{2})/)
    if (match) {
      return Number(match[1])
    }
  }
  return null
}

function parseSheet(
  worksheet: ExcelJS.Worksheet,
  sheetIndex: number,
  defaultYear: number,
): JiangyoujiSheetParseResult {
  const sheetName = worksheet.name
  const headerNotice = extractHeaderNotice(worksheet)
  const rowCount = Math.max(worksheet.actualRowCount || 0, worksheet.rowCount || 0)

  type RawRow = {
    rowNumber: number
    nameBlock: string
    shortItinerary: string
    featuresText: string
    dateRuleText: string
    adultText: string
    childText: string
    supplementText: string
  }

  const rawRows: RawRow[] = []
  for (let rowNumber = 1; rowNumber <= rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber)
    const nameBlock = cellText(row.getCell(1))
    const shortItinerary = cellText(row.getCell(2))
    const featuresText = cellText(row.getCell(3))
    if (!isProductDataRow(nameBlock, shortItinerary, featuresText)) {
      continue
    }
    rawRows.push({
      rowNumber,
      nameBlock,
      shortItinerary,
      featuresText,
      dateRuleText: cellText(row.getCell(4)),
      adultText: cellText(row.getCell(5)),
      childText: cellText(row.getCell(6)),
      supplementText: cellText(row.getCell(7)),
    })
  }

  const groups: RawRow[][] = []
  for (const raw of rawRows) {
    const last = groups[groups.length - 1]
    if (last && last[0]?.nameBlock === raw.nameBlock) {
      last.push(raw)
    } else {
      groups.push([raw])
    }
  }

  const lines: JiangyoujiLineCandidate[] = groups.map((group, lineIndex) => {
    const first = group[0]!
    const { name, tags } = splitNameAndTags(first.nameBlock)
    const schedules = group.flatMap((row) =>
      buildSchedulesFromRow(row, defaultYear),
    )
    return {
      candidateKey: `${sheetIndex}:${lineIndex}`,
      sheetName,
      name,
      tags,
      shortItinerary: first.shortItinerary,
      featuresText: first.featuresText.trim() ? first.featuresText.trim() : null,
      schedules,
      rawNameBlock: first.nameBlock,
    }
  })

  return {
    sheetName,
    sheetIndex,
    headerNotice,
    lines,
  }
}

function extractHeaderNotice(worksheet: ExcelJS.Worksheet): string | null {
  const text = cellText(worksheet.getRow(2).getCell(1))
  if (!text) {
    return null
  }
  if (text.includes('注意事项') || text.startsWith('♚')) {
    return text
  }
  return null
}

function isProductDataRow(nameBlock: string, shortItinerary: string, featuresText: string): boolean {
  if (!nameBlock || !shortItinerary) {
    return false
  }
  const compactName = nameBlock.replace(/\s+/g, '')
  if (compactName === HEADER_LABEL.replace(/\s+/g, '')) {
    return false
  }
  if (nameBlock.includes(FOOTER_MARK)) {
    return false
  }
  // 分区标题 / 页眉合并格：A=B=C
  if (nameBlock === shortItinerary && shortItinerary === featuresText) {
    return false
  }
  return true
}

function splitNameAndTags(nameBlock: string): { name: string; tags: string[] } {
  const parts = nameBlock
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length === 0) {
    return { name: nameBlock.trim(), tags: [] }
  }

  const primaryIndex = parts.findIndex((part) => isPrimaryNameLine(part))
  if (primaryIndex >= 0) {
    const name = parts[primaryIndex]!
    const tags = parts.filter((_, index) => index !== primaryIndex)
    return { name, tags }
  }

  // 短途产品：第一行作名称，其余作标签
  if (parts.length === 1) {
    return { name: parts[0]!, tags: [] }
  }
  return { name: parts[0]!, tags: parts.slice(1) }
}

function isPrimaryNameLine(line: string): boolean {
  if (/^[A-Z]\d{0,3}\s*线/.test(line)) {
    return true
  }
  if (/^[A-Z]\d{3}\s*[：:]/.test(line)) {
    return true
  }
  if (/线[：:]/.test(line)) {
    return true
  }
  if (/《.+》/.test(line)) {
    return true
  }
  return false
}

function buildSchedulesFromRow(
  row: {
    dateRuleText: string
    adultText: string
    childText: string
    supplementText: string
  },
  defaultYear: number,
): JiangyoujiScheduleCandidate[] {
  const dateRuleText = row.dateRuleText.trim()
  const childPriceCents = extractFirstPriceCents(row.childText)
  const singleRoomSupplementCents = extractFirstPriceCents(row.supplementText)
  const adultChunks = splitAdultPriceChunks(row.adultText)

  if (adultChunks.length === 0) {
    const dateParsed = parseDateRangeFromText(`${dateRuleText}\n${row.adultText}`, defaultYear)
    return [
      {
        dateRuleText,
        adultPriceText: row.adultText.trim(),
        adultPriceCents: null,
        childPriceCents,
        singleRoomSupplementCents,
        startDate: dateParsed.startDate,
        endDate: dateParsed.endDate,
        priceOnInquiry: true,
        datesParseable: dateParsed.datesParseable,
      },
    ]
  }

  return adultChunks.map((chunk) => {
    const adultPriceCents = extractFirstPriceCents(chunk)
    const fromChunk = parseDateRangeFromText(chunk, defaultYear)
    const fromRule = parseDateRangeFromText(dateRuleText, defaultYear)
    const startDate = fromChunk.startDate ?? fromRule.startDate
    const endDate = fromChunk.endDate ?? fromRule.endDate
    const datesParseable = Boolean(startDate || endDate)
    return {
      dateRuleText,
      adultPriceText: chunk.trim(),
      adultPriceCents,
      childPriceCents,
      singleRoomSupplementCents,
      startDate,
      endDate,
      priceOnInquiry: adultPriceCents == null,
      datesParseable,
    }
  })
}

/** 成人列可能含多段「日期 + 价格」。 */
function splitAdultPriceChunks(adultText: string): string[] {
  const trimmed = adultText.trim()
  if (!trimmed) {
    return []
  }

  const lines = trimmed
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  // 形如：7月1-7月31  1580 / 8月1-8月31  1680
  const pricedLines = lines.filter((line) => /\d{3,5}/.test(line))
  if (pricedLines.length >= 2) {
    return pricedLines
  }

  // 两行：日期区间 + 价格
  if (lines.length === 2 && extractFirstPriceCents(lines[1]!) != null) {
    return [`${lines[0]}\n${lines[1]}`]
  }

  return [trimmed]
}

export function extractFirstPriceCents(text: string): number | null {
  if (!text) {
    return null
  }
  // 忽略「5-9月150/人」这类区间补充价中的月份数字干扰：优先匹配 3–5 位价
  const match = text.replace(/,/g, '').match(/(\d{3,5})\s*(?:元)?\s*\/?\s*人?/)
  if (!match) {
    return null
  }
  const yuan = Number(match[1])
  if (!Number.isFinite(yuan) || yuan <= 0) {
    return null
  }
  return yuan * 100
}

export function parseDateRangeFromText(
  text: string,
  defaultYear: number,
): { startDate: string | null; endDate: string | null; datesParseable: boolean } {
  const normalized = text.replace(/\s+/g, '')
  if (!normalized) {
    return { startDate: null, endDate: null, datesParseable: false }
  }

  // 5月28日-6月30日 / 7月1日-9月28日 / 7月1-7月31
  const fullRange = normalized.match(
    /(\d{1,2})月(\d{1,2})日?-(\d{1,2})月(\d{1,2})日?/,
  )
  if (fullRange) {
    return resolveMonthDayRange(
      defaultYear,
      Number(fullRange[1]),
      Number(fullRange[2]),
      Number(fullRange[3]),
      Number(fullRange[4]),
    )
  }

  // 7月1-7月31（无「日」）
  const compactRange = normalized.match(/(\d{1,2})月(\d{1,2})-(\d{1,2})月(\d{1,2})/)
  if (compactRange) {
    return resolveMonthDayRange(
      defaultYear,
      Number(compactRange[1]),
      Number(compactRange[2]),
      Number(compactRange[3]),
      Number(compactRange[4]),
    )
  }

  // 单月：6月 / 7月2380 / 6月450/人
  const singleMonth = normalized.match(/(?<!\d)(\d{1,2})月(?!\d{1,2}日?-)/)
  if (singleMonth) {
    const month = Number(singleMonth[1])
    const startDate = toIsoDate(defaultYear, month, 1)
    const endDate = toIsoDate(defaultYear, month, daysInMonth(defaultYear, month))
    return {
      startDate,
      endDate,
      datesParseable: Boolean(startDate && endDate),
    }
  }

  return { startDate: null, endDate: null, datesParseable: false }
}

/** Build a month/day range; if end falls before start in the same year, treat end as next year. */
function resolveMonthDayRange(
  defaultYear: number,
  startMonth: number,
  startDay: number,
  endMonth: number,
  endDay: number,
): { startDate: string | null; endDate: string | null; datesParseable: boolean } {
  const startDate = toIsoDate(defaultYear, startMonth, startDay)
  let endDate = toIsoDate(defaultYear, endMonth, endDay)
  if (startDate && endDate && endDate < startDate) {
    endDate = toIsoDate(defaultYear + 1, endMonth, endDay)
  }
  return {
    startDate,
    endDate,
    datesParseable: Boolean(startDate && endDate && endDate >= startDate),
  }
}

function toIsoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null
  }
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value
  if (value == null) {
    return ''
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).replace(/\r\n/g, '\n').trim()
  }
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText
        .map((part) => part.text)
        .join('')
        .replace(/\r\n/g, '\n')
        .trim()
    }
    if ('text' in value && typeof value.text === 'string') {
      return value.text.replace(/\r\n/g, '\n').trim()
    }
    if ('result' in value && value.result != null) {
      return String(value.result).replace(/\r\n/g, '\n').trim()
    }
  }
  return ''
}

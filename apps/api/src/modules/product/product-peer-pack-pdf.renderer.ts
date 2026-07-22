import {
  PRODUCT_PEER_PACK_PDF_CONTENT_TYPE,
  type ProductExportFile,
  type ProductPeerPackSnapshot,
} from './product-export.types'

/**
 * 纯库 PDF：用 PDF 标准 CJK 字体 STSong-Light + UniGB-UCS2-H，无需嵌入字库 / 无头浏览器（ADR-0027）。
 * 版式接近阅读习惯即可，不追求像素级还原旧 Word。
 */
export function renderProductPeerPackPdf(snapshot: ProductPeerPackSnapshot): ProductExportFile {
  const lines = buildLines(snapshot)
  const buffer = buildSimpleCjkPdf(lines)
  const draftMark = snapshot.status === 'draft' ? '_草稿' : ''
  const pricedMark = snapshot.priced ? '_有价' : '_无价'
  const filename = `${sanitizeFilename(snapshot.name)}${draftMark}${pricedMark}_同行资料.pdf`
  return {
    buffer,
    filename,
    contentType: PRODUCT_PEER_PACK_PDF_CONTENT_TYPE,
  }
}

function buildLines(snapshot: ProductPeerPackSnapshot): string[] {
  const lines: string[] = []
  const draftPrefix = snapshot.status === 'draft' ? '【草稿】' : ''
  lines.push(`${draftPrefix}${snapshot.name}`)
  if (snapshot.tags.length > 0) {
    lines.push(`标签：${snapshot.tags.join('、')}`)
  }
  lines.push('')
  lines.push('一、简版行程')
  for (const part of wrapText(snapshot.shortItinerary, 36)) {
    lines.push(part)
  }

  if (snapshot.features.length > 0) {
    lines.push('')
    lines.push('二、产品特色')
    for (const feature of snapshot.features) {
      const title = feature.title.trim()
      const description = feature.description.trim()
      if (title && description) {
        lines.push(`· ${title}`)
        for (const part of wrapText(description, 34)) {
          lines.push(`  ${part}`)
        }
      } else {
        lines.push(`· ${title || description}`)
      }
    }
  }

  lines.push('')
  lines.push(snapshot.features.length > 0 ? '三、班期报价' : '二、班期报价')
  if (snapshot.schedules.length === 0) {
    lines.push('（暂无班期）')
  } else {
    for (const schedule of snapshot.schedules) {
      if (schedule.status === 'cancelled') {
        continue
      }
      const datePart =
        schedule.startDate || schedule.endDate
          ? `${schedule.startDate ?? '?'}${schedule.endDate ? ` 至 ${schedule.endDate}` : ''}`
          : schedule.dateRuleText
      const pricePart = snapshot.priced
        ? formatPricedSchedule(schedule)
        : '询价'
      lines.push(`· ${schedule.title}｜${datePart}｜${pricePart}`)
      if (schedule.notes?.trim()) {
        lines.push(`  备注：${schedule.notes.trim()}`)
      }
    }
  }

  if (snapshot.bookingNotice?.trim()) {
    lines.push('')
    const sectionNo = snapshot.features.length > 0 ? '四' : '三'
    lines.push(`${sectionNo}、报名须知`)
    for (const part of wrapText(snapshot.bookingNotice.trim(), 36)) {
      lines.push(part)
    }
  }

  return lines
}

function formatPricedSchedule(schedule: {
  priceOnInquiry: boolean
  adultPriceCents: number | null
  childPriceCents: number | null
  singleRoomSupplementCents: number | null
}): string {
  if (schedule.priceOnInquiry && schedule.adultPriceCents == null) {
    return '询价'
  }
  const parts: string[] = []
  if (schedule.adultPriceCents != null) {
    parts.push(`成人 ${formatYuan(schedule.adultPriceCents)}`)
  }
  if (schedule.childPriceCents != null) {
    parts.push(`儿童 ${formatYuan(schedule.childPriceCents)}`)
  }
  if (schedule.singleRoomSupplementCents != null) {
    parts.push(`单房差 ${formatYuan(schedule.singleRoomSupplementCents)}`)
  }
  return parts.length > 0 ? parts.join(' / ') : '询价'
}

function formatYuan(cents: number): string {
  const yuan = cents / 100
  return Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2)
}

function wrapText(text: string, maxChars: number): string[] {
  const normalized = text.replace(/\r\n/g, '\n')
  const result: string[] = []
  for (const paragraph of normalized.split('\n')) {
    if (!paragraph) {
      result.push('')
      continue
    }
    let rest = paragraph
    while (rest.length > maxChars) {
      result.push(rest.slice(0, maxChars))
      rest = rest.slice(maxChars)
    }
    result.push(rest)
  }
  return result
}

function sanitizeFilename(value: string): string {
  const cleaned = value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim()
  return cleaned.length > 0 ? cleaned : '产品'
}

/**
 * Minimal multi-page A4 PDF with one embedded Type0 CJK font reference (not subset).
 */
function buildSimpleCjkPdf(lines: string[]): Buffer {
  const pageWidth = 595.28
  const pageHeight = 841.89
  const marginLeft = 50
  const marginTop = 50
  const lineHeight = 18
  const fontSize = 11
  const maxLinesPerPage = Math.floor((pageHeight - marginTop * 2) / lineHeight)

  const pages: string[][] = []
  for (let i = 0; i < lines.length; i += maxLinesPerPage) {
    pages.push(lines.slice(i, i + maxLinesPerPage))
  }
  if (pages.length === 0) {
    pages.push([''])
  }

  const objects: Array<string | null> = []
  const offsets: number[] = []

  const addObject = (body: string): number => {
    objects.push(body)
    return objects.length
  }

  // 1: Catalog
  addObject('<< /Type /Catalog /Pages 2 0 R >>')
  // 2: Pages (kids filled later)
  const pagesObjIndex = addObject('') // placeholder
  // 3: Font
  addObject(
    '<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [4 0 R] >>',
  )
  // 4: CIDFont
  addObject(
    '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 2 >> /FontDescriptor 5 0 R >>',
  )
  // 5: FontDescriptor
  addObject(
    '<< /Type /FontDescriptor /FontName /STSong-Light /Flags 6 /FontBBox [-25 -254 1000 880] /ItalicAngle 0 /Ascent 880 /Descent -254 /CapHeight 880 /StemV 56 >>',
  )

  const pageObjectIds: number[] = []
  for (const pageLines of pages) {
    const content = buildPageContent(pageLines, marginLeft, pageHeight - marginTop, lineHeight, fontSize)
    const contentId = addObject(
      `<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream`,
    )
    const pageId = addObject(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`,
    )
    pageObjectIds.push(pageId)
  }

  objects[pagesObjIndex - 1] =
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`

  // Assemble
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n', 'utf8')]
  let cursor = parts[0].length
  for (let i = 0; i < objects.length; i++) {
    offsets[i] = cursor
    const chunk = Buffer.from(`${i + 1} 0 obj\n${objects[i]}\nendobj\n`, 'utf8')
    parts.push(chunk)
    cursor += chunk.length
  }
  const xrefOffset = cursor
  let xref = `xref\n0 ${objects.length + 1}\n`
  xref += '0000000000 65535 f \n'
  for (let i = 0; i < objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  parts.push(Buffer.from(xref, 'utf8'))
  parts.push(
    Buffer.from(
      `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
      'utf8',
    ),
  )
  return Buffer.concat(parts)
}

function buildPageContent(
  lines: string[],
  x: number,
  startY: number,
  lineHeight: number,
  fontSize: number,
): string {
  const ops: string[] = ['BT', `/F1 ${fontSize} Tf`, `${x} ${startY} Td`]
  lines.forEach((line, index) => {
    if (index > 0) {
      ops.push(`0 -${lineHeight} Td`)
    }
    ops.push(`<${toUtf16BeHex(line)}> Tj`)
  })
  ops.push('ET')
  return ops.join('\n')
}

function toUtf16BeHex(text: string): string {
  let hex = ''
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1)
      if (low >= 0xdc00 && low <= 0xdfff) {
        const cp = (code - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000
        // Non-BMP: encode as surrogate pair in UTF-16BE
        const high = Math.floor((cp - 0x10000) / 0x400) + 0xd800
        const lowUnit = ((cp - 0x10000) % 0x400) + 0xdc00
        hex += high.toString(16).toUpperCase().padStart(4, '0')
        hex += lowUnit.toString(16).toUpperCase().padStart(4, '0')
        i += 1
        continue
      }
    }
    hex += code.toString(16).toUpperCase().padStart(4, '0')
  }
  return hex
}

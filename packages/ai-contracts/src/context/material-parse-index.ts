export const MATERIAL_PARSE_INDEX_EXCERPT_CHARS = 240
export const MATERIAL_PARSE_INDEX_TOTAL_CHARS = 2400
export const MATERIAL_PARSE_TOOL_INLINE_CHARS = 3000
export const MATERIAL_PARSE_EXCERPT_TRUNCATION = 'material_parse_excerpt'

export type MaterialParsePage = {
  pageNumber: number
  source?: 'native_pdf' | 'ocr'
  text: string
}

export type MaterialParseIndexItem = {
  materialId: string
  parseResultVersion: number
  status: 'ready'
  pageCount: number
  excerpt: string
  truncated: boolean
}

export function clipExcerpt(text: string, maxChars: number): { excerpt: string; truncated: boolean } {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (maxChars <= 0) {
    return { excerpt: '', truncated: normalized.length > 0 }
  }
  if (normalized.length <= maxChars) {
    return { excerpt: normalized, truncated: false }
  }
  return { excerpt: normalized.slice(0, maxChars).trimEnd(), truncated: true }
}

export function buildMaterialParseIndex(
  items: Array<{
    materialId: string
    parseResultVersion: number
    pages: MaterialParsePage[]
  }>,
): { materials: MaterialParseIndexItem[]; truncationReasons: string[] } {
  let remaining = MATERIAL_PARSE_INDEX_TOTAL_CHARS
  const materials = items.map((item) => {
    const pages = [...item.pages].sort((left, right) => left.pageNumber - right.pageNumber)
    const joined = pages.map((page) => page.text).join(' ')
    const budget = Math.min(MATERIAL_PARSE_INDEX_EXCERPT_CHARS, Math.max(0, remaining))
    const clipped = clipExcerpt(joined, budget)
    remaining -= clipped.excerpt.length
    return {
      materialId: item.materialId,
      parseResultVersion: item.parseResultVersion,
      status: 'ready' as const,
      pageCount: pages.length,
      excerpt: clipped.excerpt,
      truncated: clipped.truncated,
    }
  })
  return {
    materials,
    truncationReasons: materials.some((item) => item.truncated) ? [MATERIAL_PARSE_EXCERPT_TRUNCATION] : [],
  }
}

export function projectParseResultPages<T extends { pageNumber: number; text: string }>(
  pages: T[],
  pageNumber?: number,
): { pages: T[]; pageCount: number; truncated: boolean } {
  const sorted = [...pages].sort((left, right) => left.pageNumber - right.pageNumber)
  const pageCount = sorted.length
  if (pageNumber != null) {
    return {
      pages: sorted.filter((page) => page.pageNumber === pageNumber),
      pageCount,
      truncated: false,
    }
  }
  const total = sorted.reduce((sum, page) => sum + page.text.length, 0)
  if (total <= MATERIAL_PARSE_TOOL_INLINE_CHARS) {
    return { pages: sorted, pageCount, truncated: false }
  }
  return { pages: [], pageCount, truncated: true }
}

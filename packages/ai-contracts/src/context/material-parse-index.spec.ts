import {
  MATERIAL_PARSE_EXCERPT_TRUNCATION,
  MATERIAL_PARSE_INDEX_EXCERPT_CHARS,
  MATERIAL_PARSE_TOOL_INLINE_CHARS,
  buildMaterialParseIndex,
  projectParseResultPages,
} from './material-parse-index'

describe('material parse index budget', () => {
  it('keeps a short parse result as a ready excerpt without truncating', () => {
    const built = buildMaterialParseIndex([
      {
        materialId: 'mat-1',
        parseResultVersion: 1,
        pages: [{ pageNumber: 1, text: '喀纳斯10日游6月4日团' }],
      },
    ])
    expect(built).toEqual({
      materials: [
        {
          materialId: 'mat-1',
          parseResultVersion: 1,
          status: 'ready',
          pageCount: 1,
          excerpt: '喀纳斯10日游6月4日团',
          truncated: false,
        },
      ],
      truncationReasons: [],
    })
  })

  it('does not put a long page body into the index, only a budgeted excerpt', () => {
    const longText = `团期说明${'甲'.repeat(4000)}`
    const built = buildMaterialParseIndex([
      {
        materialId: 'mat-1',
        parseResultVersion: 1,
        pages: [
          { pageNumber: 1, text: longText },
          { pageNumber: 2, text: '第二页正文' },
        ],
      },
    ])
    expect(built.materials[0]).toMatchObject({
      status: 'ready',
      pageCount: 2,
      truncated: true,
    })
    expect(built.materials[0]?.excerpt.length).toBeLessThanOrEqual(MATERIAL_PARSE_INDEX_EXCERPT_CHARS)
    expect(built.materials[0]?.excerpt.startsWith('团期说明')).toBe(true)
    expect(built.materials[0]?.excerpt).not.toContain('第二页正文')
    expect(built.truncationReasons).toEqual([MATERIAL_PARSE_EXCERPT_TRUNCATION])
  })

  it('returns all pages from a directed read when they fit the tool inline budget', () => {
    const pages = [
      { pageNumber: 1, source: 'ocr' as const, text: '第一页' },
      { pageNumber: 2, source: 'ocr' as const, text: '第二页' },
    ]
    expect(projectParseResultPages(pages)).toEqual({
      pages,
      pageCount: 2,
      truncated: false,
    })
  })

  it('omits long bodies from an unscoped tool read and keeps a single page when asked', () => {
    const pages = [
      { pageNumber: 1, source: 'ocr' as const, text: '甲'.repeat(MATERIAL_PARSE_TOOL_INLINE_CHARS) },
      { pageNumber: 2, source: 'ocr' as const, text: '乙'.repeat(200) },
    ]
    expect(projectParseResultPages(pages)).toEqual({
      pages: [],
      pageCount: 2,
      truncated: true,
    })
    expect(projectParseResultPages(pages, 2)).toEqual({
      pages: [pages[1]],
      pageCount: 2,
      truncated: false,
    })
  })
})

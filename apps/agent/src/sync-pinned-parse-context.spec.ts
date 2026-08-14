import { MATERIAL_PARSE_INDEX_EXCERPT_CHARS } from '@xiaotuanbao/ai-contracts'
import { PINNED_PARSE_CONTEXT_PREFACE, composeSyncedHeadlessUserText } from './sync-pinned-parse-context'

describe('composeSyncedHeadlessUserText', () => {
  it('leaves User plaintext unchanged when the batch has no pinned materials', () => {
    expect(composeSyncedHeadlessUserText('看下', [])).toBe('看下')
  })

  it('injects a ready parse index without the full page body', () => {
    const longBody = `团期说明${'甲'.repeat(4000)}`
    const synced = composeSyncedHeadlessUserText('看下', [
      {
        materialId: 'mat-1',
        parseResultVersion: 1,
        status: 'ready',
        pageCount: 2,
        excerpt: longBody.slice(0, MATERIAL_PARSE_INDEX_EXCERPT_CHARS),
        truncated: true,
      },
      {
        materialId: 'mat-2',
        parseResultVersion: 1,
        status: 'ready',
        pageCount: 1,
        excerpt: '喀纳斯10日游7月14日团',
        truncated: false,
      },
    ])

    expect(synced).toContain('看下')
    expect(synced).toContain(PINNED_PARSE_CONTEXT_PREFACE)
    expect(synced).toContain('已解析完成')
    expect(synced).toContain('共 2 页')
    expect(synced).toContain('摘录已裁剪')
    expect(synced).toContain('getMaterialParseResult')
    expect(synced).toContain('喀纳斯10日游7月14日团')
    expect(synced).not.toContain(longBody)
    expect(synced).not.toMatch(/资料 mat-[12][^\n]*待解析/)
  })
})

import { describe, expect, it } from 'vitest'
import { SourceOrderCollectionMode } from '@xiaotuanbao/shared'
import {
  SOURCE_ORDER_COLLECTION_LABELS,
  SOURCE_ORDER_COLLECTION_OPTIONS,
} from './catalog'

describe('SOURCE_ORDER_COLLECTION_OPTIONS copy', () => {
  it('uses 客户收定金 wording for split mode (not 合作方)', () => {
    const split = SOURCE_ORDER_COLLECTION_OPTIONS.find(
      (item) => item.value === SourceOrderCollectionMode.SPLIT,
    )
    expect(split?.label).toBe('客户收定金+我方收尾款')
    expect(split?.label).not.toContain('合作方收定金')
    expect(SOURCE_ORDER_COLLECTION_LABELS[SourceOrderCollectionMode.SPLIT]).toBe(
      '客户收定金+我方收尾款',
    )
  })
})

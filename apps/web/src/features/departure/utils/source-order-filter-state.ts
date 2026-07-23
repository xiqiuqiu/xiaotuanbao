import type { SourceOrderCollectionMode } from '@xiaotuanbao/shared'

export interface SourceOrderFilterDraft {
  partnerId?: string
  collectionMode?: SourceOrderCollectionMode
  /** undefined / 'all' 均表示不按优惠筛选（全部数据） */
  hasDiscount?: 'all' | 'yes' | 'no'
  keyword: string
}

export const EMPTY_SOURCE_ORDER_FILTERS: SourceOrderFilterDraft = {
  partnerId: undefined,
  collectionMode: undefined,
  hasDiscount: undefined,
  keyword: '',
}

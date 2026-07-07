import type { SourceOrderCollectionMode } from '@xiaotuanbao/shared'

export interface SourceOrderFilterDraft {
  partnerId?: string
  collectionMode?: SourceOrderCollectionMode
  hasDiscount: 'all' | 'yes' | 'no'
  keyword: string
}

export const EMPTY_SOURCE_ORDER_FILTERS: SourceOrderFilterDraft = {
  partnerId: undefined,
  collectionMode: undefined,
  hasDiscount: 'all',
  keyword: '',
}

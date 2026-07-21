/**
 * Product Type：第一期仅散拼（CONTEXT Product Center）。
 * 不提供多类型切换。
 */
export enum ProductType {
  GROUP_TOUR = 'group_tour',
}

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  [ProductType.GROUP_TOUR]: '散拼',
}

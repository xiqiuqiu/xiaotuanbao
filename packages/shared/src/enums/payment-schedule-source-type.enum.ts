export enum PaymentScheduleSourceType {
  MANUAL = 'manual',
  SOURCE_ORDER_CUSTOMER_SETTLEMENT = 'source_order_customer_settlement',
  /** 游客定金代收（地接向游客收的定金期次）。 */
  SOURCE_ORDER_GUEST_DEPOSIT_COLLECTION = 'source_order_guest_deposit_collection',
  /** 游客尾款代收（地接向游客收的尾款期次）。 */
  SOURCE_ORDER_GUEST_BALANCE_COLLECTION = 'source_order_guest_balance_collection',
  SEGMENT_RESOURCE = 'segment_resource',
}

/** 定金代收 + 尾款代收（不含客户结算）。 */
export const SOURCE_ORDER_GUEST_COLLECTION_SOURCE_TYPES = [
  PaymentScheduleSourceType.SOURCE_ORDER_GUEST_DEPOSIT_COLLECTION,
  PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
] as const

export type SourceOrderGuestCollectionSourceType =
  (typeof SOURCE_ORDER_GUEST_COLLECTION_SOURCE_TYPES)[number]

export function isSourceOrderGuestCollectionSourceType(
  sourceType: string,
): sourceType is SourceOrderGuestCollectionSourceType {
  return (
    sourceType === PaymentScheduleSourceType.SOURCE_ORDER_GUEST_DEPOSIT_COLLECTION ||
    sourceType === PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION
  )
}

export enum PaymentScheduleSourceType {
  MANUAL = 'manual',
  SOURCE_ORDER_CUSTOMER_SETTLEMENT = 'source_order_customer_settlement',
  /**
   * @deprecated Legacy single Guest collection node (pre deposit/balance split).
   * Still recognized for read/gap/sync safety; new generation must not create it.
   */
  SOURCE_ORDER_GUEST_COLLECTION = 'source_order_guest_collection',
  /** 游客定金代收（地接向游客收的定金期次）。 */
  SOURCE_ORDER_GUEST_DEPOSIT_COLLECTION = 'source_order_guest_deposit_collection',
  /** 游客尾款代收（地接向游客收的尾款期次）。 */
  SOURCE_ORDER_GUEST_BALANCE_COLLECTION = 'source_order_guest_balance_collection',
  SEGMENT_RESOURCE = 'segment_resource',
}

/** 定金代收 + 尾款代收（不含客户结算、不含 legacy 单节点）。 */
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

/** 约定同步可增删改的现行客源应收来源类型（不含 legacy）。 */
export const SOURCE_ORDER_CONVENTION_RECEIVABLE_SOURCE_TYPES = [
  PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
  ...SOURCE_ORDER_GUEST_COLLECTION_SOURCE_TYPES,
] as const

/** 可识别为「客源单已生成应收」的来源类型（含 legacy 单节点游客代收）。 */
export const SOURCE_ORDER_RECEIVABLE_SOURCE_TYPES = [
  ...SOURCE_ORDER_CONVENTION_RECEIVABLE_SOURCE_TYPES,
  PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
] as const

export function isSourceOrderConventionReceivableSourceType(sourceType: string): boolean {
  return (SOURCE_ORDER_CONVENTION_RECEIVABLE_SOURCE_TYPES as readonly string[]).includes(
    sourceType,
  )
}

export function isSourceOrderReceivableSourceType(sourceType: string): boolean {
  return (SOURCE_ORDER_RECEIVABLE_SOURCE_TYPES as readonly string[]).includes(sourceType)
}

/**
 * Whether convention sync should cancel this active schedule.
 * Legacy guest_collection is never cancelled here (avoid wiping pre-split nodes).
 */
export function shouldCancelSourceOrderScheduleOnConventionSync(input: {
  scheduleSourceType: string
  expectedAmountCents: number | undefined
}): boolean {
  if (!isSourceOrderConventionReceivableSourceType(input.scheduleSourceType)) {
    return false
  }
  return input.expectedAmountCents == null || input.expectedAmountCents <= 0
}

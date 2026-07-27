import {
  FareAdjustmentDirection,
  FareAdjustmentKind,
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
} from '@xiaotuanbao/shared'
import type { SourceOrderSummary } from '@/types/api'

export interface SourceOrderFareAdjustmentFormRow {
  kind: FareAdjustmentKind
  direction: FareAdjustmentDirection
  amountYuan?: number
  customName?: string
}

export interface SourceOrderFormValues {
  partnerId: string
  adultGuestCount: number
  childGuestCount: number
  /** Required when adultGuestCount > 0; omitted treated as 0 when count is 0. */
  adultUnitPriceYuan?: number
  /** Required when childGuestCount > 0; omitted treated as 0 when count is 0. */
  childUnitPriceYuan?: number
  discountType: SourceOrderDiscountType
  discountYuan?: number
  discountNotes?: string
  collectionMode: SourceOrderCollectionMode
  /** 定金（元）；代收场景录入。 */
  depositYuan?: number
  /** 尾款（元）；代收场景录入。 */
  balanceYuan?: number
  settlementNotes?: string
  notes?: string
  fareAdjustments: SourceOrderFareAdjustmentFormRow[]
}

export type SourceOrderFormAmountInput = Pick<
  SourceOrderFormValues,
  | 'adultGuestCount'
  | 'childGuestCount'
  | 'adultUnitPriceYuan'
  | 'childUnitPriceYuan'
  | 'discountType'
  | 'discountYuan'
  | 'collectionMode'
  | 'depositYuan'
  | 'balanceYuan'
  | 'fareAdjustments'
>

function yuanToCents(yuan: number): number {
  return Math.round(yuan * 100)
}

function centsToYuan(cents: number): number {
  return cents / 100
}

/** Effective unit price: when count is 0, treat missing/any price as 0. */
function effectiveUnitPriceYuan(
  guestCount: number,
  unitPriceYuan: number | undefined,
): number {
  if (guestCount === 0) {
    return 0
  }
  return unitPriceYuan ?? 0
}

/** Unit price cents for API: 0 when that guest count is 0 (ignore form price). */
function unitPriceCentsForPayload(
  guestCount: number,
  unitPriceYuan: number | undefined,
): number {
  if (guestCount === 0) {
    return 0
  }
  return yuanToCents(unitPriceYuan ?? 0)
}

export function totalGuestCount(
  values: Partial<Pick<SourceOrderFormValues, 'adultGuestCount' | 'childGuestCount'>>,
): number {
  return (values.adultGuestCount ?? 0) + (values.childGuestCount ?? 0)
}

export function computeFareAdjustmentNetCents(
  fareAdjustments: SourceOrderFareAdjustmentFormRow[] | undefined,
): number {
  let net = 0
  for (const item of fareAdjustments ?? []) {
    const amountCents = yuanToCents(item.amountYuan ?? 0)
    if (amountCents <= 0) {
      continue
    }
    if (item.direction === FareAdjustmentDirection.INCREASE) {
      net += amountCents
    } else {
      net -= amountCents
    }
  }
  return net
}

export function computeCollectionSettlementPreview(
  netReceivableCents: number,
  guestCollectCents: number,
) {
  return {
    estimatedCustomerTopUpCents: Math.max(0, netReceivableCents - guestCollectCents),
    estimatedRebateCents: Math.max(0, guestCollectCents - netReceivableCents),
  }
}

export function computeFormAmounts(values: SourceOrderFormAmountInput) {
  const adultUnitPriceYuan = effectiveUnitPriceYuan(
    values.adultGuestCount,
    values.adultUnitPriceYuan,
  )
  const childUnitPriceYuan = effectiveUnitPriceYuan(
    values.childGuestCount,
    values.childUnitPriceYuan,
  )
  const grossReceivableCents =
    yuanToCents(adultUnitPriceYuan) * values.adultGuestCount +
    yuanToCents(childUnitPriceYuan) * values.childGuestCount
  const fareAdjustmentNetCents = computeFareAdjustmentNetCents(values.fareAdjustments)
  const discountCents =
    values.discountType === SourceOrderDiscountType.LUMP_SUM
      ? yuanToCents(values.discountYuan ?? 0)
      : 0
  const netReceivableCents = grossReceivableCents + fareAdjustmentNetCents - discountCents

  const depositCents = yuanToCents(values.depositYuan ?? 0)
  const balanceCents = yuanToCents(values.balanceYuan ?? 0)

  let persistedDepositCents = depositCents
  let persistedBalanceCents = balanceCents
  let partnerCollectedCents = 0
  let guestCollectCents = 0

  if (values.collectionMode === SourceOrderCollectionMode.PARTNER_SETTLED) {
    persistedDepositCents = 0
    persistedBalanceCents = 0
    partnerCollectedCents = netReceivableCents
    guestCollectCents = 0
  } else if (values.collectionMode === SourceOrderCollectionMode.SPLIT) {
    partnerCollectedCents = depositCents
    guestCollectCents = balanceCents
  } else {
    // guest_only：P=0，G约定=定金+尾款
    partnerCollectedCents = 0
    guestCollectCents = depositCents + balanceCents
  }

  const settlementPreview = computeCollectionSettlementPreview(
    netReceivableCents,
    guestCollectCents,
  )

  return {
    grossReceivableCents,
    fareAdjustmentNetCents,
    discountCents,
    netReceivableCents,
    depositCents: persistedDepositCents,
    balanceCents: persistedBalanceCents,
    partnerCollectedCents,
    guestCollectCents,
    ...settlementPreview,
  }
}

export type SourceOrderAmountPreviewModel = {
  collectionMode: SourceOrderCollectionMode
  netReceivableCents: number
  partnerCollectedCents: number
  guestCollectCents: number
  estimatedCustomerTopUpCents: number
  estimatedRebateCents: number
}

/** Footer / preview copy：团款 / 代收约定 / 往来结果分区。 */
export function formatSourceOrderAmountSummary(
  amounts: SourceOrderAmountPreviewModel,
  formatCents: (cents: number) => string,
): string {
  const lines = [`【团款】结算金额 ${formatCents(amounts.netReceivableCents)}`]

  if (amounts.collectionMode === SourceOrderCollectionMode.PARTNER_SETTLED) {
    lines.push(
      `【代收约定】客户已收 ${formatCents(amounts.partnerCollectedCents)}（全部客户结算）`,
    )
    lines.push('【往来结果】无代收轧差')
    return lines.join('\n')
  }

  lines.push(
    `【代收约定】客户已收 ${formatCents(amounts.partnerCollectedCents)} · G约定 ${formatCents(amounts.guestCollectCents)}`,
  )
  lines.push(
    `【往来结果】预估客户补款 ${formatCents(amounts.estimatedCustomerTopUpCents)} · 预计返利 ${formatCents(amounts.estimatedRebateCents)}`,
  )
  if (amounts.guestCollectCents >= amounts.netReceivableCents) {
    lines.push('计划期不生成客户补款应收（G约定已覆盖结算金额）')
  }
  lines.push('客户已收（定金）不计入客户补款金额')

  return lines.join('\n')
}

export function createEmptySourceOrderFormValues(): SourceOrderFormValues {
  return {
    adultGuestCount: 0,
    childGuestCount: 0,
    discountType: SourceOrderDiscountType.NONE,
    collectionMode: SourceOrderCollectionMode.GUEST_ONLY,
    depositYuan: undefined,
    balanceYuan: undefined,
    fareAdjustments: [],
  } as unknown as SourceOrderFormValues
}

export function sourceOrderToFormValues(order: SourceOrderSummary): SourceOrderFormValues {
  const values: SourceOrderFormValues = {
    partnerId: order.partnerId,
    adultGuestCount: order.adultGuestCount,
    childGuestCount: order.childGuestCount,
    adultUnitPriceYuan: centsToYuan(order.adultUnitPriceCents),
    childUnitPriceYuan: centsToYuan(order.childUnitPriceCents),
    discountType: order.discountType as SourceOrderDiscountType,
    discountYuan: centsToYuan(order.discountCents),
    discountNotes: order.discountNotes ?? undefined,
    collectionMode: order.collectionMode as SourceOrderCollectionMode,
    depositYuan: centsToYuan(order.depositCents ?? 0),
    balanceYuan: centsToYuan(order.balanceCents ?? 0),
    settlementNotes: order.settlementNotes ?? undefined,
    notes: order.notes ?? undefined,
    fareAdjustments: (order.fareAdjustments ?? []).map((item) => ({
      kind: item.kind as FareAdjustmentKind,
      direction: item.direction as FareAdjustmentDirection,
      amountYuan: centsToYuan(item.amountCents),
      customName: item.customName ?? undefined,
    })),
  }

  // Receivable path sync may update gross/net/guestCollect without rewriting unit prices.
  // Reconcile the dominant unit price so form preview matches authoritative stored amounts.
  const computed = computeFormAmounts(values)
  if (computed.grossReceivableCents === order.grossReceivableCents) {
    return values
  }

  if (order.adultGuestCount > 0) {
    const childCents =
      yuanToCents(
        effectiveUnitPriceYuan(order.childGuestCount, values.childUnitPriceYuan),
      ) * order.childGuestCount
    values.adultUnitPriceYuan = centsToYuan(
      Math.round((order.grossReceivableCents - childCents) / order.adultGuestCount),
    )
  } else if (order.childGuestCount > 0) {
    values.childUnitPriceYuan = centsToYuan(
      Math.round(order.grossReceivableCents / order.childGuestCount),
    )
  }

  return values
}

export function formValuesToPayload(values: SourceOrderFormValues) {
  const amounts = computeFormAmounts(values)
  return {
    partnerId: values.partnerId,
    adultGuestCount: values.adultGuestCount,
    childGuestCount: values.childGuestCount,
    adultUnitPriceCents: unitPriceCentsForPayload(
      values.adultGuestCount,
      values.adultUnitPriceYuan,
    ),
    childUnitPriceCents: unitPriceCentsForPayload(
      values.childGuestCount,
      values.childUnitPriceYuan,
    ),
    discountType: values.discountType,
    discountCents: amounts.discountCents,
    discountNotes: values.discountNotes,
    collectionMode: values.collectionMode,
    depositCents: amounts.depositCents,
    balanceCents: amounts.balanceCents,
    settlementNotes: values.settlementNotes,
    notes: values.notes,
    fareAdjustments: (values.fareAdjustments ?? []).flatMap((item) => {
      const amountYuan = item.amountYuan ?? 0
      if (amountYuan <= 0) {
        return []
      }
      return [
        {
          kind: item.kind,
          direction: item.direction,
          amountCents: yuanToCents(amountYuan),
          customName:
            item.kind === FareAdjustmentKind.CUSTOM
              ? item.customName?.trim() || null
              : null,
        },
      ]
    }),
  }
}

/** Path amounts used as the baseline for guest-collection change detection. */
export type SourceOrderPathBaseline = {
  guestCollectCents: number
  partnerCollectedCents: number
  depositCents: number
  balanceCents: number
}

/** Path amounts implied by an update payload (mirrors server computeSourceOrderAmounts). */
export function resolvePathAmountsFromPayload(
  payload: ReturnType<typeof formValuesToPayload>,
): SourceOrderPathBaseline {
  let fareAdjustmentNetCents = 0
  for (const item of payload.fareAdjustments ?? []) {
    if (item.direction === FareAdjustmentDirection.INCREASE) {
      fareAdjustmentNetCents += item.amountCents
    } else {
      fareAdjustmentNetCents -= item.amountCents
    }
  }
  const grossReceivableCents =
    payload.adultUnitPriceCents * payload.adultGuestCount +
    payload.childUnitPriceCents * payload.childGuestCount
  const netReceivableCents =
    grossReceivableCents + fareAdjustmentNetCents - payload.discountCents

  const depositCents = payload.depositCents ?? 0
  const balanceCents = payload.balanceCents ?? 0

  if (payload.collectionMode === SourceOrderCollectionMode.PARTNER_SETTLED) {
    return {
      partnerCollectedCents: netReceivableCents,
      guestCollectCents: 0,
      depositCents: 0,
      balanceCents: 0,
    }
  }
  if (payload.collectionMode === SourceOrderCollectionMode.SPLIT) {
    return {
      partnerCollectedCents: depositCents,
      guestCollectCents: balanceCents,
      depositCents,
      balanceCents,
    }
  }
  return {
    partnerCollectedCents: 0,
    guestCollectCents: depositCents + balanceCents,
    depositCents,
    balanceCents,
  }
}

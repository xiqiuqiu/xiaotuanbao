import {
  FARE_ADJUSTMENT_KIND_DEFAULT_DIRECTION,
  FareAdjustmentKind,
} from './fare-adjustment-kind.enum'

export interface FareAdjustmentKindCatalogEntry {
  kind: FareAdjustmentKind
  /** Locked direction for fixed kinds; null means caller chooses (OTHER). */
  direction: 'increase' | 'decrease' | null
  label: string
  noteRequired: boolean
  allowMultiple: boolean
}

/**
 * ADR-0035 fare-adjustment kinds for source orders.
 * Order: increase fixed → decrease fixed → other escape hatch.
 */
export const FARE_ADJUSTMENT_KIND_CATALOG: FareAdjustmentKindCatalogEntry[] = [
  {
    kind: FareAdjustmentKind.CHILD_TICKET_TOPUP,
    direction: FARE_ADJUSTMENT_KIND_DEFAULT_DIRECTION[FareAdjustmentKind.CHILD_TICKET_TOPUP],
    label: '儿童门票补款',
    noteRequired: false,
    allowMultiple: false,
  },
  {
    kind: FareAdjustmentKind.SINGLE_ROOM_TOPUP,
    direction: FARE_ADJUSTMENT_KIND_DEFAULT_DIRECTION[FareAdjustmentKind.SINGLE_ROOM_TOPUP],
    label: '单房差补款',
    noteRequired: false,
    allowMultiple: false,
  },
  {
    kind: FareAdjustmentKind.EXTENDED_STAY,
    direction: FARE_ADJUSTMENT_KIND_DEFAULT_DIRECTION[FareAdjustmentKind.EXTENDED_STAY],
    label: '续住费用',
    noteRequired: false,
    allowMultiple: false,
  },
  {
    kind: FareAdjustmentKind.TICKET_DISCOUNT_REFUND,
    direction: FARE_ADJUSTMENT_KIND_DEFAULT_DIRECTION[FareAdjustmentKind.TICKET_DISCOUNT_REFUND],
    label: '门票优惠退差',
    noteRequired: false,
    allowMultiple: false,
  },
  {
    kind: FareAdjustmentKind.LODGING_DEDUCTION,
    direction: FARE_ADJUSTMENT_KIND_DEFAULT_DIRECTION[FareAdjustmentKind.LODGING_DEDUCTION],
    label: '住宿费用扣减',
    noteRequired: false,
    allowMultiple: false,
  },
  {
    kind: FareAdjustmentKind.OTHER,
    direction: null,
    label: '其他费用调整',
    noteRequired: true,
    allowMultiple: true,
  },
]

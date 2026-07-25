import {
  FARE_ADJUSTMENT_KIND_DEFAULT_DIRECTION,
  FareAdjustmentKind,
} from './fare-adjustment-kind.enum'

export interface FareAdjustmentKindCatalogEntry {
  kind: Exclude<FareAdjustmentKind, FareAdjustmentKind.CUSTOM>
  direction: 'increase' | 'decrease'
  label: string
}

/**
 * Fixed fare-adjustment kinds for the source-order drawer.
 * Order: increase first, then decrease — matches customer mental model
 * (加收项 → 已优惠/不含项). Custom is omitted (multi-row escape hatch).
 */
export const FARE_ADJUSTMENT_KIND_CATALOG: FareAdjustmentKindCatalogEntry[] = [
  {
    kind: FareAdjustmentKind.SINGLE_ROOM_SUPPLEMENT,
    direction: FARE_ADJUSTMENT_KIND_DEFAULT_DIRECTION[
      FareAdjustmentKind.SINGLE_ROOM_SUPPLEMENT
    ],
    label: '单房差',
  },
  {
    kind: FareAdjustmentKind.CHILD_TICKET,
    direction: FARE_ADJUSTMENT_KIND_DEFAULT_DIRECTION[FareAdjustmentKind.CHILD_TICKET],
    label: '儿童门票',
  },
  {
    kind: FareAdjustmentKind.EXTENDED_STAY,
    direction: FARE_ADJUSTMENT_KIND_DEFAULT_DIRECTION[FareAdjustmentKind.EXTENDED_STAY],
    label: '续住',
  },
  {
    kind: FareAdjustmentKind.OTHER_SUPPLEMENT,
    direction: FARE_ADJUSTMENT_KIND_DEFAULT_DIRECTION[FareAdjustmentKind.OTHER_SUPPLEMENT],
    label: '其他补充费用',
  },
  {
    kind: FareAdjustmentKind.STUDENT_TICKET_PRE_DISCOUNTED,
    direction: FARE_ADJUSTMENT_KIND_DEFAULT_DIRECTION[
      FareAdjustmentKind.STUDENT_TICKET_PRE_DISCOUNTED
    ],
    label: '学生门票已优惠过',
  },
  {
    kind: FareAdjustmentKind.CHILD_HALF_TICKET_PRE_DISCOUNTED,
    direction: FARE_ADJUSTMENT_KIND_DEFAULT_DIRECTION[
      FareAdjustmentKind.CHILD_HALF_TICKET_PRE_DISCOUNTED
    ],
    label: '儿童半价门票已优惠过',
  },
  {
    kind: FareAdjustmentKind.SENIOR_FREE_TICKET_PRE_DISCOUNTED,
    direction: FARE_ADJUSTMENT_KIND_DEFAULT_DIRECTION[
      FareAdjustmentKind.SENIOR_FREE_TICKET_PRE_DISCOUNTED
    ],
    label: '老人免票已优惠过',
  },
  {
    kind: FareAdjustmentKind.EXCLUDED_FIRST_OR_LAST_NIGHT,
    direction: FARE_ADJUSTMENT_KIND_DEFAULT_DIRECTION[
      FareAdjustmentKind.EXCLUDED_FIRST_OR_LAST_NIGHT
    ],
    label: '不含首晚或末晚住宿',
  },
]

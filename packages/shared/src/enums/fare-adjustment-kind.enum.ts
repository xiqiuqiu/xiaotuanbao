export enum FareAdjustmentKind {
  CHILD_TICKET_TOPUP = 'child_ticket_topup',
  SINGLE_ROOM_TOPUP = 'single_room_topup',
  EXTENDED_STAY = 'extended_stay',
  TICKET_DISCOUNT_REFUND = 'ticket_discount_refund',
  LODGING_DEDUCTION = 'lodging_deduction',
  OTHER = 'other',
}

/** Fixed kinds lock direction; OTHER chooses direction at input time. */
export const FARE_ADJUSTMENT_KIND_DEFAULT_DIRECTION: Record<
  Exclude<FareAdjustmentKind, FareAdjustmentKind.OTHER>,
  'increase' | 'decrease'
> = {
  [FareAdjustmentKind.CHILD_TICKET_TOPUP]: 'increase',
  [FareAdjustmentKind.SINGLE_ROOM_TOPUP]: 'increase',
  [FareAdjustmentKind.EXTENDED_STAY]: 'increase',
  [FareAdjustmentKind.TICKET_DISCOUNT_REFUND]: 'decrease',
  [FareAdjustmentKind.LODGING_DEDUCTION]: 'decrease',
}

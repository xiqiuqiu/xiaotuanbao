export enum FareAdjustmentKind {
  SINGLE_ROOM_SUPPLEMENT = 'single_room_supplement',
  CHILD_TICKET = 'child_ticket',
  EXTENDED_STAY = 'extended_stay',
  STUDENT_TICKET_PRE_DISCOUNTED = 'student_ticket_pre_discounted',
  CHILD_HALF_TICKET_PRE_DISCOUNTED = 'child_half_ticket_pre_discounted',
  SENIOR_FREE_TICKET_PRE_DISCOUNTED = 'senior_free_ticket_pre_discounted',
  CUSTOM = 'custom',
}

/** Fixed kinds lock direction; custom chooses direction. */
export const FARE_ADJUSTMENT_KIND_DEFAULT_DIRECTION: Record<
  Exclude<FareAdjustmentKind, FareAdjustmentKind.CUSTOM>,
  'increase' | 'decrease'
> = {
  [FareAdjustmentKind.SINGLE_ROOM_SUPPLEMENT]: 'increase',
  [FareAdjustmentKind.CHILD_TICKET]: 'increase',
  [FareAdjustmentKind.EXTENDED_STAY]: 'increase',
  [FareAdjustmentKind.STUDENT_TICKET_PRE_DISCOUNTED]: 'decrease',
  [FareAdjustmentKind.CHILD_HALF_TICKET_PRE_DISCOUNTED]: 'decrease',
  [FareAdjustmentKind.SENIOR_FREE_TICKET_PRE_DISCOUNTED]: 'decrease',
}

/** 行程段汇总读模型所需的资源字段。 */
export const SEGMENT_SUMMARY_RESOURCE_SELECT = {
  id: true,
  amountCents: true,
  resourceKind: true,
  pendingCheck: true,
} as const

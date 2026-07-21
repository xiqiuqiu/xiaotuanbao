/** Product Schedule Status：销售中 / 已截止 / 已取消（CONTEXT Product Center） */
export enum ProductScheduleStatus {
  ON_SALE = 'on_sale',
  CLOSED = 'closed',
  CANCELLED = 'cancelled',
}

export const PRODUCT_SCHEDULE_STATUS_LABELS: Record<ProductScheduleStatus, string> = {
  [ProductScheduleStatus.ON_SALE]: '销售中',
  [ProductScheduleStatus.CLOSED]: '已截止',
  [ProductScheduleStatus.CANCELLED]: '已取消',
}

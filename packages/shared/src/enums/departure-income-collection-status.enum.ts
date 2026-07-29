export enum DepartureIncomeCollectionStatus {
  UNCOLLECTED = 'uncollected',
  COLLECTED = 'collected',
}

export const DEPARTURE_INCOME_COLLECTION_STATUS_LABELS: Record<
  DepartureIncomeCollectionStatus,
  string
> = {
  [DepartureIncomeCollectionStatus.UNCOLLECTED]: '未收',
  [DepartureIncomeCollectionStatus.COLLECTED]: '已收',
}

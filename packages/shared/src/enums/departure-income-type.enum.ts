export enum DepartureIncomeType {
  SHOPPING_REBATE = 'shopping_rebate',
  COACH_SALES = 'coach_sales',
  OPTIONAL_TOUR = 'optional_tour',
  OTHER = 'other',
}

export const DEPARTURE_INCOME_TYPE_LABELS: Record<DepartureIncomeType, string> = {
  [DepartureIncomeType.SHOPPING_REBATE]: '购物店返利',
  [DepartureIncomeType.COACH_SALES]: '车销收入',
  [DepartureIncomeType.OPTIONAL_TOUR]: '自费项目返利',
  [DepartureIncomeType.OTHER]: '其他增收',
}

export const DEPARTURE_INCOME_TYPE_AMOUNT_HINTS: Record<DepartureIncomeType, string> = {
  [DepartureIncomeType.SHOPPING_REBATE]: '请输入合作方应返金额',
  [DepartureIncomeType.COACH_SALES]: '请输入商品销售收入',
  [DepartureIncomeType.OPTIONAL_TOUR]: '请输入项目返利金额',
  [DepartureIncomeType.OTHER]: '请输入实际增收金额',
}

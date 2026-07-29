/**
 * PROTOTYPE — 团内增收记录 UI 变体共享类型。
 * 问题：增收记录页签应以何种信息架构呈现（统计 / 列表 / 结算 / 录入）？
 */

export type IncomeType =
  | 'shopping_rebate'
  | 'coach_sales'
  | 'optional_tour'
  | 'other'

export type IncomeStatus = 'uncollected' | 'collected'
export type CommissionStatus = 'unpaid' | 'paid'

/** 派生展示态，不单独落库（PRD §8.2） */
export type SettlementComposite =
  | 'pending_settle'
  | 'pending_commission'
  | 'pending_collect'
  | 'settled'

export type IncomeRecord = {
  id: string
  type: IncomeType
  projectName: string
  partnerName: string | null
  occurredOn: string
  amountCents: number
  guideName: string | null
  commissionCents: number
  incomeStatus: IncomeStatus
  commissionStatus: CommissionStatus
  remark: string | null
}

export const INCOME_TYPE_LABELS: Record<IncomeType, string> = {
  shopping_rebate: '购物店返利',
  coach_sales: '车销收入',
  optional_tour: '自费项目返利',
  other: '其他增收',
}

export const INCOME_TYPE_AMOUNT_HINTS: Record<IncomeType, string> = {
  shopping_rebate: '请输入合作方应返金额',
  coach_sales: '请输入商品销售收入',
  optional_tour: '请输入项目返利金额',
  other: '请输入实际增收金额',
}

export const INCOME_STATUS_LABELS: Record<IncomeStatus, string> = {
  uncollected: '未收',
  collected: '已收',
}

export const COMMISSION_STATUS_LABELS: Record<CommissionStatus, string> = {
  unpaid: '未付',
  paid: '已付',
}

export const SETTLEMENT_COMPOSITE_LABELS: Record<SettlementComposite, string> = {
  pending_settle: '待结算',
  pending_commission: '待付提成',
  pending_collect: '待收增收',
  settled: '已结算',
}

export function companyIncomeCents(record: Pick<IncomeRecord, 'amountCents' | 'commissionCents'>): number {
  return record.amountCents - record.commissionCents
}

export function settlementComposite(
  record: Pick<IncomeRecord, 'incomeStatus' | 'commissionStatus'>,
): SettlementComposite {
  if (record.incomeStatus === 'collected' && record.commissionStatus === 'paid') {
    return 'settled'
  }
  if (record.incomeStatus === 'collected' && record.commissionStatus === 'unpaid') {
    return 'pending_commission'
  }
  if (record.incomeStatus === 'uncollected' && record.commissionStatus === 'paid') {
    return 'pending_collect'
  }
  return 'pending_settle'
}

export function summarizeRecords(records: IncomeRecord[]) {
  const amountCents = records.reduce((sum, item) => sum + item.amountCents, 0)
  const commissionCents = records.reduce((sum, item) => sum + item.commissionCents, 0)
  return {
    amountCents,
    commissionCents,
    companyCents: amountCents - commissionCents,
    count: records.length,
  }
}

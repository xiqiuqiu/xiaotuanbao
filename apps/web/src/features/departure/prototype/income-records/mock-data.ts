/**
 * PROTOTYPE — in-memory stub only. No persistence.
 */
import type { IncomeRecord } from './types'

export const MOCK_PARTNERS = [
  '西湖特产总汇',
  '千岛玉石馆',
  '乌镇夜游船',
  '宋城千古情',
  '临安山核桃直供',
] as const

export const MOCK_GUIDES = ['王导游', '李导游', '周导游'] as const

/** 覆盖四种类型 × 四种综合结算态，便于肉眼对比信息架构 */
export const INITIAL_INCOME_RECORDS: IncomeRecord[] = [
  {
    id: 'ir-1',
    type: 'shopping_rebate',
    projectName: '西湖龙井专柜返利',
    partnerName: '西湖特产总汇',
    occurredOn: '2026-07-20',
    amountCents: 320_000,
    guideName: '王导游',
    commissionCents: 60_000,
    incomeStatus: 'uncollected',
    commissionStatus: 'unpaid',
    remark: '两店合并结算，约 28 人进店',
  },
  {
    id: 'ir-2',
    type: 'coach_sales',
    projectName: '干果车销',
    partnerName: null,
    occurredOn: '2026-07-21',
    amountCents: 186_000,
    guideName: '王导游',
    commissionCents: 45_000,
    incomeStatus: 'collected',
    commissionStatus: 'unpaid',
    remark: '核桃+葡萄干，现金已交计调',
  },
  {
    id: 'ir-3',
    type: 'optional_tour',
    projectName: '夜游船返利',
    partnerName: '乌镇夜游船',
    occurredOn: '2026-07-22',
    amountCents: 240_000,
    guideName: '李导游',
    commissionCents: 40_000,
    incomeStatus: 'uncollected',
    commissionStatus: 'paid',
    remark: '提成已垫付，返利待店方打款',
  },
  {
    id: 'ir-4',
    type: 'optional_tour',
    projectName: '千古情演出返利',
    partnerName: '宋城千古情',
    occurredOn: '2026-07-22',
    amountCents: 510_000,
    guideName: '李导游',
    commissionCents: 80_000,
    incomeStatus: 'collected',
    commissionStatus: 'paid',
    remark: null,
  },
  {
    id: 'ir-5',
    type: 'shopping_rebate',
    projectName: '玉石馆返利',
    partnerName: '千岛玉石馆',
    occurredOn: '2026-07-23',
    amountCents: 150_000,
    guideName: null,
    commissionCents: 0,
    incomeStatus: 'uncollected',
    commissionStatus: 'unpaid',
    remark: '无导游提成约定',
  },
  {
    id: 'ir-6',
    type: 'other',
    projectName: '临时摄影服务分成',
    partnerName: null,
    occurredOn: '2026-07-23',
    amountCents: 80_000,
    guideName: '周导游',
    commissionCents: 20_000,
    incomeStatus: 'collected',
    commissionStatus: 'unpaid',
    remark: '景区临时合作',
  },
]

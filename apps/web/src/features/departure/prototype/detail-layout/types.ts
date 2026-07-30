/**
 * PROTOTYPE — throwaway types for departure detail layout exploration.
 */

export type ProtoTabKey =
  | 'overview'
  | 'sourceOrders'
  | 'execution'
  | 'incomeRecords'
  | 'receivables'
  | 'payables'
  | 'transactions'
  | 'verifications'

export type ProtoTabGroup = 'operations' | 'finance'

export type ProtoTab = {
  key: ProtoTabKey
  label: string
  group: ProtoTabGroup
}

export type ProtoResource = {
  id: string
  kind: string
  title: string
  supplier: string
  amountCents: number
  scope: 'departure' | 'segment'
  segmentId?: string
  /** 备注等扩展属性 — 列表不展示，抽屉录入 */
  notes?: string
}

export type ProtoSegment = {
  id: string
  dayIndex: number
  date: string
  overview: string
}

export type ProtoExecutionState = {
  segments: ProtoSegment[]
  departureResources: ProtoResource[]
  segmentResources: ProtoResource[]
  selectedSegmentId: string | null
  /** Variant A/C: 'departure' means 全程资源 selected in the day rail / matrix focus */
  focus: 'departure' | 'segment'
}

export const PROTO_TABS: readonly ProtoTab[] = [
  { key: 'overview', label: '概览', group: 'operations' },
  { key: 'sourceOrders', label: '客源管理', group: 'operations' },
  { key: 'execution', label: '执行安排', group: 'operations' },
  { key: 'incomeRecords', label: '增收记录', group: 'operations' },
  { key: 'receivables', label: '应收管理', group: 'finance' },
  { key: 'payables', label: '应付管理', group: 'finance' },
  { key: 'transactions', label: '收支流水', group: 'finance' },
  { key: 'verifications', label: '核销记录', group: 'finance' },
] as const

export const GROUP_LABELS: Record<ProtoTabGroup, string> = {
  operations: '业务执行',
  finance: '财务处理',
}

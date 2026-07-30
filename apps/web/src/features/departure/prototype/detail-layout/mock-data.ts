/**
 * PROTOTYPE — in-memory stub for layout review. Refresh resets.
 */
import type {
  ProtoExecutionState,
  ProtoPayableStatus,
  ProtoResource,
  ProtoSegment,
} from './types'

export const PROTO_SEGMENTS: ProtoSegment[] = [
  { id: 'seg-1', dayIndex: 1, date: '2026-07-28', overview: '乌鲁木齐集合 / 接机' },
  {
    id: 'seg-2',
    dayIndex: 2,
    date: '2026-07-29',
    overview: '天山天池',
    pendingCheck: true,
  },
  { id: 'seg-3', dayIndex: 3, date: '2026-07-30', overview: '吐鲁番', pendingCheck: true },
  {
    id: 'seg-4',
    dayIndex: 4,
    date: '2026-07-31',
    overview: '喀纳斯',
    pendingCheck: true,
  },
  { id: 'seg-5', dayIndex: 5, date: '2026-08-01', overview: '伊犁' },
  { id: 'seg-6', dayIndex: 6, date: '2026-08-02', overview: '返程布尔津' },
  { id: 'seg-7', dayIndex: 7, date: '2026-08-03', overview: '魔鬼城 / 返乌' },
  { id: 'seg-8', dayIndex: 8, date: '2026-08-04', overview: '市区自由活动' },
  { id: 'seg-9', dayIndex: 9, date: '2026-08-05', overview: '送机' },
]

function res(
  partial: Omit<ProtoResource, 'payableStatus' | 'createdAt' | 'updatedAt'> & {
    payableStatus?: ProtoPayableStatus
    createdAt?: string
    updatedAt?: string
    notes?: string
  },
): ProtoResource {
  return {
    payableStatus: 'pending',
    createdAt: '2026-07-22 16:37',
    updatedAt: '2026-07-22 16:38',
    ...partial,
  }
}

export const PROTO_DEPARTURE_RESOURCES: ProtoResource[] = [
  res({
    id: 'dr-1',
    kind: '用车',
    title: '全程商务车（9座）',
    supplier: '新疆安途车队',
    amountCents: 1_280_000,
    scope: 'departure',
    notes: '9座商务，含司机食宿',
    payableStatus: 'pending',
    createdAt: '2026-07-22 16:37',
    updatedAt: '2026-07-22 16:38',
  }),
  res({
    id: 'dr-2',
    kind: '保险',
    title: '旅行社责任险',
    supplier: '平安保险',
    amountCents: 36_000,
    scope: 'departure',
    notes: '全程责任险',
    payableStatus: 'pending',
    createdAt: '2026-07-22 16:40',
    updatedAt: '2026-07-22 16:40',
  }),
  res({
    id: 'dr-3',
    kind: '导游',
    title: '全程地接导游',
    supplier: '丝路领队工作室',
    amountCents: 450_000,
    scope: 'departure',
    notes: '含讲解与陪同',
    payableStatus: 'not_generated',
    createdAt: '2026-07-22 16:41',
    updatedAt: '2026-07-23 13:06',
  }),
]

export const PROTO_SEGMENT_RESOURCES: ProtoResource[] = [
  res({
    id: 'sr-1',
    kind: '酒店',
    title: '乌市希尔顿花园 双早',
    supplier: '希尔顿花园酒店',
    amountCents: 68_000,
    scope: 'segment',
    segmentId: 'seg-1',
    notes: '1大床房',
  }),
  res({
    id: 'sr-car-2',
    kind: '用车',
    title: '天山天池用车',
    supplier: '杭州中亚旅汽',
    amountCents: 220_000,
    scope: 'segment',
    segmentId: 'seg-2',
    notes: '32座大巴',
    payableStatus: 'not_generated',
    pendingCheck: true,
    createdAt: '2026-07-22 16:37',
    updatedAt: '2026-07-22 16:38',
  }),
  res({
    id: 'sr-2',
    kind: '门票',
    title: '天山天池门票',
    supplier: '天池景区',
    amountCents: 27_000,
    scope: 'segment',
    segmentId: 'seg-2',
    notes: '含区间车',
    payableStatus: 'not_generated',
    pendingCheck: true,
  }),
  res({
    id: 'sr-3',
    kind: '酒店',
    title: '天山天池酒店安排',
    supplier: '都市之门',
    amountCents: 990_000,
    scope: 'segment',
    segmentId: 'seg-2',
    notes: '3大床房，6双床房',
    payableStatus: 'pending',
    pendingCheck: true,
    createdAt: '2026-07-22 16:38',
    updatedAt: '2026-07-23 13:06',
  }),
  res({
    id: 'sr-4',
    kind: '酒店',
    title: '吐鲁番酒店',
    supplier: '布尔津驿',
    amountCents: 56_000,
    scope: 'segment',
    segmentId: 'seg-3',
    notes: '复制资源待核',
    payableStatus: 'not_generated',
    pendingCheck: true,
  }),
  res({
    id: 'sr-4b',
    kind: '门票',
    title: '火焰山门票',
    supplier: '演示票务',
    amountCents: 5_000,
    scope: 'segment',
    segmentId: 'seg-3',
    notes: '未生成应付',
    payableStatus: 'not_generated',
    pendingCheck: true,
  }),
  res({
    id: 'sr-5',
    kind: '门票',
    title: '喀纳斯景区门票',
    supplier: '喀纳斯管委会',
    amountCents: 16_000,
    scope: 'segment',
    segmentId: 'seg-4',
    payableStatus: 'not_generated',
    pendingCheck: true,
  }),
  res({
    id: 'sr-6',
    kind: '酒店',
    title: '喀纳斯观景木屋',
    supplier: '喀纳斯旅舍',
    amountCents: 88_000,
    scope: 'segment',
    segmentId: 'seg-4',
    notes: '观景房',
    payableStatus: 'not_generated',
    pendingCheck: true,
  }),
  res({
    id: 'sr-7',
    kind: '门票',
    title: '伊犁景区门票',
    supplier: '禾木景区',
    amountCents: 10_000,
    scope: 'segment',
    segmentId: 'seg-5',
    payableStatus: 'pending',
  }),
  res({
    id: 'sr-8',
    kind: '酒店',
    title: '伊犁木屋',
    supplier: '禾木人家',
    amountCents: 72_000,
    scope: 'segment',
    segmentId: 'seg-5',
    notes: '木屋含早',
    payableStatus: 'pending',
  }),
]

/** 生成 X/Y：已生成应付数 / 资源总数（对齐现网行程段卡片） */
export function payableGenerationGap(resources: ProtoResource[]): {
  generated: number
  total: number
  ungenerated: number
  percent: number
  hasGap: boolean
} {
  const total = resources.length
  const generated = resources.filter(
    (item) => item.payableStatus !== 'not_generated',
  ).length
  const ungenerated = Math.max(0, total - generated)
  return {
    generated,
    total,
    ungenerated,
    percent: total === 0 ? 100 : Math.round((generated / total) * 100),
    hasGap: ungenerated > 0,
  }
}

export function createInitialExecutionState(): ProtoExecutionState {
  return {
    segments: PROTO_SEGMENTS.map((item) => ({ ...item })),
    departureResources: PROTO_DEPARTURE_RESOURCES.map((item) => ({ ...item })),
    segmentResources: PROTO_SEGMENT_RESOURCES.map((item) => ({ ...item })),
    selectedSegmentId: 'seg-2',
    focus: 'segment',
  }
}

export function formatYuan(cents: number): string {
  return `¥${(cents / 100).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function resourcesForSegment(
  state: ProtoExecutionState,
  segmentId: string,
): ProtoResource[] {
  return state.segmentResources.filter((item) => item.segmentId === segmentId)
}

export function countResourcesForSegment(
  state: ProtoExecutionState,
  segmentId: string,
): number {
  return resourcesForSegment(state, segmentId).length
}

export const PAYABLE_STATUS_LABELS: Record<ProtoPayableStatus, string> = {
  not_generated: '未生成',
  pending: '待付',
  partial: '部分付款',
  paid: '已付清',
  closed: '已关闭',
}

export function payableStatusTagColor(status: ProtoPayableStatus): string {
  switch (status) {
    case 'paid':
      return 'success'
    case 'partial':
      return 'warning'
    case 'pending':
      return 'processing'
    default:
      return 'default'
  }
}

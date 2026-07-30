/**
 * PROTOTYPE — in-memory stub for layout review. Refresh resets.
 */
import type { ProtoExecutionState, ProtoResource, ProtoSegment } from './types'

export const PROTO_SEGMENTS: ProtoSegment[] = [
  { id: 'seg-1', dayIndex: 1, date: '2026-07-28', overview: '乌鲁木齐集合 / 接机' },
  { id: 'seg-2', dayIndex: 2, date: '2026-07-29', overview: '天山天池一日' },
  { id: 'seg-3', dayIndex: 3, date: '2026-07-30', overview: '赴喀纳斯途中' },
  { id: 'seg-4', dayIndex: 4, date: '2026-07-31', overview: '喀纳斯景区' },
  { id: 'seg-5', dayIndex: 5, date: '2026-08-01', overview: '禾木村落' },
  { id: 'seg-6', dayIndex: 6, date: '2026-08-02', overview: '返程布尔津' },
  { id: 'seg-7', dayIndex: 7, date: '2026-08-03', overview: '魔鬼城 / 返乌' },
  { id: 'seg-8', dayIndex: 8, date: '2026-08-04', overview: '市区自由活动' },
  { id: 'seg-9', dayIndex: 9, date: '2026-08-05', overview: '送机' },
]

export const PROTO_DEPARTURE_RESOURCES: ProtoResource[] = [
  {
    id: 'dr-1',
    kind: '用车',
    title: '全程商务车（9座）',
    supplier: '新疆安途车队',
    amountCents: 1280000,
    scope: 'departure',
  },
  {
    id: 'dr-2',
    kind: '保险',
    title: '旅行社责任险',
    supplier: '平安保险',
    amountCents: 36000,
    scope: 'departure',
  },
  {
    id: 'dr-3',
    kind: '导游',
    title: '全程地接导游',
    supplier: '丝路领队工作室',
    amountCents: 450000,
    scope: 'departure',
  },
]

export const PROTO_SEGMENT_RESOURCES: ProtoResource[] = [
  {
    id: 'sr-1',
    kind: '酒店',
    title: '乌市希尔顿花园 双早',
    supplier: '希尔顿花园酒店',
    amountCents: 68000,
    scope: 'segment',
    segmentId: 'seg-1',
  },
  {
    id: 'sr-2',
    kind: '门票',
    title: '天山天池门票',
    supplier: '天池景区',
    amountCents: 27000,
    scope: 'segment',
    segmentId: 'seg-2',
  },
  {
    id: 'sr-3',
    kind: '酒店',
    title: '阜康商务酒店',
    supplier: '阜康驿站',
    amountCents: 42000,
    scope: 'segment',
    segmentId: 'seg-2',
  },
  {
    id: 'sr-4',
    kind: '酒店',
    title: '布尔津木屋客栈',
    supplier: '布尔津驿',
    amountCents: 56000,
    scope: 'segment',
    segmentId: 'seg-3',
  },
  {
    id: 'sr-5',
    kind: '门票',
    title: '喀纳斯景区门票',
    supplier: '喀纳斯管委会',
    amountCents: 16000,
    scope: 'segment',
    segmentId: 'seg-4',
  },
  {
    id: 'sr-6',
    kind: '酒店',
    title: '喀纳斯观景木屋',
    supplier: '喀纳斯旅舍',
    amountCents: 88000,
    scope: 'segment',
    segmentId: 'seg-4',
  },
  {
    id: 'sr-7',
    kind: '门票',
    title: '禾木村门票',
    supplier: '禾木景区',
    amountCents: 10000,
    scope: 'segment',
    segmentId: 'seg-5',
  },
  {
    id: 'sr-8',
    kind: '酒店',
    title: '禾木木屋',
    supplier: '禾木人家',
    amountCents: 72000,
    scope: 'segment',
    segmentId: 'seg-5',
  },
]

export function createInitialExecutionState(): ProtoExecutionState {
  return {
    segments: PROTO_SEGMENTS.map((item) => ({ ...item })),
    departureResources: PROTO_DEPARTURE_RESOURCES.map((item) => ({ ...item })),
    segmentResources: PROTO_SEGMENT_RESOURCES.map((item) => ({ ...item })),
    selectedSegmentId: 'seg-1',
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
